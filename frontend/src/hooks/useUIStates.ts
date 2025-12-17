import { useState } from "react";

export interface UseUIStatesReturn {
  // Dialog states
  traitOpen: boolean;
  annotationOpen: boolean;
  colorPickerOpen: boolean;

  // Display states
  showPointCloud: boolean;
  showScatterplot: boolean;

  // Point controls
  pointSize: number;
  pointOpacity: number;
  logpThreshold: number;

  // Actions
  setTraitOpen: (open: boolean) => void;
  setAnnotationOpen: (open: boolean) => void;
  setColorPickerOpen: (open: boolean) => void;
  setshowPointCloud: (show: boolean) => void;
  setShowScatterplot: (show: boolean) => void;
  setPointSize: (size: number) => void;
  setPointOpacity: (opacity: number) => void;
  setLogpThreshold: (threshold: number) => void;
}

export const useUIStates = (): UseUIStatesReturn => {
  // Dialog states
  const [traitOpen, setTraitOpen] = useState<boolean>(false);
  const [annotationOpen, setAnnotationOpen] = useState<boolean>(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<boolean>(false);

  // Display states
  const [showPointCloud, setshowPointCloud] = useState<boolean>(true);
  const [showScatterplot, setShowScatterplot] = useState<boolean>(false);

  // Point controls
  const [pointSize, setPointSize] = useState<number>(1);
  const [pointOpacity, setPointOpacity] = useState<number>(1);
  const [logpThreshold, setLogpThreshold] = useState<number>(0);

  return {
    traitOpen,
    annotationOpen,
    colorPickerOpen,
    showPointCloud,
    showScatterplot,
    pointSize,
    pointOpacity,
    logpThreshold,
    setTraitOpen,
    setAnnotationOpen,
    setColorPickerOpen,
    setshowPointCloud,
    setShowScatterplot,
    setPointSize,
    setPointOpacity,
    setLogpThreshold,
  };
};
