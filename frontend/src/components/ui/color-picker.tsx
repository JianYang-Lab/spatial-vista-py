"use client";

import { forwardRef, useMemo, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";
import { useForwardedRef } from "@/lib/use-forwarded-ref";
import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { PaletteIcon } from "lucide-react";

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  showColorPreview?: boolean; // 是否在按钮上显示颜色预览
}

const ColorPicker = forwardRef<
  HTMLInputElement,
  Omit<ButtonProps, "value" | "onChange" | "onBlur"> & ColorPickerProps
>(
  (
    {
      disabled,
      value,
      onChange,
      onBlur,
      name,
      className,
      size,
      showColorPreview = true, // 默认显示颜色预览
      ...props
    },
    forwardedRef,
  ) => {
    const ref = useForwardedRef(forwardedRef);
    const [open, setOpen] = useState(false);

    const parsedValue = useMemo(() => {
      return value || "#FFFFFF";
    }, [value]);

    return (
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild disabled={disabled} onBlur={onBlur}>
          {showColorPreview ? (
            <Button
              {...props}
              className={cn("block", className)}
              name={name}
              onClick={() => {
                setOpen(true);
              }}
              size={size}
              style={{
                backgroundColor: parsedValue,
              }}
              variant="outline"
            >
              <div />
            </Button>
          ) : (
            <Button
              {...props}
              className={cn("p-1", className)}
              name={name}
              onClick={() => {
                setOpen(true);
              }}
              size={size || "icon"}
              variant="ghost"
            >
              <PaletteIcon className="h-4 w-4" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3">
          <div className="space-y-2">
            <HexColorPicker color={parsedValue} onChange={onChange} />
            <Input
              maxLength={7}
              onChange={(e) => {
                onChange(e?.currentTarget?.value);
              }}
              ref={ref}
              value={parsedValue}
            />
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
ColorPicker.displayName = "ColorPicker";

export { ColorPicker };
