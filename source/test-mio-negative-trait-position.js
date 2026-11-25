// #mio-negative-trait-position — a MIO trait's position is RELATIVE to its relative_position_id, and real
// trees put one branch on EACH side of a shared anchor. The writer clamped x with Math.max(0, …), so every
// trait to the LEFT of its anchor was flattened onto the anchor's own column.
//
// Real content, counted directly: 141 negative-x trait positions in vanilla and 716 in Millennium Dawn.
// Resolving the full relative_position_id chains, the clamp lands 23 vanilla and 208 MD trait icons on a grid
// cell another trait already occupies — two icons drawn on top of each other in the tree window.
//
// It bites on a NO-EDIT save, which is what makes it data loss rather than a bad default: the MIO editor has
// no position field at all, so the client carries x/y invisibly through the draft and posts them back. The
// server's own reader deliberately captures the sign with `(-?\d+)`. Every step of the round trip was signed
// except the write.
//
// The fix reuses pdxCoordinate, the signed clamp this file already uses for focus coordinates — same 1e6
// bound, and it keeps the #num-finite guarantee that NaN/Infinity/exponent notation never reach the file.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioneg-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "miomod");
const ORGS = path.join(MOD, "common", "military_industrial_organization", "organizations");
fs.mkdirSync(ORGS, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="MioMod"\nsupported_version="1.18.*"\n', "utf8");

const PORT = 42461;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const get = async (u) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${u}`);
    return r.json().catch(() => null);
  };
  const fileText = () => {
    try { return fs.readdirSync(ORGS).map((f) => fs.readFileSync(path.join(ORGS, f), "utf8")).join("\n"); }
    catch (_) { return ""; }
  };
  const xOf = (token) => {
    const m = new RegExp(`token\\s*=\\s*${token}[\\s\\S]{0,400}?position\\s*=\\s*\\{\\s*x\\s*=\\s*(-?\\d+)`).exec(fileText())
      || new RegExp(`${token}[\\s\\S]{0,300}?position\\s*=\\s*\\{\\s*x\\s*=\\s*(-?\\d+)`).exec(fileText());
    return m ? Number(m[1]) : null;
  };

  const draft = (traits) => ({
    modPath: MOD, id: "nova_sym_works", name: "Nova Symmetric Works", desc: "Two branches, one anchor.",
    allowedTag: "GER", icon: "GFX_idea_generic_tank_manufacturer_1",
    equipmentType: ["mio_cat_all_armor"], researchCategories: ["CAT_armor"],
    fileName: "nova_sym.txt",
    initial: { equipmentBonus: { reliability: 0.05 } },
    traits,
  });

  // A symmetric tree: an anchor, one child to its LEFT (x = -1) and one to its RIGHT (x = +1).
  const SYMMETRIC = [
    { token: "sym_anchor", name: "Anchor", x: 0, y: 0, equipmentBonus: { reliability: 0.1 } },
    { token: "sym_left", name: "Left Branch", x: -1, y: 1, relativeTo: "sym_anchor", equipmentBonus: { defense: 0.05 } },
    { token: "sym_right", name: "Right Branch", x: 1, y: 1, relativeTo: "sym_anchor", equipmentBonus: { soft_attack: 0.05 } },
  ];

  try {
    console.log("\n[create] a trait LEFT of its anchor must be written at negative x");
    let r = await post("/api/mio", draft(SYMMETRIC));
    rec("the company saved", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the LEFT branch is at x = -1", xOf("sym_left") === -1, { got: xOf("sym_left"), file: fileText().slice(0, 700) });
    rec("the RIGHT branch is at x = 1", xOf("sym_right") === 1, xOf("sym_right"));
    rec("…so the two branches are NOT on the same column", xOf("sym_left") !== xOf("sym_right"),
      { left: xOf("sym_left"), right: xOf("sym_right") });

    console.log("\n[read back] the sign survives the round trip");
    const d = await get(`/api/mio/detail?id=nova_sym_works&modPath=${encodeURIComponent(MOD)}`);
    const leftRead = ((d && d.traits) || []).find((t) => t && t.token === "sym_left");
    rec("GET /api/mio/detail reports x = -1", leftRead && Number(leftRead.x) === -1, leftRead);

    console.log("\n[NO-EDIT re-save] the shape that made this data loss");
    // The editor has no position field, so the client posts back whatever detail gave it. A user who opens a
    // company and changes ONE bonus re-sends these coordinates untouched — that is the whole failure.
    const carried = ((d && d.traits) || []).map((t) => ({
      token: t.token, name: t.name, x: t.x, y: t.y, relativeTo: t.relativeTo,
      equipmentBonus: t.equipmentBonus, productionBonus: t.productionBonus,
    }));
    r = await post("/api/mio", draft(carried));
    rec("the re-save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the LEFT branch is STILL at x = -1", xOf("sym_left") === -1, { got: xOf("sym_left"), file: fileText().slice(0, 700) });
    rec("…and did not collapse onto the anchor's column", xOf("sym_left") !== 0, xOf("sym_left"));

    console.log("\n[control] positive coordinates are unchanged");
    // Without this the fix could be "stop clamping at all", which would let a bad value through.
    rec("the anchor is still at x = 0", xOf("sym_anchor") === 0, xOf("sym_anchor"));
    rec("the right branch is still at x = 1", xOf("sym_right") === 1, xOf("sym_right"));

    console.log("\n[control] #num-finite still holds — no NaN, Infinity or exponent notation");
    r = await post("/api/mio", draft([
      { token: "sym_anchor", name: "Anchor", x: 0, y: 0, equipmentBonus: { reliability: 0.1 } },
      { token: "sym_nan", name: "Bad", x: "not a number", y: 2, relativeTo: "sym_anchor", equipmentBonus: { defense: 0.01 } },
      { token: "sym_huge", name: "Huge", x: 1e21, y: 3, relativeTo: "sym_anchor", equipmentBonus: { defense: 0.01 } },
      { token: "sym_neghuge", name: "NegHuge", x: -1e21, y: 4, relativeTo: "sym_anchor", equipmentBonus: { defense: 0.01 } },
    ]));
    rec("the save succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("a non-numeric x becomes 0, not NaN", xOf("sym_nan") === 0, xOf("sym_nan"));
    rec("no exponent notation anywhere in the file", !/[0-9]e[+-]/i.test(fileText()),
      (fileText().match(/x\s*=\s*[^\s}]+/g) || []).slice(0, 6));
    rec("a huge positive x is clamped, not written raw", xOf("sym_huge") === 1000000, xOf("sym_huge"));
    rec("a huge NEGATIVE x is clamped symmetrically", xOf("sym_neghuge") === -1000000, xOf("sym_neghuge"));

    console.log(`\n=== mio negative trait position: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
