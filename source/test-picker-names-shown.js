// #pickers-show-raw-tokens — THE NAME WAS ALWAYS THERE; NOBODY ASKED FOR IT, OR NOBODY DREW IT.
//
// Two surfaces, one shape.
//
// 1. THE SPIRIT PICKERS never ask for names. /api/ideas/catalog returns `localizedName` only when the request
//    carries withNames=1. Country Setup passes it (country-setup.js:957) and reads it (:977). The Focus
//    editor's "Add National Spirit" dialog, the National Spirit Editor list, and the Decisions/Events
//    spirit quick-insert do not — so `localizedName` is the empty string on every row and the label falls back
//    to the bare id. app.js:8804 even computes `friendlyName` and would print `id — name`; that branch has
//    never once been reached. Decisions and Events are worse still: they read `it.name`, a field this
//    endpoint returns under no query at all.
//    🈯 Measured: vanilla 5,998 catalogue items — 0 named plain, 4,977 with withNames=1.
//                 Millennium Dawn 10,518 — 0 plain, 10,148 with it.
//
// 2. THE DECISIONS SIDEBAR throws away a name the server already resolved for it. decisions.js:450 is
//    `item.textContent = dec.id` while `dec.name` sits on the same object.
//    🈯 Measured: vanilla 4,125 decisions, the server sends a name for 3,839; MD 4,651 and 4,581.
//    The list's own SEARCH already filters on that name (decisions.js:395, "Match the name the user can
//    actually SEE") — so you could search for a name the list never showed you.
//
// 🈯 AND THE RESOLVER HAS TO BE THE COMPLETE ONE. HOI4 nests loc references as $other_key$ ANYWHERE in a
// value and to any depth: vanilla's `invite_GER_henschel_organization` is "Invite $GER_henschel_organization$
// to", and THAT key is itself "$henschel$". A resolver that only unwraps a value which is exactly one $KEY$
// leaves the embedded form showing raw. server.js had four differently-capable copies of this rule; the
// complete one now has a name and the others call it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pnames-"));
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
const code = (f) => stripJsComments(fs.readFileSync(path.join(__dirname, "public", f), "utf8"));
const strip = (s) => String(s || "").replace(/§./g, "").replace(/\[[^\]]*\]/g, "").replace(/£\w+/g, "").trim();

