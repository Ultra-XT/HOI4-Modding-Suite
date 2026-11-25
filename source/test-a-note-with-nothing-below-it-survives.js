// ⛔ Two ways a note with no statement under it was deleted by a save that changed nothing.
//
// #event-tail-comment-block-dropped — a comment block written after the LAST OPTION, at the end of the event
// body. Every comment the preserve reader keeps is attached to the statement BELOW it, so a block with
// nothing below has nothing to attach to. The option reader already solved this one level down
// (#event-option-comment-with-nothing-to-lead) and pdxTrailingCommentBlock is its helper — the event body
// never called it. 94 events across the install and every installed mod end this way, 1,118 lines of them;
// 17 events and 173 lines in VANILLA. It is TODO notes and parked options — `#TODO_TA add Rally behind the
// King option`, `#OPTION TO CREATE A WARGOAL ON BUL` — the content a modder notices missing.
//
// #option-detached-comment-dropped — a note inside an OPTION separated from its effect by a blank line.
// leadComment stops at the blank, so only the note touching the statement was carried. `detachedComment` has
// held exactly that block all along, captured for #free-floating-comment-dropped which fixed the same shape
// at event level; this reader never read the field. 348 notes across the corpora, 59 in vanilla.
//
// ⭐ Both are the same shape as half the bugs on this project: THE CAPABILITY WAS ALREADY THERE AND ONE
// CALLER NEVER REACHED IT.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53552;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evtail-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};
const show = (t) => String(t).slice(0, 320).replace(/\n/g, "|");
const commentTexts = (t) => String(t).replace(/\r/g, "").split("\n")
  .map((l) => { const h = l.indexOf("#"); return h < 0 ? null : ((l.slice(0, h).match(/"/g) || []).length % 2 === 1 ? null : l.slice(h).trim().replace(/\s+/g, " ")); })
  .filter(Boolean);
const lossOf = (was, now) => {
  const left = now.slice(), lost = [];
  for (const x of was) { const i = left.indexOf(x); if (i >= 0) left.splice(i, 1); else lost.push(x); }
  return lost;
};

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const roundTrip = async (text) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evtail-mod-"));
      made.push(mod);
      const dest = path.join(mod, "events", "probe.txt");
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ev Tail"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/events/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const errors = [];
      for (const evt of list.events || []) {
        const dot = String(evt.fullId || "").lastIndexOf(".");
        const res = await fetch(`${BASE}/api/events/save`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: mod,
            namespace: dot > 0 ? evt.fullId.slice(0, dot) : evt.fullId,
            id: dot > 0 ? evt.fullId.slice(dot + 1) : "",
            type: evt.type || "country_event",
            title: (evt.title || "").trim(), description: (evt.description || "").trim(),
            picture: (evt.picture || "").trim(),
            triggeredOnly: evt.triggeredOnly === "yes" ? "yes" : "no",
            hidden: evt.hidden === "yes" ? "yes" : "no",
            fireOnce: evt.fireOnce === "yes" ? "yes" : "no",
            major: evt.major === "yes" ? "yes" : "no",
            mtthDays: parseInt(evt.mtthDays, 10) || 0,
            trigger: evt.trigger || "", immediate: evt.immediate || "", after: evt.after || "",
            timeoutDays: parseInt(evt.timeoutDays, 10) || 0,
            options: (evt.options || []).map((o) => ({
              name: String(o.name || "").trim(), title: String(o.title || "").trim(),
              script: String(o.script || "").trim(), aiChance: null, trigger: String(o.trigger || "").trim(),
            })),
          }),
        }).then((r) => r.json());
        if (res && res.error) errors.push(String(res.error).slice(0, 80));
      }
      return { after: fs.readFileSync(dest, "utf8"), errors, events: list.events || [] };
    };

    console.log("1. A block written after the last option — a parked option and a TODO");
    {
      const TAIL = `add_namespace = tailns

country_event = {
\tid = tailns.1
\ttitle = tailns.1.t
\tis_triggered_only = yes

\toption = {
\t\tname = tailns.1.a
\t\tadd_political_power = 5
\t}
\t#option = {
\t#\tname = tailns.1.b
\t#\tcountry_event = tailns.2
\t#}
\t#TODO add the rally option once the focus lands
}
`;
      const { after, errors } = await roundTrip(TAIL);
      rec("the save was accepted", errors.length === 0, errors[0]);
      for (const note of ["#option = {", "#\tname = tailns.1.b", "#\tcountry_event = tailns.2", "#}", "#TODO add the rally option once the focus lands"]) {
        rec(`⭐ ${JSON.stringify(note)} survives`, after.includes(note.replace(/\t/g, "\t")), show(after));
      }
      rec("⭐ not one comment in the event is lost", lossOf(commentTexts(TAIL), commentTexts(after)).length === 0,
        lossOf(commentTexts(TAIL), commentTexts(after)).join(" · "));
      rec("…and the block is still brace-balanced as script",
        (() => { let d = 0, q = false; for (let i = 0; i < after.length; i++) { const c = after[i]; if (c === '"') { q = !q; continue; } if (q) continue; if (c === "#") { while (i < after.length && after[i] !== "\n") i++; continue; } if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save does not multiply them",
        (twice.match(/#TODO add the rally option/g) || []).length === 1
        && (twice.match(/#option = \{/g) || []).length === 1, show(twice));
    }

    console.log("\n2. …and a note inside an option, a blank line above its effect");
    {
      const DET = `add_namespace = tailns

country_event = {
\tid = tailns.2
\ttitle = tailns.2.t
\tis_triggered_only = yes

\toption = {
\t\tname = tailns.2.a
\t\t#Ballistic

\t\t#Cruise

\t\t#AA and ABM

\t\t#OLV
\t\tset_variable = { missile_inventory = 10 }
\t}
}
`;
      const { after, errors } = await roundTrip(DET);
      rec("the save was accepted", errors.length === 0, errors[0]);
      for (const note of ["#Ballistic", "#Cruise", "#AA and ABM", "#OLV"]) {
        rec(`⭐ ${note} survives`, after.includes(note), show(after));
      }
      // ⭐ Position, not just presence. The one TOUCHING the statement is its caption; the three above the
      // gaps are not, and coming back attached would make them say something the author did not.
      rec("⭐ …and #OLV is still the one touching the effect",
        /#OLV\s*\n\s*set_variable/.test(after), show(after));
      rec("⭐ …and the three above it are still separated by blank lines",
        /#Ballistic\s*\n\s*\n\s*#Cruise\s*\n\s*\n\s*#AA and ABM/.test(after), show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save does not multiply them",
        (twice.match(/#Ballistic/g) || []).length === 1 && (twice.match(/#OLV/g) || []).length === 1, show(twice));
    }

    console.log("\n3. …and an option with no notes still gains none  (over-correction control)");
    {
      const PLAIN = `add_namespace = tailns

country_event = {
\tid = tailns.3
\ttitle = tailns.3.t
\tis_triggered_only = yes

\toption = {
\t\tname = tailns.3.a
\t\tadd_political_power = 5
\t}
}
`;
      const { after, errors } = await roundTrip(PLAIN);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ no comment is invented", commentTexts(after).length === 0, commentTexts(after));
    }

    console.log("\n4. Measured on real installed events files that carry each shape");
    // ⚠️ MOVED 2026-09-15. This section read one workshop file (2976702549/events/Easybuff.txt, the mod file that once lost seven
    // notes), and the installed copy no longer carries the detached note it asserted, so "the fixture HAS property 2" failed on
    // every commit. The measurement is now asked of the installed events files that carry each shape — the base game first, then
    // the workshop folder (never Road to 56's copy, which a Nova session once wrote into) — and every comment in each must survive.
    {
      const GAME_EVENTS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const dirs = [GAME_EVENTS].concat(fs.existsSync(WS) ? fs.readdirSync(WS).filter((d) => d !== "820260968").sort().map((d) => path.join(WS, d, "events")) : [])
        .filter((d) => fs.existsSync(d));
      const endsInCommentBlock = (t) => /#\}[ \t]*\n\}/.test(t);
      // A comment line inside an option block, a blank line under it, and more of the option below — braces counted outside comments.
      const detachedNoteInOption = (t) => {
        const lines = t.split("\n");
        let depth = 0;
        const opened = [];
        for (let i = 0; i < lines.length; i++) {
          const hash = lines[i].indexOf("#");
          const code = hash < 0 ? lines[i] : lines[i].slice(0, hash);
          const trimmed = lines[i].trim();
          if (opened.length && trimmed.startsWith("#") && i + 2 < lines.length && lines[i + 1].trim() === ""
            && lines[i + 2].trim() !== "" && !lines[i + 2].trim().startsWith("}")) return true;
          if (/(?:^|[^A-Za-z0-9_])option\s*=\s*\{/.test(code)) opened.push(depth);
          for (const ch of code) {
            if (ch === "{") depth++;
            else if (ch === "}") { depth--; if (opened.length && depth === opened[opened.length - 1]) opened.pop(); }
          }
        }
        return false;
      };
      const pick = { tail: null, detached: null };
      for (const d of dirs) {
        for (const f of fs.readdirSync(d).filter((x) => x.toLowerCase().endsWith(".txt")).sort()) {
          if (pick.tail && pick.detached) break;
          let t = "";
          try { t = fs.readFileSync(path.join(d, f), "utf8").replace(/\r/g, ""); } catch (_) { continue; }
          if (!pick.tail && endsInCommentBlock(t)) pick.tail = path.join(d, f);
          if (!pick.detached && detachedNoteInOption(t)) pick.detached = path.join(d, f);
        }
        if (pick.tail && pick.detached) break;
      }
      rec("an installed events file carries property 1: an event body ending in a comment block", !!pick.tail, pick.tail || "none found");
      rec("an installed events file carries property 2: a detached note inside an option", !!pick.detached, pick.detached || "none found");
      for (const file of [...new Set([pick.tail, pick.detached].filter(Boolean))]) {
        const original = fs.readFileSync(file, "utf8");
        const { after, errors } = await roundTrip(original);
        const label = path.basename(path.dirname(path.dirname(file))) + "/" + path.basename(file);
        rec(`every event in ${label} saved without error`, errors.length === 0, errors[0]);
        const lost = lossOf(commentTexts(original), commentTexts(after));
        rec(`⭐ not one of ${label}'s comments is lost`, lost.length === 0, `${lost.length}: ` + lost.slice(0, 6).join(" · "));
      }
    }

    console.log(`\n=== a note with nothing below it survives: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
