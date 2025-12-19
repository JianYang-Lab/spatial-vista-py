import { useRef, useCallback, useEffect, useState } from "react";
import { Device } from "@luma.gl/core";

// Hooks
import { useDataManager } from "../hooks/useDataManager";
import { useDeckLayers } from "../hooks/useDeckLayers";
import { useViewStates } from "../hooks/useViewStates";
import { useAnnotationStates } from "../hooks/useAnnotationStates";
import { useUIStates } from "../hooks/useUIStates";
import { useSectionStates } from "../hooks/useSectionStates";
import { useLayoutMode } from "../hooks/useLayoutMode";

// Components
import { VisHeader } from "../components/layout/VisHeader";
import { AnnotationPanel } from "../components/layout/AnnotationPanel";
import { ControlPanel } from "../components/layout/ControlPanel";
import { VisualizationArea } from "../components/layout/VisualizationArea";
import { ContinuousSelectionDialog } from "../components/dialogs/ContinuousSelectionDialog";
import { ColorPickerDialog } from "../components/dialogs/ColorPickerDialog";

import { useWidgetModel } from "@/widget_context";

export default function Vis({
  onLoad,
  device,
}: {
  onLoad?: (data: { count: number; progress: number }) => void;
  device?: Device;
}) {
  // Refs
  const glRef = useRef<WebGLRenderingContext | null>(null);

  // UI States Hook
  const uiStates = useUIStates();

  // View States Hook
  const viewStates = useViewStates(); // Will be updated by data manager

  const model = useWidgetModel();
  // laz URL State
  const [lazUrl, setLazUrl] = useState<string | null>(null);

  // AnnotaionsConfig Hook
  const [annotationConfig, setAnnotationConfig] = useState<any | null>(null);
  const [annotationBins, setAnnotationBins] = useState<
    Record<string, Uint8Array | Uint16Array | Uint32Array>
  >({});

  // NumericFiled Hook
  type ContinuousField = {
    name: string;
    values: Float32Array;
    min: number;
    max: number;
    source: string;
  };

  const [continuousFields, setContinuousFields] = useState<
    Record<string, ContinuousField>
  >({});

  const [activeContinuous, setActiveContinuous] = useState<string | null>(null);
  useEffect(() => {
    if (!model) return;

    const traits = model.get("continuous_traits");
    const bins = model.get("continuous_bins");

    if (!traits || !bins) return;

    const parsed: Record<string, ContinuousField> = {};

    for (const [name, meta] of Object.entries(traits)) {
      const dv = bins[name] as DataView | undefined;
      if (!dv) continue;

      const values = new Float32Array(
        dv.buffer,
        dv.byteOffset,
        dv.byteLength / 4,
      );

      parsed[name] = {
        name,
        values,
        min: meta.Min,
        max: meta.Max,
        source: meta.Source,
      };
    }

    setContinuousFields(parsed);
  }, [model]);

  useEffect(() => {
    if (!model) return;

    const config = model.get("annotation_config");
    const bins = model.get("annotation_bins");

    if (!config || !bins) return;

    const parsedBins: Record<string, Uint8Array | Uint16Array | Uint32Array> =
      {};

    for (const anno of config.AvailableAnnoTypes) {
      const dv = bins[anno] as DataView | undefined;
      if (!dv) continue;

      const dtype = config.AnnoDtypes?.[anno];

      if (!dtype) {
        console.warn(
          `[SpatialVista] Missing AnnoDtypes for annotation "${anno}", skip.`,
        );
        continue;
      }

      switch (dtype) {
        case "uint8":
          parsedBins[anno] = new Uint8Array(
            dv.buffer,
            dv.byteOffset,
            dv.byteLength,
          );
          break;

        case "uint16":
          parsedBins[anno] = new Uint16Array(
            dv.buffer,
            dv.byteOffset,
            dv.byteLength / 2,
          );
          break;

        case "uint32":
          parsedBins[anno] = new Uint32Array(
            dv.buffer,
            dv.byteOffset,
            dv.byteLength / 4,
          );
          break;

        default:
          console.error(
            `[SpatialVista] Unsupported annotation dtype "${dtype}" for "${anno}"`,
          );
      }
    }

    setAnnotationConfig(config);
    setAnnotationBins(parsedBins);
  }, [model]);

  useEffect(() => {
    let currentUrl: string | null = null;

    const handler = () => {
      const bytes = model.get("laz_bytes");
      if (!bytes) return;

      console.log(
        "Vis: received laz_bytes from model, byte length:",
        bytes?.length,
      );

      const blob = new Blob([bytes], { type: "application/octet-stream" });

      if (currentUrl) {
        console.log("Vis: revoking previous object URL:", currentUrl);
        URL.revokeObjectURL(currentUrl);
      }
      currentUrl = URL.createObjectURL(blob);

      console.log("Vis: created object URL for blob:", currentUrl);
      setLazUrl(currentUrl);
    };

    model.on("change:laz_bytes", handler);
    handler(); // 处理初始化时已经有数据的情况

    return () => {
      model.off("change:laz_bytes", handler);
      if (currentUrl) {
        console.log("Vis: cleanup revoking object URL:", currentUrl);
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [model]);

  useEffect(() => {
    if (!lazUrl) return;

    (window as any).__SPATIALVISTA_LAZURL__ = lazUrl;
    console.log("Expose lazUrl:", lazUrl);
    // Additional debug: print a short sample of the url string and current loadedData state
    try {
      console.log("Vis debug - lazUrl preview:", lazUrl.slice?.(0, 120));
    } catch (e) {
      console.log("Vis debug - lazUrl preview failed", e);
    }
    console.log("Vis debug - current loadedData exists:", !!loadedData);
  }, [lazUrl]);

  // Data Manager Hook
  const {
    isLoaded,
    loadedData,
    loadedAnnotations,
    numericField,
    loadNumericField,
    onDataLoad,
    loadAnnotation,
    clearAnnotation,
  } = useDataManager({
    onLoad,
    updateViewState: viewStates.updateViewState,
    setInitialCamera: viewStates.setInitialCamera,
    setActiveZoom: viewStates.setActiveZoom,
    annotationConfig,
    annotationBins,
  });

  const handleSelectContinuous = useCallback(
    (name: string | null) => {
      setActiveContinuous(name);

      if (!loadedData) return;

      if (!name) {
        loadNumericField(null, loadedData);
        return;
      }

      const field = continuousFields[name];
      if (!field) {
        loadNumericField(null, loadedData);
        return;
      }

      loadNumericField(
        {
          name: field.name,
          values: field.values,
          min: field.min,
          max: field.max,
        },
        loadedData,
      );

      // 可选：切换字段时重置阈值
      uiStates.setNumericThreshold(field.min);
    },
    [loadedData, continuousFields, loadNumericField, uiStates],
  );
  useEffect(() => {
    viewStates.setIsLoaded?.(isLoaded);
  }, [isLoaded, viewStates]);

  // Annotation States Hook
  const annotationStates = useAnnotationStates(loadedData!, annotationConfig);

  // Section States Hook
  const sectionStates = useSectionStates(
    loadedData!,
    uiStates.showPointCloud,
    uiStates.showScatterplot,
    annotationStates.categoryColors,
  );

  // Layout Mode Hook
  const layoutMode = useLayoutMode(
    viewStates.layoutMode,
    viewStates.setLayoutMode,
    activeContinuous,
    annotationStates.coloringAnnotation,
    loadedData,
    viewStates.initialCamera,
    viewStates.updateViewState,
    uiStates.setPointSize,
  );

  // After deck gl render
  const handleAfterRender = useCallback(
    ({ gl }: { gl: WebGLRenderingContext }) => {
      // save gl context
      glRef.current = gl;
    },
    [],
  );

  const captureCurrentImage = useCallback(() => {
    if (!glRef.current) return;

    // construct a temporary link element
    const link = document.createElement("a");

    // current timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .substring(0, 19);
    link.download = `gsmap3d-vis-${timestamp}.png`;

    // get image data from canvas
    const canvas = glRef.current.canvas as HTMLCanvasElement;
    link.href = canvas.toDataURL("image/png");

    // download the image
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Toggle DeckGL Display
  const toggleDeckGLDisplay = useCallback(async () => {
    if (uiStates.showPointCloud) {
      // turn off DeckGL
      uiStates.setshowPointCloud(false);

      // check if section annotation loaded
      if (!loadedData?.extData.annotations["section"]) {
        try {
          await loadAnnotation("section");
        } catch (error) {
          console.error("Failed to load section annotation:", error);
        }
      }

      const sectionAnnotations = loadedData?.extData.annotations["section"];

      // get available section IDs
      if (sectionStates.availableSectionIDs.length === 0) {
        const uniqueSectionIDs = Array.from(new Set(sectionAnnotations)).sort(
          (a, b) => a - b,
        );
        sectionStates.setAvailableSectionIDs(uniqueSectionIDs);

        // first section as default
        if (
          uniqueSectionIDs.length > 0 &&
          (!sectionStates.currentSectionID ||
            !uniqueSectionIDs.includes(sectionStates.currentSectionID))
        ) {
          sectionStates.setCurrentSectionID(uniqueSectionIDs[0]);
        }
      }

      uiStates.setShowScatterplot(true);
      // force reset 2D view state when switching to 2D
      if (loadedData && loadedData.header && loadedData.header.boundingBox) {
        const [mins, maxs] = loadedData.header.boundingBox;
        viewStates.updateStviewState({
          target: [(mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, 0],
          zoom: Math.log2(window.innerWidth / (maxs[0] - mins[0])) - 1,
          minZoom: -10,
          maxZoom: 10,
        });
      }
    } else {
      uiStates.setshowPointCloud(true);
      uiStates.setShowScatterplot(false);
      console.log("now loaded anns:", loadedAnnotations);
    }
  }, [
    loadedData,
    loadAnnotation,
    loadedAnnotations,
    uiStates,
    sectionStates,
    viewStates,
  ]);

  // Dynamic layers with combined color params
  const colorParams = {
    ...annotationStates.colorParams,
    NumericThreshold: uiStates.NumericThreshold,
  };

  const layers = useDeckLayers({
    showPointCloud: uiStates.showPointCloud,
    showScatterplot: uiStates.showScatterplot,
    loadedData,
    onDataLoad,
    filteredSectionPoints: sectionStates.filteredSectionPoints,
    NumericThreshold: uiStates.NumericThreshold,
    numericField,
    pointOpacity: uiStates.pointOpacity,
    pointSize: uiStates.pointSize,
    layoutMode: viewStates.layoutMode,
    FancyPositions: layoutMode.FancyPositions,
    colorParams,
    lazUrl,
  });
  // [number, number] | null
  const minMaxValue: [number, number] | null =
    numericField !== null ? [numericField.min, numericField.max] : null;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <VisHeader
        isLoaded={isLoaded}
        coloringAnnotation={annotationStates.coloringAnnotation}
        selectedCategories={annotationStates.selectedCategories}
        showPointCloud={uiStates.showPointCloud}
        onContinuousOpen={() => uiStates.setContinuousOpen(true)}
        onToggleView={toggleDeckGLDisplay}
        onCapture={captureCurrentImage}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Annotation Panel */}
        <div className="hidden md:w-[10%] p-2 overflow-y-auto h-full md:flex flex-col md:min-w-[120px]">
          <AnnotationPanel
            annotationConfig={annotationConfig}
            loadedAnnotations={loadedAnnotations}
            coloringAnnotation={annotationStates.coloringAnnotation}
            selectedCategories={annotationStates.selectedCategories}
            hiddenCategoryIds={annotationStates.hiddenCategoryIds}
            categoryColors={annotationStates.categoryColors}
            customColors={annotationStates.customColors}
            currentNumericName={activeContinuous}
            isLoaded={isLoaded}
            onColorPickerOpen={() => uiStates.setColorPickerOpen(true)}
            onSetAnnotationForColoring={
              annotationStates.setAnnotationForColoring
            }
            onClearAnnotation={clearAnnotation}
            onSelectedCategoriesChange={annotationStates.setSelectedCategories}
            onHiddenCategoryIdsChange={annotationStates.setHiddenCategoryIds}
          />
        </div>

        {/* Visualization Area */}
        <div className="flex-1 min-w-0 h-90% relative lg:w-[70%]">
          {
            <VisualizationArea
              isLoaded={isLoaded}
              showPointCloud={uiStates.showPointCloud}
              showScatterplot={uiStates.showScatterplot}
              layoutMode={viewStates.layoutMode}
              viewState={viewStates.viewState}
              stviewState={viewStates.stviewState}
              initialCamera={viewStates.initialCamera}
              layers={layers}
              loadedData={loadedData}
              loadedAnnotations={loadedAnnotations}
              // currentTrait={activeContinuous}
              activeContinuous={activeContinuous}
              numericField={numericField}
              availableSectionIDs={sectionStates.availableSectionIDs}
              currentSectionID={sectionStates.currentSectionID}
              sectionPreviews={sectionStates.sectionPreviews}
              NumericThreshold={uiStates.NumericThreshold}
              minMaxValue={minMaxValue}
              device={device}
              onViewStateUpdate={viewStates.updateViewState}
              onStViewStateUpdate={viewStates.updateStviewState}
              onActiveZoomChange={viewStates.setActiveZoom}
              onSectionClick={sectionStates.handleSectionClick}
              onNumericThresholdChange={uiStates.setNumericThreshold}
              onAfterRender={handleAfterRender}
            />
          }
        </div>

        {/* Control Panel */}
        <div className="hidden md:w-[20%] p-2 space-y-3 md:flex flex-col h-full overflow-y-auto">
          <ControlPanel
            activeZoom={viewStates.activeZoom}
            autoRotate={viewStates.autoRotate}
            layoutMode={viewStates.layoutMode}
            viewState={viewStates.viewState}
            initialCamera={viewStates.initialCamera}
            pointSize={uiStates.pointSize}
            pointOpacity={uiStates.pointOpacity}
            NumericThreshold={uiStates.NumericThreshold}
            minMaxLogp={minMaxValue}
            isLoaded={isLoaded}
            currentTrait={activeContinuous}
            coloringAnnotation={annotationStates.coloringAnnotation}
            selectedCategories={annotationStates.selectedCategories}
            onZoomChange={viewStates.setActiveZoom}
            onAutoRotateToggle={viewStates.toggleAutoRotate}
            onLayoutModeToggle={layoutMode.toggleLayoutMode}
            onResetCamera={() => {
              viewStates.updateViewState({
                ...viewStates.initialCamera,
                transitionDuration: 600,
              });
              viewStates.setActiveZoom("standard");
            }}
            onPointSizeChange={uiStates.setPointSize}
            onPointOpacityChange={uiStates.setPointOpacity}
            onNumericThresholdChange={uiStates.setNumericThreshold}
            onResetPointControls={() => {
              uiStates.setPointSize(1);
              uiStates.setPointOpacity(1);
              uiStates.setNumericThreshold(minMaxValue ? minMaxValue[0] : 0);
            }}
            onViewStateUpdate={viewStates.updateViewState}
          />
        </div>
      </div>

      {/* Dialogs */}
      <ContinuousSelectionDialog
        open={uiStates.continuousOpen} // 可以之后改名
        activeContinuous={activeContinuous}
        continuousFields={continuousFields}
        onOpenChange={uiStates.setContinuousOpen}
        onSelectContinuous={handleSelectContinuous}
      />

      <ColorPickerDialog
        open={uiStates.colorPickerOpen}
        coloringAnnotation={annotationStates.coloringAnnotation}
        annotationConfig={annotationConfig}
        categoryColors={annotationStates.categoryColors}
        customColors={annotationStates.customColors}
        onOpenChange={uiStates.setColorPickerOpen}
        onCustomColorsChange={annotationStates.setCustomColors}
      />
    </div>
  );
}
