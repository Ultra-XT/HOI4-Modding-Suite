// #trait-picker-shows-raw-tokens — 2,445 TRAITS LISTED BY SCRIPT TOKEN, AND THE SEARCH MATCHED ONLY TOKENS.
//
// Country Setup → a character → Browse beside Traits opens a monospace grid of chips reading
// `AFG_ascendancy_sovreign`, `arctic_water_expert`. /api/characters/traits never touches localisation, so the
// token is all the page ever receives. Typing "Cold Water" returns nothing, though `arctic_water_expert` is
// "Cold Water Expert" — the grid caps at 300 chips, so the dead search is the real harm, not the wall of ids.
//
// 🈯 Measured: Millennium Dawn 2,445 leader/advisor traits of which 2,411 are localised, and 205 commander
// traits of which 198 are. Vanilla 2,093 / 2,081 and 194 / 193.
//
// ⚠️⚠️ THE TRAP THAT MAKES THIS DIFFERENT FROM THE OTHER PICKERS: here the label field IS the write field.
// The chip's click handler calls appendTrait(target, i.name), and appendTrait pushes that string straight
// into the traits textarea, which serialises to `traits = { … }` in the character file. Swap i.name for the
// localised name and Nova writes
//     traits = { Cold Water Expert }
// which HOI4 rejects. The membership test that puts a ✓ on an already-chosen trait reads the same textarea,
// so it has to compare tokens too. So `name` stays the TOKEN and a separate `label` carries the display
// string — the picker shows one and writes the other.
//
// (The battalion, module and ideology pickers already keep the two apart via data-key / data-mod / data-type.)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-traitname-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const CJS = () => stripJsComments(fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8"));

