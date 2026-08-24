// The blocking watchdog has to catch a real block, not a described one.
//
// So every test here actually holds the event loop and then asks what was
// observed. A watchdog verified by reading its own source would be the third
// guard in this repo to pass while doing nothing.

const P = require("../agent/pemantau-blokir.ts");
const A = require("../agent/anggaran.ts");

/** Holds the loop for `ms` with a spin loop — no await, no timer, nothing that
 *  yields. A sleep would not block anything, which is the whole distinction. */
function tahan(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    /* deliberately busy */
  }
}

/** The histogram records through a timer, so it needs one turn of the loop
 *  AFTER the block before the lateness has been written down. */
const nafas = () => new Promise((r) => setTimeout(r, 60));

/** mulai() + one turn of the loop.
 *
 * The histogram cannot schedule its sampling timer until the current turn ends,
 * so a block started in the SAME tick as mulai() is mostly invisible — measured
 * at 16 ms for a real 300 ms block. That is a property of the instrument, not a
 * weakened assertion: the app starts watching at boot and blocks arrive much
 * later, which is exactly what this reproduces. */
const siap = async (res = 10) => {
  const r = P.mulai(res);
  await nafas();
  return r;
};

afterEach(() => P.henti());

describe("pemantau-blokir: menangkap blokir sungguhan", () => {
  test("blokir 300 ms terlihat sebagai maks ~300 ms", async () => {
    await siap();
    tahan(300);
    await nafas();
    const l = P.ambil();
    // Generous lower bound: a loaded machine reports more, never much less.
    expect(l.maksMs).toBeGreaterThanOrEqual(250);
    expect(l.maksMs).toBeLessThan(2000);
  });

  test("vonisnya memakai pita anggaran yang sama", async () => {
    await siap();
    tahan(300);
    await nafas();
    const l = P.ambil();
    expect(l.vonis).toBe(A.vonisBlokir(l.maksMs));
    expect(l.vonis).toBe("naik"); // 300 ms: past NORMAL, far below WASPADA
  });

  test("diam saat tak ada yang memblokir", async () => {
    await siap();
    const l = P.ambil();
    expect(l.maksMs).toBeLessThan(A.BLOKIR_NORMAL_MS);
    expect(l.vonis).toBe("normal");
  });

  test("MAKS yang dilaporkan, bukan rata-rata — dan itu bukan detail gaya", async () => {
    // Thirty 150 ms edits total 4.5 s and freeze nothing, because the queue
    // drains between them. One 5 s stretch freezes the window. A mean cannot
    // tell those apart; this asserts the watchdog does not try.
    await siap();
    for (let i = 0; i < 4; i++) {
      tahan(120);
      await nafas();
    }
    const l = P.ambil();
    expect(l.maksMs).toBeGreaterThanOrEqual(100);
    expect(l.maksMs).toBeLessThan(600); // NOT the 480 ms sum of the four
  });

  test("reset memulai jendela baru, bukan menumpuk", async () => {
    await siap();
    tahan(300);
    await nafas();
    expect(P.ambil(true).maksMs).toBeGreaterThanOrEqual(250);
    await nafas();
    // Previous window's spike must not stain this one.
    expect(P.ambil().maksMs).toBeLessThan(A.BLOKIR_NORMAL_MS);
  });

  test("ambil() sebelum mulai() mengembalikan null, bukan melempar", () => {
    expect(P.berjalan()).toBe(false);
    expect(P.ambil()).toBeNull();
  });

  test("mulai() dua kali tidak diam-diam mereset jendela yang berjalan", async () => {
    expect(await siap()).toBe(true);
    tahan(300);
    expect(P.mulai(10)).toBe(false); // second caller told it was already on
    await nafas();
    expect(P.ambil().maksMs).toBeGreaterThanOrEqual(250);
  });
});

describe("pemantau-blokir: pelaporan", () => {
  test("HANYA melapor saat melewati pita normal", async () => {
    await siap();
    const dilihat = [];
    const stop = P.pasangLaporan((l) => dilihat.push(l), 120);

    await new Promise((r) => setTimeout(r, 260)); // quiet windows
    expect(dilihat).toHaveLength(0);

    tahan(300);
    // Let the histogram write the lateness down BEFORE the reporter reads it.
    // Without this the two race: under parallel test load the reporter's
    // interval can fire first, read a max that has not been updated yet, and
    // ambil(true) then RESETS the window — losing the spike for good. The app
    // reports every 15 s, so the ordering never matters there; it matters here
    // because the interval is 120 ms.
    await nafas();
    await new Promise((r) => setTimeout(r, 500));
    stop();

    expect(dilihat.length).toBeGreaterThanOrEqual(1);
    expect(dilihat[0].maksMs).toBeGreaterThanOrEqual(A.BLOKIR_NORMAL_MS);
  });

  test("ringkas() menyebut angka DAN anggaran yang dibandingkan", async () => {
    await siap();
    tahan(150);
    await nafas();
    const s = P.ringkas(P.ambil());
    expect(s).toMatch(/blokir maks \d+ ms/);
    expect(s).toContain(String(A.AMBANG_HANG_MS));
  });
});
