import { useState, useCallback, useEffect } from "react";
import { type AnnotationType, ANNOTATION_CONFIG } from "../config/annotations";
import type { CategoryColors, LASMesh, LoadedData } from "../types";
import { INITIAL_VIEW_STATE, LAZ_SAMPLE } from "../config/constants";

import { logger } from "@/utils/tauri";

interface UseDataManagerProps {
  onLoad?: (data: { count: number; progress: number }) => void;
  setCategoryColors: (
    colors: CategoryColors | ((prev: CategoryColors) => CategoryColors),
  ) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateViewState: (viewState: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setInitialCamera: (camera: any) => void;
  setActiveZoom: (zoom: string) => void;
}

export const useDataManager = ({
  onLoad,
  setCategoryColors,
  updateViewState,
  setInitialCamera,
  setActiveZoom,
}: UseDataManagerProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedData, setLoadedData] = useState<LoadedData | null>(null);
  const [currentTrait, setCurrentTrait] = useState<string | null>(null);
  const [minMaxLogp, setMinMaxLogp] = useState<[number, number] | null>(null);

  const [loadedAnnotations, setLoadedAnnotations] = useState<
    Set<AnnotationType>
  >(new Set([ANNOTATION_CONFIG.defaultType]));

  // TODO(wangkai) test logger
  useEffect(() => {
    let load_laz = async () => {
      logger.info(`load path: ${LAZ_SAMPLE}`);
    };

    load_laz();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDataLoad = useCallback((data: any) => {
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

    // set default annotation data
    setLoadedAnnotations(new Set([ANNOTATION_CONFIG.defaultType]));
    // default anno ids is encoded in the laz file
    const defaultAnnids = data.attributes.classification.value;

    // coloring by default annotation
    // setColoringAnnotation(ANNOTATION_CONFIG.defaultType);

    // only keep originalColor and default annotation
    // logP/other annos will be loaded dynamically later
    (data as LoadedData).extData = {
      originalColor,
      logPs: null,
      minLogP: null,
      maxLogP: null,
      annotations: {
        [ANNOTATION_CONFIG.defaultType]: defaultAnnids,
      },
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

      // extra colormap for default annotation cuz it's null and encoded in original color
      // TODO: maybe deprecate COLOR_0 in laz data?
      const regionColorMap: Record<number, [number, number, number]> = {};
      // console.time("region color map");
      for (let i = 0; i < defaultAnnids.length; i++) {
        const defaultAnnid = defaultAnnids[i];
        if (
          defaultAnnid !== undefined &&
          regionColorMap[defaultAnnid] === undefined
        ) {
          const colorIndex = i * 4;
          regionColorMap[defaultAnnid] = [
            originalColor[colorIndex],
            originalColor[colorIndex + 1],
            originalColor[colorIndex + 2],
          ];
          // quit early if all regions are found
          if (
            Object.keys(regionColorMap).length ===
            Object.keys(ANNOTATION_CONFIG.annotationMaps.region).length
          ) {
            break;
          }
        }
      }
      // console.timeEnd("region color map");

      // update color map state
      setCategoryColors((prev) => ({
        ...prev,
        region: regionColorMap,
      }));
    }

    if (onLoad) {
      onLoad({ count: header.vertexCount, progress: 1 });
    }

    // NOT load trait by default
    loadTrait(null, data);
    console.timeEnd("Data load");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load AnnotationType data
  const loadAnnotation = useCallback(
    async (type: AnnotationType) => {
      // if loaded, checkout
      if (loadedData?.extData.annotations[type]) {
        // setColoringAnnotation(type);
        return;
      }

      // fetch from file url
      const url = `${type}.bin`;
      const res = await fetch(url);
      const buf = await res.arrayBuffer();

      if (!loadedData) {
        console.error("Data not loaded yet");
        return;
      }

      // const extData = loadedData.extData;
      const classificationData = new Uint8Array(buf);

      // Add into extData
      loadedData.extData.annotations[type] = classificationData;

      // Add into loadedAnnotations
      const newLoadedAnnotations = new Set(loadedAnnotations);
      newLoadedAnnotations.add(type);
      setLoadedAnnotations(newLoadedAnnotations);

      console.log(
        `Added ${type} to annotations:`,
        Object.keys(loadedData.extData.annotations),
      );
    },
    [loadedData, loadedAnnotations, setLoadedAnnotations],
  );

  const loadTrait = useCallback(
    async (trait: string | null, dataObj?: LoadedData) => {
      const targetData = dataObj || loadedData;
      if (!targetData) return;

      const extData = targetData.extData;

      if (!trait) {
        // clear current trait
        extData.logPs = null;
        extData.minLogP = null;
        extData.maxLogP = null;
        setCurrentTrait(null);
        setMinMaxLogp(null);
        return;
      }

      const url = `${trait}.bin`;
      const resp = await fetch(url);
      const buf = await resp.arrayBuffer();
      const arr = new Float32Array(buf);

      let minLogP = Infinity,
        maxLogP = -Infinity;
      for (const v of arr) {
        if (v < minLogP) minLogP = v;
        if (v > maxLogP) maxLogP = v;
      }

      extData.logPs = arr;
      extData.minLogP = minLogP;
      extData.maxLogP = maxLogP;
      setCurrentTrait(trait);

      // save min/max logP for threshold slider
      setMinMaxLogp([minLogP, maxLogP]);
    },
    [loadedData],
  );

  const clearAnnotation = useCallback(
    (type: AnnotationType) => {
      // NOT clear default annotation
      if (type === ANNOTATION_CONFIG.defaultType) {
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

  return {
    isLoaded,
    loadedData,
    loadedAnnotations,
    currentTrait,
    minMaxLogp,
    onDataLoad,
    loadAnnotation,
    loadTrait,
    clearAnnotation,
  };
};
