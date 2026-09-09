#!/usr/bin/env node
"use strict";

// Builds public/tema-editor.js from VS Code's own default dark theme.
//
//     node scripts/tema-editor/build.cjs [tag]      (default: 1.136.1)
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The editor theme used to be `{ base: "vs-dark", inherit: true, rules: [] }` —
// FIFTEEN colours, and not one syntax rule. Everything a user saw came from
// Monaco's built-in vs-dark, which is "Visual Studio Dark" from 2015. VS Code
// 1.136.1 ships 334 colours and 118 token rules by default.
//
// The default is not guessed. VS Code states it in source:
//   src/vs/workbench/services/themes/common/workbenchThemeService.ts
//     export const COLOR_THEME_DARK = 'Dark 2026';
// which is extensions/theme-defaults/themes/2026-dark.json, and that file
// include-chains back through dark_modern -> dark_plus -> dark_vs. All four are
// merged here in that order, later files winning, exactly as VS Code applies
// them.
//
// ── WHAT CANNOT BE CARRIED ACROSS, AND WHY ───────────────────────────────────
//
// VS Code colours text by TextMate SCOPE (entity.name.function,
// variable.parameter, support.type.primitive — hundreds) plus SEMANTIC tokens
// the language server supplies, which know a parameter from a property from a
// function.
//
// Monaco colours text by MONARCH token: a regex tokenizer producing about a
// dozen classes per language, with no type information at all. A variable, a
// function name and a parameter all arrive as the single token `identifier`.
//
// So the scopes are MAPPED onto the tokens Monaco really emits. What transfers
// is the palette and the whole colours block. What cannot transfer is per-symbol
// colouring, and no amount of theme data changes that.
//
// Source: microsoft/vscode, MIT licensed. See THIRD-PARTY-NOTICES.md.

const fs = require("fs");
const path = require("path");
const https = require("https");

const TAG = process.argv[2] || "1.136.1";
const KELUAR = path.join(__dirname, "..", "..", "public", "tema-editor.js");
// The include chain, in the order VS Code applies it.
const RANTAI = [
  "dark_vs.json",
  "dark_plus.json",
  "dark_modern.json",
  "2026-dark.json",
];

function ambil(jalur) {
  return new Promise((selesai, gagal) => {
    https
      .get(
        {
          hostname: "api.github.com",
          path: jalur,
          headers: {
            "user-agent": "WOLFSPACE",
            accept: "application/vnd.github+json",
          },
        },
        (r) => {
          let b = "";
          r.on("data", (c) => (b += c));
          r.on("end", () => {
            if ((r.statusCode || 0) >= 400) {
              return gagal(new Error("HTTP " + r.statusCode + " " + jalur));
            }
            const j = JSON.parse(b);
            selesai(Buffer.from(j.content, "base64").toString("utf8"));
          });
        },
      )
      .on("error", gagal);
  });
}

/**
 * JSONC, parsed with the strings respected.
 *
 * These files carry line comments AFTER values, not only on their own line —
 * `"entity.name.operator.custom-literal" // See https://…` is real, and a blunt
 * regex either leaves it in or eats the "//" inside a URL somewhere else.
 */
