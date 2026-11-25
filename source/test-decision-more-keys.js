// #decision-more-keys — keys real content leans on that the maker could not author at all.
//
// They survived an edit (the preserve path kept them), but a user could neither create nor change one.
// Occurrences measured over common/decisions in vanilla / Millennium Dawn:
//     cancel_trigger      603 / 139   ← and 481 of vanilla's are ORDINARY decisions, not missions, yet the
//                                       field was only ever shown in mission mode
//     cancel_effect       382 /  70
//     target_root_trigger 278 /  29   the documented way to keep a targeted decision cheap
//     target_array        186 /  43
//     fixed_random_seed   102 / 254
//     ai_hint_pp_cost      72 /   0   so the AI budgets PP when the cost is custom
//     targets_dynamic      50 /   1
//     target_non_existing  11 /   4
//
// Each follows the house rules established earlier in this campaign: managed only when the caller actually
// sent the field (#omitted-is-not-cleared), emitted through emitBlock so an unchanged block returns verbatim,
// and numbers through pdxAmountValue so a script variable survives.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const MOD = path.join(os.tmpdir(), "nova-decision-morekeys-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(MOD, { recursive: true, force: true });
const dd = path.join(MOD, "common", "decisions");
fs.mkdirSync(dd, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MoreKeys"\nsupported_version="1.19.*"\n');

const FILE = "ZZ_more.txt";
const SRC = [
  "more_cat = {",
  // an ORDINARY decision that already carries every one of these keys
  "\trich_dec = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 10",
  "\t\tdays_remove = 30",
  "\t\ttarget_array = global.my_targets",
  "\t\tai_hint_pp_cost = 150",
  "\t\tfixed_random_seed = no",
  "\t\ttarget_non_existing = yes",
  "\t\ttargets_dynamic = yes",
  "\t\ttarget_root_trigger = { has_war = yes }",
  "\t\tcancel_trigger = { has_war = no }",
  "\t\tcancel_effect = { add_political_power = -10 }",
  "\t\tavailable = { always = yes }",
  "\t\tcomplete_effect = { add_political_power = 5 }",
  "\t}",
  // a bare ordinary decision, for the "can I ADD one" direction
  "\tbare_dec = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tcost = 5",
  "\t\tavailable = { always = yes }",
  "\t}",
  // a MISSION that carries cancel_trigger — it must stay in the mission block, not double up
  "\tmish = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tdays_mission_timeout = 30",
  "\t\tselectable_mission = yes",
  "\t\tactivation = { has_war = yes }",
  "\t\tcancel_trigger = { has_war = no }",
  "\t\ttimeout_effect = { add_political_power = -5 }",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(dd, FILE), SRC, "utf8");

const read = () => fs.readFileSync(path.join(dd, FILE), "utf8");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blockOf = (id) => {
  const t = read();
  const m = new RegExp("(?:^|\\n)\\s*" + esc(id) + "\\s*=\\s*\\{").exec(t);
  if (!m) return null;
  let o = t.indexOf("{", m.index), d = 0, e = -1;
  for (let i = o; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { e = i; break; } } }
  return e === -1 ? null : t.slice(o + 1, e);
};
const countIn = (id, key) => ((blockOf(id) || "").match(new RegExp("(?:^|\\n)\\s*" + key + "\\s*=", "g")) || []).length;
const balanced = (t) => { let d = 0; for (const ch of String(t).replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };

const PORT = 39592, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 200));
  const listOne = async (id) => {
    const l = await get("/api/decisions/list?modPath=" + encodeURIComponent(MOD));
    for (const c of (l.categories || [])) { const d = (c.decisions || []).find((x) => x.id === id); if (d) return { c, d }; }
    return null;
  };
  // the payload the page sends, rebuilt from what the list reports
  const roundTrip = async (id, over) => {
    const f = await listOne(id);
    if (!f) return { s: 0, b: { error: "not listed" } };
    const { c, d } = f;
    const isMission = d.decisionType === "mission";
    return post("/api/decisions/save", Object.assign({
      modPath: MOD, categoryId: c.id, id: d.id, fileName: c.fileName,
      previousId: d.id, previousCategoryId: c.id,
      name: d.name || d.id, cost: d.cost !== "" && d.cost != null ? d.cost : "0",
      icon: d.icon || "", days: d.days || "0", cooldown: d.cooldown || "0",
      fireOnce: d.fireOnce, decisionType: d.decisionType, scope: d.scope,
      available: d.available || "", modifier: d.modifier || "", effect: d.effect || "",
      removeEffect: d.removeEffect || "", targetTrigger: d.targetTrigger || "",
      visible: d.visible || "", allowed: d.allowed || "", aiWillDo: d.aiWillDo || "",
      priority: d.priority || "", cancelIfNotVisible: d.cancelIfNotVisible === "yes" ? "yes" : "",
      customCostText: d.customCostText || "", customCostTrigger: d.customCostTrigger || "",
      targetedModifier: d.targetedModifier || "", removeTrigger: d.removeTrigger || "",
      onMapMode: d.onMapMode || "", highlightStates: d.highlightStates || "",
      activation: isMission ? (d.activation || "") : "", isGood: isMission ? d.isGood : "no",
      selectableMission: isMission ? d.selectableMission : "",
      cancelTrigger: d.cancelTrigger || "",
      cancelEffect: d.cancelEffect || "",
      targetRootTrigger: d.targetRootTrigger || "",
      targetArray: d.targetArray || "",
      aiHintPpCost: d.aiHintPpCost || "",
      fixedRandomSeed: d.fixedRandomSeed || "",
      targetNonExisting: d.targetNonExisting || "",
      targetsDynamic: d.targetsDynamic || "",
    }, over || {}));
  };

  try {
    // ── the reader must SEE all of them ────────────────────────────────────────────────────────────
    const r0 = await listOne("rich_dec");
    ok("rich_dec is listed", !!r0);
    const d0 = r0.d;
    ok("cancel_trigger is read", /has_war\s*=\s*no/.test(d0.cancelTrigger || ""), d0.cancelTrigger);
    ok("cancel_effect is read", /add_political_power\s*=\s*-10/.test(d0.cancelEffect || ""), d0.cancelEffect);
    ok("target_root_trigger is read", /has_war\s*=\s*yes/.test(d0.targetRootTrigger || ""), d0.targetRootTrigger);
    ok("target_array is read", d0.targetArray === "global.my_targets", d0.targetArray);
    ok("ai_hint_pp_cost is read", d0.aiHintPpCost === "150", d0.aiHintPpCost);
    ok("fixed_random_seed = no is read", d0.fixedRandomSeed === "no", d0.fixedRandomSeed);
    ok("target_non_existing is read", d0.targetNonExisting === "yes", d0.targetNonExisting);
    ok("targets_dynamic is read", d0.targetsDynamic === "yes", d0.targetsDynamic);
    ok("an ordinary decision's cancel_trigger is NOT mistaken for a mission", d0.decisionType === "normal", d0.decisionType);

    // ── an unchanged round-trip must keep every one of them, exactly once ──────────────────────────
    const before = read();
    const r1 = await roundTrip("rich_dec");
    ok("save → 200", r1.s === 200, r1.b);
    for (const k of ["cancel_trigger", "cancel_effect", "target_root_trigger", "target_array",
                     "ai_hint_pp_cost", "fixed_random_seed", "target_non_existing", "targets_dynamic"]) {
      ok(k + " survives and is declared exactly once", countIn("rich_dec", k) === 1, { key: k, count: countIn("rich_dec", k), block: blockOf("rich_dec") });
    }
    ok("its values are unchanged",
      /target_array\s*=\s*global\.my_targets/.test(blockOf("rich_dec")) &&
      /ai_hint_pp_cost\s*=\s*150/.test(blockOf("rich_dec")) &&
      /fixed_random_seed\s*=\s*no/.test(blockOf("rich_dec")), blockOf("rich_dec"));
    ok("the file is still valid", balanced(read()));
    ok("the write path really ran", read() !== before);

    // ── they can now be ADDED to a decision that had none ──────────────────────────────────────────
    await breathe();
    const r2 = await roundTrip("bare_dec", {
      cancelTrigger: "has_war = no", cancelEffect: "add_political_power = -1",
      targetRootTrigger: "is_major = yes", targetArray: "global.other_targets",
      aiHintPpCost: "75", fixedRandomSeed: "no", targetNonExisting: "yes", targetsDynamic: "yes",
    });
    ok("adding them → 200", r2.s === 200, r2.b);
    const b2 = blockOf("bare_dec");
    ok("cancel_trigger was added to an ORDINARY decision", /cancel_trigger\s*=\s*\{[\s\S]*has_war\s*=\s*no/.test(b2), b2);
    ok("cancel_effect was added", /cancel_effect\s*=\s*\{[\s\S]*add_political_power\s*=\s*-1/.test(b2), b2);
    ok("target_root_trigger was added", /target_root_trigger\s*=\s*\{[\s\S]*is_major\s*=\s*yes/.test(b2), b2);
    ok("target_array was added", /target_array\s*=\s*global\.other_targets/.test(b2), b2);
    ok("ai_hint_pp_cost was added", /ai_hint_pp_cost\s*=\s*75/.test(b2), b2);
    ok("fixed_random_seed = no was added", /fixed_random_seed\s*=\s*no/.test(b2), b2);
    ok("target_non_existing was added", /target_non_existing\s*=\s*yes/.test(b2), b2);
    ok("targets_dynamic was added", /targets_dynamic\s*=\s*yes/.test(b2), b2);
    ok("adding them did not turn it into a mission", !/days_mission_timeout/.test(b2), b2);
    ok("the file is still valid", balanced(read()));

    // ── clearing a field removes the key ──────────────────────────────────────────────────────────
    await breathe();
    const r3 = await roundTrip("bare_dec", { cancelEffect: "", targetArray: "", targetsDynamic: "" });
    ok("clearing → 200", r3.s === 200, r3.b);
    const b3 = blockOf("bare_dec");
    ok("a cleared cancel_effect is removed", !/cancel_effect/.test(b3), b3);
    ok("a cleared target_array is removed", !/target_array/.test(b3), b3);
    ok("a cleared targets_dynamic is removed", !/targets_dynamic/.test(b3), b3);
    ok("…while the untouched ones stayed", /cancel_trigger/.test(b3) && /ai_hint_pp_cost\s*=\s*75/.test(b3), b3);

    // ── a caller that OMITS the fields must not strip them (#omitted-is-not-cleared) ───────────────
    await breathe();
    const beforeOmit = blockOf("rich_dec");
    const r4 = await post("/api/decisions/save", {
      modPath: MOD, categoryId: "more_cat", id: "rich_dec", fileName: FILE,
      previousId: "rich_dec", previousCategoryId: "more_cat",
      name: "Rich Dec", cost: "10", icon: "GFX_decision_generic_decision", days: "30",
      fireOnce: "no", decisionType: "decision", scope: "national",
      available: "always = yes", modifier: "", effect: "add_political_power = 5",
      // …and nothing else. An old client that has never heard of these keys must not delete them.
    });
    ok("an old-shaped payload → 200", r4.s === 200, r4.b);
    const afterOmit = blockOf("rich_dec");
    for (const k of ["cancel_trigger", "cancel_effect", "target_root_trigger", "target_array",
                     "ai_hint_pp_cost", "fixed_random_seed", "target_non_existing", "targets_dynamic"]) {
      ok(k + " survived a payload that never mentioned it", countIn("rich_dec", k) === 1, { key: k, count: countIn("rich_dec", k) });
    }
    // Compare the SET of statements, not their order: a key the payload never mentioned is un-managed, so it
    // rides the preserve tail and lands at the end of the block. Order is cosmetic — losing a value is not.
    const statementSet = (body) => (String(body || "").match(/(?:^|\n)\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:\{[\s\S]*?\n\s*\}|[^\n{]*)/g) || [])
      .map((x) => x.replace(/\s+/g, " ").trim()).sort().join(" | ");
    ok("no statement changed value — only their order",
      statementSet(afterOmit) === statementSet(beforeOmit),
      { before: statementSet(beforeOmit).slice(0, 260), after: statementSet(afterOmit).slice(0, 260) });

    // ── a MISSION keeps its cancel_trigger in the mission block, exactly once ──────────────────────
    await breathe();
    const r5 = await roundTrip("mish");
    ok("mission save → 200", r5.s === 200, r5.b);
    ok("the mission's cancel_trigger is declared exactly once", countIn("mish", "cancel_trigger") === 1, blockOf("mish"));
    ok("it is still a mission", /days_mission_timeout\s*=\s*30/.test(blockOf("mish")));
    ok("selectable_mission survived", /selectable_mission\s*=\s*yes/.test(blockOf("mish")));
    ok("the file is still valid", balanced(read()));

    // ── junk can't be spliced through the scalar fields ────────────────────────────────────────────
    await breathe();
    const r6 = await roundTrip("bare_dec", { targetArray: "x } add_political_power = 999 y = {", aiHintPpCost: "5 } nope" });
    // This used to assert a 200: the junk was DROPPED silently and the save reported success. That is now a
    // 400 that names the bad value, because dropping it was destructive on an edit — target_array and
    // ai_hint_pp_cost are both managed keys, so a rejected value also deleted the authored one already on
    // disk, and the response still said ok. The sibling `priority` in the same handler already refused this
    // way. What has NOT changed, and is the part that always mattered, is that the junk never reaches the
    // file and the file stays valid. #decision-adv-fields-silently-dropped
    ok("a junk scalar is refused with an error rather than silently dropped",
      r6.s === 400 && !!(r6.b && r6.b.error), { s: r6.s, b: r6.b });
    ok("…and names the bad value", r6.s === 400 && /add_political_power = 999|isn't a variable name/.test(String((r6.b || {}).error || "")), r6.b);
    ok("…and none of it reached the file",
      !/add_political_power = 999/.test(read()) && !/nope/.test(read()), read().slice(0, 400));
    ok("the file is STILL valid after the junk attempt", balanced(read()));

    console.log("\ntest-decision-more-keys: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 45 ? 0 : 1;
    try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
