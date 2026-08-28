"use client";

import { useEffect, type ReactNode } from "react";
import { setupGlobalErrorTracking } from "@/lib/error-tracking";

export function GlobalErrorHandler({ children }: { children: ReactNode }) {
  useEffect(() => {
    setupGlobalErrorTracking();
  }, []);

  return <>{children}</>;
}
