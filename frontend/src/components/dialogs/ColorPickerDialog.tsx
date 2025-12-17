import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { ColorPicker } from "../ui/color-picker";
import { EraserIcon } from "lucide-react";
import {
  ANNOTATION_CONFIG,
  type AnnotationType,
} from "../../config/annotations";
import type { CategoryColors, CustomColors } from "../../types";

interface ColorPickerDialogProps {
  open: boolean;
  coloringAnnotation: AnnotationType;
  categoryColors: CategoryColors;
  customColors: CustomColors;
  onOpenChange: (open: boolean) => void;
  onCustomColorsChange: (colors: CustomColors) => void;
}

export const ColorPickerDialog: React.FC<ColorPickerDialogProps> = ({
  open,
  coloringAnnotation,
  categoryColors,
  customColors,
  onOpenChange,
  onCustomColorsChange,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Custom Colors</DialogTitle>
        <DialogDescription>
          Click to setup colors for different annotations.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(
            ANNOTATION_CONFIG.annotationMaps[coloringAnnotation] || {},
          ).map(([id, name]) => {
            const type = coloringAnnotation;
            const categoryId = parseInt(id);
            const currentColor =
              customColors[type]?.[categoryId] ||
              `rgb(${(categoryColors[type]?.[categoryId] || [180, 180, 180]).join(", ")})`;

            return (
              <div
                key={id}
                className="flex flex-col items-center p-2 border rounded-lg cursor-pointer hover:bg-accent"
              >
                <span className="text-sm font-medium mb-2 h-[2.5rem] text-center line-clamp-2">
                  {name}
                </span>
                <ColorPicker
                  className="mb-2"
                  value={customColors[type]?.[categoryId] || currentColor}
                  onChange={(color: string) => {
                    const newCustomColors = {
                      ...customColors,
                      [type]: {
                        ...customColors[type],
                        [categoryId]: color,
                      },
                    };
                    onCustomColorsChange(newCustomColors);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => {
            onCustomColorsChange({
              ...customColors,
              [coloringAnnotation]: {},
            });
          }}
        >
          <span className="flex items-center gap-1">
            <EraserIcon className="h-4 w-4" />
            Reset Colors
          </span>
        </Button>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
