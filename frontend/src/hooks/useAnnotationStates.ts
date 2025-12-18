import { useState, useCallback, useMemo, useEffect } from "react";
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

type AnnotationType = string;

export interface UseAnnotationStatesReturn {
  coloringAnnotation: AnnotationType | null;
  selectedCategories: SelectedCategories;
  hiddenCategoryIds: HiddenCategoryIds;
  categoryColors: CategoryColors;
  customColors: CustomColors;

  setColoringAnnotation: (type: AnnotationType) => void;
  setSelectedCategories: (categories: SelectedCategories) => void;
  setHiddenCategoryIds: (hiddenIds: HiddenCategoryIds) => void;
  setCategoryColors: (colors: CategoryColors) => void;
  setCustomColors: (colors: CustomColors) => void;
  setAnnotationForColoring: (type: AnnotationType) => void;

  pieChartProps: ChartProps | null;
  logpBarChartProps: LogpBarChartProps | null;
  colorParams: ColorParams;
}

export const useAnnotationStates = (
  loadedData: LoadedData,
  annotationConfig: any | null,
): UseAnnotationStatesReturn => {
  /* ----------------------------
   * 1. coloring annotation
   * ---------------------------- */
  const [coloringAnnotation, setColoringAnnotation] =
    useState<AnnotationType | null>(null);

  useEffect(() => {
    if (!annotationConfig) return;

    const { DefaultAnnoType, AvailableAnnoTypes } = annotationConfig;
    setColoringAnnotation(DefaultAnnoType);
    // if (AvailableAnnoTypes.includes(DefaultAnnoType)) {
    //   setColoringAnnotation(DefaultAnnoType);
    // } else {
    //   console.warn(
    //     "[SpatialVista] DefaultAnnoType not in AvailableAnnoTypes, fallback:",
    //     DefaultAnnoType,
    //     "→",
    //     AvailableAnnoTypes[0],
    //   );
    //   setColoringAnnotation(AvailableAnnoTypes[0] ?? null);
    // }
  }, [annotationConfig]);

  /* ----------------------------
   * 2. selectedCategories
   * ---------------------------- */
  const [selectedCategories, setSelectedCategories] =
    useState<SelectedCategories>({});

  useEffect(() => {
    if (!annotationConfig) return;
    const initial: SelectedCategories = {};
    annotationConfig.AvailableAnnoTypes.forEach((t: string) => {
      initial[t] = null;
    });
    setSelectedCategories(initial);
  }, [annotationConfig]);

  /* ----------------------------
   * 3. hiddenCategoryIds
   * ---------------------------- */
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<HiddenCategoryIds>(
    {},
  );

  useEffect(() => {
    if (!annotationConfig) return;
    const initial: HiddenCategoryIds = {};
    annotationConfig.AvailableAnnoTypes.forEach((t: string) => {
      initial[t] = new Set();
    });
    setHiddenCategoryIds(initial);
  }, [annotationConfig]);

  /* ----------------------------
   * 4. categoryColors（来自 config）
   * ---------------------------- */
  const [categoryColors, setCategoryColors] = useState<CategoryColors>({});

  useEffect(() => {
    if (!annotationConfig) return;

    const colors: CategoryColors = {};
    for (const anno of annotationConfig.AvailableAnnoTypes) {
      const items = annotationConfig.AnnoMaps[anno]?.Items ?? [];
      const cmap: Record<number, [number, number, number]> = {};
      for (const item of items) {
        if (item.Color) {
          cmap[item.Code] = item.Color;
        }
      }
      colors[anno] = cmap;
    }
    setCategoryColors(colors);
  }, [annotationConfig]);

  useEffect(() => {
    if (!annotationConfig) return;
    if (!loadedData?.extData?.annotations) return;

    const ext = loadedData.extData;
    const anns = ext.annotations;
    const colors: CategoryColors = {};

    for (const anno of annotationConfig.AvailableAnnoTypes) {
      const items = annotationConfig.AnnoMaps?.[anno]?.Items ?? [];
      const cmap: Record<number, [number, number, number]> = {};

      const hasExplicitColor = items.some((it: any) => it.Color != null);

      if (hasExplicitColor) {
        for (const it of items) {
          if (it.Color) cmap[it.Code] = it.Color;
        }
      } else if (anns[anno] && ext.originalColor) {
        const ids = anns[anno] as Uint8Array | Uint16Array;
        const oc = ext.originalColor;

        for (let i = 0; i < ids.length; i++) {
          const code = ids[i];
          if (cmap[code]) continue;
          const j = i * 4;
          cmap[code] = [oc[j], oc[j + 1], oc[j + 2]];
          if (Object.keys(cmap).length >= items.length) break;
        }
      }

      colors[anno] = cmap;
    }

    setCategoryColors(colors);
  }, [annotationConfig, loadedData]);

  /* ----------------------------
   * 5. customColors（用户覆盖）
   * ---------------------------- */
  const [customColors, setCustomColors] = useState<CustomColors>({});

  useEffect(() => {
    if (!annotationConfig) return;
    const initial: CustomColors = {};
    annotationConfig.AvailableAnnoTypes.forEach((t: string) => {
      initial[t] = {};
    });
    setCustomColors(initial);
  }, [annotationConfig]);

  /* ----------------------------
   * 6. 切换 annotation
   * ---------------------------- */
  const setAnnotationForColoring = useCallback(
    (type: AnnotationType) => {
      if (!loadedData?.extData?.annotations?.[type]) return;
      setColoringAnnotation(type);
      setSelectedCategories((prev) => ({
        ...prev,
        [type]: null,
      }));
    },
    [loadedData],
  );

  /* ----------------------------
   * 7. colorParams（deck.gl）
   * ---------------------------- */
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

  /* ----------------------------
   * 8. Pie chart
   * ---------------------------- */

  /* ----------------------------
   * 9. LogP bar chart
   * ---------------------------- */

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
    colorParams,
  };
};
