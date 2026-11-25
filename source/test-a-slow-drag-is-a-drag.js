// ⛔ #a-slow-drag-is-a-drag — A DRAG IS COUNTED FROM WHERE THE PRESS WENT DOWN, NOT PER MOUSEMOVE STEP (tool campaign B2-1, B1-10).
//
// The map page decided "this press is a drag" when ONE mousemove step was more than 3 px from the step before it. A browser sends one
// mousemove per frame, so a drag slower than about 3 px a frame (180 px/s at 60 Hz) never became one: Paint, Erase, Terrain, Rivers and
// New country did only the release point of the path, Paint shape re-picked its brush on release, and a slow pan in Set capital, Move
// province or Merge acted at the release as if it were a click. research.js counts from the press point; the map page now does too.
//
// The page's own three handlers (from `let dragging = false, moved = false` to the end of the mouseup listener) run in a sandbox with fake
// events. The brush modes and the click modes are DERIVED from those handlers' own branches (comments masked), so a mode added later is
// covered without editing this file. Binds no port, starts no server.
// Run: node test-a-slow-drag-is-a-drag.js
"use strict";
const vm = require("vm");
const { MAP, MASKED } = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 600) : "")); }
};

// ── the handlers, lifted ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const START = "let dragging = false, moved = false";
const s = MASKED.indexOf(START);
if (s < 0) throw new Error(`public/map.js has no "${START}"`);
const downAt = MASKED.indexOf('wrap.addEventListener("mousedown"', s);
const moveAt = MASKED.indexOf('window.addEventListener("mousemove"', s);
const upAt = MASKED.indexOf('window.addEventListener("mouseup"', s);
if (!(downAt > s && moveAt > downAt && upAt > moveAt)) throw new Error(`the press/move/release listeners are not where they were: ${downAt} ${moveAt} ${upAt}`);
const END = "\n  });";
const e = MASKED.indexOf(END, upAt);
if (e < 0) throw new Error("no end to the mouseup listener");
const CODE = MAP.slice(s, e + END.length) + "\nglobalThis.__state = () => ({ dragging, moved });\n";
const moveBody = MASKED.slice(moveAt, upAt);
const upBody = MASKED.slice(upAt, e);

