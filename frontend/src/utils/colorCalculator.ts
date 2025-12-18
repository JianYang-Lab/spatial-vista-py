import type { ExtData, RGBAColor } from "../types";
import { hexToRgb } from "./helpers";
type AnnotationType = string;
export interface ColorCalculatorParams {
  selectedCategories: Record<AnnotationType, number | null>;
  hiddenCategoryIds: Record<AnnotationType, Set<number>>;
  coloringAnnotation: AnnotationType;
  logpThreshold: number;
  customColors: Record<AnnotationType, Record<number, string>>;
  categoryColors: Record<
    AnnotationType,
    Record<number, [number, number, number]>
  >;
}

// get Color func
export const calculatePointColor = (
  index: number,
  extData: ExtData,
  {
    selectedCategories,
    hiddenCategoryIds,
    coloringAnnotation,
    logpThreshold,
    customColors,
    categoryColors,
  }: {
    selectedCategories: Record<AnnotationType, number | null>;
    hiddenCategoryIds: Record<AnnotationType, Set<number>>;
    coloringAnnotation: AnnotationType;
    logpThreshold: number;
    customColors: Record<AnnotationType, Record<number, string>>;
    categoryColors: Record<
      AnnotationType,
      Record<number, [number, number, number]>
    >;
  },
): RGBAColor => {
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
    return [0, 0, 0, 0];
  }

  // 3. use trait logp
  if (extData?.logPs) {
    const logp = extData.logPs[index];
    if (logp < logpThreshold) {
      return [0, 0, 0, 5];
    }
    if (extData.minLogP === null || extData.maxLogP === null) {
      return [0, 0, 0, 255];
    }
    const t = (logp - extData.minLogP) / (extData.maxLogP - extData.minLogP);
    return [
      Math.floor(255 * t),
      50,
      Math.floor(255 * (1 - t)),
      Math.floor(150 * t),
    ];
  }

  // 4. current annotation coloring
  else {
    const currentClassification = extData.annotations[coloringAnnotation];

    // (A) 没有 annotation → 直接用 LAZ 原始颜色
    if (!currentClassification) {
      const i = index * 4;
      return [
        extData.originalColor[i],
        extData.originalColor[i + 1],
        extData.originalColor[i + 2],
        extData.originalColor[i + 3] ?? 255,
      ];
    }

    const categoryId = currentClassification[index];
    const numericCategoryId =
      categoryId !== undefined && categoryId !== null
        ? Number(categoryId)
        : null;

    // (B) customColors 优先
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

    // (D) ⭐ 关键：默认 annotation → fallback 到 LAZ 原始 RGBA
    const i = index * 4;
    return [
      extData.originalColor[i],
      extData.originalColor[i + 1],
      extData.originalColor[i + 2],
      extData.originalColor[i + 3] ?? 255,
    ];
  }
};
