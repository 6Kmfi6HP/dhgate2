"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

export interface ImageLightboxProps {
  images: Array<{
    url: string;
    thumbnail: string;
  }>;
  index?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ 
  images = [],
  index = 0,
  open,
  onOpenChange
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(index);

  useEffect(() => {
    setCurrentIndex(index);
  }, [index]);

  if (!images.length) {
    return null;
  }

  const showNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const showPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const safeIndex = Math.max(0, Math.min(currentIndex, images.length - 1));
  const currentImage = images[safeIndex];

  if (!currentImage) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/90">
        <div className="relative w-full h-[80vh]">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-50 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full h-full">
              <Image
                src={currentImage.url}
                alt={`Review image ${safeIndex + 1}`}
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={showPrevious}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={showNext}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((_, index) => (
                  <button
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === safeIndex ? "bg-white" : "bg-white/50"
                    }`}
                    onClick={() => setCurrentIndex(index)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 