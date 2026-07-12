/**
 * Generates the owner-facing "how every signature ability works" checklist —
 * one plain-English line per engine-owned row, straight from the catalog.
 *
 * The text comes from `describeEngineSpec`, the SAME function that renders the
 * in-battle popover. That is the whole point: the list Paul checks against his
 * spreadsheet is literally the text the game shows a player, so the two cannot
 * drift. If a row reads wrong here, it reads wrong in the game.
 *
 *   npx tsx scripts/gen-ability-list.ts            → markdown to stdout
 *   npx tsx scripts/gen-ability-list.ts --json     → JSON
 */
import {
  SIG_ENGINE_DEX_IDS,
  SIGNATURE_ABILITIES,
  signatureMoveName,
} from "../src/lib/signature-abilities";
import { describeEngineSpec } from "../src/lib/signature-engine-describe";

/** Script-local: the app has no offline Pokédex (names come from the API at
 *  runtime), and this list is for a human to read, so it needs real names. */
const NAMES: Record<number, string> = {
  144: "Articuno", 145: "Zapdos", 146: "Moltres", 150: "Mewtwo", 151: "Mew",
  243: "Raikou", 244: "Entei", 245: "Suicune", 249: "Lugia", 250: "Ho-Oh", 251: "Celebi",
  377: "Regirock", 378: "Regice", 379: "Registeel", 380: "Latias", 381: "Latios",
  382: "Kyogre", 383: "Groudon", 384: "Rayquaza", 385: "Jirachi", 386: "Deoxys",
  480: "Uxie", 481: "Mesprit", 482: "Azelf", 483: "Dialga", 484: "Palkia", 485: "Heatran",
  486: "Regigigas", 487: "Giratina", 488: "Cresselia", 489: "Phione", 490: "Manaphy",
  491: "Darkrai", 492: "Shaymin", 493: "Arceus", 494: "Victini",
  638: "Cobalion", 639: "Terrakion", 640: "Virizion", 641: "Tornadus", 642: "Thundurus",
  643: "Reshiram", 644: "Zekrom", 645: "Landorus", 646: "Kyurem", 647: "Keldeo",
  648: "Meloetta", 649: "Genesect",
  716: "Xerneas", 717: "Yveltal", 718: "Zygarde", 719: "Diancie", 720: "Hoopa", 721: "Volcanion",
  772: "Type: Null", 773: "Silvally",
  785: "Tapu Koko", 786: "Tapu Lele", 787: "Tapu Bulu", 788: "Tapu Fini",
  789: "Cosmog", 790: "Cosmoem", 791: "Solgaleo", 792: "Lunala", 793: "Nihilego",
  794: "Buzzwole", 795: "Pheromosa", 796: "Xurkitree", 797: "Celesteela", 798: "Kartana",
  799: "Guzzlord", 800: "Necrozma", 801: "Magearna", 802: "Marshadow", 803: "Poipole",
  804: "Naganadel", 805: "Stakataka", 806: "Blacephalon", 807: "Zeraora", 808: "Meltan",
  809: "Melmetal",
  888: "Zacian", 889: "Zamazenta", 890: "Eternatus", 891: "Kubfu", 892: "Urshifu",
  893: "Zarude", 894: "Regieleki", 895: "Regidrago", 896: "Glastrier", 897: "Spectrier",
  898: "Calyrex (Ice Rider)", 905: "Enamorus",
  1001: "Wo-Chien", 1002: "Chien-Pao", 1003: "Ting-Lu", 1004: "Chi-Yu",
  1007: "Koraidon", 1008: "Miraidon", 1009: "Walking Wake", 1010: "Iron Leaves",
  1014: "Okidogi", 1015: "Munkidori", 1016: "Fezandipiti", 1017: "Ogerpon",
  1020: "Gouging Fire", 1021: "Raging Bolt", 1022: "Iron Boulder", 1023: "Iron Crown",
  1024: "Terapagos", 1025: "Pecharunt",
  10194: "Calyrex (Shadow Rider)",
};

const rows = [...SIG_ENGINE_DEX_IDS]
  .sort((a, b) => a - b)
  .map((dex) => {
    const ability = SIGNATURE_ABILITIES[dex];
    const engine = ability?.engine;
    if (!engine) throw new Error(`dex ${dex} is in SIG_ENGINE_DEX_IDS but has no engine spec`);
    return {
      dex,
      name: NAMES[dex] ?? null,
      move: signatureMoveName(dex) ?? ability.signatureMove,
      text: describeEngineSpec(engine),
    };
  });

const unnamed = rows.filter((r) => r.name == null).map((r) => r.dex);
if (unnamed.length > 0) {
  // Loud, not silent: a missing name would ship "#799" into the owner's checklist.
  console.error(`FIX ME — no name for dex id(s): ${unnamed.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log(`# Signature abilities — all ${rows.length} rows\n`);
  console.log("Generated from the catalog. This is the same text the game shows in battle.\n");
  for (const r of rows) {
    console.log(`- **#${r.dex} ${r.name} — ${r.move}**\n  ${r.text}`);
  }
}
