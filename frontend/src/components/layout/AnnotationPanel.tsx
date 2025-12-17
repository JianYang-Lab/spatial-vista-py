import React from "react";
import { Button } from "../ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible";
import {
  PaletteIcon,
  Trash2Icon,
  PaintBucketIcon,
  ChevronsDownIcon,
  EyeOffIcon,
  CircleCheckIcon,
} from "lucide-react";
import {
  type AnnotationType,
  ANNOTATION_CONFIG,
} from "../../config/annotations";

interface AnnotationPanelProps {
  // Data
  loadedAnnotations: Set<AnnotationType>;
  coloringAnnotation: AnnotationType;
  selectedCategories: Record<AnnotationType, number | null>;
  hiddenCategoryIds: Record<AnnotationType, Set<number>>;
  categoryColors: Record<
    AnnotationType,
    Record<number, [number, number, number]>
  >;
  customColors: Record<AnnotationType, Record<number, string>>;
  currentTrait: string | null;
  isLoaded: boolean;

  // Handlers
  onColorPickerOpen: () => void;
  onSetAnnotationForColoring: (type: AnnotationType) => void;
  onClearAnnotation: (type: AnnotationType) => void;
  onSelectedCategoriesChange: (
    categories: Record<AnnotationType, number | null>,
  ) => void;
  onHiddenCategoryIdsChange: (
    hiddenIds: Record<AnnotationType, Set<number>>,
  ) => void;
}

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  loadedAnnotations,
  coloringAnnotation,
  selectedCategories,
  hiddenCategoryIds,
  categoryColors,
  customColors,
  currentTrait,
  isLoaded,
  onColorPickerOpen,
  onSetAnnotationForColoring,
  onClearAnnotation,
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
        {Array.from(loadedAnnotations).map((type) => (
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
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
              </div>
              {/* Trash this anno */}
              <div className="flex items-center space-x-1">
                {type !== ANNOTATION_CONFIG.defaultType && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-6 w-6 p-0 hover:text-red-500"
                    onClick={() => {
                      onClearAnnotation(type);
                      onSetAnnotationForColoring(ANNOTATION_CONFIG.defaultType);
                    }}
                    title={`Clear ${type} annotation`}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                )}
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
                categories={ANNOTATION_CONFIG.annotationMaps[type]}
                selectedCategory={selectedCategories[type]}
                hiddenCategories={hiddenCategoryIds[type] || new Set()}
                categoryColors={categoryColors[type]}
                customColors={customColors[type]}
                currentTrait={currentTrait}
                coloringAnnotation={coloringAnnotation}
                onCategorySelect={handleCategorySelect}
                onCategoryToggle={handleCategoryToggle}
              />
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
};

// Category List sub-component
interface CategoryListProps {
  type: AnnotationType;
  categories: Record<number, string>;
  selectedCategory: number | null;
  hiddenCategories: Set<number>;
  categoryColors: Record<number, [number, number, number]>;
  customColors: Record<number, string>;
  currentTrait: string | null;
  coloringAnnotation: AnnotationType;
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
  currentTrait,
  coloringAnnotation,
  onCategorySelect,
  onCategoryToggle,
}) => {
  return (
    <div className="space-y-1 overflow-y-auto">
      {Object.entries(categories).map(([id, name]) => {
        const categoryId = parseInt(id);
        const isHidden = hiddenCategories.has(categoryId);
        const isActive = selectedCategory === categoryId;
        const withTrait = currentTrait !== null; // 当有trait数据时禁用
        const isColoringType = coloringAnnotation === type;

        // if current anno type else gray
        const color = isColoringType
          ? customColors[categoryId] ||
            `rgb(${(categoryColors[categoryId] || [180, 180, 180]).join(", ")})`
          : "#cccccc";

        return (
          <div
            key={id}
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
                className="w-4 h-4 rounded-sm flex items-center justify-center mr-1.5 flex-shrink-0"
                style={{ backgroundColor: color }}
                onClick={(e) => {
                  e.stopPropagation(); // prevent triggering parent onClick
                  onCategoryToggle(type, categoryId);
                }}
                title={
                  isHidden ? `Show ${name} (currently hidden)` : `Hide ${name}`
                }
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
