// Shared, page-agnostic banner: if the active mod targets a different HOI4 branch than the installed
// game (e.g. a 1.17 mod on a 1.18 game), show a dismissible warning at the top of the page, in
// mod-version.js's own words: many mods run fine across a branch, but if the game misbehaves the version
// is the first thing to rule out, so it is flagged everywhere. Amber, as Mod Health's "Will it crash?"
// card files it: a warning, not a crash (#a-game-version-mismatch-is-a-warning-not-a-crash).
// Include with <script src="./version-banner.js"></script> before </body>.
(function () {
  function modPath() {
    try { return localStorage.getItem("activeModPath") || ""; } catch (_) { return ""; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  // Dismissals are remembered in shared localStorage keyed by mod + the server's per-run bootId, so a
  // single ✕ silences the banner across EVERY tab for the rest of this app run, and it comes back only
  // after the program (and thus the bootId) restarts. This doesn't rely on the dismiss POST landing —
  // a tab switch can cancel it — so the banner never re-appears mid-session even if the POST was lost.
  function dismissKey(mp) { return "novaVerBannerDismissed:" + (mp || ""); }
  function isDismissedLocally(mp, bootId) {
    try { return !!bootId && localStorage.getItem(dismissKey(mp)) === bootId; } catch (_) { return false; }
  }
  function rememberDismissed(mp, bootId) {
    try { if (bootId) localStorage.setItem(dismissKey(mp), bootId); } catch (_) {}
  }
  async function run() {
    if (document.getElementById("novaVersionBanner")) return;
    const mp = modPath();
    let v;
    try { v = await fetch("/api/modversion?modPath=" + encodeURIComponent(mp)).then((r) => r.json()); }
    catch (_) { return; }
    if (!v || !v.ok) return;
    // Already dismissed this run — by the server's in-memory set OR our local bootId memory.
    if (v.dismissed || isDismissedLocally(mp, v.bootId)) return;
    if (v.severity !== "warning" || !v.message) return;
    const bar = document.createElement("div");
    bar.id = "novaVersionBanner";
    bar.style.cssText =
      "background:#3d2a00;border-bottom:1px solid #9e6a00;color:#f0c674;padding:8px 36px 8px 14px;" +
      "font-size:13px;line-height:1.5;font-family:inherit;position:relative;z-index:99999;";
    bar.innerHTML =
      "⚠ " + esc(v.message) +
      '<button type="button" id="novaVerBannerX" title="Dismiss" ' +
      'style="position:absolute;top:6px;right:10px;background:none;border:none;color:#f0c674;cursor:pointer;font-size:15px;line-height:1;">✕</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    const x = document.getElementById("novaVerBannerX");
    if (x) x.addEventListener("click", () => {
      bar.remove();
      // Remember it locally FIRST (instant, survives navigation, shared across tabs), then tell the
      // server too (keepalive lets the POST outlive an immediate tab switch). Either path alone is
      // enough to keep it gone for the rest of this app run.
      rememberDismissed(mp, v.bootId);
      try { fetch("/api/modversion/dismiss?modPath=" + encodeURIComponent(mp), { method: "POST", keepalive: true }); } catch (_) {}
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
