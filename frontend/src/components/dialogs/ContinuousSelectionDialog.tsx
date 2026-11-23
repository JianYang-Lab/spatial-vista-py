import React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui//command";
import { CircleCheckBigIcon, FrownIcon, ListRestartIcon } from "lucide-react";

import type { ContinuousField } from "@/types";

interface ContinuousSelectionDialogProps {
  open: boolean;
  kind?: "all" | "traits";
  activeContinuous: string | null;
  continuousFields: Record<string, ContinuousField>;
  onOpenChange: (open: boolean) => void;
  onSelectContinuous: (name: string | null) => void;
}

export const ContinuousSelectionDialog: React.FC<
  ContinuousSelectionDialogProps
> = ({
  open,
  kind = "all",
  activeContinuous,
  continuousFields,
  onOpenChange,
  onSelectContinuous,
}) => {
  // const fields = Object.values(continuousFields);

  const geneFields = Object.values(continuousFields).filter(
    (f) => f.ContinuousConfig.Source === "gene",
  );

  const obsFields = Object.values(continuousFields).filter(
    (f) => f.ContinuousConfig.Source === "obs",
  );
  const traitFields = Object.values(continuousFields).filter(
    (f) => f.ContinuousConfig.Source === "gsmap",
  );
  // Search traits by their label only: the hashed column names would make
  // fuzzy search match unrelated traits. Keep item values unique.
  const otherNames = new Set(
    [...obsFields, ...geneFields].map((field) => field.name),
  );
  const traitValue = (label: string) =>
    otherNames.has(label) ? `${label} (gsMap)` : label;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "traits" ? "Query gsMap traits" : "Query numeric fields"}
      description="Search and select a field to color the spatial map."
    >
      <CommandInput
        placeholder={
          kind === "traits"
            ? "Search gsMap traits..."
            : "Search numeric fields..."
        }
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex items-center flex-col text-center py-4">
            <FrownIcon className="h-4 w-4" />
            <span>
              No {kind === "traits" ? "gsMap traits" : "numeric fields"} found
            </span>
          </div>
        </CommandEmpty>

        {/* Clear current selection */}
        {activeContinuous && (
          <>
            <CommandGroup heading="Current Selection">
              <CommandItem
                onSelect={() => {
                  onSelectContinuous(null);
                  onOpenChange(false);
                }}
              >
                <ListRestartIcon className="mr-2 h-4 w-4" />
                <span>
                  Clear{" "}
                  {continuousFields[activeContinuous]?.ContinuousConfig.Label ??
                    activeContinuous}
                </span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {traitFields.length > 0 && (
          <CommandGroup heading="gsMap Traits · −log10(P)">
            {traitFields.map((field) => {
              const config = field.ContinuousConfig;
              const label = config.Label ?? field.name;
              const isActive = activeContinuous === field.name;
              return (
                <CommandItem
                  key={field.name}
                  value={traitValue(label)}
                  onSelect={() => {
                    onSelectContinuous(isActive ? null : field.name);
                    onOpenChange(false);
                  }}
                  className={isActive ? "bg-primary/10 font-medium" : ""}
                >
                  {isActive && (
                    <CircleCheckBigIcon className="mr-2 h-4 w-4 text-green-500" />
                  )}
                  <div className="flex flex-col flex-1">
                    <span>{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {config.Unit} · [{config.Min.toFixed(2)},{" "}
                      {config.Max.toFixed(2)}]
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {/* Continuous fields */}
        {kind !== "traits" && (
          <>
            <CommandGroup heading="Continuous Fields">
              {obsFields.map((field) => {
                const isActive = activeContinuous === field.name;

                return (
                  <CommandItem
                    key={field.name}
                    value={field.name}
                    keywords={[field.name, field.ContinuousConfig.Source]}
                    onSelect={() => {
                      onSelectContinuous(isActive ? null : field.name);
                      onOpenChange(false);
                    }}
                    className={isActive ? "bg-primary/10 font-medium" : ""}
                  >
                    {isActive && (
                      <span className="mr-2 text-green-400">
                        <CircleCheckBigIcon className="h-4 w-4" />
                      </span>
                    )}

                    <div className="flex flex-col flex-1">
                      <span>{field.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {field.ContinuousConfig.Source} · [
                        {field.ContinuousConfig.Min.toFixed(2)},{" "}
                        {field.ContinuousConfig.Max.toFixed(2)}]
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {/* Gene fields */}
            <CommandGroup heading="Gene Expression">
              {geneFields.map((field) => {
                const isActive = activeContinuous === field.name;

                return (
                  <CommandItem
                    key={field.name}
                    value={field.name}
                    keywords={[field.name, field.ContinuousConfig.Source]}
                    onSelect={() => {
                      onSelectContinuous(isActive ? null : field.name);
                      onOpenChange(false);
                    }}
                    className={isActive ? "bg-primary/10 font-medium" : ""}
                  >
                    {isActive && (
                      <span className="mr-2 text-green-400">
                        <CircleCheckBigIcon className="h-4 w-4" />
                      </span>
                    )}

                    <div className="flex flex-col flex-1">
                      <span>{field.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {field.ContinuousConfig.Source} · [
                        {field.ContinuousConfig.Min.toFixed(2)},{" "}
                        {field.ContinuousConfig.Max.toFixed(2)}]
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};
