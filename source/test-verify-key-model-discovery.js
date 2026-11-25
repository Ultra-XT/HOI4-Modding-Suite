// #verify-key-uses-stale-models — VERIFY THE KEY AGAINST THE MODELS THE KEY CAN USE.
//
// Reported from the field: the API-key box said Gemini 2.5 was no longer supported and the user needed to
// upgrade. Nothing was wrong with their key.
//
// `/api/ai/verify-key` tried the HARDCODED fallback list, while both generation callers ask Google which
// models that key can actually use (`getGeminiModels` → ListModels):
//
//     server.js:10778  AI logic     getGeminiModels(apiKey)   ✓
//     server.js:16044  AI generate  getGeminiModels(apiKey)   ✓
//     server.js:10917  verify-key   GEMINI_MODELS             ✗   ← hardcoded
//
// So when Google retired the 2.5 family, a key that generated perfectly well was declared invalid, and the
// message shown was Google's own deprecation notice for the LAST model in that list — hence "2.5 is no longer
// supported, upgrade". The same shape as most of this week's bugs: a rule two callers follow and a third
// does not.
//
// Discovery is the right tool: ListModels returns what THAT key may call, so anything it returns is current
// by construction and a retired family disappears with no code change. The hardcoded list stays purely as the
// offline fallback.
//
// The second half is the message. A retired model is NOT a bad key, and saying "Invalid API Key" sends the
// user off to regenerate one that was never the problem. The endpoint now separates the two, and both verify
// buttons show a model fault in amber as a warning rather than in red as a key error.
//
// There is no API key here and Google must never be called with the user's, so the three cases that matter
// are exercised against a STUBBED Google inside this process: the reported bug reproduced (a key whose only
// usable model is one the hardcoded list has never heard of), a genuinely retired model, and a genuinely bad
// key. Stubbing also keeps the test deterministic offline. Only the client wiring is asserted at source level.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vkey-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const HOME = fs.readFileSync(path.join(__dirname, "public", "home.js"), "utf8");

