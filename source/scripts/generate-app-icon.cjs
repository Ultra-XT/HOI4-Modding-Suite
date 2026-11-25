const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const publicDir = path.join(root, "public");

// "Nova spark" — navy rounded square, a soft glow, a light-blue 4-point star (which doubles as the app's
// ✦ Genesis mark), and a white core. A single star stays crisp down to 16px (taskbar / favicon size).
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a5285"/>
      <stop offset="1" stop-color="#0b1422"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.46" r="0.5">
      <stop offset="0" stop-color="#8ec5ff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#8ec5ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="star" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eaf3ff"/>
      <stop offset="1" stop-color="#6fb0ff"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="256" cy="236" r="190" fill="url(#glow)"/>
  <path d="M256 96 L296 216 L416 256 L296 296 L256 416 L216 296 L96 256 L216 216 Z" fill="url(#star)"/>
  <circle cx="256" cy="256" r="20" fill="#ffffff"/>
</svg>`;

// Assemble a PNG-embedded .ico (Vista+): 6-byte header + 16-byte dir entry per image + concatenated PNGs.
function buildIco(sizes, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const entries = Buffer.alloc(16 * sizes.length);
  let offset = 6 + 16 * sizes.length;
  sizes.forEach((s, i) => {
    const png = pngs[i], e = i * 16;
    entries.writeUInt8(s >= 256 ? 0 : s, e + 0);   // width  (0 = 256)
    entries.writeUInt8(s >= 256 ? 0 : s, e + 1);   // height (0 = 256)
    entries.writeUInt16LE(1, e + 4);               // colour planes
    entries.writeUInt16LE(32, e + 6);              // bits per pixel
    entries.writeUInt32LE(png.length, e + 8);      // size of PNG data
    entries.writeUInt32LE(offset, e + 12);         // offset to PNG data
    offset += png.length;
  });
  return Buffer.concat([header, entries, ...pngs]);
}

async function main() {
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  const render = (px) => sharp(Buffer.from(svg(px))).resize(px, px).png().toBuffer();

  // Main app icon — the Electron window + the packaged .exe (electron-builder reads build.icon).
  fs.writeFileSync(path.join(buildDir, "icon.png"), await render(512));
  // Web favicon for every served page (public/ is the web root).
  fs.writeFileSync(path.join(publicDir, "favicon.png"), await render(256));
  // Multi-size .ico so the taskbar / favicon stay crisp small instead of a blurry down-scaled 512.
  const sizes = [16, 32, 48, 64, 128, 256];
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), buildIco(sizes, await Promise.all(sizes.map(render))));
  console.log("Wrote build/icon.png, public/favicon.png, public/favicon.ico");
}

main().catch((err) => { console.error(err); process.exit(1); });
