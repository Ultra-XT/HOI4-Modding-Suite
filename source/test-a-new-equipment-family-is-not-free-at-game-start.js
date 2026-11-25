// ⛔ #every-tier-unlocked-at-game-start — A WHOLE FAMILY BUILDABLE IN 1936, RESEARCH AND ALL.
//
// `active = yes` is, per the wiki, "determines if this equipment is available without unlocking from a
// technology". The family creator wrote it on EVERY tier, so a modder who asked for six tiers spanning
// 1936–1951 got all six in the production queue on day one — and any technology they went on to write for
// them changed nothing at all, because the equipment was never gated in the first place.
//
// What the shipped files do, counted in common/units/equipment:
//     vanilla          3 of 261 tiers carry active = yes   convoy_1, explosive_ammo_equipment_1,
//                                                          infantry_equipment_0
//     Millennium Dawn  1 of 368                             convoy_1
//     Road to 56       3 of 331
// All three vanilla cases are equipment with no technology behind it: convoys, emplacement ammo, and the
// 1918 rifle every country begins with. The other 258 are unlocked by a tech's `enable_equipments`.
//
// So the first tier keeps it — that is infantry_equipment_0 exactly, and it means a new family is usable
// the moment it is made — and the later tiers do not. Since this creator writes no technology, the response
// says which tiers now need one and what line to add; producing tiers nothing can unlock would only trade
// one invisible failure for another.
//
// The ARCHETYPE is left alone on purpose. The wiki does not say whether `active` is inherited by a tier,
// and an archetype carries is_buildable = no, so changing it would be guessing rather than measuring.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53699);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 320) : "")); }
};

const roots = [];
const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqa-ad-")); roots.push(appdata);
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqa-")); roots.push(mod);
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Active"\n', "utf8");

// The premise, DERIVED from the base game rather than typed in: how many tiers really do declare `active`.
// Fields are read at depth 1 of each equipment block, so a nested `resources = { }` cannot contribute.
function countActiveTiers(dir) {
  const stats = { archetypes: 0, archActive: 0, tiers: 0, tierActive: 0, ids: [] };
  let list = []; try { list = fs.readdirSync(dir); } catch (_) { return null; }
  const mask = (src) => {
    let out = "", inC = false, inS = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inC) { if (c === "\n") { inC = false; out += c; } else out += " "; continue; }
      if (inS) { out += " "; if (c === '"') inS = false; else if (c === "\n") { inS = false; out = out.slice(0, -1) + c; } continue; }
      if (c === "#") { inC = true; out += " "; continue; }
      if (c === '"') { inS = true; out += " "; continue; }
      out += c;
    }
    return out;
  };
  const opener = (m, open) => {
    let e = open - 1;
    while (e >= 0 && /\s/.test(m[e])) e--;
    if (m[e] === "=") { e--; while (e >= 0 && /\s/.test(m[e])) e--; }
    let b = e;
    while (b >= 0 && !/[\s{}=]/.test(m[b])) b--;
    return m.slice(b + 1, e + 1).trim();
  };
  for (const f of list) {
    if (!f.toLowerCase().endsWith(".txt")) continue;
    let raw = ""; try { raw = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    const m = mask(raw);
    const stack = [];
    for (let i = 0; i < m.length; i++) {
      if (m[i] === "}") { stack.pop(); continue; }
      if (m[i] !== "{") continue;
      const name = opener(m, i);
      if (stack.length === 1 && stack[0] === "equipments") {
        let d = 0, close = -1;
        for (let j = i; j < m.length; j++) { if (m[j] === "{") d++; else if (m[j] === "}") { d--; if (!d) { close = j; break; } } }
        if (close !== -1) {
          const body = m.slice(i + 1, close);
          let dd = 0, top = "";
          for (let j = 0; j < body.length; j++) {
            const c = body[j];
            if (c === "{") { dd++; top += " "; } else if (c === "}") { dd--; top += " "; } else top += dd ? " " : c;
          }
          const isArch = /(^|\s)is_archetype\s*=\s*yes/.test(top);
          const yes = /(^|\s)active\s*=\s*yes/.test(top);
          if (isArch) { stats.archetypes++; if (yes) stats.archActive++; }
          else if (/(^|\s)archetype\s*=/.test(top)) { stats.tiers++; if (yes) { stats.tierActive++; stats.ids.push(name); } }
        }
      }
      stack.push(name);
    }
  }
  return stats;
}

