import { redirect } from "next/navigation";

/**
 * Finished-game list lives under Trainer → Review. Per-game flows stay at `/finished/[id]/…`.
 */
export default function FinishedIndexPage() {
  redirect("/trainer/review");
}