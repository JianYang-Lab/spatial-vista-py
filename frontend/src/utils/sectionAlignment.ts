export type SectionTransform = {
  translateX: number;
  translateY: number;
  rotation: number;
  scale: number;
  flipX: boolean;
  flipY: boolean;
};

export type SectionTransforms = Record<number, SectionTransform>;
export type AlignmentMode = "annotation" | "outline" | "hybrid";

export const IDENTITY_SECTION_TRANSFORM: SectionTransform = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scale: 1,
  flipX: false,
  flipY: false,
};

type IntegerArray = Uint8Array | Uint16Array | Uint32Array;

const sectionCenters = (positions: Float64Array, sections: IntegerArray) => {
  const sums = new Map<number, { x: number; y: number; count: number }>();
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const current = sums.get(section) ?? { x: 0, y: 0, count: 0 };
    current.x += positions[index * 3];
    current.y += positions[index * 3 + 1];
    current.count += 1;
    sums.set(section, current);
  }
  return new Map(
    [...sums].map(([section, sum]) => [
      section,
      { x: sum.x / sum.count, y: sum.y / sum.count },
    ]),
  );
};

export const applySectionAlignment = (
  positions: Float64Array,
  sections: IntegerArray,
  transforms: SectionTransforms,
) => {
  if (positions.length / 3 !== sections.length) return positions;
  const centers = sectionCenters(positions, sections);
  const adjusted = new Float64Array(positions);

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const center = centers.get(section);
    if (!center) continue;
    const transform = transforms[section] ?? IDENTITY_SECTION_TRANSFORM;
    const angle = (transform.rotation * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x = (positions[index * 3] - center.x) * (transform.flipX ? -1 : 1);
    const y =
      (positions[index * 3 + 1] - center.y) * (transform.flipY ? -1 : 1);
    adjusted[index * 3] =
      (x * cosine - y * sine) * transform.scale +
      center.x +
      transform.translateX;
    adjusted[index * 3 + 1] =
      (x * sine + y * cosine) * transform.scale +
      center.y +
      transform.translateY;
  }
  return adjusted;
};

type Point = { x: number; y: number };