function jsonc(teks) {
  let keluar = "";
  let dalamTeks = false;
  let escape = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (dalamTeks) {
      keluar += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') dalamTeks = false;
      continue;
    }
    if (c === '"') {
      dalamTeks = true;
      keluar += c;
      continue;
    }
    if (c === "/" && teks[i + 1] === "/") {
      while (i < teks.length && teks[i] !== "\n") i++;
      keluar += "\n";
      continue;
    }
    if (c === "/" && teks[i + 1] === "*") {
      i += 2;
      while (i < teks.length && !(teks[i] === "*" && teks[i + 1] === "/")) i++;
      i++;
      continue;
    }
    keluar += c;
  }
  return JSON.parse(keluar.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * The colour VS Code gives a scope, preferring an EXACT match.
 *
 * A prefix match is far too loose: `punctuation` also matches
 * `punctuation.definition.comment`, which is green, and taking it would paint
 * every comma and brace green. Exact first, prefix only as a fallback.
 */
function cariWarna(tokens, ...cari) {
  let persis = null;
  let awalan = null;
  for (const t of tokens) {
    if (!t.settings || !t.settings.foreground) continue;
    const nilai = {
      fg: t.settings.foreground,
      style: t.settings.fontStyle || "",
    };
    const cakupan = Array.isArray(t.scope)
      ? t.scope
      : String(t.scope || "")
          .split(",")
          .map((s) => s.trim());
    for (const c of cakupan) {
      // A scope can be a descendant selector ("source.js meta.brace"); the last
      // segment is the one actually being coloured.
      const daun = c.split(" ").pop();
      for (const k of cari) {
        if (daun === k) persis = nilai;
        else if (daun.startsWith(k + ".") && !awalan) awalan = nilai;
      }
    }
  }
  return persis || awalan;
}

// Monarch token -> the VS Code scopes that mean the same thing.
//
// DELIBERATELY ABSENT: `identifier` and `delimiter`. In VS Code a plain
// identifier takes its colour from a SEMANTIC token, and Monaco has none to
// give — every name arrives as `identifier`. Painting them all one colour would
// look decisive and be wrong, so they keep the editor foreground, which is what
// VS Code itself shows before its semantic pass lands.
const PETA = [
  ["comment", ["comment"]],
  ["string", ["string"]],
  ["string.escape", ["constant.character.escape"]],
  ["regexp", ["string.regexp"]],
  ["number", ["constant.numeric"]],
  ["keyword", ["keyword.control", "keyword"]],
  ["operator", ["keyword.operator"]],
  ["type.identifier", ["entity.name.type", "support.type"]],
  ["tag", ["entity.name.tag"]],
  ["attribute.name", ["entity.other.attribute-name"]],
  ["attribute.value", ["string"]],
  ["annotation", ["storage.type.annotation", "entity.name.function.decorator"]],
  ["metatag", ["punctuation.definition.tag"]],
  ["key", ["support.type.property-name"]],
];

// ── THE BACKGROUND IS DROPPED ON PURPOSE ─────────────────────────────────────
//
// WOLFSPACE renders every editor on a TRANSPARENT background so it takes the
// colour of whatever contains it — tool output follows .ar-out, a code block
// follows its bubble, the code panel follows the file panel. Taking VS Code's
// opaque #121314 would undo that and put a grey box on three differently
// coloured surfaces. The rule is in index.html and it stays.
const DIBUANG = new Set([
  "editor.background",
  "editorGutter.background",
  "minimap.background",
]);

(async () => {
  const colors = {};
  const tokens = [];
  for (const f of RANTAI) {
    const teks = await ambil(
      "/repos/microsoft/vscode/contents/extensions/theme-defaults/themes/" +
        f +
        "?ref=" +
        TAG,
    );
    const j = jsonc(teks);
    Object.assign(colors, j.colors || {});
    for (const t of j.tokenColors || []) tokens.push(t);
    console.log(
      "  merged " +
        f.padEnd(18) +
        " colours=" +
        Object.keys(colors).length +
        " tokens=" +
        tokens.length,
    );
  }

  const rules = [];
  for (const [token, cakupan] of PETA) {
    const w = cariWarna(tokens, ...cakupan);
    if (!w) continue;
    const r = { token, foreground: w.fg.replace("#", "") };
    let gaya = "";
    if (/italic/i.test(w.style)) gaya = "italic";
    if (/bold/i.test(w.style)) gaya = gaya ? gaya + " bold" : "bold";
    if (gaya) r.fontStyle = gaya;
    rules.push(r);
  }

  const warnaAkhir = {};
  for (const [k, v] of Object.entries(colors)) {
    if (!DIBUANG.has(k)) warnaAkhir[k] = v;
  }
  // Put the transparency back, explicitly, so the file is self-contained and
  // nobody has to remember that three keys were removed.
  warnaAkhir["editor.background"] = "#00000000";
  warnaAkhir["editorGutter.background"] = "#00000000";
  warnaAkhir["minimap.background"] = "#00000000";

  const isi =
    "// GENERATED BY scripts/tema-editor/build.cjs — DO NOT EDIT BY HAND.\n" +
    "//\n" +
    "// VS Code " +
    TAG +
    ' default dark theme ("Dark 2026"), merged from its include chain\n' +
    "// (" +
    RANTAI.join(" -> ") +
    ") and mapped onto the tokens\n" +
    "// Monaco's Monarch tokenizers actually emit.\n" +
    "//\n" +
    "// The three background keys are forced transparent: WOLFSPACE editors take\n" +
    "// the colour of whatever contains them. See the build script for why.\n" +
    "//\n" +
    "// Source: microsoft/vscode, MIT licensed. See THIRD-PARTY-NOTICES.md.\n" +
    "//\n" +
    "// Regenerate: node scripts/tema-editor/build.cjs " +
    TAG +
    "\n" +
    "window.__TEMA_EDITOR = " +
    JSON.stringify(
      { base: "vs-dark", inherit: true, rules, colors: warnaAkhir },
      null,
      1,
    ) +
    ";\n";
  fs.writeFileSync(KELUAR, isi);
  console.log(
    "[tema-editor] " +
      path.relative(path.join(__dirname, "..", ".."), KELUAR) +
      " written (" +
      rules.length +
      " token rules, " +
      Object.keys(warnaAkhir).length +
      " colours, " +
      isi.length +
      " bytes)",
  );
})().catch((e) => {
  console.error("[tema-editor] FAILED:", e.message);
  process.exit(1);
});
