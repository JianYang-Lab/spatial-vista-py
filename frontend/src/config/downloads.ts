interface Dataset {
  id: string;
  name: string;
  description: string;
  size: string;
  format: string;
  spots: number;
  downloadUrl: string;
  logpFiles: Array<{
    name: string;
    trait: string;
    size: string;
    downloadUrl: string;
  }>;
}

export const datasets: Dataset[] = [
  {
    id: "brain_cortex",
    name: "Human Brain Cortex",
    description:
      "Spatial transcriptomics data from human brain cortex samples with cell-type annotations and spatial coordinates",
    size: "99 TB",
    format: "ZARR",
    spots: 156789,
    downloadUrl: "/downloads/brain_cortex.zarr",
    logpFiles: [
      {
        name: "alzheimer_risk.bin",
        trait: "Alzheimer's Disease Risk",
        size: "45 MB",
        downloadUrl: "/downloads/logp/alzheimer_risk.bin",
      },
      {
        name: "cognitive_function.bin",
        trait: "Cognitive Function",
        size: "38 MB",
        downloadUrl: "/downloads/logp/cognitive_function.bin",
      },
      {
        name: "brain_volume.bin",
        trait: "Brain Volume",
        size: "42 MB",
        downloadUrl: "/downloads/logp/brain_volume.bin",
      },
      {
        name: "depression_risk.bin",
        trait: "Depression Risk",
        size: "41 MB",
        downloadUrl: "/downloads/logp/depression_risk.bin",
      },
      {
        name: "memory_performance.bin",
        trait: "Memory Performance",
        size: "39 MB",
        downloadUrl: "/downloads/logp/memory_performance.bin",
      },
    ],
  },
  {
    id: "liver_tissue",
    name: "Human Liver Tissue",
    description:
      "Multi-zone liver tissue spatial transcriptomics with metabolic pathway annotations and disease state markers",
    size: "1.8 GB",
    format: "H5AD",
    spots: 124567,
    downloadUrl: "/downloads/liver_tissue.h5ad",
    logpFiles: [
      {
        name: "liver_cirrhosis.bin",
        trait: "Liver Cirrhosis Risk",
        size: "36 MB",
        downloadUrl: "/downloads/logp/liver_cirrhosis.bin",
      },
      {
        name: "metabolic_syndrome.bin",
        trait: "Metabolic Syndrome",
        size: "44 MB",
        downloadUrl: "/downloads/logp/metabolic_syndrome.bin",
      },
      {
        name: "cholesterol_levels.bin",
        trait: "Cholesterol Levels",
        size: "40 MB",
        downloadUrl: "/downloads/logp/cholesterol_levels.bin",
      },
      {
        name: "fatty_liver.bin",
        trait: "Fatty Liver Disease",
        size: "43 MB",
        downloadUrl: "/downloads/logp/fatty_liver.bin",
      },
    ],
  },
  {
    id: "heart_muscle",
    name: "Cardiac Muscle Tissue",
    description:
      "Heart muscle spatial transcriptomics from healthy and diseased samples with cardiomyocyte-specific markers",
    size: "1.5 GB",
    format: "H5AD",
    spots: 98234,
    downloadUrl: "/downloads/heart_muscle.h5ad",
    logpFiles: [
      {
        name: "coronary_disease.bin",
        trait: "Coronary Artery Disease",
        size: "35 MB",
        downloadUrl: "/downloads/logp/coronary_disease.bin",
      },
      {
        name: "heart_failure.bin",
        trait: "Heart Failure Risk",
        size: "38 MB",
        downloadUrl: "/downloads/logp/heart_failure.bin",
      },
      {
        name: "arrhythmia.bin",
        trait: "Cardiac Arrhythmia",
        size: "33 MB",
        downloadUrl: "/downloads/logp/arrhythmia.bin",
      },
      {
        name: "hypertension.bin",
        trait: "Hypertension Risk",
        size: "37 MB",
        downloadUrl: "/downloads/logp/hypertension.bin",
      },
      {
        name: "cardiac_output.bin",
        trait: "Cardiac Output",
        size: "34 MB",
        downloadUrl: "/downloads/logp/cardiac_output.bin",
      },
    ],
  },
];
