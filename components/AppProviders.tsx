"use client";

import type { ReactNode } from "react";
import { PublicIdentityCardProvider } from "@/components/identity/PublicIdentityCardContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return <PublicIdentityCardProvider>{children}</PublicIdentityCardProvider>;
}
