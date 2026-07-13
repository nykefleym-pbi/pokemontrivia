/* Throwaway probe: is the `manual` (player-fired) signature path still live, and
 * do manual rows ALSO carry an auto-firing engine spec?
 *   npx vite-node -c scripts/balance-sim/vite.config.ts scripts/balance-sim/probe-manual.ts
 */
import { SIGNATURE_ABILITIES, CAPPED_PAYLOAD_IDS } from "../../src/lib/signature-abilities";
import { describeEngineSpec } from "../../src/lib/signature-engine-describe";

const all = Object.values(SIGNATURE_ABILITIES);
const manualWiring = all.filter((a) => a.wiring === "capped_payload");
const manualTrigger = all.filter((a) => a.trigger.type === "capped_payload");

console.log("total catalog rows           :", all.length);
console.log("wiring === 'manual'          :", manualWiring.length);
console.log("trigger.type === 'manual'    :", manualTrigger.length);
console.log("CAPPED_PAYLOAD_IDS   :", CAPPED_PAYLOAD_IDS.length, "(auto-fired by the engine trigger)");

const withEngine = manualWiring.filter((a) => a.engine !== undefined);
console.log("");
console.log(`manual rows that ALSO have an auto-firing engine spec: ${withEngine.length} of ${manualWiring.length}`);
console.log("");
for (const a of withEngine) {
  const fireable = CAPPED_PAYLOAD_IDS.includes(a.pokemonId);
  console.log(`#${String(a.pokemonId).padEnd(5)} ${a.signatureMove.padEnd(18)} [${fireable ? "auto-fired" : "no payload"}]`);
  console.log(`        engine auto-fires: ${describeEngineSpec(a.engine!)}`);
}
