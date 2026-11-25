// Regression: /api/upload-gfx must resize uploaded images to the icon's HOI4 dimensions, so a
// large photo doesn't become a giant in-game sprite (the "giant cat" bug). Verifies the written
// .dds header dimensions per sprite type.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Jimp } = require("jimp");
const { createApp } = require("./server.js");
const PORT = 3571;

function ddsDims(file) {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(20);
  fs.readSync(fd, buf, 0, 20, 0);
  fs.closeSync(fd);
  return { magic: buf.toString("ascii", 0, 4), height: buf.readUInt32LE(12), width: buf.readUInt32LE(16) };
}

function uploadMultipart(modPath, type, name, pngBuffer) {
  return new Promise((resolve, reject) => {
    const B = "----novaTestBoundary" + Date.now();
    const parts = [];
    const field = (n, v) => parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`));
    field("type", type); field("name", name); field("modPath", modPath);
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="image"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`));
    parts.push(pngBuffer);
    parts.push(Buffer.from(`\r\n--${B}--\r\n`));
    const body = Buffer.concat(parts);
    const req = http.request({ host: "127.0.0.1", port: PORT, path: "/api/upload-gfx", method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${B}`, "Content-Length": body.length } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(b) }); } catch (_) { resolve({ status: res.statusCode, raw: b.slice(0, 150) }); } });
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

(async () => {
  const s = createApp().listen(PORT, "127.0.0.1");
  await new Promise((r) => s.on("listening", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-icon-"));
  fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Icon Test"\n', "utf8");
  let pass = 0, fail = 0;
  const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
  try {
    // A deliberately HUGE image (the "giant cat").
    const giant = await new Jimp({ width: 1024, height: 900, color: 0x44aa66ff }).getBuffer("image/png");
    const cases = [
      { type: "focus", name: "cat_focus", w: 96, h: 96, sub: "gfx/interface/goals" },
      { type: "decision", name: "cat_dec", w: 32, h: 32, sub: "gfx/interface/decisions" },
      { type: "idea", name: "cat_idea", w: 76, h: 76, sub: "gfx/interface/ideas" },
      // A research tab is a TWO-FRAME STRIP, not a square icon (#tab-icon-dims). All 14 of vanilla's
      // gfx/interface/techtree/techtree_*_tab.dds are 182x61 and every GFX_*_folder_tab declares
      // noOfFrames = 2, so the game draws 91x61 per frame — normal and highlighted. This asserted 32x32,
      // which left the sprite sitting in a 91px slot with no pressed state. The upload now composes the
      // frame twice side by side: 91x61 each, 182x61 total.
      { type: "tab", name: "cat_tab", w: 182, h: 61, sub: "gfx/interface" },
    ];
    for (const c of cases) {
      const res = await uploadMultipart(tmp, c.type, c.name, giant);
      check(`${c.type} upload ok`, res.status === 200 && res.json && res.json.success !== false && !res.json.error, JSON.stringify(res.json || res.raw).slice(0, 120));
      if (c.type === "tab") check("tab upload returns ddsPath (needed by create-custom-folder)", res.json && typeof res.json.ddsPath === "string" && res.json.ddsPath.length > 0, JSON.stringify(res.json).slice(0, 120));
      const dds = path.join(tmp, c.sub, c.name + ".dds");
      check(`${c.type} .dds written`, fs.existsSync(dds), dds);
      if (fs.existsSync(dds)) {
        const d = ddsDims(dds);
        check(`${c.type} .dds resized to ${c.w}x${c.h} (was 1024x900)`, d.width === c.w && d.height === c.h, `${d.width}x${d.height}`);
      }
    }
  } catch (e) {
    fail++; console.log("  FAIL harness →", e.message);
  } finally {
    s.close();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nICON-RESIZE TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
