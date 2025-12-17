import { useMemo } from "react";
import { PointCloudLayer, ScatterplotLayer } from "@deck.gl/layers";
import { DataFilterExtension } from "@deck.gl/extensions";
import type { LayersList } from "@deck.gl/core";
import type { LayoutMode, RGBAColor } from "../types";
import {
  calculatePointColor,
  type ColorCalculatorParams,
} from "../utils/colorCalculator";
import { LAZ_SAMPLE } from "../config/constants";
import { LASWorkerLoader } from "@loaders.gl/las";
// import lasWorkerUrl from "@/workers/las-worker?worker&url";

interface UseDeckLayersProps {
  showPointCloud: boolean;
  showScatterplot: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadedData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDataLoad?: (data: any) => void;
  filteredSectionPoints: number[];
  currentTrait: string | null;
  logpThreshold: number;
  minMaxLogp: [number, number] | null;
  pointOpacity: number;
  pointSize: number;
  layoutMode: LayoutMode;
  FancyPositions: Float32Array | null;
  colorParams: ColorCalculatorParams;
}

export const useDeckLayers = ({
  showPointCloud,
  showScatterplot,
  loadedData,
  onDataLoad,
  filteredSectionPoints,
  currentTrait,
  logpThreshold,
  minMaxLogp,
  pointOpacity,
  pointSize,
  layoutMode,
  FancyPositions,
  colorParams,
}: UseDeckLayersProps): LayersList => {
  return useMemo(() => {
    const layersList: LayersList = [];

    if (showPointCloud) {
      layersList.push(
        new PointCloudLayer({
          id: "laz-point-cloud-layer",
          data: loadedData || LAZ_SAMPLE,
          onDataLoad: loadedData ? null : onDataLoad,
          visible: showPointCloud,
          colorFormat: "RGBA",
          getNormal: [0, 1, 0],
          extensions: [new DataFilterExtension({ filterSize: 1 })],
          transitions: { getPosition: 800 },
          // 添加 loaders 配置
          loaders: [LASWorkerLoader],
          // loadOptions: {
          //   las: {
          //     workerUrl: lasWorkerUrl,
          //   },
          // },
          updateTriggers: {
            getColor: [
              currentTrait,
              logpThreshold,
              colorParams.hiddenCategoryIds,
              colorParams.customColors,
              colorParams.coloringAnnotation,
              colorParams.selectedCategories,
            ],
            getPosition: [layoutMode, FancyPositions],
          },

          getColor: (_d, { index, data }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const extData = (data as any).extData;
            return calculatePointColor(index, extData, colorParams);
          },

          getPosition: (_d, { index, data }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const extData = (data as any).extData;
            if (
              (layoutMode === "2d-treemap" || layoutMode === "2d-histogram") &&
              FancyPositions
            ) {
              return [
                FancyPositions[index * 3],
                FancyPositions[index * 3 + 1],
                FancyPositions[index * 3 + 2],
              ];
            } else {
              const originalPos = extData.POSITION.value;
              return [
                originalPos[index * 3],
                originalPos[index * 3 + 1],
                originalPos[index * 3 + 2],
              ];
            }
          },

          opacity: pointOpacity,
          pointSize: pointSize,
          pickable: true,
        }),
      );
    }

    if (showScatterplot && !showPointCloud && loadedData) {
      layersList.push(
        new ScatterplotLayer({
          id: "scatter-plot-layer",
          data: filteredSectionPoints,
          extensions: [new DataFilterExtension({ filterSize: 1 })],

          getFilterValue: (index: number) => {
            const extData = loadedData.extData;
            if (!extData?.logPs) return logpThreshold + 1;
            return extData.logPs[index];
          },

          filterRange: [logpThreshold, minMaxLogp?.[1] || 100],
          filterTransformColor: true,
          filterTransformSize: true,
          filterEnabled: currentTrait !== null,
          visible: showScatterplot,
          pickable: true,
          opacity: pointOpacity,
          stroked: false,
          filled: true,
          radiusScale: pointSize * 20,
          radiusMinPixels: 0.2,
          radiusMaxPixels: 20,
          lineWidthMinPixels: 0,

          getPosition: (i) => {
            if (!loadedData?.extData?.POSITION) return [0, 0, 0];
            const index = i * 3;
            return [
              loadedData.extData.POSITION.value[index],
              loadedData.extData.POSITION.value[index + 1],
              0,
            ];
          },

          getFillColor: (i: number): RGBAColor => {
            if (!loadedData?.extData) return [0, 0, 0, 0];
            const extData = loadedData.extData;
            return calculatePointColor(i, extData, colorParams);
          },

          updateTriggers: {
            getFillColor: [
              currentTrait,
              logpThreshold,
              colorParams.hiddenCategoryIds,
              colorParams.customColors,
              colorParams.coloringAnnotation,
              colorParams.selectedCategories,
            ],
          },
        }),
      );
    }

    return layersList;
  }, [
    showPointCloud,
    showScatterplot,
    loadedData,
    onDataLoad,
    filteredSectionPoints,
    currentTrait,
    logpThreshold,
    minMaxLogp,
    pointOpacity,
    pointSize,
    layoutMode,
    FancyPositions,
    colorParams,
  ]);
};
