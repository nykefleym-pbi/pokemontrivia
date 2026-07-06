import { describe, expect, it } from "vitest";
import {
  weatherKindFor,
  isWeatherStatSource,
  resolveWeatherConflict,
  isMyWeatherActive,
  KYOGRE_ID,
  GROUDON_ID,
  RAYQUAZA_ID,
} from "./pvp-weather";

describe("weatherKindFor / isWeatherStatSource", () => {
  it("maps the three mascots and nothing else", () => {
    expect(weatherKindFor(KYOGRE_ID)).toBe("rain");
    expect(weatherKindFor(GROUDON_ID)).toBe("sun");
    expect(weatherKindFor(RAYQUAZA_ID)).toBe("air_lock");
    expect(weatherKindFor(151)).toBeNull();
    expect(weatherKindFor(null)).toBeNull();
  });

  it("only Kyogre/Groudon are standing weather stat sources (not Rayquaza)", () => {
    expect(isWeatherStatSource(KYOGRE_ID)).toBe(true);
    expect(isWeatherStatSource(GROUDON_ID)).toBe(true);
    expect(isWeatherStatSource(RAYQUAZA_ID)).toBe(false);
    expect(isWeatherStatSource(25)).toBe(false);
  });
});

describe("resolveWeatherConflict", () => {
  it("Rayquaza on either side negates both Kyogre and Groudon weather", () => {
    const a = resolveWeatherConflict({ hostPartnerId: RAYQUAZA_ID, guestPartnerId: KYOGRE_ID });
    expect(a.rayquazaPresent).toBe(true);
    expect(a.hostWeatherActive).toBe(false);
    expect(a.guestWeatherActive).toBe(false);

    const b = resolveWeatherConflict({ hostPartnerId: GROUDON_ID, guestPartnerId: RAYQUAZA_ID });
    expect(b.rayquazaPresent).toBe(true);
    expect(b.hostWeatherActive).toBe(false);
    expect(b.guestWeatherActive).toBe(false);
  });

  it("Rayquaza vs a non-weather partner still simply has no weather to negate", () => {
    const r = resolveWeatherConflict({ hostPartnerId: RAYQUAZA_ID, guestPartnerId: 151 });
    expect(r.rayquazaPresent).toBe(true);
    expect(r.hostWeatherActive).toBe(false); // Rayquaza has no standing weather stat
    expect(r.guestWeatherActive).toBe(false);
  });

  it("Kyogre vs Groudon: turn-1 tie (no owner) breaks in the HOST's favour", () => {
    const r = resolveWeatherConflict({
      hostPartnerId: KYOGRE_ID,
      guestPartnerId: GROUDON_ID,
      weatherOwner: null,
    });
    expect(r.opposingWeather).toBe(true);
    expect(r.ownerSide).toBe("host");
    expect(r.hostWeatherActive).toBe(true);
    expect(r.guestWeatherActive).toBe(false);
  });

  it("Kyogre vs Groudon: latest establisher owns the field, other suppressed", () => {
    const guestOwns = resolveWeatherConflict({
      hostPartnerId: KYOGRE_ID,
      guestPartnerId: GROUDON_ID,
      weatherOwner: "guest",
    });
    expect(guestOwns.hostWeatherActive).toBe(false);
    expect(guestOwns.guestWeatherActive).toBe(true);

    const hostOwns = resolveWeatherConflict({
      hostPartnerId: GROUDON_ID,
      guestPartnerId: KYOGRE_ID,
      weatherOwner: "host",
    });
    expect(hostOwns.hostWeatherActive).toBe(true);
    expect(hostOwns.guestWeatherActive).toBe(false);
  });

  it("mirror matchup (both Kyogre) resolves independently, no special interaction", () => {
    const r = resolveWeatherConflict({ hostPartnerId: KYOGRE_ID, guestPartnerId: KYOGRE_ID });
    expect(r.opposingWeather).toBe(false);
    expect(r.hostWeatherActive).toBe(true);
    expect(r.guestWeatherActive).toBe(true);
  });

  it("single weather source is active; the non-weather side has none", () => {
    const r = resolveWeatherConflict({ hostPartnerId: KYOGRE_ID, guestPartnerId: 151 });
    expect(r.opposingWeather).toBe(false);
    expect(r.hostWeatherActive).toBe(true);
    expect(r.guestWeatherActive).toBe(false);
    expect(r.ownerSide).toBe("host");
  });

  it("no weather sources at all → nothing active, no owner", () => {
    const r = resolveWeatherConflict({ hostPartnerId: 151, guestPartnerId: 25 });
    expect(r.hostWeatherActive).toBe(false);
    expect(r.guestWeatherActive).toBe(false);
    expect(r.ownerSide).toBeNull();
  });
});

describe("isMyWeatherActive", () => {
  it("non-weather partners are never gated as having active weather", () => {
    expect(isMyWeatherActive("host", 151, { hostPartnerId: 151, guestPartnerId: KYOGRE_ID })).toBe(false);
  });

  it("Kyogre's weather is off while a Rayquaza is on the field", () => {
    expect(
      isMyWeatherActive("guest", KYOGRE_ID, { hostPartnerId: RAYQUAZA_ID, guestPartnerId: KYOGRE_ID }),
    ).toBe(false);
  });

  it("the suppressed side (non-owner) in a Kyogre-vs-Groudon match has no active weather", () => {
    expect(
      isMyWeatherActive("guest", GROUDON_ID, {
        hostPartnerId: KYOGRE_ID,
        guestPartnerId: GROUDON_ID,
        weatherOwner: "host",
      }),
    ).toBe(false);
    expect(
      isMyWeatherActive("host", KYOGRE_ID, {
        hostPartnerId: KYOGRE_ID,
        guestPartnerId: GROUDON_ID,
        weatherOwner: "host",
      }),
    ).toBe(true);
  });
});
