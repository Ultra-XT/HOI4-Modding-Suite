#!/usr/bin/env node
// Token meter — where a Claude Code session's tokens go, measured from the session's own log.
// A dev tool for working ON Nova; it is not part of the app (build.files never lists scripts/).
//
//   node scripts/token-meter.js                         newest session of this project, all of it
//   node scripts/token-meter.js --since 2026-09-26      only API calls from that day on (before/after comparisons)
//   node scripts/token-meter.js <session.jsonl> [--since …] [--no-subagents]
//
// Why it exists (measured 2026-09-26 over 30,007 calls): in one long session, 86% of the main thread's cost was
// re-reading the conversation on every call — a median 543k tokens, because the 1M window only summarised at ~967k.
// Costs are weighted with Anthropic's standard price ratios relative to fresh input: cache write 1.25, cache read 0.1,
// output 5. Tool-result and "what I wrote" sizes are estimated from characters (÷3.6); totals come from the log's usage.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const W = { in: 1, write: 1.25, read: 0.1, out: 5 };
const tok = (chars) => Math.round(chars / 3.6);
const IMG_TOK = 1500;
const fmt = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "k" : String(Math.round(n)));
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(1) : "0.0").padStart(5) + "%";

function parseArgs(argv) {
  const o = { file: "", since: "", subagents: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--since") o.since = argv[++i] || "";
    else if (argv[i] === "--no-subagents") o.subagents = false;
    else if (!o.file) o.file = argv[i];
  }
  if (!o.file) {
    const dir = path.join(os.homedir(), ".claude", "projects", path.resolve(__dirname, "..").replace(/[:\\/]/g, "-"));
    const logs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f)) : [];
    logs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    o.file = logs[0] || "";
  }
  return o;
}

function sizeOf(content) {
  if (typeof content === "string") return { chars: content.length, images: 0 };
  let chars = 0, images = 0;
  for (const c of content || []) {
    if (!c) continue;
    if (c.type === "text") chars += (c.text || "").length;
    else if (c.type === "image") images++;
    else chars += JSON.stringify(c).length;
  }
  return { chars, images };
}

