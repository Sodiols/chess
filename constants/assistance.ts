import type { AssistanceConfig, AssistanceMode } from "@/types";

export const ASSISTANCE: Record<AssistanceMode, AssistanceConfig> = {
  beginner: {
    showLegalMoves: true,
    distinguishCaptures: true,
    highlightCaptureTargets: true,
    highlightSpecialMoves: true,
    showPinIndicator: true,
    coachMessages: true,
    pieceNames: true,
    checkEmphasis: "strong",
    defaultAllowUndo: true,
  },
  medium: {
    showLegalMoves: true,
    distinguishCaptures: true,
    highlightCaptureTargets: false,
    highlightSpecialMoves: false,
    showPinIndicator: false,
    coachMessages: false,
    pieceNames: false,
    checkEmphasis: "clear",
    defaultAllowUndo: false,
  },
  pro: {
    showLegalMoves: false,
    distinguishCaptures: false,
    highlightCaptureTargets: false,
    highlightSpecialMoves: false,
    showPinIndicator: false,
    coachMessages: false,
    pieceNames: false,
    checkEmphasis: "subtle",
    defaultAllowUndo: false,
  },
};

export const MODE_DETAILS: Record<
  AssistanceMode,
  { name: string; tagline: string; summary: string; points: string[] }
> = {
  beginner: {
    name: "Beginner",
    tagline: "Learn while you play",
    summary: "Maximum assistance",
    points: [
      "Legal moves and captures marked",
      "Pin and check explanations",
      "Plain-language guidance",
    ],
  },
  medium: {
    name: "Medium",
    tagline: "Just the essentials",
    summary: "Legal move guidance",
    points: ["Legal moves marked", "Captures distinguished", "No coaching"],
  },
  pro: {
    name: "Pro",
    tagline: "Pure chess",
    summary: "No move assistance",
    points: ["No move markers", "Illegal moves simply refused", "Board only"],
  },
};

export const MODE_ORDER: AssistanceMode[] = ["beginner", "medium", "pro"];
