import React, { useState } from "react";
import type { OrbitViewState } from "@deck.gl/core";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Rotate3DIcon,
  RefreshCcwIcon,
  ChartScatterIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HelpCircleIcon,
} from "lucide-react";

import { type AnnotationConfig, type AnnotationType } from "@/types";
import { Switch } from "../ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";

interface ControlPanelProps {
  // Camera controls
  activeZoom: string | null;
  autoRotate: boolean;
  layoutMode: "3d" | "2d-treemap" | "2d-histogram";
  viewState: OrbitViewState;
  initialCamera: OrbitViewState;

  // Point controls
  pointSize: number;
  pointOpacity: number;

  // States
  isLoaded: boolean;
  currentTrait: string | null;
  coloringAnnotation: AnnotationType | null;
  selectedCategories: Record<AnnotationType, number | null>;

  // Handlers
  onZoomChange: (zoom: string) => void;
  onAutoRotateToggle: () => void;
  onLayoutModeToggle: () => void;
  onResetCamera: () => void;
  onPointSizeChange: (size: number) => void;
  onPointOpacityChange: (opacity: number) => void;
  onResetPointControls: () => void;
  onViewStateUpdate: (viewState: OrbitViewState) => void;

  annotationConfig: AnnotationConfig | null;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  activeZoom,
  autoRotate,
  layoutMode,
  viewState,
  initialCamera,
  pointSize,
  pointOpacity,
  isLoaded,
  currentTrait,
  coloringAnnotation,
  selectedCategories,
  onZoomChange,
  onAutoRotateToggle,
  onLayoutModeToggle,
  onPointSizeChange,
  onPointOpacityChange,
  onResetPointControls,
  onViewStateUpdate,
  annotationConfig,
}) => {
  const handleZoomClick = (zoomType: string) => {
    if (activeZoom === zoomType) return;

    let newZoom: number;
    switch (zoomType) {
      case "far":
        newZoom = (initialCamera.zoom as number) - 2;
        break;
      case "near":
        newZoom = (initialCamera.zoom as number) + 2;
        break;
      default: // standard
        newZoom = initialCamera.zoom as number;
        break;
    }

    onViewStateUpdate({
      ...viewState,
      zoom: newZoom,
      transitionDuration: 600,
    });
    onZoomChange(zoomType);
  };

  const handleResetCamera = () => {
    onViewStateUpdate({
      ...initialCamera,
      transitionDuration: 600,
    });
    onZoomChange("standard");
  };

  return (
    <>
      {/* Camera Controls */}
      <CameraControlsSection
        activeZoom={activeZoom}
        autoRotate={autoRotate}
        layoutMode={layoutMode}
        currentTrait={currentTrait}
        isLoaded={isLoaded}
        onZoomClick={handleZoomClick}
        onAutoRotateToggle={onAutoRotateToggle}
        onLayoutModeToggle={onLayoutModeToggle}
        onResetCamera={handleResetCamera}
      />

      {/* Point Controls */}
      <PointControlsSection
        pointSize={pointSize}
        pointOpacity={pointOpacity}
        isLoaded={isLoaded}
        onPointSizeChange={onPointSizeChange}
        onPointOpacityChange={onPointOpacityChange}
        onResetPointControls={onResetPointControls}
      />

      {/* Informations */}
      <InformationSection
        currentTrait={currentTrait}
        coloringAnnotation={coloringAnnotation}
        selectedCategories={selectedCategories}
        viewState={viewState}
        annotationConfig={annotationConfig}
      />
    </>
  );
};

// Informations Sub-component
interface InformationSectionProps {
  currentTrait: string | null;
  coloringAnnotation: AnnotationType | null;
  selectedCategories: Record<AnnotationType, number | null>;
  viewState: OrbitViewState;
  annotationConfig: AnnotationConfig | null;
}

