import { AircraftDataProvider, AircraftProviderResult, AircraftQuery } from "../types";

/**
 * Tries several real data sources in order and returns the first that
 * answers. Only ever yields data a provider actually returned — if every
 * source fails, this throws with all their errors attached, so the route
 * can report "live data unavailable" (and say why) instead of inventing
 * traffic.
 *
 * The whole chain shares one deadline: serverless requests have a hard
 * ceiling, and three sequential timeouts would blow past it.
 */
export class FailoverAircraftProvider implements AircraftDataProvider {
  readonly name: string;

  constructor(
    private readonly providers: AircraftDataProvider[],
    private readonly totalBudgetMs = 8500
  ) {
    this.name = providers.map((p) => p.name).join(">");
  }

  async fetchAircraft(query: AircraftQuery): Promise<AircraftProviderResult> {
    const controller = new AbortController();
    const budget = setTimeout(() => controller.abort(new Error("budget exhausted")), this.totalBudgetMs);
    const failures: string[] = [];

    try {
      for (const provider of this.providers) {
        if (controller.signal.aborted) break;
        try {
          return await provider.fetchAircraft({ ...query, signal: controller.signal });
        } catch (err) {
          failures.push(`${provider.name}: ${errorText(err)}`);
        }
      }
    } finally {
      clearTimeout(budget);
    }

    throw new Error(
      failures.length > 0 ? failures.join("; ") : "no aircraft data providers configured"
    );
  }
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}
