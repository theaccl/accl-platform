import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mailbox · ACCL",
  description: "Direct messages with other players.",
};

export default function MailboxLayout({ children }: { children: React.ReactNode }) {
  return children;
}
