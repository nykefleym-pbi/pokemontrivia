// Mega Evolution event — schedule, fixed question sets, and reward constants.
// AUTO-ASSEMBLED: the 50-question set per event is FROZEN and identical for every
// player so the accuracy leaderboard is fair (10 themed AI questions + 40 curated:
// 25 hard, 15 expert). Do not shuffle or refetch at battle time.
import type { Trivia } from "@/components/battle-screen";
import type { PokeEntry } from "./pokemon-data.generated";

export interface MegaReward {
  xp: number;
  tp: number;
  items: number;
  egg: boolean;
  dexId: number; // base final-evolution Pokédex entry awarded on a win
}

export interface ChampionReward {
  xp: number;
  tp: number;
  items: number;
  trophyId: string;
  trophyName: string;
}

export interface MegaEvent {
  id: string;        // stable per-event id; used as mega_runs.event_id
  megaId: number;    // sprite id (e.g. 10034 = Mega Charizard X)
  name: string;
  baseName: string;
  baseDexId: number;
  types: PokeEntry["types"];
  start: string;     // ISO, inclusive
  end: string;       // ISO, exclusive
  reward: MegaReward;
  champion: ChampionReward;
  questions: Trivia[]; // fixed 50, identical for all users
}

export const MEGA_BOSS_HP = 400;
export const MEGA_SHINY_CHANCE = 0.1;
export const MEGA_QUESTION_COUNT = 50;

