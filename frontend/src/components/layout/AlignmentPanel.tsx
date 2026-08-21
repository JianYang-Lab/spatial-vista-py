import { useEffect, useRef, useState } from "react";
import {
  DownloadIcon,
  HelpCircleIcon,
  MagnetIcon,
  RefreshCcwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { AlignmentMode, SectionTransform } from "@/utils/sectionAlignment";

type Option = { code: number; name: string };
export type AlignmentWorkflow = "fixed-first" | "sequential";

interface AlignmentPanelProps {
  sections: Option[];
  annotationKeys: string[];
  activeSection: number;
  referenceSection: number;
  annotationKey: string;
  transform: SectionTransform;
  adjustmentRange: number;
  allowAutoScale: boolean;
  alignmentMode: AlignmentMode;
  annotationWeight: number;
  autoAlignStatus: string;
  workflowRunning: boolean;
  onActiveSectionChange: (section: number) => void;
  onReferenceSectionChange: (section: number) => void;
  onAnnotationKeyChange: (key: string) => void;
  onTransformChange: (transform: SectionTransform) => void;
  onAllowAutoScaleChange: (enabled: boolean) => void;
  onAlignmentModeChange: (mode: AlignmentMode) => void;
  onAnnotationWeightChange: (weight: number) => void;
  onAutoAlign: () => void;
  onRunWorkflow: (workflow: AlignmentWorkflow) => void;
  onReset: () => void;
  onExport: () => void;
}

type NumericKey = "translateX" | "translateY" | "rotation" | "scale";

const NumericControl = ({
  label,
  field,
  value,
  min,
  max,
  step,
  showSlider = true,
  onDraftChange,
  onCommit,
}: {
  label: string;
  field: NumericKey;
  value: number;
  min: number;
  max: number;
  step: number;
  showSlider?: boolean;
  onDraftChange: (field: NumericKey, value: number) => void;
  onCommit: (field?: NumericKey, value?: number) => void;
}) => {
  const [text, setText] = useState(String(Number(value.toFixed(4))));

  useEffect(() => setText(String(Number(value.toFixed(4)))), [value]);

  const commitText = () => {
    const next = Number(text);
    if (!Number.isFinite(next) || (field === "scale" && next <= 0)) return;
    onDraftChange(field, next);
    onCommit(field, next);
  };

  return (
    <div className="space-y-1 text-xs">
      <label>
        <span>{label}</span>
        <Input
          aria-label={label}
          type="number"
          step={step}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitText();
          }}
        />
      </label>
      {showSlider && (
        <input
          aria-label={`${label} slider`}
          className="w-full accent-primary touch-none"
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          onChange={(event) => {
            const next = Number(event.target.value);
            onDraftChange(field, next);
            onCommit(field, next);
          }}
        />
      )}
    </div>
  );
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const XYPad = ({
  x,
  y,
  range,
  onDraft,
  onCommit,
}: {
  x: number;
  y: number;
  range: number;
  onDraft: (x: number, y: number) => void;
  onCommit: (x: number, y: number) => void;
}) => {
  const latest = useRef({ x, y });
  useEffect(() => {
    latest.current = { x, y };
  }, [x, y]);

  const positionFromPointer = (
    element: HTMLDivElement,
    clientX: number,
    clientY: number,
  ) => {
    const rect = element.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1) * range,
      y: clamp(1 - ((clientY - rect.top) / rect.height) * 2, -1, 1) * range,
    };
  };
  const update = (
    element: HTMLDivElement,
    clientX: number,
    clientY: number,
  ) => {
    const next = positionFromPointer(element, clientX, clientY);
    latest.current = next;
    onDraft(next.x, next.y);
  };

  return (
    <div
      aria-label="Move XY pad"
      role="application"
      className="relative h-32 w-full cursor-crosshair touch-none overflow-hidden rounded-md border bg-muted/30 select-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          update(event.currentTarget, event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        update(event.currentTarget, event.clientX, event.clientY);
        onCommit(latest.current.x, latest.current.y);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-border" />
      <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-border" />
      <div
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow"
        style={{
          left: `${50 + clamp(x / range, -1, 1) * 50}%`,
          top: `${50 - clamp(y / range, -1, 1) * 50}%`,
        }}
      />
      <span className="absolute bottom-1 right-1 text-[10px] text-muted-foreground">
        X / Y
      </span>
    </div>
  );
};

