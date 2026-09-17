import { AircraftCategory } from "./types";

/**
 * What each category is called, in the three places a category gets named.
 *
 * One table rather than three, because they have to agree: a category ticked
 * as "Military aircraft" in Settings, shown as "MILITARY" in the filter rail
 * and announced as "MILITARY" by the proximity alarm has to read as the same
 * thing in all three, or the alarm looks like it is talking about something
 * else.
 *
 * - `short` fits the narrow control rail.
 * - `full` is the unabbreviated name, for Settings and for screen readers.
 * - `alert` is how the alarm banner says it, which is not always either of
 *   the other two: "OTHER WITHIN 3 MI" is not English, and what that category
 *   actually means — an aircraft the classifier could not place — is better
 *   said as "UNIDENTIFIED".
 */
export const CATEGORY_LABELS: Record<
  AircraftCategory,
  { short: string; full: string; alert: string }
> = {
  AIRLINE: { short: "AIRLINE", full: "Airliners", alert: "AIRLINER" },
  MILITARY: { short: "MILITARY", full: "Military aircraft", alert: "MILITARY" },
  HELICOPTER: { short: "HELI", full: "Helicopters", alert: "HELICOPTER" },
  GENERAL_AVIATION: {
    short: "GA",
    full: "General aviation",
    alert: "GENERAL AVIATION",
  },
  OTHER: { short: "OTHER", full: "Other aircraft", alert: "UNIDENTIFIED" },
};

/**
 * The categories the proximity alarm colours red rather than green.
 *
 * Everything else approaching is worth a glance; these two are worth a start.
 * Red is reserved for them so that the colour itself carries information — if
 * every alarm were red, the colour would only mean "an alarm", and the one
 * that matters would look like all the others.
 */
export const URGENT_CATEGORIES: AircraftCategory[] = ["MILITARY", "OTHER"];

export type AlertTone = "red" | "green";

/** Red if anything urgent is among them, green otherwise. */
export function toneFor(categories: AircraftCategory[]): AlertTone {
  return categories.some((c) => URGENT_CATEGORIES.includes(c)) ? "red" : "green";
}
