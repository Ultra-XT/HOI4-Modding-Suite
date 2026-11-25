// #simulator-cannot-see-inherited-spirits — THE FOCUS SIMULATOR COULD NOT LOOK UP ALMOST ANY SPIRIT.
//
// The focus-tree Simulation panel answers "what does this focus's add_ideas actually grant?" by asking
// /api/ideas/entry-preview and /api/ideas/entry-block for the spirit. Two things were wrong at once:
//
//   · it sent ONLY ideaId — no modPath — so the endpoint fell back to the persisted active mod, which is
//     not necessarily the one open in the editor. Measured on a scratch mod: even that mod's OWN spirit
//     came back "Spirit not found under that mod root";
//   · and the endpoint searched exactly one root, so a spirit belonging to vanilla or to a base mod was
//     never found. For an add-on that is nearly every spirit a focus can grant.
//
// ⭐ THE SIBLING NEXT DOOR: public/ideas.js:631 asks the same endpoint and passes sourceRoot AND
// definitionFile, taken from the catalogue row it is displaying — so the ideas page never hit this and the
// simulator hit it constantly. An explicit sourceRoot is a caller saying exactly where to read, so it is
// still honoured verbatim; only the no-sourceRoot case searches.
//
// 🈯 While here: entry-preview's id guard was /^[A-Za-z0-9_]+$/, which refuses the 23 shipped idea ids
// carrying an interior hyphen (AST_curtiss-wright_organization_idea, NKO_Marxism-Leninism).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-simsp-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

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
const SPIRIT = (id) => `\t\t${id} = {\n\t\t\tpicture = generic_morale_bonus\n\t\t\tmodifier = { political_power_gain = 0.1 }\n\t\t}\n`;
const mk = (name, deps, spirits) => {
  const M = path.join(ROOT, name);
  fs.mkdirSync(path.join(M, "common", "ideas"), { recursive: true });
  const depBlock = deps && deps.length ? `dependencies={\n${deps.map((d) => `\t"${d}"`).join("\n")}\n}\n` : "";
  fs.writeFileSync(path.join(M, "descriptor.mod"), `name="${name}"\n${depBlock}supported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(ROOT, name + ".mod"), `name="${name}"\npath="${toPosix(M)}"\n${depBlock}supported_version="1.19.*"\n`);
  fs.writeFileSync(path.join(M, "common", "ideas", "zz_nova.txt"),
    "ideas = {\n\tcountry = {\n" + spirits.map(SPIRIT).join("") + "\t}\n}\n");
  return M;
};
const BASE = mk("SimBase", null, ["nova_base_spirit", "nova_hyphen-spirit_idea"]);
const ADDON = mk("SimAddon", ["SimBase"], ["nova_own_spirit"]);

const PORT = 53065;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const B = `http://127.0.0.1:${PORT}`;
    const preview = (id, q) => fetch(`${B}/api/ideas/entry-preview?ideaId=${encodeURIComponent(id)}${q || ""}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const block = (id, q) => fetch(`${B}/api/ideas/entry-block?ideaId=${encodeURIComponent(id)}${q || ""}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const M = `&modPath=${encodeURIComponent(ADDON)}`;

    console.log("\n[CONTROL] the mod's OWN spirit resolves when the mod is named");
    {
      const p = await preview("nova_own_spirit", M);
      const b = await block("nova_own_spirit", M);
      rec("preview finds it", p && p.ok === true, p);
      rec("…and the block text comes back", b && b.ok === true && String(b.blockText || "").includes("political_power_gain"), b && String(b.blockText || "").slice(0, 80));
    }

    console.log("\n[the defect] a spirit from the BASE MOD must resolve too");
    {
      const p = await preview("nova_base_spirit", M);
      const b = await block("nova_base_spirit", M);
      console.log(`     preview.ok=${p && p.ok} block.ok=${b && b.ok}`);
      // THE BUG: "Spirit not found under that mod root" — the search never left the add-on's own folder.
      rec("preview finds the inherited spirit", p && p.ok === true, p && p.error);
      rec("…and so does the block read", b && b.ok === true, b && b.error);
      rec("…with the real modifier, not an empty block",
        b && String(b.blockText || "").includes("political_power_gain"), b && String(b.blockText || "").slice(0, 80));
    }

    console.log("\n[🈯 interior hyphen] an id HOI4 allows must not be refused outright");
    {
      const p = await preview("nova_hyphen-spirit_idea", M);
      console.log(`     preview.ok=${p && p.ok} err=${p && p.error}`);
      rec("a hyphenated spirit id is accepted", p && p.ok === true, p && p.error);
    }

    console.log("\n[CONTROL] an id that really does not exist is still refused");
    {
      // Widening a search must not turn "not found" into "found something else". If this passed, the
      // endpoint would be answering for spirits nobody defined.
      const p = await preview("nova_definitely_not_a_spirit", M);
      rec("a nonexistent spirit is still an error", !(p && p.ok === true), p);
      rec("…and the message names all three layers it looked in",
        /dependencies|base game/i.test(String((p && p.error) || "")), p && p.error);
      const bad = await preview("nova bad id!", M);
      rec("…and a malformed id is still rejected", !(bad && bad.ok === true), bad);
    }

    console.log("\n[CONTROL] an explicit sourceRoot is still honoured verbatim, not searched around");
    {
      // public/ideas.js passes sourceRoot + definitionFile because it knows exactly which row it is
      // showing. That must keep meaning "read THIS root" — otherwise the ideas page would silently show a
      // different layer's copy of a same-named spirit.
      const p = await preview("nova_base_spirit", `&sourceRoot=${encodeURIComponent(ADDON)}`);
      console.log(`     sourceRoot=addon, spirit lives in base: ok=${p && p.ok}`);
      rec("naming a root that lacks the spirit still fails", !(p && p.ok === true), p);
    }

    console.log("\n[the client] the simulator must say which mod it means");
    {
      const app = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8"));
      const at = app.indexOf("getOrFetchSimSpiritDetails");
      const near = at === -1 ? "" : app.slice(at, at + 1200);
      rec("the simulator's lookup is findable", at !== -1, "getOrFetchSimSpiritDetails not found");
      rec("entry-preview is called with a modPath", /entry-preview\?ideaId=[^`]*modPath=/.test(near), near.slice(0, 220));
      rec("…and so is entry-block", /entry-block\?ideaId=[^`]*modPath=/.test(near), near.slice(0, 400));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== simulator sees inherited spirits: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