const CHARIZARD_X_QUESTIONS: Trivia[] = [
  {"question":"Mega Charizard X is what type combination?","options":["Fire/Flying","Dragon/Flying","Fire/Dark","Fire/Dragon"],"correct":3,"explanation":"Mega Charizard X is Fire/Dragon, unlike Charizard's usual Fire/Flying.","category":"Pokédex"},
  {"question":"Which Mega Stone turns Charizard into Mega Charizard X?","options":["Charizardite X","Charcoal","Charizardite Y","Firium Z"],"correct":0,"explanation":"Charizardite X is required for Mega Charizard X (Charizardite Y gives Mega Charizard Y).","category":"Items"},
  {"question":"Which Ability does Mega Charizard X gain when it Mega Evolves?","options":["Drought","Blaze","Tough Claws","Solar Power"],"correct":2,"explanation":"Mega Charizard X has Tough Claws, which boosts the power of contact moves.","category":"Moves & Abilities"},
  {"question":"In which generation were Mega Evolutions introduced?","options":["Generation VII","Generation VI","Generation V","Generation IV"],"correct":1,"explanation":"Mega Evolution debuted in Generation VI with Pokémon X and Y.","category":"Generations"},
  {"question":"What must a Trainer carry to trigger Mega Evolution in battle?","options":["A Z-Ring","A Key Stone","A Tera Orb","A Dynamax Band"],"correct":1,"explanation":"A Trainer needs a Key Stone, paired with the Pokémon's Mega Stone.","category":"Lore"},
  {"question":"How many distinct Mega Evolutions does Charizard have?","options":["Two","Three","Four","One"],"correct":0,"explanation":"Charizard has two: Mega Charizard X and Mega Charizard Y.","category":"Pokédex"},
  {"question":"Mega Charizard Y's Ability Drought summons which weather?","options":["Rain","Harsh sunlight","Hail","Sandstorm"],"correct":1,"explanation":"Drought summons harsh sunlight, powering up Fire-type moves.","category":"Moves & Abilities"},
  {"question":"Compared with Charizard, which stat rises the most for Mega Charizard X?","options":["HP","Speed","Defense","Attack"],"correct":3,"explanation":"Mega Charizard X becomes a physical attacker; its base Attack jumps to 130.","category":"Competitive"},
  {"question":"In which region was Mega Evolution first discovered?","options":["Galar","Kalos","Hoenn","Kanto"],"correct":1,"explanation":"Mega Evolution was first discovered in the Kalos region.","category":"Lore"},
  {"question":"Which Pokémon Mega Evolves by knowing Dragon Ascent instead of holding a Mega Stone?","options":["Kyogre","Groudon","Mewtwo","Rayquaza"],"correct":3,"explanation":"Mega Rayquaza requires the move Dragon Ascent and holds no Mega Stone.","category":"Pokédex"},
  {"question":"What is the type (or type combination) of Salamence?","options":["Dragon/Flying","Bug/Steel","Dark","Fire"],"correct":0,"explanation":"Salamence is a Dragon/Flying-type Pokémon.","category":"Pokédex"},
  {"question":"Which Hoenn Pokémon is famous for its enormous size as the Float Whale Pokémon?","options":["Sharpedo","Wailmer","Kyogre","Wailord"],"correct":3,"explanation":"Wailord is one of the largest Pokémon by length.","category":"Pokédex"},
  {"question":"Which Elite Four member specializes in Fighting types in Kanto?","options":["Bruno","Lance","Agatha","Lorelei"],"correct":0,"explanation":"Bruno is the Fighting-type specialist of the Elite Four.","category":"Games"},
  {"question":"Which Pokémon is the box mascot of Pokémon Platinum?","options":["Yveltal","Koraidon","Reshiram","Giratina"],"correct":3,"explanation":"Giratina is the cover legendary of Pokémon Platinum.","category":"Games"},
  {"question":"Which Pokémon evolves from Magikarp's Gen IV-era addition — i.e., Feebas evolves into?","options":["Milotic","Lumineon","Gyarados","Wishiwashi"],"correct":0,"explanation":"Feebas evolves into Milotic (via Prism Scale trade in Gen V).","category":"Pokédex"},
  {"question":"Which Pokémon is National Pokédex #721, closing Generation VI?","options":["Hoopa","Zygarde","Volcanion","Diancie"],"correct":2,"explanation":"Volcanion (#721) closes the Kalos-era Pokédex.","category":"Pokédex"},
  {"question":"Which Pokémon is the box mascot of Pokémon Emerald?","options":["Rayquaza","Kyogre","Dialga","Zacian"],"correct":0,"explanation":"Rayquaza is the cover legendary of Pokémon Emerald.","category":"Games"},
  {"question":"In which generation did Bisharp first appear?","options":["Generation III","Generation VI","Generation V","Generation I"],"correct":2,"explanation":"Bisharp debuted in Generation V.","category":"Generations"},
  {"question":"Which Gen IX Pokémon is a Rock/Poison toxic crystal?","options":["Glimmet","Glimmora","Garganacl","Toxapex"],"correct":1,"explanation":"Glimmora is the Rock/Poison Ore Pokémon.","category":"Pokédex"},
  {"question":"What is the National Pokédex number of Mudkip?","options":["263","256","258","259"],"correct":2,"explanation":"Mudkip is National Pokédex #258.","category":"Pokédex"},
  {"question":"Which Gen VII Pokémon is a Poison/Water coral predator with Regenerator?","options":["Mareanie","Toxapex","Tentacruel","Toxicroak"],"correct":1,"explanation":"Toxapex is the Poison/Water Brutal Star Pokémon.","category":"Pokédex"},
  {"question":"What is the type (or type combination) of Volcarona?","options":["Electric","Bug/Fire","Fighting/Steel","Ghost/Fire"],"correct":1,"explanation":"Volcarona is a Bug/Fire-type Pokémon.","category":"Pokédex"},
  {"question":"Which type is Fairy-type damage super effective against?","options":["Ground","Fighting","Normal","Bug"],"correct":1,"explanation":"Fairy moves deal double damage to Fighting-type Pokémon.","category":"Moves & Abilities"},
  {"question":"Which Gen VII feature replaced Pokémon-Amie with care and status healing?","options":["Pokémon-Amie","Poké Pelago","Pokéblocks","Pokémon Refresh"],"correct":3,"explanation":"Pokémon Refresh let players care for Pokémon in Gen VII.","category":"General"},
  {"question":"Which held item evolves Seadra into Kingdra when traded?","options":["Metal Coat","Up-Grade","Dragon Scale","King's Rock"],"correct":2,"explanation":"Seadra holding a Dragon Scale evolves into Kingdra when traded.","category":"Items"},
  {"question":"Which Gen IX Pokémon is a Dark-type fierce dog?","options":["Mightyena","Houndoom","Mabosstiff","Maschiff"],"correct":2,"explanation":"Mabosstiff is the Dark-type Boss Pokémon.","category":"Pokédex"},
  {"question":"What is the type combination of Zubat?","options":["Fire/Dragon","Rock/Steel","Poison/Flying","Electric/Flying"],"correct":2,"explanation":"Zubat is a Poison/Flying-type Pokémon.","category":"Pokédex"},
  {"question":"Which Pokémon evolves from Smoochum?","options":["Lickitung","Jynx","Wobbuffet","Mr. Mime"],"correct":1,"explanation":"Smoochum evolves into Jynx.","category":"Pokédex"},
  {"question":"Which Dragon-type move sharply lowers the user's Sp. Atk after a powerful hit?","options":["Draco Meteor","Dragon Pulse","Dragon Claw","Twister"],"correct":0,"explanation":"Draco Meteor hits hard but sharply lowers the user's Sp. Atk.","category":"Moves & Abilities"},
  {"question":"What is the National Pokédex number of Xerneas?","options":["713","717","716","715"],"correct":2,"explanation":"Xerneas is National Pokédex #716.","category":"Pokédex"},
  {"question":"Which move's power increases the heavier the target is?","options":["Tackle","Pound","Low Kick","Slam"],"correct":2,"explanation":"Low Kick deals more damage to heavier targets.","category":"Moves & Abilities"},
  {"question":"What is the National Pokédex number of Chikorita?","options":["153","152","151","150"],"correct":1,"explanation":"Chikorita is National Pokédex #152.","category":"Pokédex"},
  {"question":"Which item evolves Porygon into Porygon2 on trade?","options":["Protector","Dubious Disc","Reaper Cloth","Up-Grade"],"correct":3,"explanation":"Porygon holding an Up-Grade evolves into Porygon2 when traded.","category":"Items"},
  {"question":"What is the type (or type combination) of Lucario?","options":["Ground/Flying","Electric/Ghost","Ghost/Fire","Fighting/Steel"],"correct":3,"explanation":"Lucario is a Fighting/Steel-type Pokémon.","category":"Pokédex"},
  {"question":"Which ability summons harsh sunlight when the Pokémon enters battle?","options":["Drizzle","Drought","Snow Warning","Sand Stream"],"correct":1,"explanation":"Drought summons harsh sunlight on entry.","category":"Moves & Abilities"},
  {"question":"What is the National Pokédex number of Swampert?","options":["263","260","261","259"],"correct":1,"explanation":"Swampert is National Pokédex #260.","category":"Pokédex"},
  {"question":"What is the National Pokédex number of Kyogre?","options":["380","383","382","381"],"correct":2,"explanation":"Kyogre is National Pokédex #382.","category":"Pokédex"},
  {"question":"Which type does the Alolan island kahuna Olivia specialize in?","options":["Bug","Rock","Ghost","Fighting"],"correct":1,"explanation":"Olivia of Akala Island uses Rock-type Pokémon.","category":"Games"},
  {"question":"Which Johto location holds a lighthouse with a sick Ampharos in Gen II?","options":["Mahogany Town","Olivine City","Ecruteak City","Cianwood City"],"correct":1,"explanation":"Olivine City's lighthouse holds an ailing Ampharos named Amphy.","category":"Games"},
  {"question":"Which item raises a holder's Attack but locks it into one move?","options":["Muscle Band","Expert Belt","Choice Band","Choice Scarf"],"correct":2,"explanation":"Choice Band boosts Attack while locking move choice.","category":"Items"},
  {"question":"Which Pokémon is the Order Pokémon that balances the Kalos ecosystem?","options":["Volcanion","Zygarde","Yveltal","Xerneas"],"correct":1,"explanation":"Zygarde is the Order Pokémon overseeing the ecosystem.","category":"Lore"},
  {"question":"Which Sinnoh Gym Leader awards the Coal Badge using Rock types?","options":["Volkner","Gardenia","Roark","Maylene"],"correct":2,"explanation":"Roark of Oreburgh awards the Coal Badge.","category":"Games"},
  {"question":"What is the type (or type combination) of Palossand?","options":["Fairy","Ghost/Ground","Poison/Dragon","Bug/Electric"],"correct":1,"explanation":"Palossand is a Ghost/Ground-type Pokémon.","category":"Pokédex"},
  {"question":"Which Pokémon evolves from Tyrogue with balanced stats?","options":["Hitmonchan","Hitmonlee","Machamp","Hitmontop"],"correct":3,"explanation":"Equal Attack and Defense evolve Tyrogue into Hitmontop.","category":"Pokédex"},
  {"question":"Which Tapu guardian is the Electric/Fairy deity of Melemele?","options":["Tapu Lele","Tapu Koko","Tapu Bulu","Tapu Fini"],"correct":1,"explanation":"Tapu Koko, Electric/Fairy, guards Melemele Island.","category":"Lore"},
  {"question":"In which city is Kalos Gym Leader Viola found?","options":["Shalour City","Santalune City","Coumarine City","Laverre City"],"correct":1,"explanation":"Viola leads the gym in Santalune City.","category":"Regions"},
  {"question":"Which Gym Leader and Pokémon Connoisseur joins Ash in Unova?","options":["Clemont","Cilan","Iris","Brock"],"correct":1,"explanation":"Cilan, a Striaton Gym Leader and Connoisseur, joins Ash in Unova.","category":"Anime"},
  {"question":"What is the type combination of Metagross?","options":["Steel/Psychic","Steel/Flying","Ground/Psychic","Dragon/Flying"],"correct":0,"explanation":"Metagross is a Steel/Psychic-type Pokémon.","category":"Pokédex"},
  {"question":"Which Unova rival of Ash is a confident trainer with a Snivy/Serperior?","options":["Barry","Paul","Trip","Gary"],"correct":2,"explanation":"Trip is Ash's chief rival in the Unova anime.","category":"Anime"},
  {"question":"Which generation is the first that could NOT trade back to Generation I and II?","options":["Generation IV","Generation III","Generation V","Generation II"],"correct":1,"explanation":"Gen III's hardware change broke compatibility with Gen I/II.","category":"Generations"},
];

