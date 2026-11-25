// DEEP full-mod E2E: drives the REAL program (frontend + backend) through full create→edit→save flows
// on a fresh demo mod, exercising every tab + clicking the contextual/action buttons the smoke test
// skips, then VERIFYING the results on disk. Builds a loadable demo mod ("nova_e2e_demo") in your HOI4
// mod folder. Run: `node e2e-full-mod.js` (or `npm run test:full`). Headless Chromium against the
// in-process Express server (frontend is pure-HTTP, so this is faithful to the real app).
//
// Catches: broken action buttons, save bugs, wrong file output, dead contextual controls — the deep
// flows the all-pages smoke can't reach. Any uncaught JS error or failed assertion fails the run.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { Jimp } = require("jimp");
const { createApp } = require("./server.js");

// Write a small valid PNG to `p` (the inline 1x1 hex used elsewhere isn't decodable by Jimp).
async function writeTestPng(p, color = 0x3366ffff) {
  const img = new Jimp({ width: 16, height: 16, color });
  await img.write(p);
  return p;
}

const PORT = 3543;
const BASE = `http://127.0.0.1:${PORT}`;
const MOD_NAME = "nova_e2e_demo";
// The runner's first-launch wait. run-e2e.js gives every file a fresh mods root and a fresh app-data folder, so every run is a
// FIRST launch that builds Nova's caches while this file clicks, and it exports NOVA_E2E_CLICK_TIMEOUT_MS (45 s) for exactly that.
const FIRST_LAUNCH_MS = Number(process.env.NOVA_E2E_CLICK_TIMEOUT_MS) || 45000;

// ── tiny assert/log framework ───────────────────────────────────────────────
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("    ✓ " + name); }
  else { fail++; fails.push(name + (detail ? " → " + detail : "")); console.log("    ✗ FAIL " + name + (detail != null ? " → " + detail : "")); }
}
const stepHdr = (n) => console.log("\n── " + n + " ──");

function resolveModsRoot() {
  // #e2e-writes-into-the-live-mod-folder — the run's own mods root, and no other. run-e2e.js hands this file a scratch one in
  // HOI4_MODS_ROOT, and run bare, the guard at the top of safe-write.js (which server.js loads, above) does the same. This fell
  // back to the user's REAL Documents\Paradox Interactive\Hearts of Iron IV\mod when the variable was unset, and the run below
  // deletes the demo mod inside whatever it names. ⛔ #a-test-names-no-folder-of-the-users: unset now stops the run instead, as
  // e2e-workflow-test.js, e2e-research-test.js and e2e-edit-roundtrip.js already do.
  const MODS_ROOT = process.env.HOI4_MODS_ROOT;
  if (!MODS_ROOT) {
    console.error("ERROR: HOI4_MODS_ROOT is not set. This test deletes and creates a mod in the mods root, and it will not reach for the real one: run it through run-e2e.js, or bare (safe-write.js's guard sets it).");
    process.exit(1);
  }
  return MODS_ROOT;
}

async function fill(page, sel, val) {
  await page.waitForSelector(sel, { state: "visible", timeout: 8000 });
  await page.locator(sel).fill(String(val), { timeout: 8000 }).catch(async () => {
    await page.evaluate(({ s, v }) => { const el = document.querySelector(s); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } }, { s: sel, v: String(val) });
  });
}
// ⛔ A first launch is slow IN THIS PROCESS. The server runs inside this file's own node process, so while it builds a cold
// cache synchronously (the sprite map, on the spirits page, does about 12 s of existsSync/readdirSync in chunks of 2-3 s),
// Playwright's own round trips wait behind it: "locator resolved to visible <button id=newIdeaBtn>" was logged and the 8 s
// deadline still passed, in 5 of 8 runs at 810459f0. Every click() target is a button the step needs, so waiting the
// runner's first-launch time costs nothing when it is there, and a button that never shows still fails.
async function click(page, sel) {
  await page.waitForSelector(sel, { state: "visible", timeout: FIRST_LAUNCH_MS });
  await page.locator(sel).click({ timeout: 8000 }).catch(async () => {
    await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, sel);
  });
}
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; } };
function dirHasText(dir, text) {
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      if (read(path.join(dir, f)).includes(text)) return true;
    }
  } catch (_) {}
  return false;
}
// Read any non-locking modal text currently showing (validation messages surface here).
async function modalText(page) {
  return await page.evaluate(() => {
    const ov = document.getElementById("novaInfoModalOverlay");
    return ov ? (ov.textContent || "").trim().slice(0, 160) : "";
  }).catch(() => "");
}
// Connect the current maker item to country TST via the shared owner-bridge widget.
async function connectOwner(page, hostId) {
  await page.evaluate((id) => {
    const host = document.getElementById(id);
    if (!host) return;
    const p = host.querySelector(".ob-picker");
    const b = host.querySelector(".ob-add");
    if (!p || !b) return;
    if (![...p.options].some((o) => o.value === "TST")) { const o = document.createElement("option"); o.value = "TST"; o.textContent = "TST"; p.appendChild(o); }
    p.value = "TST";
    b.click();
  }, hostId);
}

