import { useState, useCallback } from "react";
import {
  generateHistogramPositions,
  generateTreemapPositions,
} from "../utils/layout";
import type { OrbitViewState } from "@deck.gl/core";

export interface UseLayoutModeReturn {
  // States
  FancyPositions: Float32Array | null;

  // Actions
  setFancyPositions: (positions: Float32Array | null) => void;
  toggleLayoutMode: () => void;
}

export const useLayoutMode = (
  layoutMode: "3d" | "2d-treemap" | "2d-histogram",
  setLayoutMode: (mode: "3d" | "2d-treemap" | "2d-histogram") => void,
  currentTrait: string | null,
  coloringAnnotation: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadedData: any,
  initialCamera: OrbitViewState,
  updateViewState: (viewState: OrbitViewState) => void,
  setPointSize: (size: number) => void,
): UseLayoutModeReturn => {
  const [FancyPositions, setFancyPositions] = useState<Float32Array | null>(
    null,
  );

  // Toggle layout mode between 3D and 2D treemap
  const toggleLayoutMode = useCallback(() => {
    if (layoutMode === "3d") {
      if (currentTrait) {
        const histogramPos = generateHistogramPositions(
          loadedData,
          currentTrait,
          coloringAnnotation,
        );
        if (histogramPos) {
          console.log("Generated histogram positions for trait analysis");
          setFancyPositions(histogramPos);
          setLayoutMode("2d-histogram");
          setPointSize(3);
          updateViewState({
            ...initialCamera,
            rotationX: 0,
            zoom: (initialCamera.zoom as number) + 1,
            transitionDuration: 0,
          });
        }
      } else {
        const treemapPos = generateTreemapPositions(
          loadedData,
          coloringAnnotation,
        );
        if (treemapPos) {
          console.log("Generated treemap positions for annotation analysis");
          setFancyPositions(treemapPos);
          setLayoutMode("2d-treemap");
          setPointSize(2);
          updateViewState({
            ...initialCamera,
            rotationX: 0,
            zoom: (initialCamera.zoom as number) + 1,
            transitionDuration: 0,
          });
        }
      }
    } else {
      setLayoutMode("3d");
      updateViewState({
        ...initialCamera,
        transitionDuration: 0,
      });
      setPointSize(1);
      setFancyPositions(null);
    }
  }, [
    layoutMode,
    currentTrait,
    coloringAnnotation,
    loadedData,
    initialCamera,
    updateViewState,
    setLayoutMode,
    setPointSize,
  ]);

  return {
    FancyPositions,
    setFancyPositions,
    toggleLayoutMode,
  };
};
