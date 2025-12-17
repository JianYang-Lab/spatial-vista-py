export type AnnotationType = string;
export type AnnotationConfigType = {
  availableTypes: AnnotationType[];
  defaultType: AnnotationType;
  annotationMaps: Record<AnnotationType, Record<number, string>>;
  defaultColormap: Record<
    AnnotationType,
    Record<number, [number, number, number]>
  >;
};

// TODO: fetch annotation data from a config or API
export const ANNOTATION_CONFIG: AnnotationConfigType = {
  availableTypes: ["region", "cell-type", "CCF Region", "Donor", "section"],
  defaultType: "region",
  annotationMaps: {
    region: {
      0: "Cerebellum",
      1: "Hippocampus",
      2: "Isocortex",
      3: "Olfactory",
      4: "Fiber_tracts",
      5: "Striatum",
      6: "Ventricular_systems",
      7: "Cortical_subplate",
      8: "Pallidum",
      9: "Midbrain",
      10: "Medulla",
      11: "Thalamus",
      12: "Hypothalamus",
      13: "Pons",
    },
    "cell-type": {
      0: "vascular leptomeningeal cell",
      1: "GABAergic neuron",
      2: "astrocyte",
      3: "macrophage",
      4: "Bergmann glial cell",
      5: "glutamatergic neuron",
      6: "neuroblast (sensu Vertebrata)",
      7: "endothelial cell",
      8: "microglial cell",
      9: "oligodendrocyte precursor cell",
      10: "oligodendrocyte",
      11: "pericyte",
      12: "smooth muscle cell",
      13: "glycinergic neuron",
      14: "choroid plexus epithelial cell",
      15: "ependymal cell",
      16: "lymphocyte",
      17: "dendritic cell",
      18: "dopaminergic neuron",
      19: "olfactory ensheathing cell",
      20: "cholinergic neuron",
      21: "histaminergic neuron",
    },
    section: {
      0: "Section 1",
      1: "Section 2",
      2: "Section 3",
      3: "Section 4",
      4: "Section 5",
      5: "Section 6",
      6: "Section 7",
      7: "Section 8",
      8: "Section 9",
      9: "Section 10",
      10: "Section 11",
      11: "Section 12",
      12: "Section 13",
      13: "Section 14",
      14: "Section 15",
      15: "Section 16",
      16: "Section 17",
      17: "Section 18",
      18: "Section 19",
      19: "Section 20",
      20: "Section 21",
      21: "Section 22",
      22: "Section 23",
      23: "Section 24",
      24: "Section 25",
      25: "Section 26",
      26: "Section 27",
      27: "Section 28",
    },
  },
  defaultColormap: {
    region: {}, //encoded in original color laz
    "cell-type": {
      0: [120, 80, 200], // vascular leptomeningeal cell - 紫色
      1: [0, 200, 0], // GABAergic neuron - 绿色
      2: [200, 150, 0], // astrocyte - 橙色
      3: [200, 0, 0], // macrophage - 红色
      4: [0, 200, 200], // Bergmann glial cell - 青色
      5: [200, 0, 200], // glutamatergic neuron - 粉色/洋红
      6: [100, 100, 200], // neuroblast (sensu Vertebrata) - 蓝灰色
      7: [200, 200, 0], // endothelial cell - 黄色
      8: [120, 120, 120], // microglial cell - 灰色
      9: [50, 150, 200], // oligodendrocyte precursor cell - 天蓝色
      10: [255, 100, 50], // oligodendrocyte - 橙红色
      11: [0, 150, 100], // pericyte - 蓝绿色
      12: [150, 75, 0], // smooth muscle cell - 棕色
      13: [180, 0, 120], // glycinergic neuron - 紫红色
      14: [255, 200, 150], // choroid plexus epithelial cell - 浅橙色
      15: [0, 100, 200], // ependymal cell - 深蓝色
      16: [0, 200, 150], // lymphocyte - 青绿色
      17: [150, 0, 200], // dendritic cell - 紫色偏蓝
      18: [255, 50, 150], // dopaminergic neuron - 玫红色
      19: [80, 180, 255], // olfactory ensheathing cell - 浅蓝色
      20: [255, 180, 0], // cholinergic neuron - 金黄色
      21: [188, 188, 20], //
    },
    section: {},
  },
};
