import { useState } from "react";

export interface UseUIStatesReturn {
  // Dialog states
  continuousOpen: boolean;
  annotationOpen: boolean;
  colorPickerOpen: boolean;

  // Display states
  showPointCloud: boolean;
  showScatterplot: boolean;

  // Point controls
  pointSize: number;
  pointOpacity: number;
  NumericThreshold: number;

  // Actions
  setContinuousOpen: (open: boolean) => void;
  setAnnotationOpen: (open: boolean) => void;
  setColorPickerOpen: (open: boolean) => void;
  setshowPointCloud: (show: boolean) => void;
  setShowScatterplot: (show: boolean) => void;
  setPointSize: (size: number) => void;
  setPointOpacity: (opacity: number) => void;
  setNumericThreshold: (threshold: number) => void;
}

export const useUIStates = (): UseUIStatesReturn => {
  // Dialog states
  const [continuousOpen, setContinuousOpen] = useState<boolean>(false);
  const [annotationOpen, setAnnotationOpen] = useState<boolean>(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<boolean>(false);

  // Display states
  const [showPointCloud, setshowPointCloud] = useState<boolean>(true);
  const [showScatterplot, setShowScatterplot] = useState<boolean>(false);

  // Point controls
  const [pointSize, setPointSize] = useState<number>(1);
  const [pointOpacity, setPointOpacity] = useState<number>(1);
  const [NumericThreshold, setNumericThreshold] = useState<number>(0);

  return {
    continuousOpen,
    annotationOpen,
    colorPickerOpen,
    showPointCloud,
    showScatterplot,
    pointSize,
    pointOpacity,
    NumericThreshold,
    setContinuousOpen,
    setAnnotationOpen,
    setColorPickerOpen,
    setshowPointCloud,
    setShowScatterplot,
    setPointSize,
    setPointOpacity,
    setNumericThreshold,
  };
};
