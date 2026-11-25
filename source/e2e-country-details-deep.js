// DEEP Country Setup round-trip + fusion-invariant test. Country Setup edits the NON-geography startup
// details (research slots, stability, war support, convoys, ruling party, ideology popularities) while the
// Map tab now owns geography (capital/colour/territory). The critical seam: saving details here must NEVER
// clobber the Map-owned `capital`, and must NEVER drop the country file's un-modeled script (leader, tech,
// guarantees, dated blocks). This test loads a rich country, edits MANY fields through the real UI, saves,
// reads the file off disk, RELOADS the page, and verifies the round-trip — plus that the disabled Capital
// field still deep-links to the Map. Run: npm run test:country-deep
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// A realistic country history file: the modelled keys (capital/slots/stability/war support/convoys/politics/
// popularities) PLUS un-modelled script (oob, set_technology, create_country_leader, give_guarantee) and a
// dated block whose own set_stability must NOT be touched when we rewrite the top-level one.
const RICH = `capital = 5

oob = "CCC_1936"
set_research_slots = 2
set_stability = 0.50
set_war_support = 0.50
set_convoys = 10

set_technology = {
	infantry_weapons = 1
	tech_support = 1
}

set_politics = {
	ruling_party = neutrality
	last_election = "1936.1.1"
	election_frequency = 48
	elections_allowed = no
}

set_popularities = {
	neutrality = 100
}

create_country_leader = {
	name = "Test Leader"
	picture = "GFX_portrait_test"
	ideology = despotism
}

give_guarantee = DDD

1939.1.1 = {
	set_stability = 0.70
}
`;

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-csdeep-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Country Deep E2E"\nreplace_path="history/countries"\nreplace_path="common/countries"\nreplace_path="common/country_tags"\n');
  mk(path.join(mod, "common", "country_tags", "00_countries.txt"), 'CCC = "countries/CCC.txt"\n');
  mk(path.join(mod, "common", "countries", "CCC.txt"), "");
  mk(path.join(mod, "history", "countries", "CCC.txt"), RICH);
  return mod;
}

const ccc = (mod) => fs.readFileSync(path.join(mod, "history", "countries", "CCC.txt"), "utf8");
const scalar = (txt, key) => { const m = new RegExp("(?:^|\\n)[ \\t]*" + key + "\\s*=\\s*([^\\s\\n#]+)").exec(txt); return m ? m[1] : null; };
// value of `key` INSIDE the first `block = { ... }` (e.g. ruling_party inside set_politics).
const inBlock = (txt, block, key) => { const b = new RegExp(block + "\\s*=\\s*\\{([\\s\\S]*?)\\n\\}").exec(txt); return b ? scalar(b[1], key) : null; };

