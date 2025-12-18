import React from "react";
import { Button } from "../ui/button";
import {
  FolderOpenDotIcon,
  SearchIcon,
  LoaderPinwheelIcon,
  CameraIcon,
  Layers3Icon,
  Move3dIcon,
} from "lucide-react";
// import { type AnnotationType } from "../../config/annotations";

interface AppHeaderProps {
  // States
  isLoaded: boolean;
  currentTrait: string | null;
  // coloringAnnotation: AnnotationType;
  // selectedCategories: Record<AnnotationType, number | null>;
  showPointCloud: boolean;

  // Handlers
  onTraitOpen: () => void;
  onAnnotationOpen: () => void;
  onToggleView: () => void;
  onCapture: () => void;
}

export const VisHeader: React.FC<AppHeaderProps> = ({
  isLoaded,
  showPointCloud,
  onTraitOpen,
  // onAnnotationOpen,
  onToggleView,
  onCapture,
}) => {
  return (
    <header className="shadow-sm border-b py-2 px-4">
      <div className="flex items-center justify-between gap-2">
        {/* left button group */}
        <div className="flex items-center gap-1 sm:gap-10 flex-1 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onTraitOpen}
            disabled={!isLoaded}
          >
            <SearchIcon className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Query Trait</span>
          </Button>

          {/*<Button
            variant="outline"
            size="sm"
            onClick={onAnnotationOpen}
            disabled={!isLoaded}
          >
            <LoaderPinwheelIcon className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Annotations</span>
          </Button>*/}
        </div>

        {/* right button group */}
        <div className="flex items-center gap-1 sm:gap-10 flex-shrink-0">
          {/* toggle 2D */}
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleView}
            disabled={!isLoaded}
            title={showPointCloud ? "Switch to 2D View" : "Switch to 3D View"}
          >
            {showPointCloud ? (
              <Layers3Icon className="h-4 w-4" />
            ) : (
              <Move3dIcon className="h-4 w-4" />
            )}
            <span className="hidden sm:inline ml-1">
              {showPointCloud ? "2D View" : "3D View"}
            </span>
          </Button>

          {/* capture */}
          <Button
            variant="outline"
            size="sm"
            onClick={onCapture}
            disabled={!isLoaded}
            title="Capture Current View"
          >
            <CameraIcon className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Capture</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
