import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../ui/chart";
import type { AnnotationType } from "../../config/annotations";
import { calculateMedian } from "../../utils/helpers";

interface LogpBarChartProps {
  annotationType: AnnotationType;
  annotationMap: Record<number, string>;
  colormap: Record<number, [number, number, number]>;
  hiddenCategoryIds: Record<AnnotationType, Set<number>>;
  selectedCategory: number | null;
  currentTrait: string | null;
  data: any;
}

export const LogpBarChart = React.memo(
  ({
    annotationType,
    annotationMap,
    colormap,
    hiddenCategoryIds,
    selectedCategory,
    currentTrait,
    data,
  }: LogpBarChartProps) => {
    // build config
    const chartConfig = useMemo(() => {
      const config: ChartConfig = {
        logp: {
          label: "Median logP",
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

    // cal median
    const categoryMedians = useMemo(() => {
      // valid check
      if (
        !data ||
        !data.extData ||
        !data.extData.logPs ||
        !currentTrait ||
        !data.extData.annotations[annotationType]
      ) {
        return {};
      }

      const annotationData = data.extData.annotations[annotationType];
      const logPs = data.extData.logPs;

      const logpsByCategory: Record<number, number[]> = {};

      // TODO: optimize performance for large dataset
      for (let i = 0; i < annotationData.length; i++) {
        const categoryId = Number(annotationData[i]);
        if (
          categoryId !== undefined &&
          categoryId !== null &&
          categoryId in annotationMap
        ) {
          if (!logpsByCategory[categoryId]) {
            logpsByCategory[categoryId] = [];
          }
          logpsByCategory[categoryId].push(logPs[i]);
        }
      }

      const medians: Record<number, number> = {};
      console.time("Calculate medians");
      for (const [categoryId, values] of Object.entries(logpsByCategory)) {
        medians[Number(categoryId)] = calculateMedian(values);
      }
      console.timeEnd("Calculate medians");

      return medians;
    }, [data, annotationType, currentTrait, annotationMap]); // only depend on data and annotationType

    const chartData = useMemo(() => {
      if (Object.keys(categoryMedians).length === 0) {
        return [];
      }

      return Object.entries(categoryMedians)
        .filter(
          ([categoryId]) => !currentHiddenCategories.has(Number(categoryId)),
        )
        .map(([categoryId, medianLogp]) => {
          const numId = Number(categoryId);
          const name = annotationMap[numId];
          const isSelected = selectedCategory === numId;

          return {
            category: name,
            logp: medianLogp,
            fill: colormap[numId]
              ? `rgb(${colormap[numId][0]}, ${colormap[numId][1]}, ${colormap[numId][2]})`
              : `var(--color-${name.toLowerCase().replace(/\s+/g, "-")})`,
            isSelected,
            opacity: selectedCategory !== null && !isSelected ? 0.5 : 1,
          };
        })
        .sort((a, b) => b.logp - a.logp);
    }, [
      categoryMedians,
      currentHiddenCategories,
      selectedCategory,
      annotationMap,
      colormap,
    ]);

    const shouldShowChart = Boolean(
      currentTrait && data && data.extData && data.extData.logPs,
    );

    return (
      <div className="w-full">
        {!shouldShowChart ? (
          <div className="flex items-center justify-center h-48 bg-muted/20 rounded-md">
            <p className="text-muted-foreground text-sm">
              {/*Select a trait to view logP values by category*/}
            </p>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mx-auto h-80 max-w-[100%] max-h-[600px]"
          >
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />

              <XAxis dataKey="logp" type="number" hide />
              <YAxis
                dataKey="category"
                type="category"
                axisLine={false}
                tickLine={false}
                tickMargin={5}
                tick={{ fontSize: 10 }}
                tickFormatter={
                  (value) =>
                    value.length >= 8 ? `${value.slice(0, 5)}...` : value
                  // value
                }
                minTickGap={0}
                tickSize={10}
              />
              {/*<ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name, entry) => (
                      <div className="flex justify-between w-full">
                        <span>
                          {entry.payload.category}
                          {entry.payload.isSelected ? " (Selected)" : ""}
                        </span>
                        <span className="ml-2">
                          LogP: {(value as number).toFixed(2)}
                        </span>
                      </div>
                    )}
                  />
                }
              />*/}
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Bar
                dataKey="logp"
                radius={[4, 4, 4, 4]}
                // fill with
                fill="var(--color-logp)"
                stroke={
                  chartData.length > 0 && selectedCategory !== null
                    ? "#000"
                    : undefined
                }
                strokeWidth={0.5}
                height={12}
              >
                {/*<LabelList
                  dataKey="category"
                  position="insideLeft"
                  offset={8}
                  className="fill-(--color-label)"
                  fontSize={10}
                />*/}
                {/*<LabelList
                  dataKey="logp"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  fontSize={12}
                  formatter={
                    (value: any) => (value as number).toFixed(2)
                    // value
                  }
                />*/}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </div>
    );
  },
);
