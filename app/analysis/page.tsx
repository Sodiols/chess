import type { Metadata } from "next";
import { AnalysisSession } from "@/components/game/AnalysisSession";

export const metadata: Metadata = { title: "Analysis", robots: { index: false, follow: false } };

export default function AnalysisPage() {
  return <AnalysisSession />;
}
