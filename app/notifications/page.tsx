"use client";

import NavigationBar from "@/components/NavigationBar";
import { NotificationsPageClient } from "@/components/notifications/NotificationsPageClient";

export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <NotificationsPageClient />
    </div>
  );
}
