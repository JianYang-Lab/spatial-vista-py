import { useRef, useCallback, useEffect } from "react";
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
import { TraitSelectionDialog } from "../components/dialogs/TraitSelectionDialog";
import { AnnotationSelectionDialog } from "../components/dialogs/AnnotationSelectionDialog";
import { ColorPickerDialog } from "../components/dialogs/ColorPickerDialog";

export default function Vis({
  onLoad,
  device,
}: {
  onLoad?: (data: { count: number; progress: number }) => void;
  device?: Device;
}) {
  // Refs
  const glRef = useRef<WebGLRenderingContext | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setCategoryColorsRef = useRef<(colors: any) => void>(() => {});

  // UI States Hook
  const uiStates = useUIStates();

  // View States Hook
  const viewStates = useViewStates(); // Will be updated by data manager

  // Data Manager Hook
  const {
    isLoaded,
    loadedData,
    loadedAnnotations,
    currentTrait,
    minMaxLogp,
    onDataLoad,
    loadAnnotation,
    loadTrait,
    clearAnnotation,
  } = useDataManager({
    onLoad,
    setCategoryColors: (colors) => setCategoryColorsRef.current(colors),
    updateViewState: viewStates.updateViewState,
    setInitialCamera: viewStates.setInitialCamera,
    setActiveZoom: viewStates.setActiveZoom,
  });
  useEffect(() => {
    viewStates.setIsLoaded?.(isLoaded);
  }, [isLoaded, viewStates]);

  // Annotation States Hook
  const annotationStates = useAnnotationStates(loadedData!, currentTrait);

  // update setCategoryColorsRef when annotationStates.setCategoryColors changes
  useEffect(() => {
    setCategoryColorsRef.current = annotationStates.setCategoryColors;
  }, [annotationStates.setCategoryColors]);

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
    currentTrait,
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
    logpThreshold: uiStates.logpThreshold,
  };

  const layers = useDeckLayers({
    showPointCloud: uiStates.showPointCloud,
    showScatterplot: uiStates.showScatterplot,
    loadedData,
    onDataLoad,
    filteredSectionPoints: sectionStates.filteredSectionPoints,
    currentTrait,
    logpThreshold: uiStates.logpThreshold,
    minMaxLogp,
    pointOpacity: uiStates.pointOpacity,
    pointSize: uiStates.pointSize,
    layoutMode: viewStates.layoutMode,
    FancyPositions: layoutMode.FancyPositions,
    colorParams,
  });

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <VisHeader
        isLoaded={isLoaded}
        currentTrait={currentTrait}
        coloringAnnotation={annotationStates.coloringAnnotation}
        selectedCategories={annotationStates.selectedCategories}
        showPointCloud={uiStates.showPointCloud}
        onTraitOpen={() => uiStates.setTraitOpen(true)}
        onAnnotationOpen={() => uiStates.setAnnotationOpen(true)}
        onToggleView={toggleDeckGLDisplay}
        onCapture={captureCurrentImage}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Annotation Panel */}
        <div className="hidden md:w-[10%] p-2 overflow-y-auto h-full md:flex flex-col md:min-w-[120px]">
          <AnnotationPanel
            loadedAnnotations={loadedAnnotations}
            coloringAnnotation={annotationStates.coloringAnnotation}
            selectedCategories={annotationStates.selectedCategories}
            hiddenCategoryIds={annotationStates.hiddenCategoryIds}
            categoryColors={annotationStates.categoryColors}
            customColors={annotationStates.customColors}
            currentTrait={currentTrait}
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
        <div className="flex-1 min-w-0 h-full relative lg:w-[70%]">
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
            currentTrait={currentTrait}
            availableSectionIDs={sectionStates.availableSectionIDs}
            currentSectionID={sectionStates.currentSectionID}
            sectionPreviews={sectionStates.sectionPreviews}
            logpThreshold={uiStates.logpThreshold}
            minMaxLogp={minMaxLogp}
            device={device}
            onViewStateUpdate={viewStates.updateViewState}
            onStViewStateUpdate={viewStates.updateStviewState}
            onActiveZoomChange={viewStates.setActiveZoom}
            onSectionClick={sectionStates.handleSectionClick}
            onLogpThresholdChange={uiStates.setLogpThreshold}
            onAfterRender={handleAfterRender}
          />
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
            logpThreshold={uiStates.logpThreshold}
            minMaxLogp={minMaxLogp}
            pieChartProps={annotationStates.pieChartProps}
            logpBarChartProps={annotationStates.logpBarChartProps}
            isLoaded={isLoaded}
            currentTrait={currentTrait}
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
            onLogpThresholdChange={uiStates.setLogpThreshold}
            onResetPointControls={() => {
              uiStates.setPointSize(1);
              uiStates.setPointOpacity(1);
              uiStates.setLogpThreshold(minMaxLogp ? minMaxLogp[0] : 0);
            }}
            onViewStateUpdate={viewStates.updateViewState}
          />
        </div>
      </div>

      {/* Dialogs */}
      <TraitSelectionDialog
        open={uiStates.traitOpen}
        currentTrait={currentTrait}
        onOpenChange={uiStates.setTraitOpen}
        onLoadTrait={loadTrait}
      />

      <AnnotationSelectionDialog
        open={uiStates.annotationOpen}
        loadedAnnotations={loadedAnnotations}
        coloringAnnotation={annotationStates.coloringAnnotation}
        onOpenChange={uiStates.setAnnotationOpen}
        onLoadAnnotation={loadAnnotation}
        onSetAnnotationForColoring={annotationStates.setAnnotationForColoring}
      />

      <ColorPickerDialog
        open={uiStates.colorPickerOpen}
        coloringAnnotation={annotationStates.coloringAnnotation}
        categoryColors={annotationStates.categoryColors}
        customColors={annotationStates.customColors}
        onOpenChange={uiStates.setColorPickerOpen}
        onCustomColorsChange={annotationStates.setCustomColors}
      />
    </div>
  );
}
