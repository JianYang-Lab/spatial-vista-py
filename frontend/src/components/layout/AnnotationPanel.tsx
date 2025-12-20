import React from "react";
import { Button } from "@/components/ui//button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui//collapsible";
import {
  PaletteIcon,
  PaintBucketIcon,
  ChevronsDownIcon,
  EyeOffIcon,
  CircleCheckIcon,
} from "lucide-react";
import type {
  AnnotationType,
  AnnotationConfig,
  AnnotationMapItem,
  ColorRGB,
} from "@/types";

interface AnnotationPanelProps {
  // Data
  annotationConfig: AnnotationConfig | null;
  loadedAnnotations: Set<AnnotationType>;
  coloringAnnotation: AnnotationType | null;
  selectedCategories: Record<AnnotationType, number | null>;
  hiddenCategoryIds: Record<AnnotationType, Set<number>>;
  categoryColors: Record<AnnotationType, Record<number, ColorRGB>>;
  customColors: Record<AnnotationType, Record<number, string>>;
  currentNumericName: string | null;
  isLoaded: boolean;

  // Handlers
  onColorPickerOpen: () => void;
  onSetAnnotationForColoring: (type: AnnotationType) => void;
  onSelectedCategoriesChange: (
    categories: Record<AnnotationType, number | null>,
  ) => void;
  onHiddenCategoryIdsChange: (
    hiddenIds: Record<AnnotationType, Set<number>>,
  ) => void;
}

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  annotationConfig,
  loadedAnnotations,
  coloringAnnotation,
  selectedCategories,
  hiddenCategoryIds,
  categoryColors,
  customColors,
  currentNumericName: currentNumericName,
  isLoaded,
  onColorPickerOpen,
  onSetAnnotationForColoring,
  onSelectedCategoriesChange,
  onHiddenCategoryIdsChange,
}) => {
  const handleCategorySelect = (type: AnnotationType, categoryId: number) => {
    const newSelectedCategories = { ...selectedCategories };

    // reverse selection
    if (selectedCategories[type] === categoryId) {
      newSelectedCategories[type] = null;
    } else {
      newSelectedCategories[type] = categoryId;
    }

    onSelectedCategoriesChange(newSelectedCategories);
  };

  const handleCategoryToggle = (type: AnnotationType, categoryId: number) => {
    const currentHidden = hiddenCategoryIds[type] || new Set();
    const newHidden = new Set(currentHidden);

    if (newHidden.has(categoryId)) {
      newHidden.delete(categoryId);
    } else {
      newHidden.add(categoryId);
    }

    const updatedHiddenCategories = {
      ...hiddenCategoryIds,
      [type]: newHidden,
    };
    onHiddenCategoryIdsChange(updatedHiddenCategories);
  };

  return (
    <div className="bg-card border border-border  h-full rounded-md overflow-y-auto">
      <div className="sticky top-0 bg-card  py-2 px-2 border-b z-10 flex flex-row justify-between items-center border-b-border">
        <h3 className="text-sm font-semibold">Annotations</h3>
        <Button
          variant="outline"
          size="icon"
          className="text-xs h-6 w-6 p-0"
          onClick={onColorPickerOpen}
        >
          <PaletteIcon className="h-1 w-1" />
        </Button>
      </div>

      {/* Annotation Types */}
      <div className="p-1 flex-1 flex flex-col">
        {/* Collapsible Annotation Categories */}
        {Array.from(loadedAnnotations).map((type) => {
          const items = annotationConfig?.AnnoMaps?.[type]?.Items ?? [];

          return (
            <Collapsible
              key={type}
              className="mb-1 border-b border-b-border"
              disabled={!isLoaded}
              defaultOpen={coloringAnnotation === type}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full p-1 text-left">
                <div className="flex items-center">
                  <span
                    className={`text-sm ${
                      coloringAnnotation === type
                        ? "font-bold"
                        : "text-muted-foreground font-medium"
                    }`}
                  >
                    {type}
                  </span>
                </div>

                <div className="flex items-center space-x-1">
                  {coloringAnnotation !== type && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetAnnotationForColoring(type);
                      }}
                    >
                      <PaintBucketIcon className="h-4 w-4" />
                    </Button>
                  )}

                  <ChevronsDownIcon className="h-4 w-4" />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent className="p-0 border-t">
                <CategoryList
                  type={type}
                  categories={items}
                  selectedCategory={selectedCategories[type]}
                  hiddenCategories={hiddenCategoryIds[type] || new Set()}
                  categoryColors={categoryColors[type] ?? {}}
                  customColors={customColors[type] ?? {}}
                  currentNumericName={currentNumericName}
                  coloringAnnotation={coloringAnnotation}
                  onCategorySelect={handleCategorySelect}
                  onCategoryToggle={handleCategoryToggle}
                />
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

// Category List sub-component
interface CategoryListProps {
  type: AnnotationType;
  // categories: Record<number, string>;
  categories: AnnotationMapItem[];
  selectedCategory: number | null;
  hiddenCategories: Set<number>;
  categoryColors: Record<number, ColorRGB>;
  customColors: Record<number, string>;
  currentNumericName: string | null;
  coloringAnnotation: AnnotationType | null;
  onCategorySelect: (type: AnnotationType, categoryId: number) => void;
  onCategoryToggle: (type: AnnotationType, categoryId: number) => void;
}

const CategoryList: React.FC<CategoryListProps> = ({
  type,
  categories,
  selectedCategory,
  hiddenCategories,
  categoryColors,
  customColors,
  currentNumericName,
  coloringAnnotation,
  onCategorySelect,
  onCategoryToggle,
}) => {
  return (
    <div className="space-y-1 overflow-y-auto">
      {categories.map((item) => {
        const categoryId = item.Code;
        const name = item.Name;

        const isHidden = hiddenCategories.has(categoryId);
        const isActive = selectedCategory === categoryId;
        const withTrait = currentNumericName !== null;
        const isColoringType = coloringAnnotation === type;

        const color = isColoringType
          ? customColors[categoryId] ||
            `rgb(${(categoryColors[categoryId] || [180, 180, 180]).join(", ")})`
          : "#cccccc";

        return (
          <div
            key={categoryId}
            className={`flex items-center justify-between p-1.5 pb-3 rounded ${
              isActive ? "bg-primary/10 border-primary/30" : ""
            } ${withTrait ? "opacity-50" : "hover:bg-secondary"} ${
              isHidden ? "opacity-50" : ""
            }`}
          >
            <div
              className="flex items-center flex-1 cursor-pointer"
              onClick={() => onCategorySelect(type, categoryId)}
            >
              <button
                className="w-4 h-4 rounded-sm flex items-center justify-center mr-1.5"
                style={{ backgroundColor: color }}
                onClick={(e) => {
                  e.stopPropagation();
                  onCategoryToggle(type, categoryId);
                }}
              >
                {isHidden ? (
                  <EyeOffIcon className="h-2 w-2 text-white" />
                ) : (
                  isActive && <CircleCheckIcon className="h-2 w-2 text-white" />
                )}
              </button>

              <span
                className={`text-xs ${
                  isActive ? "font-medium" : "text-muted-foreground"
                } truncate`}
                title={name}
              >
                {name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
