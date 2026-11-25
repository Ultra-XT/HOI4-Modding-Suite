// Opening a decision and pressing Save must not change what it does.
//
// Four defects, all found by reading real vanilla and Millennium Dawn decision files and round-tripping
// them through the maker the way the page does:
//
//   1. #pdx-amount-or-variable — cost / days_remove / days_re_enable / days_mission_timeout are routinely
//      script variables, not numbers (vanilla: 343 decisions with a variable cost, 333 days_remove,
//      77 days_re_enable, 56 days_mission_timeout). The reader matched digits only, so it returned "";
//      the form then showed "0" and the writer emitted `cost = 0` and dropped the duration keys outright.
//      Opening a vanilla faction-interaction decision and saving made it free and instant.
//   2. #days-remove-permanent — `days_remove = -1` means "never removed by the timer" (19 vanilla
//      decisions). A [0-9]+ reader could not see the minus sign, and `if (days > 0)` refused to write it
//      back, so a permanent-modifier decision silently became an instant one. The label also claimed
//      "0 for permanent", which is the opposite of what 0 does.
//   3. #mission-detection — a decision was only treated as a mission when its timeout was a plain
//      integer (167 vanilla and 49 MD timeouts are variables). A mis-read mission was rewritten as the
//      wrong KIND: days_mission_timeout became days_remove, timeout_effect became remove_effect, and
//      activation / is_good — both always-managed — were deleted.
//   4. #decision-home-file — the save and delete paths derived the file from the category id
//      (common/decisions/<categoryId>.txt). 100% of vanilla's 3859 decisions and 99% of MD's 4645 live in
//      a file named something else, and one category is often split across many files (`political_actions`
//      spans 39 vanilla files). Editing a real decision therefore wrote a stripped-down COPY into a new
//      file — duplicate id in-game — and deleting one either removed that stray copy while reporting
//      success or failed with "Decision file not found".
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const FIX = path.join(os.tmpdir(), "nova-decision-values-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp, pdxAmountValue } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(FIX, { recursive: true, force: true });
const decDir = path.join(FIX, "common", "decisions");
fs.mkdirSync(decDir, { recursive: true });
fs.writeFileSync(path.join(FIX, "descriptor.mod"), 'name="DecisionValues"\nsupported_version="1.19.*"\n');

// Deliberately named nothing like its category, the way real content is.
const FILE = "ZZZ_country_decisions.txt";
const CAT = "zz_probe_category";
const SRC = [
  CAT + " = {",
  "\tvar_priced = {",
  "\t\ticon = GFX_decision_generic",
  "\t\tcost = ZZ_interaction_cost_standard",
  "\t\tdays_remove = ZZ_days_remove_very_low",
  "\t\tdays_re_enable = ZZ_reenable_low",
  "\t\tpriority = 0",
  "\t\tfire_only_once = no",
  "\t\tavailable = { always = yes }",
  "\t\tcomplete_effect = { add_political_power = 5 }",
  "\t}",
  "\tpermanent_dec = {",
  "\t\ticon = GFX_decision_generic",
  "\t\tcost = 25",
  "\t\tdays_remove = -1",
  "\t\tfire_only_once = yes",
  "\t\tavailable = { always = yes }",
  "\t\tmodifier = { political_power_gain = 0.5 }",
  "\t\tcomplete_effect = { add_political_power = 1 }",
  "\t}",
  "\tvar_mission = {",
  "\t\ticon = GFX_decision_generic",
  "\t\tdays_mission_timeout = ROOT.zz_build_time",
  "\t\tselectable_mission = yes",
  "\t\tactivation = { has_war = yes }",
  "\t\tis_good = yes",
  "\t\ttimeout_effect = { add_political_power = -10 }",
  "\t\tavailable = { has_political_power > 5 }",
  "\t}",
  "\tdotted_var_dec = {",
  "\t\ticon = GFX_decision_generic",
  "\t\tcost = 10",
  "\t\tdays_remove = zz_construction_duration^0",
  "\t\tavailable = { always = yes }",
  "\t\tcomplete_effect = { add_political_power = 1 }",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(decDir, FILE), SRC, "utf8");

const read = () => fs.readFileSync(path.join(decDir, FILE), "utf8");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blockOf = (id, text) => {
  const t = text === undefined ? read() : text;
  const m = new RegExp("(?:^|\\n)\\s*" + esc(id) + "\\s*=\\s*\\{").exec(t);
  if (!m) return null;
  let o = t.indexOf("{", m.index), d = 0, e = -1;
  for (let i = o; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { e = i; break; } } }
  return e === -1 ? null : t.slice(o + 1, e);
};
const has = (id, re) => { const b = blockOf(id); return b !== null && re.test(b); };
const filesNow = () => fs.readdirSync(decDir).filter((f) => /\.txt$/i.test(f)).sort();

