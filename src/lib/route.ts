/**
 * The Home route (Figma 2.3 / 2.4, owner rulings 2026-11-27).
 *
 * Each route leads to the next gym of a region, in the region's own order
 * (Kanto first: Brock, Misty, Lt. Surge…). A region's first gym needs 4 battle
 * stops beaten, each gym after it one more (the 8th needs 11); the count starts
 * again in every region.
 *
 * Paul, 2026-11-28: the first half of the stops (rounded down) are wild Pokémon
 * in the tall grass (base forms of the region, caught after the win); then one
 * Who's That round; then the trainer half (any non-legendary of the region,
 * registered by a Pokédex scan, never caught); then today's Daily Quest; then
 * the gym, open as soon as you reach it. Lose to the Gym Leader and one trainer
 * battle reopens it. Winning moves the player to the next route straight away.
 */
import { GYM_LEADERS, type GymLeader } from "@/lib/gym-leaders";
import { GENERATIONS } from "@/lib/dex-rewards";
import { ALL_POKEMON } from "@/lib/pokemon-data";
import { isLegendaryOrMythical } from "@/lib/legendary-data";
import type { EnemyTrainer } from "@/lib/game-data";

export const ROUTE_REGIONS = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"] as const;

export interface RouteState {
  /** Index into ROUTE_REGIONS. */
  region: number;
  /** Index of the gym within that region. */
  gym: number;
  /** Battle stops (wild and trainer) beaten on this route. */
  beaten: number;
  /** This route's Who's That round is played (caught or fled both count). */
  whos?: boolean;
  /** Lost to this route's Gym Leader: one trainer win reopens the gym. */
  gymLost?: boolean;
}

export const ROUTE_START: RouteState = { region: 0, gym: 0, beaten: 0 };

/** Each gym's town, for "Pewter Gym". */
const GYM_TOWN: Record<string, string> = {
  brock: "Pewter", misty: "Cerulean", "lt-surge": "Vermilion", erika: "Celadon",
  koga: "Fuchsia", sabrina: "Saffron", blaine: "Cinnabar", giovanni: "Viridian",
  falkner: "Violet", bugsy: "Azalea", whitney: "Goldenrod", morty: "Ecruteak",
  chuck: "Cianwood", jasmine: "Olivine", pryce: "Mahogany", clair: "Blackthorn",
  roxanne: "Rustboro", brawly: "Dewford", wattson: "Mauville", flannery: "Lavaridge",
  norman: "Petalburg", winona: "Fortree", "tate-liza": "Mossdeep", wallace: "Sootopolis",
  roark: "Oreburgh", gardenia: "Eterna", maylene: "Veilstone", "crasher-wake": "Pastoria",
  fantina: "Hearthome", byron: "Canalave", candice: "Snowpoint", volkner: "Sunyshore",
  cilan: "Striaton", lenora: "Nacrene", burgh: "Castelia", elesa: "Nimbasa",
  clay: "Driftveil", skyla: "Mistralton", brycen: "Icirrus", drayden: "Opelucid",
  roxie: "Virbank", marlon: "Humilau",
};

export function regionGyms(region: number): GymLeader[] {
  return GYM_LEADERS.filter((g) => g.region === ROUTE_REGIONS[region]);
}

export function routeGym(r: RouteState): GymLeader {
  return regionGyms(r.region)[r.gym] ?? GYM_LEADERS[0];
}

export function gymTown(g: GymLeader): string {
  return `${GYM_TOWN[g.id] ?? g.name} Gym`;
}

/** Battle stops before a region's gym number `gym` (0-based): 4, 5, 6… */
export function stopsForGym(gym: number): number {
  return 4 + gym;
}

/** The wild half comes first; an odd count gives the extra stop to the trainers (Paul, 2026-11-28). */
export function wildStops(gym: number): number {
  return Math.floor(stopsForGym(gym) / 2);
}

export type RouteStep =
  | { kind: "wild" | "trainer"; stop: number | null }
  | { kind: "whos" }
  | { kind: "daily" }
  | { kind: "gym" };

/** What the route asks for next. `stop` null is a battle that advances nothing but the gym rematch. */
export function nextStep(r: RouteState, dailyDone: boolean): RouteStep {
  const n = stopsForGym(r.gym);
  if (r.beaten < wildStops(r.gym)) return { kind: "wild", stop: r.beaten };
  if (!r.whos) return { kind: "whos" };
  if (r.beaten < n) return { kind: "trainer", stop: r.beaten };
  if (!dailyDone) return { kind: "daily" };
  if (r.gymLost) return { kind: "trainer", stop: null };
  return { kind: "gym" };
}

export function stopsLeft(r: RouteState): number {
  return Math.max(0, stopsForGym(r.gym) - r.beaten);
}

/** "Route 1" … "Route 42", counted across regions. */
export function routeNumber(r: RouteState): number {
  let n = 0;
  for (let i = 0; i < r.region; i++) n += regionGyms(i).length;
  return n + r.gym + 1;
}

/** The route after its gym is won. Each region has its own fixed route (owner
 *  ruling 2026-11-27); after a region's last gym its route starts again from
 *  the first gym (badges already owned are not paid twice).
 *  shortcut: a finished region loops; upgrade when a post-game is designed. */
