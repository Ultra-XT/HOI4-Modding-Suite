// Quiet, dismissible "a newer version is on GitHub" banner. Polls /api/update-check (which fails silently
// when offline / rate-limited / no releases) and only shows anything when there's genuinely a newer
// release. Dismissal is remembered PER VERSION, so ✕ silences this version forever but a later release
// shows again. Read-only; include with <script src="./update-check.js"></script> before </body>.
(function () {
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function dismissed(v) { try { return localStorage.getItem("novaUpdateDismissed:" + v) === "1"; } catch (_) { return false; } }
  function remember(v) { try { localStorage.setItem("novaUpdateDismissed:" + v, "1"); } catch (_) {} }

  async function run() {
    if (document.getElementById("novaUpdateBanner")) return;
    let d;
    try { d = await fetch("/api/update-check").then((r) => r.json()); } catch (_) { return; }
    if (!d || !d.ok || !d.updateAvailable || !d.latest || dismissed(d.latest)) return;

    const bar = document.createElement("div");
    bar.id = "novaUpdateBanner";
    bar.style.cssText = "position:relative; background:#10243a; border-bottom:1px solid #1f6feb; color:#cfe3ff;" +
      " font-size:13px; line-height:1.5; padding:9px 40px 9px 16px; text-align:center; z-index:40;";
    bar.innerHTML =
      '<span aria-hidden="true">✦</span> <b>Nova Modding Suite v' + esc(d.latest) + '</b> is available' +
      ' &mdash; you have v' + esc(d.current) + '. ' +
      '<a href="' + esc(d.url) + '" target="_blank" rel="noopener" style="color:#8ec5ff; font-weight:600;">Download ↗</a>' +
      '<button id="novaUpdateX" title="Dismiss" aria-label="Dismiss" style="position:absolute; top:6px; right:10px;' +
      ' background:none; border:none; color:#cfe3ff; cursor:pointer; font-size:15px; line-height:1;">✕</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    document.getElementById("novaUpdateX").addEventListener("click", function () { remember(d.latest); bar.remove(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
