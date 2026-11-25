// #tech-var-moves-without-its-definition — A TOKEN IS ONLY A COORDINATE WHERE IT IS DECLARED.
//
// Found by the dependency-axis hunt, then reproduced by hand before it was believed.
//
// Writing back the modder's own `@variable` keeps a technology inside their shared row/year definitions,
// which is right while the tech stays in a file that DECLARES them (#keep-position-vars). Copying inherited
// technologies into a mod's own file is the case that breaks: the ids and the `@` references travelled, the
// `@1918 = …` declarations did not, and HOI4 resolves an unknown token to 0.
//
// Measured, copying vanilla infantry.txt's 87 technologies into a mod's own file:
//
//                    @definitions   @references   techs that moved
//   before the fix         0             41         40 of 87, every one onto y = 0
//   after                  0              0          0
//
// A whole research tree stacked on one row, with the save answering ok and no warning. The round trip was
// not idempotent either — the collapse became permanent on the next save.
//
// Corpus convention, checked rather than assumed: every vanilla common/*.txt that uses an @var declares it in
// the same file. So the literal is the honest record when a tech lands somewhere the token means nothing.
//
// The half that must NOT change is pinned below: a tech re-saved into a file that does declare the variable
// keeps the token, because that is the whole point of #keep-position-vars.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techvar-"));
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

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-techvar-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const SRC = path.join(VANILLA, "common", "technologies", "infantry.txt");
const defs = (t) => (t.match(/(?:^|\n)\s*@[A-Za-z0-9_]+\s*=\s*-?[0-9.]+/g) || []).length;
const refs = (t) => (t.match(/=\s*@[A-Za-z0-9_]+/g) || []).length;