let PORT = 52120;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[the catalogue] the names exist, and only withNames=1 returns them");
    {
      const base = `/api/ideas/catalog?includeVanilla=1&includeActiveMod=1&modPath=${encodeURIComponent(GAME)}`;
      const plain = await get(base);
      const named = await get(base + "&withNames=1");
      const p = (plain.items || []), n = (named.items || []);
      const pN = p.filter((i) => String(i.localizedName || "").trim()).length;
      const nN = n.filter((i) => String(i.localizedName || "").trim()).length;
      console.log(`     ${p.length} items · named without the flag: ${pN} · with it: ${nN}`);
      rec("the catalogue has plenty to name", n.length > 1000, n.length);
      rec("…and the flag is what returns the names", pN === 0 && nN > 1000, { pN, nN });
      rec("…while no item ever carries a bare `name` field", !n.some((i) => "name" in i), "an item has .name");
    }

    console.log("\n[the spirit pickers] ask for the names");
    {
      // app.js builds the query in loadIdeaCatalogForPicker; decisions.js and events.js build their own.
      rec("app.js requests withNames", /withNames/.test(code("app.js")), "loadIdeaCatalogForPicker still omits it");
      rec("decisions.js requests withNames", /withNames/.test(code("decisions.js")), "not requested");
      rec("events.js requests withNames", /withNames/.test(code("events.js")), "not requested");
      // …and READ the field the endpoint actually returns. `it.name` does not exist on a catalogue item.
      // ⚠️ Anchor on the FETCH, not on `type === "spirit"` — that string appears first in an unrelated
      // syntax-builder switch, so the window matched a block with no fetch in it at all and reported the
      // picker as unfixed.
      for (const f of ["decisions.js", "events.js"]) {
        const c = code(f);
        const at = c.indexOf("/api/ideas/catalog");
        rec(`${f}: the spirit fetch is findable`, at !== -1, "no /api/ideas/catalog call");
        const window_ = at === -1 ? "" : c.slice(at, at + 400);
        rec(`${f} reads localizedName for spirits`, /localizedName/.test(window_), window_.slice(0, 240));
        rec(`${f} no longer reads the non-existent it.name`, !/it\.name \|\| it\.ideaId/.test(window_), window_.slice(0, 240));
      }
    }

    console.log("\n[the decisions sidebar] draws the name the server already sent");
    {
      const dl = await get(`/api/decisions/list?modPath=${encodeURIComponent(GAME)}`);
      const decs = ((dl.categories || [])).flatMap((c) => c.decisions || []);
      const withName = decs.filter((d) => d.name && strip(d.name) && strip(d.name) !== d.id).length;
      console.log(`     ${decs.length} decisions · ${withName} carry a readable name`);
      rec("the server resolves names for most decisions", withName > 2000, { withName, total: decs.length });

      const c = code("decisions.js");
      // ⚠️ SCOPE TO THE RENDERER. `dec.name` also appears in the sidebar's SEARCH filter, so an unscoped
      // test passed while the list itself still drew nothing but the id — the exact contradiction this
      // finding is about (you could search for a name the list never showed you).
      // Brace-match the forEach body rather than guessing a length — it grew when the two-line card went in,
      // and a {0,900} window silently stopped matching.
      const start = c.indexOf("matchedDecisions.forEach(dec => {");
      rec("the item renderer is findable", start !== -1, "forEach(dec …) block not found");
      let r = "";
      if (start !== -1) {
        const open = c.indexOf("{", c.indexOf("=>", start));
        let d = 0, close = -1;
        for (let i = open; i < c.length; i++) {
          if (c[i] === "{") d++;
          else if (c[i] === "}") { d--; if (!d) { close = i; break; } }
        }
        r = close === -1 ? "" : c.slice(open, close + 1);
      }
      // ⚠️ RUN THE RENDERER, do not describe it. A structural check ("an `if (decName` precedes the id
      // assignment") stayed green when the name was blanked out — the shape survives, the behaviour does
      // not. Execute the forEach body against a stub document and read what it actually drew.
      const renderOne = (dec) => {
        const mk = () => {
          const el = {
            children: [], className: "", id: "", title: "", _text: "",
            get textContent() { return this._text; },
            set textContent(v) { this._text = String(v); },
            classList: { add() {}, remove() {}, toggle() {} },
            appendChild(c) { this.children.push(c); },
            addEventListener() {},
            setAttribute() {}, style: {},
          };
          return el;
        };
        const doc = { createElement: mk, getElementById: () => null, querySelectorAll: () => [] };
        const body = r.slice(1, -1); // drop the outer braces of the forEach callback
        // eslint-disable-next-line no-new-func
        // The body reaches for several of the page's module-level variables. Naming them one at a time is a
        // losing game, so give it a sandbox whose `has` trap claims to hold every identifier: anything not
        // explicitly provided reads as undefined instead of throwing ReferenceError. The click handler's own
        // captures are never evaluated — creating an arrow function does not run its body.
        const strip2 = (s) => String(s || "").replace(/§./g, "").replace(/\[[^\]]*\]/g, "").replace(/£\w+/g, "").trim();
        const provided = {
          dec, document: doc, stripLocDisplayCodes: strip2,
          itemsContainer: { appendChild() {} }, console, String, Boolean,
          __result: null,
        };
        const sandbox = new Proxy(provided, {
          has: () => true,
          get: (t, k) => (k in t ? t[k] : undefined),
          set: (t, k, v) => { t[k] = v; return true; },
        });
        vm.runInNewContext(`${body}\n; __result = item;`, sandbox);
        return provided.__result;
      };
      let named = null, unnamed = null, threw = null;
      try {
        named = renderOne({ id: "energy_building_enrichment_facilities", name: "§YConstructing§! Enrichment Facilities" });
        unnamed = renderOne({ id: "some_unlocalised_decision", name: "" });
      } catch (e) { threw = e.message; }
      rec("the renderer runs standalone", !threw, threw);
      const textOf = (el) => (el ? (el._text || el.children.map((c) => c._text).join(" | ")) : "");
      console.log(`     named   -> ${JSON.stringify(textOf(named))}`);
      console.log(`     unnamed -> ${JSON.stringify(textOf(unnamed))}`);
      rec("a named decision shows its NAME", /Constructing Enrichment Facilities/.test(textOf(named)), textOf(named));
      rec("…and still shows its id", /energy_building_enrichment_facilities/.test(textOf(named)), textOf(named));
      rec("CONTROL: an unlocalised decision falls back to the id", textOf(unnamed) === "some_unlocalised_decision", textOf(unnamed));
      rec("…and the RENDERER reads dec.name", /dec\.name/.test(r), r.slice(0, 260));
      // The id must stay visible: it is what the author types into script.
      rec("…while still showing the id", /dec\.id/.test(r), r.slice(0, 260));
    }

    console.log("\n[the resolver] embedded $alias$ chains resolve, not just whole-string ones");
    {
      // vanilla: invite_GER_henschel_organization = "Invite $GER_henschel_organization$ to"
      //          GER_henschel_organization       = "$henschel$"
      const dl = await get(`/api/decisions/list?modPath=${encodeURIComponent(GAME)}`);
      const decs = ((dl.categories || [])).flatMap((c) => c.decisions || []);
      const inv = decs.find((d) => d.id === "invite_GER_henschel_organization");
      console.log(`     invite_GER_henschel_organization => ${JSON.stringify(inv && inv.name)}`);
      rec("the chained-alias decision is present", !!inv, "not found in the catalogue");
      rec("…and no raw $token$ is left in its name", inv && !/\$[A-Za-z0-9_.]+\$/.test(String(inv.name || "")), inv && inv.name);
      // Across the whole corpus: an unresolved $…$ in a displayed name is the defect, so none should remain.
      const leftovers = decs.filter((d) => /\$[A-Za-z0-9_.]+\$/.test(String(d.name || "")));
      console.log(`     decisions still showing a raw $token$: ${leftovers.length}`);
      rec("…and none anywhere in the corpus", leftovers.length === 0, leftovers.slice(0, 3).map((d) => `${d.id} => ${d.name}`));
    }

    console.log("\n[CONTROL] a decision with no localisation still shows something usable");
    {
      const dl = await get(`/api/decisions/list?modPath=${encodeURIComponent(GAME)}`);
      const decs = ((dl.categories || [])).flatMap((c) => c.decisions || []);
      const unnamed = decs.filter((d) => !d.name || !strip(d.name));
      console.log(`     ${unnamed.length} decisions have no readable name`);
      rec("…and the client keeps an id fallback for them", /dec\.name[\s\S]{0,80}dec\.id|dec\.id[\s\S]{0,80}dec\.name/.test(code("decisions.js")), "no fallback pairing found");
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== picker names shown: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