// ── the helper itself, unit-tested (a variable must survive, an exact 0 must not, -1 must) ────────────
ok("a plain integer passes through", pdxAmountValue("30") === "30");
ok("an exact 0 means 'no key'", pdxAmountValue("0") === "");
ok("0 is kept when zero is a real value", pdxAmountValue("0", { zeroIsEmpty: false }) === "0");
ok("-1 survives (never expires)", pdxAmountValue("-1") === "-1");
ok("a plain variable survives", pdxAmountValue("MY_COST_VAR") === "MY_COST_VAR");
ok("a var: reference survives", pdxAmountValue("var:CHI_mission_time") === "var:CHI_mission_time");
ok("a scoped variable survives", pdxAmountValue("ROOT.battery_park_time") === "ROOT.battery_park_time");
ok("an ^index suffix survives", pdxAmountValue("duration^0") === "duration^0");
ok("a decimal survives", pdxAmountValue("1.5") === "1.5");
ok("whitespace-injected junk is refused", pdxAmountValue("5 } add_political_power = 999") === "");
ok("a brace is refused", pdxAmountValue("{ 5 }") === "");
ok("a quote is refused", pdxAmountValue('"5"') === "");
ok("a comment marker is refused", pdxAmountValue("5 # sneaky") === "");
ok("empty is empty", pdxAmountValue("") === "" && pdxAmountValue(null) === "" && pdxAmountValue(undefined) === "");