function categorise(name, input) {
  input = input || {};
  if (name === "Read") {
    const f = String(input.file_path || "").replace(/\\/g, "/"), b = path.basename(f);
    if (b === "server.js" || b === "map-data.js") return "Read " + b;
    if (/\/memory\//i.test(f)) return "Read memory note";
    if (/\.(png|jpe?g|webp|bmp)$/i.test(f)) return "Read image";
    if (/tool-results|\.output$|scratchpad/i.test(f)) return "Read saved tool/agent output";
    if (/^(test|e2e)-/.test(b)) return "Read a test file";
    if (/\/public\//.test(f)) return "Read public/*";
    return "Read other";
  }
  if (name === "Bash" || name === "PowerShell") {
    const c = String(input.command || "");
    if (/run-tests\.js|npm test/.test(c)) return "Bash: full test suite";
    if (/run-e2e/.test(c)) return "Bash: e2e suite";
    if (/bo\.js/.test(c)) return "Bash: back-out controls";
    if (/node\s+(\S*\/)?(test|e2e)-[\w-]+\.js/.test(c)) return "Bash: single test file(s)";
    if (/sed -n|head -|tail -|cat /.test(c) && /server\.js|map-data\.js/.test(c)) return "Bash: slice of server.js/map-data.js";
    if (/\brg\b|\bgrep\b/.test(c)) return "Bash: search";
    if (/\bgit\b/.test(c)) return "Bash: git";
    if (/\bnode\b/.test(c)) return "Bash: node script/probe";
    return name + ": other";
  }
  if (name === "Grep") return /server\.js|map-data\.js/.test(String(input.path || "")) ? "Grep in server.js/map-data.js" : "Grep";
  if (/^mcp__Claude_Browser__|^mcp__claude-in-chrome__/.test(name)) return "Browser: " + name.replace(/^.*__/, "");
  if (/^mcp__computer-use__/.test(name)) return "Computer use";
  return name;
}

async function scanMain(file) {
  const seen = new Set(), toolById = new Map(), idToCall = new Map();
  const calls = [], results = [], reminders = [], mine = [];
  let seg = 0, compactions = 0, callIdx = -1;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch (_) { continue; }
    if (e.isSidechain) continue;
    if (e.type === "system" && e.subtype === "compact_boundary") { seg++; compactions++; continue; }
    if (e.type === "assistant" && e.message) {
      const m = e.message, id = m.id || e.requestId;
      for (const c of m.content || []) {
        if (!c) continue;
        if (c.type === "tool_use") {
          toolById.set(c.id, { name: c.name, input: c.input });
          const k = c.name === "Write" || c.name === "Edit" ? c.name + " input (file text written)" : c.name === "Workflow" || c.name === "Agent" ? "agent/workflow prompts" : "other tool-call input";
          mine.push({ kind: k, chars: JSON.stringify(c.input || {}).length, id });
        } else if (c.type === "text") mine.push({ kind: "reply text", chars: (c.text || "").length, id });
        else if (c.type === "thinking" || c.type === "redacted_thinking") mine.push({ kind: "thinking", chars: (c.thinking || c.data || "").length + (c.signature || "").length, id });
      }
      if (id && !seen.has(id) && m.usage) {
        seen.add(id);
        const u = m.usage;
        const r = { in: u.input_tokens || 0, write: u.cache_creation_input_tokens || 0, read: u.cache_read_input_tokens || 0, out: u.output_tokens || 0 };
        r.ctx = r.in + r.write + r.read; r.seg = seg; r.day = String(e.timestamp || "").slice(0, 10);
        calls.push(r); callIdx = calls.length - 1; idToCall.set(id, callIdx);
      }
      continue;
    }
    if (e.type === "user" && e.message && Array.isArray(e.message.content)) {
      for (const c of e.message.content) {
        if (!c) continue;
        if (c.type === "tool_result") {
          const t = toolById.get(c.tool_use_id) || { name: "?" };
          const s = sizeOf(c.content);
          results.push({ cat: categorise(t.name, t.input), chars: s.chars, images: s.images, callIdx });
        } else if (c.type === "text" && /<system-reminder>/.test(c.text || "")) reminders.push({ chars: c.text.length, callIdx });
      }
    } else if (e.type === "attachment" || (e.type === "user" && e.isMeta)) {
      reminders.push({ chars: JSON.stringify(e.attachment || e.message || "").length, callIdx });
    }
  }
  for (const x of mine) x.callIdx = idToCall.has(x.id) ? idToCall.get(x.id) : -1;
  return { calls, results, reminders, mine, compactions };
}

async function scanSubagents(dir, since) {
  const groups = new Map();
  if (!dir || !fs.existsSync(dir)) return groups;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((n) => (n.isDirectory() ? walk(path.join(d, n.name)) : n.name.endsWith(".jsonl") ? [path.join(d, n.name)] : []));
  for (const f of walk(dir)) {
    const rel = path.relative(dir, f).replace(/\\/g, "/");
    const key = rel.startsWith("workflows/") ? rel.split("/")[1] : "Agent tool";
    const g = groups.get(key) || { agents: 0, calls: 0, in: 0, write: 0, read: 0, out: 0, first: "" };
    g.agents++;
    const seen = new Set();
    const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line || line.indexOf('"usage"') < 0) continue;
      let e; try { e = JSON.parse(line); } catch (_) { continue; }
      const m = e.message; if (!m || !m.usage) continue;
      if (since && String(e.timestamp || "").slice(0, 10) < since) continue;
      const id = m.id || e.requestId; if (id && seen.has(id)) continue; if (id) seen.add(id);
      const u = m.usage;
      g.calls++; g.in += u.input_tokens || 0; g.write += u.cache_creation_input_tokens || 0; g.read += u.cache_read_input_tokens || 0; g.out += u.output_tokens || 0;
      if (!g.first && e.timestamp) g.first = String(e.timestamp).slice(0, 10);
    }
    if (g.calls) groups.set(key, g); else if (groups.has(key)) groups.set(key, g);
  }
  return groups;
}