(async () => {
  console.log("=== COUNTRY SETUP DEEP (edit many fields → save → reload → verify; capital never clobbered) ===");
  const mod = buildMod();
  const PORT = 3689, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  // Country Setup reads the active mod from its header dropdown (populated by /api/mods/list), not straight
  // from localStorage like the Map. Our mod lives in a temp dir the scanner won't list, so surface it here.
  await page.route("**/api/mods/list", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mods: [{ path: mod, name: "Nova Country Deep E2E" }] }) }));

  const waitCapital = () => page.waitForFunction(() => { const c = document.getElementById("csCapital"); return c && c.value !== ""; }, null, { timeout: 30000 });
  const setVal = (id, v) => page.evaluate(([i, val]) => { const el = document.getElementById(i); el.value = String(val); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);

  try {
    await page.goto(`${BASE}/country-setup.html?tag=CCC`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#csSaveDetailsBtn", { timeout: 15000 });
    await waitCapital();
    ok("country CCC auto-selected from deep-link (capital field loaded)", true);

    // ── The fusion invariant on the UI side: Capital is read-only (Map owns geography) ──
    const capState = await page.evaluate(() => { const c = document.getElementById("csCapital"); return { ro: c.readOnly, val: c.value, hasHint: !!document.getElementById("csCapitalMapLink") }; });
    ok("Capital field is read-only (geography is Map-owned)", capState.ro === true, capState);
    ok("Capital field shows the on-disk capital (5)", capState.val === "5", capState.val);
    ok('"Set capital on the Map" hint link is present', capState.hasHint === true);

    // ── Edit MANY non-geography fields ──
    await setVal("csResearchSlots", 4);
    await setVal("csStability", 75);     // → 0.75
    await setVal("csWarSupport", 30);    // → 0.30
    await setVal("csConvoys", 25);
    await setVal("csRulingParty", "fascism");
    await setVal("csElectionsAllowed", "no");
    await setVal("popDemocratic", 0);
    await setVal("popFascism", 60);
    await setVal("popCommunism", 0);
    await setVal("popNeutrality", 40);

    const [saveResp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/history\/save-country-details/.test(r.url()) && r.request().method() === "POST", { timeout: 15000 }),
      page.click("#csSaveDetailsBtn"),
    ]);
    const saveBody = await saveResp.json().catch(() => ({}));
    ok("Save Details POST returned ok", saveResp.status() === 200 && saveBody.ok === true, { status: saveResp.status(), body: saveBody });

    // ── Verify ON DISK ──
    const after = ccc(mod);
    ok("disk: capital is STILL 5 (Save never clobbers the Map-owned capital)", scalar(after, "capital") === "5", scalar(after, "capital"));
    ok("disk: set_research_slots → 4", scalar(after, "set_research_slots") === "4", scalar(after, "set_research_slots"));
    ok("disk: set_stability → 0.75", scalar(after, "set_stability") === "0.75", scalar(after, "set_stability"));
    ok("disk: set_war_support → 0.3", scalar(after, "set_war_support") === "0.3", scalar(after, "set_war_support"));
    ok("disk: set_convoys → 25", scalar(after, "set_convoys") === "25", scalar(after, "set_convoys"));
    ok("disk: ruling_party → fascism", inBlock(after, "set_politics", "ruling_party") === "fascism", inBlock(after, "set_politics", "ruling_party"));
    ok("disk: popularity fascism → 60", inBlock(after, "set_popularities", "fascism") === "60", inBlock(after, "set_popularities", "fascism"));
    ok("disk: popularity neutrality → 40", inBlock(after, "set_popularities", "neutrality") === "40", inBlock(after, "set_popularities", "neutrality"));
    ok("disk: exactly one set_politics block (no duplicate)", (after.match(/set_politics\s*=\s*\{/g) || []).length === 1, (after.match(/set_politics\s*=\s*\{/g) || []).length);
    ok("disk: exactly one set_popularities block (no duplicate)", (after.match(/set_popularities\s*=\s*\{/g) || []).length === 1);

    // ── Un-modelled script must survive a Save (makers can silently drop un-modelled fields) ──
    ok("disk: oob survived", /oob\s*=\s*"CCC_1936"/.test(after));
    ok("disk: set_technology block survived", /set_technology\s*=\s*\{[\s\S]*infantry_weapons\s*=\s*1/.test(after));
    ok("disk: create_country_leader survived", /create_country_leader\s*=\s*\{[\s\S]*Test Leader/.test(after));
    ok("disk: give_guarantee survived", /give_guarantee\s*=\s*DDD/.test(after));
    ok("disk: the dated 1939.1.1 block (and ITS set_stability=0.7) survived untouched", /1939\.1\.1\s*=\s*\{[\s\S]*set_stability\s*=\s*0\.70/.test(after), after.slice(-200));
    ok("disk: file is brace-balanced after save", (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}" && --d < 0) return false; } return d === 0; })());

    // ── RELOAD the page and verify the UI round-trips the saved values ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#csSaveDetailsBtn", { timeout: 15000 });
    await waitCapital();
    const reload = await page.evaluate(() => ({
      capital: document.getElementById("csCapital").value,
      slots: document.getElementById("csResearchSlots").value,
      stability: document.getElementById("csStability").value,
      warSupport: document.getElementById("csWarSupport").value,
      convoys: document.getElementById("csConvoys").value,
      ruling: document.getElementById("csRulingParty").value,
      fascism: document.getElementById("popFascism").value,
      neutrality: document.getElementById("popNeutrality").value,
    }));
    ok("reload: capital still shows 5", reload.capital === "5", reload.capital);
    ok("reload: research slots 4", reload.slots === "4", reload.slots);
    ok("reload: stability 75", reload.stability === "75", reload.stability);
    ok("reload: war support 30", reload.warSupport === "30", reload.warSupport);
    ok("reload: convoys 25", reload.convoys === "25", reload.convoys);
    ok("reload: ruling party fascism", reload.ruling === "fascism", reload.ruling);
    ok("reload: popularity fascism 60", reload.fascism === "60", reload.fascism);
    ok("reload: popularity neutrality 40", reload.neutrality === "40", reload.neutrality);

    // ── The disabled geography fields deep-link to the Map. Stub map.html (abort+capture) so the click
    //    captures the redirect URL. Aborting a main-frame navigation leaves the page non-interactive, so
    //    re-load country-setup fresh before each redirect probe. ──
    let captured = null;
    await page.route("**/map.html*", (route) => { captured = route.request().url(); route.abort(); });
    const checkRedirect = async (sel, how) => {
      await page.goto(`${BASE}/country-setup.html?tag=CCC`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(sel, { timeout: 15000 });
      await waitCapital();
      captured = null;
      if (how === "mousedown") await page.dispatchEvent(sel, "mousedown"); else await page.click(sel);
      for (let i = 0; i < 40 && !captured; i++) await new Promise((r) => setTimeout(r, 80));
      return captured;
    };
    const capUrl = await checkRedirect("#csCapitalMapLink");
    ok("Capital hint link deep-links to the Map's 🏛 capital tool for CCC", capUrl && /tag=CCC/i.test(capUrl) && /tool=capital/i.test(capUrl), capUrl);
    const editUrl = await checkRedirect("#csEditOnMapBtn");
    ok('"Edit on Map" deep-links to the Map (paint tool) for CCC', editUrl && /tag=CCC/i.test(editUrl) && /tool=paint/i.test(editUrl), editUrl);
    const fieldUrl = await checkRedirect("#csCapital", "mousedown");
    // #capital-no-nav — the field deliberately does NOT navigate any more. It is read-only but looks like the
    // editable inputs beside it, so a mousedown-jump pulled the user to the Map and dropped unsaved Details
    // edits with no dirty guard. The hint link above is the safe route and is asserted to work. Keeping this
    // as a NEGATIVE assertion means the old behaviour cannot quietly return.
    ok("clicking the read-only Capital field does NOT navigate (#capital-no-nav)", !fieldUrl, fieldUrl);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nCOUNTRY-DEEP: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
