/**
 * How strongly a contact should read, given how far away it is.
 *
 * Without this, an aircraft thirty miles off is drawn exactly as loudly as one
 * overhead. Both are real and both belong on screen, but they are not equally
 * interesting, and on a busy afternoon the distant ones crowd out the aircraft
 * you could actually go outside and see.
 *
 * The scale is the range the scope is set to, the same one the radar's rings
 * use. That keeps the fade meaningful whichever range is chosen: on 30 miles
 * the far half recedes, and on 3 miles everything in that small world is close
 * and stays bright. It also means the cue always uses its full span rather
 * than bunching everything at one end.
 */

/** Everything nearer than this fraction of the range reads at full strength. */
const FULL_STRENGTH_FRACTION = 0.12;
/**
 * ...but never a shorter distance than this, whatever the range is set to.
 * Three miles is close by any measure — an airliner there is plainly visible —
 * so on the 3-mile range everything left in that small world stays bright
 * rather than the fade being squeezed into it and calling a nearby aircraft
 * faint.
 */
const ALWAYS_NEAR_MILES = 3;
/** How faint a contact at the very edge of range becomes. Never nothing. */
export const FAR_FLOOR = 0.15;
/** Above 1 the fade bites early and eases off; it matches how the eye reads haze. */
const FALLOFF_POWER = 1.6;

/**
 * 1 for an aircraft close by, falling to {@link FAR_FLOOR} at the edge of the
 * selected range. Anything beyond the range — the feed reaches a little past
 * it — simply sits at the floor rather than disappearing.
 */
export function depthProminence(distanceMiles: number, rangeMiles: number): number {
  if (!Number.isFinite(distanceMiles) || !Number.isFinite(rangeMiles) || rangeMiles <= 0) return 1;
  const near = Math.max(ALWAYS_NEAR_MILES, FULL_STRENGTH_FRACTION * rangeMiles);
  const distance = Math.max(0, distanceMiles);
  if (distance <= near || rangeMiles <= near) return 1;
  const beyond = Math.min(1, (distance - near) / (rangeMiles - near));
  return FAR_FLOOR + (1 - FAR_FLOOR) * Math.pow(1 - beyond, FALLOFF_POWER);
}

export type LabelDetail = "full" | "callsign" | "none";

/**
 * How much of a contact's label is worth the room it takes. Distance thins it
 * out — everything near by is named and described, further out only the
 * callsign survives, and further still the silhouette speaks for itself. This
 * is what actually buys back the screen: the plates, not the icons, are what
 * compete for space.
 *
 * The aircraft being hunted is exempt at any distance. Choosing one and then
 * watching its label thin out would be the app arguing with the user.
 */
export function labelDetailFor(prominence: number, selected: boolean): LabelDetail {
  if (selected) return "full";
  if (prominence >= 0.55) return "full";
  if (prominence >= 0.3) return "callsign";
  return "none";
}

/**
 * Opacity for a contact's silhouette. The floor is deliberately well above
 * nothing: fading a distant aircraft straight to the prominence floor made it
 * genuinely invisible — indistinguishable from the aim reticle it sat behind —
 * and an aircraft you cannot see is one you cannot tap either. Quiet is the
 * goal; gone is not.
 */
export function contactAlpha(prominence: number, selected: boolean): number {
  return selected ? 1 : 0.18 + 0.72 * prominence;
}

/**
 * Size multiplier for a contact's silhouette. Deliberately gentler than the
 * fade: shrinking alone reads as a smaller aeroplane rather than a further
 * one, and past a point it just makes the icon hard to recognise.
 */
export function contactScale(prominence: number, selected: boolean): number {
  return selected ? 1 : 0.62 + 0.38 * prominence;
}