export function nextRoute(r: RouteState): RouteState {
  return { region: r.region, gym: (r.gym + 1) % regionGyms(r.region).length, beaten: 0 };
}

/** Where a region's route stands: the saved place, or its start. */
export function regionRoute(region: number, current: RouteState, saved: Record<number, Omit<RouteState, "region">>): RouteState {
  if (region === current.region) return current;
  const s = saved[region];
  return { region, gym: s?.gym ?? 0, beaten: s?.beaten ?? 0, ...(s?.whos ? { whos: true } : {}), ...(s?.gymLost ? { gymLost: true } : {}) };
}

const CLASSES: Array<[id: string, label: string]> = [
  ["youngster", "Youngster"], ["lass", "Lass"], ["bug-catcher", "Bug Catcher"], ["hiker", "Hiker"],
  ["camper", "Camper"], ["picnicker", "Picnicker"], ["fisherman", "Fisherman"], ["beauty", "Beauty"],
  ["sailor", "Sailor"], ["super-nerd", "Super Nerd"], ["gentleman", "Gentleman"], ["black-belt", "Black Belt"],
  ["bird-keeper", "Bird Keeper"], ["swimmer-f", "Swimmer"], ["ace-trainer-m", "Ace Trainer"], ["ace-trainer-f", "Ace Trainer"],
];
const NAMES = [
  "Ben", "Ivy", "Tim", "Tom", "Liam", "Ana", "Joey", "Mia", "Sam", "Leo", "Zoe", "Max", "Kai", "Lily",
  "Finn", "Nora", "Eli", "Ruby", "Owen", "Ella", "Ray", "Jade", "Ned", "Rose", "Cody", "Iris", "Gus", "Tess",
];
// Route 1 is the one in the design (2.3 / 2.4).
const ROUTE_ONE = ["Youngster Ben", "Lass Ivy", "Bug Catcher Tim", "Hiker Tom"];

function hash(n: number): number {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** The trainer standing on stop `stop` (0-based) of route `r`. Same name every time. */
export function stopTrainer(r: RouteState, stop: number): string {
  const t = stop - wildStops(r.gym); // Route 1's named trainers start with the trainer half
  if (r.region === 0 && r.gym === 0 && t >= 0 && ROUTE_ONE[t]) return ROUTE_ONE[t];
  const seed = routeNumber(r) * 100 + stop;
  const cls = CLASSES[hash(seed) % CLASSES.length][1];
  const name = NAMES[hash(seed * 7 + 3) % NAMES.length];
  return `${cls} ${name}`;
}

/** A random non-legendary Pokémon from the region's own Pokédex. */
export function regionPokemon(region: number, rand: () => number = Math.random) {
  const g = GENERATIONS.find((x) => x.region === ROUTE_REGIONS[region]) ?? GENERATIONS[0];
  const pool = ALL_POKEMON.filter((p) => p.id >= g.from && p.id <= g.to && !isLegendaryOrMythical(p.id));
  return pool[Math.floor(rand() * pool.length)];
}

/** Which kind of battle the route's next fight is: wild until the wild half and its Who's That are done. */
export function battleKind(r: RouteState): "wild" | "trainer" {
  const s = nextStep(r, true);
  return s.kind === "wild" || s.kind === "whos" ? "wild" : "trainer";
}

/** A base form from the region: no pre-evolution, or one first found in a later region
 *  (Pikachu stays wild in Kanto although Pichu is Johto's). Never legendary. */
export function regionWildPokemon(region: number, rand: () => number = Math.random) {
  const g = GENERATIONS.find((x) => x.region === ROUTE_REGIONS[region]) ?? GENERATIONS[0];
  const pool = ALL_POKEMON.filter(
    (p) => p.id >= g.from && p.id <= g.to && !isLegendaryOrMythical(p.id) && (p.evolvesFromId == null || p.evolvesFromId < g.from || p.evolvesFromId > g.to),
  );
  return pool[Math.floor(rand() * pool.length)];
}

/** The opponent for the next battle on the route: the START stop's wild Pokémon or
 *  trainer. While a Who's That or Daily step waits, or after the last stop, a battle
 *  is an extra (`stop` null): wild until the wild half is done, a passing trainer
 *  after it (that one is the gym rematch's trainer win). */
export function routeOpponent(
  r: RouteState,
  shinyChance: number,
  rand: () => number = Math.random,
): { enemy: EnemyTrainer; stop: number | null; kind: "wild" | "trainer" } {
  const step = nextStep(r, true);
  const stop = step.kind === "wild" || step.kind === "trainer" ? step.stop : null;
  const kind = battleKind(r);
  if (kind === "wild") {
    const p = regionWildPokemon(r.region, rand);
    return { enemy: { name: `Wild ${p.name}`, title: "", pokemon: p, isShiny: rand() < shinyChance, wild: true }, stop, kind };
  }
  const name = stop !== null ? stopTrainer(r, stop) : `${CLASSES[Math.floor(rand() * CLASSES.length)][1]} ${NAMES[Math.floor(rand() * NAMES.length)]}`;
  return { enemy: { name, title: "", pokemon: regionPokemon(r.region, rand), isShiny: rand() < shinyChance }, stop, kind };
}
