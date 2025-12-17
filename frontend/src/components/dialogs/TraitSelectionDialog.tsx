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
import { CircleCheckBigIcon, FrownIcon, ListRestartIcon } from "lucide-react";
import { TRAIT_GROUPS } from "../../config/constants";

interface TraitSelectionDialogProps {
  open: boolean;
  currentTrait: string | null;
  onOpenChange: (open: boolean) => void;
  onLoadTrait: (trait: string | null) => void;
}

export const TraitSelectionDialog: React.FC<TraitSelectionDialogProps> = ({
  open,
  currentTrait,
  onOpenChange,
  onLoadTrait,
}) => (
  <CommandDialog open={open} onOpenChange={onOpenChange}>
    <CommandInput placeholder="Search traits..." />
    <CommandList>
      <CommandEmpty>
        <div className="flex items-center flex-col text-center py-4">
          <FrownIcon className="h-4 w-4" />
          <span>No traits found</span>
        </div>
      </CommandEmpty>

      {/* Clear current selection */}
      {currentTrait && (
        <>
          <CommandGroup heading="Current Selection">
            <CommandItem
              onSelect={() => {
                onLoadTrait(null);
                onOpenChange(false);
              }}
            >
              <ListRestartIcon className="mr-0 h-4 w-4" />
              <span>Clear {currentTrait}</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
        </>
      )}

      {/* Grouped traits */}
      {TRAIT_GROUPS.map((group, groupIndex) => (
        <React.Fragment key={group.group}>
          {groupIndex > 0 && <CommandSeparator />}
          <CommandGroup heading={group.group}>
            {group.traits.map((trait) => (
              <CommandItem
                key={trait}
                onSelect={() => {
                  onLoadTrait(currentTrait === trait ? null : trait);
                  onOpenChange(false);
                }}
                value={trait}
                keywords={[trait, group.group]}
                className={
                  currentTrait === trait ? "bg-primary/10 font-medium" : ""
                }
              >
                {currentTrait === trait && (
                  <div className="mr-0 text-primary">
                    <span className="text-xs">
                      <CircleCheckBigIcon className="h-4 w-4 text-green-400" />
                    </span>
                  </div>
                )}
                <span>{trait}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </React.Fragment>
      ))}
    </CommandList>
  </CommandDialog>
);
