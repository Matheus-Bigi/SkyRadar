import { AircraftCategory, SilhouetteType } from "./types";

/**
 * Aircraft classification: turns raw type/operator/callsign hints from any
 * data provider into the category + silhouette used throughout the UI.
 * Keeping this isolated means a new provider only needs to supply the raw
 * hints — classification logic (and its quirks) lives in exactly one place.
 */

export interface ClassificationHints {
  aircraftType?: string; // ICAO type designator (e.g. "B738", "H60", "F16")
  aircraftModel?: string;
  operator?: string;
  airline?: string;
  callsign?: string;
  registration?: string;
  /** Some data sources flag this explicitly (e.g. ADS-B military hex ranges). */
  providerFlaggedMilitary?: boolean;
  /**
   * ADS-B emitter category as broadcast by the aircraft itself (e.g. "A7" =
   * rotorcraft, "A5" = heavy). Real telemetry, and often the only size/shape
   * hint available when a feed doesn't resolve the ICAO type designator.
   */
  emitterCategory?: string;
}

export interface Classification {
  category: AircraftCategory;
  silhouette: SilhouetteType;
  isMilitary: boolean;
}

type TypeEntry = {
  category: AircraftCategory;
  silhouette: SilhouetteType;
  military?: boolean;
};

// ICAO aircraft type designator -> classification. Not exhaustive —
// covers the aircraft an enthusiast is most likely to encounter locally.
const TYPE_TABLE: Record<string, TypeEntry> = {
  // Narrowbody / widebody jet airliners
  A19N: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A20N: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A21N: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A318: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A319: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A320: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A321: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A332: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A333: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A339: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A343: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A346: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A359: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A35K: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  A388: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B734: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B737: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B738: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B739: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B38M: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B39M: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B752: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B753: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B762: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B763: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B764: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B772: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B773: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B77W: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B788: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B789: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  B78X: { category: "AIRLINE", silhouette: "JET_AIRLINER" },
  MD11: { category: "AIRLINE", silhouette: "JET_AIRLINER" },

  // Regional jets
  CRJ2: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  CRJ7: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  CRJ9: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  CRJX: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  E170: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  E175: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  E190: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  E195: { category: "AIRLINE", silhouette: "REGIONAL_JET" },
  E75L: { category: "AIRLINE", silhouette: "REGIONAL_JET" },

  // Turboprop airliners / commuters
  AT45: { category: "AIRLINE", silhouette: "TURBOPROP" },
  AT72: { category: "AIRLINE", silhouette: "TURBOPROP" },
  AT76: { category: "AIRLINE", silhouette: "TURBOPROP" },
  DH8A: { category: "AIRLINE", silhouette: "TURBOPROP" },
  DH8B: { category: "AIRLINE", silhouette: "TURBOPROP" },
  DH8C: { category: "AIRLINE", silhouette: "TURBOPROP" },
  DH8D: { category: "AIRLINE", silhouette: "TURBOPROP" },
  SF34: { category: "AIRLINE", silhouette: "TURBOPROP" },
  E120: { category: "AIRLINE", silhouette: "TURBOPROP" },

  // General aviation piston / turboprop singles & twins
  C172: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  C182: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  C206: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  C210: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  C310: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  C340: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  C421: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  P28A: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  PA28: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  PA34: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  PA44: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  SR20: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  SR22: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  BE36: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  BE58: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  M20P: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  DA40: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  DA42: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  RV10: { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION" },
  PC12: { category: "GENERAL_AVIATION", silhouette: "TURBOPROP" },
  TBM8: { category: "GENERAL_AVIATION", silhouette: "TURBOPROP" },
  TBM9: { category: "GENERAL_AVIATION", silhouette: "TURBOPROP" },
  B350: { category: "GENERAL_AVIATION", silhouette: "TURBOPROP" },
  BE20: { category: "GENERAL_AVIATION", silhouette: "TURBOPROP" },
  // Business jets
  C25A: { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET" },
  C56X: { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET" },
  C68A: { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET" },
  GLF5: { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET" },
  GLF6: { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET" },
  E55P: { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET" },
  LJ45: { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET" },

  // Civilian helicopters
  R44: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  R66: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  EC30: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  EC35: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  EC45: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  AS50: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  AS55: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  B06: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  B407: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  B429: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  H125: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  H135: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  H145: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  S76: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  S92: { category: "HELICOPTER", silhouette: "HELICOPTER" },
  EN28: { category: "HELICOPTER", silhouette: "HELICOPTER" },

  // Military helicopters
  H60: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  UH60: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  MH60: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  HH60: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  AH64: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  AH1: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  UH1: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  CH47: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  CH53: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  MI8: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  MI24: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  NH90: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },
  H225M: {
    category: "MILITARY",
    silhouette: "MILITARY_HELICOPTER",
    military: true,
  },

  // Fighters
  F15: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  F16: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  F18: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  F22: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  F35: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  EUFI: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  TYPH: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  RFAL: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  GRPN: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  MIG29: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  SU27: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  F5: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  F14: { category: "MILITARY", silhouette: "FIGHTER", military: true },
  T38: { category: "MILITARY", silhouette: "FIGHTER", military: true },

  // Military transport / tanker / patrol / AWACS
  C130: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  C17: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  C5: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  C27: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  A400: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  KC135: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  KC46: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  E3: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  E6: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  P8: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  C12: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  U2: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
  T6: {
    category: "MILITARY",
    silhouette: "MILITARY_TRANSPORT",
    military: true,
  },
};

const MILITARY_OPERATOR_PATTERN =
  /\b(air force|air national guard|army|navy|marine|coast guard|national guard|defen[cs]e|luftwaffe|raf\b|rcaf|usaf|usn|usmc|uscg)\b/i;

const MILITARY_CALLSIGN_PATTERN =
  /^(RCH|REACH|CNV|CONVOY|SAM|NAVY|ARMY|MARINE|GUARD|EAGLE|VIPER|HAWK|VENOM|RAGE|TRACK|DUKE|BOXER|POLAR|SLAM|COBRA|SPAR|SENTRY|IRON|ARDOR|FEED)\d*/i;

function normalizeTypeCode(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.trim().toUpperCase();
}

export function classifyAircraft(hints: ClassificationHints): Classification {
  const type = normalizeTypeCode(hints.aircraftType);
  const tableEntry = type ? TYPE_TABLE[type] : undefined;

  const operatorText = `${hints.operator ?? ""} ${hints.airline ?? ""}`;
  const operatorLooksMilitary = MILITARY_OPERATOR_PATTERN.test(operatorText);
  const callsignLooksMilitary = hints.callsign
    ? MILITARY_CALLSIGN_PATTERN.test(hints.callsign.trim())
    : false;

  const isMilitary = Boolean(
    hints.providerFlaggedMilitary ||
      tableEntry?.military ||
      operatorLooksMilitary ||
      callsignLooksMilitary
  );

  if (tableEntry) {
    if (isMilitary && !tableEntry.military) {
      // Same airframe, government-operated (e.g. a Coast Guard or National
      // Guard C-130 vs. a civilian one is unusual, but Beechcraft King Airs,
      // Gulfstreams, and helicopters are commonly used by both worlds).
      return {
        category: "MILITARY",
        silhouette:
          tableEntry.silhouette === "HELICOPTER"
            ? "MILITARY_HELICOPTER"
            : tableEntry.silhouette,
        isMilitary: true,
      };
    }
    return {
      category: tableEntry.category,
      silhouette: tableEntry.silhouette,
      isMilitary: Boolean(tableEntry.military),
    };
  }

  if (isMilitary) {
    return { category: "MILITARY", silhouette: "MILITARY_TRANSPORT", isMilitary: true };
  }

  // Unknown type: fall back to heuristics on model text.
  const modelText = (hints.aircraftModel ?? "").toLowerCase();
  if (/helicopter|heli\b/.test(modelText)) {
    return { category: "HELICOPTER", silhouette: "HELICOPTER", isMilitary: false };
  }

  // Still unknown: use the aircraft's own broadcast emitter category. This is
  // real ADS-B telemetry, not a guess about the airframe — it only tells us
  // rough size/class, which is exactly what picking a silhouette needs.
  switch (hints.emitterCategory?.trim().toUpperCase()) {
    case "A7":
      return { category: "HELICOPTER", silhouette: "HELICOPTER", isMilitary: false };
    case "A1":
      return { category: "GENERAL_AVIATION", silhouette: "GENERAL_AVIATION", isMilitary: false };
    case "A2":
      return { category: "GENERAL_AVIATION", silhouette: "REGIONAL_JET", isMilitary: false };
    case "A3":
    case "A4":
    case "A5":
      return { category: "AIRLINE", silhouette: "JET_AIRLINER", isMilitary: false };
    case "A6":
      return { category: "MILITARY", silhouette: "FIGHTER", isMilitary: true };
    default:
      break;
  }

  return { category: "OTHER", silhouette: "OTHER", isMilitary: false };
}
