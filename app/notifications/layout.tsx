import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications · ACCL",
  description: "Challenges, game results, tournaments, and system updates.",
};

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
