// A mission has to be able to WAIT FOR A CLICK, and the maker could not express that at all.
//
// Per the wiki, `selectable_mission = yes` "turns the mission into one where the player must select the
// button. If unset or set to false, then the complete effect will fire as soon as `available` is true." So
// without it a mission whose Available conditions are empty completes and disappears on the same tick —
// which is exactly why 0 of vanilla's 401 missions and 0 of Millennium Dawn's 451 ship an empty
// `available = { }`, and why 2 of the 2 vanilla and 17 of the 19 MD missions that omit `available`
// entirely set `selectable_mission = yes` instead.
//
// The key is now read, written, and togglable in both directions, and the save warns when a mission would
// finish the instant it starts or has no timeout (the timeout is what makes it a mission at all).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mission-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="mission"\nsupported_version="1.19.*"\n');
const dd = path.join(mod, "common", "decisions");
fs.mkdirSync(dd, { recursive: true });
const FILE = "ZZ_missions.txt";
fs.writeFileSync(path.join(dd, FILE), [
  "m_cat = {",
  "\tclicky_mission = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tdays_mission_timeout = 30",
  "\t\tselectable_mission = yes",
  "\t\tactivation = { has_war = yes }",
  "\t\tavailable = { has_political_power > 50 }",
  "\t\ttimeout_effect = { add_political_power = -10 }",
  "\t}",
  "\tauto_mission = {",
  "\t\ticon = GFX_decision_generic_decision",
  "\t\tdays_mission_timeout = 60",
  "\t\tactivation = { has_war = yes }",
  "\t\tavailable = { has_political_power > 10 }",
  "\t\ttimeout_effect = { add_political_power = -5 }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

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

const PORT = 39589, app = createApp();
const server = app.listen(PORT, async () => {
  let pass = 0, total = 0;
  const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.log("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 180));
  try {
    const l = await get("/api/decisions/list?modPath=" + encodeURIComponent(mod));
    const cat = (l.categories || []).find((c) => c.id === "m_cat");
    const by = (id) => (cat.decisions || []).find((d) => d.id === id) || {};
    ok("the clicky mission reads as selectable", by("clicky_mission").selectableMission === "yes", by("clicky_mission").selectableMission);
    ok("the auto mission reads as not selectable", by("auto_mission").selectableMission === "no", by("auto_mission").selectableMission);
    ok("both read as missions", by("clicky_mission").decisionType === "mission" && by("auto_mission").decisionType === "mission");

    const save = (d, over) => post("/api/decisions/save", Object.assign({
      modPath: mod, categoryId: "m_cat", id: d.id, fileName: FILE, previousId: d.id, previousCategoryId: "m_cat",
      name: d.id, cost: "0", icon: d.icon || "", days: d.days || "0", cooldown: d.cooldown || "0",
      fireOnce: d.fireOnce, decisionType: d.decisionType, scope: d.scope,
      available: d.available || "", modifier: "", effect: "", removeEffect: d.removeEffect || "",
      targetTrigger: "", visible: "", allowed: "", aiWillDo: "", priority: "", cancelIfNotVisible: "",
      customCostText: "", customCostTrigger: "", targetedModifier: "", removeTrigger: "",
      onMapMode: "", highlightStates: "",
      activation: d.activation || "", cancelTrigger: d.cancelTrigger || "", isGood: d.isGood,
      selectableMission: d.selectableMission,
    }, over || {}));

    const r1 = await save(by("clicky_mission"));
    await breathe();
    ok("save → 200", r1.s === 200, r1.b);
    ok("selectable_mission survived an unchanged save", /selectable_mission\s*=\s*yes/.test(blockOf("clicky_mission")), blockOf("clicky_mission"));
    ok("it is still a mission", /days_mission_timeout\s*=\s*30/.test(blockOf("clicky_mission")));

    const r2 = await save(by("auto_mission"));
    await breathe();
    ok("save → 200", r2.s === 200, r2.b);
    ok("the auto mission gained no selectable_mission line", !/selectable_mission/.test(blockOf("auto_mission")), blockOf("auto_mission"));

    // turning it ON is now possible at all
    const r3 = await save(by("auto_mission"), { selectableMission: "yes" });
    await breathe();
    ok("save → 200", r3.s === 200, r3.b);
    ok("selectable_mission can now be TURNED ON", /selectable_mission\s*=\s*yes/.test(blockOf("auto_mission")), blockOf("auto_mission"));
    ok("declared exactly once", (blockOf("auto_mission").match(/selectable_mission/g) || []).length === 1);

    // …and off again
    const r4 = await save(by("clicky_mission"), { selectableMission: "no" });
    await breathe();
    ok("save → 200", r4.s === 200, r4.b);
    ok("and turned back OFF", /selectable_mission\s*=\s*no/.test(blockOf("clicky_mission")), blockOf("clicky_mission"));

    const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
    ok("the file is still valid", balanced(read()));
    console.log("\n" + pass + "/" + total + " checks passed");
  } catch (e) { console.error("ERROR", e); }
  finally {
    process.exitCode = pass === total && total >= 12 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {} server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
