// ⛔ #nova-does-not-find-the-game — WHERE THE GAME IS, ASKED OF EVERY PLACE THAT RECORDS IT, AND NEVER A GUESS.
//
// A modder on Discord (gemmov, 2026-11-02): Nova does not find their Hearts of Iron IV folder. Nothing more of their setup is
// known, so this covers every likely cause. At 7413bdcc server.js asked ONE place — the Uninstall key Steam writes for app
// 394360, through reg.exe, in the 64-bit view only, decoding reg.exe's OEM-code-page output as UTF-8 — then five fixed folders,
// and with none holding the game it went on with the first of them as if it did.
//
// detectHoi4GameFolder is pure: the registry, the drive list and the file system are handed in, so each case below is a
// machine of its own, stood up in memory. Nothing here reads or writes a real game, mod or registry key, except section 9,
// which READS this machine's registry and Steam files to show the owner's answer is the one 7413bdcc gave.
"use strict";
// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, server.js's app data is a sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const W = path.win32;
const same = (a, b) => !!a && !!b && W.normalize(String(a)).toLowerCase() === W.normalize(String(b)).toLowerCase();

const S = require("./server.js");
const { detectHoi4GameFolder, steamLibraryFoldersFromVdf, steamAppInstallDir, regQueryValue, regExportedValue, readRegistryPath } = S;

/** A Windows machine in memory: { "C:\\path\\file": text | Buffer, "C:\\dir": null } — every parent folder exists. With
 *  P = path.posix, a Linux or Mac one ("/home/…", case-sensitive). */
function machine(files, P = W) {
  const norm = (p) => { let s = P.normalize(String(p)); while (s.length > (P === W ? 3 : 1) && /[\\/]$/.test(s)) s = s.slice(0, -1); return P === W ? s.toLowerCase() : s; };
  const fileMap = new Map(), dirs = new Map();
  const addDir = (p) => { let d = P.normalize(String(p)); for (;;) { const k = norm(d); if (!dirs.has(k)) dirs.set(k, d); const up = P.dirname(d); if (up === d) break; d = up; } };
  for (const [p, c] of Object.entries(files)) {
    if (c === null) addDir(p);
    else { fileMap.set(norm(p), { p: P.normalize(p), c }); addDir(P.dirname(P.normalize(p))); }
  }
  const enoent = (p) => { const e = new Error("ENOENT: no such file or directory, " + p); e.code = "ENOENT"; return e; };
  const reads = [];
  return {
    reads,
    existsSync: (p) => fileMap.has(norm(p)) || dirs.has(norm(p)),
    readFileSync: (p, enc) => {
      reads.push(String(p));
      const f = fileMap.get(norm(p));
      if (!f) throw enoent(p);
      const buf = Buffer.isBuffer(f.c) ? f.c : Buffer.from(String(f.c), "utf8");
      return enc ? buf.toString(enc) : buf;
    },
    readdirSync: (p) => {
      const k = norm(p);
      if (!dirs.has(k)) throw enoent(p);
      const kids = new Set();
      for (const [fk, f] of fileMap) if (norm(P.dirname(f.p)) === k) kids.add(P.basename(f.p));
      for (const [dk, d] of dirs) if (dk !== k && norm(P.dirname(d)) === k) kids.add(P.basename(d));
      return [...kids];
    },
  };
}
/** A registry in memory: { "KEY|Name|view": "value" }; every question it is asked is kept. */
function registry(values) {
  const calls = [];
  const fn = (key, name, view) => { calls.push(`${key}|${name}|${view}`); const v = values[`${key}|${name}|${view}`]; return v === undefined ? null : v; };
  fn.calls = calls;
  return fn;
}
const HKCU_STEAM = "HKCU\\Software\\Valve\\Steam|SteamPath|";
const HKLM_STEAM_32 = "HKLM\\SOFTWARE\\Valve\\Steam|InstallPath|32";
const HKLM_STEAM_64 = "HKLM\\SOFTWARE\\Valve\\Steam|InstallPath|64";
const UNINSTALL = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 394360|InstallLocation|";
const EXE = "hoi4.exe";
const game = (dir) => ({ [W.join(dir, EXE)]: "MZ" });
const vdfNew = (libs) => [
  "\"libraryfolders\"", "{",
  ...libs.map((l, i) => [
    `\t"${i}"`, "\t{",
    `\t\t"path"\t\t"${l.path.replace(/\\/g, "\\\\")}"`, "\t\t\"label\"\t\t\"\"", "\t\t\"contentid\"\t\t\"7215344342198057986\"",
    "\t\t\"apps\"", "\t\t{", ...(l.apps || []).map((a) => `\t\t\t"${a}"\t\t"9955660831"`), "\t\t}", "\t}"].join("\n")),
  "}", ""].join("\n");
const vdfOld = (libs) => ["\"LibraryFolders\"", "{", "\t\"TimeNextStatsReport\"\t\t\"1612345678\"", "\t\"ContentStatsID\"\t\t\"-4512345678901234567\"",
  ...libs.map((p, i) => `\t"${i + 1}"\t\t"${p.replace(/\\/g, "\\\\")}"`), "}", ""].join("\n");
