// reaktif.ts — the reactive reporter: its on/off switch and the reports it has
// produced.
//
// CONNECTS TO
//   mounted  by server.ts
//
// ── WHY REPORTS ARE COLLECTED HERE AND READ, RATHER THAN PUSHED ──────────────
//
// A push would need a third stream channel, which means touching main.ts,
// backend-host.cjs, the preload bridge and the in-process fallback — four
// surfaces, for a feature that speaks at most twelve times an hour.
//
// So a report is left here and the panel picks it up. At twelve an hour a slow
// poll costs nothing measurable, it works identically in the desktop app and in
// a browser, and it adds no contract that has to be kept in sync. The one thing
// it must not do is deliver the same report twice — reading TAKES the queue.
export {};

const REAKTIF = require("../../agent/reaktif.ts");
const { fillCloudKey } = require("../../agent/cloud.ts");
const { selfAgentStream } = require("../../agent/self_agent.ts");

/**
 * Reports waiting to be read.
 *
 * BOUNDED. If nobody is looking — the window is closed, the panel was never
 * opened — this must not grow without limit. Older reports are dropped first:
 * a stale observation about a file edited an hour ago is worth less than the
 * one from a minute ago.
 */
const MAKS_ANTRE = 8;
const _antre: any[] = [];

function _simpanLaporan(teks: string, berkas: string[]) {
  _antre.push({ teks, berkas, ts: Date.now() });
  while (_antre.length > MAKS_ANTRE) _antre.shift();
}

let _hentikan: any = null;

/**
 * Starts (or restarts) the watcher.
 *
 * Restarting on every enable is deliberate: the workspace root can change while
 * the app is open, and a watcher left pointing at the previous folder reports on
 * files nobody is working in.
 */
function _pasang(akar: string) {
  if (_hentikan) {
    _hentikan();
    _hentikan = null;
  }
  if (!akar) return false;
  _hentikan = REAKTIF.mulai({
    akar,
    // Resolved per run rather than captured once: the user can switch model
    // while this is enabled, and a captured copy would keep using the old one.
    get cloud() {
      const c: any = {};
      fillCloudKey(c);
      return c;
    },
    jalankan: (payload: any, emit: any) => selfAgentStream(payload, emit),
    lapor: _simpanLaporan,
  });
  return true;
}

/**
 * Starts watching without anyone asking — called once when the server boots.
 *
 * The switch in the routes below still works and still stops it; what it is not
 * is a step the user has to take first. A reactive agent you have to enable is
 * a feature with a setup step, which is the opposite of the thing.
 */
function mulaiOtomatis(akar: string) {
  if (!_pasang(akar)) return false;
  REAKTIF.setAktif(true);
  return true;
}

function badan(req: any): Promise<any> {
  return new Promise((selesai) => {
    let b = "";
    req.on("data", (c: any) => (b += c));
    req.on("end", () => {
      try {
        selesai(JSON.parse(b || "{}"));
      } catch (_) {
        selesai({});
      }
    });
  });
}

function kirim(res: any, kode: number, isi: any) {
  res.writeHead(kode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(isi));
}

/** Returns true when it handled the request. */
async function ruteReaktif(req: any, res: any, deps: any = {}) {
  const url = String(req.url || "");

  // The switch, and everything needed to explain a feature that is quiet by
  // design: how many reports this hour, how long the quiet period is, whether
  // one is running right now.
  if (req.method === "GET" && url === "/reaktif/status") {
    kirim(res, 200, {
      ok: true,
      ...REAKTIF.keadaan(),
      // READING TAKES THEM. A report delivered twice reads as the agent
      // repeating itself, and there is no way for the panel to tell.
      laporan: _antre.splice(0, _antre.length),
    });
    return true;
  }

  if (req.method === "POST" && url === "/reaktif/aktif") {
    const b = await badan(req);
    const mau = Boolean(b.aktif);
    const akar = String(b.akar || deps.akarBawaan || "");
    if (mau) {
      if (!akar) {
        return kirim(res, 400, {
          ok: false,
          error: "no folder to watch — open a project first",
        });
      }
      if (!_pasang(akar)) {
        return kirim(res, 400, { ok: false, error: "could not watch " + akar });
      }
    } else if (_hentikan) {
      _hentikan();
      _hentikan = null;
    }
    REAKTIF.setAktif(mau);
    kirim(res, 200, { ok: true, ...REAKTIF.keadaan(), akar: mau ? akar : "" });
    return true;
  }

  return false;
}

module.exports = { ruteReaktif, mulaiOtomatis, _antre, _simpanLaporan };
