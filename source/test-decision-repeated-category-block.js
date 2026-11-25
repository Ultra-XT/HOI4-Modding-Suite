// #decision-second-category-block-duplicated-on-save / #decision-second-category-block-delete-not-found
//
// ONE FILE MAY DECLARE THE SAME DECISION CATEGORY TWICE. That is shipped vanilla script, not a malformed
// edge case: CZE.txt declares CZE_bop_army_readiness_category at line 830 and again at line 1382. Across
// vanilla's common/decisions nine files repeat a category id, and 35 decisions live outside the first block
// of their category. (Millennium Dawn has none, which is why this never showed up there.)
//
// Nova took the FIRST block with a matching key and stopped. Two failures follow:
//
//   SAVE — a decision living in a LATER block was not found in the first, so the writer treated it as new
//   and APPENDED a fresh copy to the first block, leaving the original where it was. The id is then defined
//   twice in one file with different content, and Nova's own code says why that cannot be recovered from:
//   "HOI4 keys decisions by id in one database, so two blocks claiming one id is not a merge the modder can
//   recover from either." A no-edit save of CZE_live_fire_exercise took it from one definition to two.
//
//   DELETE — the same first-block-only scan made the decision read as absent, so the delete refused it and
//   told the user it probably belongs to a dependency: advice that sends them looking in the wrong place for
//   a decision the sidebar is currently showing them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupcat-"));
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

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "dupcat");
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DupCat"\nsupported_version="1.19.*"\n', "utf8");

// A synthetic file with the exact shape, so the assertions can name specific ids.
const DUP = path.join(MOD, "common", "decisions", "zz_dupcat.txt");
const DUP_SRC = [
  "nua_dup_cat = {",
  "\tnua_dup_first = {",
  "\t\ticon = generic_political_actions",
  "\t\tcost = 10",
  "\t\tavailable = { has_war = no }",
  "\t\tcomplete_effect = { add_political_power = 5 }",
  "\t}",
  "}",
  "",
  "nua_dup_cat = {",
  "\tnua_dup_second = {",
  "\t\ticon = generic_political_actions",
  "\t\tcost = 55",
  "\t\tavailable = { has_war = yes }",
  "\t\tcomplete_effect = { add_political_power = 15 }",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(DUP, DUP_SRC, "utf8");
fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "nova_cat.txt"),
  "nua_dup_cat = {\n\ticon = generic_political_actions\n}\n", "utf8");

