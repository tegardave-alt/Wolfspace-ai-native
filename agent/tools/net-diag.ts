// ── Network diagnostics through WSL, with NO free shell ──
//
// WHY THIS EXISTS. The agent had no way to inspect the network. `webExtract`
// goes through the SSRF guard and only speaks HTTP; nothing answered "is this
// host reachable", "where does the route go", or "is this port open?". The only
// route available was `bash` — whose boundary on Windows is text scanning, and
// that has already been shown to be defeatable.
//
// ITS SHAPE IS DELIBERATELY NOT "run a command". This tool accepts no command;
// it accepts an OPERATION from a fixed list and BUILDS its own argv. The
// difference is decisive: there is no command text to scan, so there is nothing
// to assemble that could slip past a scanner. The boundary is not a guess about
// a string — it is a property of the shape of data accepted.
//
// This is the same pattern as the broker: not "cage the shell" but "give no
// shell at all, give named capabilities".
//
// It runs INSIDE the WSL distro, not on Windows. The consequence is real and
// intended: the diagnostic process never touches the Windows filesystem, and
// cannot — /mnt/c is empty in this distro.
"use strict";

import { execFile } from "child_process";
const _penegakan = require("../penegakan.cjs");

const DISTRO = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
const BATAS_MS = 20000;
const MAKS_KELUARAN = 8000;

// A host must be a domain name or an IP — no whitespace, no character that
// could change meaning at any layer. Validated BEFORE it reaches argv, and argv
// is passed as an array (execFile), so no shell parses it.
const HOST_SAH = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const PORT_SAH = (p) => Number.isInteger(p) && p > 0 && p < 65536;

/**
 * The available operations. Each entry BUILDS its own argv from already-
 * validated parameters — the caller never contributes raw text.
 */
type Operasi = {
  jelas: string;
  argv: (a: any) => string[];
  butuhHost?: boolean;
  butuhPort?: boolean;
};
const OPERASI: Record<string, Operasi> = {
  ping: {
    butuhHost: true,
    jelas: "kirim 4 paket ICMP, laporkan hilang/waktu",
    argv: (a) => ["ping", "-c", "4", "-W", "3", String(a.host)],
  },
  rute: {
    jelas: "tabel rute distro (ip route)",
    argv: () => ["ip", "route"],
  },
  antarmuka: {
    // BusyBox ip does NOT have -br; using it makes the tool print a help page
    // instead of an answer. Tested in this distro rather than copied from full
    // iproute2's ip.
    jelas: "daftar antarmuka jaringan (ip addr)",
    argv: () => ["ip", "addr"],
  },
  jejak: {
    butuhHost: true,
    jelas: "traceroute, maksimal 12 lompatan",
    argv: (a) => ["traceroute", "-m", "12", "-w", "2", String(a.host)],
  },
  port: {
    butuhHost: true,
    butuhPort: true,
    jelas: "cek satu port TCP terbuka atau tidak",
    argv: (a) => ["nc", "-z", "-w", "4", String(a.host), String(a.port)],
  },
  kepala: {
    butuhHost: true,
    jelas: "ambil header HTTP saja (wget --spider), tanpa mengunduh isi",
    argv: (a) => [
      "wget",
      "--spider",
      "--timeout=8",
      "--tries=1",
      "-S",
      "https://" + String(a.host),
    ],
  },
};

function daftarOperasi() {
  return Object.entries(OPERASI).map(([k, v]) => ({
    operasi: k,
    jelas: v.jelas,
    butuhHost: !!v.butuhHost,
    butuhPort: !!v.butuhPort,
  }));
}

/**
 * @param {{operasi?: string, host?: string, port?: number}} args
 */
function jalankan(args) {
  const nama = String((args && args.operasi) || "").trim();
  const spek = OPERASI[nama];
  if (!spek) {
    return Promise.resolve({
      ok: false,
      output:
        'operasi "' +
        nama +
        '" tak dikenal. Yang tersedia: ' +
        Object.keys(OPERASI).join(", ") +
        ". Tool ini TIDAK menerima perintah bebas — hanya operasi bernama.",
      ..._penegakan.label("kernel", "wsl-daftar-tetap"),
    });
  }

  const host = args && args.host != null ? String(args.host).trim() : "";
  if (spek.butuhHost && !HOST_SAH.test(host)) {
    return Promise.resolve({
      ok: false,
      output:
        'host tak sah: "' +
        host +
        '". Harus nama domain atau IP tanpa spasi/skema/path.',
      ..._penegakan.label("kernel", "wsl-daftar-tetap"),
    });
  }
  const port = args && args.port != null ? Number(args.port) : undefined;
  if (spek.butuhPort && !PORT_SAH(port)) {
    return Promise.resolve({
      ok: false,
      output: "port tak sah: " + String(args && args.port) + " (1-65535)",
      ..._penegakan.label("kernel", "wsl-daftar-tetap"),
    });
  }

  const argv = spek.argv({ host, port });
  return new Promise((resolve) => {
    execFile(
      "wsl.exe",
      ["-d", DISTRO, "--", ...argv],
      { timeout: BATAS_MS, encoding: "utf8", windowsHide: true },
      (err, stdout, stderr) => {
        let teks = String(stdout || "") + String(stderr || "");
        // Many network tools exit non-zero precisely when they are answering
        // the question (ping to a dead host, nc to a closed port). That is a
        // RESULT, not a tool failure — so the output is still returned.
        //
        // `nc -z` prints NOTHING at all; its answer lives only in the exit
        // code. Returning "(no output)" for that would make the tool look like
        // it worked while not answering the question — the same class of defect
        // as a report that sounds stronger than reality.
        if (nama === "port") {
          const terbuka = !err;
          teks =
            String(args.host) +
            ":" +
            String(port) +
            " " +
            (terbuka ? "TERBUKA" : "tertutup atau tak menjawab dalam 4 detik") +
            (teks.trim() ? "\n" + teks.trim() : "");
        }
        resolve({
          ok: !err || !!teks.trim(),
          output:
            (teks.trim() || "(tak ada keluaran)").slice(0, MAKS_KELUARAN) +
            (err && err.killed
              ? "\n[dihentikan: lewat " + BATAS_MS + " ms]"
              : ""),
          operasi: nama,
          distro: DISTRO,
          ..._penegakan.label("kernel", "wsl-daftar-tetap"),
        });
      },
    );
  });
}

module.exports = { jalankan, daftarOperasi, OPERASI, HOST_SAH };
