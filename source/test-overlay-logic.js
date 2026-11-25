/*
 * Verify loading-overlay.js decision logic in Node with a minimal DOM/timer/fetch shim.
 * We can't render it, but we CAN prove the core behavior: shows on slow load, hides when
 * settled, never shows on fast load, and the hard-timeout always hides. Uses FAKE timers so
 * the test runs instantly and deterministically.
 */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8");

let fail = 0;
const ok = (label, cond) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) fail++; };

class SyncPromise {
  constructor(executor) {
    this.callbacks = [];
    this.resolved = false;
    this.value = undefined;
    try {
      executor((val) => {
        if (this.resolved) return;
        this.resolved = true;
        this.value = val;
        this.callbacks.forEach(cb => cb(val));
      });
    } catch (e) {}
  }
  then(onFulfilled) {
    if (this.resolved) {
      const ret = onFulfilled(this.value);
      return SyncPromise.resolve(ret);
    }
    return new SyncPromise((resolve) => {
      this.callbacks.push((val) => {
        const ret = onFulfilled(val);
        resolve(ret);
      });
    });
  }
  static resolve(val) {
    return new SyncPromise((resolve) => resolve(val));
  }
}

// --- fake clock + timers ---
function makeEnv(scenario) {
  let now = 0;
  const timers = []; // {at, fn}
  const overlayState = { exists: false, visible: false, removed: false };

  const el = (tag) => ({
    tagName: tag, id: "", className: "", style: {}, children: [],
    setAttribute() {}, appendChild() {}, parentNode: null,
    querySelector() { return { textContent: "" }; }, // setText() target; content not asserted here
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); if (c === "nova-vis") overlayState.visible = true; },
      remove(c) { this._s.delete(c); if (c === "nova-vis") overlayState.visible = false; },
      contains(c) { return this._s.has(c); },
    },
    innerHTML: "", textContent: "", removeChild() {},
  });

  const head = el("head"), body = el("body");
  const byId = {};
  const doc = {
    readyState: "complete",
    addEventListener() {},
    createElement: el,
    getElementById: (id) => byId[id] || null,
    head, body,
  };
  // when the overlay injects #nova-loading-overlay, capture it
  const origAppend = body.appendChild;
  body.appendChild = function (node) {
    if (node && node.id === "nova-loading-overlay") { byId["nova-loading-overlay"] = node; overlayState.exists = true; node.parentNode = body;
      const origRemove = node.classList.remove.bind(node.classList);
    }
    return origAppend.call(this, node);
  };
  head.appendChild = function () {};

  const win = {
    __novaLoadingOverlay: undefined,
    document: doc,
    requestAnimationFrame: (fn) => timers.push({ at: now, fn }),
    setTimeout: (fn, ms) => { timers.push({ at: now + (ms || 0), fn }); return timers.length; },
    clearTimeout() {},
  };
  // fetch shim per scenario
  win.fetch = scenario.fetch(win, () => now);
  win.document = doc;

  // run the overlay source in this sandboxed context
  const vm = require("vm");
  const sandbox = {
    window: win,
    document: doc,
    setTimeout: win.setTimeout,
    requestAnimationFrame: win.requestAnimationFrame,
    Date: { now: () => now },
    console: console
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  // advance the fake clock, firing due timers
  function advance(ms) {
    const target = now + ms;
    // process in small steps so newly-scheduled timers fire in order
    while (true) {
      const due = timers.filter((t) => !t.fired && t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = Math.max(now, due.at);
      due.fired = true;
      try {
        due.fn();
      } catch (e) {
        console.error("Timer error:", e);
      }
    }
    now = target;
  }

  return { overlayState, advance, win };
}

// Scenario A: SLOW request that resolves. Overlay should SHOW during the wait, then HIDE after.
(() => {
  let resolveFetch;
  const env = makeEnv({
    fetch: (win, getNow) => () => new SyncPromise((res) => { resolveFetch = res; }),
  });
  env.win.fetch();
  env.advance(640);           // past SHOW_AFTER_MS (500) so the request counts as "slow"
  const shownDuringLoad = env.overlayState.visible;
  resolveFetch && resolveFetch({});   // request completes -> untracked
  env.advance(700);           // past QUIET_MS settle window
  const hiddenAfter = !env.overlayState.visible;
  ok("SLOW load: overlay SHOWN during the wait", shownDuringLoad);
  ok("SLOW load: overlay HIDDEN after settle", hiddenAfter);
})();

// Scenario B: FAST request — resolves at 10ms. Overlay should NEVER show (no flash on warm loads).
(() => {
  const env = makeEnv({
    fetch: (win) => () => new SyncPromise((res) => { win.setTimeout(() => res({}), 10); }),
  });
  env.win.fetch();
  env.advance(10);            // fetch resolves -> untracked
  env.advance(640);           // past SHOW_AFTER_MS(500); nothing pending -> must NOT show
  const flashed = env.overlayState.visible;
  env.advance(700);
  ok("FAST load: overlay NEVER shown (no flash)", flashed === false && env.overlayState.visible === false);
})();

// Scenario C: NEVER-settling request — hangs forever. Overlay shows, then the age-window safety
// (HARD_MAX_MS) makes it stop counting so the overlay un-sticks itself.
(() => {
  const env = makeEnv({
    fetch: (win, getNow) => () => new SyncPromise(() => {}),   // never resolves
  });
  env.win.fetch();
  env.advance(640);           // past SHOW_AFTER_MS (500)
  const shown = env.overlayState.visible;
  env.advance(31000);         // past HARD_MAX_MS (30000) -> request no longer counts
  ok("HANG load: overlay shown during hang", shown);
  ok("HANG load: hard-timeout HIDES overlay (never stuck)", env.overlayState.visible === false);
})();

// Scenario D: EXCLUDED endpoint (AI) — even a slow /api/ai/ request must NOT trigger the overlay
// (those have their own progress UI).
(() => {
  const env = makeEnv({
    fetch: (win) => (url) => new SyncPromise(() => {}),   // never resolves
  });
  env.win.fetch("/api/ai/logic");
  env.advance(640);
  ok("EXCLUDED ai request: overlay NOT shown", env.overlayState.visible === false);
})();

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);