const acf = (installdir) => ["\"AppState\"", "{", "\t\"appid\"\t\t\"394360\"", "\t\"universe\"\t\t\"1\"", "\t\"name\"\t\t\"Hearts of Iron IV\"",
  "\t\"StateFlags\"\t\t\"4\"", `\t"installdir"\t\t"${installdir}"`, "\t\"InstalledDepots\"", "\t{", "\t\t\"394361\"", "\t\t{", "\t\t\t\"manifest\"\t\t\"1788788840131312370\"", "\t\t}", "\t}", "}", ""].join("\n");
const ask = (m, reg, extra) => detectHoi4GameFolder(Object.assign({ platform: "win32", env: {}, choice: "", root: "", readRegistry: reg, listDrives: () => [], fs: m }, extra || {}));

try {
  console.log("\n1. ⭐⭐⭐ a library on a second drive: Steam's own list of libraries, and the library's manifest");
  {
    const STEAM = "C:\\Program Files (x86)\\Steam", LIB = "G:\\Games\\SteamLibrary";
    const GAME = W.join(LIB, "steamapps", "common", "Hearts of Iron IV");
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM, apps: ["228980"] }, { path: LIB, apps: ["394360", "255710"] }]),
      [W.join(LIB, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(GAME),
    });
    const reg = registry({ [HKCU_STEAM]: "c:/program files (x86)/steam" });
    const r = ask(m, reg);
    ok(r.found && same(r.found.path, GAME), "⭐⭐⭐ the game in G:\\Games\\SteamLibrary is found (the Uninstall key and the five folders name none of it)", r);
    ok(r.found && r.found.source === "steam" && /G:\\Games\\SteamLibrary/.test(r.found.where), "…and it says where: \"the Steam library G:\\Games\\SteamLibrary\"", r.found);
    ok(r.found && /SteamPath/.test(r.found.how) && /appmanifest_394360\.acf/.test(r.found.how), "…and how: the registry value and the manifest it read", r.found && r.found.how);
    ok(r.found && r.found.path === GAME, "…spelled as Steam's library list spells it, not as SteamPath's lower case", r.found && r.found.path);
    ok(reg.calls.length === 1, "⏱ one registry question was enough: the search stops at the first folder that holds the game", reg.calls);
    ok(steamLibraryFoldersFromVdf(vdfNew([{ path: STEAM }, { path: LIB, apps: ["394360"] }])).map((l) => l.path).join("|") === `${STEAM}|${LIB}`,
      "…the current libraryfolders.vdf format: every library's \"path\", unescaped", steamLibraryFoldersFromVdf(vdfNew([{ path: STEAM }, { path: LIB }])));
  }

  console.log("\n2. ⭐⭐ the 32-bit view only — and the Uninstall key in both views");
  {
    const STEAM = "E:\\Steam", GAME = "E:\\Steam\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM, apps: ["394360"] }]),
      [W.join(STEAM, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(GAME),
    });
    const reg = registry({ [HKLM_STEAM_32]: STEAM });
    const r = ask(m, reg);
    ok(r.found && same(r.found.path, GAME) && /32-bit/.test(r.found.how), "⭐⭐ InstallPath written only to WOW6432Node (a 32-bit Steam) is read: the 32-bit view is asked explicitly", r.found);
    ok(reg.calls.includes(HKLM_STEAM_32) && reg.calls.includes(HKCU_STEAM), "…after HKCU's SteamPath, which this machine does not have", reg.calls);
    const m2 = machine({ ...game("F:\\HOI4") });
    const reg2 = registry({ [UNINSTALL + "32"]: "F:\\HOI4" });
    const r2 = ask(m2, reg2);
    ok(r2.found && same(r2.found.path, "F:\\HOI4") && r2.found.source === "steam-uninstall" && /32-bit view/.test(r2.found.how),
      "⭐ the Uninstall key in the 32-bit view only is read too (7413bdcc asked the 64-bit view alone)", r2.found);
    ok(reg2.calls.indexOf(UNINSTALL + "64") !== -1 && reg2.calls.indexOf(UNINSTALL + "64") < reg2.calls.indexOf(UNINSTALL + "32"), "…the 64-bit view first, as before", reg2.calls);
  }

  console.log("\n3. ⭐⭐ the old libraryfolders.vdf format (before 2021: \"1\" \"D:\\\\SteamLibrary\")");
  {
    const STEAM = "C:\\Steam", LIB = "H:\\SteamLibrary", GAME = "H:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfOld([LIB]),
      [W.join(LIB, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(GAME),
    });
    const r = ask(m, registry({ [HKCU_STEAM]: "c:/steam" }));
    ok(r.found && same(r.found.path, GAME), "⭐⭐ a library the old format lists is found", r);
    const libs = steamLibraryFoldersFromVdf(vdfOld([LIB, "I:\\More Games"]));
    ok(libs.length === 2 && libs[0].path === LIB && libs[1].path === "I:\\More Games", "…its numbered entries are libraries; TimeNextStatsReport and ContentStatsID are not", libs);
  }

  console.log("\n4. ⭐⭐ an appmanifest naming a different installdir");
  {
    const LIB = "D:\\SteamLibrary", GAME = "D:\\SteamLibrary\\steamapps\\common\\HOI4 Beta";
    const m = machine({
      ["C:\\Program Files (x86)\\Steam\\steam.exe"]: "MZ",
      ["C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf"]: vdfNew([{ path: "C:\\Program Files (x86)\\Steam" }, { path: LIB, apps: ["394360"] }]),
      [W.join(LIB, "steamapps", "appmanifest_394360.acf")]: acf("HOI4 Beta"),
      [W.join(LIB, "steamapps", "common", "Hearts of Iron IV", "mod", "left_over.txt")]: "an old copy's leftovers, no hoi4.exe",
      ...game(GAME),
    });
    const r = ask(m, registry({ [HKCU_STEAM]: "c:/program files (x86)/steam" }));
    ok(r.found && same(r.found.path, GAME), "⭐⭐ the folder the manifest names (common\\HOI4 Beta) is the game, not common\\Hearts of Iron IV", r);
    ok(steamAppInstallDir(acf("HOI4 Beta")) === "HOI4 Beta", "…the installdir is read out of the manifest", steamAppInstallDir(acf("HOI4 Beta")));
  }

  console.log("\n5. ⭐⭐⭐ a path with non-ASCII letters, from the registry to the disk");
  {
    const STEAM = "D:\\Игры\\Steam", LIB = "E:\\Spiele Äö\\SteamLibrary", GAME = "E:\\Spiele Äö\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM }, { path: LIB, apps: ["394360"] }]),
      [W.join(LIB, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(GAME),
    });
    const r = ask(m, registry({ [HKCU_STEAM]: "d:/игры/steam" }));
    ok(r.found && r.found.path === GAME, "⭐⭐ a Steam folder under D:\\Игры and a library under E:\\Spiele Äö are followed letter for letter", r);
    // What reg.exe hands a pipe: the OEM code page. Measured 2026-11-03 (OEMCP 437): U+00B5 came as the byte E6, which the old
    // reader decoded as UTF-8 to U+FFFD; U+00AE, which CP437 lacks, came as a best-fit "r". Here, Cyrillic through CP866.
    const cp866 = Buffer.concat([Buffer.from("\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    d:/", "latin1"),
      Buffer.from([0xa8, 0xa3, 0xe0, 0xeb]), Buffer.from("/steam\r\n\r\n", "latin1")]);
    const oldDecoded = /SteamPath\s+REG_SZ\s+(.+)/i.exec(cp866.toString("utf8"))[1].trim();
    ok(oldDecoded !== "d:/игры/steam" && /\uFFFD/.test(oldDecoded), "control: decoded as UTF-8, as 7413bdcc read it, the folder name is lost", oldDecoded);
    const q = regQueryValue(cp866, "SteamPath");
    ok(q !== null && !/^[\x20-\x7e]*$/.test(q), "…regQueryValue keeps the bytes visible (latin1), so the reader can tell the answer is not plain ASCII", q);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\Software\\Valve\\Steam]\r\n"
      + "\"SteamExe\"=\"d:/игры/steam/steam.exe\"\r\n\"SteamPath\"=\"d:/игры/steam\"\r\n\"Language\"=\"english\"\r\n\r\n"
      + "[HKEY_CURRENT_USER\\Software\\Valve\\Steam\\Apps]\r\n\"SteamPath\"=\"not this one\"\r\n", "utf16le")]);
    ok(regExportedValue(utf16, "SteamPath") === "d:/игры/steam", "⭐ reg export's UTF-16 file gives the value exactly, from the key's own section (not a subkey's)", regExportedValue(utf16, "SteamPath"));
    const hex2 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Windows Registry Editor Version 5.00\r\n\r\n[HKEY_LOCAL_MACHINE\\SOFTWARE\\Valve\\Steam]\r\n"
      + "\"InstallPath\"=hex(2):25,00,53,00,79,00,73,00,74,00,65,00,6d,00,44,00,72,00,69,00,76,00,65,00,25,00,5c,00,\\\r\n"
      + "  1c,04,3e,04,38,04,00,00\r\n", "utf16le")]);
    ok(regExportedValue(hex2, "InstallPath") === "%SystemDrive%\\Мои", "…and a REG_EXPAND_SZ written as hex(2), continued over two lines", regExportedValue(hex2, "InstallPath"));
    // The reader's own decision, with reg.exe stood in for: the quick answer is not ASCII, so it asks reg export.
    const seenArgs = [];
    const fakeReg = (cmd, args) => {
      seenArgs.push(args[0]);
      if (args[0] === "query") return { status: 0, stdout: cp866 };
      if (args[0] === "export") { fs.writeFileSync(args[2], utf16); return { status: 0, stdout: Buffer.alloc(0) }; }
      return { status: 1 };
    };
    const read = process.platform === "win32" ? readRegistryPath("HKCU\\Software\\Valve\\Steam", "SteamPath", "", fakeReg) : "d:/игры/steam";
    ok(read === "d:/игры/steam", "⭐⭐⭐ readRegistryPath: a reg query answer that is not plain ASCII is read again through reg export, exactly", { read, seenArgs });
    ok(process.platform !== "win32" || seenArgs.join(",") === "query,export", "…query first, export only because of it", seenArgs);
    const tmpLeft = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(`nova-registry-${process.pid}-`));
    ok(tmpLeft.length === 0, "…and the file reg export wrote in the temp folder is gone", tmpLeft);
    const plainArgs = [];
    const plainReg = (cmd, args) => { plainArgs.push(args[0]); return { status: 0, stdout: Buffer.from(`\r\nHKEY_CURRENT_USER\\X\r\n    SteamPath    REG_SZ    ${os.tmpdir().replace(/\\/g, "/")}\r\n`, "latin1") }; };
    const plain = process.platform === "win32" ? readRegistryPath("HKCU\\X", "SteamPath", "", plainReg) : null;
    ok(process.platform !== "win32" || (same(plain, os.tmpdir()) && plainArgs.join(",") === "query"), "⏱ a plain-ASCII answer naming a folder that exists is taken as it is: no export", { plain, plainArgs });
    const missing = process.platform === "win32" ? readRegistryPath("HKCU\\X", "SteamPath", "", () => ({ status: 1, stdout: Buffer.alloc(0) })) : null;
    ok(missing === null, "…and no such value is null", missing);
  }

  console.log("\n5b. ⭐⭐⭐ ENGLISH WINDOWS (OEM code page 437): reg query's answer is PLAIN ASCII and wrong — '?' or a best-fit letter");
  // Measured 2026-11-03 on this machine (OEMCP 437): a letter CP437 has not got comes out of `reg query` as "?" (Cyrillic, CJK,
  // Vietnamese) or as its best-fit ASCII letter (Ć -> C, Ł -> L, U+00AE -> r). Either way the answer is plain ASCII, so only its
  // naming nothing that exists sends readRegistryPath on to `reg export` (UTF-16). Section 5 fed it CP866 bytes, which are not
  // ASCII: this half — the one an English Windows with a D:\Игры or C:\Ćwiczenia folder takes — was pinned by nothing.
  if (process.platform !== "win32") {
    console.log("  SKIP: not Windows — readRegistryPath answers null off Windows; THIS SECTION DID NOT RUN");
  } else {
    /** reg.exe stood in for: { "KEY|Name": [what reg query prints (latin1), the exact value reg export writes (UTF-16)] }. */
    const regExe = (answers) => {
      const args = [];
      const run = (cmd, a) => {
        if (a[0] === "query") {
          args.push("query");
          const hit = answers[`${a[1]}|${a[3]}`];
          if (!hit) return { status: 1, stdout: Buffer.alloc(0) };
          return { status: 0, stdout: Buffer.from(`\r\n${a[1]}\r\n    ${a[3]}    REG_SZ    ${hit[0]}\r\n\r\n`, "latin1") };
        }
        if (a[0] === "export") {
          args.push("export");
          const name = Object.keys(answers).find((k) => k.startsWith(`${a[1]}|`));
          if (!name) return { status: 1, stdout: Buffer.alloc(0) };
          const value = answers[name][1].replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
          fs.writeFileSync(a[2], Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`Windows Registry Editor Version 5.00\r\n\r\n[${a[1]}]\r\n"${name.split("|")[1]}"="${value}"\r\n\r\n`, "utf16le")]));
          return { status: 0, stdout: Buffer.alloc(0) };
        }
        return { status: 1, stdout: Buffer.alloc(0) };
      };
      run.args = args;
      return run;
    };
    const HKCU_KEY = "HKCU\\Software\\Valve\\Steam", HKLM_KEY = "HKLM\\SOFTWARE\\Valve\\Steam";
    const q437 = regExe({ [`${HKCU_KEY}|SteamPath`]: ["d:/????/steam", "d:/игры/steam"] });
    const cyr = readRegistryPath(HKCU_KEY, "SteamPath", "", q437);
    ok(cyr === "d:/игры/steam", "⭐⭐⭐ \"d:/????/steam\" (Cyrillic through CP437): plain ASCII naming nothing, so reg export is asked, and its value is exact", { cyr, args: q437.args });
    ok(q437.args.join(",") === "query,export", "…query first, then export because the plain answer names no folder", q437.args);
    const bestFit = regExe({ [`${HKLM_KEY}|InstallPath`]: ["C:\\Cwiczenia\\Steam", "C:\\Ćwiczenia\\Steam"] });
    const pol = readRegistryPath(HKLM_KEY, "InstallPath", "32", bestFit);
    ok(pol === "C:\\Ćwiczenia\\Steam" && bestFit.args.join(",") === "query,export", "⭐⭐ a best-fit letter (Ć written as C): the same — the exact folder, through reg export", { pol, args: bestFit.args });
    const cjk = regExe({ [`${HKCU_KEY}|SteamPath`]: ["e:/??/steam", "e:/游戏/steam"] });
    ok(readRegistryPath(HKCU_KEY, "SteamPath", "", cjk) === "e:/游戏/steam", "…and a CJK folder name, which CP437 writes as \"??\"", cjk.args);
    // end to end: Steam under D:\Игры on an English Windows is found — the registry, then the disk, letter for letter
    const STEAM = "D:\\Игры\\Steam", GAME = "D:\\Игры\\Steam\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM, apps: ["394360"] }]),
      [W.join(STEAM, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(GAME),
    });
    const e2e = regExe({ [`${HKCU_KEY}|SteamPath`]: ["d:/????/steam", "d:/игры/steam"] });
    const r = ask(m, (key, name, view) => readRegistryPath(key, name, view, e2e));
    ok(r.found && r.found.path === GAME && r.found.source === "steam" && /SteamPath/.test(r.found.how),
      "⭐⭐⭐ end to end: an English Windows with Steam in D:\\Игры finds the game through HKCU SteamPath", { found: r.found, args: e2e.args });
    const leftover = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(`nova-registry-${process.pid}-`));
    ok(leftover.length === 0, "…and every file reg export wrote is gone", leftover);
  }

  console.log("\n6. ⭐⭐ a game moved out of the library the vdf names");
  {
    const STEAM = "C:\\Program Files (x86)\\Steam", OLD = "D:\\SteamLibrary", NEW = "F:\\Games";
    const GAME = "F:\\Games\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      // the list still says D: holds 394360; Steam moved it to F: and D: kept only a stale manifest
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM }, { path: OLD, apps: ["394360"] }, { path: NEW, apps: [] }]),
      [W.join(OLD, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      [W.join(NEW, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(GAME),
    });
    const r = ask(m, registry({ [HKCU_STEAM]: "c:/program files (x86)/steam" }));
    ok(r.found && same(r.found.path, GAME), "⭐⭐ the game is found where it is now (F:), not where the list last said (D:)", r);
    const stale = r.candidates.find((c) => same(c.path, "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV"));
    ok(stale && !stale.valid && /no such folder/.test(stale.reason), "…the library the list names was asked first, and said why it is not the game", stale);
  }

  console.log("\n6b. ⭐⭐ a Steam that keeps its library list in config\\libraryfolders.vdf only");
  {
    // Measured 2026-11-03: the owner's Steam keeps the list in BOTH steamapps\ and config\; a Steam that has dropped one of them
    // must still be read. Nothing else here reaches G:\Lib: no drive list, and no usual folder is named like it.
    const STEAM = "C:\\Steam Two", LIB = "G:\\Lib", GAME = "G:\\Lib\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "config", "libraryfolders.vdf")]: vdfNew([{ path: STEAM, apps: ["228980"] }, { path: LIB, apps: ["394360"] }]),
      [W.join(LIB, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(GAME),
    });
    const r = ask(m, registry({ [HKCU_STEAM]: "c:/steam two" }));
    ok(r.found && r.found.path === GAME && r.found.source === "steam", "⭐⭐ the library config\\libraryfolders.vdf lists is followed", r);
    ok(m.reads.some((p) => /\\config\\libraryfolders\.vdf$/i.test(p)), "…and that file is what was read for it", m.reads);
  }

  console.log("\n6c. ⭐⭐ two full copies after a library move: the library whose \"apps\" claim 394360 wins, wherever the list puts it");
  {
    // Steam moved the game from H:\Old to I:\New and left the old folder whole (a move that was interrupted, a copy put back by
    // hand). Both hold hoi4.exe and a manifest. The list names H:\Old FIRST, but only I:\New's "apps" claims 394360: Steam updates,
    // launches and loads mods into that copy, so it is the one Nova must read.
    const STEAM = "C:\\Steam Three", OLD = "H:\\Old", NEW = "I:\\New";
    const OLDGAME = "H:\\Old\\steamapps\\common\\Hearts of Iron IV", NEWGAME = "I:\\New\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM }, { path: OLD, apps: ["255710"] }, { path: NEW, apps: ["394360"] }]),
      [W.join(OLD, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      [W.join(NEW, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(OLDGAME), ...game(NEWGAME),
    });
    const r = ask(m, registry({ [HKCU_STEAM]: "c:/steam three" }));
    ok(r.found && r.found.path === NEWGAME, "⭐⭐ the copy in the library Steam's list says holds 394360 (I:\\New), not the first one listed (H:\\Old)", r.found);
    const all = ask(m, registry({ [HKCU_STEAM]: "c:/steam three" }), { all: true });
    const order = all.candidates.filter((c) => c.source === "steam").map((c) => c.path);
    ok(order.indexOf(NEWGAME) === 0 && order.indexOf(OLDGAME) > 0, "…asked first; the other copy after it", order);
  }

  console.log("\n6d. ⭐ a library's game folder with no manifest: a copy put there by hand, or a manifest Steam has lost");
  {
    const STEAM = "C:\\Steam Four", LIB = "J:\\Hand Copied", GAME = "J:\\Hand Copied\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM }, { path: LIB, apps: [] }]),
      ...game(GAME),
    });
    const r = ask(m, registry({ [HKCU_STEAM]: "c:/steam four" }));
    ok(r.found && r.found.path === GAME && r.found.source === "steam" && /no appmanifest_394360\.acf/.test(r.found.how),
      "⭐ found in a listed library without appmanifest_394360.acf, and it says so", r.found);
  }

  console.log("\n7. ⭐⭐⭐ nothing found at all: no folder — NOT the hard default");
  {
    const empty = ask(machine({}), registry({}), { listDrives: () => ["C:\\", "D:\\"] });
    ok(empty.found === null, "⭐⭐⭐ with no game anywhere, found is null", empty.found);
    ok(empty.candidates.every((c) => !c.valid), "…and no candidate claims to be the game", empty.candidates);
    // An uninstall leaves the folder behind when anything not Steam's was in it; 7413bdcc took any folder that EXISTED.
    const leftovers = machine({ "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV\\mod\\my_old_mod.mod": "name=\"x\"" });
    const r = ask(leftovers, registry({ [UNINSTALL + "64"]: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV" }), { listDrives: () => ["C:\\"] });
    ok(r.found === null, "⭐⭐ an uninstalled game's leftover folder (no hoi4.exe) is not the game, even with the Uninstall key still naming it", r);
    const named = r.candidates.find((c) => c.source === "steam-uninstall");
    ok(named && !named.valid && /no hoi4\.exe/.test(named.reason), "…and the Uninstall key's folder is listed with the reason", named);
    const srv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r/g, "");
    const body = (name) => { const a = srv.indexOf(`\nfunction ${name}(`); return a < 0 ? "" : srv.slice(a, srv.indexOf("\n}\n", a)); };
    // resolveHoi4GameRoot answers what gameRootInUse picks (and notes a change: #the-game-folder-moved-by-itself)
    const rg = body("resolveHoi4GameRoot") + body("gameRootInUse");
    ok(rg && /const root = gameRootInUse\(\);/.test(rg) && !/Hearts of Iron IV|Program Files|SteamLibrary/.test(rg) && /return NO_GAME_FOLDER;/.test(rg),
      "⭐ resolveHoi4GameRoot names no folder of its own: with nothing found it answers NO_GAME_FOLDER", rg.slice(0, 300));
    ok(!fs.existsSync(S.NO_GAME_FOLDER), "…a folder that does not exist, so every reader reads nothing from it", S.NO_GAME_FOLDER);
  }

  console.log("\n8. ⭐⭐ the order: the modder's choice, then HOI4_ROOT, then Steam's record; each only with hoi4.exe in it");
  {
    const STEAM = "C:\\Steam", SGAME = "C:\\Steam\\steamapps\\common\\Hearts of Iron IV", CHOSEN = "K:\\My HOI4", ENVG = "L:\\Env HOI4";
    const base = {
      [W.join(STEAM, "steam.exe")]: "MZ",
      [W.join(STEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: STEAM, apps: ["394360"] }]),
      [W.join(STEAM, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...game(SGAME), ...game(CHOSEN), ...game(ENVG),
    };
    const reg = registry({ [HKCU_STEAM]: "c:/steam" });
    const a = ask(machine(base), reg, { choice: CHOSEN, env: { HOI4_ROOT: ENVG } });
    ok(a.found && same(a.found.path, CHOSEN) && a.found.source === "choice", "⭐⭐ the modder's choice comes first", a.found);
    ok(reg.calls.length === 0, "…and with it holding the game, the registry is not asked at all", reg.calls);
    const b = ask(machine(base), registry({ [HKCU_STEAM]: "c:/steam" }), { env: { HOI4_ROOT: ENVG } });
    ok(b.found && same(b.found.path, ENVG) && b.found.source === "env", "⭐ HOI4_ROOT next", b.found);
    const c = ask(machine(base), registry({ [HKCU_STEAM]: "c:/steam" }), { choice: "K:\\Not The Game", env: { HOI4_ROOT: "L:\\Nor This" } });
    ok(c.found && same(c.found.path, SGAME) && c.found.source === "steam", "⭐ a choice and a HOI4_ROOT that hold no game are passed over for Steam's record", c.found);
    ok(c.candidates[0].source === "choice" && !c.candidates[0].valid && c.candidates[1].source === "env" && !c.candidates[1].valid,
      "…each listed first, with why it is not the game", c.candidates.slice(0, 2));
    const all = ask(machine(base), registry({ [HKCU_STEAM]: "c:/steam" }), { choice: CHOSEN, env: { HOI4_ROOT: ENVG }, all: true });
    ok(all.candidates.map((x) => x.source).slice(0, 3).join(",") === "choice,env,steam", "…and asked for all, the order is choice, HOI4_ROOT, Steam", all.candidates.map((x) => x.source));
  }

  console.log("\n9. ⭐ what exists: Game Pass (the Xbox app's folders), Linux Steam through Wine, the folders above Nova");
  {
    const gr = Buffer.concat([Buffer.from("RGBX", "latin1"), Buffer.from([1, 0, 0, 0]), Buffer.from("XboxGames\u0000", "utf16le")]);
    const XGAME = "D:\\XboxGames\\Hearts of Iron IV\\Content";
    const r = ask(machine({ "D:\\.GamingRoot": gr, ...game(XGAME) }), registry({}), { listDrives: () => ["C:\\", "D:\\"] });
    ok(r.found && same(r.found.path, XGAME) && r.found.source === "xbox", "⭐ Game Pass: <drive>\\XboxGames\\Hearts of Iron IV\\Content, the folder .GamingRoot names", r.found);
    const gr2 = Buffer.concat([Buffer.from("RGBX", "latin1"), Buffer.from([1, 0, 0, 0]), Buffer.from("Spiele\\Xbox\u0000", "utf16le")]);
    const r2 = ask(machine({ "E:\\.GamingRoot": gr2, ...game("E:\\Spiele\\Xbox\\Hearts of Iron IV - Ultimate\\Content") }), registry({}), { listDrives: () => ["E:\\"] });
    ok(r2.found && same(r2.found.path, "E:\\Spiele\\Xbox\\Hearts of Iron IV - Ultimate\\Content"), "…wherever .GamingRoot puts the games folder, and whatever the edition adds to the name", r2.found);
    const LSTEAM = "Z:\\home\\gem\\.local\\share\\Steam";
    const LGAME = "Z:\\mnt\\games\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(LSTEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: "/home/gem/.local/share/Steam" }, { path: "/mnt/games/SteamLibrary", apps: ["394360"] }]),
      ["Z:\\mnt\\games\\SteamLibrary\\steamapps\\appmanifest_394360.acf"]: acf("Hearts of Iron IV"),
      ...game(LGAME),
    });
    const r3 = ask(m, registry({}), { env: { WINEHOMEDIR: "\\??\\Z:\\home\\gem" }, listDrives: () => ["C:\\"] });
    ok(r3.found && same(r3.found.path, LGAME), "⭐ Linux Steam seen through Wine, the WINDOWS build installed through Proton (hoi4.exe): its home is Z:\\home\\<you>, and its library list's /mnt/... is Z:\\mnt\\...", r3.found);
    const r4 = ask(machine({ ...game("C:\\Games\\HOI4") }), registry({}), { root: "C:\\Games\\HOI4\\tools\\nova" });
    ok(r4.found && same(r4.found.path, "C:\\Games\\HOI4") && r4.found.source === "nova", "…and the folders above Nova, as resolveHoi4GameRoot always walked them", r4.found);
    const r5 = ask(machine({ ...game("D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV") }), registry({}));
    ok(r5.found && r5.found.source === "usual", "…and the five folders 7413bdcc knew are still asked", r5.found);
  }

  console.log("\n9b. ⭐⭐⭐ the game's LINUX and MAC programs: a native install has no hoi4.exe at all");
  {
    // Steam's launch configs for app 394360 (appcache/appinfo.vdf, read 2026-11-03): Windows runs hoi4.exe, Linux run_hoi4 (a
    // script that runs the `hoi4` beside it), macOS hoi4.app. Steam installs the Linux build on Linux by default, so Nova under
    // Wine/Proton meets a game folder with run_hoi4 and hoi4 in it and no hoi4.exe — which detection passed over without listing.
    const linuxGame = (dir, J = W.join) => ({ [J(dir, "hoi4")]: "\u007fELF", [J(dir, "run_hoi4")]: "#!/bin/sh\n\"$GAME_DIR/hoi4\" \"$@\"\n" });
    const LSTEAM = "Z:\\home\\gem\\.local\\share\\Steam", LGAME = "Z:\\home\\gem\\.local\\share\\Steam\\steamapps\\common\\Hearts of Iron IV";
    const m = machine({
      [W.join(LSTEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: "/home/gem/.local/share/Steam", apps: ["394360"] }]),
      [W.join(LSTEAM, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      ...linuxGame(LGAME),
    });
    const r = ask(m, registry({}), { env: { WINEHOMEDIR: "\\??\\Z:\\home\\gem" }, listDrives: () => ["C:\\"] });
    ok(r.found && r.found.path === LGAME && r.found.source === "steam", "⭐⭐⭐ Nova under Wine finds a NATIVE Linux install (hoi4 + run_hoi4, no hoi4.exe) in Linux Steam's library", r);
    const P = path.posix;
    const pm = machine({
      "/home/gem/.local/share/Steam/steamapps/libraryfolders.vdf": vdfNew([{ path: "/home/gem/.local/share/Steam" }, { path: "/mnt/big/SteamLibrary", apps: ["394360"] }]),
      "/mnt/big/SteamLibrary/steamapps/appmanifest_394360.acf": acf("Hearts of Iron IV"),
      ...linuxGame("/mnt/big/SteamLibrary/steamapps/common/Hearts of Iron IV", P.join),
    }, P);
    const rl = detectHoi4GameFolder({ platform: "linux", env: { HOME: "/home/gem" }, choice: "", root: "", readRegistry: registry({}), listDrives: () => [], fs: pm });
    ok(rl.found && rl.found.path === "/mnt/big/SteamLibrary/steamapps/common/Hearts of Iron IV", "⭐⭐ …and so does Nova on Linux itself", rl);
    const mm = machine({
      "/Users/gem/Library/Application Support/Steam/steamapps/libraryfolders.vdf": vdfNew([{ path: "/Users/gem/Library/Application Support/Steam", apps: ["394360"] }]),
      "/Users/gem/Library/Application Support/Steam/steamapps/appmanifest_394360.acf": acf("Hearts of Iron IV"),
      "/Users/gem/Library/Application Support/Steam/steamapps/common/Hearts of Iron IV/hoi4.app/Contents/MacOS/hoi4": "\u00cf\u00fa\u00ed\u00fe",
    }, P);
    const rm = detectHoi4GameFolder({ platform: "darwin", env: { HOME: "/Users/gem" }, choice: "", root: "", readRegistry: registry({}), listDrives: () => [], fs: mm });
    ok(rm.found && rm.found.path === "/Users/gem/Library/Application Support/Steam/steamapps/common/Hearts of Iron IV", "⭐⭐ a Mac install (hoi4.app) is the game too", rm);
    const cm = machine({
      "Z:\\Users\\gem\\Library\\Application Support\\Steam\\steamapps\\libraryfolders.vdf": vdfNew([{ path: "/Users/gem/Library/Application Support/Steam", apps: ["394360"] }]),
      "Z:\\Users\\gem\\Library\\Application Support\\Steam\\steamapps\\appmanifest_394360.acf": acf("Hearts of Iron IV"),
      "Z:\\Users\\gem\\Library\\Application Support\\Steam\\steamapps\\common\\Hearts of Iron IV\\hoi4.app\\Contents\\MacOS\\hoi4": "x",
    });
    const rc = ask(cm, registry({}), { env: { WINEHOMEDIR: "\\??\\Z:\\Users\\gem" }, listDrives: () => ["C:\\"] });
    ok(rc.found && rc.found.path === "Z:\\Users\\gem\\Library\\Application Support\\Steam\\steamapps\\common\\Hearts of Iron IV", "⭐ …and so is it seen from Wine on a Mac (CrossOver): Wine's Z: is the Mac's /, and the Mac's Steam folder is asked", rc);
    // CONTROLS: what a Windows install leaves behind is not the game. run_hoi4 rides in the content every system gets (the owner's
    // Windows install has it), and a lone file called hoi4 says nothing.
    const leftovers = machine({
      [W.join(LSTEAM, "steamapps", "libraryfolders.vdf")]: vdfNew([{ path: "/home/gem/.local/share/Steam", apps: ["394360"] }]),
      [W.join(LSTEAM, "steamapps", "appmanifest_394360.acf")]: acf("Hearts of Iron IV"),
      [W.join(LGAME, "run_hoi4")]: "#!/bin/sh\n",
      "C:\\Games\\Odd\\hoi4": "a file called hoi4, nothing more",
    });
    const rx = ask(leftovers, registry({}), { env: { WINEHOMEDIR: "\\??\\Z:\\home\\gem" }, listDrives: () => ["C:\\"], choice: "C:\\Games\\Odd" });
    ok(rx.found === null, "control: run_hoi4 alone, or a file called hoi4 alone, is not the game", rx.found);
    const listed = rx.candidates.find((c) => c.path === LGAME);
    ok(listed && !listed.valid && /there is no hoi4\.exe in it/.test(listed.reason) && /appmanifest_394360\.acf/.test(listed.how),
      "⭐⭐ …and the folder Steam's manifest names is LISTED with why, though it was reached on a quiet route (Home's \"Where Nova looked\")", rx.candidates);
    const S2 = require("./mod-index.js");
    ok(typeof S2.isHoi4GameFolder === "function" && S2.HOI4_GAME_MARKERS.some((m2) => m2.join() === "hoi4.exe"), "the marker lives in ONE place (mod-index.js isHoi4GameFolder), hoi4.exe among its programs", S2.HOI4_GAME_MARKERS);
  }

  console.log("\n10. ⭐ this machine (READ-ONLY): the answer 7413bdcc gave is the answer now");
  if (process.platform !== "win32") {
    console.log("  SKIP: not Windows — THIS SECTION DID NOT RUN");
  } else {
    const q = spawnSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 394360", "/v", "InstallLocation"], { encoding: "utf8", windowsHide: true });
    const m = /InstallLocation\s+REG_SZ\s+(.+)/i.exec(String(q.stdout || ""));
    const before = m && fs.existsSync(m[1].trim()) ? m[1].trim() : "";
    if (!before) {
      console.log("  SKIP: this machine has no Uninstall key for 394360 naming a folder — the comparison DID NOT RUN");
    } else {
      const now = detectHoi4GameFolder({ platform: "win32", env: Object.assign({}, process.env, { HOI4_ROOT: "" }), choice: "", root: "",
        readRegistry: readRegistryPath, listDrives: () => [], fs });
      ok(now.found && same(now.found.path, before), `⭐ detection finds ${before}, the folder 7413bdcc's one key named`, now.found);
    }
    // A value this machine already has with a letter outside CP437 (measured 2026-11-03): read exactly through the export.
    const ut = spawnSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\uTorrent", "/v", "DisplayName"], { windowsHide: true });
    if (ut.status === 0) {
      ok(readRegistryPath("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\uTorrent", "DisplayName", "") === "\u00B5Torrent",
        "⭐ a real value with U+00B5 comes back exactly (reg query alone gave the byte E6)", readRegistryPath("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\uTorrent", "DisplayName", ""));
    } else {
      console.log("  SKIP: no uTorrent DisplayName on this machine — the real non-ASCII read DID NOT RUN (section 5 ran it with reg.exe stood in for)");
    }
  }
} catch (e) {
  fail++;
  console.log("  FAIL threw: " + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