export const MEGA_EVENTS: MegaEvent[] = [
  {
    id: "mega-charizard-x-2026-06-23",
    megaId: 10034,
    name: "Mega Charizard X",
    baseName: "Charizard",
    baseDexId: 6,
    types: ["fire", "dragon"],
    start: "2026-06-23T00:00:00Z",
    end: "2026-07-07T00:00:00Z",
    reward: { xp: 500, tp: 150, items: 5, egg: true, dexId: 6 },
    champion: {
      xp: 2500,
      tp: 500,
      items: 10,
      trophyId: "mega-charizard-x-slayer",
      trophyName: "Mega Charizard X Slayer",
    },
    questions: CHARIZARD_X_QUESTIONS,
  },
];

/** The Mega event whose [start, end) window contains `now`, or null. */
export function activeMegaEvent(now: Date = new Date()): MegaEvent | null {
  const t = now.getTime();
  return (
    MEGA_EVENTS.find((e) => t >= Date.parse(e.start) && t < Date.parse(e.end)) ??
    null
  );
}

/** Build a PokeEntry-shaped boss for the battle system from a Mega event. */
export function megaToEntry(ev: MegaEvent): PokeEntry {
  return {
    id: ev.megaId,
    slug: ev.name.toLowerCase().replace(/\s+/g, "-"),
    name: ev.name,
    types: ev.types,
    evolvesFromId: ev.baseDexId,
    evolvesToIds: [],
    evolutionStage: 3,
    isFullyEvolved: true,
  };
}
