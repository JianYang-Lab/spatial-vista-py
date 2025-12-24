import type { OrbitViewState, OrthographicViewState } from "@deck.gl/core";

// Initial view state for the orbit camera
export const INITIAL_VIEW_STATE: OrbitViewState = {
  target: [0, 0, 0],
  rotationX: 0,
  rotationOrbit: 0,
  minZoom: -10,
  maxZoom: 20,
  zoom: 0,
  minRotationX: -360,
  maxRotationX: 360,
};

export const INITIAL_2D_VIEW_STATE: OrthographicViewState = {
  target: [0, 0, 0],
  zoom: 1,
  minZoom: -10,
  maxZoom: 20,
};

export const MAX_CONCURRENT_PREVIEWS = 2;
