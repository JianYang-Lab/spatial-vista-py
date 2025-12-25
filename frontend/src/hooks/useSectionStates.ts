import { useState, useCallback, useEffect, useRef } from "react";
import { Deck, OrthographicView } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { OrthographicViewState } from "@deck.gl/core";
import { MAX_CONCURRENT_PREVIEWS } from "../config/constants";
import type { AnnotationConfig, CategoryColors, LoadedData } from "@/types";

export interface UseSectionStatesReturn {
  // States
  filteredSectionPoints: number[];
  currentSectionID: number;
  availableSectionIDs: number[];
  sectionPreviews: Record<number, string>;

  // Actions
  setCurrentSectionID: (id: number) => void;
  setAvailableSectionIDs: (ids: number[]) => void;
  handleSectionClick: (sectionID: number) => void;
  filterSectionPoints: () => void;
}

export const useSectionStates = (
  loadedData: LoadedData,
  showPointCloud: boolean,
  showScatterplot: boolean,
  categoryColors: CategoryColors,
  annotationConfig: AnnotationConfig | null,
  slicekeyname?: string,
): UseSectionStatesReturn => {
  const [filteredSectionPoints, setFilteredSectionPoints] = useState<number[]>(
    [],
  );
  const [currentSectionID, setCurrentSectionID] = useState<number>(0);
  const [availableSectionIDs, setAvailableSectionIDs] = useState<number[]>([]);
  const [sectionPreviews, setSectionPreviews] = useState<
    Record<number, string>
  >({});

  // Refs to track rendering state
  const renderingRef = useRef<Set<number>>(new Set());
  const renderedRef = useRef<Set<number>>(new Set());

  // Determine the slice key to use (prefer passed-in slicekeyname,
  // then annotationConfig.DefaultAnnoType, then fallback to "section")
  const sliceKey = slicekeyname ?? "section";

  console.log("Using sliceKey:", sliceKey);

  // Filter point function
  const filterSectionPoints = useCallback(() => {
    if (
      sliceKey === undefined ||
      !loadedData?.extData?.annotations?.[sliceKey] ||
      currentSectionID === null
    )
      return;

    const sectionAnnotations = loadedData.extData.annotations[sliceKey];

    console.time(`Filter section ${currentSectionID}`);
    const filteredIndices = Array.from(
      { length: sectionAnnotations.length },
      (_, i) => i,
    ).filter((i) => sectionAnnotations[i] === currentSectionID);
    console.timeEnd(`Filter section ${currentSectionID}`);

    setFilteredSectionPoints(filteredIndices);
  }, [loadedData, currentSectionID, sliceKey]);

  // Watch currentSectionID for filter points
  useEffect(() => {
    if (!showPointCloud && showScatterplot) {
      filterSectionPoints();
    }
  }, [currentSectionID, showPointCloud, showScatterplot, filterSectionPoints]);

  // Handle section click
  const handleSectionClick = useCallback(
    (sectionID: number) => {
      if (sectionID !== currentSectionID) {
        setCurrentSectionID(sectionID);
      }
    },
    [currentSectionID],
  );

  // render single section preview
  const renderSectionPreview = async (sectionId: number): Promise<void> => {
    if (
      renderingRef.current.has(sectionId) ||
      renderedRef.current.has(sectionId)
    ) {
      return;
    }

    renderingRef.current.add(sectionId);

    console.log(`Rendering preview for section ${sectionId}...`);

    if (!loadedData?.extData?.annotations?.[sliceKey]) {
      renderingRef.current.delete(sectionId);
      return;
    }

    try {
      // filter
      const sectionAnnotations = loadedData.extData.annotations[sliceKey];
      const filteredIndices = Array.from(
        { length: sectionAnnotations.length },
        (_, i) => i,
      ).filter((i) => sectionAnnotations[i] === sectionId);

      if (filteredIndices.length === 0) {
        console.log(`No points found for section ${sectionId}`);
        renderingRef.current.delete(sectionId);
        return;
      }

      console.log(
        `Found ${filteredIndices.length} points for section ${sectionId}`,
      );

      // calculate bounds
      const positions = loadedData.extData.POSITION.value;

      // console.log(`Total positions: ${positions.length / 3}`);
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      for (const idx of filteredIndices) {
        const x = positions[idx * 3];
        const y = positions[idx * 3 + 1];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      console.log(
        `Section ${sectionId} bounds: X[${minX}, ${maxX}], Y[${minY}, ${maxY}]`,
      );

      // add padding
      const padding = Math.max(maxX - minX, maxY - minY) * 0.01;
      minX -= padding;
      maxX += padding;
      minY -= padding;
      maxY += padding;

      // build offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = 150;
      canvas.height = 150;
      canvas.style.position = "absolute";
      canvas.style.left = "-9999px";
      canvas.style.top = "-9999px";
      document.body.appendChild(canvas);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const maxRange = Math.max(maxX - minX, maxY - minY);
      const zoom = Math.log2(150 / maxRange) - 0.5;

      console.log(
        `Section ${sectionId} viewState: center=[${centerX}, ${centerY}], zoom=${zoom}`,
      );

      const previewViewState: OrthographicViewState = {
        target: [centerX, centerY, 0],
        zoom: zoom,
        minZoom: -10,
        maxZoom: 10,
      };

      const orthographicView = new OrthographicView({ id: "preview-view" });

      // render with deck.gl
      return new Promise<void>((resolve, reject) => {
        let timeoutHandle: NodeJS.Timeout | null = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let tempDeck: any;
        let isResolved = false;

        const cleanup = () => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (tempDeck) {
            try {
              tempDeck.finalize();
            } catch (e) {
              console.error(
                `Error finalizing deck for section ${sectionId}:`,
                e,
              );
            }
          }
          if (canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
          }
          renderingRef.current.delete(sectionId);
        };

        const safeResolve = () => {
          if (!isResolved) {
            isResolved = true;
            renderedRef.current.add(sectionId);
            cleanup();
            resolve();
          }
        };

        const safeReject = (error: Error) => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            reject(error);
          }
        };

        // set timeout to avoid hanging
        timeoutHandle = setTimeout(() => {
          console.error(`Timeout waiting for section ${sectionId} render`);
          safeReject(new Error(`Timeout for section ${sectionId}`));
        }, 2000);

        try {
          tempDeck = new Deck({
            canvas,
            width: 150,
            height: 150,
            viewState: {
              "preview-view": previewViewState,
            },
            views: [orthographicView],
            layers: [
              new ScatterplotLayer({
                id: `preview-scatter-${sectionId}`,
                data: filteredIndices,
                getPosition: (i: number): [number, number, number] => {
                  const index = i * 3;
                  return [positions[index], positions[index + 1], 0];
                },
                getFillColor: (i: number): [number, number, number, number] => {
                  if (!annotationConfig) {
                    return [180, 180, 180, 255];
                  }
                  const index = i;
                  const extData = loadedData.extData;
                  const always_type = annotationConfig?.DefaultAnnoType;
                  const currentClassification =
                    extData.annotations[always_type];

                  if (!currentClassification) return [180, 180, 180, 255];

                  const categoryId = currentClassification[index];
                  const numericCategoryId =
                    categoryId !== undefined && categoryId !== null
                      ? Number(categoryId)
                      : null;

                  if (
                    numericCategoryId !== null &&
                    categoryColors[always_type]?.[numericCategoryId]
                  ) {
                    const color =
                      categoryColors[always_type][numericCategoryId];
                    return [color[0], color[1], color[2], 255];
                  }
                  return [180, 180, 180, 255];
                },
                radiusUnits: "pixels",
                rediusScale: 2,
                radiusMinPixels: 0,
                radiusMaxPixels: 100,
                lineWidthMinPixels: 0,
              }),
            ],
            onAfterRender: ({ gl: _gl }) => {
              if (isResolved) return;

              try {
                console.log(`Section ${sectionId} onAfterRender called`);

                // delay  to ensure rendering is done
                setTimeout(() => {
                  try {
                    if (isResolved) return;

                    console.log(`Section ${sectionId} attempting capture...`);
                    const dataUrl = canvas.toDataURL("image/png");

                    setSectionPreviews((prev) => ({
                      ...prev,
                      [sectionId]: dataUrl,
                    }));

                    console.log(
                      `Successfully captured preview for section ${sectionId}`,
                    );
                    safeResolve();
                  } catch (error) {
                    console.error(
                      `Error capturing section ${sectionId}:`,
                      error,
                    );
                    safeReject(
                      error instanceof Error
                        ? error
                        : new Error(`Capture error for section ${sectionId}`),
                    );
                  }
                }, 100);
              } catch (error) {
                console.error(
                  `Error in onAfterRender for section ${sectionId}:`,
                  error,
                );
                safeReject(
                  error instanceof Error
                    ? error
                    : new Error(`Render error for section ${sectionId}`),
                );
              }
            },
            onError: (error) => {
              console.error(`Deck error for section ${sectionId}:`, error);
              safeReject(
                new Error(
                  `Deck error for section ${sectionId}: ${error.message}`,
                ),
              );
            },
          });

          console.log(`Triggering initial render for section ${sectionId}...`);
          tempDeck.redraw();
        } catch (error) {
          console.error(`Error creating Deck for section ${sectionId}:`, error);
          safeReject(
            error instanceof Error
              ? error
              : new Error(`Create error for section ${sectionId}`),
          );
        }
      });
    } catch (error) {
      renderingRef.current.delete(sectionId);
      console.error(`Error rendering preview for section ${sectionId}:`, error);
      throw error;
    }
  };

  // render all section previews
  const renderAllSectionPreviews = async () => {
    if (
      !loadedData?.extData?.annotations?.[sliceKey] ||
      availableSectionIDs.length === 0
    ) {
      return;
    }

    console.log(
      `Starting to render ${availableSectionIDs.length} section previews...`,
    );

    // chunks
    const chunks = [];
    for (
      let i = 0;
      i < availableSectionIDs.length;
      i += MAX_CONCURRENT_PREVIEWS
    ) {
      chunks.push(availableSectionIDs.slice(i, i + MAX_CONCURRENT_PREVIEWS));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(
        `Processing chunk ${chunkIndex + 1}/${chunks.length} with sections: ${chunk.join(", ")}`,
      );

      try {
        await Promise.allSettled(
          chunk.map(async (sectionId) => {
            try {
              await renderSectionPreview(sectionId);
            } catch (error) {
              console.error(`Failed to render section ${sectionId}:`, error);
            }
          }),
        );

        if (chunkIndex < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error processing chunk ${chunkIndex}:`, error);
      }
    }

    console.log("Finished rendering all section previews");
  };

  // Watch availableSectionIDs or showScatterplot to trigger rendering
  useEffect(() => {
    if (
      !showPointCloud &&
      showScatterplot &&
      availableSectionIDs.length > 0 &&
      Object.keys(sectionPreviews).length < availableSectionIDs.length
    ) {
      // reset rendering states
      renderingRef.current.clear();
      renderedRef.current.clear();

      renderAllSectionPreviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPointCloud, showScatterplot, availableSectionIDs.length]);

  // cleanup
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      renderingRef.current.clear();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      renderedRef.current.clear();
    };
  }, []);

  return {
    filteredSectionPoints,
    currentSectionID,
    availableSectionIDs,
    sectionPreviews,
    setCurrentSectionID,
    setAvailableSectionIDs,
    handleSectionClick,
    filterSectionPoints,
  };
};
