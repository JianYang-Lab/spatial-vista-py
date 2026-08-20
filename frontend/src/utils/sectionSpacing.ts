export type SectionSpacingMode = "multiplier" | "fixed";

export const applySectionSpacing = (
  positions: Float64Array,
  sections: Uint8Array | Uint16Array | Uint32Array,
  mode: SectionSpacingMode,
  value: number,
): Float64Array => {
  if (
    (mode === "multiplier" && value === 1) ||
    positions.length / 3 !== sections.length
  ) {
    return positions;
  }

  const sums = new Map<number, { sum: number; count: number }>();
  let globalZ = 0;

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const z = positions[index * 3 + 2];
    const current = sums.get(section) ?? { sum: 0, count: 0 };
    current.sum += z;
    current.count += 1;
    sums.set(section, current);
    globalZ += z;
  }

  const globalCenter = globalZ / sections.length;
  const centers = new Map<number, number>();
  sums.forEach(({ sum, count }, section) => {
    centers.set(section, sum / count);
  });

  const fixedCenters = new Map<number, number>();
  if (mode === "fixed") {
    const orderedSections = [...centers.entries()]
      .sort(([sectionA, centerA], [sectionB, centerB]) =>
        centerA === centerB ? sectionA - sectionB : centerA - centerB,
      )
      .map(([section]) => section);
    const middle = (orderedSections.length - 1) / 2;
    orderedSections.forEach((section, index) => {
      fixedCenters.set(section, globalCenter + (index - middle) * value);
    });
  }

  const adjusted = new Float64Array(positions);
  for (let index = 0; index < sections.length; index += 1) {
    const offset = index * 3 + 2;
    const sectionCenter = centers.get(sections[index]) ?? globalCenter;
    const withinSectionZ = positions[offset] - sectionCenter;
    const targetCenter =
      mode === "fixed"
        ? (fixedCenters.get(sections[index]) ?? sectionCenter)
        : globalCenter + (sectionCenter - globalCenter) * value;
    adjusted[offset] = targetCenter + withinSectionZ;
  }

  return adjusted;
};
