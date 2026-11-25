// #raw-number-interpolation — two writers put raw JS numbers into script, so a value a type=number box
// happily accepts was written as `1e+21` / `1e-7` — tokens Clausewitz cannot lex.
//
// `<input type="number" step="0.01">` accepts the HTML floating-point exponent form verbatim: typing 1e21 or
// 0.0000001 yields a value whose Number is finite, so the client's `Number.isFinite(Number(v))` guard passes
// and the raw Number is POSTed. JS then stringifies 1e21 as "1e+21" and 1e-7 as "1e-7".
//
// formatHoi4Number exists precisely for this — its own comment says toFixed emits exponential notation for
// |n| >= 1e21 "which is not a valid Clausewitz number token and would make the file unparseable" — and every
// other numeric writer routes through it. These two did not:
//   - the sub-unit stats loop (the `need` block two lines below it even carries the #num-finite note)
//   - the leader-trait writer: cost, gui_row, the skill keys, and the modifier map, which did not even coerce
//     to Number, so a string went straight through.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-rawnum-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "common", "units"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "unit_leader"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="N"\nsupported_version="1.18.*"\n');
const SUFILE = path.join(MOD, "common", "units", "probe_units.txt");
fs.writeFileSync(SUFILE,
  "sub_units = {\n\tprobe_bat = {\n\t\tsprite = infantry\n\t\tmap_icon_category = infantry\n\t\tsoft_attack = 5\n\t\tdefense = 3\n\t}\n}\n", "utf8");

// What a Chromium type=number box actually yields for these inputs — the values are finite, which is why
// the client guard lets them through.
ok("1e21 is a finite Number", Number.isFinite(Number("1e21")), Number("1e21"));
ok("…and JS stringifies it exponentially", String(Number("1e21")) === "1e+21", String(Number("1e21")));
ok("0.0000001 is finite too", Number.isFinite(Number("0.0000001")));
ok("…and also stringifies exponentially", String(Number("0.0000001")) === "1e-7", String(Number("0.0000001")));

const EXP = /\d[eE][+-]?\d/; // an exponent in a written value is the failure signature

const PORT = 40007, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (url, body) => fetch(`http://127.0.0.1:${PORT}${url}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  try {
    // ── sub-unit stats ───────────────────────────────────────────────────────────────────────────
    const r = await post("/api/subunits/edit", {
      modPath: MOD, key: "probe_bat", fileName: "probe_units.txt",
      stats: { soft_attack: 1e21, defense: 0.0000001 },
    });
    ok("the sub-unit edit succeeds", r.status === 200 && r.body && r.body.ok, r);
    const su = fs.readFileSync(SUFILE, "utf8");
    ok("NO EXPONENT WAS WRITTEN into the unit file", !EXP.test(su), su);
    ok("…the huge value was clamped to a plain decimal", /soft_attack\s*=\s*1000000000000000000\b/.test(su), su);
    ok("…and the tiny one written as plain decimal", /defense\s*=\s*0(\.0+)?\b/.test(su), su);
    let d = 0; for (const c of su) { if (c === "{") d++; else if (c === "}") d--; }
    ok("…and the file is brace-balanced", d === 0, d);

    // an ordinary value must be unchanged in meaning
    const r2 = await post("/api/subunits/edit", { modPath: MOD, key: "probe_bat", fileName: "probe_units.txt", stats: { soft_attack: 7.25 } });
    ok("an ordinary stat still saves", r2.status === 200 && r2.body.ok, r2);
    ok("…as the value typed", /soft_attack\s*=\s*7\.25\b/.test(fs.readFileSync(SUFILE, "utf8")), fs.readFileSync(SUFILE, "utf8"));

    // ── leader traits ────────────────────────────────────────────────────────────────────────────
    const t = await post("/api/characters/trait", {
      modPath: MOD, id: "probe_trait", type: "corps_commander", trait_type: "personality_trait",
      cost: 1e21, gui_row: 2, attack_skill: 0.0000001,
      modifier: { army_speed_factor: 1e21, army_org_factor: "0.0000001" },
    });
    ok("the trait save succeeds", t.status === 200 && t.body && t.body.ok, t);
    const dir = path.join(MOD, "common", "unit_leader"); // traits live here, not common/units/leader_traits
    const tt = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    ok("a trait file was written", tt.length > 0, fs.readdirSync(dir));
    ok("NO EXPONENT WAS WRITTEN into the trait file", !EXP.test(tt), tt.slice(0, 400));
    ok("…cost is a plain decimal", /cost\s*=\s*1000000000000000000\b/.test(tt), tt.slice(0, 400));
    ok("…the modifier value too", /army_speed_factor\s*=\s*1000000000000000000\b/.test(tt), tt.slice(0, 400));
    ok("…and a STRING modifier value was coerced, not passed through", /army_org_factor\s*=\s*0(\.0+)?\b/.test(tt), tt.slice(0, 400));
    let d2 = 0; for (const c of tt) { if (c === "{") d2++; else if (c === "}") d2--; }
    ok("…and that file is brace-balanced", d2 === 0, d2);

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("the sub-unit stats loop formats its value", /setSubUnitScalar\(inner, k, formatHoi4Number\(n\)\)/.test(src), "still raw");
    ok("the trait cost is formatted", /cost = \$\{formatHoi4Number\(t\.cost\)\}/.test(src), "still raw");
    ok("…gui_row too", /gui_row = \$\{formatHoi4Number\(t\.gui_row\)\}/.test(src), "still raw");
    ok("…the skill keys", /\$\{k\} = \$\{formatHoi4Number\(t\[k\]\)\}/.test(src), "still raw");
    ok("…and the modifier map", /\$\{k\} = \$\{formatHoi4Number\(mods\[k\]\)\}/.test(src), "still raw");
    ok("…and it explains why", /#raw-number-interpolation/.test(src), "no marker comment");

    console.log("\ntest-raw-number-interpolation: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
