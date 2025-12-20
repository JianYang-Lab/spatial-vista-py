import { useState, useCallback, useEffect } from "react";
import type {
  AnnotationConfig,
  ContinuousField,
  LASMesh,
  LoadedData,
} from "@/types";
import { INITIAL_VIEW_STATE } from "@/config/constants";

type AnnotationType = string;

interface UseDataManagerProps {
  onLoad?: (data: { count: number; progress: number }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateViewState: (viewState: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setInitialCamera: (camera: any) => void;
  setActiveZoom: (zoom: string) => void;
  annotationConfig: AnnotationConfig | null;
  annotationBins: Record<string, Uint8Array | Uint16Array | Uint32Array>;
}

export const useDataManager = ({
  onLoad,
  // setCategoryColors,
  updateViewState,
  setInitialCamera,
  setActiveZoom,
  annotationConfig,
  annotationBins,
}: UseDataManagerProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedData, setLoadedData] = useState<LoadedData | null>(null);
  // const [currentTrait, setCurrentTrait] = useState<string | null>(null);
  // const [minMaxLogp, setMinMaxLogp] = useState<[number, number] | null>(null);
  const [numericField, setNumericField] = useState<ContinuousField | null>(
    null,
  );

  const [loadedAnnotations, setLoadedAnnotations] = useState<
    Set<AnnotationType>
  >(new Set());

  const onDataLoad = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      console.time("Data load");
      const header = (data as LASMesh).header!;
      const pos = (data as LASMesh).attributes.POSITION;

      // float64 position
      const f64Pos = new Float64Array(pos.value.length);
      for (let i = 0; i < pos.value.length; i++) {
        f64Pos[i] = pos.value[i];
      }
      (data as LASMesh).attributes.POSITION.value = f64Pos;

      const originalColor = data.attributes.COLOR_0.value as Uint8Array;
      const defaultAnnIds = data.attributes.classification?.value;
      const defaultAnnoType =
        annotationConfig?.DefaultAnnoType ?? "__default__";

      // only keep originalColor and default annotation
      // logP/other annos will be loaded dynamically later
      (data as LoadedData).extData = {
        originalColor,
        numeric: null as null | ContinuousField,
        annotations: defaultAnnIds ? { [defaultAnnoType]: defaultAnnIds } : {},
        POSITION: data.attributes.POSITION,
      };
      data.attributes.COLOR_0 = undefined;
      data.attributes.POSITION = undefined;

      if (header.boundingBox) {
        const [mins, maxs] = header.boundingBox;
        updateViewState({
          ...INITIAL_VIEW_STATE,
          target: [
            (mins[0] + maxs[0]) / 2,
            (mins[1] + maxs[1]) / 2,
            (mins[2] + maxs[2]) / 2,
          ],
          zoom: Math.log2(window.innerWidth / (maxs[0] - mins[0])) - 1,
        });
        setInitialCamera({
          ...INITIAL_VIEW_STATE,
          target: [
            (mins[0] + maxs[0]) / 2,
            (mins[1] + maxs[1]) / 2,
            (mins[2] + maxs[2]) / 2,
          ],
          zoom: Math.log2(window.innerWidth / (maxs[0] - mins[0])) - 1,
        });
        setLoadedData(data);
        setIsLoaded(true);
        setActiveZoom("standard");
      }

      if (onLoad) {
        onLoad({ count: header.vertexCount, progress: 1 });
      }

      console.timeEnd("Data load");
    },
    [
      annotationConfig?.DefaultAnnoType,
      onLoad,
      setActiveZoom,
      setInitialCamera,
      updateViewState,
    ],
  );

  // Preload annotations when data or annotation config changes
  useEffect(() => {
    if (!loadedData || !annotationConfig) return;

    const ext = loadedData.extData;
    const anns = (ext.annotations ??= {});

    const defaultAnnoType = annotationConfig.DefaultAnnoType;

    if (anns["__default__"] && !anns[defaultAnnoType]) {
      anns[defaultAnnoType] = anns["__default__"];
      delete anns["__default__"];
    }

    if (annotationBins) {
      for (const anno of annotationConfig.AvailableAnnoTypes) {
        if (!anns[anno] && annotationBins[anno]) {
          anns[anno] = annotationBins[anno];
        }
      }
    }

    setLoadedAnnotations(new Set(Object.keys(anns)));

    const items = annotationConfig.AnnoMaps?.[defaultAnnoType]?.Items ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const needInfer = items.some((it: any) => it.Color == null);

    if (needInfer && anns[defaultAnnoType] && ext.originalColor) {
      const ids = anns[defaultAnnoType] as Uint8Array | Uint16Array;
      const cmap: Record<number, [number, number, number]> = {};
      const originalColor = ext.originalColor;

      for (let i = 0; i < ids.length; i++) {
        const code = ids[i];
        if (cmap[code] !== undefined) continue;
        const j = i * 4;
        cmap[code] = [
          originalColor[j],
          originalColor[j + 1],
          originalColor[j + 2],
        ];
        if (Object.keys(cmap).length >= items.length) break;
      }
    }
  }, [loadedData, annotationConfig, annotationBins]);

  const loadNumericField = useCallback(
    (field: ContinuousField | null, dataObj?: LoadedData) => {
      const targetData = dataObj || loadedData;
      if (!targetData) return;

      if (!field) {
        targetData.extData.numeric = null;
        setNumericField(null);
        setLoadedData({ ...targetData }); // ⭐
        return;
      }

      targetData.extData.numeric = field;
      setNumericField(field);
      setLoadedData({ ...targetData }); // ⭐
    },
    [loadedData],
  );

  return {
    isLoaded,
    loadedData,
    loadedAnnotations,
    loadNumericField,
    onDataLoad,
    numericField,
    setLoadedData,
  };
};
