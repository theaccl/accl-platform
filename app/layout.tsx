import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PendingMatchRequestsBanner } from "@/components/PendingMatchRequestsBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <div
          style={{
            maxWidth: 500,
            margin: '0 auto',
            padding: '12px 16px',
            borderBottom: '1px solid #243244',
            background: '#0f1724',
          }}
        >
          <PendingMatchRequestsBanner />
        </div>
        {children}
      </body>
    </html>
  );
}