(async () => {
  const o = parseArgs(process.argv.slice(2));
  if (!o.file || !fs.existsSync(o.file)) { console.error("no session log found; pass one: node scripts/token-meter.js <session.jsonl>"); process.exit(1); }
  const { calls, results, reminders, mine, compactions } = await scanMain(o.file);
  // calls remaining after each call in the same summary segment: how long something written then is re-read
  const remaining = new Array(calls.length).fill(0);
  for (let i = calls.length - 2; i >= 0; i--) remaining[i] = calls[i + 1].seg === calls[i].seg ? remaining[i + 1] + 1 : 0;
  const inWindow = (i) => i >= 0 && i < calls.length && (!o.since || calls[i].day >= o.since);
  const sel = calls.filter((c, i) => inWindow(i));
  if (!sel.length) { console.log(`no API calls ${o.since ? "since " + o.since : ""} in ${o.file}`); process.exit(0); }
  const tot = sel.reduce((t, c) => ({ in: t.in + c.in, write: t.write + c.write, read: t.read + c.read, out: t.out + c.out }), { in: 0, write: 0, read: 0, out: 0 });
  const wt = tot.in * W.in + tot.write * W.write + tot.read * W.read + tot.out * W.out;
  const segsIn = new Set(sel.map((c) => c.seg));
  console.log(`${path.basename(o.file)}${o.since ? "  since " + o.since : ""}`);
  console.log(`MAIN THREAD: ${sel.length.toLocaleString()} API calls, ${Math.max(0, segsIn.size - 1)} summaries in range (${compactions} in the whole log)`);
  console.log(`  cost-weighted ${fmt(wt)}: fresh input ${pct(tot.in * W.in, wt)} · cache writes ${pct(tot.write * W.write, wt)} · cache READS ${pct(tot.read * W.read, wt)} · output ${pct(tot.out * W.out, wt)}`);
  const ctx = sel.map((c) => c.ctx).sort((a, b) => a - b), q = (p) => ctx[Math.min(ctx.length - 1, Math.floor(p * ctx.length))];
  console.log(`  context re-read per call: median ${fmt(q(0.5))}, p90 ${fmt(q(0.9))}, max ${fmt(ctx[ctx.length - 1])}`);
  const segMin = new Map();
  for (const c of calls) segMin.set(c.seg, Math.min(segMin.has(c.seg) ? segMin.get(c.seg) : Infinity, c.ctx));
  const floorW = sel.reduce((s, c) => s + Math.min(c.ctx, segMin.get(c.seg)) * W.read, 0);

  const rows = new Map();
  const add = (key, t, i, writeToo) => {
    if (!inWindow(i)) return;
    const g = rows.get(key) || { n: 0, tokens: 0, carry: 0 };
    g.n++; g.tokens += t; g.carry += t * ((writeToo ? W.write : 0) + W.read * remaining[i]); rows.set(key, g);
  };
  for (const r of results) add("tool result · " + r.cat, tok(r.chars) + r.images * IMG_TOK, r.callIdx, true);
  for (const r of reminders) add("system reminders + file-change notices", tok(r.chars), r.callIdx, true);
  for (const x of mine) add("I wrote · " + x.kind, tok(x.chars), x.callIdx, false);
  console.log(`\nWHAT THE RE-READ CONTEXT IS MADE OF (cost-weighted; written once, then re-read on every later call until the next summary):`);
  console.log(`  ${pct(floorW, wt)}  ${fmt(floorW).padStart(6)}  fixed start-up floor (system prompt, tools, CLAUDE.md, MEMORY.md, summary)`);
  const sorted = [...rows.entries()].sort((a, b) => b[1].carry - a[1].carry);
  for (const [k, g] of sorted.slice(0, 22)) console.log(`  ${pct(g.carry, wt)}  ${fmt(g.carry).padStart(6)}  ${k}   (${g.n} × ${fmt(g.tokens)} tok)`);
  const explained = floorW + sorted.reduce((s, [, g]) => s + g.carry, 0);
  console.log(`  (these parts explain ${pct(explained, tot.read * W.read + tot.write * W.write).trim()} of the context cost)`);

  const days = new Map();
  for (const c of sel) { const d = days.get(c.day) || { n: 0, w: 0, ctx: [] }; d.n++; d.w += c.in * W.in + c.write * W.write + c.read * W.read + c.out * W.out; d.ctx.push(c.ctx); days.set(c.day, d); }
  console.log(`\nBY DAY (main thread):`);
  for (const [d, v] of [...days.entries()].sort().slice(-10)) { v.ctx.sort((a, b) => a - b); console.log(`  ${d}: ${String(v.n).padStart(5)} calls, ${fmt(v.w).padStart(6)} weighted, median context ${fmt(v.ctx[Math.floor(v.ctx.length / 2)])}`); }

  if (o.subagents) {
    const groups = await scanSubagents(o.file.replace(/\.jsonl$/, "") + path.sep + "subagents", o.since);
    let sw = 0; const list = [];
    for (const [k, g] of groups) { const w = g.in * W.in + g.write * W.write + g.read * W.read + g.out * W.out; if (!g.calls) continue; sw += w; list.push([k, g, w]); }
    console.log(`\nSUBAGENTS: ${fmt(sw)} weighted = ${pct(sw, sw + wt).trim()} of main + subagents`);
    for (const [k, g, w] of list.sort((a, b) => b[2] - a[2]).slice(0, 8)) console.log(`  ${fmt(w).padStart(6)}  ${String(g.agents).padStart(3)} agents ${String(g.calls).padStart(5)} calls  from ${g.first}  ${k}`);
  }
})();
