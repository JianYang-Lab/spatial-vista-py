import React, { useRef, useCallback, useEffect, useState } from "react";
import { DeckGL } from "@deck.gl/react";
import { OrbitView, OrthographicView } from "@deck.gl/core";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SectionCarousel } from "./SectionCarousel";
import { RefreshCwIcon } from "lucide-react";
import RingLoader from "react-spinners/RingLoader";
import type {
  LayersList,
  OrbitViewState,
  OrthographicViewState,
} from "@deck.gl/core";
import type { Device } from "@luma.gl/core";
import {
  type AnnotationConfig,
  type AnnotationType,
  type LayoutMode,
  type LoadedData,
} from "@/types";
import type { ColorCalculatorParams } from "@/utils/colorCalculator";
import {
  getLassoSelectedIndices,
  type ScreenPoint,
} from "@/utils/lassoSelection";

interface VisualizationAreaProps {
  // Basic states
  isLoaded: boolean;
  showPointCloud: boolean;
  showScatterplot: boolean;
  layoutMode: LayoutMode;

  // View states
  viewState: OrbitViewState;
  stviewState: OrthographicViewState;
  initialCamera: OrbitViewState;

  // Data and layers
  layers: LayersList;
  loadedData: LoadedData | null;
  loadedAnnotations: Set<AnnotationType>;
  // Section carousel props
  availableSectionIDs: number[];
  currentSectionID: number;
  sectionPreviews: Record<number, string>;

  // LogP controls props
  NumericThreshold: number;
  minMaxValue: [number, number] | null;
  lassoEnabled: boolean;
  selectedCount: number;
  colorParams: ColorCalculatorParams;

  // Device
  device?: Device;

  // Handlers
  onViewStateUpdate: (viewState: OrbitViewState) => void;
  onStViewStateUpdate: (viewState: OrthographicViewState) => void;
  onActiveZoomChange: (zoom: string) => void;
  onSectionClick: (sectionID: number) => void;
  onNumericThresholdChange: (threshold: number) => void;
  onAfterRender: ({ gl }: { gl: WebGLRenderingContext }) => void;
  onLassoSelect: (indices: number[]) => void;

  annotationConfig: AnnotationConfig | null;
}