const InformationSection: React.FC<InformationSectionProps> = ({
  currentTrait,
  coloringAnnotation,
  selectedCategories,
  viewState,
  annotationConfig,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  // get selected categories text
  const getSelectedCategoriesText = () => {
    const selectedItems: string[] = [];

    Object.entries(selectedCategories).forEach(
      ([annotationType, categoryId]) => {
        if (categoryId !== null) {
          const annoMap =
            annotationConfig?.AnnoMaps?.[annotationType as AnnotationType];
          const categoryName =
            annoMap && Array.isArray(annoMap.Items)
              ? annoMap.Items.find((it) => it?.Code === categoryId)?.Name
              : annoMap
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ((annoMap as any)[categoryId] ?? undefined)
                : undefined;
          if (categoryName) {
            selectedItems.push(categoryName);
          } else {
            selectedItems.push(categoryId.toString());
          }
        }
      },
    );

    if (selectedItems.length === 0) {
      return "None";
    }

    // else if more than 3, show first 3 and +n more
    if (selectedItems.length > 3) {
      return `${selectedItems.slice(0, 3).join(";")} +${selectedItems.length - 3} more`;
    }

    return selectedItems.join(";");
  };

  return (
    <Card className="w-full p-2 rounded-md flex justify-center gap-0">
      <CardHeader className="items-center pb-0 px-1">
        <CardTitle>Information</CardTitle>
      </CardHeader>
      <CardContent className="pb-0 px-0 flex-col flex ">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="space-y-2 my-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium">Current Trait: </span>
              {currentTrait || "None"}
            </div>
            <div>
              <span className="font-medium">Current Annotation: </span>
              {coloringAnnotation}
            </div>

            {/* Collaps Trigger */}
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-primary hover:text-indigo-300 transition-colors">
              {isOpen ? (
                <>
                  <ChevronDownIcon className="h-3 w-3" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronRightIcon className="h-3 w-3" />
                  Show More Details
                </>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2">
              <div>
                <span className="font-medium">Selected Categories:</span>
                <div className="text-xs mt-1 max-h-16 overflow-y-auto">
                  {getSelectedCategoriesText()}
                </div>
              </div>
              <div>
                <span className="font-medium">Camera Zoom: </span>
                {viewState.zoom?.toFixed(2)}
              </div>
              <div>
                <span className="font-medium">Camera Rotation:</span>{" "}
                {`[${viewState.rotationX?.toFixed(1)}, ${viewState.rotationOrbit?.toFixed(
                  1,
                )}]`}
              </div>
              <div>
                <span className="font-medium">Camera target: </span>
                {`[${viewState.target?.map((v) => v.toFixed(1)).join(", ")}]`}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

// Camera Controls Sub-component
interface CameraControlsSectionProps {
  activeZoom: string | null;
  autoRotate: boolean;
  layoutMode: "3d" | "2d-treemap" | "2d-histogram";
  currentTrait: string | null;
  isLoaded: boolean;
  onZoomClick: (zoom: string) => void;
  onAutoRotateToggle: () => void;
  onLayoutModeToggle: () => void;
  onResetCamera: () => void;
}

const CameraControlsSection: React.FC<CameraControlsSectionProps> = ({
  activeZoom,
  autoRotate,
  layoutMode,
  currentTrait,
  isLoaded,
  onZoomClick,
  onAutoRotateToggle,
  onLayoutModeToggle,
  onResetCamera,
}) => (
  <Card className="w-full p-2 rounded-md">
    <CardHeader className="items-center pb-0 px-1">
      <CardTitle>Camera Controls</CardTitle>
      <CardAction>
        <HelpButton />
      </CardAction>
    </CardHeader>
    <CardContent className="pb-0 px-0">
      <div className="flex flex-col gap-2 lg:justify-between lg:flex-row">
        <RadioGroup
          defaultValue="standard"
          value={activeZoom || "standard"}
          className="gap-2"
          disabled={!isLoaded}
        >
          <div className="flex items-center gap-3">
            <RadioGroupItem
              value="far"
              id="r2"
              onClick={() => onZoomClick("far")}
            />
            <Label htmlFor="r2">Far</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem
              value="standard"
              id="r1"
              onClick={() => onZoomClick("standard")}
            />
            <Label htmlFor="r1">Standard</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem
              value="near"
              id="r3"
              onClick={() => onZoomClick("near")}
            />
            <Label htmlFor="r3">Near</Label>
          </div>
        </RadioGroup>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onResetCamera}
            disabled={!isLoaded}
          >
            <span className="flex items-center gap-1">
              <RefreshCcwIcon className="h-4 w-4" />
              Reset View
            </span>
          </Button>
          {/* Switch for auto-rotate*/}
          <div className="flex items-center gap-2">
            <Switch
              id="autoRotate"
              checked={autoRotate}
              defaultChecked={false}
              onCheckedChange={onAutoRotateToggle}
            />
            <Label htmlFor="autoRotate">
              <span className="flex items-center gap-1">
                <Rotate3DIcon className="h-4 w-4" />
                AutoRotate
              </span>
            </Label>
          </div>
          {/* Layout Mode Toggle */}
          <div className="flex justify-between items-center">
            <Button
              variant={layoutMode === "2d-treemap" ? "default" : "outline"}
              size="sm"
              onClick={onLayoutModeToggle}
              disabled={!isLoaded}
            >
              <span className="flex items-center gap-1">
                <ChartScatterIcon className="h-4 w-4" />
                {layoutMode === "3d"
                  ? currentTrait
                    ? "3D → Histogram"
                    : "3D → Treemap"
                  : layoutMode === "2d-histogram"
                    ? "Histogram → 3D"
                    : "Treemap → 3D"}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Point Controls Sub-component
interface PointControlsSectionProps {
  pointSize: number;
  pointOpacity: number;
  // logpThreshold: number;
  isLoaded: boolean;
  onPointSizeChange: (size: number) => void;
  onPointOpacityChange: (opacity: number) => void;
  // onLogpThresholdChange: (threshold: number) => void;
  onResetPointControls: () => void;
}

const PointControlsSection: React.FC<PointControlsSectionProps> = ({
  pointSize,
  pointOpacity,
  isLoaded,
  onPointSizeChange,
  onPointOpacityChange,
  onResetPointControls,
}) => (
  <Card className="w-full p-2 rounded-md">
    <CardHeader className="items-center pb-0 px-1">
      <CardTitle>Piont Controls</CardTitle>
      <CardAction>
        <Button
          variant="outline"
          size="sm"
          onClick={onResetPointControls}
          disabled={!isLoaded}
        >
          <span className="flex items-center gap-1">
            <RefreshCcwIcon className="h-3 w-3" />
            Reset
          </span>
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent className="pb-0 px-0 flex-col flex ">
      <div className="space-y-2 my-2">
        <div className="flex flex-col gap-2 lg:justify-between lg:flex-row">
          <label className="text-sm">Size</label>
          <span className="text-xs">{pointSize.toFixed(1)}</span>
        </div>
        <Slider
          min={0.1}
          max={3}
          step={0.1}
          value={[pointSize]}
          onValueChange={(values) => onPointSizeChange(values[0])}
          disabled={!isLoaded}
        />
      </div>
      <div className="space-y-2 my-2">
        <div className="flex justify-between">
          <label className="text-sm">Opacity</label>
          <span className="text-xs">{pointOpacity.toFixed(1)}</span>
        </div>
        <Slider
          min={0.1}
          max={1}
          step={0.05}
          value={[pointOpacity]}
          onValueChange={(values) => onPointOpacityChange(values[0])}
          disabled={!isLoaded}
        />
      </div>
    </CardContent>
  </Card>
);

// Help Button Sub-component
const HelpButton: React.FC = () => (
  <HoverCard>
    <HoverCardTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        className="h-3 w-3 p-0 "
        title="View Controls Help"
      >
        <HelpCircleIcon className="" />
      </Button>
    </HoverCardTrigger>
    <HoverCardContent className="w-64 p-3" align="end">
      <div className="space-y-2">
        <div className="text-xs space-y-1">
          <div>
            •{" "}
            <strong>
              Scroll /{" "}
              <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
                +-
              </kbd>
              :
            </strong>{" "}
            Zoom in/out
          </div>
          <div>
            • <strong>Drag:</strong> Rotate (3D) / Pan (2D)
          </div>
          <div>
            •{" "}
            <strong>
              {" "}
              <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
                Shift
              </kbd>{" "}
              + Drag:
            </strong>{" "}
            Pan (3D)
          </div>
          <div>
            •{" "}
            <strong>
              <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
                ↑↓←→
              </kbd>
              :
            </strong>{" "}
            Pan (3D & 2D)
          </div>
          <div>
            •{" "}
            <strong>
              {" "}
              <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
                Shift
              </kbd>{" "}
              +{" "}
              <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none">
                ↑↓←→
              </kbd>
              :
            </strong>{" "}
            Roate (3D)
          </div>
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
);