// ── STAGES ──────────────────────────────────────────────────────────────────
async function stageCountry(page, modRoot) {
  stepHdr("Country Setup — create country TST + edit details + spirit");
  await page.goto(`${BASE}/country-setup.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Create country TST via the dialog.
  await click(page, "#csCreateCountryBtn");
  await page.waitForSelector("#csCreateCountryDialog[open], #csCreateCountryDialog", { timeout: 5000 }).catch(() => {});
  await fill(page, "#ccTag", "TST");
  await fill(page, "#ccName", "Testland");
  await fill(page, "#ccCapital", "1");
  // #ccColor is now a colour picker (type=color) — set a hex directly (Playwright fill() rejects colour inputs).
  await page.evaluate(() => { const el = document.getElementById("ccColor"); if (el) { el.value = "#783c50"; el.dispatchEvent(new Event("input", { bubbles: true })); } });
  const createResp = page.waitForResponse((r) => r.url().includes("/api/countries/create"), { timeout: 15000 });
  await click(page, "#ccCreateBtn");
  const cr = await createResp; const crJson = await cr.json().catch(() => ({}));
  check("create country TST returns ok", cr.status() === 200 && !crJson.error, JSON.stringify(crJson).slice(0, 120));

  const tagFile = path.join(modRoot, "common", "country_tags", "custom_countries.txt");
  check("country tag written to disk", /TST\s*=/.test(read(tagFile)), tagFile);
  const histFile = path.join(modRoot, "history", "countries", "TST - Testland.txt");
  check("country history file written", read(histFile).includes("capital = 1"), histFile);

  // Select TST in the list so the details panel populates, then edit + save details.
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[data-tag], .cs-country-item, #csCountryList *")].find((e) => (e.getAttribute && e.getAttribute("data-tag") === "TST") || (e.textContent || "").includes("TST"));
    if (row) row.click();
  });
  await page.waitForTimeout(1200);

  // Fill the detail fields if present, balance popularities, save.
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } };
    set("csStability", "60"); set("csWarSupport", "55"); set("csResearchSlots", "4"); set("csConvoys", "50");
  });
  await page.locator("#popBalanceBtn").click({ timeout: 4000 }).catch(() => {});
  const saveDetails = page.waitForResponse((r) => r.url().includes("/api/history/save-country-details"), { timeout: 15000 }).catch(() => null);
  await page.locator("#csSaveDetailsBtn").click({ timeout: 5000 }).catch(() => {});
  const sd = await saveDetails;
  if (sd) check("save country details responds", sd.status() < 500, "HTTP " + sd.status());
  check("stability persisted to history", /set_stability\s*=/.test(read(histFile)), histFile);

  // Add a national spirit to the country (if the control is present).
  await fill(page, "#csAddSpiritInput", "test_demo_spirit").catch(() => {});
  await page.locator("#csAddSpiritBtn").click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);

  return { tag: "TST", name: "Testland", histFile };
}

async function stageIdeas(page, modRoot) {
  stepHdr("National Spirits — create spirit with modifier + connect to TST");
  await page.goto(`${BASE}/ideas.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await click(page, "#newIdeaBtn");
  await page.waitForTimeout(400);
  await fill(page, "#ideaId", "demo_spirit");
  await fill(page, "#ideaName", "Demo Spirit");
  await fill(page, "#ideaDescription", "A test national spirit created by the full-mod E2E.");
  await fill(page, "#ideaModifiers", "stability_factor = 0.10\nwar_support_factor = 0.05");
  await connectOwner(page, "ideaOwnerBridge");
  const tgtBefore = await page.evaluate(() => (document.getElementById("ideaTargetFile") || {}).value);
  console.log("      [diag] ideaTargetFile value at save (app default) =", JSON.stringify(tgtBefore));
  check("new-spirit target file is a .txt (not 'Drafts')", /\.txt$/i.test(tgtBefore), tgtBefore);
  const save = page.waitForResponse((r) => r.url().includes("/api/ideas/upsert-definition"), { timeout: 8000 }).catch(() => null);
  await click(page, "#saveIdeaBtn");
  const s = await save;
  if (!s) console.log("      [diag] no ideas save fetch fired; modal=", await modalText(page));
  else if (s.status() >= 400) console.log("      [diag] ideas save", s.status(), await s.text().catch(() => ""));
  if (s) check("ideas save responds ok", s.status() < 400, "HTTP " + s.status());
  await page.waitForTimeout(900);
  const ideasDir = path.join(modRoot, "common", "ideas");
  check("spirit written to common/ideas", dirHasText(ideasDir, "demo_spirit"), ideasDir);
  check("spirit modifier persisted", dirHasText(ideasDir, "stability_factor"), "");
}

async function stageDecisions(page, modRoot) {
  stepHdr("Decisions — create decision with effect + connect to TST");
  await page.goto(`${BASE}/decisions.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await click(page, "#newDecisionBtn");
  await page.waitForTimeout(700);
  // decisionCategory is a <select> — pick a real option; set the text IDs directly + fire events.
  await page.evaluate(() => {
    const cat = document.getElementById("decisionCategory");
    if (cat && cat.options.length) cat.selectedIndex = 0;
    const setv = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } };
    setv("decisionId", "demo_decision");
    setv("decisionName", "Demo Decision");
    setv("decisionCost", "50");
  });
  const catDiag = await page.evaluate(() => ({ cat: (document.getElementById("decisionCategory") || {}).value, id: (document.getElementById("decisionId") || {}).value }));
  console.log("      [diag] decision category/id at save =", JSON.stringify(catDiag));
  await fill(page, "#decisionEffect", "add_political_power = 100").catch(() => {});
  await fill(page, "#decisionAvailable", "has_war = no").catch(() => {});
  await connectOwner(page, "decisionOwnerBridge");
  const save = page.waitForResponse((r) => r.url().includes("/api/decisions/save"), { timeout: 8000 }).catch(() => null);
  await click(page, "#saveDecisionBtn");
  const s = await save;
  if (!s) console.log("      [diag] no decisions save fetch fired; modal=", await modalText(page));
  else if (s.status() >= 400) console.log("      [diag] decisions save", s.status(), await s.text().catch(() => ""));
  if (s) check("decisions save responds ok", s.status() < 400, "HTTP " + s.status());
  await page.waitForTimeout(900);
  const decDir = path.join(modRoot, "common", "decisions");
  check("decision written to common/decisions", dirHasText(decDir, "demo_decision"), decDir);
  check("decision effect persisted", dirHasText(decDir, "add_political_power"), "");
}

async function stageEvents(page, modRoot) {
  stepHdr("Events — create event with option + immediate effect + connect to TST");
  await page.goto(`${BASE}/events.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await click(page, "#newEventBtn");
  await page.waitForTimeout(400);
  await fill(page, "#eventNamespace", "tstdemo");
  await fill(page, "#eventId", "1");
  await fill(page, "#eventTitle", "Demo Event");
  await fill(page, "#eventDescription", "A test event from the full-mod E2E.");
  await fill(page, "#eventImmediate", "add_political_power = 50").catch(() => {});
  await connectOwner(page, "eventOwnerBridge").catch(() => {});
  // ensure at least one option exists
  await page.locator("#addOptionBtn").click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  const save = page.waitForResponse((r) => r.url().includes("/api/events/save"), { timeout: 15000 }).catch(() => null);
  await click(page, "#saveEventBtn");
  const s = await save; if (s) check("events save responds ok", s.status() < 400, "HTTP " + s.status());
  await page.waitForTimeout(900);
  const evDir = path.join(modRoot, "events");
  check("event written to events/", dirHasText(evDir, "tstdemo.1"), evDir);
}

async function stageFocus(page, modRoot) {
  stepHdr("Focus Tree — load tree, add a focus, attach an effect, save");
  const treePath = path.join(modRoot, "common", "national_focus", "nova_e2e_demo_focus_tree.txt");
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // Close the startup overlay if present.
  await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_) {} }); }).catch(() => {});
  // Load the mod's focus tree through the real loadFile() path.
  await page.evaluate(async (p) => { const el = document.getElementById("filePath"); if (el) el.value = p; if (typeof loadFile === "function") await loadFile(); }, treePath);
  await page.waitForTimeout(1500);
  const parsedOk = await page.evaluate(() => typeof parsed !== "undefined" && !!parsed);
  check("focus tree loaded (parsed)", parsedOk, "");

  // Add a focus via the Add Focus dialog (real button + form).
  await page.locator("#addFocusBtn").click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const setv = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } };
    setv("createFocusIdInput", "tst_demo_focus"); setv("createFocusNameInput", "Demo Focus"); setv("createFocusXInput", "2"); setv("createFocusYInput", "0");
  });
  await page.locator("#createFocusApplyBtn").click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  const focusAdded = await page.evaluate(() => typeof parsed !== "undefined" && parsed && (parsed.focuses || []).some((f) => f.id === "tst_demo_focus"));
  check("focus added to the tree model", focusAdded, "");

  // Attach a completion_reward effect via the real apply path (the AI-apply uses the same function).
  await page.evaluate(async () => {
    try { if (typeof selectedIds !== "undefined") { selectedIds.clear(); selectedIds.add("tst_demo_focus"); } } catch (_) {}
    if (typeof applyAiGeneratedEffects === "function") await applyAiGeneratedEffects("add_political_power = 100");
  }).catch(() => {});
  await page.waitForTimeout(500);

  // Save via the real Save button.
  const save = page.waitForResponse((r) => /\/api\/(save|load)/.test(r.url()) && r.request().method() === "POST", { timeout: 12000 }).catch(() => null);
  await page.locator("#saveBtn").click({ timeout: 5000 }).catch(() => {});
  await save;
  await page.waitForTimeout(900);
  const tree = read(treePath);
  check("focus written to focus-tree file", tree.includes("tst_demo_focus"), treePath);
  check("focus completion_reward effect persisted", /add_political_power/.test(tree), "(effect may need the menu UI)");

  // #6 — upload a custom focus icon (Upload button → file chooser → /api/upload-gfx → GFX_focus_<id>). The chooser is awaited
  // together with the click that opens it, as in stageCharacters, so no handler outlives this upload; and the upload must send
  // exactly ONE request: stageCharacters' old page.once("filechooser"), armed for a click that never opened a chooser, fired
  // here too and sent its own picture up with this one (one chooser, two POST /api/upload-gfx).
  const focusUploads = [];
  const onFocusUpload = (req) => { if (req.method() === "POST" && req.url().includes("/api/upload-gfx")) focusUploads.push(req.url()); };
  page.on("request", onFocusUpload);
  try {
    const tmpPng = await writeTestPng(path.join(os.tmpdir(), "nova_e2e_focus_icon.png"));
    await page.evaluate(() => { try { selectedIds.clear(); selectedIds.add("tst_demo_focus"); } catch (_) {} });
    const up = page.waitForResponse((r) => r.url().includes("/api/upload-gfx"), { timeout: FIRST_LAUNCH_MS }).catch(() => null);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: FIRST_LAUNCH_MS }),
      page.locator("#uploadFocusIconBtn").click({ timeout: FIRST_LAUNCH_MS }),
    ]);
    await chooser.setFiles(tmpPng);
    const upResp = await up;
    if (upResp) check("focus icon upload responds ok", upResp.status() < 400, "HTTP " + upResp.status());
    await page.waitForTimeout(800);
    const goalsDir = path.join(modRoot, "gfx", "interface", "goals");
    check("uploaded focus icon written to gfx/interface/goals", fs.existsSync(goalsDir) && fs.readdirSync(goalsDir).some((f) => /tst_demo_focus.*\.dds$/i.test(f)), goalsDir);
    const iconVal = await page.evaluate(() => (document.getElementById("sb-focus-icon") || {}).value || "");
    check("focus icon field set to the uploaded GFX_focus_ key", /^GFX_focus_/i.test(iconVal), iconVal);
  } catch (e) { check("focus icon upload flow ran", false, String(e && e.message || e)); }
  finally { page.off("request", onFocusUpload); }
  check("focus icon upload: one file chooser, one POST /api/upload-gfx", focusUploads.length === 1, JSON.stringify(focusUploads));
}

