// ⛔ #ideology-list-ignores-file-replacement — HOI4 REPLACES A common/ FILE WHOLESALE AT THE SAME PATH.
//
// Vanilla declares its four ideologies in common/ideologies/00_ideologies.txt. A mod shipping its own file of
// that name replaces it outright, so vanilla's four DO NOT EXIST in that mod. /api/ideologies scanned every
// root and merged, and then re-added the four unconditionally on top.
//
// Two installed mods are materially affected:
//     Novum Vexillum   replaces the file with 12 entirely different ideologies   Nova said 16
//     Old World Blues  replaces it with people / intellectuals / elites / ruler   Nova said  8
//
// An ideology is not cosmetic: it is a country's ruling party, its elections and its party popularity. A
// modder in a Fallout total conversion was offered "democratic", "fascism", "communism" and "neutrality",
// and anything written with one is content the game rejects.
//
// ⭐ THE CONTROLS DECIDE THE SHAPE OF THE FIX. Three other installed mods shadow the same file and
// re-declare vanilla's four (Rise of Nations adds islamism, Millennium Dawn and Road to 56 keep them), and
// four more ship no ideologies directory at all and must keep inheriting them. So the prune has to be
// per-FILE, and the "guarantee the four" default has to become a last resort rather than a guarantee —
// without that second half the prune would have changed nothing, since the four were re-added afterwards.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53538;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideology-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const STD = ["democratic", "communism", "fascism", "neutrality"];

// An INDEPENDENT reading of what the game would load, so nothing here is typed in.
const idFiles = (root) => {
  try { return fs.readdirSync(path.join(root, "common", "ideologies")).filter((f) => f.toLowerCase().endsWith(".txt")); }
  catch (_) { return []; }
};
function ideologiesIn(file) {
  const out = [];
  let t;
  try { t = fs.readFileSync(file, "utf8"); } catch (_) { return out; }
  t = t.replace(/#[^\n]*/g, "");
  const w = /(^|\n)\s*ideologies\s*=\s*\{/.exec(t);
  if (!w) return out;
  let open = t.indexOf("{", w.index), d = 0, end = -1;
  for (let i = open; i < t.length; i++) {
    if (t[i] === "{") d++;
    else if (t[i] === "}") { d--; if (!d) { end = i; break; } }
  }
  if (end === -1) return out;
  const inner = t.slice(open + 1, end);
  const re = /([A-Za-z0-9_]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(inner))) {
    out.push(m[1].toLowerCase());
    let o2 = inner.indexOf("{", m.index), dd = 0, c2 = -1;
    for (let i = o2; i < inner.length; i++) {
      if (inner[i] === "{") dd++;
      else if (inner[i] === "}") { dd--; if (!dd) { c2 = i; break; } }
    }
    if (c2 === -1) break;
    re.lastIndex = c2 + 1;
  }
  return out;
}
// ⚠️ DEPENDENCIES COUNT. The first version of this model used [vanilla, mod] and reported two failures that
// were its own: an add-on shipping no ideologies of its own still inherits its BASE MOD's, so Nova serving
// "islamism" (Rise of Nations') and "nationalist" (Millennium Dawn's) was right and the model was wrong.
// A mod is an overlay of everything below it, not of vanilla alone.
const modNameOf = (root) => {
  try { return (/name\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(root, "descriptor.mod"), "utf8")) || [])[1] || ""; }
  catch (_) { return ""; }
};
function dependencyRootsOf(modRoot) {
  let declared = [];
  try {
    const d = fs.readFileSync(path.join(modRoot, "descriptor.mod"), "utf8");
    const blk = /\bdependencies\s*=\s*\{([\s\S]*?)\}/.exec(d);
    if (blk) declared = (blk[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, "").trim());
  } catch (_) {}
  if (!declared.length) return [];
  const out = [];
  try {
    for (const e of fs.readdirSync(WS)) {
      const p = path.join(WS, e);
      if (declared.includes(modNameOf(p))) out.push(p);
    }
  } catch (_) {}
  return out;
}

// The game's answer: load order vanilla → dependencies → mod, and for each basename only the LAST root that
// ships it.
function expectedIdeologies(modRoot) {
  const roots = [GAME, ...(modRoot === GAME ? [] : dependencyRootsOf(modRoot)), modRoot].filter(Boolean);
  const owner = new Map();
  for (const r of roots) for (const f of idFiles(r)) owner.set(f.toLowerCase(), r);
  const out = [];
  const seen = new Set();
  for (const r of roots) {
    for (const f of idFiles(r).sort()) {
      if (owner.get(f.toLowerCase()) !== r) continue;
      for (const id of ideologiesIn(path.join(r, "common", "ideologies", f))) {
        if (!seen.has(id)) { seen.add(id); out.push(id); }
      }
    }
  }
  return out.length ? out : STD.slice();
}

