"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusEditor", {
  writeToClipboard: (text) => ipcRenderer.invoke("clipboard-write", text),
  pickFocusTreeFile: () => ipcRenderer.invoke("pick-focus-tree-file"),
  pickLocalizationFile: (options) => ipcRenderer.invoke("pick-localization-file", options && typeof options === "object" ? options : {}),
  createLocalizationFile: (options) =>
    ipcRenderer.invoke("create-localization-file", options && typeof options === "object" ? options : {}),
  pickGfxDdsFile: () => ipcRenderer.invoke("pick-gfx-dds-file"),
  pickFlagImageFile: () => ipcRenderer.invoke("pick-flag-image-file"),
  openFocusTreeFile: (payload) => ipcRenderer.invoke("open-focus-tree-file", payload || {}),
  forceRepaint: () => ipcRenderer.invoke("force-repaint"),
  showConfirmDialog: (message) => ipcRenderer.invoke("show-confirm-dialog", message),
});
