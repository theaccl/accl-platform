import type { Metadata } from "next";

import NavigationBar from "@/components/NavigationBar";
import { ImageGeneratorConceptReview } from "@/components/image-generator/concepts/ImageGeneratorConceptReview";

export const metadata: Metadata = {
  title: "Image Generator Concepts | ACCL",
  description: "Review five presentation systems for the ACCL Image Generator.",
};

export default function ImageGeneratorConceptsPage() {
  return (
    <div className="min-h-screen bg-[var(--accl-bg-base)] text-[var(--accl-text-primary)]">
      <NavigationBar />
      <main className="mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <ImageGeneratorConceptReview />
      </main>
    </div>
  );
}