const PORT = 39586, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 200));

  // Rebuild the save payload from the listed decision exactly the way public/decisions.js does, so this
  // exercises the real round-trip rather than a hand-written ideal one.
  const listDecision = async (id) => {
    const l = await get("/api/decisions/list?modPath=" + encodeURIComponent(FIX));
    for (const c of (l.categories || [])) {
      const d = (c.decisions || []).find((x) => x.id === id);
      if (d) return { cat: c, dec: d };
    }
    return null;
  };
  const roundTrip = async (id, over) => {
    const found = await listDecision(id);
    if (!found) return { s: 0, b: { error: "not listed" } };
    const { cat, dec } = found;
    const isMission = dec.decisionType === "mission";
    return post("/api/decisions/save", Object.assign({
      modPath: FIX, categoryId: cat.id, id: dec.id, fileName: cat.fileName,
      name: dec.name || id, cost: dec.cost !== "" && dec.cost != null ? dec.cost : "0",
      icon: dec.icon || "GFX_decision_generic", days: dec.days || "0",
      cooldown: dec.cooldown || "0", fireOnce: dec.fireOnce, decisionType: dec.decisionType,
      scope: dec.scope, available: dec.available || "", modifier: dec.modifier || "",
      effect: dec.effect || "", removeEffect: dec.removeEffect || "",
      targetTrigger: dec.targetTrigger || "", visible: dec.visible || "", allowed: dec.allowed || "",
      aiWillDo: dec.aiWillDo || "", priority: dec.priority || "",
      activation: isMission ? (dec.activation || "") : "",
      cancelTrigger: isMission ? (dec.cancelTrigger || "") : "",
      isGood: isMission ? dec.isGood : "no",
    }, over || {}));
  };

  try {
    // ── the reader must see the authored tokens, not "" ────────────────────────────────────────────
    const l0 = await get("/api/decisions/list?modPath=" + encodeURIComponent(FIX));
    const cat0 = (l0.categories || []).find((c) => c.id === CAT);
    ok("the category is listed", !!cat0, (l0.categories || []).map((c) => c.id));
    const by = (id) => (cat0.decisions || []).find((d) => d.id === id) || {};
    ok("a variable cost is read as the variable", by("var_priced").cost === "ZZ_interaction_cost_standard", by("var_priced").cost);
    ok("a variable duration is read as the variable", by("var_priced").days === "ZZ_days_remove_very_low", by("var_priced").days);
    ok("a variable cooldown is read as the variable", by("var_priced").cooldown === "ZZ_reenable_low", by("var_priced").cooldown);
    ok("days_remove = -1 is read as -1", by("permanent_dec").days === "-1", by("permanent_dec").days);
    ok("a ^index duration is read whole", by("dotted_var_dec").days === "zz_construction_duration^0", by("dotted_var_dec").days);
    ok("a variable-timeout mission is read as a MISSION", by("var_mission").decisionType === "mission", by("var_mission").decisionType);
    ok("its timeout is the variable", by("var_mission").days === "ROOT.zz_build_time", by("var_mission").days);
    ok("a plain decision is still read as normal", by("var_priced").decisionType === "normal", by("var_priced").decisionType);

    // ── an unchanged round-trip must not change any of them ────────────────────────────────────────
    const before = read();
    const r1 = await roundTrip("var_priced");
    ok("save → 200", r1.s === 200, r1.b);
    ok("the variable cost survived", has("var_priced", /cost\s*=\s*ZZ_interaction_cost_standard/), blockOf("var_priced"));
    ok("no literal 0 cost was written", !has("var_priced", /cost\s*=\s*0\b/), blockOf("var_priced"));
    ok("the variable duration survived", has("var_priced", /days_remove\s*=\s*ZZ_days_remove_very_low/));
    ok("the variable cooldown survived", has("var_priced", /days_re_enable\s*=\s*ZZ_reenable_low/));
    ok("priority = 0 survived (0 is a real priority)", has("var_priced", /priority\s*=\s*0\b/), blockOf("var_priced"));

    await breathe();
    const r2 = await roundTrip("permanent_dec");
    ok("save → 200", r2.s === 200, r2.b);
    ok("days_remove = -1 survived", has("permanent_dec", /days_remove\s*=\s*-1\b/), blockOf("permanent_dec"));
    ok("its modifier survived", has("permanent_dec", /political_power_gain\s*=\s*0\.5/));

    await breathe();
    const r3 = await roundTrip("dotted_var_dec");
    ok("save → 200", r3.s === 200, r3.b);
    ok("the ^index duration survived", has("dotted_var_dec", /days_remove\s*=\s*zz_construction_duration\^0/), blockOf("dotted_var_dec"));

    // ── the mission must stay a mission ────────────────────────────────────────────────────────────
    await breathe();
    const r4 = await roundTrip("var_mission");
    ok("save → 200", r4.s === 200, r4.b);
    ok("it is still a mission (days_mission_timeout, not days_remove)",
      has("var_mission", /days_mission_timeout\s*=\s*ROOT\.zz_build_time/) && !has("var_mission", /days_remove\s*=/), blockOf("var_mission"));
    ok("its activation survived", has("var_mission", /activation\s*=\s*\{[\s\S]*has_war\s*=\s*yes/), blockOf("var_mission"));
    ok("is_good = yes survived", has("var_mission", /is_good\s*=\s*yes/));
    ok("timeout_effect stayed timeout_effect", has("var_mission", /timeout_effect\s*=\s*\{/) && !has("var_mission", /remove_effect\s*=\s*\{/), blockOf("var_mission"));
    ok("selectable_mission was preserved", has("var_mission", /selectable_mission\s*=\s*yes/), blockOf("var_mission"));

    // ── nothing leaked into a second file, and the file stays valid ────────────────────────────────
    ok("no stray <categoryId>.txt was created", filesNow().join(",") === FILE, filesNow());
    const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
    ok("the file is still brace-balanced", balanced(read()));
    ok("all four decisions still exist", ["var_priced", "permanent_dec", "var_mission", "dotted_var_dec"].every((id) => blockOf(id) !== null));
    ok("the file did change (the write path really ran)", read() !== before);

    // ── an edit still lands, and repeat saves don't drift ──────────────────────────────────────────
    await breathe();
    const r5 = await roundTrip("var_priced", { cost: "77" });
    ok("an explicit numeric edit lands", r5.s === 200 && has("var_priced", /cost\s*=\s*77\b/), blockOf("var_priced"));
    await breathe();
    const snap = read();
    await roundTrip("var_priced");
    ok("a second identical save leaves the file byte-identical", read() === snap, { len: read().length, was: snap.length });

    // ── delete finds the decision in its real file, and refuses when it truly isn't there ──────────
    await breathe();
    const d1 = await post("/api/decisions/delete-definition", { modPath: FIX, categoryId: CAT, decisionId: "dotted_var_dec", fileName: FILE });
    ok("delete → 200", d1.s === 200, d1.b);
    ok("it was removed from the REAL file", blockOf("dotted_var_dec") === null);
    ok("its siblings are untouched", ["var_priced", "permanent_dec", "var_mission"].every((id) => blockOf(id) !== null));
    ok("the file is still brace-balanced after the delete", balanced(read()));
    const d2 = await post("/api/decisions/delete-definition", { modPath: FIX, categoryId: CAT, decisionId: "dotted_var_dec", fileName: FILE });
    ok("deleting it again reports a real error, not success", d2.s === 400 && /Could not find/.test(d2.b.error || ""), d2.b);
    // a delete with NO fileName hint must still find it — old clients, and the sidebar's Drafts folder
    const d3 = await post("/api/decisions/delete-definition", { modPath: FIX, categoryId: CAT, decisionId: "permanent_dec" });
    ok("delete works with no fileName hint at all", d3.s === 200 && blockOf("permanent_dec") === null, d3.b);

    console.log("\ntest-decision-values-and-missions: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 40 ? 0 : 1;
    try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
