/** Shared radar color system (spec #53) — used by canvas rendering and UI alike. */
export const THEME = {
  radarGreen: "#33ff99",
  radarGreenDim: "#1f7a55",
  radarGreenFaint: "rgba(51,255,153,0.14)",
  ring: "rgba(51,255,153,0.22)",
  ringStrong: "rgba(51,255,153,0.4)",
  sweepCore: "rgba(180,255,220,0.9)",
  aircraft: "#e7f3ef",
  aircraftStroke: "#8fada4",
  aircraftDim: "#9db3ac",
  military: "#c9d6de",
  militaryAccent: "#8fb0c9",
  selected: "#ffffff",
  selectedGlow: "rgba(255,255,255,0.55)",
  trail: "rgba(51,255,153,0.45)",
  visuallyRelevantGlow: "rgba(255,255,255,0.5)",
  label: "#c3d6d0",
  labelDim: "#7d938c",
  compass: "#5f8478",
} as const;

export const VISUALLY_RELEVANT_MILES = 2.2;
