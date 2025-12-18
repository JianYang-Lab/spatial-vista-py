import React, { useRef, useCallback } from "react";
import { DeckGL } from "@deck.gl/react";
import { OrbitView, OrthographicView } from "@deck.gl/core";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { SectionCarousel } from "./SectionCarousel";
import { RefreshCwIcon } from "lucide-react";
import RingLoader from "react-spinners/RingLoader";
import type {
  LayersList,
  OrbitViewState,
  OrthographicViewState,
} from "@deck.gl/core";
import type { Device } from "@luma.gl/core";
import {
  type AnnotationType,
  ANNOTATION_CONFIG,
} from "../../config/annotations";

interface VisualizationAreaProps {
  // Basic states
  isLoaded: boolean;
  showPointCloud: boolean;
  showScatterplot: boolean;
  layoutMode: "3d" | "2d-treemap" | "2d-histogram";

  // View states
  viewState: OrbitViewState;
  stviewState: OrthographicViewState;
  initialCamera: OrbitViewState;

  // Data and layers
  layers: LayersList;
  loadedData: any;
  loadedAnnotations: Set<AnnotationType>;
  // currentTrait: string | null;
  activeContinuous: string | null;
  numericField: {
    name: string;
    min: number;
    max: number;
  } | null;
  // Section carousel props
  availableSectionIDs: number[];
  currentSectionID: number;
  sectionPreviews: Record<number, string>;

  // LogP controls props
  NumericThreshold: number;
  minMaxValue: [number, number] | null;

  // Device
  device?: Device;

  // Handlers
  onViewStateUpdate: (viewState: OrbitViewState) => void;
  onStViewStateUpdate: (viewState: OrthographicViewState) => void;
  onActiveZoomChange: (zoom: string) => void;
  onSectionClick: (sectionID: number) => void;
  onNumericThresholdChange: (threshold: number) => void;
  onAfterRender: ({ gl }: { gl: WebGLRenderingContext }) => void;
}

export const VisualizationArea: React.FC<VisualizationAreaProps> = ({
  isLoaded,
  showPointCloud,
  showScatterplot,
  layoutMode,
  viewState,
  stviewState,
  initialCamera,
  layers,
  loadedData,
  loadedAnnotations,
  activeContinuous,
  numericField,
  availableSectionIDs,
  currentSectionID,
  sectionPreviews,
  NumericThreshold,
  minMaxValue: minMaxValue,
  device,
  onViewStateUpdate,
  onStViewStateUpdate,
  onActiveZoomChange,
  onSectionClick,
  onNumericThresholdChange,
  onAfterRender,
}) => {
  const deckRef = useRef<any>(null);

  const handleViewStateChange = useCallback(
    ({ viewState: newViewState }: { viewState: any }) => {
      if (showPointCloud) {
        // 3D update view
        onViewStateUpdate(newViewState as OrbitViewState);
        // it's number here
        const newZoomValue = newViewState.zoom as number;
        const currentZoomValue = viewState.zoom as number;

        if (newZoomValue !== currentZoomValue) {
          const farThreshold = (initialCamera.zoom as number) - 1;
          const nearThreshold = (initialCamera.zoom as number) + 1;

          if (newZoomValue <= farThreshold) {
            onActiveZoomChange("far");
          } else if (newZoomValue >= nearThreshold) {
            onActiveZoomChange("near");
          } else {
            onActiveZoomChange("standard");
          }
        }
      } else {
        // 2D update view
        onStViewStateUpdate(newViewState as OrthographicViewState);
      }
    },
    [
      showPointCloud,
      onViewStateUpdate,
      onStViewStateUpdate,
      onActiveZoomChange,
      viewState.zoom,
      initialCamera.zoom,
    ],
  );

  const getTooltip = useCallback(
    ({ coordinate, index, layer }: any) => {
      if (!coordinate || !layer) return null;

      const extData = loadedData.extData;

      let tooltipContent = `
          <div>
            <b>Position:</b> ${coordinate.map((v: number) => v.toFixed(1)).join(", ")}<br/>
        `;

      // iter all annos
      for (const annotationType of loadedAnnotations) {
        const classification = extData.annotations[annotationType];

        if (classification && classification[index] !== undefined) {
          const categoryId = classification[index];
          const categoryName =
            ANNOTATION_CONFIG.annotationMaps[annotationType] &&
            ANNOTATION_CONFIG.annotationMaps[annotationType][Number(categoryId)]
              ? ANNOTATION_CONFIG.annotationMaps[annotationType][
                  Number(categoryId)
                ]
              : `Unknown (${categoryId})`;

          // Capitalize first letter of annotationType
          const displayName =
            annotationType.charAt(0).toUpperCase() + annotationType.slice(1);

          tooltipContent += `<b>${displayName}:</b> ${categoryName}<br/>`;
        }
      }

      if (
        extData.numeric &&
        extData.numeric.values &&
        index < extData.numeric.values.length
      ) {
        const v = extData.numeric.values[index];

        if (typeof v === "number" && Number.isFinite(v)) {
          tooltipContent += `<b>${extData.numeric.name}:</b> ${v.toFixed(
            4,
          )}<br/>`;
        }
      }

      tooltipContent += `</div>`;

      return {
        html: tooltipContent,
        className: "bg-card text-muted-foreground rounded-lg shadow-lg",
        style: {
          backgroundColor: "",
          color: "",
        },
      };
    },
    [loadedData, loadedAnnotations],
  );

  const handleLogpReset = useCallback(() => {
    if (minMaxValue) {
      onNumericThresholdChange(minMaxValue[0]);
    }
  }, [minMaxValue, onNumericThresholdChange]);

  return (
    <>
      {/* Loading Overlay */}

      {!isLoaded && <LoadingOverlay />}

      {/* DeckGL Component */}
      <DeckGL
        ref={deckRef}
        device={device}
        views={
          showPointCloud
            ? new OrbitView({
                orbitAxis: "Y",
                fovy: 50,
                controller: {
                  inertia: true,
                  scrollZoom: true,
                  dragMode: layoutMode === "3d" ? "rotate" : "pan",
                },
              })
            : new OrthographicView({
                controller: {
                  inertia: true,
                  scrollZoom: true,
                },
              })
        }
        viewState={showPointCloud ? viewState : stviewState}
        onAfterRender={onAfterRender}
        onViewStateChange={handleViewStateChange}
        layers={layers}
        getTooltip={getTooltip}
      />

      {/* 2D Section Carousel */}
      {!showPointCloud && showScatterplot && (
        <div className="absolute top-2 left-12 right-12 backdrop-blur-sm p-1 rounded-lg shadow-lg bg-transparent">
          <SectionCarousel
            showScatterplot={showScatterplot}
            availableSectionIDs={availableSectionIDs}
            showPointCloud={showPointCloud}
            currentSectionID={currentSectionID}
            onSectionClick={onSectionClick}
            sectionPreviews={sectionPreviews}
          />
        </div>
      )}

      {/* LogP Controls */}
      {numericField &&
        minMaxValue &&
        Number.isFinite(minMaxValue[0]) &&
        Number.isFinite(minMaxValue[1]) && (
          <div
            className="absolute bottom-4 left-1/2 transform -translate-x-1/2  bg-transparent rounded-lg shadow-lg p-1.5 z-20 pl-3 pr-3"
            style={{ minWidth: "80%", backdropFilter: "blur(8px)" }}
          >
            <LogpControls
              NumericThreshold={NumericThreshold}
              minMaxLogp={minMaxValue}
              isLoaded={isLoaded}
              onThresholdChange={onNumericThresholdChange}
              onReset={handleLogpReset}
            />
          </div>
        )}
    </>
  );
};

