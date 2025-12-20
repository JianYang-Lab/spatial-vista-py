import { useMemo } from "react";
import { PointCloudLayer, ScatterplotLayer } from "@deck.gl/layers";
import { DataFilterExtension } from "@deck.gl/extensions";
import type { LayersList } from "@deck.gl/core";
import type { LayoutMode, ContinuousField, ColorRGBA } from "../types";
import {
  calculatePointColor,
  type ColorCalculatorParams,
} from "../utils/colorCalculator";
import { LASWorkerLoader } from "@loaders.gl/las";
import lasWorkerUrl from "@/utils/las-worker.js?url";

interface UseDeckLayersProps {
  showPointCloud: boolean;
  showScatterplot: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadedData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDataLoad?: (data: any) => void;
  filteredSectionPoints: number[];
  NumericThreshold: number;
  numericField: ContinuousField | null;
  pointOpacity: number;
  pointSize: number;
  layoutMode: LayoutMode;
  FancyPositions: Float32Array | null;
  colorParams: ColorCalculatorParams;
  lazUrl: string | null;
}

export const useDeckLayers = ({
  showPointCloud,
  showScatterplot,
  loadedData,
  onDataLoad,
  filteredSectionPoints,
  NumericThreshold,
  numericField,
  pointOpacity,
  pointSize,
  layoutMode,
  FancyPositions,
  colorParams,
  lazUrl,
}: UseDeckLayersProps): LayersList => {
  return useMemo(() => {
    // Prefer using parsed loadedData over lazUrl so the layer uses the already-parsed object
    // once it becomes available (avoid re-parsing the blob URL).
    if (!loadedData && !lazUrl) {
      return [];
    }

    const dataSource = loadedData ?? lazUrl;

    const shouldUseOnDataLoad = typeof dataSource === "string" && !!onDataLoad;

    const layersList: LayersList = [];

    if (showPointCloud) {
      layersList.push(
        new PointCloudLayer({
          id: "laz-point-cloud-layer",
          data: dataSource,
          onDataLoad: shouldUseOnDataLoad ? onDataLoad : null,
          visible: showPointCloud,
          colorFormat: "RGBA",
          getNormal: [0, 1, 0],
          extensions: [new DataFilterExtension({ filterSize: 1 })],
          transitions: { getPosition: 800 },
          loaders: [LASWorkerLoader],
          loadOptions: {
            las: {
              workerUrl: lasWorkerUrl,
            },
          },
          updateTriggers: {
            getColor: [
              numericField?.name,
              NumericThreshold,
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

    const minMaxValue: [number, number] | null =
      numericField !== null
        ? [numericField.ContinuousConfig.Min, numericField.ContinuousConfig.Max]
        : null;

    if (showScatterplot && !showPointCloud && loadedData) {
      layersList.push(
        new ScatterplotLayer({
          id: "scatter-plot-layer",
          data: filteredSectionPoints,
          extensions: [new DataFilterExtension({ filterSize: 1 })],

          getFilterValue: (index: number) => {
            const extData = loadedData.extData;
            if (!extData?.logPs) return NumericThreshold + 1;
            return extData.logPs[index];
          },

          filterRange: [NumericThreshold, minMaxValue?.[1] || 100],
          filterTransformColor: true,
          filterTransformSize: true,
          filterEnabled: !!numericField,
          visible: showScatterplot,
          pickable: true,
          opacity: pointOpacity,
          stroked: false,
          filled: true,
          radiusScale: pointSize * 0.1,
          // radiusMinPixels: 0,
          // radiusMaxPixels: 20,
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

          getFillColor: (i: number): ColorRGBA => {
            if (!loadedData?.extData) return [0, 0, 0, 0];
            const extData = loadedData.extData;
            return calculatePointColor(i, extData, colorParams);
          },

          updateTriggers: {
            getFillColor: [
              numericField?.name,
              NumericThreshold,
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
    NumericThreshold,
    numericField,
    pointOpacity,
    pointSize,
    layoutMode,
    FancyPositions,
    colorParams,
    lazUrl,
  ]);
};
