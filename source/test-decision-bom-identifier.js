// #decision-bom-duplicates-the-block — A BYTE-ORDER MARK IS NOT PART OF A NAME.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// `splitTopLevelPdxStatements`'s `isIdent` admits any character above U+007F — deliberately, so that an
// accented token like `CHL_escudero_oscar_otárola` parses whole. U+FEFF is above U+007F, so the byte-order
// mark at the start of a file was swallowed into that file's FIRST top-level key: `sibcat` parsed as
// U+FEFF + "sibcat", and the decisions list handed that id to the client.
//
// The save then does `String(req.body.categoryId || "").trim()`, and JS `trim()` STRIPS U+FEFF. So the lookup
// searched for `sibcat`, matched nothing, `foundCategory` stayed false, and it took the APPEND branch. The
// decision ended up defined twice in one file while the save reported {ok:true, success:true} — and Nova's
// own note elsewhere says why that cannot be recovered from: "HOI4 keys decisions by id in one database, so
// two blocks claiming one id is not a merge the modder can recover from either."
//
// Delete then resolved through the same parser, removed the ORIGINAL, reported success, and left Nova's
// appended duplicate live in the game — so the decision the user deleted was still there.
//
// BOMs are ordinary here: 87 of vanilla's 216 decisions + events files carry one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decbom-"));
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
  const p = path.join(__dirname, `.ctl-decbom-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}
const BS = String.fromCharCode(92); // build the escape without typing it through a shell

const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const BOM = "\uFEFF";
const BODY = ["sibcat = {", "\tsib_one = {", "\t\tcost = 10", "\t\tdays_remove = 5", "\t}", "}", ""].join("\n");
let seq = 0;
function mkMod(withBom) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "decisions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "common", "decisions", "zz_bom.txt"), (withBom ? BOM : "") + BODY, "utf8");
  return dir;
}
const decFile = (dir) => path.join(dir, "common", "decisions", "zz_bom.txt");

let PORT = 47100;
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
async function listAndSave(api, dir) {
  const list = await api.get(`/api/decisions/list?modPath=${encodeURIComponent(dir)}`);
  const cats = (list.b.categories || []);
  const d = cats.flatMap((c) => (c.decisions || []).map((x) => Object.assign({ categoryId: c.id }, x)))[0];
  if (!d) return { error: "nothing listed", raw: JSON.stringify(list.b).slice(0, 200) };
  const save = await api.post("/api/decisions/save", Object.assign({ modPath: dir }, d));
  return { catId: cats[0] && cats[0].id, save: save.b, text: fs.readFileSync(decFile(dir), "utf8") };
}
const countBlocks = (t, k) => (t.match(new RegExp(k + "\\s*=\\s*\\{", "g")) || []).length;

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] BOMs are ordinary in the files this parser reads");
    let bomd = 0, total = 0;
    for (const sub of [["common", "decisions"], ["events"]]) {
      const d = path.join(VANILLA, ...sub);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (!f.toLowerCase().endsWith(".txt")) continue;
        total++;
        const fd = fs.openSync(path.join(d, f), "r");
        const buf = Buffer.alloc(3);
        fs.readSync(fd, buf, 0, 3, 0);
        fs.closeSync(fd);
        if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) bomd++;
      }
    }
    if (total) {
      rec("vanilla ships BOM'd decision/event files", bomd > 0, { bomd, total });
      rec("…in bulk, not as a one-off", bomd >= 50, { bomd, total });
      console.log(`  --   measured: ${bomd} of ${total} vanilla decisions + events files carry a BOM`);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());

    console.log("\n[a BOM'd file] parses to a clean id and round-trips once");
    const dir = mkMod(true);
    rec("the fixture really does start with a BOM",
      fs.readFileSync(decFile(dir), "utf8").charCodeAt(0) === 0xfeff, "no BOM written");
    const r = await listAndSave(api, dir);
    rec("the category is listed", !r.error, r.error ? r.raw : "");
    rec("…under a clean id, with no BOM glued to the front",
      r.catId === "sibcat", JSON.stringify(r.catId));
    rec("…the save reports success", r.save && r.save.ok === true, r.save);
    rec("…and the decision is still defined exactly ONCE", countBlocks(r.text, "sib_one") === 1, countBlocks(r.text, "sib_one"));
    rec("…in exactly one category block", countBlocks(r.text, "sibcat") === 1, countBlocks(r.text, "sibcat"));
    rec("…with the BOM left where the file had it", r.text.charCodeAt(0) === 0xfeff, "BOM lost");
    rec("…and the file still brace-balanced",
      (r.text.replace(/#.*$/gm, "").match(/\{/g) || []).length === (r.text.replace(/#.*$/gm, "").match(/\}/g) || []).length, "unbalanced");

    console.log("\n[the same file without a BOM] behaves identically — the BOM is the only variable");
    const dirB = mkMod(false);
    const rb = await listAndSave(api, dirB);
    rec("the id is the same", rb.catId === "sibcat", JSON.stringify(rb.catId));
    rec("…and it is still defined once", countBlocks(rb.text, "sib_one") === 1, countBlocks(rb.text, "sib_one"));

    console.log("\n[a delete] removes the decision, and does not leave a copy behind");
    const dirC = mkMod(true);
    const listC = await api.get(`/api/decisions/list?modPath=${encodeURIComponent(dirC)}`);
    const dc = (listC.b.categories || []).flatMap((c) => (c.decisions || []).map((x) => Object.assign({ categoryId: c.id }, x)))[0];
    const del = await api.post("/api/decisions/delete-definition",
      { modPath: dirC, categoryId: dc.categoryId, id: dc.id, decisionId: dc.id });
    const textC = fs.readFileSync(decFile(dirC), "utf8");
    rec("the delete is accepted", del.s === 200 && !del.b.error, del.b);
    rec("…and no copy of the decision survives anywhere in the file",
      countBlocks(textC, "sib_one") === 0, countBlocks(textC, "sib_one"));
    api.stop(); api = null;

    console.log("\n[back-out] let the BOM into the identifier again");
    {
      const built = controlApp("bomident", [[
        '(c > "' + BS + 'u007f" && c !== "' + BS + 'ufeff");',
        'c > "' + BS + 'u007f";']]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod(true);
          const c = await listAndSave(capi, cdir);
          rec("…the control still reports a successful save", c.save && c.save.ok === true, c.save);
          rec("…but the listed id carries the BOM", c.catId !== "sibcat" && /sibcat/.test(String(c.catId)),
            JSON.stringify(c.catId));
          rec("…and the decision is now defined TWICE in one file",
            countBlocks(c.text, "sib_one") === 2, countBlocks(c.text, "sib_one"));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== decision BOM identifier: ${checks} checks, ${fails.length} failed ===`);
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
