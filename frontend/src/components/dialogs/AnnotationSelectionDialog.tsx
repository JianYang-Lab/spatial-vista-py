import React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import {
  CircleCheckIcon,
  CircleIcon,
  FrownIcon,
  PaintbrushIcon,
} from "lucide-react";
import { ANNOTATION_CONFIG } from "../../config/annotations";

interface AnnotationSelectionDialogProps {
  open: boolean;
  loadedAnnotations: Set<string>;
  coloringAnnotation: string;
  onOpenChange: (open: boolean) => void;
  onLoadAnnotation: (type: string) => void;
  onSetAnnotationForColoring: (type: string) => void;
}

export const AnnotationSelectionDialog: React.FC<
  AnnotationSelectionDialogProps
> = ({
  open,
  loadedAnnotations,
  coloringAnnotation,
  onOpenChange,
  onLoadAnnotation,
  onSetAnnotationForColoring,
}) => (
  <CommandDialog open={open} onOpenChange={onOpenChange}>
    <CommandInput placeholder="Search annotations..." />
    <CommandList>
      <CommandEmpty>
        <div className="flex items-center flex-col text-center py-4 text-muted-foreground">
          <FrownIcon className="h-4 w-4" />
          <span>No annotations found</span>
        </div>
      </CommandEmpty>

      {/* Loaded annotations */}
      {loadedAnnotations.size > 0 && (
        <>
          <CommandGroup heading="Loaded Annotations">
            {Array.from(loadedAnnotations).map((type) => (
              <CommandItem
                key={type}
                onSelect={() => {
                  onOpenChange(false);
                  onSetAnnotationForColoring(type);
                }}
                className={
                  coloringAnnotation === type ? "bg-primary/10 font-medium" : ""
                }
              >
                <span className="flex items-center gap-2">
                  {coloringAnnotation === type && (
                    <PaintbrushIcon className="h-4 w-4 text-green-400" />
                  )}
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </>
      )}

      {/* Available annotations */}
      <CommandGroup heading="Available Annotations">
        {ANNOTATION_CONFIG.availableTypes.map((type) => (
          <CommandItem
            key={type}
            onSelect={() => {
              onLoadAnnotation(type);
              onOpenChange(false);
            }}
            disabled={loadedAnnotations.has(type)}
          >
            <span className="flex items-center gap-2">
              {loadedAnnotations.has(type) && (
                <CircleCheckIcon className="h-4 w-4 text-green-400" />
              )}
              {!loadedAnnotations.has(type) && (
                <CircleIcon className="h-4 w-4" />
              )}
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  </CommandDialog>
);
