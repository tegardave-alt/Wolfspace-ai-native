"use strict";

// ── Rute sesi debug DAP ──
//
// Mengikuti pola modul rute lain: handle(req, res, deps) -> truthy bila
// permintaannya ditangani. Logika sesinya ada di core/dap-sesi.cjs; berkas ini
// hanya lapisan HTTP-nya.
//
// KURUNGAN PATH DI SINI, BUKAN DI UI. `program` datang dari renderer, jadi ia
// tak boleh dipercaya — dipakai ulang `kurungDiAkar` yang sama dengan rute
// tulis/buat berkas, supaya batas keamanannya satu, bukan tiga salinan.

const dapSesi = require("../../core/dap-sesi.cjs");

function badan(req) {
  return new Promise((selesai) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        selesai(JSON.parse(b || "{}"));
      } catch (_) {
        selesai(null);
      }
    });
  });
}

function handle(req, res, deps) {
  const jalur = (req.url || "/").split("?")[0];
  if (!jalur.startsWith("/dap/")) return false;
  const { kurungDiAkar } = deps || {};

  const kirim = (kode, isi) => {
    res.writeHead(kode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(isi));
  };

  if (req.method === "POST" && jalur === "/dap/mulai") {
    badan(req).then(async (p) => {
      if (!p) return kirim(400, { ok: false, error: "json tidak sah" });
      const kurung = kurungDiAkar
        ? kurungDiAkar(p.root, p.program)
        : { akar: p.root, berkas: p.program };
      if (kurung.galat)
        return kirim(kurung.kode, { ok: false, error: kurung.galat });
      try {
        const id = await dapSesi.buka({
          program: kurung.berkas,
          cwd: kurung.akar,
          // Titik henti diberi kunci path yang SUDAH dikurung, bukan yang
          // dikirim renderer: dua ejaan path yang sama tapi beda bentuk membuat
          // adapter memasangnya di berkas yang dianggapnya lain.
          titikHenti: { [kurung.berkas]: (p.titikHenti || []).map(Number) },
          python: p.python,
        });
        kirim(200, { ok: true, id, keadaan: dapSesi.keadaan(id, 0) });
      } catch (e) {
        kirim(500, { ok: false, error: String((e && e.message) || e) });
      }
    });
    return true;
  }

  if (req.method === "POST" && jalur === "/dap/aksi") {
    badan(req).then(async (p) => {
      if (!p || !p.id)
        return kirim(400, { ok: false, error: "id wajib diisi" });
      try {
        kirim(200, { ok: true, ...(await dapSesi.aksi(p.id, p.aksi)) });
      } catch (e) {
        kirim(400, { ok: false, error: String((e && e.message) || e) });
      }
    });
    return true;
  }

  if (req.method === "POST" && jalur === "/dap/titik-henti") {
    badan(req).then(async (p) => {
      if (!p || !p.id)
        return kirim(400, { ok: false, error: "id wajib diisi" });
      try {
        const hasil = await dapSesi.titikHenti(
          p.id,
          p.berkas,
          (p.baris || []).map(Number),
        );
        kirim(200, { ok: true, terpasang: hasil });
      } catch (e) {
        kirim(400, { ok: false, error: String((e && e.message) || e) });
      }
    });
    return true;
  }

  if (req.method === "GET" && jalur === "/dap/keadaan") {
    let id = "",
      sejak = 0;
    try {
      const q = new URL(req.url, "http://x").searchParams;
      id = q.get("id") || "";
      sejak = Number(q.get("sejak") || 0);
    } catch (_) {}
    const k = dapSesi.keadaan(id, sejak);
    if (!k) return (kirim(404, { ok: false, error: "sesi tak ada" }), true);
    kirim(200, { ok: true, ...k });
    return true;
  }

  if (req.method === "POST" && jalur === "/dap/tutup") {
    badan(req).then(async (p) => {
      kirim(200, { ok: true, ditutup: await dapSesi.tutup((p && p.id) || "") });
    });
    return true;
  }

  if (req.method === "GET" && jalur === "/dap/daftar") {
    kirim(200, { ok: true, sesi: dapSesi.daftar() });
    return true;
  }

  return false;
}

module.exports = { handle };
