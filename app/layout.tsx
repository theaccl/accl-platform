import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { PendingMatchRequestsBanner } from "@/components/PendingMatchRequestsBanner";

export const metadata: Metadata = {
  title: "ACCL",
  description: "Competitive chess — live play, tournaments, and integrity-first events.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <AppProviders>
          <div className="accl-nav-pending-banner mx-auto max-w-[500px] border-b border-[var(--accl-border-muted)] bg-[var(--accl-bg-elevated)] px-4 py-3">
            <PendingMatchRequestsBanner />
          </div>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