function srcTechIds(text) {
  const t = text.replace(/#.*$/gm, "");
  const m = /(?:^|\n)\s*technologies\s*=\s*\{/.exec(t);
  if (!m) return new Set();
  let d = 0, o = t.indexOf("{", m.index), c = -1;
  for (let i = o; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { c = i; break; } } }
  const inner = t.slice(o + 1, c);
  const out = new Set();
  const re = /(?:^|\n)\t([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g;
  let x;
  while ((x = re.exec(inner)) !== null) out.add(x[1]);
  return out;
}

let seq = 0;
function mkMod(ownTheFile) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  if (ownTheFile) fs.copyFileSync(SRC, path.join(dir, "common", "technologies", "infantry.txt"));
  return dir;
}
const techDir = (dir) => path.join(dir, "common", "technologies");
const allText = (dir) => fs.readdirSync(techDir(dir)).map((f) => fs.readFileSync(path.join(techDir(dir), f), "utf8")).join("\n");

let PORT = 48000;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Copy the inherited techs into the mod's own file, then re-read and see what moved.
async function copyInAndMeasure(api, dir, ids) {
  const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(dir)}`);
  const list = ((cat.b.technologies || cat.b.techs) || []).filter((t) => ids.has(t.id));
  const before = new Map(list.map((t) => [t.id, `${t.x},${t.y}`]));
  list.forEach((t) => { t.file = "moved.txt"; t.isMod = true; });
  const save = await api.post("/api/technologies/save-batch", { modPath: dir, technologies: list, file: "moved.txt" });
  const cat2 = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(dir)}&_=${Date.now()}`);
  let moved = 0, toZero = 0;
  for (const t of ((cat2.b.technologies || cat2.b.techs) || [])) {
    const b = before.get(t.id);
    if (b === undefined) continue;
    if (`${t.x},${t.y}` !== b) { moved++; if (String(t.y) === "0") toZero++; }
  }
  return { save: save.b, count: before.size, moved, toZero, text: allText(dir) };
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(SRC)) {
      console.log("  --   vanilla not installed; this test measures against its infantry.txt. Skipping.");
      console.log("\n=== tech var moves without definition: skipped ===");
      return;
    }
    const srcText = fs.readFileSync(SRC, "utf8");
    const ids = srcTechIds(srcText);

    console.log("\n[ground truth] the source really is positioned by @variables");
    rec("vanilla's infantry.txt declares @variables", defs(srcText) >= 5, defs(srcText));
    rec("…and positions techs by them", refs(srcText) >= 20, refs(srcText));
    console.log(`  --   ${defs(srcText)} definitions, ${refs(srcText)} references, ${ids.size} techs`);

    console.log("\n[the corpus convention] a file that uses an @var declares it");
    {
      const dir = path.join(VANILLA, "common");
      const walk = (d, out = []) => {
        let e = [];
        try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return out; }
        for (const f of e) {
          const q = path.join(d, f.name);
          if (f.isDirectory()) walk(q, out);
          else if (f.name.toLowerCase().endsWith(".txt")) out.push(q);
        }
        return out;
      };
      let usesVar = 0, declaresToo = 0;
      for (const f of walk(dir)) {
        let t = "";
        try { t = fs.readFileSync(f, "utf8").replace(/#.*$/gm, ""); } catch (_) { continue; }
        const used = [...t.matchAll(/=\s*@([A-Za-z0-9_]+)/g)].map((m) => m[1]);
        if (!used.length) continue;
        usesVar++;
        const declared = new Set([...t.matchAll(/(?:^|\n)\s*@([A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]));
        if (used.every((u) => declared.has(u))) declaresToo++;
      }
      rec("every vanilla file that uses an @var declares it in the same file", usesVar > 0 && declaresToo === usesVar,
        { usesVar, declaresToo });
      console.log(`  --   ${declaresToo} of ${usesVar} files`);
    }

    api = await serve(createApp());

    console.log("\n[copying inherited techs in] must not leave references with no definitions");
    const dir = mkMod(false);
    const r = await copyInAndMeasure(api, dir, ids);
    rec("the save succeeds", r.save && r.save.ok === true, r.save);
    rec("…and every tech is written", r.count === ids.size, { written: r.count, expected: ids.size });
    rec("…leaving no @reference the file cannot resolve", refs(r.text) === 0 || defs(r.text) > 0,
      { defs: defs(r.text), refs: refs(r.text) });
    rec("…so not one technology moves when it is read back", r.moved === 0, { moved: r.moved, toZero: r.toZero });
    console.log(`  --   written file: ${defs(r.text)} definitions, ${refs(r.text)} references; ${r.moved} techs moved`);

    console.log("\n[what must NOT change] a tech that stays where the variable IS declared keeps the token");
    const own = mkMod(true);
    const F = path.join(techDir(own), "infantry.txt");
    const beforeText = fs.readFileSync(F, "utf8");
    const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(own)}`);
    const mine = ((cat.b.technologies || cat.b.techs) || []).filter((t) => t.isMod);
    const posBefore = new Map(mine.map((t) => [t.id, `${t.x},${t.y}`]));
    await api.post("/api/technologies/save-batch", { modPath: own, technologies: mine, file: "infantry.txt" });
    const afterText = fs.readFileSync(F, "utf8");
    rec("the declarations are still there", defs(afterText) === defs(beforeText), { before: defs(beforeText), after: defs(afterText) });
    rec("…and so are the references — the token is not needlessly expanded",
      refs(afterText) === refs(beforeText), { before: refs(beforeText), after: refs(afterText) });
    const cat2 = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(own)}&_=${Date.now()}`);
    let movedInPlace = 0;
    for (const t of ((cat2.b.technologies || cat2.b.techs) || [])) {
      const b = posBefore.get(t.id);
      if (b !== undefined && `${t.x},${t.y}` !== b) movedInPlace++;
    }
    rec("…and nothing moves", movedInPlace === 0, movedInPlace);
    api.stop(); api = null;

    console.log("\n[back-out] keep the token wherever it lands");
    {
      const built = controlApp("keeptoken", [[
        "      const coord = (v, pv) => (pv && pv.token && Number(pv.value) === Number(v) && varDeclared(pv.token)\n        ? pv.token\n        : (v != null ? v : 0));",
        "      const coord = (v, pv) => (pv && pv.token && Number(pv.value) === Number(v) ? pv.token : (v != null ? v : 0));"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod(false);
          const c = await copyInAndMeasure(capi, cdir, ids);
          rec("…the control still reports a successful save", c.save && c.save.ok === true, c.save);
          rec("…and writes references its file cannot resolve",
            refs(c.text) > 0 && defs(c.text) === 0, { defs: defs(c.text), refs: refs(c.text) });
          rec("…collapsing techs onto row 0 when they are read back",
            c.moved > 0 && c.toZero === c.moved, { moved: c.moved, toZero: c.toZero });
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== tech var moves without definition: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
