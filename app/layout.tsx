import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { PendingMatchRequestsBanner } from "@/components/PendingMatchRequestsBanner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
      className={`${inter.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AppProviders>
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
        </AppProviders>
      </body>
    </html>
  );
}
