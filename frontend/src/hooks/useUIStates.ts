import { useState } from "react";
import type { SectionSpacingMode } from "@/utils/sectionSpacing";

export interface UseUIStatesReturn {
  // Dialog states
  continuousOpen: boolean;
  colorPickerOpen: boolean;

  // Display states
  showPointCloud: boolean;
  showScatterplot: boolean;

  // Point controls
  pointSize: number;
  pointOpacity: number;
  sectionSpacing: number;
  sectionSpacingMode: SectionSpacingMode;
  fixedSectionSpacing: number;
  numericThreshold: number;

  // Actions
  setContinuousOpen: (open: boolean) => void;
  setColorPickerOpen: (open: boolean) => void;
  setshowPointCloud: (show: boolean) => void;
  setShowScatterplot: (show: boolean) => void;
  setPointSize: (size: number) => void;
  setPointOpacity: (opacity: number) => void;
  setSectionSpacing: (spacing: number) => void;
  setSectionSpacingMode: (mode: SectionSpacingMode) => void;
  setFixedSectionSpacing: (spacing: number) => void;
  setNumericThreshold: (threshold: number) => void;
}

export const useUIStates = (): UseUIStatesReturn => {
  // Dialog states
  const [continuousOpen, setContinuousOpen] = useState<boolean>(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<boolean>(false);

  // Display states
  const [showPointCloud, setshowPointCloud] = useState<boolean>(true);
  const [showScatterplot, setShowScatterplot] = useState<boolean>(false);

  // Point controls
  const [pointSize, setPointSize] = useState<number>(1);
  const [pointOpacity, setPointOpacity] = useState<number>(1);
  const [sectionSpacing, setSectionSpacing] = useState<number>(1);
  const [sectionSpacingMode, setSectionSpacingMode] =
    useState<SectionSpacingMode>("multiplier");
  const [fixedSectionSpacing, setFixedSectionSpacing] = useState<number>(100);
  const [numericThreshold, setNumericThreshold] = useState<number>(0);

  return {
    continuousOpen,
    colorPickerOpen,
    showPointCloud,
    showScatterplot,
    pointSize,
    pointOpacity,
    sectionSpacing,
    sectionSpacingMode,
    fixedSectionSpacing,
    numericThreshold,
    setContinuousOpen,
    setColorPickerOpen,
    setshowPointCloud,
    setShowScatterplot,
    setPointSize,
    setPointOpacity,
    setSectionSpacing,
    setSectionSpacingMode,
    setFixedSectionSpacing,
    setNumericThreshold,
  };
};
