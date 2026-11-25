// A decision that declares the same block twice must keep BOTH — a guard, not a fix.
//
// I came at this expecting the bug I had just fixed one maker over (#event-duplicate-sub-block-dropped):
// parseDecisionsFromFile keeps every occurrence of a repeated key in `own`, but its scalar()/block()/
// hasBlock() accessors read only first(k), so the writer emits one block. The population is real —
//
//   vanilla (4,125 decisions)  visible x11, fire_only_once x6, cancel_trigger x6, ai_will_do x3,
//                              available x1, highlight_states x1, days_remove x1, remove_effect x1
//   Millennium Dawn (4,645)    ai_will_do x5, visible x3, available x1, allowed x1
//
// — and vanilla's CHI_communist_infiltration_in_gansu opens its first `visible` with Paradox's own note,
// "#TODO_WTT_CD merge the 2 visible triggers for all of these".
//
// But the decisions maker already handles it, by the other route. extractPreservedDecisionBody skips a
// managed key only the FIRST time it sees one:
//
//     const _dk = String(st.key || "").toLowerCase();
//     if (managedKeys.has(_dk) && !seen.has(_dk)) { seen.add(_dk); res.keySpelling[_dk] = st.key; continue; }
//
// (The key is lower-cased since #decision-key-case-variant — real decisions write `Cost` and `Available`,
// and a case-sensitive test did not recognise them as managed. The `!seen` clause below is unchanged and is
// still what makes a REPEATED managed key survive.)
//
// so the second and later occurrences fall through and are carried forward VERBATIM. The events preserve has
// no such guard — `if (MANAGED_EVENT_KEYS.has(st.key)) continue;` drops every occurrence — which is exactly
// why the same authoring shape lost data there and does not here.
//
// This test exists because that guard is one clause in one line, easy to "simplify" away, and nothing else
// pins it. It asserts the surviving behaviour and its back-out control removes precisely that clause.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decsub-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VDEC = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/decisions";

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
  // server.js is CRLF here, so a multi-line anchor spelled with \n matches nothing and the control would
  // pass while patching none of the code it claims to back out. Normalise, patch, restore.
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-decsub-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const FIXTURE = `zzdec_category = {

	zzdec_infiltrate = {
		icon = infiltrate_state
		visible = {
			283 = {
				is_controlled_by = ROOT
				has_any_PRC_infiltration_flag = yes
			}
		}
		available = {
			has_equipment = { infantry_equipment > 999 }
		}
		cost = 25
		days_remove = 30
		visible = {
			283 = {
				has_state_flag = discovered_infiltration
			}
		}
		available = {
			has_war = no
		}
		ai_will_do = {
			base = 100
		}
		ai_will_do = {
			modifier = {
				add = 50
				always = yes
			}
		}
		complete_effect = {
			add_political_power = -10
		}
	}
}
`;

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "decisions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  fs.writeFileSync(path.join(dir, "common", "decisions", "zzdec.txt"), FIXTURE, "utf8");
  return dir;
}

