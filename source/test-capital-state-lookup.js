// #capital-state-id-is-a-blind-number — TELL THE AUTHOR WHERE THEY ARE PUTTING THEIR CAPITAL.
//
// The Create Country dialog asks for a "Starting Capital State ID" as a bare number, placeholder "e.g. 1".
// You have to already know a state id, and nothing says WHERE that is or WHO holds it. That is the same gap
// the two modders hit from the other side — the country and the map not talking to each other.
//
// It matters more than a nicety: taking an existing country's capital state breaks that country badly
// enough that HOI4 crashes when it is selected (#capital-taken-from-owner). The create endpoint already
// warns about that — AFTERWARDS, once the country exists. Knowing before is strictly better.
//
// /api/state-province already answers the question cheaply: it reads ONE state file across
// mod → dependencies → vanilla and returns { name, owner }. So the field can simply say what it points at.
//
// This test covers the endpoint's behaviour (including a root-resolution bug fixed at the same time) and
// pins the client wiring. The typing behaviour itself was verified by driving the real page:
//     1074    → "✓ Central Western Australia — currently owned by AST. Creating here TAKES it from them…"
//     999999  → "✗ State 999999 wasn't found in the mod, its dependencies, or vanilla."
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capinfo-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(opts) {
  const o = opts || {};
  const n = "CI" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n'
    + (o.deps ? 'dependencies={ "' + o.deps + '" }\n' : "")
    + (o.replaceStates ? 'replace_path="history/states"\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const stateFile = (dir, id, owner, provinces) =>
  fs.writeFileSync(path.join(dir, "history", "states", id + ".txt"),
    "state = {\n\tid = " + id + "\n\tname = \"STATE_" + id + "\"\n\tmanpower = 1000\n"
    + "\tstate_category = rural\n\thistory = {\n\t\towner = " + owner + "\n\t\tvictory_points = { "
    + provinces[0] + " 5 }\n\t}\n\tprovinces = { " + provinces.join(" ") + " }\n}\n", "utf8");

let PORT = 50270;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      look: (mod, id) => fetch("http://127.0.0.1:" + PORT + "/api/state-province?state=" + id
        + "&modPath=" + encodeURIComponent(mod)).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[the mod's own state] name and owner come back");
    {
      const mod = mkMod({});
      stateFile(mod.dir, 9001, "CIA", [11, 12]);
      const d = await api.look(mod.dir, 9001);
      rec("the lookup succeeds", d.ok === true, d);
      rec("…reporting the owner, which is what makes taking it dangerous", d.owner === "CIA", d);
      rec("…and a province to work with", Number.isInteger(d.province), d);
    }

    console.log("\n[an unowned state] the safe case reads differently");
    {
      const mod = mkMod({});
      fs.writeFileSync(path.join(mod.dir, "history", "states", "9002.txt"),
        'state = {\n\tid = 9002\n\tname = "STATE_9002"\n\tmanpower = 100\n\thistory = {\n\t}\n\tprovinces = { 21 }\n}\n', "utf8");
      const d = await api.look(mod.dir, 9002);
      rec("the lookup succeeds", d.ok === true, d);
      rec("…with no owner to take it from", !d.owner, d);
    }

    console.log("\n[a state that is not there] says so, rather than guessing");
    {
      const mod = mkMod({});
      const d = await api.look(mod.dir, 987654);
      rec("the lookup fails cleanly", d.ok === false, d);
      rec("…naming the layers it searched",
        /mod, its dependencies, or vanilla/i.test(String(d.error || "")), d.error);
    }

    console.log("\n[a base mod's state] an add-on sees it");
    {
      const base = mkMod({});
      stateFile(base.dir, 9003, "CIB", [31, 32]);
      const addon = mkMod({ deps: base.name });
      const d = await api.look(addon.dir, 9003);
      rec("the add-on resolves the base mod's state", d.ok === true, d);
      rec("…and reports its owner", d.owner === "CIB", d);
    }

    console.log("\n[replace_path on history/states] vanilla's copies stop resolving");
    if (fs.existsSync(path.join(GAME, "history", "states"))) {
      // Pick a real vanilla state — the game root is the layer getActiveRoots drops on a replace_path.
      const files = fs.readdirSync(path.join(GAME, "history", "states")).filter((f) => f.endsWith(".txt"));
      let vid = null;
      for (const f of files.slice(0, 30)) {
        const m = /(?:^|\n)\s*id\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(GAME, "history", "states", f), "latin1"));
        if (m) { vid = Number(m[1]); break; }
      }
      const plain = mkMod({});
      const before = await api.look(plain.dir, vid);
      rec("control: without replace_path a vanilla state resolves", before.ok === true, before);

      const replacing = mkMod({ replaceStates: true });
      const after = await api.look(replacing.dir, vid);
      rec("…and with it, the state the game will not load is not offered", after.ok === false, after);

      // …while the replacing mod's OWN states still resolve, or this would just be breaking the endpoint.
      stateFile(replacing.dir, 9005, "CID", [51]);
      const own = await api.look(replacing.dir, 9005);
      rec("…while the mod's own state still resolves", own.ok === true && own.owner === "CID", own);
    } else console.log("  (no HOI4 install — skipped)");

    // ✅ THAT OPEN QUESTION IS ANSWERED (2026-09-06), AND THE ANSWER WAS THE STRICTER READING.
    //
    // This block used to assert the opposite and say so: "HOI4's replace_path is documented as ignoring that
    // path from the base game AND from mods loaded earlier, which would mean an add-on replacing
    // history/states should also stop seeing its BASE MOD's states … changing the shared resolver to match
    // is a much wider behavioural change than this fix, and is recorded as a question rather than smuggled
    // in here." Correctly scoped at the time; the wider change has since been made deliberately.
    //
    // The wiki settles it in two halves. `dependencies` "changes the order in which mods will be loaded, in
    // particular forcing this mod to be loaded after every mod listed in this attribute" — so a mod ALWAYS
    // loads after what it depends on. And `replace_path` unloads "every previously-loaded file" in that
    // folder, from all sources before it, not just the base game. So the ACTIVE mod's own replace_path
    // hides its dependencies' copies exactly as it hides vanilla's.
    //
    // ⚠️ Only this direction. When a DEPENDENCY declares the replace_path and the active mod does not,
    // whether it also unloads a SIBLING dependency is launcher playset order — a user choice in no
    // descriptor — and Nova deliberately keeps the superset. See
    // test-a-mod-that-replaces-a-folder-hides-its-dependencies-too.js, which pins both directions.
    {
      const base = mkMod({});
      stateFile(base.dir, 9004, "CIC", [41, 42]);
      // CONTROL FIRST, as this bug class demands: without the replace_path the dependency's state resolves,
      // so the assertion below cannot pass merely because the endpoint is broken for add-ons.
      const plainAddon = mkMod({ deps: base.name });
      const c = await api.look(plainAddon.dir, 9004);
      rec("control: an add-on that replaces nothing sees its dependency's state", c.ok === true && c.owner === "CIC", c);

      const replacing = mkMod({ deps: base.name, replaceStates: true });
      const d = await api.look(replacing.dir, 9004);
      rec("…and the mod's OWN replace_path hides it, not just vanilla's copy", d.ok === false, d);
    }

    console.log("\n[a real vanilla state] the case the dialog actually hits");
    if (fs.existsSync(path.join(GAME, "history", "states"))) {
      const mod = mkMod({});
      const files = fs.readdirSync(path.join(GAME, "history", "states")).filter((f) => f.endsWith(".txt"));
      let id = null;
      for (const f of files.slice(0, 30)) {
        const m = /(?:^|\n)\s*id\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(GAME, "history", "states", f), "latin1"));
        if (m) { id = Number(m[1]); break; }
      }
      rec("fixture: found a real vanilla state id", Number.isInteger(id), id);
      const d = await api.look(mod.dir, id);
      rec("a fresh mod resolves vanilla's state", d.ok === true, d);
      rec("…with a readable name, not a raw loc key",
        d.name === null || !/^STATE_\d+$/i.test(String(d.name)), d.name);
    } else console.log("  (no HOI4 install — skipped)");

    console.log("\n[the field is wired to it]");
    {
      const CS = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
      const CH = fs.readFileSync(path.join(__dirname, "public", "country-setup.html"), "utf8");
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      rec("the dialog has somewhere to say it", /id="ccCapitalInfo"/.test(CH), "no feedback element");
      rec("…filled as the id is typed", /capIn\.addEventListener\("input"/.test(CS), "not wired to typing");
      rec("…debounced, so it does not fire per keystroke", /setTimeout\(look, 300\)/.test(CS), "no debounce");
      rec("…and a slow answer cannot overwrite a newer one",
        /if \(mine !== seq\) return;/.test(CS), "no request-ordering guard");
      rec("…warning when the land already belongs to someone",
        /Creating here TAKES it from them/.test(CS), "no owner warning");
      rec("the endpoint names the folder it reads",
        /getActiveRoots\(modRoot, "history\/states"\)/.test(SRV), "replace_path on history/states not honoured");
    }

    api.stop(); api = null;
    console.log(`\n=== capital state lookup: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
