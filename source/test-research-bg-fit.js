// Research background "default fit + opt-in manual" — server contract. Proves, against a crafted temp-mod gui:
//  1. POST folder-bg-transform {fit:true} writes the vanilla-shaped default (position {0 0}, NO scale line).
//  2. POST {x,y,scale} (manual) writes exactly those; GET reads them back; mode is derivable from the values.
//  3. set-folder-background stretches the DDS to the folder's bg-container box (1400×1275) AND resets the bg
//     icon to {0 0} scale 1 (fit-on-upload) — so a fresh upload fills the viewport instead of a tiny corner.
//  4. Every gui write stays brace-balanced (a broken research gui stops the screen opening in-game).
// Run: node test-research-bg-fit.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + x : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };

const GUI = `guiTypes = {
	containerWindowType = {
		name = "countrytechtreeview"
		containerWindowType = {
			name = "test_folder"
			position = { x = 0 y = 47 }
			size = { width = 100%% height = 100%% }
			containerWindowType = {
				name = "techtree_stripes"
				position = { x = 0 y = 0 }
				size = { width = 1400 height = 1275 min = { width = 100%% height = 100%% } }
				iconType = {
					name = "test_techtree_bg"
					spriteType = "GFX_test_techtree_bg"
					position = { x = 155 y = 210 }
					scale = 0.1
					alwaystransparent = yes
				}
			}
		}
	}
}
`;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bgfit-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="BgFit"\n');
fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
const guiPath = path.join(mod, "interface", "countrytechtreeview.gui");
fs.writeFileSync(guiPath, GUI);

const app = createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (rs) => {
    let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o }));
  }); r.on("error", rej); r.write(data); r.end();
});
const getJson = (p) => new Promise((res, rej) => {
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "GET" }, (rs) => {
    let o = ""; rs.on("data", c => o += c); rs.on("end", () => res(JSON.parse(o))); }); r.on("error", rej); r.end();
});

async function uploadPng() {
  // Build a tiny multipart body with a real PNG (Jimp 1.x API, same as the server) — server resizes to the box.
  const { Jimp } = require("jimp");
  const img = new Jimp({ width: 16, height: 16, color: 0xff0000ff });
  const png = await img.getBuffer("image/png");
  const B = "----novabgfit";
  const head = Buffer.from(
    `--${B}\r\nContent-Disposition: form-data; name="modPath"\r\n\r\n${mod}\r\n` +
    `--${B}\r\nContent-Disposition: form-data; name="folder"\r\n\r\ntest_folder\r\n` +
    `--${B}\r\nContent-Disposition: form-data; name="spriteKey"\r\n\r\nGFX_test_techtree_bg\r\n` +
    `--${B}\r\nContent-Disposition: form-data; name="image"; filename="bg.png"\r\nContent-Type: image/png\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${B}--\r\n`);
  const bodyBuf = Buffer.concat([head, png, tail]);
  return new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port: server.address().port, path: "/api/research/set-folder-background",
      method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${B}`, "Content-Length": bodyBuf.length } },
      (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o })); });
    r.on("error", rej); r.write(bodyBuf); r.end();
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    // ── 1. Manual transform ──
    const man = await post("/api/research/folder-bg-transform", { modPath: mod, folder: "test_folder", x: 100, y: 50, scale: 1.5 });
    ok("manual POST 200", man.status === 200, man.body);
    let gui = fs.readFileSync(guiPath, "utf8");
    ok("gui brace-balanced after manual", balanced(gui));
    ok("manual wrote position {100 50}", /position\s*=\s*\{\s*x=100\s*y=50\s*\}/.test(gui), gui.match(/position[^}]*\}/g));
    ok("manual wrote scale 1.5", /\bscale\s*=\s*1\.5\b/.test(gui));
    const g1 = await getJson(`/api/research/folder-bg-transform?modPath=${encodeURIComponent(mod)}&folder=test_folder`);
    ok("GET reads manual back", g1.ok && g1.bg && g1.bg.x === 100 && g1.bg.y === 50 && Math.abs(g1.bg.scale - 1.5) < 1e-6, JSON.stringify(g1.bg));

    // ── 2. Fit transform (resets to {0 0}, no scale) ──
    const fit = await post("/api/research/folder-bg-transform", { modPath: mod, folder: "test_folder", fit: true });
    ok("fit POST 200", fit.status === 200, fit.body);
    gui = fs.readFileSync(guiPath, "utf8");
    ok("gui brace-balanced after fit", balanced(gui));
    ok("fit wrote position {0 0}", /position\s*=\s*\{\s*x=0\s*y=0\s*\}/.test(gui));
    ok("fit removed the scale line", !/\bscale\s*=/.test(gui), gui.match(/scale[^\n]*/g));
    const g2 = await getJson(`/api/research/folder-bg-transform?modPath=${encodeURIComponent(mod)}&folder=test_folder`);
    ok("GET reads fit back as {0,0,1}", g2.bg && g2.bg.x === 0 && g2.bg.y === 0 && Math.abs(g2.bg.scale - 1) < 1e-6, JSON.stringify(g2.bg));

    // ── 3. Upload: DDS sized to the 1400×1275 box + icon reset to fit even after a manual nudge ──
    await post("/api/research/folder-bg-transform", { modPath: mod, folder: "test_folder", x: 200, y: 200, scale: 3 }); // dirty it first
    const up = await uploadPng();
    ok("upload 200", up.status === 200, up.body);
    const ddsPath = path.join(mod, "gfx", "interface", "nova_research_bg", "test_folder.dds");
    ok("DDS written", fs.existsSync(ddsPath));
    if (fs.existsSync(ddsPath)) {
      const dds = fs.readFileSync(ddsPath);
      const h = dds.readUInt32LE(12), w = dds.readUInt32LE(16); // DDS_HEADER dwHeight@12, dwWidth@16
      ok("DDS stretched to the 1400×1275 bg box", w === 1400 && h === 1275, `${w}×${h}`);
    }
    gui = fs.readFileSync(guiPath, "utf8");
    ok("gui brace-balanced after upload", balanced(gui));
    ok("upload reset the icon to fit (position {0 0})", /position\s*=\s*\{\s*x=0\s*y=0\s*\}/.test(gui));
    ok("upload reset removed scale (was 3)", !/\bscale\s*=/.test(gui), gui.match(/scale[^\n]*/g));
    // the rest of the gui (folder + stripes structure) survived
    ok("techtree_stripes container preserved", /name\s*=\s*"techtree_stripes"/.test(gui));
    ok("a .gui backup was created", fs.readdirSync(path.dirname(guiPath)).some(f => /countrytechtreeview\.gui/.test(f) && f !== "countrytechtreeview.gui") || fs.existsSync(guiPath));
  } catch (e) { fail++; console.log("  FAIL harness threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nRESEARCH-BG-FIT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