export const VisualizationArea: React.FC<VisualizationAreaProps> = ({
  isLoaded,
  showPointCloud,
  showScatterplot,
  layoutMode,
  viewState,
  stviewState,
  initialCamera,
  layers,
  loadedData,
  loadedAnnotations,
  availableSectionIDs,
  currentSectionID,
  sectionPreviews,
  NumericThreshold,
  minMaxValue,
  lassoEnabled,
  selectedCount,
  colorParams,
  device,
  onViewStateUpdate,
  onStViewStateUpdate,
  onActiveZoomChange,
  onSectionClick,
  onNumericThresholdChange,
  onAfterRender,
  onLassoSelect,
  annotationConfig,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deckRef = useRef<any>(null);
  const lassoPointsRef = useRef<ScreenPoint[]>([]);
  const pointerIdRef = useRef<number | null>(null);
  const [lassoPoints, setLassoPoints] = useState<ScreenPoint[]>([]);
  const [isLassoDrawing, setIsLassoDrawing] = useState(false);

  const updateLassoPoints = useCallback((points: ScreenPoint[]) => {
    lassoPointsRef.current = points;
    setLassoPoints(points);
  }, []);

  const resetLassoStroke = useCallback(() => {
    lassoPointsRef.current = [];
    setLassoPoints([]);
    pointerIdRef.current = null;
    setIsLassoDrawing(false);
  }, []);

  const getLocalPoint = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();

      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    [],
  );

  const finishLassoSelection = useCallback(() => {
    const polygon = lassoPointsRef.current;

    if (polygon.length >= 3 && loadedData?.extData) {
      const viewport = deckRef.current?.deck?.getViewports?.()[0];

      if (viewport) {
        const selected = getLassoSelectedIndices({
          polygon,
          viewport,
          extData: loadedData.extData,
          colorParams,
        });
        onLassoSelect(selected);
      }
    }

    resetLassoStroke();
  }, [colorParams, loadedData, onLassoSelect, resetLassoStroke]);

  const handleLassoPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!lassoEnabled || !loadedData) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerIdRef.current = event.pointerId;
      setIsLassoDrawing(true);
      updateLassoPoints([getLocalPoint(event)]);
    },
    [getLocalPoint, lassoEnabled, loadedData, updateLassoPoints],
  );

  const handleLassoPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isLassoDrawing || pointerIdRef.current !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();

      const nextPoint = getLocalPoint(event);
      const currentPoints = lassoPointsRef.current;
      const lastPoint = currentPoints[currentPoints.length - 1];

      if (
        lastPoint &&
        Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y) < 2
      ) {
        return;
      }

      updateLassoPoints([...currentPoints, nextPoint]);
    },
    [getLocalPoint, isLassoDrawing, updateLassoPoints],
  );

  const handleLassoPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isLassoDrawing || pointerIdRef.current !== event.pointerId) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      finishLassoSelection();
    },
    [finishLassoSelection, isLassoDrawing],
  );

  const handleLassoKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        resetLassoStroke();
      }
    },
    [resetLassoStroke],
  );

  useEffect(() => {
    if (!lassoEnabled) {
      resetLassoStroke();
    }
  }, [lassoEnabled, resetLassoStroke]);

  const handleViewStateChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ viewState: newViewState }: { viewState: any }) => {
      if (showPointCloud) {
        // 3D update view
        onViewStateUpdate(newViewState as OrbitViewState);
        // it's number here
        const newZoomValue = newViewState.zoom as number;
        const currentZoomValue = viewState.zoom as number;

        if (newZoomValue !== currentZoomValue) {
          const farThreshold = (initialCamera.zoom as number) - 1;
          const nearThreshold = (initialCamera.zoom as number) + 1;

          if (newZoomValue <= farThreshold) {
            onActiveZoomChange("far");
          } else if (newZoomValue >= nearThreshold) {
            onActiveZoomChange("near");
          } else {
            onActiveZoomChange("standard");
          }
        }
      } else {
        // 2D update view
        onStViewStateUpdate(newViewState as OrthographicViewState);
      }
    },
    [
      showPointCloud,
      onViewStateUpdate,
      onStViewStateUpdate,
      onActiveZoomChange,
      viewState.zoom,
      initialCamera.zoom,
    ],
  );

  const getTooltip = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ coordinate, index, layer }: any) => {
      if (!coordinate || !layer || !loadedData) return null;

      const extData = loadedData.extData;

      let tooltipContent = `
          <div>
            <b>Position:</b> ${coordinate.map((v: number) => v.toFixed(1)).join(", ")}<br/>
        `;

      // iter all annos
      if (annotationConfig?.AnnoMaps && extData.annotations) {
        for (const annoType of loadedAnnotations) {
          const arr = extData.annotations[annoType];
          if (!arr || index >= arr.length) continue;

          const code = arr[index];
          if (code == null) continue;

          const items = annotationConfig.AnnoMaps?.[annoType]?.Items;
          let label = `Unknown (${code})`;

          if (items) {
            const hit = items.find((it) => it.Code === Number(code));
            if (hit?.Name != null) {
              label = String(hit.Name);
            }
          }

          const displayName =
            annoType.charAt(0).toUpperCase() + annoType.slice(1);

          tooltipContent += `<b>${displayName}:</b> ${label}<br/>`;
        }
      }

      if (
        extData.numeric &&
        extData.numeric.values &&
        index < extData.numeric.values.length
      ) {
        const v = extData.numeric.values[index];

        if (typeof v === "number" && Number.isFinite(v)) {
          tooltipContent += `<b>${extData.numeric.name}:</b> ${v.toFixed(
            4,
          )}<br/>`;
        }
      }

      tooltipContent += `</div>`;

      return {
        html: tooltipContent,
        className: "bg-card text-muted-foreground rounded-lg shadow-lg",
        style: {
          backgroundColor: "",
          color: "",
        },
      };
    },
    [loadedData, annotationConfig?.AnnoMaps, loadedAnnotations],
  );

  const handleLogpReset = useCallback(() => {
    if (minMaxValue) {
      onNumericThresholdChange(minMaxValue[0]);
    }
  }, [minMaxValue, onNumericThresholdChange]);

  const numericName = loadedData?.extData?.numeric?.name ?? null;

  return (
    <>
      {/* Loading Overlay */}

      {!isLoaded && <LoadingOverlay />}

      {/* DeckGL Component */}
      <DeckGL
        ref={deckRef}
        device={device}
        views={
          showPointCloud
            ? new OrbitView({
                orbitAxis: "Y",
                fovy: 50,
                controller: lassoEnabled
                  ? false
                  : {
                      inertia: true,
                      scrollZoom: true,
                      dragMode: layoutMode === "3d" ? "rotate" : "pan",
                    },
              })
            : new OrthographicView({
                controller: {
                  inertia: true,
                  scrollZoom: true,
                },
              })
        }
        viewState={showPointCloud ? viewState : stviewState}
        onAfterRender={onAfterRender}
        onViewStateChange={handleViewStateChange}
        layers={layers}
        getTooltip={getTooltip}
      />

      {lassoEnabled && (
        <div
          className="absolute inset-0 z-30 cursor-crosshair touch-none"
          onPointerDown={handleLassoPointerDown}
          onPointerMove={handleLassoPointerMove}
          onPointerUp={handleLassoPointerUp}
          onPointerCancel={resetLassoStroke}
          onKeyDown={handleLassoKeyDown}
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          role="presentation"
          tabIndex={0}
        >
          <svg className="absolute inset-0 h-full w-full pointer-events-none">
            {lassoPoints.length > 2 && (
              <polygon
                points={lassoPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(255, 214, 64, 0.16)"
                stroke="rgba(255, 214, 64, 0.85)"
                strokeWidth={1.5}
              />
            )}
            {lassoPoints.length > 1 && (
              <polyline
                points={lassoPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="rgba(255, 214, 64, 0.95)"
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
            )}
          </svg>
          <div className="absolute top-3 left-3 rounded-md border bg-background/85 px-2 py-1 text-xs shadow-sm pointer-events-none">
            Selected: {selectedCount}
          </div>
        </div>
      )}

      {/* 2D Section Carousel */}
      {!showPointCloud && showScatterplot && (
        <div className="absolute top-2 left-12 right-12 backdrop-blur-sm p-1 rounded-lg shadow-lg bg-transparent">
          <SectionCarousel
            showScatterplot={showScatterplot}
            availableSectionIDs={availableSectionIDs}
            showPointCloud={showPointCloud}
            currentSectionID={currentSectionID}
            onSectionClick={onSectionClick}
            sectionPreviews={sectionPreviews}
          />
        </div>
      )}

      {/* LogP Controls */}
      {minMaxValue &&
        Number.isFinite(minMaxValue[0]) &&
        Number.isFinite(minMaxValue[1]) && (
          <div
            className="absolute bottom-4 left-1/2 transform -translate-x-1/2  bg-transparent rounded-lg shadow-lg p-1.5 z-20 pl-3 pr-3"
            style={{ minWidth: "80%", backdropFilter: "blur(8px)" }}
          >
            <LogpControls
              Name={numericName}
              NumericThreshold={NumericThreshold}
              minMaxLogp={minMaxValue}
              isLoaded={isLoaded}
              onThresholdChange={onNumericThresholdChange}
              onReset={handleLogpReset}
            />
          </div>
        )}
    </>
  );
};

// Loading Overlay Sub-component
const LoadingOverlay: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center z-10">
    <RingLoader
      color="#B967C7"
      cssOverride={{}}
      loading
      size={200}
      speedMultiplier={0.5}
    />
  </div>
);

