// #spirit-save-rejects-a-hyphen-it-can-open — NOVA COULD OPEN VANILLA'S SPIRIT BUT NOT SAVE IT.
//
// An interior hyphen is legal in a Paradox token. Four gates in the ideas maker read the id and already
// accept one (server.js 22313/22356/22398/22485, widened when the catalogue turned out to list them); the
// gate on SAVE, plus its three counterparts in the client, did not. So a modder could browse to
// AST_vickers-ruwolt_organization_idea — one of vanilla's own — open it, change a modifier, press Save, and
// be told the id "must start with a letter or underscore … (a leading digit breaks the ideas file)", about
// a leading digit it does not have.
//
// Two of the client's gates were wrong in the other direction as well: /^[A-Za-z0-9_]+$/ accepted a LEADING
// DIGIT that the server then refused, so the client waved through the one id that really does break the
// file and blocked the ones that do not.
//
// ⭐ THE CORPUS IS READ WITH NOVA'S OWN PARSER. A hand-rolled scan of `ideas = { … }` counted nested blocks
// as ids and reported 141 blocked ids, six times the truth; collectIdeaBlocksFromText is what the endpoints
// use, so what it returns is exactly the population the gates see. The honest number is 23 of 48,549.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hyph-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp, collectIdeaBlocksFromText } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "hyphmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="HyphMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "hyphmod.mod"), 'name="HyphMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
const REL = "nova_hyph.txt";
fs.writeFileSync(path.join(MOD, "common", "ideas", REL), "ideas = {\n\tcountry = {\n\t}\n}\n");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

