/**
 * The Home route (Figma 2.3 / 2.4, owner rulings 2026-11-27).
 *
 * Each route leads to the next gym of a region, in the region's own order
 * (Kanto first: Brock, Misty, Lt. Surge…). A region's first gym needs 4 trainer
 * stops beaten, each gym after it one more (the 8th needs 11); the count starts
 * again in every region. Stops are named trainers with a random non-legendary
 * Pokémon from that region's Pokédex. When every stop is beaten the gym opens,
 * and the gym battle IS the Weekly League (one try a week). Winning it moves the
 * player to the next route straight away.
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
  /** Trainer stops beaten on this route. */
  beaten: number;
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

/** Trainer stops before a region's gym number `gym` (0-based): 4, 5, 6… */
export function stopsForGym(gym: number): number {
  return 4 + gym;
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
export function regionRoute(region: number, current: RouteState, saved: Record<number, { gym: number; beaten: number }>): RouteState {
  if (region === current.region) return current;
  const s = saved[region];
  return { region, gym: s?.gym ?? 0, beaten: s?.beaten ?? 0 };
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
  if (r.region === 0 && r.gym === 0 && ROUTE_ONE[stop]) return ROUTE_ONE[stop];
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

/** The opponent for the next battle on the route: the START stop's trainer, or,
 *  once every stop is beaten, a passing trainer from the same region (extra
 *  battles never lock, 2.6). `stop` is null for those extra battles. */
export function routeOpponent(
  r: RouteState,
  shinyChance: number,
  rand: () => number = Math.random,
): { enemy: EnemyTrainer; stop: number | null } {
  const stop = stopsLeft(r) > 0 ? r.beaten : null;
  const name = stop !== null ? stopTrainer(r, stop) : `${CLASSES[Math.floor(rand() * CLASSES.length)][1]} ${NAMES[Math.floor(rand() * NAMES.length)]}`;
  return {
    enemy: { name, title: "", pokemon: regionPokemon(r.region, rand), isShiny: rand() < shinyChance },
    stop,
  };
}
