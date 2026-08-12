import type { Viewport } from "@deck.gl/core";
import type { ExtData } from "@/types";
import type { ColorCalculatorParams } from "@/utils/colorCalculator";

export type ScreenPoint = {
  x: number;
  y: number;
};

type LassoSelectionParams = {
  polygon: ScreenPoint[];
  viewport: Viewport;
  extData: ExtData;
  colorParams: ColorCalculatorParams;
};

const pointInPolygon = (point: ScreenPoint, polygon: ScreenPoint[]) => {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const getPolygonBounds = (polygon: ScreenPoint[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, minY, maxX, maxY };
};

export const isPointVisibleForSelection = (
  index: number,
  extData: ExtData,
  {
    selectedCategories,
    hiddenCategoryIds,
    NumericThreshold,
  }: ColorCalculatorParams,
) => {
  for (const annotationType in selectedCategories) {
    const selectedCategory = selectedCategories[annotationType];

    if (selectedCategory !== null) {
      const categoryInType = extData.annotations[annotationType]?.[index];

      if (
        categoryInType === undefined ||
        categoryInType === null ||
        Number(categoryInType) !== selectedCategory
      ) {
        return false;
      }
    }
  }

  for (const annotationType in extData.annotations) {
    const categoryInType = extData.annotations[annotationType]?.[index];

    if (
      categoryInType !== undefined &&
      categoryInType !== null &&
      hiddenCategoryIds[annotationType]?.has(Number(categoryInType))
    ) {
      return false;
    }
  }

  if (extData.numeric) {
    const v = extData.numeric.values[index];

    if (typeof v === "number" && v < NumericThreshold) {
      return false;
    }
  }

  return true;
};

export const getLassoSelectedIndices = ({
  polygon,
  viewport,
  extData,
  colorParams,
}: LassoSelectionParams) => {
  if (polygon.length < 3 || !extData.POSITION?.value) {
    return [];
  }

  const positions = extData.POSITION.value;
  const { minX, minY, maxX, maxY } = getPolygonBounds(polygon);
  const selected: number[] = [];
  const count = Math.floor(positions.length / 3);
  const viewportX = viewport.x ?? 0;
  const viewportY = viewport.y ?? 0;

  for (let index = 0; index < count; index += 1) {
    if (!isPointVisibleForSelection(index, extData, colorParams)) {
      continue;
    }

    const offset = index * 3;
    const projected = viewport.project([
      positions[offset],
      positions[offset + 1],
      positions[offset + 2],
    ]);

    const point = {
      x: projected[0] + viewportX,
      y: projected[1] + viewportY,
    };

    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < minX ||
      point.x > maxX ||
      point.y < minY ||
      point.y > maxY
    ) {
      continue;
    }

    if (pointInPolygon(point, polygon)) {
      selected.push(index);
    }
  }

  return selected;
};
