// Pesan JEDA harus membedakan kerja produktif dari berputar di tempat.
//
// MASALAH YANG DIPERBAIKI. Saat plafon langkah tercapai, pesannya dulu hanya
// menyebut nomor langkah, dan catatan file hanya muncul bila edits > 0. Jadi
// dua situasi yang sangat berbeda menghasilkan kalimat IDENTIK:
//     "Dijeda di langkah 14 — belum selesai. Pilih Lanjutkan untuk meneruskan."
//   (a) 14 langkah investigasi produktif, siap disimpulkan
//   (b) 14 langkah membaca berkas yang sama dengan cara berbeda
// User membayar keduanya, tak bisa membedakannya, lalu menekan "Lanjutkan"
// yang menambah 14 langkah lagi secara buta.
//
// Ini BUKAN penjaga: tak ada yang dihentikan lebih awal. Menghentikan lebih
// awal menuntut menebak "kemajuan", yang semantik — versi lama pernah
// mencobanya dengan menghukum VOLUME lalu dicabut karena membunuh tugas sah
// (6 perintah bash berbeda, `npm test` 4x di siklus edit->test). Yang diuji di
// sini murni KEJUJURAN PELAPORAN.

const { describePauseActivity } = require("../agent/self_agent.cjs");

const state = (o) => ({ step: 14, edits: 0, failedTools: new Set(), ...o });
const sess = (o) => ({ callCountsByName: {}, noProgressBySig: {}, ...o });

describe("ringkasan aktivitas saat jeda", () => {
  test("run produktif dan run berputar TIDAK menghasilkan pesan yang sama", () => {
    const produktif = describePauseActivity(
      state({ edits: 3 }),
      sess({ callCountsByName: { read: 6, edit: 3, bash: 2 } }),
    );
    const berputar = describePauseActivity(
      state({ edits: 0 }),
      sess({
        callCountsByName: { read: 12, grep: 8 },
        noProgressBySig: { "read|a": 4, "grep|b": 2 },
      }),
    );
    // Inti perbaikannya — dulu keduanya identik.
    expect(produktif).not.toBe(berputar);
    expect(produktif).toMatch(/3 file diedit/);
    expect(berputar).toMatch(/0 file diedit/);
    expect(berputar).toMatch(/pengulangan berhasil-sama/);
  });

  test("melaporkan total panggilan dengan rincian tool terbanyak", () => {
    const s = describePauseActivity(
      state(),
      sess({ callCountsByName: { read: 12, grep: 8, bash: 1 } }),
    );
    expect(s).toMatch(/21 panggilan tool/);
    expect(s).toMatch(/read×12/);
  });

  test("menyebut tool bermasalah bila ada", () => {
    const s = describePauseActivity(
      state({ failedTools: new Set(["bash", "edit"]) }),
      sess({ callCountsByName: { bash: 9 } }),
    );
    expect(s).toMatch(/tool bermasalah: bash, edit/);
  });

  test("TIDAK menyebut pengulangan bila memang tak ada", () => {
    const s = describePauseActivity(
      state({ edits: 2 }),
      sess({ callCountsByName: { edit: 2 } }),
    );
    expect(s).not.toMatch(/pengulangan/);
  });

  test("tidak meledak saat state kosong", () => {
    // Jalur jeda tak boleh melempar hanya karena penghitung belum terisi —
    // kegagalan di sini akan menghapus pesan jeda sepenuhnya.
    expect(() => describePauseActivity({}, {})).not.toThrow();
    expect(describePauseActivity({}, {})).toMatch(/0 file diedit/);
  });
});
