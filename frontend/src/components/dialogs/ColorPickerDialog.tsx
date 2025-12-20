import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui//dialog";
import { Button } from "@/components/ui//button";
import { ColorPicker } from "@/components/ui//color-picker";
import { EraserIcon } from "lucide-react";

import type {
  AnnotationConfig,
  CategoryColors,
  CustomColors,
  AnnotationType,
} from "@/types";

interface ColorPickerDialogProps {
  open: boolean;
  coloringAnnotation: AnnotationType | null;
  annotationConfig: AnnotationConfig | null;

  categoryColors: CategoryColors;
  customColors: CustomColors;

  onOpenChange: (open: boolean) => void;
  onCustomColorsChange: (colors: CustomColors) => void;
}

export const ColorPickerDialog: React.FC<ColorPickerDialogProps> = ({
  open,
  coloringAnnotation,
  annotationConfig,
  categoryColors,
  customColors,
  onOpenChange,
  onCustomColorsChange,
}) => {
  // ---------- guards ----------
  if (!open) return null;
  if (!coloringAnnotation) return null;
  if (!annotationConfig) return null;

  const items = annotationConfig.AnnoMaps?.[coloringAnnotation]?.Items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom Colors</DialogTitle>
          <DialogDescription>
            Customize colors for categories in{" "}
            <span className="font-medium">{coloringAnnotation}</span>.
          </DialogDescription>
        </DialogHeader>

        {/* ===================== */}
        {/* Category color grid   */}
        {/* ===================== */}
        <div className="py-4 max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No categories available.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => {
                const categoryId = item.Code;
                const name = item.Name;

                const defaultRgb = categoryColors[coloringAnnotation]?.[
                  categoryId
                ] ?? [180, 180, 180];

                const defaultColor = `rgb(${defaultRgb.join(", ")})`;

                const currentColor =
                  customColors[coloringAnnotation]?.[categoryId] ??
                  defaultColor;

                return (
                  <div
                    key={categoryId}
                    className="flex flex-col items-center p-2 border rounded-lg hover:bg-accent"
                  >
                    <span
                      className="text-xs font-medium mb-2 h-[2.5rem] text-center line-clamp-2"
                      title={name}
                    >
                      {name}
                    </span>

                    <ColorPicker
                      value={currentColor}
                      onChange={(color: string) => {
                        onCustomColorsChange({
                          ...customColors,
                          [coloringAnnotation]: {
                            ...(customColors[coloringAnnotation] ?? {}),
                            [categoryId]: color,
                          },
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===================== */}
        {/* Footer actions        */}
        {/* ===================== */}
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
};
