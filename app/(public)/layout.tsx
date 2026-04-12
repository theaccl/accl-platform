import type { Metadata } from "next";
import { Suspense } from "react";
import ReferralCapture from "@/components/public/ReferralCapture";

export const metadata: Metadata = {
  title: "ACCL — Watch live chess matches",
  description:
    "Discover ACCL — competitive chess with live spectate, real standings, and integrity-first tournaments.",
  openGraph: {
    title: "ACCL — Watch live chess matches",
    description: "Spectate live games and join free play.",
    type: "website",
  },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ReferralCapture />
      </Suspense>
      {children}
    </>
  );
}
