import React, { useMemo } from "react";
import { Pie, PieChart, Sector } from "recharts";
import { Label as PieLabel } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart";
import type { AnnotationType } from "../../config/annotations";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

interface AnnotationPieChartProps {
  annotationType: AnnotationType;
  annotationMap: Record<number, string>;
  colormap: Record<number, [number, number, number]>;
  hiddenCategoryIds: Record<AnnotationType, Set<number>>;
  selectedCategory: number | null;
  data: any;
}

export const AnnotationPieChart = React.memo(
  ({
    annotationType,
    annotationMap,
    colormap,
    hiddenCategoryIds,
    selectedCategory,
    data,
  }: AnnotationPieChartProps) => {
    // chart config
    const chartConfig = useMemo(() => {
      const config: ChartConfig = {
        category: {
          label: "Category",
        },
      };

      // assign colors from colormap or fallback colors
      Object.entries(annotationMap).forEach(([id, name]) => {
        const numId = Number(id);
        const color = colormap[numId]
          ? `rgb(${colormap[numId][0]}, ${colormap[numId][1]}, ${colormap[numId][2]})`
          : `var(--chart-${(numId % 10) + 1})`;

        config[name] = {
          label: name,
          color: color,
        };
      });

      return config;
    }, [annotationMap, colormap]);

    // get hidden categories for current annotation type
    const currentHiddenCategories = useMemo(
      () => hiddenCategoryIds[annotationType] || new Set<number>(),
      [hiddenCategoryIds, annotationType],
    );

    // pre compute category counts and total points - only depend on data and annotationType
    const { categoryCounts, totalPoints } = useMemo(() => {
      // init
      const result = {
        categoryCounts: {} as Record<number, number>,
        totalPoints: 0,
      };

      // check data validity
      if (
        !data ||
        !data.extData ||
        !data.extData.annotations ||
        !data.extData.annotations[annotationType]
      ) {
        return result;
      }

      const annotationData = data.extData.annotations[annotationType];
      if (!annotationData) {
        return result;
      }

      result.totalPoints = annotationData.length;

      // TODO: optimize counting performance for large dataset
      console.time("Count categories");
      const counts: Record<number, number> = {};
      Object.keys(annotationMap).forEach((id) => {
        counts[Number(id)] = 0;
      });

      for (let i = 0; i < result.totalPoints; i++) {
        const categoryId = Number(annotationData[i]);
        if (categoryId in counts) {
          counts[categoryId]++;
        }
      }
      console.timeEnd("Count categories");

      result.categoryCounts = counts;
      return result;
    }, [data, annotationType, annotationMap]);

    // prepare data for display - consider UI state (hidden and selected categories)
    const chartData = useMemo(() => {
      // if no category counts, return empty array
      if (Object.keys(categoryCounts).length === 0) {
        return [];
      }

      // build chart data array
      return Object.entries(categoryCounts)
        .filter(([id]) => !currentHiddenCategories.has(Number(id)))
        .map(([id, count]) => {
          const numId = Number(id);
          const name = annotationMap[numId];
          const color = colormap[numId]
            ? `rgb(${colormap[numId][0]}, ${colormap[numId][1]}, ${colormap[numId][2]})`
            : undefined;
          const isSelected = selectedCategory === numId;

          return {
            id: numId,
            name: name,
            value: count,
            count: count,
            percentage: ((count / totalPoints) * 100).toFixed(2),
            fill:
              color ||
              `var(--color-${name.toLowerCase().replace(/\s+/g, "-")})`,
            isSelected, // if activate/selected
            opacity: selectedCategory !== null && !isSelected ? 0.5 : 1,
          };
        });
    }, [
      categoryCounts,
      totalPoints,
      currentHiddenCategories,
      selectedCategory,
      annotationMap,
      colormap,
    ]);

    // displayed total count (after filtering hidden categories)
    const displayedTotalCount = useMemo(
      () => chartData.reduce((sum, item) => sum + item.count, 0),
      [chartData],
    );

    return (
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square max-h-[250px]"
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name, entry) => (
                  <div className="flex justify-between w-full">
                    <span>
                      {name}
                      {entry.payload.isSelected ? " (Selected)" : ""}
                    </span>
                    <span className="ml-2">
                      {value.toLocaleString()} ({entry.payload.percentage}%)
                    </span>
                  </div>
                )}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            paddingAngle={1}
            activeShape={({ outerRadius = 0, ...props }: PieSectorDataItem) => (
              <Sector {...props} outerRadius={outerRadius + 15} />
            )}
            activeIndex={chartData.findIndex((item) => item.isSelected)}
          >
            <PieLabel
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground text-xl font-bold"
                      >
                        {/* human-readble count 2016700 => 2016k  */}
                        {/*{displayedTotalCount.toLocaleString()}*/}
                        {displayedTotalCount >= 1000
                          ? `${(displayedTotalCount / 1000).toFixed(1)}k`
                          : displayedTotalCount.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 24}
                        className="fill-muted-foreground text-sm"
                      >
                        Cells
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    );
  },
);
