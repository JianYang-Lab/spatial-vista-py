// Run with: npx esbuild tests/gsmap_colors.test.ts --bundle --platform=node
//   --outfile=/tmp/spatialvista-colors.cjs && node /tmp/spatialvista-colors.cjs
import assert from "node:assert/strict";
import { calculatePointColor } from "../src/utils/colorCalculator";

const params = {
  selectedCategories: {},
  hiddenCategoryIds: {},
  coloringAnnotation: "celltype",
  NumericThreshold: 0,
  customColors: {},
  categoryColors: { celltype: { 0: [12, 34, 56] as [number, number, number] } },
};
const data: any = {
  annotations: { celltype: new Uint8Array([0, 0, 0]) },
  POSITION: { value: new Float64Array(9) },
  numeric: {
    name: "trait",
    values: new Float32Array([0, 3, NaN]),
    ContinuousConfig: { Source: "gsmap", Min: 0, Max: 3, DType: "float32" },
  },
};
assert.deepEqual(calculatePointColor(2, data, params), [0, 0, 0, 0]);
assert.deepEqual(calculatePointColor(1, data, params), [255, 50, 0, 180]);
data.numeric.values = new Float32Array([0, 0, 0]);
data.numeric.ContinuousConfig.Max = 0;
const constant = calculatePointColor(0, data, params);
assert.ok(constant.every(Number.isFinite));
assert.ok(constant[3] > 0, "Constant traits must not disappear");
data.numeric = null;
const categorical = calculatePointColor(0, data, params);
assert.deepEqual(categorical.slice(0, 3), [12, 34, 56]);
console.log("4 color checks passed: NaN, maximum, constant, annotation");
