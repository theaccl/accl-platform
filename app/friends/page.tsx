"use client";

import NavigationBar from "@/components/NavigationBar";
import { FriendsPageClient } from "@/components/friends/FriendsPageClient";

export default function FriendsPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <FriendsPageClient />
    </div>
  );
}
