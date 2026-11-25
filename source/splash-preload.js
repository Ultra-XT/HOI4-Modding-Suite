"use strict";

// Minimal, sandbox-safe preload for the startup splash window. Exposes a one-way channel the main
// process uses to push cache-warm progress, so splash.html can render a real progress bar.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("novaSplash", {
  onProgress: (cb) => {
    if (typeof cb !== "function") return;
    ipcRenderer.on("warm-progress", (_event, data) => {
      try { cb(data); } catch (_e) { /* ignore renderer-side handler errors */ }
    });
  },
});