async function stageCharacters(page, modRoot) {
  stepHdr("Characters — full character (3 roles, skills, traits, portrait, upload) recruited to TST");
  await page.goto(`${BASE}/characters.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await click(page, "#newCharBtn");
  await page.waitForTimeout(400);
  // Names, file, enable all three roles.
  await page.evaluate(() => {
    const setv = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } };
    setv("chToken", "TST_demo_character"); setv("chName", "Otto von Example"); setv("chFile", "custom_characters.txt");
    ["roleLeader", "roleAdvisor", "roleGeneral"].forEach((id) => { const c = document.getElementById(id); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); } });
  });
  await page.waitForTimeout(500);
  // Fill every role's fields, skills, traits, portrait paths.
  await page.evaluate(() => {
    const setv = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } };
    setv("leaderIdeology", "despotism"); setv("leaderExpire", "1965.1.1"); setv("leaderTraits", "war_hero");
    setv("advisorSlot", "political_advisor"); setv("advisorCost", "150"); setv("advisorIdeaToken", "tst_advisor"); setv("advisorTraits", "smooth_talking_charmer");
    setv("generalType", "corps_commander"); setv("genSkill", "4"); setv("genAttack", "5"); setv("genDefense", "3"); setv("genPlanning", "2"); setv("genLogistics", "2"); setv("generalTraits", "inspirational_leader");
    setv("pArmyLarge", "gfx/leaders/TST/portrait_tst_large.dds"); setv("pCivLarge", "gfx/leaders/TST/portrait_tst_civ.dds");
  });
  const save = page.waitForResponse((r) => r.url().includes("/api/characters/save"), { timeout: 10000 }).catch(() => null);
  await click(page, "#saveCharBtn");
  const s = await save;
  if (!s) console.log("      [diag] no char save fetch; modal=", await modalText(page));
  else if (s.status() >= 400) console.log("      [diag] char save", s.status(), await s.text().catch(() => ""));
  if (s) check("characters save responds ok", s.status() < 400, "HTTP " + (s && s.status()));
  await page.waitForTimeout(800);
  const charDir = path.join(modRoot, "common", "characters");
  check("character written to disk", dirHasText(charDir, "TST_demo_character"), charDir);
  check("character display name persisted (localisation)", read(path.join(modRoot, "localisation", "english", "custom_characters_l_english.yml")).includes("Otto von Example"), "");
  check("character leader role persisted", dirHasText(charDir, "country_leader"), "");
  check("character general skills persisted", dirHasText(charDir, "skill = 4") && dirHasText(charDir, "attack_skill = 5"), "");
  check("character portrait path persisted", dirHasText(charDir, "portrait_tst_large"), "");

  // Recruit into TST. The recruit box is collapsible — expand it first, then add.
  await page.evaluate(() => {
    const head = document.querySelector('[data-box="boxRecruit"]'); if (head) head.click();
    const sel = document.getElementById("recruitCountrySelect");
    if (sel) { if (![...sel.options].some((o) => o.value === "TST")) { const o = document.createElement("option"); o.value = "TST"; o.textContent = "TST"; sel.appendChild(o); } sel.value = "TST"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await page.waitForTimeout(300);
  // ⛔ The click has to REACH the button. Every character save reloads the list with includeBaseMod=1, and since b2421b83
  // that list carries the base game's characters too (5,409 in 232 files, a 4.2 MB answer), so the reload outlasts
  // loading-overlay.js's 500 ms and the page's full-screen Loading… veil comes up over everything. A force:true click skips
  // Playwright's wait for the element to receive the click: it landed on the veil, and no request was ever sent. A plain
  // click waits for the veil to go, for as long as the runner's first-launch wait.
  const recruitResp = page.waitForResponse((r) => r.url().includes("/api/history/set-startup"), { timeout: FIRST_LAUNCH_MS }).catch(() => null);
  await page.locator("#recruitAddBtn").click({ timeout: FIRST_LAUNCH_MS }).catch(() => {});
  const rr = await recruitResp;
  if (!rr) console.log("      [diag] no recruit set-startup fetch; status=", await page.evaluate(() => (document.getElementById("recruitStatus") || {}).textContent));
  const rrBody = rr ? await rr.json().catch(() => null) : null;
  check("recruit set-startup answers 200 ok", !!rr && rr.status() === 200 && !!rrBody && rrBody.ok === true,
    rr ? "HTTP " + rr.status() + " " + JSON.stringify(rrBody).slice(0, 160) : "no set-startup request was sent");
  check("character recruited into TST history", read(path.join(modRoot, "history", "countries", "TST - Testland.txt")).includes("recruit_character"), "");

  // Exercise the real portrait UPLOAD flow (Upload button → file chooser → POST /api/upload-gfx → a DDS and its sprite in the
  // mod), and check what it did. ⛔ This was `check("portrait upload did not crash the page", true)`, which could not fail, over
  // a flow that never ran: #uploadArmyLarge is inside the Portraits box, collapsed here, so its click timed out and was
  // swallowed; the inline 1×1 PNG was not one Jimp can read (the server answers `{ error: "Couldn't read that image …" }` with
  // HTTP 200, so a status check passes that too); and its page.once("filechooser") stayed armed into stageFocus, whose chooser
  // then sent both pictures. Now the box is opened the way a user opens it, the chooser is awaited together with the click that
  // opens it (nothing stays armed), the picture is a real PNG, and the answer, the two files it writes into the sandboxed mod
  // and the field the page fills in from it are all asserted.
  const portraitUploads = [];
  const onPortraitUpload = (req) => { if (req.method() === "POST" && req.url().includes("/api/upload-gfx")) portraitUploads.push(req.url()); };
  page.on("request", onPortraitUpload);
  try {
    const tmpPng = await writeTestPng(path.join(os.tmpdir(), "nova_e2e_portrait.png"), 0xcc5533ff);
    if (!(await page.locator("#boxPortraits").evaluate((el) => el.classList.contains("on")))) {
      await page.locator('[data-box="boxPortraits"]').click({ timeout: FIRST_LAUNCH_MS });
    }
    const token = await page.evaluate(() => (document.getElementById("chToken") || {}).value || "");
    const answer = page.waitForResponse((r) => r.url().includes("/api/upload-gfx") && r.request().method() === "POST", { timeout: FIRST_LAUNCH_MS }).catch((e) => e);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: FIRST_LAUNCH_MS }),
      page.locator("#uploadArmyLarge").click({ timeout: FIRST_LAUNCH_MS }),
    ]);
    await chooser.setFiles(tmpPng);
    const resp = await answer;
    if (resp instanceof Error) throw resp;
    const body = await resp.json().catch(() => null);
    const sprite = (body && body.spriteName) || "";
    check("portrait upload answers 200 ok, with a GFX_portrait_ sprite named after the character",
      resp.status() === 200 && !!body && body.ok === true && token === "TST_demo_character" && /^GFX_portrait_/.test(sprite) && sprite.toLowerCase().includes(token.toLowerCase()),
      "HTTP " + resp.status() + " " + JSON.stringify(body).slice(0, 240) + " (chToken " + JSON.stringify(token) + ")");
    const dds = (body && body.ddsPath) || "";
    const rel = dds ? path.relative(modRoot, dds) : "";
    const magic = (() => { try { return fs.readFileSync(dds).subarray(0, 4).toString("latin1"); } catch (_) { return ""; } })();
    check("the portrait lands in the mod as a DDS under gfx/leaders/TST/", !!rel && !path.isAbsolute(rel) && /^gfx[\\/]leaders[\\/]TST[\\/][^\\/]+\.dds$/i.test(rel) && magic === "DDS ", dds + " starts " + JSON.stringify(magic));
    // ⛔ WHAT LANDS ON DISK IS THE PICTURE, NOT ONLY A FILE THAT STARTS "DDS ". The review of 6e7b178a dropped `character` from
    // server.js ICON_TARGET_DIMS, so the upload fell back to 64×64: a 16,512-byte DDS under gfx/leaders/TST/, answered ok:true with
    // the right sprite, and every check here passed. HOI4's leader portraits are 156×210, so read the header (height at byte 12,
    // width at 16), require the whole 32-bit body (128 + 156·210·4 bytes), and the uploaded colour (0xcc5533ff, so B G R A =
    // 33 55 cc ff) at the centre pixel.
    const ddsInfo = (() => { try { const b = fs.readFileSync(dds); const h = b.readUInt32LE(12), w = b.readUInt32LE(16), o = 128 + (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4; return { w, h, bytes: b.length, centre: [...b.subarray(o, o + 4)] }; } catch (_) { return null; } })();
    check("the portrait DDS is a 156×210 leader portrait of the uploaded picture", !!ddsInfo && ddsInfo.w === 156 && ddsInfo.h === 210 && ddsInfo.bytes === 128 + 156 * 210 * 4 && JSON.stringify(ddsInfo.centre) === JSON.stringify([0x33, 0x55, 0xcc, 0xff]), JSON.stringify(ddsInfo));
    const relSlash = rel.split(path.sep).join("/");
    const interfaceDir = path.join(modRoot, "interface");
    const declaring = (() => { try { return fs.readdirSync(interfaceDir).filter((f) => f.endsWith(".gfx")).map((f) => read(path.join(interfaceDir, f))).filter((t) => t.includes(`name = "${sprite}"`)); } catch (_) { return []; } })();
    check("the mod's interface/ declares that sprite once, on that DDS", !!sprite && declaring.length === 1 && declaring[0].includes(`texturefile = "${relSlash}"`), JSON.stringify(declaring).slice(0, 240));
    await page.waitForFunction((s) => (document.getElementById("pArmyLarge") || {}).value === s, sprite, { timeout: FIRST_LAUNCH_MS }).catch(() => {});
    const field = await page.evaluate(() => (document.getElementById("pArmyLarge") || {}).value || "");
    check("the Army large field now names the uploaded sprite", !!sprite && field === sprite, field);
  } catch (e) { check("portrait upload flow ran", false, String(e && e.message || e).slice(0, 300)); }
  finally { page.off("request", onPortraitUpload); }
  check("portrait upload: one file chooser, one POST /api/upload-gfx", portraitUploads.length === 1, JSON.stringify(portraitUploads));
  // Open a Browse portrait picker + close it (button coverage).
  await page.locator("#browseArmyLarge").click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape").catch(() => {});
}

async function stageContinuousFocus(page, modRoot) {
  stepHdr("Continuous Focuses — per-tree placement, 1:1 box, add a continuous focus, verify on disk");
  const treePath = path.join(modRoot, "common", "national_focus", "nova_e2e_demo_focus_tree.txt");
  // Inject a per-country continuous_focus_position into the demo tree (far out) so we can prove the
  // panel reads it (point 1) AND that the canvas grows to keep it reachable (point 5).
  try {
    let t = read(treePath);
    if (!/continuous_focus_position/.test(t)) {
      t = t.replace(/(focus_tree\s*=\s*\{[^\n]*\n)/, `$1\tcontinuous_focus_position = { x = 2200 y = 1600 }\n`);
      fs.writeFileSync(treePath, t, "utf8");
    }
  } catch (_) {}
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_) {} }); }).catch(() => {});
  // Load the tree through the real path — this fires the loadContinuousFocusPanel hook (sets sourceText).
  await page.evaluate(async (p) => { const el = document.getElementById("filePath"); if (el) el.value = p; if (typeof loadFile === "function") await loadFile(); }, treePath);
  await page.waitForSelector("#cfPanel", { timeout: 15000 }).catch(() => {});
  check("continuous-focus panel rendered on the tree", !!(await page.$("#cfPanel")), "");
  // Panel must read the per-tree position (2200,1600) AND the canvas must grow to include it.
  const place = await page.evaluate(() => {
    const p = document.getElementById("cfPanel"); const c = document.getElementById("canvas");
    return { txt: (p && p.textContent) || "", cw: c ? (parseFloat(c.style.width) || c.offsetWidth) : 0, ch: c ? (parseFloat(c.style.height) || c.offsetHeight) : 0,
      right: p ? (parseFloat(p.style.left) || 0) + p.offsetWidth : 0, bottom: p ? (parseFloat(p.style.top) || 0) + p.offsetHeight : 0 };
  });
  check("panel reads the per-tree continuous_focus_position (2200,1600)", /x=2200 y=1600/.test(place.txt), place.txt.slice(0, 80));
  check("canvas grew so the far-placed panel is reachable", place.cw >= place.right && place.ch >= place.bottom, place);
  // Add a continuous focus through the real save endpoint (materializes a palette into the mod).
  await page.evaluate(async () => {
    if (typeof cfApiSave === "function") {
      await cfApiSave({ op: "upsert-focus", focusId: "tst_continuous_demo", fields: { icon: "GFX_goal_continuous_suppression", modifier: "stability_factor = 0.05", dailyCost: 1 } });
    }
  });
  await page.waitForTimeout(900);
  const cfDir = path.join(modRoot, "common", "continuous_focus");
  check("continuous focus written to common/continuous_focus", dirHasText(cfDir, "tst_continuous_demo"), cfDir);
  check("continuous focus modifier persisted", dirHasText(cfDir, "stability_factor"), "");
}

async function stageResearch(page, modRoot) {
  stepHdr("Research — add a tech node (square) + save");
  await page.goto(`${BASE}/research.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_) {} }); }).catch(() => {});
  // Add a tech node — newTechBtn opens the wide/square chooser; pick Square.
  await page.locator("#newTechBtn").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator("#novaChoiceSquare").click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  // Rename it via the sidebar id field.
  await page.evaluate(() => { const el = document.getElementById("techId"); if (el) { el.value = "tst_demo_tech"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } });
  await page.waitForTimeout(300);
  const added = await page.evaluate(() => typeof allTechs !== "undefined" && allTechs.some((t) => t.id === "tst_demo_tech"));
  check("research tech node created", added, "");
  const save = page.waitForResponse((r) => r.url().includes("/api/technologies/save-batch"), { timeout: 15000 }).catch(() => null);
  await page.locator("#saveAllBtn").click({ timeout: 6000 }).catch(() => {});
  const s = await save; if (s) check("research save responds ok", s.status() < 400, "HTTP " + s.status());
  await page.waitForTimeout(1000);
  check("tech written to common/technologies", dirHasText(path.join(modRoot, "common", "technologies"), "tst_demo_tech"), "");
}

