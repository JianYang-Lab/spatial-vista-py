import { useState, useCallback, useMemo } from "react";
import type { AnnotationType } from "../config/annotations";
import { ANNOTATION_CONFIG } from "../config/annotations";
import { hexToRgb } from "../utils/helpers";
import type {
  CategoryColors,
  ChartProps,
  ColorParams,
  CustomColors,
  HiddenCategoryIds,
  LoadedData,
  LogpBarChartProps,
  SelectedCategories,
} from "../types";

export interface UseAnnotationStatesReturn {
  // States
  coloringAnnotation: AnnotationType;
  selectedCategories: SelectedCategories;
  hiddenCategoryIds: HiddenCategoryIds;
  categoryColors: CategoryColors;
  customColors: CustomColors;

  // Actions
  setColoringAnnotation: (type: AnnotationType) => void;
  setSelectedCategories: (categories: SelectedCategories) => void;
  setHiddenCategoryIds: (hiddenIds: HiddenCategoryIds) => void;
  setCategoryColors: (colors: CategoryColors) => void;
  setCustomColors: (colors: CustomColors) => void;
  setAnnotationForColoring: (type: AnnotationType) => void;

  // Computed values for charts
  pieChartProps: ChartProps;
  logpBarChartProps: LogpBarChartProps;
  colorParams: ColorParams;
}

export const useAnnotationStates = (
  loadedData: LoadedData,
  currentTrait: string | null,
): UseAnnotationStatesReturn => {
  // Currently used annotation type for coloring
  const [coloringAnnotation, setColoringAnnotation] = useState<AnnotationType>(
    ANNOTATION_CONFIG.defaultType,
  );

  const [selectedCategories, setSelectedCategories] = useState<
    Record<AnnotationType, number | null>
  >(() => {
    const initial: Record<string, number | null> = {};
    ANNOTATION_CONFIG.availableTypes.forEach((type) => {
      initial[type] = null;
    });
    return initial;
  });

  // Hidden category ids for each annotation type
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<
    Record<AnnotationType, Set<number>>
  >(() => {
    const initial: Record<string, Set<number>> = {};
    ANNOTATION_CONFIG.availableTypes.forEach((type) => {
      initial[type] = new Set();
    });
    return initial;
  });

  // Color map for each annotation type
  const [categoryColors, setCategoryColors] = useState<
    Record<AnnotationType, Record<number, [number, number, number]>>
  >(ANNOTATION_CONFIG.defaultColormap);

  // User custom colors for categories
  const [customColors, setCustomColors] = useState<
    Record<AnnotationType, Record<number, string>>
  >(() => {
    const initial: Record<string, Record<number, string>> = {};
    ANNOTATION_CONFIG.availableTypes.forEach((type) => {
      initial[type] = {};
    });
    return initial;
  });

  // Coloring by selected annotation type
  const setAnnotationForColoring = useCallback(
    (type: AnnotationType) => {
      // Ensure data loaded
      if (!loadedData.extData.annotations[type]) {
        return;
      }

      // Set
      setColoringAnnotation(type);
      setSelectedCategories((prev) => ({
        ...prev,
        [type]: null,
      }));
    },
    [loadedData],
  );

  // Color params for deck layers
  const colorParams = useMemo(
    () => ({
      selectedCategories,
      hiddenCategoryIds,
      coloringAnnotation,
      customColors,
      categoryColors,
    }),
    [
      selectedCategories,
      hiddenCategoryIds,
      coloringAnnotation,
      customColors,
      categoryColors,
    ],
  );

  // Pie chart props
  const pieChartProps = useMemo(() => {
    return {
      annotationType: coloringAnnotation,
      annotationMap: ANNOTATION_CONFIG.annotationMaps[coloringAnnotation] || {},
      // If customColors exist, use it to override categoryColors
      colormap: {
        ...categoryColors[coloringAnnotation],
        ...Object.fromEntries(
          Object.entries(customColors[coloringAnnotation]).map(([k, v]) => [
            Number(k),
            hexToRgb(v),
          ]),
        ),
      },
      hiddenCategoryIds: hiddenCategoryIds,
      selectedCategory: selectedCategories[coloringAnnotation],
      data: loadedData,
    };
  }, [
    coloringAnnotation,
    hiddenCategoryIds,
    selectedCategories,
    loadedData,
    categoryColors,
    customColors,
  ]);

  // LogP bar chart props
  const logpBarChartProps = useMemo(() => {
    return {
      annotationType: coloringAnnotation,
      annotationMap: ANNOTATION_CONFIG.annotationMaps[coloringAnnotation] || {},
      colormap: {
        ...categoryColors[coloringAnnotation],
        ...Object.fromEntries(
          Object.entries(customColors[coloringAnnotation]).map(([k, v]) => [
            Number(k),
            hexToRgb(v),
          ]),
        ),
      },
      hiddenCategoryIds: hiddenCategoryIds,
      selectedCategory: selectedCategories[coloringAnnotation],
      currentTrait: currentTrait,
      data: loadedData,
    };
  }, [
    coloringAnnotation,
    hiddenCategoryIds,
    selectedCategories,
    currentTrait,
    loadedData,
    categoryColors,
    customColors,
  ]);

  return {
    coloringAnnotation,
    selectedCategories,
    hiddenCategoryIds,
    categoryColors,
    customColors,
    setColoringAnnotation,
    setSelectedCategories,
    setHiddenCategoryIds,
    setCategoryColors,
    setCustomColors,
    setAnnotationForColoring,
    pieChartProps,
    logpBarChartProps,
    colorParams,
  };
};