const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: Object.assign({}, process.env, {
    PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
  }),
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 160; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) { ok(false, "server came up on " + PORT); return; }

    console.log("\n-- ⭐ the premise: the base game gates nearly every tier behind research --");
    {
      const s = countActiveTiers("D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/units/equipment");
      if (!s) ok(true, "(base game not installed — premise check skipped)");
      else {
        ok(s.tiers > 100, `${s.tiers} tiers found to compare against`, s.tiers);
        ok(s.tierActive <= 5, `only ${s.tierActive} of them are available without research`, s.ids);
        ok(s.ids.includes("infantry_equipment_0"),
          "…and one of them is infantry_equipment_0 — the FIRST tier, which is what Nova now mirrors", s.ids);
        ok(s.tierActive / s.tiers < 0.05,
          `…so "every tier is free" was the opposite of the shipped convention (${(100 * s.tierActive / s.tiers).toFixed(1)}%)`,
          { active: s.tierActive, tiers: s.tiers });
      }
    }

    // Exactly the body public/army.js builds in createFamily.
    const create = async (id, tierCount) => (await fetch(`http://127.0.0.1:${PORT}/api/equipment/family`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modPath: mod, id, name: "Test Rifle", type: "infantry", domain: "land",
        tierCount, year: 1936, build_cost_ic: 1, soft_attack: 3, defense: 20,
      }),
    })).json();

    console.log("\n-- ⭐ only the first tier is free --");
    let created;
    {
      created = await create("nova_test_rifle", 4);
      ok(created && created.ok === true, "a four-tier family is created", created && created.error);
      const text = fs.readFileSync(path.join(mod, "common", "units", "equipment", created.file), "utf8");
      const blockOf = (id) => {
        const at = text.indexOf(`\t${id} = {`);
        if (at === -1) return "";
        let d = 0;
        for (let i = text.indexOf("{", at); i < text.length; i++) {
          if (text[i] === "{") d++; else if (text[i] === "}") { d--; if (!d) return text.slice(at, i + 1); }
        }
        return "";
      };
      const t0 = blockOf("nova_test_rifle_0");
      ok(/active\s*=\s*yes/.test(t0), "tier 0 is available from the start, like infantry_equipment_0", t0);
      for (const i of [1, 2, 3]) {
        const b = blockOf(`nova_test_rifle_${i}`);
        ok(b.length > 0, `tier ${i} was written`, b);
        ok(!/active\s*=\s*/.test(b), `…and tier ${i} is NOT free — it needs a technology, like vanilla's 258`, b);
      }
      ok(/archetype = nova_test_rifle/.test(blockOf("nova_test_rifle_1")), "…while still naming its archetype");
      ok(/priority = 11/.test(blockOf("nova_test_rifle_1")) && /visual_level = 1/.test(blockOf("nova_test_rifle_1")),
        "…and keeping the rest of the tier fields");
    }

    console.log("\n-- ⭐ and the response says which tiers need a technology --");
    {
      ok(Array.isArray(created.gatedTiers) && created.gatedTiers.length === 3,
        "the three gated tiers are named as data", created.gatedTiers);
      ok(!created.gatedTiers.includes("nova_test_rifle_0"), "…and tier 0 is not among them", created.gatedTiers);
      const note = (created.notes || []).join(" ");
      ok(/enable_equipments = \{ nova_test_rifle_1 \}/.test(note),
        "…and the note gives the exact line to add, not just a complaint", note);
      ok(/Research Tree/.test(note), "…and where to add it", note);
    }

    console.log("\n-- a single-tier family is usable with nothing else to do --");
    {
      const one = await create("nova_solo_rifle", 1);
      ok(one && one.ok === true, "it is created", one && one.error);
      const text = fs.readFileSync(path.join(mod, "common", "units", "equipment", one.file), "utf8");
      ok(/nova_solo_rifle_0 = \{[\s\S]*?active = yes/.test(text), "its only tier is available from the start");
      ok(!(one.gatedTiers || []).length, "…and nothing is claimed to need a technology", one.gatedTiers);
      ok(!(one.notes || []).length, "…so the modder is not told to go and do nothing", one.notes);
    }

    console.log("\n-- ⭐ CONTROL: the equipment still reads back as this mod's, with its tiers --");
    {
      // The point of the change is that the family still WORKS. If the tiers fell out of the catalogue, or
      // stopped resolving their archetype's stats, this would be a worse bug than the one it fixes.
      const list = await (await fetch(`http://127.0.0.1:${PORT}/api/equipment/list?modPath=${encodeURIComponent(mod)}`)).json();
      const all = (list && list.equipment) || []; // the key public/army.js reads: `d.equipment`
      const ids = all.map((e) => e && (e.id || e.name)).filter(Boolean);
      ok(ids.includes("nova_test_rifle_1"), "tier 1 is in the catalogue", ids.filter((x) => /nova_test/.test(x)));
      ok(ids.includes("nova_test_rifle_0"), "…and so is tier 0");
      const t1 = all.find((e) => e && e.id === "nova_test_rifle_1");
      ok(t1 && (t1.archetype === "nova_test_rifle"), "…and tier 1 still resolves its archetype", t1 && t1.archetype);
    }

    console.log("\n-- the client shows the note --");
    {
      const APP = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
      ok(/showSaveWarnings\("eqSaveStatus", d\.notes\)/.test(APP),
        "createFamily puts the note on screen — otherwise it is a server-side monologue");
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    try { srv.kill(); } catch (_) {}
    setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
    process.exitCode = fail ? 1 : 0;
    setTimeout(() => process.exit(fail ? 1 : 0), 1200);
  }
})();
