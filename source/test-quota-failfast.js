// Prove /api/ai/logic FAILS FAST on a quota error: it must stop after the FIRST model's
// quota error (they share one free-tier bucket) instead of hammering all 4 models and
// burning the user's quota. Mock Gemini to return a quota error and count how many model
// calls actually happen.
const { createApp } = require("./server.js");

let geminiCalls = 0;
let listModelsCalls = 0;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
    if (url.includes("/models?")) { // ListModels (discovery)
      listModelsCalls++;
      return { json: async () => ({ models: [
        { name: "models/gemini-flash-latest", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
      ] }) };
    }
    geminiCalls++; // a generateContent call
    return { json: async () => ({ error: { code: 429, message: "You exceeded your current quota ... Quota exceeded for metric: free_tier_requests, limit: 0 ... Please retry in 41.5s." } }) };
  }
  return realFetch(url, opts);
};

(async () => {
  const app = createApp();
  const s = await new Promise((r) => { const sv = app.listen(0, "127.0.0.1", () => r(sv)); });
  const base = "http://127.0.0.1:" + s.address().port;
  const resp = await fetch(base + "/api/ai/logic", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "x", systemPrompt: "Output JSON {}", apiKey: "AIzaVALIDISH_000000000000000000000000" }),
  });
  const d = await resp.json();
  let fail = 0;
  const ok = (l, c) => { console.log((c ? "PASS " : "FAIL ") + l); if (!c) fail++; };

  console.log("generateContent calls made:", geminiCalls, "| listModels calls:", listModelsCalls);
  ok("stopped after FIRST model on quota (not all 3)", geminiCalls === 1);
  ok("returned a friendly quota error", d.error && /free usage limit|try again in/i.test(d.error));
  ok("error includes the retry wait hint", d.error && /\d+\s*seconds/i.test(d.error));
  ok("did NOT leak Google URLs / raw metric names to user", d.error && !/ai\.google\.dev|googleapis\.com|free_tier_requests/i.test(d.error));
  console.log("\nuser sees: " + d.error);
  console.log(fail ? `\n${fail} FAILURE(S)` : "\nALL PASS");
  // Drain to exit (not process.exit) — avoids a libuv teardown assertion on Windows mid server-close.
  global.fetch = realFetch; process.exitCode = fail ? 1 : 0; try { s.closeAllConnections(); } catch (_) {} s.close();
})();