let PORT = 52270;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const traits = (root) => fetch(`http://127.0.0.1:${PORT}/api/characters/traits?modPath=${encodeURIComponent(root)}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[the endpoint] hands over a display name as well as the token");
    const d = await traits(GAME);
    {
      const leader = d.leader || [], unit = d.unit || [];
      console.log(`     ${leader.length} leader/advisor traits · ${unit.length} commander traits`);
      rec("there are traits to name", leader.length > 1000 && unit.length > 100, { leader: leader.length, unit: unit.length });

      // ⚠️ THE TOKEN LISTS KEEP THEIR SHAPE. `leader` is an array of STRINGS and four other tests read it
      // that way — correctly, since it is a list of tokens. Display strings ride alongside in `labels`, so
      // nothing that consumes the token lists had to change. `unit` entries were already objects, so a
      // `label` field there is additive.
      const labels = d.labels || {};
      rec("leader is still an array of tokens", leader.every((x) => typeof x === "string"), leader.slice(0, 2));
      const lNamed = leader.filter((t) => labels[t] && labels[t] !== t).length;
      const uNamed = unit.filter((u) => (u.label || labels[u.name]) && (u.label || labels[u.name]) !== u.name).length;
      console.log(`     with a label: ${lNamed} leader · ${uNamed} commander`);
      rec("leader traits carry a label", lNamed > 1000, lNamed);
      rec("commander traits carry a label too", uNamed > 100, uNamed);

      const tok = leader.includes("arctic_water_expert") ? "arctic_water_expert" : leader[0];
      console.log(`     e.g. ${tok} => ${JSON.stringify(labels[tok])}`);
      rec("…and the token is still a plain token", /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(tok)), tok);
      rec("…and the label is a real name, not the token de-underscored",
        lNamed > 1000 && leader.some((t) => labels[t] && /\s/.test(labels[t]) && !labels[t].includes("_")), "labels look synthesised");

      // Commander traits keep their type — the picker filters on it.
      rec("commander traits keep their `type`", unit.every((u) => typeof u.type === "string" && u.type), unit.slice(0, 2));
    }

    console.log("\n[the picker] shows the label, writes the TOKEN");
    {
      const c = CJS();
      rec("the picker reads a label", /\blabel\b/.test(c), "characters.js never reads a label");
      // ⚠️ THE TRAP. appendTrait's argument, and the ✓ membership test, must both stay on the token.
      rec("the click still writes i.name (the token)", /appendTrait\(_traitPickerTarget, i\.name\)/.test(c), "the write path now sends something else");
      rec("…and the ✓ test still compares tokens", /cur\.has\(i\.name\)/.test(c), "membership no longer compares tokens");
      // The search must match what the user can SEE as well as what is written.
      // Anchor on the FILTER, not on `const q = …` — that statement ends at its own semicolon, so a window
      // from there caught the declaration and never reached the line that does the matching.
      const searchLine = /let list = q \? items\.filter\([\s\S]{0,300}?: items;/.exec(c);
      rec("the search is findable", !!searchLine, "items.filter(...) not found");
      rec("…and it matches the label, not only the token",
        searchLine && /i\.label/.test(searchLine[0]) && /i\.name/.test(searchLine[0]), searchLine && searchLine[0].slice(0, 240));
    }

    console.log("\n[drive it] a real row renders the name and still writes the token");
    {
      const c = CJS();
      // Pull the chip-building loop out and run it against a stubbed grid.
      const start = c.indexOf("list.forEach((i) => {");
      rec("the chip loop is findable", start !== -1, "list.forEach((i) …) not found");
      if (start !== -1) {
        const open = c.indexOf("{", c.indexOf("=>", start));
        let dd = 0, close = -1;
        for (let i = open; i < c.length; i++) {
          if (c[i] === "{") dd++;
          else if (c[i] === "}") { dd--; if (!dd) { close = i; break; } }
        }
        const body = c.slice(open + 1, close);
        const made = [];
        const written = [];
        const mkEl = () => ({
          type: "", style: { cssText: "" }, _html: "", children: [],
          set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
          set textContent(v) { this._html = String(v); }, get textContent() { return this._html; },
          addEventListener(n, fn) { if (n === "click") this._click = fn; },
          appendChild(x) { this.children.push(x); },
        });
        const provided = {
          i: { name: "arctic_water_expert", label: "Cold Water Expert", tag: "" },
          cur: new Set(),
          grid: { appendChild: (el) => made.push(el) },
          document: { createElement: () => mkEl() },
          esc: (s) => String(s == null ? "" : s),
          stripLocDisplayCodes: (s) => String(s || "").replace(/§./g, "").replace(/\[[^\]]*\]/g, "").trim(),
          appendTrait: (t, v) => written.push(v),
          _traitPickerTarget: "charTraits",
          render: () => {},
          console, String, Set, Boolean,
        };
        const sandbox = new Proxy(provided, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
        let threw = null;
        try { vm.runInNewContext(body, sandbox); } catch (e) { threw = e.message; }
        rec("the chip renders standalone", !threw, threw);
        const chip = made[0];
        const shown = chip ? chip.innerHTML : "";
        console.log(`     chip shows: ${JSON.stringify(String(shown).slice(0, 120))}`);
        rec("the chip shows the NAME", /Cold Water Expert/.test(shown), shown);
        rec("…and still shows the token", /arctic_water_expert/.test(shown), shown);
        if (chip && chip._click) chip._click();
        console.log(`     clicking wrote: ${JSON.stringify(written)}`);
        rec("⚠ clicking writes the TOKEN, never the label", written.length === 1 && written[0] === "arctic_water_expert", written);
      }
    }

    console.log("\n[BOTH POOLS] the loader itself runs — this is where a ReferenceError hid");
    {
      // ⚠️ THE GAP THAT LET A HARD BREAK SHIP. The chip test below drives the RENDER loop with a supplied
      // item, so it never executes the branch that builds `items`. `const labels` was first written inside
      // `if (isUnit)`, so the else branch referenced a block-scoped const and the LEADER picker threw
      // ReferenceError the instant it opened — while the commander picker worked, which is what made it look
      // fine. Run the branch itself, for both pools.
      const c = CJS();
      const at = c.indexOf("const data = await loadTraitPool();");
      rec("the pool branch is findable", at !== -1, "loadTraitPool call not found");
      if (at !== -1) {
        const end = c.indexOf("const render = ()", at);
        const body = c.slice(at + "const data = await loadTraitPool();".length, end);
        // ⚠️ FEED IT WHAT loadTraitPool ACTUALLY HANDS OVER, not the raw endpoint reply. That function
        // rebuilds the object field by field and CACHES it, and it originally dropped `labels` — so injecting
        // the endpoint response here made the labels look present when the real picker saw none. Run the
        // shipped loadTraitPool against the live endpoint and use its return value.
        const poolSrc = (() => {
          const s = c.indexOf("async function loadTraitPool()");
          if (s === -1) return "";
          const o = c.indexOf("{", s);
          let dd = 0, e = -1;
          for (let k = o; k < c.length; k++) { if (c[k] === "{") dd++; else if (c[k] === "}") { dd--; if (!dd) { e = k; break; } } }
          return e === -1 ? "" : c.slice(s, e + 1);
        })();
        rec("loadTraitPool is findable", !!poolSrc, "not found");
        let pooled = null;
        if (poolSrc) {
          const box = {
            // ⚠️ encodeURIComponent must be provided explicitly. The Proxy below answers `has` for every
            // name, so an unsupplied global reads as undefined rather than raising ReferenceError — calling
            // it then throws INSIDE loadTraitPool's own try/catch, which silently returns the empty fallback
            // and looks exactly like "the endpoint gave nothing".
            _traitPool: null, console, JSON, String, Object, Promise, encodeURIComponent,
            modPath: () => GAME,
            fetch: (u) => fetch(`http://127.0.0.1:${PORT}` + String(u).replace(/^[^/]*/, "")),
          };
          const sb = new Proxy(box, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
          vm.runInNewContext(poolSrc + "\n; __p = loadTraitPool();", sb);
          pooled = await box.__p;
          console.log(`     loadTraitPool returned keys: ${JSON.stringify(Object.keys(pooled || {}))}`);
          rec("…and it keeps the labels map", pooled && pooled.labels && Object.keys(pooled.labels).length > 100,
            pooled && Object.keys(pooled.labels || {}).length);
        }
        const run = (isUnit) => {
          const provided = {
            data: pooled || d, isUnit,
            $: (id) => (id === "generalType" ? { value: "corps_commander" } : null),
            stripLocDisplayCodes: (s) => String(s || "").replace(/§./g, "").replace(/\[[^\]]*\]/g, "").trim(),
            items: undefined, console, String, Boolean, Array, Object,
          };
          const sandbox = new Proxy(provided, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
          // The slice already contains the page's own `let items;` — declaring a second one is a SyntaxError.
          vm.runInNewContext(body + "\n; __items = items;", sandbox);
          return provided.__items;
        };
        for (const [poolName, isUnit] of [["leader/advisor", false], ["commander", true]]) {
          let out = null, threw = null;
          try { out = run(isUnit); } catch (e) { threw = e.message; }
          console.log(`     ${poolName}: ${threw ? "THREW " + threw : (out || []).length + " items, first " + JSON.stringify((out || [])[0])}`);
          rec(`the ${poolName} pool builds without throwing`, !threw, threw);
          rec(`…and yields items`, Array.isArray(out) && out.length > 50, out ? out.length : threw);
          rec(`…each carrying a token in .name`, Array.isArray(out) && out.every((x) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(x.name))), (out || []).slice(0, 2));
          const named = (out || []).filter((x) => x.label && x.label !== x.name).length;
          rec(`…and most carrying a label`, named > 50, named);
        }
      }
    }

    console.log("\n[CONTROL] a trait with no localisation still shows its token");
    {
      const d2 = await traits(GAME);
      const asObj = (x) => (typeof x === "string" ? { name: x } : x);
      const unlabelled = (d2.leader || []).map(asObj).filter((t) => !t.label);
      console.log(`     ${unlabelled.length} leader traits have no localisation`);
      rec("some genuinely have none, so the fallback matters", unlabelled.length > 0, unlabelled.length);
      const c = CJS();
      rec("…and the picker falls back to the token", /label[\s\S]{0,60}\|\|[\s\S]{0,20}name|name[\s\S]{0,60}\|\|[\s\S]{0,20}label/.test(c), "no fallback pairing");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== trait picker names: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
