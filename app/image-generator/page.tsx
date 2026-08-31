import type { Metadata } from "next";

import NavigationBar from "@/components/NavigationBar";
import { ImageGeneratorCreateScreen } from "@/components/image-generator/ImageGeneratorCreateScreen";

export const metadata: Metadata = {
  title: "Image Generator | ACCL",
  description: "Create private profile-image candidates with ACCL Generation Tokens.",
};

export default function ImageGeneratorPage() {
  return (
    <div className="min-h-screen bg-[var(--accl-bg-base)] text-[var(--accl-text-primary)]">
      <NavigationBar />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <ImageGeneratorCreateScreen />
      </main>
    </div>
  );
}
