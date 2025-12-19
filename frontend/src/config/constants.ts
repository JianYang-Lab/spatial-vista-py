import type { OrbitViewState, OrthographicViewState } from "@deck.gl/core";

export const TRAIT_GROUPS = [
  {
    group: "Psychiatric Disorders",
    traits: ["SCZ", "Bipolar"],
  },
  {
    group: "Group A",
    traits: ["traitA", "traitB", "traitC", "traitD", "traitE"],
  },
  {
    group: "Group B",
    traits: ["traitF", "traitG", "traitH"],
  },
  {
    group: "Miscellaneous",
    traits: ["traitI", "traitJ", "whyaaa", "asdhfkjasdf", "ggggg", "1989"],
  },
];

// Initial view state for the orbit camera
export const INITIAL_VIEW_STATE: OrbitViewState = {
  target: [0, 0, 0],
  rotationX: 60,
  rotationOrbit: 0,
  minZoom: -10,
  maxZoom: 10,
  zoom: 1,
};

export const INITIAL_2D_VIEW_STATE: OrthographicViewState = {
  target: [0, 0, 0],
  zoom: 1,
  minZoom: -10,
  maxZoom: 10,
};

export const MAX_CONCURRENT_PREVIEWS = 2;
