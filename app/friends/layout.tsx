import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Friends · ACCL",
  description: "People you connect with — quick view and profile links.",
};

export default function FriendsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
