import { median } from "simple-statistics";

export const hexToRgb = (hex: string): [number, number, number] => {
  hex = hex.replace(/^#/, "");

  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return [r, g, b];
};

export const calculateMedian = (values: number[]): number => {
  return median(values);
};

export function parseContinuousArray(dv: DataView, dtype: string) {
  switch (dtype) {
    case "float32":
      return new Float32Array(dv.buffer, dv.byteOffset, dv.byteLength / 4);
    case "float16":
      return new Uint16Array(dv.buffer, dv.byteOffset, dv.byteLength / 2);
    case "uint16":
      return new Uint16Array(dv.buffer, dv.byteOffset, dv.byteLength / 2);
    default:
      throw new Error(`Unsupported DType: ${dtype}`);
  }
}

export function decodeFloat16(input: Uint16Array): Float32Array {
  const output = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) {
    const h = input[i];

    const sign = (h & 0x8000) >> 15;
    const exp = (h & 0x7c00) >> 10;
    const frac = h & 0x03ff;

    let val: number;

    if (exp === 0) {
      // subnormal or zero
      if (frac === 0) {
        val = 0;
      } else {
        // subnormal number
        val = Math.pow(2, -14) * (frac / 1024);
      }
    } else if (exp === 31) {
      // Inf or NaN
      val = frac === 0 ? Infinity : NaN;
    } else {
      // normal number
      val = Math.pow(2, exp - 15) * (1 + frac / 1024);
    }

    output[i] = sign ? -val : val;
  }

  return output;
}