const RotationDial = ({
  rotation,
  onDraft,
  onCommit,
}: {
  rotation: number;
  onDraft: (rotation: number) => void;
  onCommit: (rotation: number) => void;
}) => {
  const latest = useRef(rotation);
  useEffect(() => {
    latest.current = rotation;
  }, [rotation]);
  const angleFromPointer = (
    element: HTMLDivElement,
    clientX: number,
    clientY: number,
  ) => {
    const rect = element.getBoundingClientRect();
    const angle =
      (Math.atan2(
        clientX - (rect.left + rect.width / 2),
        -(clientY - (rect.top + rect.height / 2)),
      ) *
        180) /
      Math.PI;
    return Math.round(angle * 2) / 2;
  };
  const update = (
    element: HTMLDivElement,
    clientX: number,
    clientY: number,
  ) => {
    const next = angleFromPointer(element, clientX, clientY);
    latest.current = next;
    onDraft(next);
  };

  return (
    <div
      aria-label="Rotation dial"
      role="application"
      className="relative mx-auto size-28 cursor-grab touch-none rounded-full border-2 bg-muted/30 select-none active:cursor-grabbing"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.currentTarget, event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          update(event.currentTarget, event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        update(event.currentTarget, event.clientX, event.clientY);
        onCommit(latest.current);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <div className="absolute inset-2 rounded-full border border-dashed border-border" />
      <div
        className="absolute inset-0"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <div className="absolute top-1 left-1/2 h-1/2 border-l-2 border-primary" />
        <div className="absolute top-0 left-1/2 size-3 -translate-x-1/2 rounded-full bg-primary" />
      </div>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
        {rotation.toFixed(1)}°
      </span>
    </div>
  );
};

export const AlignmentPanel = ({
  sections,
  annotationKeys,
  activeSection,
  referenceSection,
  annotationKey,
  transform,
  adjustmentRange,
  allowAutoScale,
  alignmentMode,
  annotationWeight,
  autoAlignStatus,
  workflowRunning,
  onActiveSectionChange,
  onReferenceSectionChange,
  onAnnotationKeyChange,
  onTransformChange,
  onAllowAutoScaleChange,
  onAlignmentModeChange,
  onAnnotationWeightChange,
  onAutoAlign,
  onRunWorkflow,
  onReset,
  onExport,
}: AlignmentPanelProps) => {
  const [draft, setDraft] = useState(transform);

  useEffect(() => setDraft(transform), [activeSection, transform]);

  const updateDraft = (field: NumericKey, value: number) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const commitDraft = (field?: NumericKey, value?: number) => {
    const next =
      field !== undefined && value !== undefined
        ? { ...draft, [field]: value }
        : draft;
    setDraft(next);
    onTransformChange(next);
  };
  const commitXY = (translateX: number, translateY: number) => {
    const next = { ...draft, translateX, translateY };
    setDraft(next);
    onTransformChange(next);
  };
  const commitRotation = (rotation: number) => {
    const next = { ...draft, rotation };
    setDraft(next);
    onTransformChange(next);
  };
  const previewTransform = (updates: Partial<SectionTransform>) => {
    const next = { ...draft, ...updates };
    setDraft(next);
    onTransformChange(next);
  };
  const reset = () => {
    onReset();
    setDraft({
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scale: 1,
      flipX: false,
      flipY: false,
    });
  };

  return (
    <Card className="w-full p-2 rounded-md">
      <CardHeader className="items-center px-1 pb-0">
        <CardTitle>Section Alignment</CardTitle>
        <CardAction>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                title="Alignment Help"
              >
                <HelpCircleIcon />
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-72 p-3" align="end">
              <div className="space-y-2 text-xs">
                <p>
                  Drag controls render immediately. Numeric inputs apply only
                  after pressing Enter.
                </p>
                <p>
                  Auto align tests rotation and all flip combinations using
                  annotation landmarks, tissue outlines, or both.
                </p>
                <p>
                  Automatic scale is optional and limited to 0.5–2×. Manual flip
                  buttons apply immediately.
                </p>
                <p>
                  First → all keeps the first section as reference. S1 → S2 → …
                  uses each aligned section as the reference for the next.
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 pb-0 space-y-3">
        <label className="block space-y-1 text-xs">
          <span>Reference section</span>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2"
            value={referenceSection}
            onChange={(event) =>
              onReferenceSectionChange(Number(event.target.value))
            }
          >
            {sections.map((section) => (
              <option key={section.code} value={section.code}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs">
          <span>Active section</span>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2"
            value={activeSection}
            onChange={(event) =>
              onActiveSectionChange(Number(event.target.value))
            }
          >
            {sections.map((section) => (
              <option key={section.code} value={section.code}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs">
          <span>Auto align method</span>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2"
            value={alignmentMode}
            onChange={(event) =>
              onAlignmentModeChange(event.target.value as AlignmentMode)
            }
          >
            <option value="hybrid">Hybrid (outline + annotation)</option>
            <option value="outline">Outline only</option>
            <option value="annotation">Annotation only</option>
          </select>
        </label>
        <label className="block space-y-1 text-xs">
          <span>Alignment annotation</span>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-2"
            value={annotationKey}
            onChange={(event) => onAnnotationKeyChange(event.target.value)}
          >
            {annotationKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        {alignmentMode === "hybrid" && (
          <label className="block space-y-1 text-xs">
            <span>
              Annotation weight: {Math.round(annotationWeight * 100)}%
            </span>
            <input
              aria-label="Annotation weight"
              className="w-full accent-primary"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={annotationWeight}
              onChange={(event) =>
                onAnnotationWeightChange(Number(event.target.value))
              }
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <NumericControl
            label="Move X"
            field="translateX"
            value={draft.translateX}
            min={-adjustmentRange}
            max={adjustmentRange}
            step={Math.max(adjustmentRange / 500, 0.01)}
            showSlider={false}
            onDraftChange={updateDraft}
            onCommit={commitDraft}
          />
          <NumericControl
            label="Move Y"
            field="translateY"
            value={draft.translateY}
            min={-adjustmentRange}
            max={adjustmentRange}
            step={Math.max(adjustmentRange / 500, 0.01)}
            showSlider={false}
            onDraftChange={updateDraft}
            onCommit={commitDraft}
          />
          <NumericControl
            label="Rotate (°)"
            field="rotation"
            value={draft.rotation}
            min={-180}
            max={180}
            step={0.5}
            showSlider={false}
            onDraftChange={updateDraft}
            onCommit={commitDraft}
          />
          <NumericControl
            label="Scale"
            field="scale"
            value={draft.scale}
            min={0.1}
            max={3}
            step={0.01}
            onDraftChange={updateDraft}
            onCommit={commitDraft}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <XYPad
            x={draft.translateX}
            y={draft.translateY}
            range={adjustmentRange}
            onDraft={(translateX, translateY) =>
              previewTransform({ translateX, translateY })
            }
            onCommit={commitXY}
          />
          <RotationDial
            rotation={draft.rotation}
            onDraft={(rotation) => previewTransform({ rotation })}
            onCommit={commitRotation}
          />
        </div>

        <div className="grid grid-cols-2 gap-1">
          <Button
            size="sm"
            variant={draft.flipX ? "default" : "outline"}
            onClick={() => {
              const next = { ...draft, flipX: !draft.flipX };
              setDraft(next);
              onTransformChange(next);
            }}
          >
            Flip X
          </Button>
          <Button
            size="sm"
            variant={draft.flipY ? "default" : "outline"}
            onClick={() => {
              const next = { ...draft, flipY: !draft.flipY };
              setDraft(next);
              onTransformChange(next);
            }}
          >
            Flip Y
          </Button>
        </div>

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={allowAutoScale}
            onChange={(event) => onAllowAutoScaleChange(event.target.checked)}
          />
          Allow Auto align to scale (limited to 0.5–2×)
        </label>
        <div className="grid grid-cols-2 gap-1">
          <Button
            size="sm"
            onClick={onAutoAlign}
            disabled={
              activeSection === referenceSection ||
              (alignmentMode === "annotation" && !annotationKey)
            }
          >
            <MagnetIcon /> Auto align
          </Button>
          <Button size="sm" variant="outline" onClick={reset}>
            <RefreshCcwIcon /> Reset section
          </Button>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium">Align all sections</div>
          <div className="grid grid-cols-2 gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={sections.length < 2 || workflowRunning}
              onClick={() => onRunWorkflow("fixed-first")}
            >
              First → all
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={sections.length < 2 || workflowRunning}
              onClick={() => onRunWorkflow("sequential")}
            >
              S1 → S2 → …
            </Button>
          </div>
        </div>
        {autoAlignStatus && (
          <p className="text-[11px] text-muted-foreground" role="status">
            {autoAlignStatus}
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onExport}
        >
          <DownloadIcon /> Export alignment JSON
        </Button>
      </CardContent>
    </Card>
  );
};