const mean = (points: Point[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

const annotationLandmarks = (
  positions: Float64Array,
  sections: IntegerArray,
  annotations: IntegerArray | null,
  activeSection: number,
  referenceSection: number,
) => {
  if (!annotations) return { active: [], reference: [] };
  const grouped = new Map<string, { x: number; y: number; count: number }>();

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (section !== activeSection && section !== referenceSection) continue;
    const key = `${section}:${annotations[index]}`;
    const current = grouped.get(key) ?? { x: 0, y: 0, count: 0 };
    current.x += positions[index * 3];
    current.y += positions[index * 3 + 1];
    current.count += 1;
    grouped.set(key, current);
  }

  const active: Point[] = [];
  const reference: Point[] = [];
  const categoryIds = new Set<number>();
  grouped.forEach((_value, key) => categoryIds.add(Number(key.split(":")[1])));
  categoryIds.forEach((category) => {
    const activeGroup = grouped.get(`${activeSection}:${category}`);
    const referenceGroup = grouped.get(`${referenceSection}:${category}`);
    if (activeGroup && referenceGroup) {
      active.push({
        x: activeGroup.x / activeGroup.count,
        y: activeGroup.y / activeGroup.count,
      });
      reference.push({
        x: referenceGroup.x / referenceGroup.count,
        y: referenceGroup.y / referenceGroup.count,
      });
    }
  });
  return { active, reference };
};

const transformPoint = (
  point: Point,
  center: Point,
  transform: SectionTransform,
) => {
  const angle = (transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const x = (point.x - center.x) * (transform.flipX ? -1 : 1);
  const y = (point.y - center.y) * (transform.flipY ? -1 : 1);
  return {
    x:
      (x * cosine - y * sine) * transform.scale +
      center.x +
      transform.translateX,
    y:
      (x * sine + y * cosine) * transform.scale +
      center.y +
      transform.translateY,
  };
};

const extractOutline = (
  positions: Float64Array,
  sections: IntegerArray,
  sectionCode: number,
) => {
  let count = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < sections.length; index += 1) {
    if (sections[index] === sectionCode) {
      const x = positions[index * 3];
      const y = positions[index * 3 + 1];
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (count === 0) return [];
  if (count < 4) {
    const points: Point[] = [];
    for (let index = 0; index < sections.length; index += 1) {
      if (sections[index] === sectionCode) {
        points.push({ x: positions[index * 3], y: positions[index * 3 + 1] });
      }
    }
    return points;
  }

  const spanX = Math.max(maxX - minX, 1e-12);
  const spanY = Math.max(maxY - minY, 1e-12);
  const gridSize = 48;
  const cells = new Map<string, { x: number; y: number; count: number }>();
  for (let index = 0; index < sections.length; index += 1) {
    if (sections[index] !== sectionCode) continue;
    const point = { x: positions[index * 3], y: positions[index * 3 + 1] };
    const column = Math.min(
      gridSize - 1,
      Math.floor(((point.x - minX) / spanX) * gridSize),
    );
    const row = Math.min(
      gridSize - 1,
      Math.floor(((point.y - minY) / spanY) * gridSize),
    );
    const key = `${column}:${row}`;
    const cell = cells.get(key) ?? { x: 0, y: 0, count: 0 };
    cell.x += point.x;
    cell.y += point.y;
    cell.count += 1;
    cells.set(key, cell);
  }

  const boundary: Point[] = [];
  cells.forEach((cell, key) => {
    const [column, row] = key.split(":").map(Number);
    const isBoundary = [
      [column - 1, row],
      [column + 1, row],
      [column, row - 1],
      [column, row + 1],
    ].some(
      ([neighborColumn, neighborRow]) =>
        !cells.has(`${neighborColumn}:${neighborRow}`),
    );
    if (isBoundary) {
      boundary.push({ x: cell.x / cell.count, y: cell.y / cell.count });
    }
  });

  const maxPoints = 320;
  if (boundary.length <= maxPoints) return boundary;
  const sampled: Point[] = [];
  const stride = boundary.length / maxPoints;
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(boundary[Math.floor(index * stride)]);
  }
  return sampled;
};

const nearestSquaredDistance = (point: Point, targets: Point[]) => {
  let closest = Number.POSITIVE_INFINITY;
  targets.forEach((target) => {
    const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
    if (distance < closest) closest = distance;
  });
  return closest;
};

const annotationFit = (
  activePoints: Point[],
  referencePoints: Point[],
  activeCenter: Point,
  allowScale: boolean,
): SectionTransform | null => {
  if (activePoints.length === 0) return null;

  const targetMean = mean(referencePoints);

  const fitCandidate = (flipX: boolean, flipY: boolean) => {
    const reflected = activePoints.map((point) => ({
      x: activeCenter.x + (point.x - activeCenter.x) * (flipX ? -1 : 1),
      y: activeCenter.y + (point.y - activeCenter.y) * (flipY ? -1 : 1),
    }));
    const reflectedMean = mean(reflected);
    let rotation = 0;
    let scale = 1;

    if (reflected.length >= 2) {
      let a = 0;
      let b = 0;
      let denominator = 0;
      for (let index = 0; index < reflected.length; index += 1) {
        const sx = reflected[index].x - reflectedMean.x;
        const sy = reflected[index].y - reflectedMean.y;
        const tx = referencePoints[index].x - targetMean.x;
        const ty = referencePoints[index].y - targetMean.y;
        a += sx * tx + sy * ty;
        b += sx * ty - sy * tx;
        denominator += sx * sx + sy * sy;
      }
      rotation = Math.atan2(b, a);
      if (allowScale && denominator > 1e-12) {
        scale = Math.min(2, Math.max(0.5, Math.hypot(a, b) / denominator));
      }
    }

    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const sourceOffsetX = reflectedMean.x - activeCenter.x;
    const sourceOffsetY = reflectedMean.y - activeCenter.y;
    const transformedMeanX =
      (sourceOffsetX * cosine - sourceOffsetY * sine) * scale + activeCenter.x;
    const transformedMeanY =
      (sourceOffsetX * sine + sourceOffsetY * cosine) * scale + activeCenter.y;
    const translateX = targetMean.x - transformedMeanX;
    const translateY = targetMean.y - transformedMeanY;
    const error = reflected.reduce((sum, point, index) => {
      const offsetX = point.x - activeCenter.x;
      const offsetY = point.y - activeCenter.y;
      const x =
        (offsetX * cosine - offsetY * sine) * scale +
        activeCenter.x +
        translateX;
      const y =
        (offsetX * sine + offsetY * cosine) * scale +
        activeCenter.y +
        translateY;
      return (
        sum +
        (x - referencePoints[index].x) ** 2 +
        (y - referencePoints[index].y) ** 2
      );
    }, 0);

    return {
      transform: {
        translateX,
        translateY,
        rotation: (rotation * 180) / Math.PI,
        scale,
        flipX,
        flipY,
      },
      error,
    };
  };

  const candidates = [
    fitCandidate(false, false),
    fitCandidate(true, false),
    fitCandidate(false, true),
    fitCandidate(true, true),
  ];
  return candidates.reduce((best, candidate) =>
    candidate.error < best.error - 1e-9 ? candidate : best,
  ).transform;
};

const outlineFit = (
  activeOutline: Point[],
  referenceOutline: Point[],
  activeLandmarks: Point[],
  referenceLandmarks: Point[],
  activeCenter: Point,
  referenceCenter: Point,
  mode: Exclude<AlignmentMode, "annotation">,
  annotationWeight: number,
  allowScale: boolean,
) => {
  if (activeOutline.length === 0 || referenceOutline.length === 0) return null;
  const referenceXs = referenceOutline.map((point) => point.x);
  const referenceYs = referenceOutline.map((point) => point.y);
  const diagonalSquared = Math.max(
    (Math.max(...referenceXs) - Math.min(...referenceXs)) ** 2 +
      (Math.max(...referenceYs) - Math.min(...referenceYs)) ** 2,
    1e-12,
  );
  const rmsRadius = (points: Point[], center: Point) =>
    Math.sqrt(
      points.reduce(
        (sum, point) =>
          sum + (point.x - center.x) ** 2 + (point.y - center.y) ** 2,
        0,
      ) / points.length,
    );
  const activeRadius = rmsRadius(activeOutline, activeCenter);
  const referenceRadius = rmsRadius(referenceOutline, referenceCenter);
  const scale =
    allowScale && activeRadius > 1e-12
      ? Math.min(2, Math.max(0.5, referenceRadius / activeRadius))
      : 1;
  const hasLandmarks = activeLandmarks.length > 0;
  const landmarkWeight =
    mode === "hybrid" && hasLandmarks
      ? Math.min(1, Math.max(0, annotationWeight))
      : 0;
  const activeLandmarkMean = hasLandmarks
    ? mean(activeLandmarks)
    : activeCenter;
  const referenceLandmarkMean = hasLandmarks
    ? mean(referenceLandmarks)
    : referenceCenter;

  const scoreCandidate = (flipX: boolean, flipY: boolean, rotation: number) => {
    const base: SectionTransform = {
      translateX: 0,
      translateY: 0,
      rotation,
      scale,
      flipX,
      flipY,
    };
    const transformedLandmarkMean = transformPoint(
      activeLandmarkMean,
      activeCenter,
      base,
    );
    const outlineTranslation = {
      x: referenceCenter.x - activeCenter.x,
      y: referenceCenter.y - activeCenter.y,
    };
    const landmarkTranslation = {
      x: referenceLandmarkMean.x - transformedLandmarkMean.x,
      y: referenceLandmarkMean.y - transformedLandmarkMean.y,
    };
    const transform = {
      ...base,
      translateX:
        outlineTranslation.x * (1 - landmarkWeight) +
        landmarkTranslation.x * landmarkWeight,
      translateY:
        outlineTranslation.y * (1 - landmarkWeight) +
        landmarkTranslation.y * landmarkWeight,
    };
    const transformedOutline = activeOutline.map((point) =>
      transformPoint(point, activeCenter, transform),
    );
    const forward = transformedOutline.reduce(
      (sum, point) => sum + nearestSquaredDistance(point, referenceOutline),
      0,
    );
    const backward = referenceOutline.reduce(
      (sum, point) => sum + nearestSquaredDistance(point, transformedOutline),
      0,
    );
    const outlineError =
      (forward / transformedOutline.length +
        backward / referenceOutline.length) /
      (2 * diagonalSquared);
    const landmarkError = hasLandmarks
      ? activeLandmarks.reduce((sum, point, index) => {
          const transformed = transformPoint(point, activeCenter, transform);
          return (
            sum +
            (transformed.x - referenceLandmarks[index].x) ** 2 +
            (transformed.y - referenceLandmarks[index].y) ** 2
          );
        }, 0) /
        activeLandmarks.length /
        diagonalSquared
      : 0;
    return {
      transform,
      error:
        outlineError * (1 - landmarkWeight) + landmarkError * landmarkWeight,
    };
  };

  const flips = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const;
  let best = scoreCandidate(false, false, 0);
  flips.forEach(([flipX, flipY]) => {
    for (let rotation = -180; rotation < 180; rotation += 12) {
      const candidate = scoreCandidate(flipX, flipY, rotation);
      if (candidate.error < best.error) best = candidate;
    }
  });
  for (const step of [2, 0.5]) {
    const centerRotation = best.transform.rotation;
    for (
      let rotation = centerRotation - step * 6;
      rotation <= centerRotation + step * 6;
      rotation += step
    ) {
      const candidate = scoreCandidate(
        best.transform.flipX,
        best.transform.flipY,
        rotation,
      );
      if (candidate.error < best.error) best = candidate;
    }
  }
  return best.transform;
};

export const suggestSectionAlignment = (
  positions: Float64Array,
  sections: IntegerArray,
  annotations: IntegerArray | null,
  activeSection: number,
  referenceSection: number,
  allowScale = false,
  mode: AlignmentMode = "annotation",
  annotationWeight = 0.5,
): SectionTransform | null => {
  const sectionCenterMap = sectionCenters(positions, sections);
  const activeCenter = sectionCenterMap.get(activeSection);
  const referenceCenter = sectionCenterMap.get(referenceSection);
  if (!activeCenter || !referenceCenter) return null;
  const landmarks = annotationLandmarks(
    positions,
    sections,
    annotations,
    activeSection,
    referenceSection,
  );
  if (mode === "annotation") {
    return annotationFit(
      landmarks.active,
      landmarks.reference,
      activeCenter,
      allowScale,
    );
  }
  return outlineFit(
    extractOutline(positions, sections, activeSection),
    extractOutline(positions, sections, referenceSection),
    landmarks.active,
    landmarks.reference,
    activeCenter,
    referenceCenter,
    mode,
    annotationWeight,
    allowScale,
  );
};
