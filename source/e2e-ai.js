// AI-features E2E: exercises the "✨ Generate with AI" button in every maker that has one, for REAL
// (no mock): clicks generate with a prompt, confirms the request fires, the response is handled
// gracefully (status shown, no uncaught error), across research/events/decisions/ideas/characters.
// Without a Gemini key the endpoint returns a handled "No API key" message — which is exactly the
// error path we want to confirm degrades gracefully. If GEMINI_API_KEY is set in the environment, it
// instead makes REAL calls and PRINTS what Gemini generates (so you can see the output).
// Run: `node e2e-ai.js` (or `npm run test:ai`).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3551;
const BASE = `http://127.0.0.1:${PORT}`;
const HAS_KEY = !!process.env.GEMINI_API_KEY;

let pass = 0, fail = 0; const fails = [];
const check = (n, c, d) => { if (c) { pass++; console.log("    ✓ " + n); } else { fail++; fails.push(n + (d ? " → " + d : "")); console.log("    ✗ FAIL " + n + (d != null ? " → " + d : "")); } };

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ai-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="AI Test"\nsupported_version="*"\n');
  mk("common/country_tags/00.txt", 'TST = "countries/TST.txt"\n');
  mk("history/countries/TST - Test.txt", "capital = 1\n");
  mk("localisation/english/x_l_english.yml", "﻿l_english:\n TST:0 \"Testland\"\n");
  return mod;
}

// Each AI maker: page, the prompt field, the generate button, and a plain-English prompt to send.
const AI_MAKERS = [
  { name: "Research", page: "research.html", promptSel: "#aiPrompt", btnSel: "#generateAiBtn", prompt: "A late-war infantry laser rifle technology.",
    // Research's AI fills the SELECTED tech, so create one first (the AI panel is hidden otherwise).
    setup: async (page) => { await page.locator("#newTechBtn").click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(300); await page.locator("#novaChoiceSquare").click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(500); } },
  { name: "Events", page: "events.html", promptSel: "#aiEventPrompt", btnSel: "#generateAiEventBtn", prompt: "An event where the country discovers oil, gaining political power." },
  { name: "Decisions", page: "decisions.html", promptSel: "#aiDecisionPrompt", btnSel: "#generateAiDecisionBtn", prompt: "A decision to nationalize industry that boosts factory output." },
  { name: "Ideas", page: "ideas.html", promptSel: "#aiIdeaPrompt", btnSel: "#generateAiIdeaBtn", prompt: "A national spirit representing a strong economy: +10% factory output." },
  { name: "Characters", page: "characters.html", promptSel: "#aiCharPrompt", btnSel: "#generateAiCharBtn", prompt: "A charismatic democratic country leader named Jane Doe." },
];

(async () => {
  console.log("=== AI FEATURES E2E ===  (mode: " + (HAS_KEY ? "REAL Gemini calls — output printed below" : "no key → testing graceful error handling") + ")");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);

  try {
    for (const M of AI_MAKERS) {
      console.log("\n── " + M.name + " — ✨ Generate with AI ──");
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message || e)));
      page.on("dialog", (d) => d.accept().catch(() => {}));
      await page.goto(`${BASE}/${M.page}`, { waitUntil: "domcontentloaded" });
      // A fixed 1.8s here was tuned on a WARM icon cache and quietly encoded the developer's own machine.
      // With a cold cache — a fresh install, a new contributor, CI, or any sandboxed run — these pages fire
      // dozens of sprite/.dds conversions on load, and the click landed while the page was still setting
      // itself up: no request went out and the assertion read as a product failure. Verified it is NOT one;
      // a probe that lets the page settle gets the request, the status message and zero console errors on a
      // cold cache. So wait for the page to GO QUIET rather than guessing how long that takes, and keep a
      // short fixed settle after it for the synchronous render that follows the last response.
      await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_) {} })).catch(() => {});
      if (M.setup) await M.setup(page);

      const hasPrompt = await page.$(M.promptSel);
      const hasBtn = await page.$(M.btnSel);
      check(`${M.name}: AI prompt field + generate button present`, !!hasPrompt && !!hasBtn, "");
      if (!hasPrompt || !hasBtn) { await page.close(); continue; }

      await page.fill(M.promptSel, M.prompt).catch(async () => {
        await page.evaluate(({ s, v }) => { const e = document.querySelector(s); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } }, { s: M.promptSel, v: M.prompt });
      });

      const aiReq = page.waitForResponse((r) => r.url().includes("/api/ai/logic"), { timeout: 30000 }).catch(() => null);
      await page.locator(M.btnSel).click({ timeout: 6000, force: true }).catch(() => {});
      const resp = await aiReq;
      check(`${M.name}: clicking generate fires /api/ai/logic`, !!resp, "no request");
      let body = null;
      if (resp) { try { body = await resp.json(); } catch (_) {} }
      // Wait for the maker to process the response (fill fields or show the error).
      await page.waitForTimeout(1500);
      const status = await page.evaluate(() => { const el = document.getElementById("aiStatus"); return el ? (el.textContent || "").trim() : ""; }).catch(() => "");

      if (HAS_KEY) {
        const gen = body && (body.script || body.error);
        console.log("    ↳ Gemini returned:", String(gen).slice(0, 500).replace(/\s+/g, " "));
        check(`${M.name}: real AI call returned a script (no error)`, !!(body && body.script && !body.error), body && body.error ? body.error : "");
      } else {
        // No key: the endpoint must return a HANDLED error and the UI must show it gracefully.
        check(`${M.name}: endpoint returns handled no-key error (not a crash)`, !!(resp && resp.status() < 500 && body && body.error), body ? JSON.stringify(body).slice(0, 100) : "no body");
        check(`${M.name}: UI shows a status message (handled gracefully)`, status.length > 0, "aiStatus empty");
        console.log("    ↳ status shown:", JSON.stringify(status.slice(0, 120)));
      }
      check(`${M.name}: no uncaught JS error during AI flow`, errors.length === 0, errors.slice(0, 2).join(" | "));
      await page.close();
    }
  } catch (e) { fail++; fails.push("harness: " + e.message); console.log("  ✗ harness threw:", e.message); }
  finally { await browser.close(); try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} server.close(); }

  console.log(`\n=== AI E2E: ${pass} passed, ${fail} failed ===`);
  if (!HAS_KEY) console.log("NOTE: ran in no-key mode (verified graceful error handling). To see REAL Gemini output, set GEMINI_API_KEY and re-run.");
  if (fail) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
  process.exit(0);
})();
