/*
 * End-to-end test of POST /api/ai/logic response handling WITHOUT a real Gemini key.
 * We monkeypatch global.fetch so any call to generativelanguage.googleapis.com returns a
 * scripted Gemini-shaped payload, then assert /api/ai/logic turns each into the right
 * { script } or { error }. Proves the sanitizer + finishReason + empty + brace guards.
 *
 * Run: node scratch/test_ai_logic_endpoint.js
 */
const { createApp } = require("./server.js");

const PORT = 3477;
const BASE = `http://127.0.0.1:${PORT}`;

// What the fake Gemini should return on the next call. Each entry is a full response body.
let NEXT_GEMINI = null;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
    return { json: async () => NEXT_GEMINI };
  }
  return realFetch(url, opts);
};

function geminiText(text, finishReason) {
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: finishReason || "STOP" }] };
}

let pass = 0, fail = 0;
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log("  PASS " + msg); }
  else { fail++; console.log("  FAIL " + msg + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
async function callLogic(prompt) {
  const r = await fetch(`${BASE}/api/ai/logic`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt || "x", apiKey: "FAKE_KEY" }),
  });
  return r.json();
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  try {
    // 1. The infamous ```hoi4 fence: must NOT leave a stray "4".
    NEXT_GEMINI = geminiText("```hoi4\nadd_political_power = 50\n```");
    let d = await callLogic();
    ok(d.script === "add_political_power = 50", "hoi4 fence stripped cleanly (no stray 4)", d);

    // 2. Plain bare script passes through.
    NEXT_GEMINI = geminiText("add_stability = 0.05");
    d = await callLogic();
    ok(d.script === "add_stability = 0.05", "bare script passes", d);

    // 3. Empty fence -> error, NOT { script: "" } (this is the field-wipe bug).
    NEXT_GEMINI = geminiText("```\n```");
    d = await callLogic();
    ok(d.error && /empty/i.test(d.error) && d.script === undefined, "empty output -> error (no field wipe)", d);

    // 4. Pure whitespace -> error.
    NEXT_GEMINI = geminiText("   \n  ");
    d = await callLogic();
    ok(d.error && /empty/i.test(d.error), "whitespace-only -> error", d);

    // 5. Truncated block (unbalanced braces) -> error.
    NEXT_GEMINI = geminiText("if = { limit = { has_war = no } add_political_power = 50");
    d = await callLogic();
    ok(d.error && /brace/i.test(d.error), "unbalanced braces -> error", d);

    // 6. finishReason MAX_TOKENS -> 'cut off' error even if text looks plausible.
    NEXT_GEMINI = geminiText("add_political_power = 50", "MAX_TOKENS");
    d = await callLogic();
    ok(d.error && /cut off|too long/i.test(d.error), "MAX_TOKENS finishReason -> cut-off error", d);

    // 7. SAFETY finishReason -> safety error.
    NEXT_GEMINI = geminiText("", "SAFETY");
    d = await callLogic();
    ok(d.error && /safety/i.test(d.error), "SAFETY finishReason -> safety error", d);

    // 8. A valid balanced complex block passes.
    NEXT_GEMINI = geminiText("```\nif = { limit = { has_war = no } add_political_power = 50 }\n```");
    d = await callLogic();
    ok(d.script === "if = { limit = { has_war = no } add_political_power = 50 }", "balanced complex block passes", d);

    // 9. A plain NAME (no braces, no =) passes — must not be rejected as 'not script'.
    NEXT_GEMINI = geminiText("The Great Patriotic War");
    d = await callLogic();
    ok(d.script === "The Great Patriotic War", "plain text/name passes (no false brace reject)", d);

    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) {
    console.error(e); fail++;
  } finally {
    // Drain to exit (not process.exit) — avoids a libuv teardown assertion on Windows mid server-close.
    global.fetch = realFetch;
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
