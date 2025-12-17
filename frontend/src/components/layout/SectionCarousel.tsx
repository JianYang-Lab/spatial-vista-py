import React, { useState, useEffect } from "react";
import { LoaderIcon } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "../ui/carousel";
import { Card, CardContent } from "../ui/card";

// section carousel component props
export interface SectionCarouselProps {
  showPointCloud: boolean;
  showScatterplot: boolean;
  availableSectionIDs: number[];
  currentSectionID: number;
  onSectionClick: (sectionID: number) => void;
  sectionPreviews: Record<number, string>;
}

export const SectionCarousel: React.FC<SectionCarouselProps> = ({
  showPointCloud,
  showScatterplot,
  availableSectionIDs,
  currentSectionID,
  onSectionClick,
  sectionPreviews,
}) => {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  // watch currentSectionID and scroll carousel to the corresponding item
  useEffect(() => {
    if (!showPointCloud && showScatterplot && availableSectionIDs.length > 0) {
      if (carouselApi && currentSectionID !== null) {
        const index = availableSectionIDs.findIndex(
          (id) => id === currentSectionID,
        );
        if (index !== -1) {
          setTimeout(() => {
            carouselApi.scrollTo(index, false);
          }, 0);
        }
      }
    }
  }, [
    currentSectionID,
    carouselApi,
    availableSectionIDs,
    showPointCloud,
    showScatterplot,
  ]);

  if (showPointCloud || !showScatterplot || availableSectionIDs.length === 0) {
    return null;
  }

  // component UI
  return (
    <>
      <Carousel
        opts={{
          align: "center",
          loop: true,
          dragFree: true,
          // duration: 2000,
        }}
        setApi={setCarouselApi}
        className="w-full"
      >
        <CarouselContent className="-ml-2">
          {availableSectionIDs.map((sectionId) => (
            <CarouselItem
              key={sectionId}
              className="pl-2 basis-1/6 md:basis-1/8 lg:basis-1/10"
            >
              <Card
                className={`cursor-pointer transition-all py-1 ${
                  currentSectionID === sectionId
                    ? "border-2 border-primary bg-background/40"
                    : "border border-border hover:border-primary/50 bg-background/40 hover:bg-background/60"
                }`}
                onClick={() => onSectionClick(sectionId)}
              >
                <CardContent className="p-0 aspect-square relative flex items-center justify-center h-20">
                  {/* loaded preview img or loading icon */}
                  {sectionPreviews[sectionId] ? (
                    <img
                      src={sectionPreviews[sectionId]}
                      alt={`Section ${sectionId}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30">
                      <LoaderIcon className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0  text-center">
                    <span className="text-sm font-medium">
                      Section {sectionId}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="h-8 w-8" />
        <CarouselNext className="h-8 w-8" />
      </Carousel>
    </>
  );
};