// Modes whose DRAG does the work: `if (mode === "X" && !spaceDown) { if (moved) fn(…)` (paintshape's is `if (moved) { if (brush) fn(…)`).
const brushModes = [...moveBody.matchAll(/if \(mode === "(\w+)" && !spaceDown\) \{\s*if \(moved\) (?:\{ if \(brush\) )?(\w+)\(/g)]
  .map((m) => ({ mode: m[1], fn: m[2] }));
// Modes whose CLICK does the work at the release: `if (mode === "X") { if (!moved) fn(…)`.
const clickModes = [...upBody.matchAll(/if \(mode === "(\w+)"\) \{\s*if \(!moved\) (\w+)\(/g)].map((m) => ({ mode: m[1], fn: m[2] }));
// …and the shared click path at the end of the release: `else if (mode === "X") fn(pid…)`.
const tailAt = upBody.lastIndexOf("if (!moved) {");
const tailModes = tailAt < 0 ? [] : [...upBody.slice(tailAt).matchAll(/else if \(mode === "(\w+)"\) (\w+)\(/g)].map((m) => ({ mode: m[1], fn: m[2] }));

console.log("derived from public/map.js:");
console.log("  drag modes:  " + brushModes.map((b) => b.mode + "→" + b.fn).join(", "));
console.log("  click modes: " + clickModes.map((b) => b.mode + "→" + b.fn).join(", "));
console.log("  tail modes:  " + tailModes.map((b) => b.mode + "→" + b.fn).join(", "));
ok(brushModes.length >= 5 && ["paint", "erase", "terrain", "rivers"].every((m) => brushModes.some((b) => b.mode === m)),
  "the drag modes are read from the page (Paint, Erase, Terrain and Rivers among them)", brushModes);
ok(clickModes.some((b) => b.mode === "capital") && tailModes.some((b) => b.mode === "move"),
  "the click modes are read from the page (Set capital, Move province among them)", { clickModes, tailModes });

// ── a sandbox that runs them ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function page(mode) {
  const calls = [];
  const target = () => { const l = {}; return { l, addEventListener(t, f) { (l[t] = l[t] || []).push(f); }, classList: { add() {}, remove() {} } }; };
  const wrap = target(), win = target();
  const rec = (name) => (...a) => { calls.push({ fn: name, x: a[0], y: a[1] }); return true; };
  const sb = {
    console, wrap, window: win, mode, marquee: null, offX: 0, offY: 0, brush: { provinceId: 7 },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    overFloatingPanel: () => false, imgXYAt: (x, y) => ({ x: Math.floor(x), y: Math.floor(y) }), draw() {}, setStatus() {},
    beginEraseStroke() {}, beginTerrainStroke() {}, commitEraseStroke() {}, commitTerrainStroke() {}, commitRiverEdits() {},
    setBrushFromPixel: rec("setBrushFromPixel"),
    imgPixelAt: () => 0x123456, colorToProvince: new Map([[0x123456, 9]]), model: { provinceToState: { 9: 3 } },
    multiSelect: { size: 0, has: () => false, add() {}, delete() {}, clear() {} }, showInfo() {}, updateMultiBar() {},
    selected: null, lastPaintedSid: null, strokeUndoTaken: false, lastPaintPt: null, lastRiverPt: null, moveCountryStart: null,
    moveCountryDrag: null, measureA: null, measureB: null, finishMoveCountryDrag: rec("finishMoveCountryDrag"),
    bucketFill: rec("bucketFill"), paintOwnerClick: rec("paintOwnerClick"),
  };
  for (const b of [...brushModes, ...clickModes, ...tailModes]) sb[b.fn] = rec(b.fn);
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(CODE, sb);
  const fire = (t, ev) => { for (const f of [...(wrap.l[t] || []), ...(win.l[t] || [])]) f(Object.assign({ target: {}, shiftKey: false, altKey: false }, ev)); };
  return {
    sb, calls,
    // press at (x0,y0), then `steps` mousemoves of (dx,dy) each — one per frame — then release at the last point
    drag(x0, y0, dx, dy, steps) {
      fire("mousedown", { clientX: x0, clientY: y0 });
      let x = x0, y = y0;
      for (let i = 0; i < steps; i++) { x += dx; y += dy; fire("mousemove", { clientX: x, clientY: y }); }
      const atRelease = calls.length;
      fire("mouseup", { clientX: x, clientY: y });
      return { atRelease, x, y, moved: sb.__state().moved };
    },
  };
}
const SLOW = 1.5, FAST = 6, STEPS = 50;   // 1.5 px a frame (90 px/s at 60 Hz) — the campaign's own slow drag was 50 steps over 75 px

// ── 1. a slow drag in a brush mode works the whole path, as a fast one does ──────────────────────────────────────────────────────────
for (const { mode, fn } of brushModes) {
  const slow = page(mode); const r = slow.drag(100, 100, SLOW, 0, STEPS);
  const during = slow.calls.slice(0, r.atRelease).filter((c) => c.fn === fn);
  const fast = page(mode); const rf = fast.drag(100, 100, FAST, 0, STEPS);
  const fastDuring = fast.calls.slice(0, rf.atRelease).filter((c) => c.fn === fn);
  // the threshold is 3 px from the press, so the first two steps (3 px) are still a press; every step after is the drag
  ok(r.moved && during.length >= STEPS - 3 && during[0].x <= 100 + 3 + SLOW && during[during.length - 1].x === r.x,
    `${mode}: a slow drag (${SLOW} px a frame) calls ${fn} along the whole path (${during.length} of ${STEPS} steps; a fast drag: ${fastDuring.length})`,
    { moved: r.moved, during: during.length, first: during[0], last: during[during.length - 1] });
}

// ── 2. a slow pan in a click mode is a pan: nothing happens at the release; a click (and a click that wobbles 3 px) still acts ──────
for (const { mode, fn } of [...clickModes, ...tailModes]) {
  const pan = page(mode); const r = pan.drag(100, 100, SLOW, SLOW, STEPS);
  const onRelease = pan.calls.slice(r.atRelease).filter((c) => c.fn === fn);
  ok(r.moved && onRelease.length === 0, `${mode}: a slow drag does not ${fn} at the release`, { moved: r.moved, onRelease });
  const click = page(mode); const rc = click.drag(100, 100, 0, 0, 0);
  ok(!rc.moved && click.calls.filter((c) => c.fn === fn).length === 1, `${mode}: a plain click still runs ${fn} once`, click.calls);
  const wobble = page(mode); const rw = wobble.drag(100, 100, 1, 0, 3);   // 3 px from the press: still a click
  ok(!rw.moved && wobble.calls.slice(rw.atRelease).filter((c) => c.fn === fn).length === 1, `${mode}: a click that wobbles 3 px is still a click`, wobble.calls);
}

// ── 3. the pan still follows the pointer step by step (the threshold decides only WHETHER it is a drag) ───────────────────────────
{
  const p = page("inspect"); const r = p.drag(100, 100, SLOW, 0, STEPS);
  ok(r.moved && Math.abs(p.sb.offX - SLOW * STEPS) < 1e-9 && p.calls.length === 0,
    `inspect: a slow drag pans the full ${SLOW * STEPS} px and selects nothing at the release`, { offX: p.sb.offX, calls: p.calls });
}

// ── 4. the rule itself, in the code: counted from the press point ─────────────────────────────────────────────────────────────────
{
  const down = MASKED.slice(downAt, moveAt), move = MASKED.slice(moveAt, upAt);
  ok(/pressX = e\.clientX; pressY = e\.clientY;/.test(down), "the press records where it went down");
  ok(/if \(!moved && Math\.abs\(e\.clientX - pressX\) \+ Math\.abs\(e\.clientY - pressY\) > 3\) moved = true;/.test(move),
    "a mousemove asks how far the pointer is from the PRESS, not from the step before");
  ok(!/Math\.abs\(dx\) \+ Math\.abs\(dy\) > 3/.test(move), "…and no longer asks it of one step");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
