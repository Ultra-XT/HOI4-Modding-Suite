// Verify the Gemini model ranking (scoreGeminiModel) picks the best text model and rejects
// non-text / experimental ones — the brain of the self-updating model discovery.
// Mirrors the function in server.js; if you change one, change both.
function scoreGeminiModel(name) {
  const n = name.toLowerCase();
  let s = 0;
  if (n.includes("-latest")) s += 1000;
  const ver = n.match(/gemini-(\d+)\.(\d+)/);
  if (ver) s += Number(ver[1]) * 100 + Number(ver[2]) * 10;
  if (n.includes("flash") && !n.includes("flash-lite")) s += 50;
  if (n.includes("flash-lite")) s += 30;
  if (n.includes("pro")) s += 20;
  if (n.includes("vision") || n.includes("embedding") || n.includes("aqa") || n.includes("imagen") || n.includes("tts") || n.includes("image")) s -= 5000;
  if (n.includes("exp") || n.includes("preview") || n.includes("-thinking")) s -= 200;
  return s;
}

// A realistic mix of what ListModels returns (includes future versions + junk we must avoid).
const sample = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash-thinking-exp",
  "gemini-1.5-flash",          // retired family — should rank BELOW current, not crash
  "gemini-3.0-flash",          // hypothetical FUTURE version — must auto-win over 2.x
  "gemini-embedding-001",      // not text gen
  "imagen-3.0-generate",       // image
  "gemini-2.5-flash-tts",      // audio
];

const ranked = sample.slice().sort((a, b) => scoreGeminiModel(b) - scoreGeminiModel(a));
console.log("Ranked best->worst:");
ranked.forEach((m, i) => console.log(`  ${String(i+1).padStart(2)}. ${m.padEnd(34)} score=${scoreGeminiModel(m)}`));

let fail = 0;
function ok(label, cond) { console.log((cond?"PASS ":"FAIL ")+label); if(!cond) fail++; }

console.log("");
ok("a -latest alias ranks #1 (most future-proof)", ranked[0].includes("-latest"));
ok("a future gemini-3.0 outranks all 2.x", scoreGeminiModel("gemini-3.0-flash") > scoreGeminiModel("gemini-2.5-flash"));
ok("embedding model is rejected (negative score)", scoreGeminiModel("gemini-embedding-001") < 0);
ok("imagen/image model is rejected", scoreGeminiModel("imagen-3.0-generate") < 0);
ok("tts model is rejected", scoreGeminiModel("gemini-2.5-flash-tts") < 0);
ok("preview/exp variants rank below stable same-version", scoreGeminiModel("gemini-2.5-flash") > scoreGeminiModel("gemini-2.5-flash-preview-05-20"));
ok("flash preferred over pro at same version", scoreGeminiModel("gemini-2.5-flash") > scoreGeminiModel("gemini-2.5-pro"));
ok("retired 1.5 ranks below current 2.x (not selected first)", scoreGeminiModel("gemini-2.5-flash") > scoreGeminiModel("gemini-1.5-flash"));
// The top non-alias pick should be a current flash, never junk:
const topNonAlias = ranked.find(m => !m.includes("-latest"));
ok("top concrete model is a real text model (not embedding/image/tts)", /flash|pro/.test(topNonAlias) && !/embedding|imagen|tts/.test(topNonAlias));

console.log(fail===0 ? "\nALL PASS" : `\n${fail} FAILURE(S)`);
process.exit(fail?1:0);