// Loading Overlay Sub-component
const LoadingOverlay: React.FC = () => (
  <div className="absolute inset-0 flex items-center justify-center z-10">
    <RingLoader
      color="#B967C7"
      cssOverride={{}}
      loading
      size={200}
      speedMultiplier={0.5}
    />
  </div>
);

// LogP Controls Sub-component
interface LogpControlsProps {
  NumericThreshold: number;
  minMaxLogp: [number, number];
  isLoaded: boolean;
  onThresholdChange: (threshold: number) => void;
  onReset: () => void;
}

const LogpControls: React.FC<LogpControlsProps> = ({
  NumericThreshold,
  minMaxLogp,
  isLoaded,
  onThresholdChange,
  onReset,
}) => (
  <div className="flex items-center space-x-3">
    {/* LogP Threshold label and value */}
    <div className="text-sm font-medium whitespace-nowrap">
      LogP: <span className="font-bold">{NumericThreshold.toFixed(2)}</span>
    </div>

    {/* Min value */}
    <span className="text-xs font-medium">{minMaxLogp[0].toFixed(2)}</span>

    {/* Combined gradient bar and slider */}
    <div className="flex-1 h-8 relative">
      {/* Gradient background */}
      <div
        className="w-full h-6 rounded-md shadow-inner absolute top-1"
        style={{
          background: `linear-gradient(to right, rgb(0, 50, 255), rgb(128, 50, 128), rgb(255, 50, 0))`,
        }}
      />

      {/* Slider positioned over the gradient bar */}
      <Slider
        min={minMaxLogp[0]}
        max={minMaxLogp[1]}
        step={(minMaxLogp[1] - minMaxLogp[0]) / 100}
        value={[NumericThreshold]}
        onValueChange={(values) => onThresholdChange(values[0])}
        disabled={!isLoaded}
        className="
            cursor-pointer absolute inset-0
            [&>[data-slot=slider-track]]:bg-transparent
            [&>[data-slot=slider-track]>[data-slot=slider-range]]:bg-transparent
            "
      />
    </div>

    {/* Max value */}
    <span className="text-xs font-medium">{minMaxLogp[1].toFixed(2)}</span>

    {/* Reset button */}
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0"
      onClick={onReset}
      disabled={!isLoaded}
      title="Reset threshold"
    >
      <RefreshCwIcon className="h-3 w-3" />
    </Button>
  </div>
);
