import { useRef, useCallback, useEffect, useState } from "react";
import { Device } from "@luma.gl/core";

// Hooks
import { useDataManager } from "@/hooks/useDataManager";
import { useDeckLayers } from "@/hooks/useDeckLayers";
import { useViewStates } from "@/hooks/useViewStates";
import { useAnnotationStates } from "@/hooks/useAnnotationStates";
import { useUIStates } from "@/hooks/useUIStates";
import { useSectionStates } from "@/hooks/useSectionStates";
import { useLayoutMode } from "@/hooks/useLayoutMode";

// Components
import { VisHeader } from "@/components/layout/VisHeader";
import { AnnotationPanel } from "@/components/layout/AnnotationPanel";
import { ControlPanel } from "@/components/layout/ControlPanel";
import { VisualizationArea } from "@/components/layout/VisualizationArea";
import { ContinuousSelectionDialog } from "@/components/dialogs/ContinuousSelectionDialog";
import { ColorPickerDialog } from "@/components/dialogs/ColorPickerDialog";

import { useWidgetModel } from "@/widget_context";
import { parseContinuousArray } from "@/utils/helpers";
import { decodeFloat16 } from "@/utils/helpers";
import type {
  AnnotationConfig,
  ContinuousConfig,
  ContinuousField,
} from "@/types";

export default function Vis({
  onLoad,
  device,
}: {
  onLoad?: (data: { count: number; progress: number }) => void;
  device?: Device;
}) {
  // Refs
  const glRef = useRef<WebGLRenderingContext | null>(null);

  // New: reference to visualization container for measuring width
  const vizContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // UI States Hook
  const uiStates = useUIStates();

  // View States Hook
  const viewStates = useViewStates(); // Will be updated by data manager

  const model = useWidgetModel();
  // laz URL State
  const [lazUrl, setLazUrl] = useState<string | null>(null);

  // AnnotaionsConfig Hook
  const [annotationConfig, setAnnotationConfig] =
    useState<AnnotationConfig | null>(null);
  const [annotationBins, setAnnotationBins] = useState<
    Record<string, Uint8Array | Uint16Array | Uint32Array>
  >({});

  // Continuous Fields State
  const [continuousFields, setContinuousFields] = useState<
    Record<string, ContinuousField>
  >({});

  const [activeContinuous, setActiveContinuous] = useState<string | null>(null);

  useEffect(() => {
    if (!model) return;

    const configMap: Record<string, ContinuousConfig> =
      model.get("continuous_config");
    const bins = model.get("continuous_bins");

    if (!configMap || !bins) return;

    const parsed: Record<string, ContinuousField> = {};

    for (const [name, config] of Object.entries(configMap) as [
      string,
      ContinuousConfig,
    ][]) {
      const dv = bins[name] as DataView | undefined;
      if (!dv) continue;

      const raw = parseContinuousArray(dv, config.DType);

      const values =
        config.DType === "float16" ? decodeFloat16(raw as Uint16Array) : raw;

      parsed[name] = {
        name,
        values,
        ContinuousConfig: config,
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

  // measure viz container width and keep it updated
  useEffect(() => {
    const el = vizContainerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      setContainerWidth(w > 0 ? w : null);
    };

    // set initial
    update();

    // observe resize
    const ro = new ResizeObserver(() => {
      update();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
    };
  }, [vizContainerRef]);
  // Data Manager Hook
  const {
    isLoaded,
    loadedData,
    loadedAnnotations,
    numericField,
    loadNumericField,
    onDataLoad,
  } = useDataManager({
    onLoad,
    updateViewState: viewStates.updateViewState,
    setInitialCamera: viewStates.setInitialCamera,
    setActiveZoom: viewStates.setActiveZoom,
    annotationConfig,
    annotationBins,
    parentWidth: containerWidth,
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

      loadNumericField(field, loadedData);

      uiStates.setNumericThreshold(field.ContinuousConfig.Min);
    },
    [loadedData, continuousFields, loadNumericField, uiStates],
  );
  useEffect(() => {
    viewStates.setIsLoaded?.(isLoaded);
  }, [isLoaded, viewStates]);

  // Annotation States Hook
  const annotationStates = useAnnotationStates(annotationConfig);

  // Section States Hook
  const sectionStates = useSectionStates(
    loadedData!,
    uiStates.showPointCloud,
    uiStates.showScatterplot,
    annotationStates.categoryColors,
    annotationConfig,
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
    link.download = `spatial-vista-vis-${timestamp}.png`;

    // get image data from canvas
    const canvas = glRef.current.canvas as HTMLCanvasElement;
    link.href = canvas.toDataURL("image/png");

    // download the image
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // judege if section key existed
  const hasSections =
    annotationConfig?.AvailableAnnoTypes.includes("section") ?? false;

  // Toggle DeckGL Display
  const toggleDeckGLDisplay = useCallback(async () => {
    if (uiStates.showPointCloud) {
      // turn off DeckGL
      uiStates.setshowPointCloud(false);
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
        const widthForZoom =
          typeof containerWidth === "number" && containerWidth > 0
            ? containerWidth
            : window.innerWidth;
        viewStates.updateStviewState({
          target: [(mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, 0],
          zoom: Math.log2(widthForZoom / (maxs[0] - mins[0])) - 2,
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
    uiStates,
    loadedData,
    sectionStates,
    containerWidth,
    viewStates,
    loadedAnnotations,
  ]);

  // Dynamic layers with combined color params
  const colorParams = {
    ...annotationStates.colorParams,
    NumericThreshold: uiStates.numericThreshold,
  };

  const layers = useDeckLayers({
    showPointCloud: uiStates.showPointCloud,
    showScatterplot: uiStates.showScatterplot,
    loadedData,
    onDataLoad,
    filteredSectionPoints: sectionStates.filteredSectionPoints,
    NumericThreshold: uiStates.numericThreshold,
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
    numericField !== null
      ? [numericField.ContinuousConfig.Min, numericField.ContinuousConfig.Max]
      : null;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <VisHeader
        isLoaded={isLoaded}
        showPointCloud={uiStates.showPointCloud}
        hasSections={hasSections}
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
            onSelectedCategoriesChange={annotationStates.setSelectedCategories}
            onHiddenCategoryIdsChange={annotationStates.setHiddenCategoryIds}
          />
        </div>

        {/* Visualization Area */}
        <div
          className="flex-1 min-w-0 h-full relative lg:w-[70%]"
          ref={vizContainerRef}
        >
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
              availableSectionIDs={sectionStates.availableSectionIDs}
              currentSectionID={sectionStates.currentSectionID}
              sectionPreviews={sectionStates.sectionPreviews}
              NumericThreshold={uiStates.numericThreshold}
              minMaxValue={minMaxValue}
              device={device}
              onViewStateUpdate={viewStates.updateViewState}
              onStViewStateUpdate={viewStates.updateStviewState}
              onActiveZoomChange={viewStates.setActiveZoom}
              onSectionClick={sectionStates.handleSectionClick}
              onNumericThresholdChange={uiStates.setNumericThreshold}
              onAfterRender={handleAfterRender}
              annotationConfig={annotationConfig}
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
            onResetPointControls={() => {
              uiStates.setPointSize(1);
              uiStates.setPointOpacity(1);
              uiStates.setNumericThreshold(minMaxValue ? minMaxValue[0] : 0);
            }}
            onViewStateUpdate={viewStates.updateViewState}
            annotationConfig={annotationConfig}
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