// The decision's own block, comment- and string-safe. Note: read the WHOLE block — an earlier probe of mine
// sliced a fixed 900-character window instead, missed a second `visible` that sat past it, and reported a
// data loss that was not happening. #measure-the-whole-block
function decisionBlock(text, id) {
  const re = new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`);
  const m = re.exec(text);
  if (!m) return "";
  const open = text.indexOf("{", m.index);
  let d = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === '"') { i++; while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; } continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return text.slice(m.index, i + 1); }
  }
  return "";
}
const countOf = (t, re) => (t.replace(/#[^\n]*/g, "").match(re) || []).length;

let PORT = 44240;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// List every decision and hand each straight back unchanged. `categoryId` is the parameter name the save
// endpoint wants (not `category`), and echoing the listed `fileName` back makes it refuse.
async function roundTrip(api, mod) {
  const listed = await api.get(`/api/decisions/list?modPath=${encodeURIComponent(mod)}`);
  const cats = (listed.b && listed.b.categories) || [];
  let n = 0;
  const errors = [];
  for (const c of cats) {
    for (const d of (c.decisions || [])) {
      const r = await api.post("/api/decisions/save",
        { modPath: mod, categoryId: c.id, ...d, fileName: undefined, previousId: d.id });
      n++;
      if (r.s !== 200 || r.b.error) errors.push(`${d.id}: ${r.b.error || r.s}`);
    }
  }
  return { n, errors };
}

(async () => {
  const api = await serve(createApp());
  try {
    console.log("\n[ground truth] vanilla declares a decision's `visible` twice, and says so in a comment");
    const chi = path.join(VDEC, "CHI_decisions.txt");
    if (!fs.existsSync(chi)) console.log("  (skipped — vanilla not installed)");
    else {
      const gansu = decisionBlock(fs.readFileSync(chi, "utf8"), "CHI_communist_infiltration_in_gansu");
      rec("CHI_communist_infiltration_in_gansu has two `visible` blocks",
        countOf(gansu, /\bvisible\s*=/g) === 2, countOf(gansu, /\bvisible\s*=/g));
      rec("…and Paradox's own note says to merge them",
        /merge the 2 visible triggers/.test(gansu), "comment not found");
      rec("…the two gate on different things",
        /has_any_PRC_infiltration_flag/.test(gansu) && /discovered_infiltration/.test(gansu), gansu.slice(0, 300));
    }

    console.log("\n[the guard] a no-edit save keeps every repeated block");
    const mod = mkMod("m");
    const rt = await roundTrip(api, mod);
    rec("the decision saved cleanly", rt.n === 1 && rt.errors.length === 0, rt.errors);

    const p = path.join(mod, "common", "decisions", "zzdec.txt");
    const after = decisionBlock(fs.readFileSync(p, "utf8"), "zzdec_infiltrate");
    rec("both `visible` gates survive",
      /has_any_PRC_infiltration_flag/.test(after) && /discovered_infiltration/.test(after), after);
    rec("both `available` conditions survive",
      /infantry_equipment > 999/.test(after) && /has_war\s*=\s*no/.test(after), after);
    rec("both `ai_will_do` halves survive",
      /base\s*=\s*100/.test(after) && /add\s*=\s*50/.test(after), after);
    rec("the unrelated fields are untouched",
      /cost\s*=\s*25/.test(after) && /days_remove\s*=\s*30/.test(after) && /add_political_power\s*=\s*-10/.test(after), after);
    rec("the block is brace-balanced", countOf(after, /\{/g) === countOf(after, /\}/g), after);

    console.log("\n[idempotence] a second no-edit round trip changes nothing further");
    const before2 = fs.readFileSync(p, "utf8");
    await roundTrip(api, mod);
    rec("byte-identical on the second pass", fs.readFileSync(p, "utf8") === before2, "changed again");
    api.stop();

    console.log("\n[back-out] drop the `!seen.has` clause so a managed key is skipped every time");
    {
      const built = controlApp("noseen", [[
        "    if (managedKeys.has(_dk) && !seen.has(_dk)) { seen.add(_dk); res.keySpelling[_dk] = st.key; continue; }",
        "    if (managedKeys.has(_dk)) { seen.add(_dk); res.keySpelling[_dk] = st.key; continue; }"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          await roundTrip(capi, cmod);
          const c = decisionBlock(fs.readFileSync(path.join(cmod, "common", "decisions", "zzdec.txt"), "utf8"), "zzdec_infiltrate");
          rec("…and the second `visible` gate is deleted", !/discovered_infiltration/.test(c), c);
          rec("…and the second `available` condition is deleted", !/has_war\s*=\s*no/.test(c), c);
          rec("…and the second `ai_will_do` half is deleted", !/add\s*=\s*50/.test(c), c);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== decision duplicate sub-block: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p2 of ctlFiles) { try { fs.unlinkSync(p2); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