// LogP Controls Sub-component
interface LogpControlsProps {
  Name: string | null | undefined;
  NumericThreshold: number;
  minMaxLogp: [number, number];
  isLoaded: boolean;
  onThresholdChange: (threshold: number) => void;
  onReset: () => void;
}

const LogpControls: React.FC<LogpControlsProps> = ({
  Name,
  NumericThreshold,
  minMaxLogp,
  isLoaded,
  onThresholdChange,
  onReset,
}) => (
  <div className="flex items-center space-x-3">
    {/* LogP Threshold label and value */}
    <div className="text-sm font-medium whitespace-nowrap">
      {Name ?? "Value"}:{" "}
      <span className="font-bold">{NumericThreshold.toFixed(2)}</span>
    </div>

    {/* Min value */}
    <span className="text-xs font-medium">{minMaxLogp[0].toFixed(2)}</span>

    {/* Combined gradient bar and slider */}
    <div className="flex-1 h-8 relative">
      {/* Gradient background */}
      <div
        className="w-full h-6 rounded-md shadow-inner absolute top-1"
        style={{
          background: `linear-gradient(to right, rgb(0, 50, 255), rgb(128, 50, 128), rgb(255, 50, 0))`,
        }}
      />

      {/* Slider positioned over the gradient bar */}
      <Slider
        min={minMaxLogp[0]}
        max={minMaxLogp[1]}
        step={(minMaxLogp[1] - minMaxLogp[0]) / 100}
        value={[NumericThreshold]}
        onValueChange={(values) => onThresholdChange(values[0])}
        disabled={!isLoaded}
        className="
            cursor-pointer absolute inset-0
            [&>[data-slot=slider-track]]:bg-transparent
            [&>[data-slot=slider-track]>[data-slot=slider-range]]:bg-transparent
            "
      />
    </div>

    {/* Max value */}
    <span className="text-xs font-medium">{minMaxLogp[1].toFixed(2)}</span>

    {/* Reset button */}
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0"
      onClick={onReset}
      disabled={!isLoaded}
      title="Reset threshold"
    >
      <RefreshCwIcon className="h-3 w-3" />
    </Button>
  </div>
);
