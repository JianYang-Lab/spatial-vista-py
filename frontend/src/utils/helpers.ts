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
