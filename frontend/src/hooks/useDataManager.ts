import { useState, useCallback, useEffect } from "react";
import type { CategoryColors, LASMesh, LoadedData } from "../types";
import { INITIAL_VIEW_STATE } from "../config/constants";

type AnnotationType = string;

type NumericField = {
  name: string;
  values: Float32Array;
  min: number;
  max: number;
};

interface UseDataManagerProps {
  onLoad?: (data: { count: number; progress: number }) => void;
  // setCategoryColors: (
  //   colors: CategoryColors | ((prev: CategoryColors) => CategoryColors),
  // ) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateViewState: (viewState: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setInitialCamera: (camera: any) => void;
  setActiveZoom: (zoom: string) => void;
  annotationConfig: any | null;
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
  const [numericField, setNumericField] = useState<{
    name: string;
    values: Float32Array;
    min: number;
    max: number;
  } | null>(null);

  const [loadedAnnotations, setLoadedAnnotations] = useState<
    Set<AnnotationType>
  >(new Set());

  const onDataLoad = useCallback(
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
        numeric: null as null | {
          name: string;
          values: Float32Array;
          min: number;
          max: number;
        },
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

      // NOT load trait by default
      // loadTrait(null, data);
      console.timeEnd("Data load");
    },
    [annotationConfig],
  );

  useEffect(() => {
    if (!loadedData || !annotationConfig) return;

    const ext = loadedData.extData;
    const anns = (ext.annotations ??= {});

    const defaultAnnoType = annotationConfig.DefaultAnnoType;

    // (2) 修正 __default__ key
    if (anns["__default__"] && !anns[defaultAnnoType]) {
      anns[defaultAnnoType] = anns["__default__"];
      delete anns["__default__"];
    }

    // (1) 注入 bins
    if (annotationBins) {
      for (const anno of annotationConfig.AvailableAnnoTypes) {
        if (!anns[anno] && annotationBins[anno]) {
          anns[anno] = annotationBins[anno];
        }
      }
    }

    setLoadedAnnotations(new Set(Object.keys(anns)));

    // (3) 初始化 colormap：优先用 config 里显式 Color；若为 null 则从 originalColor 推（只对 defaultAnnoType 做）
    // 你现在把 regionColorMap 那坨注释了，这里把它放回来
    const items = annotationConfig.AnnoMaps?.[defaultAnnoType]?.Items ?? [];
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

  useEffect(() => {
    if (!loadedData || !annotationConfig) return;

    const anns = loadedData.extData.annotations;
    let changed = false;

    for (const anno of annotationConfig.AvailableAnnoTypes) {
      if (!anns[anno] && annotationBins[anno]) {
        anns[anno] = annotationBins[anno];
        changed = true;
      }
    }

    if (changed) {
      // ⚠️ 只有在第一次补齐 annotations 时才 set
      setLoadedAnnotations(new Set(Object.keys(anns)));
    }
  }, [loadedData, annotationConfig, annotationBins]);

  const loadAnnotation = useCallback((_type: AnnotationType) => {
    // annotations are preloaded via widget
  }, []);

  const clearAnnotation = useCallback(
    (type: AnnotationType) => {
      // NOT clear default annotation
      if (type === annotationConfig.DefaultAnnoType) {
        return;
      }

      // remove from extData
      if (loadedData?.extData?.annotations[type]) {
        loadedData.extData.annotations[type] = null;
      }

      // update loadedAnnotations
      const newLoadedAnnotations = new Set(loadedAnnotations);
      newLoadedAnnotations.delete(type);
      setLoadedAnnotations(newLoadedAnnotations);
    },
    [loadedData, loadedAnnotations],
  );

  const loadNumericField = useCallback(
    (
      field: {
        name: string;
        values: Float32Array;
        min: number;
        max: number;
      } | null,
      dataObj?: LoadedData,
    ) => {
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
    loadAnnotation,
    clearAnnotation,
    setLoadedData,
  };
};