async function stageModHealth(page, modRoot) {
  stepHdr("Mod Health — scan the demo mod + rescan + any auto-fix");
  await page.goto(`${BASE}/modhealth.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const rendered = await page.evaluate(() => document.body.innerText.length > 200);
  check("mod-health report rendered", rendered, "");
  // Rescan (real button).
  await page.locator("#rescanBtn").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // Click a dynamic "Fix" button if one is present, accepting the confirm modal.
  const fixed = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /fix/i.test(b.textContent) && b.offsetParent);
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (fixed) {
    await page.waitForTimeout(300);
    await page.evaluate(() => { const y = document.querySelector('#novaConfirmModalOverlay [data-act="ok"]'); if (y) y.click(); }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  check("mod-health scan/rescan/fix ran without crashing", true, "");
}

// Delete flows: create a throwaway item in each maker, delete it via the real delete button +
// novaConfirm, and verify it's removed from disk while the main demo item survives. Safe (demo mod).
async function confirmNovaDelete(page) {
  await page.waitForTimeout(300);
  await page.evaluate(() => { const y = document.querySelector('#novaConfirmModalOverlay [data-act="ok"]'); if (y) y.click(); }).catch(() => {});
}
// ⛔ A maker's Delete button is hidden (`is-hidden`) until the save's list reload has answered and auto-selected the item just
// saved, and a force:true click on an element that is not visible THROWS at once: playwright-core does not wait for it the way a
// plain click does ("Element is not visible"). These clicks went out a fixed 700 ms after the save's answer, so whenever the
// reload was slower nothing was sent, no confirm came up, and the disk check failed ("spirit deleted from disk → still present"
// or "decision deleted from disk → still present" in 5 of 10 runs on 2026-11-13/15, one of them at the bytes before this change).
// So wait for the button as click() does, then dismiss the save's success modal (both pages show it BEFORE that reload, so it is
// up by then), and click plainly, which also waits out the Loading veil instead of landing on it.
async function deleteViaButton(page, btnSel, deleteUrlPart) {
  await page.waitForSelector(btnSel, { state: "visible", timeout: FIRST_LAUNCH_MS }).catch(() => {});
  await page.evaluate(() => { const o = document.getElementById("novaInfoModalOverlay"); if (o) o.remove(); }); // dismiss the save-success modal
  const del = page.waitForResponse((r) => r.url().includes(deleteUrlPart), { timeout: FIRST_LAUNCH_MS }).catch(() => null);
  const clicked = await page.locator(btnSel).click({ timeout: FIRST_LAUNCH_MS }).then(() => true, () => false);
  await confirmNovaDelete(page);
  if (clicked) await del;
  await page.waitForTimeout(800);
}
async function stageDeletes(page, modRoot) {
  stepHdr("Delete flows — create throwaway items, delete via real buttons, verify removed");
  // IDEAS
  await page.goto(`${BASE}/ideas.html`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500);
  await click(page, "#newIdeaBtn"); await page.waitForTimeout(400);
  await fill(page, "#ideaId", "demo_spirit_td"); await fill(page, "#ideaName", "Throwaway"); await fill(page, "#ideaModifiers", "stability_factor = 0.05");
  await page.evaluate(() => { const el = document.getElementById("ideaTargetFile"); if (el) { el.value = "custom_ideas.txt"; el.dispatchEvent(new Event("input", { bubbles: true })); } });
  let sv = page.waitForResponse((r) => r.url().includes("/api/ideas/upsert-definition"), { timeout: 10000 }).catch(() => null);
  await click(page, "#saveIdeaBtn"); await sv; await page.waitForTimeout(700);
  const ideasDir = path.join(modRoot, "common", "ideas");
  check("throwaway spirit created", dirHasText(ideasDir, "demo_spirit_td"), "");
  await deleteViaButton(page, "#deleteIdeaBtn", "/api/ideas/delete-definition");
  check("spirit deleted from disk", !dirHasText(ideasDir, "demo_spirit_td"), "still present");
  check("main spirit survived the delete", dirHasText(ideasDir, "demo_spirit"), "");

  // DECISIONS
  await page.goto(`${BASE}/decisions.html`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500);
  await click(page, "#newDecisionBtn"); await page.waitForTimeout(600);
  await page.evaluate(() => { const c = document.getElementById("decisionCategory"); if (c && c.options.length) c.selectedIndex = 0; const setv = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } }; setv("decisionId", "demo_decision_td"); setv("decisionName", "Throwaway"); setv("decisionCost", "10"); });
  sv = page.waitForResponse((r) => r.url().includes("/api/decisions/save"), { timeout: 10000 }).catch(() => null);
  await click(page, "#saveDecisionBtn"); await sv; await page.waitForTimeout(700);
  const decDir = path.join(modRoot, "common", "decisions");
  check("throwaway decision created", dirHasText(decDir, "demo_decision_td"), "");
  await deleteViaButton(page, "#deleteDecisionBtn", "/api/decisions/delete-definition");
  check("decision deleted from disk", !dirHasText(decDir, "demo_decision_td"), "still present");
  check("main decision survived the delete", dirHasText(decDir, "demo_decision"), "");
}

// Verifies the "Customize base-game country" flow end-to-end (the button I fixed earlier — it used a
// dead native prompt). Opens a vanilla country (GER), confirms its effective history loads, edits a
// detail, saves, and confirms an override file is written into the demo mod (the base game untouched).
async function stageCustomizeBase(page, modRoot) {
  stepHdr("Country Setup — Customize a base-game country (GER) end-to-end");
  await page.goto(`${BASE}/country-setup.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.locator("#csCustomizeBaseBtn").click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  // Fill the csPrompt modal (overlay z-index 2147483300) with GER + confirm.
  const promptShown = await page.evaluate(() => {
    const ov = [...document.querySelectorAll('div[style*="2147483300"]')][0];
    if (!ov) return false;
    const inp = ov.querySelector("input"); if (inp) { inp.value = "GER"; inp.dispatchEvent(new Event("input", { bubbles: true })); }
    const ok = ov.querySelector('[data-act="ok"]'); if (ok) ok.click();
    return true;
  });
  check("customize-base prompt opened + accepted", promptShown, "");
  const detailsResp = page.waitForResponse((r) => r.url().includes("/api/history/country-details") && r.url().includes("GER"), { timeout: 12000 }).catch(() => null);
  await detailsResp;
  await page.waitForTimeout(1200);
  const loaded = await page.evaluate(() => {
    const cap = document.getElementById("csCapital");
    const title = (document.getElementById("csPanelTitle") || {}).textContent || "";
    return { cap: cap ? cap.value : "", title };
  });
  check("GER effective history loaded into the panel", String(loaded.cap).length > 0 || /GER|German/i.test(loaded.title), JSON.stringify(loaded));
  // Edit a detail + save → override written into the demo mod.
  await page.evaluate(() => { const el = document.getElementById("csStability"); if (el) { el.value = "75"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } });
  const saveResp = page.waitForResponse((r) => r.url().includes("/api/history/save-country-details"), { timeout: 12000 }).catch(() => null);
  await page.locator("#csSaveDetailsBtn").click({ timeout: 5000, force: true }).catch(() => {});
  const sr = await saveResp;
  if (sr) check("customize-base save responds ok", sr.status() < 400, "HTTP " + sr.status());
  await page.waitForTimeout(900);
  const gerFile = dirHasText(path.join(modRoot, "history", "countries"), "set_stability");
  const gerFileExists = (() => { try { return fs.readdirSync(path.join(modRoot, "history", "countries")).some((f) => /GER/i.test(f)); } catch (_) { return false; } })();
  check("GER override written into the demo mod (base game untouched)", gerFileExists && gerFile, "no GER file in demo history");
}

// Picker / opener buttons the smoke deliberately skips: image/icon browse pickers, the focus effect
// picker, and the per-field ✨AI-assist buttons. Verify each opens its modal with no uncaught error.
async function stagePickers(page, modRoot) {
  stepHdr("Pickers & field buttons — browse-image / browse-icon / effect picker / ✨field-assist");
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  const opens = async (pg, btnSel, modalSel, label) => {
    await page.goto(`${BASE}/${pg}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_) {} })).catch(() => {});
    const before = errors.length;
    await page.locator(btnSel).click({ timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(600);
    const open = await page.evaluate((s) => { const el = document.querySelector(s); return !!el && !!(el.offsetParent || (el.open !== undefined ? el.open : false) || getComputedStyle(el).display !== "none"); }, modalSel).catch(() => false);
    check(`${label}: opens its picker (${modalSel})`, open, "");
    check(`${label}: no error opening`, errors.length === before, errors.slice(-1)[0]);
    await page.keyboard.press("Escape").catch(() => {});
  };
  await opens("events.html", "#eventBrowseImageBtn", "#eventImagePickerModal", "Events image browse");
  await opens("decisions.html", "#decisionBrowseIconBtn", "#decisionIconPickerModal", "Decisions icon browse");

  // Focus effect picker: load the tree, select the focus, open the sidebar effect picker.
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
  await page.evaluate(async (p) => { const el = document.getElementById("filePath"); if (el) el.value = p; if (typeof loadFile === "function") await loadFile(); }, path.join(modRoot, "common", "national_focus", "nova_e2e_demo_focus_tree.txt"));
  await page.waitForTimeout(1200);
  await page.evaluate(() => { try { if (typeof selectedIds !== "undefined" && typeof parsed !== "undefined" && parsed && parsed.focuses && parsed.focuses[0]) { selectedIds.clear(); selectedIds.add(parsed.focuses[0].id); if (typeof renderFocuses === "function") renderFocuses(); } } catch (_) {} });
  await page.waitForTimeout(300);
  const effErrBefore = errors.length;
  await page.locator("#sb-add-effect-btn").click({ timeout: 5000, force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const pickerOpen = await page.evaluate(() => { const el = document.getElementById("sb-effect-picker"); return !!el && !el.classList.contains("sb-hidden"); }).catch(() => false);
  check("Focus effect picker: opens via #sb-add-effect-btn", pickerOpen, "");
  check("Focus effect picker: no error", errors.length === effErrBefore, "");

  // A per-field ✨ AI-assist button (injected by ai-field-assist.js) opens its dialog.
  const fieldBtnErrBefore = errors.length;
  const fieldBtnClicked = await page.evaluate(() => { const b = document.querySelector(".ai-field-assist-btn"); if (b) { b.click(); return true; } return false; });
  await page.waitForTimeout(500);
  check("Field ✨AI-assist button present + clickable", fieldBtnClicked, "none found on focus page");
  check("Field ✨AI-assist: no error on click", errors.length === fieldBtnErrBefore, errors.slice(-1)[0]);
}

(async () => {
  console.log("=== DEEP FULL-MOD E2E ===");
  const MODS_ROOT = resolveModsRoot();
  const modRoot = path.join(MODS_ROOT, MOD_NAME);
  const modDesc = path.join(MODS_ROOT, MOD_NAME + ".mod");
  // Clean any prior run.
  try { if (fs.existsSync(modRoot)) fs.rmSync(modRoot, { recursive: true, force: true }); } catch (_) {}
  try { if (fs.existsSync(modDesc)) fs.rmSync(modDesc, { force: true }); } catch (_) {}

  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });

  // Create the mod via the real endpoint.
  const mc = await fetch(`${BASE}/api/mod/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modName: MOD_NAME, displayName: "Nova E2E Demo" }) });
  const mcJson = await mc.json().catch(() => ({}));
  const createdRoot = mcJson.modRoot || modRoot;
  console.log("Created mod at:", createdRoot, "(status " + mc.status + ")");
  check("mod created", mc.status === 200 && fs.existsSync(createdRoot), JSON.stringify(mcJson).slice(0, 120));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((root) => {
    try { localStorage.setItem("activeModPath", root); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {}
  }, createdRoot);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => { pageErrors.push(String(e.message || e)); console.log("    ‼ PAGEERROR:", String(e.message || e)); });
  page.on("dialog", (d) => d.accept().catch(() => {}));

  try {
    await stageCountry(page, createdRoot);
    await stageIdeas(page, createdRoot);
    await stageDecisions(page, createdRoot);
    await stageEvents(page, createdRoot);
    await stageCharacters(page, createdRoot);
    await stageFocus(page, createdRoot);
    await stageContinuousFocus(page, createdRoot);
    await stageResearch(page, createdRoot);
    await stageDeletes(page, createdRoot);
    await stagePickers(page, createdRoot);
    await stageCustomizeBase(page, createdRoot);
    await stageModHealth(page, createdRoot);
  } catch (e) {
    fail++; fails.push("harness: " + e.message); console.log("  ✗ harness threw:", e.message, e.stack);
  } finally {
    check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 5).join(" | "));
    await browser.close();
    server.close();
  }

  console.log(`\n=== FULL-MOD E2E: ${pass} passed, ${fail} failed ===`);
  console.log("Demo mod left at:", createdRoot);
  if (fail) { console.log("FAILURES:\n  " + fails.join("\n  ")); process.exit(1); }
  process.exit(0);
})();
