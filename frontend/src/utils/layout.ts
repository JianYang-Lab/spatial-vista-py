import type { LoadedData } from "../types";

export interface TreemapRect {
  category: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const calculateTreemapRects = (
  categories: [number, number][],
  totalWidth: number,
  totalHeight: number,
): TreemapRect[] => {
  const totalPoints = categories.reduce((sum, [_, count]) => sum + count, 0);
  const rectangles: TreemapRect[] = [];

  let currentX = 0;
  let currentY = 0;
  let remainingWidth = totalWidth;
  let remainingHeight = totalHeight;

  categories.forEach(([category, count], index) => {
    const ratio = count / totalPoints;

    if (index === categories.length - 1) {
      rectangles.push({
        category,
        x: currentX,
        y: currentY,
        width: remainingWidth,
        height: remainingHeight,
      });
    } else {
      const area = ratio * totalWidth * totalHeight;

      if (remainingWidth > remainingHeight) {
        const width = area / remainingHeight;
        rectangles.push({
          category,
          x: currentX,
          y: currentY,
          width: Math.min(width, remainingWidth),
          height: remainingHeight,
        });
        currentX += width;
        remainingWidth -= width;
      } else {
        const height = area / remainingWidth;
        rectangles.push({
          category,
          x: currentX,
          y: currentY,
          width: remainingWidth,
          height: Math.min(height, remainingHeight),
        });
        currentY += height;
        remainingHeight -= height;
      }
    }
  });

  return rectangles;
};

export const generateTreemapPositions = (
  loadedData: LoadedData,
  coloringAnnotation: string,
): Float32Array | null => {
  if (!loadedData?.extData?.POSITION) return null;

  const originalPos = loadedData.extData.POSITION.value;
  const pointCount = originalPos.length / 3;
  const treemapPos = new Float32Array(pointCount * 3);

  const extData = loadedData.extData;
  const annotationData = extData?.annotations?.[coloringAnnotation];

  if (!annotationData) return null;

  const categoryCounts = new Map<number, number>();
  const pointsByCategory = new Map<number, number[]>();

  for (let i = 0; i < pointCount; i++) {
    const category = annotationData[i];
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    if (!pointsByCategory.has(category)) {
      pointsByCategory.set(category, []);
    }
    pointsByCategory.get(category)!.push(i);
  }

  const sortedCategories = Array.from(categoryCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  );

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < pointCount; i++) {
    const x = originalPos[i * 3];
    const y = originalPos[i * 3 + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  const rectangles = calculateTreemapRects(
    sortedCategories,
    totalWidth,
    totalHeight,
  );

  rectangles.forEach(({ category, x, y, width, height }) => {
    const points = pointsByCategory.get(category) || [];
    const pointsInRect = Math.sqrt(points.length);

    points.forEach((pointIndex, i) => {
      const col = i % pointsInRect;
      const row = Math.floor(i / pointsInRect);

      treemapPos[pointIndex * 3] = minX + x + (col / pointsInRect) * width;
      treemapPos[pointIndex * 3 + 1] = minY + y + (row / pointsInRect) * height;
      treemapPos[pointIndex * 3 + 2] = (Math.random() - 0.5) * 0.01;
    });
  });

  return treemapPos;
};

export const generateHistogramPositions = (
  loadedData: LoadedData,
  currentTrait: string,
  coloringAnnotation: string,
): Float32Array | null => {
  if (!loadedData?.extData?.POSITION || !currentTrait) return null;

  const originalPos = loadedData.extData.POSITION.value;
  const pointCount = originalPos.length / 3;
  const histogramPos = new Float32Array(pointCount * 3);

  const extData = loadedData.extData;
  const logPs = extData?.logPs;
  const annotationData = extData?.annotations?.[coloringAnnotation];

  if (!logPs || !annotationData) return null;

  const categoryLogPs = new Map<number, number[]>();
  for (let i = 0; i < pointCount; i++) {
    const category = annotationData[i];
    const logP = logPs[i];
    if (!categoryLogPs.has(category)) {
      categoryLogPs.set(category, []);
    }
    categoryLogPs.get(category)!.push(logP);
  }

  const minLogP = extData.minLogP ? extData.minLogP : 0;
  const maxLogP = extData.maxLogP ? extData.maxLogP : 100;
  const logPRange = maxLogP - minLogP;

  const numBins = 30;
  const binWidth = logPRange / numBins;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < pointCount; i++) {
    const x = originalPos[i * 3];
    const y = originalPos[i * 3 + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;
  const binPixelWidth = totalWidth / numBins;

  const categoryColors = Array.from(categoryLogPs.keys());
  const maxCategoryHeight = totalHeight / categoryColors.length;

  categoryColors.forEach((category, categoryIndex) => {
    const bins: number[][] = Array.from({ length: numBins }, () => []);

    const pointIndicesForCategory: number[] = [];
    for (let i = 0; i < pointCount; i++) {
      if (annotationData[i] === category) {
        pointIndicesForCategory.push(i);
      }
    }

    pointIndicesForCategory.forEach((pointIndex) => {
      const logP = logPs[pointIndex];
      if (logP !== undefined && logP !== null && !isNaN(logP)) {
        const binIndex = Math.min(
          Math.max(0, Math.floor((logP - minLogP) / binWidth)),
          numBins - 1,
        );
        bins[binIndex].push(pointIndex);
      }
    });

    const maxBinCount = Math.max(1, ...bins.map((bin) => bin.length)); // 确保至少为1
    const categoryBaseY = minY + categoryIndex * maxCategoryHeight;

    bins.forEach((bin, binIndex) => {
      if (!bin || bin.length === 0) return;

      const binHeight = (bin.length / maxBinCount) * maxCategoryHeight * 0.8;
      const binX = minX + binIndex * binPixelWidth;

      bin.forEach((pointIndex, pointIdx) => {
        if (pointIndex >= 0 && pointIndex < pointCount) {
          const pointsPerRow = Math.ceil(Math.sqrt(bin.length));
          const row = Math.floor(pointIdx / pointsPerRow);
          const col = pointIdx % pointsPerRow;

          histogramPos[pointIndex * 3] =
            binX + (col / pointsPerRow) * binPixelWidth;
          histogramPos[pointIndex * 3 + 1] =
            categoryBaseY + (row / pointsPerRow) * binHeight;
          histogramPos[pointIndex * 3 + 2] = (Math.random() - 0.5) * 0.01;
        }
      });
    });
  });

  return histogramPos;
};
