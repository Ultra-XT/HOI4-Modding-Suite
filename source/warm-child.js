"use strict";
// Runs the cache warm-up in a SEPARATE process (spawned by main.js). The warm includes parses that
// are unavoidably synchronous for big mods — a single giant merged .gfx sprite file, definition.csv
// with ~13k provinces — and a multi-second synchronous parse on the Electron MAIN thread makes the
// loading window freeze / go "Not Responding" in Windows. Doing it here, off the main thread, means
// the splash can never freeze no matter how slow the warm is. We build the on-disk caches; the main
// process then reads them (a fast JSON load) when a tab needs them. Best-effort: any failure just
// means the main process warms lazily instead — the app still works.
const { startServer } = require("./server.js");

(async () => {
  let handle = null;
  try {
    handle = await startServer({ port: 0, allowPortFallback: true, deferWarm: true });
    await handle.app.locals.warmCaches({
      port: handle.port,
      onProgress: (p) => {
        try { if (process.send) process.send({ t: "p", pct: p.pct, label: p.label }); } catch (_) {}
      },
    });
  } catch (_) { /* best-effort */ }
  try { if (handle) await handle.close(); } catch (_) {}
  try { if (process.send) process.send({ t: "done" }); } catch (_) {}
  process.exit(0);
})();