const PORT = 53251;
(async () => {
  let srv = null;
  try {
    console.log("\n[⭐ the corpus] hyphenated spirit ids are real, and leading-digit ones are not");
    let realHyphenated = [];
    let scanned = 0;
    if (fs.existsSync(path.join(GAME, "common", "ideas"))) {
      const ids = new Set();
      const walk = (d) => {
        let e = [];
        try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
        for (const x of e) {
          const f = path.join(d, x.name);
          if (x.isDirectory()) { walk(f); continue; }
          if (!/\.txt$/i.test(x.name)) continue;
          let t = "";
          try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
          let blocks = [];
          try { blocks = collectIdeaBlocksFromText(t) || []; } catch (_) { continue; }
          // ⚠️ The field is ideaId, not id. Reading the wrong one returned zero from every root, which
          // looked exactly like "the corpus has none".
          for (const b of blocks) if (b && b.ideaId) ids.add(String(b.ideaId));
        }
      };
      walk(path.join(GAME, "common", "ideas"));
      scanned = ids.size;
      realHyphenated = [...ids].filter((i) => i.includes("-"));
      console.log(`     vanilla declares ${scanned} ideas, ${realHyphenated.length} with an interior hyphen`);
      for (const h of realHyphenated.slice(0, 4)) console.log(`        ${h}`);
      rec("the parser found vanilla's ideas at all", scanned > 1000, scanned);
      rec("…and vanilla really does ship hyphenated ids", realHyphenated.length > 0, realHyphenated);
      rec("…while none of them starts with a digit", !([...ids].some((i) => /^[0-9]/.test(i))),
        [...ids].filter((i) => /^[0-9]/.test(i)).slice(0, 5));
    } else {
      console.log("     SKIPPED — Hearts of Iron IV is not installed at the expected path");
      rec("the corpus check is skipped only because the game is absent", true, "skipped");
    }

    console.log("\n[⭐ DERIVED] every gate that guards a spirit id must accept what vanilla ships");
    {
      // Pull the gates out of the source rather than naming them, so a fifth one added later is covered.
      const sources = {
        "server.js": fs.readFileSync(path.join(__dirname, "server.js"), "utf8"),
        "public/ideas.js": fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8"),
        "public/app.js": fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"),
      };
      const sample = realHyphenated[0] || "AST_vickers-ruwolt_organization_idea";
      // ⚠️ KEY ON THE VARIABLE, NOT THE MESSAGE. Keying on the words "Spirit ID" found only four of the six
      // gates: three others answer with "Pick a valid spirit in the list first", "Invalid spirit ID" and
      // IDEA_ID_CHAR_HINT. Widening some and not the others is exactly how an earlier pass left spirit ids
      // listable but unopenable, so the sweep has to find them by what they TEST.
      const gates = [];
      for (const [file, src] of Object.entries(sources)) {
        const lines = src.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/\/(\^\[[^/]*?\$)\/\.test\((ideaId|resolvedIdeaId)\)/);
          if (m) gates.push({ file, line: i + 1, re: m[1] });
        }
      }
      console.log(`     gates found: ${gates.length}`);
      for (const g of gates) console.log(`        ${g.file}:${g.line}  ${g.re}`);
      // ⚠️ If the sweep finds nothing, every check below passes for the wrong reason.
      rec("the sweep found the spirit-id gates", gates.length >= 4, gates);
      const bad = gates.filter((g) => { try { return !new RegExp(g.re).test(sample); } catch (_) { return true; } });
      rec(`every gate accepts ${sample}`, bad.length === 0, bad);
      // ⚠️ NOT "none of them accepts a leading digit". Most of these gates LOCATE existing content — a
      // catalogue listing, a loc-line finder, a verify — and a locator that refuses to find something is the
      // worse failure, so those are deliberately permissive. The leading digit is the SAVE path's business,
      // and the behavioural control below is what pins it.

      // ⭐ THE INVARIANT, stated so a gate added later cannot quietly reintroduce the old rule: nowhere in
      // the client may a spirit id still be tested against /^[A-Za-z0-9_]+$/. That pattern is wrong in both
      // directions — it rejects the interior hyphen vanilla ships and accepts the leading digit that really
      // does break the ideas file.
      const stale = [];
      for (const [file, src] of Object.entries(sources)) {
        const lines = src.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (/\/\^\[A-Za-z0-9_\]\+\$\/\.test\((ideaId|resolvedIdeaId|id)\)/.test(lines[i])) {
            stale.push(`${file}:${i + 1}`);
          }
        }
      }
      rec("no spirit-id gate still uses the old over-strict pattern", stale.length === 0, stale);
    }

    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    // ⭐ COPIED FROM THE CLIENT. public/ideas.js:1794 posts to /api/ideas/upsert-definition — not
    // "save-definition" — with name/desc/picture/selectedEffects/formSections, not description/modifiers.
    // formSections names the boxes the form actually DREW: the server clears a section it owns when the
    // payload does not list it, so omitting it is not neutral. #spirit-save-deletes-hidden-blocks
    const save = (ideaId) => post("/api/ideas/upsert-definition", {
      modPath: MOD, ideaId, targetRelativeFile: REL,
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: "Test Spirit", desc: "A spirit for the hyphen test.", picture: "GFX_idea_generic",
      // ⚠️ RAW PDX BLOCK STRINGS, not objects. public/ideas.js:1782 builds them as
      // `modifier = {\n…\n}` and the server splices them in verbatim; an object was answered with
      // "Unknown spirit effect: empty-id."
      selectedEffects: ["modifier = {\n\tpolitical_power_gain = 0.05\n}"],
      formSections: ["modifier"],
      mode: "create", category: "country", traits: "", cost: "", removalCost: "", ledger: "",
    });
    const onDisk = () => { try { return fs.readFileSync(path.join(MOD, "common", "ideas", REL), "utf8"); } catch (_) { return ""; } };

    console.log("\n[CONTROL] an ordinary id still saves");
    {
      const r = await save("nova_plain_spirit");
      console.log(`     -> ${r.status} ${r.body && r.body.error ? r.body.error : "ok"}`);
      // ⚠️ If this fails the payload is wrong and the hyphen case below proves nothing.
      rec("a plain spirit id saves", r.status < 400 && r.body && !r.body.error, r.body);
      rec("…and lands in the file", onDisk().includes("nova_plain_spirit"), onDisk().slice(0, 200));
    }

    console.log("\n[CONTROL] a leading digit is still refused — the guard is not simply gone");
    {
      const r = await save("1_bad_spirit");
      console.log(`     -> ${r.status} ${(r.body && r.body.error) || "(accepted!)"}`);
      rec("a leading-digit id is rejected", !!(r.body && r.body.error), r.body);
      rec("…and nothing was written for it", !onDisk().includes("1_bad_spirit"), onDisk().slice(0, 300));
    }

    console.log("\n[THE BUG] the shape vanilla itself ships");
    {
      const id = "NOVA_vickers-ruwolt_organization_idea";
      const r = await save(id);
      console.log(`     -> ${r.status} ${r.body && r.body.error ? r.body.error : "ok"}`);
      // Before the fix: refused, with a message about a leading digit the id does not have.
      rec("a hyphenated spirit id saves", r.status < 400 && r.body && !r.body.error, r.body);
      rec("…and lands in the file intact", onDisk().includes(id), onDisk().slice(0, 400));
      // …and Nova's own parser can read back what it just wrote.
      const back = (collectIdeaBlocksFromText(onDisk()) || []).map((b) => b.ideaId);
      rec("…and Nova reads it back as one id, not two", back.includes(id), back);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== spirit id hyphen saves: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
