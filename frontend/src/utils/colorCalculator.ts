import type { ColorRGB, ExtData, ColorRGBA } from "@/types";
import { hexToRgb } from "./helpers";
type AnnotationType = string;
export interface ColorCalculatorParams {
  selectedCategories: Record<AnnotationType, number | null>;
  hiddenCategoryIds: Record<AnnotationType, Set<number>>;
  coloringAnnotation: AnnotationType;
  NumericThreshold: number;
  customColors: Record<AnnotationType, Record<number, string>>;
  categoryColors: Record<AnnotationType, Record<number, ColorRGB>>;
}

// get Color func
export const calculatePointColor = (
  index: number,
  extData: ExtData,
  {
    selectedCategories,
    hiddenCategoryIds,
    coloringAnnotation,
    NumericThreshold,
    customColors,
    categoryColors,
  }: {
    selectedCategories: Record<AnnotationType, number | null>;
    hiddenCategoryIds: Record<AnnotationType, Set<number>>;
    coloringAnnotation: AnnotationType;
    NumericThreshold: number;
    customColors: Record<AnnotationType, Record<number, string>>;
    categoryColors: Record<AnnotationType, Record<number, ColorRGB>>;
  },
): ColorRGBA => {
  let shouldFilter = false;
  let shouldShow = true;

  for (const annotationType in selectedCategories) {
    // if (!ANNOTATION_CONFIG.availableTypes.includes(annotationType)) continue;

    const selectedCategory =
      selectedCategories[annotationType as AnnotationType];
    if (selectedCategory !== null) {
      shouldFilter = true;

      const categoryInType = extData.annotations[annotationType]?.[index];
      if (
        categoryInType === undefined ||
        categoryInType === null ||
        Number(categoryInType) !== selectedCategory
      ) {
        shouldShow = false;
        break;
      }
    }
  }

  if (shouldFilter && !shouldShow) {
    return [0, 0, 0, 5];
  }

  // 2. check hiddenCategoryIds
  let shouldHide = false;

  for (const annotationType in extData.annotations) {
    const categoryInType = extData.annotations[annotationType]?.[index];
    if (
      categoryInType !== undefined &&
      categoryInType !== null &&
      (annotationType as AnnotationType) in hiddenCategoryIds &&
      hiddenCategoryIds[annotationType as AnnotationType] &&
      hiddenCategoryIds[annotationType as AnnotationType].has(
        Number(categoryInType),
      )
    ) {
      shouldHide = true;
      break;
    }
  }

  if (shouldHide) {
    return [0, 0, 0, 5];
  }

  // 3. numeric field coloring
  if (extData.numeric) {
    const continuounsfield = extData.numeric;
    const values = continuounsfield.values;
    const min = continuounsfield.ContinuousConfig.Min;
    const max = continuounsfield.ContinuousConfig.Max;
    const v = values[index];

    if (v < NumericThreshold) {
      return [0, 0, 0, 5];
    }

    const t = (v - min) / (max - min + 1e-6);
    return [
      Math.floor(255 * t),
      50,
      Math.floor(255 * (1 - t)),
      Math.floor(180 * t),
    ];
  }

  // 4. current annotation coloring
  else {
    const currentClassification = extData.annotations[coloringAnnotation];

    if (!currentClassification) {
      return [200, 200, 200, 255];
    }

    const categoryId = currentClassification[index];
    const numericCategoryId =
      categoryId !== undefined && categoryId !== null
        ? Number(categoryId)
        : null;

    // (B) customColors
    if (
      numericCategoryId !== null &&
      customColors[coloringAnnotation]?.[numericCategoryId]
    ) {
      const rgb = hexToRgb(customColors[coloringAnnotation][numericCategoryId]);
      return [...rgb, 255];
    }

    // (C) config/categoryColors
    if (
      numericCategoryId !== null &&
      categoryColors[coloringAnnotation]?.[numericCategoryId]
    ) {
      const color = categoryColors[coloringAnnotation][numericCategoryId];
      return [...color, 255];
    }

    // (D) fallback to original color

    return [200, 200, 200, 255];
  }
};
