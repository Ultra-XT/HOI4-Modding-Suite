// DATA SAFETY (#1A): /api/upload-gfx writes a custom icon to gfx/<subdir>/<name>.dds. If that name collides
// with a picture that already exists in the mod (e.g. customizing a base-game / Millennium Dawn tech whose id
// matches a real icon), the upload OVERWRITES it. That silently corrupted real pictures. Now the original is
// BACKED UP first (binary-safe) so it's always recoverable, and the response flags overwrote:true. This test
// pre-places a file at the target path, uploads a colliding icon, and verifies the original was backed up
// verbatim + the response flags the overwrite. Run: npm run test:upload-backup-safety
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { Jimp } = require("jimp");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// Ask the server where its backups go rather than rebuilding the path here. These two entries used to be
// <root>/tools/focus-drag-editor/backups and its packaged sibling; BACKUP_DIR moved under NOVA_APP_DATA_DIR
// in the June D:-drive cleanup, so this test reported a missing backup that was in fact being written
// correctly the whole time. The old paths stay as fallbacks for an older build.
const BACKUP_DIRS = [
  (require("./server.js").constants || {}).BACKUP_DIR,
  path.join(__dirname, "tools", "focus-drag-editor", "backups"),
  path.resolve(__dirname, "..", "..", "tools", "focus-drag-editor", "backups"),
].filter(Boolean);
const findBackup = (basename) => { if (!basename) return ""; for (const d of BACKUP_DIRS) { const p = path.join(d, basename); if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } return ""; };

function postUpload(port, mod, type, name, pngBuf) {
  return new Promise((resolve) => {
    const boundary = "----nova" + Date.now();
    const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="up.png"\r\nContent-Type: image/png\r\n\r\n`);
    const field = (n, v) => Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}`);
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, pngBuf, field("type", type), field("name", name), field("modPath", mod), tail]);
    const req = http.request({ host: "127.0.0.1", port, path: "/api/upload-gfx", method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length } }, (res) => {
      let d = ""; res.on("data", (c) => d += c); res.on("end", () => { let j = {}; try { j = JSON.parse(d); } catch (_) {} resolve(j); });
    });
    req.on("error", () => resolve({ error: "req failed" })); req.write(body); req.end();
  });
}

(async () => {
  console.log("=== UPLOAD-GFX OVERWRITE BACKUP SAFETY (#1A) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upbak-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="x"\n');
  // Pre-place a "real" existing icon at the exact path the upload will target (type=technology, name=coll_test
  // → gfx/interface/technologies/coll_test.dds). Its bytes are a unique marker so we can prove the backup is it.
  const ORIGINAL = Buffer.from("ORIGINAL_MD_ICON_BYTES_" + Date.now() + "_DO_NOT_LOSE", "utf8");
  const targetDds = path.join(mod, "gfx", "interface", "technologies", "coll_test.dds");
  fs.mkdirSync(path.dirname(targetDds), { recursive: true });
  fs.writeFileSync(targetDds, ORIGINAL);

  const bigPng = await new Jimp({ width: 400, height: 300, color: 0x22cc66ff }).getBuffer("image/png");

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const resp = await postUpload(port, mod, "technology", "coll_test", bigPng);
    ok("upload succeeded", resp && (resp.ok || resp.success) && !resp.error, resp);
    ok("response flags that it overwrote an existing file", resp.overwrote === true, resp.overwrote);
    ok("response includes a backup filename", typeof resp.backupPath === "string" && resp.backupPath.length > 0, resp.backupPath);

    const backup = findBackup(resp.backupPath || "");
    ok("the backup file exists on disk", !!backup, { backupPath: resp.backupPath, scanned: BACKUP_DIRS });
    if (backup) {
      ok("the backup contains the ORIGINAL bytes verbatim (recoverable)", Buffer.compare(fs.readFileSync(backup), ORIGINAL) === 0);
    }
    // The target now holds the NEW (uploaded → resized DDS) content, not the original.
    const after = fs.readFileSync(targetDds);
    ok("the target .dds was replaced with the new icon (different from original)", Buffer.compare(after, ORIGINAL) !== 0 && after.length > 0);

    // A fresh, non-colliding upload does NOT report an overwrite (no false alarm + nothing to back up).
    const resp2 = await postUpload(port, mod, "technology", "brand_new_icon_xyz", bigPng);
    ok("a non-colliding upload reports overwrote:false", resp2.overwrote === false, resp2.overwrote);
    ok("a non-colliding upload has no backupPath", !resp2.backupPath, resp2.backupPath);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nUPLOAD-BACKUP-SAFETY: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
