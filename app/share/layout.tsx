import type { Metadata } from "next";
import { Suspense } from "react";
import ReferralCapture from "@/components/public/ReferralCapture";

export const metadata: Metadata = {
  title: "ACCL — Competitive chess tournaments",
  description: "Share link for an ACCL match or event.",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ReferralCapture />
      </Suspense>
      {children}
    </>
  );
}
