import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Không gian làm việc",
  robots: { index: false, follow: false },
};

/** Forward-compat alias: the staff workspace lives at `/`. */
export default function WorkspaceAlias() {
  redirect("/");
}
