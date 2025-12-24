import { useState, useCallback, useEffect } from "react";
import type {
  AnnotationConfig,
  ContinuousField,
  LASMesh,
  LoadedData,
  AnnotationType,
} from "@/types";
import { INITIAL_VIEW_STATE } from "@/config/constants";

// type AnnotationType = string;

interface UseDataManagerProps {
  onLoad?: (data: { count: number; progress: number }) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateViewState: (viewState: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setInitialCamera: (camera: any) => void;
  setActiveZoom: (zoom: string) => void;
  annotationConfig: AnnotationConfig | null;
  annotationBins: Record<string, Uint8Array | Uint16Array | Uint32Array>;
  parentWidth?: number | null;
}

export const useDataManager = ({
  onLoad,
  // setCategoryColors,
  updateViewState,
  setInitialCamera,
  setActiveZoom,
  annotationConfig,
  annotationBins,
  parentWidth = null,
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

      // only keep originalColor and default annotation
      // logP/other annos will be loaded dynamically later
      (data as LoadedData).extData = {
        numeric: null as null | ContinuousField,
        annotations: {},
        POSITION: data.attributes.POSITION,
      };
      data.attributes.COLOR_0 = undefined;
      data.attributes.POSITION = undefined;

      if (header.boundingBox) {
        const [mins, maxs] = header.boundingBox;

        const widthForZoom =
          typeof parentWidth === "number" && parentWidth > 0
            ? parentWidth
            : window.innerWidth;
        console.log(" width", widthForZoom);
        updateViewState({
          ...INITIAL_VIEW_STATE,
          target: [
            (mins[0] + maxs[0]) / 2,
            (mins[1] + maxs[1]) / 2,
            (mins[2] + maxs[2]) / 2,
          ],
          zoom: Math.log2(widthForZoom / (maxs[0] - mins[0])) - 2,
        });
        setInitialCamera({
          ...INITIAL_VIEW_STATE,
          target: [
            (mins[0] + maxs[0]) / 2,
            (mins[1] + maxs[1]) / 2,
            (mins[2] + maxs[2]) / 2,
          ],
          zoom: Math.log2(widthForZoom / (maxs[0] - mins[0])) - 2,
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
    [onLoad, parentWidth, setActiveZoom, setInitialCamera, updateViewState],
  );

  // Preload annotations when data or annotation config changes
  useEffect(() => {
    if (!loadedData || !annotationConfig) return;

    const ext = loadedData.extData;
    const anns = (ext.annotations ??= {});

    let changed = false;

    for (const anno of annotationConfig.AvailableAnnoTypes) {
      if (!anns[anno] && annotationBins[anno]) {
        anns[anno] = annotationBins[anno];
        changed = true;
      }
    }

    if (changed) {
      setLoadedAnnotations(new Set(Object.keys(anns)));

      setLoadedData({ ...loadedData });
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
