import { useState, useCallback, useEffect } from "react";
import type { OrbitViewState, OrthographicViewState } from "@deck.gl/core";
import { INITIAL_VIEW_STATE, INITIAL_2D_VIEW_STATE } from "../config/constants";

export interface UseViewStatesReturn {
  // States
  viewState: OrbitViewState;
  stviewState: OrthographicViewState;
  initialCamera: OrbitViewState;
  activeZoom: string | null;
  autoRotate: boolean;
  layoutMode: "3d" | "2d-treemap" | "2d-histogram";

  // Actions
  updateViewState: (viewState: OrbitViewState) => void;
  updateStviewState: (viewState: OrthographicViewState) => void;
  setInitialCamera: (camera: OrbitViewState) => void;
  setActiveZoom: (zoom: string | null) => void;
  setAutoRotate: (autoRotate: boolean) => void;
  setLayoutMode: (mode: "3d" | "2d-treemap" | "2d-histogram") => void;
  toggleAutoRotate: () => void;
  setIsLoaded: (isLoaded: boolean) => void;
}

export const useViewStates = (): UseViewStatesReturn => {
  // View state of 3D / 2D
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewState, updateViewState] =
    useState<OrbitViewState>(INITIAL_VIEW_STATE);
  const [initialCamera, setInitialCamera] =
    useState<OrbitViewState>(INITIAL_VIEW_STATE);
  const [stviewState, updateStviewState] = useState<OrthographicViewState>(
    INITIAL_2D_VIEW_STATE,
  );

  // Current active zoom preset
  const [activeZoom, setActiveZoom] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);

  // Layout transition states
  const [layoutMode, setLayoutMode] = useState<
    "3d" | "2d-treemap" | "2d-histogram"
  >("3d");

  // Auto rotate camera effect
  useEffect(() => {
    if (!isLoaded || !autoRotate) {
      return;
    }

    let animationFrame: number;
    const rotateCamera = () => {
      updateViewState((v) => ({
        ...v,
        rotationOrbit: (v.rotationOrbit || 0) + 0.2,
        transitionDuration: 0,
      }));
      animationFrame = requestAnimationFrame(rotateCamera);
    };

    rotateCamera();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [isLoaded, autoRotate]);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => !prev);
  }, []);

  return {
    viewState,
    stviewState,
    initialCamera,
    activeZoom,
    autoRotate,
    layoutMode,
    updateViewState,
    updateStviewState,
    setInitialCamera,
    setActiveZoom,
    setAutoRotate,
    setLayoutMode,
    toggleAutoRotate,
    setIsLoaded,
  };
};