const countDefs = (text, id) => (text.match(new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`, "g")) || []).length;

const PORT = 43425;
const srv = createApp().listen(PORT, async () => {
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] vanilla repeats a category block, and puts decisions after it");
    let repeatFiles = 0, outsideFirst = 0;
    let decFiles = [];
    try { decFiles = fs.readdirSync(path.join(V, "common", "decisions")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
    for (const f of decFiles) {
      const t = fs.readFileSync(path.join(V, "common", "decisions", f), "utf8").replace(/#[^\n]*/g, "");
      const cats = new Map();
      for (const m of t.matchAll(/(^|\n)([A-Za-z0-9_]+)\s*=\s*\{/g)) cats.set(m[2], (cats.get(m[2]) || 0) + 1);
      const repeated = [...cats.entries()].filter(([, n]) => n > 1);
      if (!repeated.length) continue;
      repeatFiles++;
      for (const [cat] of repeated) {
        // count decisions that appear only after the first block of that category closes
        const first = new RegExp(`(^|\\n)${cat}\\s*=\\s*\\{`).exec(t);
        if (!first) continue;
        let d = 0, close = -1;
        const open = t.indexOf("{", first.index);
        for (let i = open; i < t.length; i++) {
          if (t[i] === "{") d++;
          else if (t[i] === "}") { d--; if (!d) { close = i; break; } }
        }
        if (close < 0) continue;
        const rest = t.slice(close + 1);
        const laterBlock = new RegExp(`(^|\\n)${cat}\\s*=\\s*\\{`).exec(rest);
        if (!laterBlock) continue;
        const lo = rest.indexOf("{", laterBlock.index);
        let d2 = 0, c2 = -1;
        for (let i = lo; i < rest.length; i++) {
          if (rest[i] === "{") d2++;
          else if (rest[i] === "}") { d2--; if (!d2) { c2 = i; break; } }
        }
        if (c2 < 0) continue;
        outsideFirst += (rest.slice(lo + 1, c2).match(/(^|\n)\t[A-Za-z0-9_]+\s*=\s*\{/g) || []).length;
      }
    }
    rec("the decisions corpus was readable", decFiles.length > 50, decFiles.length);
    rec("vanilla files repeat a category id", repeatFiles >= 5, { repeatFiles, outsideFirst });
    rec("…and real decisions live outside the first block", outsideFirst >= 10, { repeatFiles, outsideFirst });

    console.log("\n[the bug] saving a decision in the SECOND block must edit it, not clone it");
    rec("the fixture defines it exactly once", countDefs(DUP_SRC, "nua_dup_second") === 1, countDefs(DUP_SRC, "nua_dup_second"));
    const s = await post("/api/decisions/save", {
      modPath: MOD, isMod: true, fileName: "zz_dupcat.txt",
      categoryId: "nua_dup_cat", previousCategoryId: "nua_dup_cat",
      id: "nua_dup_second", previousId: "nua_dup_second",
      name: "Second", cost: 77, icon: "generic_political_actions",
      available: "has_war = yes", completeEffect: "add_political_power = 15",
    });
    rec("the save succeeded", s.s === 200 && !s.b.error, s.b || s.s);
    const after = fs.readFileSync(DUP, "utf8");
    rec("the decision is STILL defined exactly once", countDefs(after, "nua_dup_second") === 1,
      { count: countDefs(after, "nua_dup_second"), after });
    rec("…and it holds the new cost", /cost = 77/.test(after), after);
    rec("…and no stale copy with the old cost survives", !/cost = 55/.test(after), after);
    rec("…while the decision in the FIRST block is untouched",
      countDefs(after, "nua_dup_first") === 1 && /cost = 10/.test(after), after);
    rec("…and both category blocks are still there",
      countDefs(after, "nua_dup_cat") === 2, { count: countDefs(after, "nua_dup_cat"), after });
    rec("…and the file is brace-balanced",
      (after.match(/\{/g) || []).length === (after.match(/\}/g) || []).length, after);

    console.log("\n[the bug] and DELETING it must find it");
    const d = await post("/api/decisions/delete-definition", {
      modPath: MOD, categoryId: "nua_dup_cat", decisionId: "nua_dup_second", fileName: "zz_dupcat.txt",
    });
    rec("the delete succeeded rather than claiming it does not exist", d.s === 200 && !d.b.error, d.b || d.s);
    const afterDel = fs.readFileSync(DUP, "utf8");
    rec("…and it is gone", countDefs(afterDel, "nua_dup_second") === 0, afterDel);
    rec("…while the other decision survives", countDefs(afterDel, "nua_dup_first") === 1, afterDel);

    console.log("\n[real content] the same flow on vanilla's own CZE.txt");
    const CZE = path.join(MOD, "common", "decisions", "CZE.txt");
    let cze = "";
    try { cze = fs.readFileSync(path.join(V, "common", "decisions", "CZE.txt"), "utf8"); } catch (_) {}
    rec("vanilla's CZE.txt was readable", cze.length > 5000, cze.length);
    fs.writeFileSync(CZE, cze, "utf8");
    const listed = await get(`/api/decisions/list?modPath=${encodeURIComponent(MOD)}`);
    let target = null;
    for (const c of listed.b.categories || []) {
      const hit = (c.decisions || []).find((x) => x.id === "CZE_live_fire_exercise");
      if (hit) { target = { cat: c.id, dec: hit }; break; }
    }
    rec("CZE_live_fire_exercise was listed", !!target, (listed.b.categories || []).map((c) => c.id).slice(0, 8));
    if (target) {
      rec("it really does live outside the first block of its category",
        (() => {
          const first = new RegExp(`(^|\\n)${target.cat}\\s*=\\s*\\{`).exec(cze);
          if (!first) return false;
          const open = cze.indexOf("{", first.index);
          let dd = 0, close = -1;
          for (let i = open; i < cze.length; i++) {
            if (cze[i] === "{") dd++;
            else if (cze[i] === "}") { dd--; if (!dd) { close = i; break; } }
          }
          return close > 0 && cze.indexOf("CZE_live_fire_exercise = {") > close;
        })(), target.cat);
      const cs = await post("/api/decisions/save", {
        modPath: MOD, isMod: true, fileName: "CZE.txt",
        categoryId: target.cat, previousCategoryId: target.cat,
        id: "CZE_live_fire_exercise", previousId: "CZE_live_fire_exercise",
        name: target.dec.name || "Live Fire Exercise",
        cost: target.dec.cost != null ? target.dec.cost : 25,
        icon: target.dec.icon || "generic_political_actions",
        available: target.dec.available || "", completeEffect: target.dec.completeEffect || "",
      });
      rec("the save succeeded", cs.s === 200 && !cs.b.error, cs.b || cs.s);
      const czeAfter = fs.readFileSync(CZE, "utf8");
      rec("…and it is STILL defined exactly once", countDefs(czeAfter, "CZE_live_fire_exercise") === 1,
        countDefs(czeAfter, "CZE_live_fire_exercise"));
      rec("…and the file is still brace-balanced",
        (czeAfter.match(/\{/g) || []).length === (czeAfter.match(/\}/g) || []).length, "unbalanced");
    }

    console.log("\n[control] a genuinely NEW decision still joins the first block");
    const n = await post("/api/decisions/save", {
      modPath: MOD, isMod: true, fileName: "zz_dupcat.txt",
      categoryId: "nua_dup_cat", id: "nua_dup_brandnew",
      name: "Brand New", cost: 5, icon: "generic_political_actions",
      available: "has_war = no", completeEffect: "add_political_power = 1",
    });
    rec("the save succeeded", n.s === 200 && !n.b.error, n.b || n.s);
    const afterNew = fs.readFileSync(DUP, "utf8");
    rec("…and it was created exactly once", countDefs(afterNew, "nua_dup_brandnew") === 1, afterNew);

    console.log(`\n=== repeated decision category block: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