// ── a stand-in for Google ────────────────────────────────────────────────────
// Only outbound calls are intercepted; the test's own requests to the server go through untouched.
const realFetch = globalThis.fetch;
let google = null;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (!/generativelanguage\.googleapis\.com/.test(u)) return realFetch(url, opts);
  if (!google) throw new Error("outbound Google call with no stub installed: " + u);
  const r = google(u, opts);
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
};
const listModels = (names) => ({ status: 200, body: { models: names.map((n) => ({ name: "models/" + n, supportedGenerationMethods: ["generateContent"] })) } });
const apiError = (status, message) => ({ status, body: { error: { message } } });
const modelOf = (u) => u.replace(/^.*\/models\//, "").replace(/:generateContent.*$/, "");

let PORT = 49400;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      verify: (body) => realFetch("http://127.0.0.1:" + PORT + "/api/ai/verify-key", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[every caller asks the same question] discovery, not a hardcoded list");
    {
      // Count the call sites rather than eyeball them: a new caller that forgets discovery should fail here.
      const discovery = (SRV.match(/getGeminiModels\(apiKey\)/g) || []).length;
      rec("all three model-choosing callers use live discovery", discovery >= 3, discovery);
      rec("…including verify-key specifically",
        /const verifyModels = await getGeminiModels\(apiKey\);/.test(SRV), "verify-key still hardcoded");
      rec("…and it tries the discovered list, not GEMINI_MODELS",
        /const modelsToTryVerify = verifyModels\.map\(geminiGenerateUrl\);/.test(SRV), "still mapping the constant");
      rec("the hardcoded list survives as the offline fallback only",
        /return GEMINI_MODELS;/.test(SRV), "fallback removed");
      rec("…and records why numbered entries age out", /#verify-key-uses-stale-models/.test(SRV), "no note");
    }

    api = await serve(createApp());

    console.log("\n[the reported bug, reproduced] a key whose only model the hardcoded list never heard of");
    {
      // Exactly the field report: every name Nova ships in its fallback list has been retired, and the key is
      // fine — it can call something newer. Before the fix this answered with Google's deprecation notice for
      // the last hardcoded model. Note the key must be fresh: getGeminiModels caches per key.
      const FUTURE = "gemini-9.9-flash";
      google = (u) => {
        if (/\/models\?/.test(u)) return listModels([FUTURE]);
        if (modelOf(u) === FUTURE) return { status: 200, body: { candidates: [{ content: { parts: [{ text: "OK" }] } }] } };
        return apiError(404, "models/" + modelOf(u) + " is no longer supported. Please upgrade to a newer model.");
      };
      const r = await api.verify({ apiKey: "key-only-future-model" });
      rec("a good key is accepted", r.b.success === true, r.b);
      rec("…and is NOT told to upgrade", !/no longer supported|upgrade/i.test(r.b.error || ""), r.b.error);
      rec("…naming the model that actually answered", r.b.model === FUTURE, r.b);
    }

    console.log("\n[a retired model is not a bad key] the two failures are told apart");
    {
      google = (u) => /\/models\?/.test(u)
        ? listModels(["gemini-9.9-flash"])
        : apiError(404, "models/gemini-9.9-flash is not found for API version v1beta, or is not supported for generateContent.");
      const r = await api.verify({ apiKey: "key-model-retired" });
      rec("the failure is classified as a MODEL fault", r.b.modelFault === true, r.b);
      rec("…and says so in words, instead of blaming the key",
        /MODEL availability problem/.test(r.b.error || "") && !/Invalid API Key/.test(r.b.error || ""), r.b.error);
      rec("…listing what it tried, from DISCOVERY not the fallback list",
        Array.isArray(r.b.triedModels) && r.b.triedModels.join() === "gemini-9.9-flash", r.b.triedModels);
    }

    console.log("\n[a bad key is still a bad key] the classification must not swallow real auth errors");
    {
      google = (u) => /\/models\?/.test(u)
        ? apiError(400, "API key not valid. Please pass a valid API key.")
        : apiError(400, "API key not valid. Please pass a valid API key.");
      const r = await api.verify({ apiKey: "key-invalid" });
      rec("an invalid key reports a KEY problem", !!r.b.error && !r.b.modelFault, r.b);
      rec("…surfacing what Google said rather than a generic message",
        /API key not valid/.test(r.b.error || ""), r.b.error);
      rec("…falling back to the hardcoded list when ListModels cannot answer either",
        (r.b.triedModels || []).length > 0 && (r.b.triedModels || []).every((m) => /^gemini/.test(m)), r.b.triedModels);
    }

    console.log("\n[no key at all]");
    {
      google = () => { throw new Error("must not call Google without a key"); };
      const r = await api.verify({});
      rec("no key is refused clearly", /No API key provided/.test(r.b.error || ""), r.b);
      rec("…and is not dressed up as a model fault", !r.b.modelFault, r.b);
    }
    google = null;
    api.stop(); api = null;

    console.log("\n[the two verify buttons] show a model fault as a warning, not a failure");
    for (const [name, src] of [["Settings (app.js)", APP], ["first-run panel (home.js)", HOME]]) {
      rec(`${name} handles modelFault`, /data\.modelFault/.test(src), "not handled");
      rec(`…${name} shows it in amber rather than red`, /#d29922/.test(src), "no warning colour");
      rec(`…${name} names the model that answered on success`, /data\.model \?/.test(src), "does not report the model");
    }

    console.log("\n[still valid]");
    const parses = (src) => { try { new Function(src); return "ok"; } catch (e) { return String(e.message); } };
    rec("app.js parses", parses(APP) === "ok", parses(APP));
    rec("home.js parses", parses(HOME) === "ok", parses(HOME));
    rec("…both versioned so the change ships",
      /app\.js\?v=[\w]+/.test(fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8"))
      && /home\.js\?v=[\w]+/.test(fs.readFileSync(path.join(__dirname, "public", "home.html"), "utf8")), "no version");

    console.log(`\n=== verify key model discovery: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = realFetch;
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
