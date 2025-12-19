import { LASWorkerLoader } from "@loaders.gl/las";
// import type { AnnotationType } from "../config/annotations";
export type LASMesh = (typeof LASWorkerLoader)["dataType"];
export type RGBAColor = [number, number, number, number];
export type LayoutMode = "3d" | "2d-treemap" | "2d-histogram";
export type AnnotationType = string;
// 基础颜色类型
export type ColorRGB = [number, number, number];
export type ColorRGBA = [number, number, number, number];
export type ColorHex = string;

// 颜色值的联合类型
export type ColorValue = ColorRGB | ColorRGBA | ColorHex;

// 通用的颜色映射类型 - 使用泛型
export type ColorMap<T = ColorValue> = Record<number, T>;
export type AnnotationColorMap<T = ColorValue> = Record<
  AnnotationType,
  ColorMap<T>
>;

// 具体的颜色映射类型别名
export type CategoryColors = Record<
  AnnotationType,
  Record<number, [number, number, number]>
>;
export type CustomColors = Record<AnnotationType, Record<number, string>>;
export type SelectedCategories = Record<AnnotationType, number | null>;
export type HiddenCategoryIds = Record<AnnotationType, Set<number>>;
export type AnnotationData = Record<AnnotationType, Uint8Array | null>;

export interface ColorParams {
  categoryColors: CategoryColors;
  customColors: CustomColors;
  selectedCategories: Record<AnnotationType, number | null>;
  hiddenCategoryIds: Record<AnnotationType, Set<number>>;
  coloringAnnotation: AnnotationType;
}

export interface LoadedDataHeader {
  boundingBox: [[number, number, number], [number, number, number]];
  vertexCount: number;
}

export type ContinuousConfig = {
  DType: string;
  Source: string;
  Min: number;
  Max: number;
};

export type ContinuousField = {
  name: string; // e.g. "n_counts", "pct_mito"
  values: Float32Array | Uint16Array; // length = n_cells
  ContinuousConfig: ContinuousConfig;
};

export interface ExtData {
  originalColor: Uint8Array;
  numeric: ContinuousField | null;
  annotations: Record<string, Uint8Array | Uint16Array | Uint32Array | null>;
  POSITION: {
    value: Float64Array;
  };
}

export interface LoadedData {
  header: LoadedDataHeader;
  extData: ExtData;
  attributes?: {
    [key: string]: unknown; // deck.gl attributes
  };
}
