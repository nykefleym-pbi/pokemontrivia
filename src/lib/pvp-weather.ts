/**
 * Phase 5 — weather-conflict resolution for the three weather mascots, kept
 * pure/testable like `pvp-combat.ts`. Now that both sides' partner dex ids are
 * known (Phase 1's `*_partner_id` columns), the live loop can decide, for a
 * given side, whether its standing weather-driven stat effect is active this
 * match.
 *
 * The three sources:
 *   • Kyogre (382) — Primordial Deluge (rain): +1 Attack / +1 Speed standing.
 *   • Groudon (383) — Scorched Earth (sun): +1 Attack + opponent −1 Speed.
 *   • Rayquaza (384) — Sky-Splitting Ascent (Air Lock): NO standing weather
 *     stat effect of its own; its payoff is the manual Dragon Ascent crit burst.
 *
 * Accepted product rule (prior pass):
 *   1. Rayquaza on EITHER side negates BOTH Kyogre's and Groudon's standing
 *      weather stat effects for the whole match.
 *   2. Else, if both a rain source and a sun source are present, "latest
 *      (re-)established weather wins": the side whose weather most recently
 *      applied owns the field; the other is suppressed until it re-establishes.
 *      A turn-1 tie (no owner yet) breaks in the HOST's favour.
 *   3. Mirror matchups (both Kyogre, or both Groudon) get no special
 *      interaction — each side's weather resolves independently.
 */

export const KYOGRE_ID = 382;
export const GROUDON_ID = 383;
export const RAYQUAZA_ID = 384;

export type WeatherKind = "rain" | "sun" | "air_lock" | null;

/** The weather a partner brings, or null if it isn't a weather mascot. */
export function weatherKindFor(partnerId: number | null | undefined): WeatherKind {
  switch (partnerId) {
    case KYOGRE_ID:
      return "rain";
    case GROUDON_ID:
      return "sun";
    case RAYQUAZA_ID:
      return "air_lock";
    default:
      return null;
  }
}

/** True if this partner brings a standing weather STAT effect (Kyogre/Groudon).
 * Rayquaza does not (its payoff is a manual crit burst), so it returns false. */
export function isWeatherStatSource(partnerId: number | null | undefined): boolean {
  return partnerId === KYOGRE_ID || partnerId === GROUDON_ID;
}

export type Side = "host" | "guest";

export interface WeatherConflictInput {
  hostPartnerId: number | null | undefined;
  guestPartnerId: number | null | undefined;
  /** Which side most recently (re-)established weather this match, per the
   * server's `weather_owner`; null until the first weather application. */
  weatherOwner?: Side | null;
}

export interface WeatherResolution {
  /** Rayquaza present on either side (Air Lock active). */
  rayquazaPresent: boolean;
  /** Both a rain source and a sun source are present (the conflict case). */
  opposingWeather: boolean;
  /** The side that currently owns the field (turn-1 tie → host), or null when
   * there is no weather stat source in play at all. */
  ownerSide: Side | null;
  /** Is the host's standing weather stat effect active right now? */
  hostWeatherActive: boolean;
  /** Is the guest's standing weather stat effect active right now? */
  guestWeatherActive: boolean;
}

/**
 * Resolve, for the current match state, whether each side's standing weather
 * stat effect is active. Pure and deterministic.
 */
export function resolveWeatherConflict(input: WeatherConflictInput): WeatherResolution {
  const hostKind = weatherKindFor(input.hostPartnerId);
  const guestKind = weatherKindFor(input.guestPartnerId);
  const rayquazaPresent = hostKind === "air_lock" || guestKind === "air_lock";

  const hostIsSource = isWeatherStatSource(input.hostPartnerId);
  const guestIsSource = isWeatherStatSource(input.guestPartnerId);
  const opposingWeather =
    hostIsSource && guestIsSource && weatherKindFor(input.hostPartnerId) !== weatherKindFor(input.guestPartnerId);

  // Rule 1 — Rayquaza negates both sides' weather stat effects.
  if (rayquazaPresent) {
    return {
      rayquazaPresent: true,
      opposingWeather,
      ownerSide: null,
      hostWeatherActive: false,
      guestWeatherActive: false,
    };
  }

  // Rule 2 — opposing weather (one rain, one sun): latest establisher wins,
  // turn-1 tie to host. The non-owner's weather is suppressed.
  if (opposingWeather) {
    const ownerSide: Side = input.weatherOwner ?? "host";
    return {
      rayquazaPresent: false,
      opposingWeather: true,
      ownerSide,
      hostWeatherActive: ownerSide === "host",
      guestWeatherActive: ownerSide === "guest",
    };
  }

  // Rule 3 — no conflict (mirror, single source, or neither): each active
  // independently. `ownerSide` is only meaningful when there is a source.
  return {
    rayquazaPresent: false,
    opposingWeather: false,
    ownerSide: hostIsSource ? "host" : guestIsSource ? "guest" : null,
    hostWeatherActive: hostIsSource,
    guestWeatherActive: guestIsSource,
  };
}

/**
 * Convenience for the live loop: is MY (the caller's) standing weather stat
 * effect currently active, given which side I am? Non-weather partners return
 * false (they have no weather effect to gate). Also false when I'm Rayquaza
 * (no standing weather stat effect of its own).
 */
export function isMyWeatherActive(
  mySide: Side,
  myPartnerId: number | null | undefined,
  input: WeatherConflictInput,
): boolean {
  if (!isWeatherStatSource(myPartnerId)) return false;
  const res = resolveWeatherConflict(input);
  return mySide === "host" ? res.hostWeatherActive : res.guestWeatherActive;
}