(async () => {
  let server;
  try {
    const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

    console.log("1. The endpoint prunes, and the default is a last resort");
    rec("ownership is recorded before anything is read", /const ideologyFileOwner = new Map\(\)/.test(SERVER));
    rec("…and the scan reads only the files its root owns",
      /files = files\.filter\(\(f\) => ideologyFileOwner\.get\(f\.toLowerCase\(\)\) === me\)/.test(SERVER));
    rec("…with LAST-wins ownership, because this scans in LOAD order",
      /for \(const f of files\) ideologyFileOwner\.set\(f\.toLowerCase\(\), path\.resolve\(root\)\.toLowerCase\(\)\)/.test(SERVER),
      "first-wins here would keep vanilla's copy — the whole bug");
    rec("the four standard ideologies are only a fallback now", /if \(!order\.length\) \{/.test(SERVER),
      "re-adding them unconditionally put back exactly what the prune removed");

    console.log("\n2. Measured against every installed mod");
    if (!fs.existsSync(path.join(GAME, "common", "ideologies"))) {
      rec("a vanilla install to measure against", false, "cannot verify");
    } else {
      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const served = async (root) => {
        const b = await (await fetch(`http://127.0.0.1:${PORT}/api/ideologies?modPath=${encodeURIComponent(root)}`)).json();
        return (b.ideologies || []).map((x) => x.id);
      };

      const mods = [["vanilla", GAME]];
      try {
        for (const d of fs.readdirSync(WS)) {
          const p = path.join(WS, d);
          if (fs.existsSync(path.join(p, "descriptor.mod"))) mods.push([d, p]);
        }
      } catch (_) {}
      rec("there are installed mods to measure", mods.length > 3, mods.length);

      // ⚠️ THE FIXTURE MUST CONTAIN ALL THREE KINDS, or this measures a third of the rule.
      const kinds = { replaces: [], redeclares: [], inherits: [] };
      for (const [name, root] of mods) {
        if (root === GAME) continue;
        const own = idFiles(root);
        if (!own.length) { kinds.inherits.push(name); continue; }
        const exp = expectedIdeologies(root);
        (STD.every((s) => exp.includes(s)) ? kinds.redeclares : kinds.replaces).push(name);
      }
      rec("…some REPLACE vanilla's ideologies", kinds.replaces.length > 0, kinds.replaces);
      rec("…some shadow the file but RE-DECLARE them", kinds.redeclares.length > 0, kinds.redeclares);
      rec("…and some ship no ideologies at all", kinds.inherits.length > 0, kinds.inherits);

      // ⚠️ EXACT EQUALITY IS ONLY MEANINGFUL WITH AT MOST ONE RESOLVED DEPENDENCY, and saying so beats
      // quietly weakening the check. "Nikos Modpack" declares 49 dependencies, several of which ship their
      // own 00_ideologies.txt; which one wins is decided by the PLAYSET's load order, which neither this
      // model nor Nova can know from the descriptor alone. Asserting one particular winner there would be
      // asserting an arbitrary choice. Both mods that exhibit this bug have zero or one, so the finding is
      // still covered exactly.
      let exactChecked = 0;
      for (const [name, root] of mods) {
        const got = await served(root);
        const deps = root === GAME ? [] : dependencyRootsOf(root);
        if (deps.length > 1) {
          // Still not a free pass: whatever it serves must at least come from SOME root in the chain.
          const universe = new Set();
          for (const r of [GAME, ...deps, root]) for (const f of idFiles(r)) for (const id of ideologiesIn(path.join(r, "common", "ideologies", f))) universe.add(id);
          for (const s of STD) universe.add(s);
          const invented = got.filter((k) => !universe.has(k));
          rec(`${name}: (${deps.length} dependencies — load order is the playset's) invents nothing`,
            invented.length === 0, invented.length ? invented : `${got.length} served, all from the chain`);
          continue;
        }
        exactChecked++;
        const want = expectedIdeologies(root);
        const extra = got.filter((k) => !want.includes(k));
        const missing = want.filter((k) => !got.includes(k));
        rec(`${name}: serves exactly what the game loads`, extra.length === 0 && missing.length === 0,
          `${got.length} served, ${want.length} expected` + (extra.length ? ` | extra: ${extra}` : "")
          + (missing.length ? ` | missing: ${missing}` : ""));
      }
      rec("…and most mods were checked exactly, not loosely", exactChecked >= mods.length - 2,
        `${exactChecked} of ${mods.length} exact`);

      console.log("\n3. ⭐ Controls");
      // ⚠️ A MOD WITH DEPENDENCIES INHERITS THEIRS, NOT VANILLA'S — which is the very thing the header of this
      // file says ("an add-on shipping no ideologies of its own still inherits its BASE MOD's"), and this
      // control did not apply it. "Nikos Modpack" (1949510020) ships no ideology file and declares 101
      // dependencies, one of them "Hearts of Minecraft: Thorns of Terror", which REPLACES common/ideologies.
      // Nova served villagism/monster/cultism for it and was RIGHT; the control was asserting vanilla's four
      // for a mod whose base mod has none of them. So the control now covers only the mods for which
      // "inherits vanilla's" is actually the correct answer — the ones with no dependencies at all.
      const declaresDeps = (root) => {
        try {
          const d = fs.readFileSync(path.join(root, "descriptor.mod"), "utf8").replace(/#[^\n]*/g, "");
          const m = /dependencies\s*=\s*\{([\s\S]*?)\}/.exec(d);
          return !!(m && /"[^"]+"/.test(m[1]));
        } catch (_) { return false; }
      };
      let standalone = 0;
      for (const name of kinds.inherits) {
        const root = mods.find(([n]) => n === name)[1];
        if (declaresDeps(root)) { console.log(`  ..   ${name} ships none but depends on other mods — its base mod's ideologies are the right answer, not vanilla's`); continue; }
        standalone++;
        const got = await served(root);
        rec(`${name} ships none and depends on nothing, so it inherits vanilla's four`, STD.every((s) => got.includes(s)), got);
      }
      rec("…and at least one dependency-free mod was available to check that", standalone > 0, standalone);
      for (const name of kinds.redeclares) {
        const root = mods.find(([n]) => n === name)[1];
        const got = await served(root);
        rec(`${name} re-declares them, so it keeps them`, STD.every((s) => got.includes(s)), got.length + " ideologies");
      }

      console.log("\n4. The old behaviour, composed");
      // The union across roots, then the unconditional four on top — what the endpoint used to do.
      const OLD = (root) => {
        const seen = new Set(), out = [];
        for (const r of [GAME, ...(root === GAME ? [] : dependencyRootsOf(root)), root]) {
          for (const f of idFiles(r).sort()) {
            for (const id of ideologiesIn(path.join(r, "common", "ideologies", f))) {
              if (!seen.has(id)) { seen.add(id); out.push(id); }
            }
          }
        }
        for (const s of STD) if (!seen.has(s)) { seen.add(s); out.push(s); }
        return out;
      };
      let proved = 0;
      for (const name of kinds.replaces) {
        const root = mods.find(([n]) => n === name)[1];
        const oldSet = OLD(root), want = expectedIdeologies(root);
        const phantom = oldSet.filter((k) => !want.includes(k));
        rec(`${name}: the old rule invented ${phantom.length} ideologies the mod does not have`,
          phantom.length > 0, phantom);
        const got = await served(root);
        rec(`…and none of them is served now`, phantom.every((k) => !got.includes(k)));
        proved++;
      }
      rec("at least one installed mod exhibited the bug", proved > 0, proved + " mods");
    }

    // ⛔ #replace-path-common-ideologies — THE OTHER RULE, WHICH THIS ENDPOINT DID NOT HAVE AT ALL.
    //
    // Everything above is the SAME-FILENAME rule: a mod's 00_ideologies.txt replaces vanilla's wholesale.
    // replace_path is a separate rule, and /api/ideologies scanned the game root unconditionally, so a mod
    // declaring replace_path = "common/ideologies" was still offered vanilla's four — while its sibling
    // /api/game/ideologies, reading the very same folder for the Characters picker, already honoured it.
    //
    // The fixture ships an ideology of its own ON PURPOSE. The endpoint re-adds the four standard ideologies
    // as a last resort when a scan finds NOTHING, so a mod with no ideologies of its own would show four
    // either way and the check would pass without testing anything.
    console.log("\n[🈯 replace_path] a mod that unloads the folder is not offered what it unloaded");
    {
      const mkIdeologyMod = (name, replaces) => {
        const dir = path.join(SANDBOX, name);
        fs.mkdirSync(path.join(dir, "common", "ideologies"), { recursive: true });
        fs.writeFileSync(path.join(dir, "descriptor.mod"),
          `version="1"\nname="${name}"\nsupported_version="1.19.*"\n` + (replaces ? `replace_path="common/ideologies"\n` : ""), "utf8");
        fs.writeFileSync(path.join(dir, "common", "ideologies", "zz_probe_ideologies.txt"),
          "ideologies = {\n\tprobe_ideology = {\n\t\ttypes = {\n\t\t\tprobe_subtype = {}\n\t\t}\n\t\tcolor = { 10 20 30 }\n\t}\n}\n", "utf8");
        return dir;
      };
      const serveIds = async (root) => {
        const b = await (await fetch(`http://127.0.0.1:${PORT}/api/ideologies?modPath=${encodeURIComponent(root)}`)).json();
        return (b.ideologies || []).map((x) => x.id);
      };

      // CONTROL FIRST. Without it, "vanilla's four are absent" is also what a broken endpoint looks like.
      const plain = await serveIds(mkIdeologyMod("ideology_plain", false));
      rec("control: a mod that replaces nothing is offered the base game's ideologies",
        plain.includes("democratic") && plain.includes("fascism"), plain);
      rec("…and its own as well", plain.includes("probe_ideology"), plain);

      const replaced = await serveIds(mkIdeologyMod("ideology_replaced", true));
      rec("…and the mod's own is still there when it DOES replace the folder",
        replaced.includes("probe_ideology"), replaced);
      rec("⭐ …while the base game's, which the mod unloaded, are not",
        !replaced.includes("democratic") && !replaced.includes("fascism")
          && !replaced.includes("communism") && !replaced.includes("neutrality"), replaced);
    }

    console.log(`\n=== a replaced ideology file does not add ideologies: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
