# CommandChain — desain

Tiap operasi agent diperlakukan sebagai **transaksi**: dideklarasikan, dicek
terhadap aturan yang **immutable selama sesi**, dieksekusi lewat broker, lalu
dicatat ke **ledger berantai (hash-chained)**. Shell berhenti menjadi string
buram dan menjadi warga kelas satu di sistem kapabilitas yang sudah ada.

> Ini dokumen **desain**, bukan klaim tentang kode yang sudah jalan. Bagian yang
> sudah ada ditandai ✅; yang belum ditandai ◻.

---

## 1. Tesis satu baris

> Lakukan untuk **shell** apa yang broker sudah lakukan untuk **berkas**:
> `bash "string buram"` → rangkaian operasi kapabilitas yang dideklarasikan,
> dicek terhadap kebijakan tetap, dan dirantai ke ledger yang tamper-evident.

---

## 2. Batas jujur yang dibawa dari seluruh diskusi

Ditulis lebih dulu supaya tak ada klaim yang melampauinya.

1. **"Deterministik" hanya berlaku pada KEPUTUSAN, bukan eksekusi.** `bash` tak
   bisa dibuat deterministik (`date`, jaringan, `$RANDOM`). Yang deterministik:
   fungsi `(ruleset, operasi) → izin|tolak`, dan pencatatannya. Eksekusi tetap
   tak deterministik.
2. **Allowlist, bukan denylist.** Kekuatannya datang dari kosakata yang
   TERTUTUP — operasi yang tak bisa direpresentasikan tak bisa dijalankan.
   Memeriksa string bash untuk pola buruk adalah penjaga regex berpakaian
   transaksi, dan sudah terbukti bocor (`%TEMP%`).
3. **Hash-chain itu tamper-EVIDENT, bukan tamper-PROOF.** Rantai membuat
   perubahan riwayat KETAHUAN (hash putus), bukan MUSTAHIL. Kekekalan sejati
   butuh dukungan OS yang tak portabel. Sama seperti append-only pada audit.
4. **Lapisan kebijakan portabel; lantai penegakan tidak.** Ledger + admission
   control murni JS, jalan di Windows. Penegakan OS untuk jalur "bash mentah"
   tetap butuh jail (Linux) atau AppContainer (Windows) — dan bila tak ada,
   jalur itu ditandai UNCONFINED, tak disembunyikan.

---

## 3. Yang SUDAH ada — CommandChain 70% terpasang

| Prinsip                                   | Komponen WOLFSPACE                               | Status |
| ----------------------------------------- | ------------------------------------------------ | ------ |
| VM tersandbox (EVM)                       | zona kapabilitas (`--permission` + broker)       | ✅     |
| ABI / operasi terdeklarasi                | `request(capability, params)`                    | ✅     |
| Deny-by-default                           | `agent/broker/policy.cjs`                        | ✅     |
| Ledger append-only                        | `agent/broker/audit-log.cjs` → `broker.jsonl`    | ✅     |
| State yang bisa di-revert                 | `agent/snapshot.cjs`                             | ✅     |
| Validitas sebelum commit                  | gerbang anti-halu (DONE butuh `ok=true`)         | ✅     |
| Operasi bertipe dari agent                | function-calling tools (`read`/`write`/`grep`/…) | ✅     |
| **Genesis ruleset immutable**             | —                                                | ◻      |
| **Rantai hash antar-transaksi**           | —                                                | ◻      |
| **Kosakata shell (mengganti bash bebas)** | —                                                | ◻      |
| **Gas / anggaran per sesi**               | `ulimit`/timeout (sebagian)                      | ◻      |

CommandChain **bukan sistem baru** — ia lapisan tipis yang mengikat komponen di
atas menjadi rantai transaksi bergovernance.

---

## 4. Arsitektur

### 4.1 Genesis ruleset (aturan immutable per-sesi)

Saat sesi dimulai, sebuah objek kebijakan **dibekukan** (`Object.freeze`, dalam)
dan hash-nya menjadi **entri pertama ledger** — "genesis block".

```
genesis = {
  sesi: <id>,
  ts,
  kapabilitas: {                 // apa yang BOLEH, dan cakupannya
    "fs.read":  { roots: [<ws>] },
    "fs.write": { roots: [<ws>] },
    "fs.grep":  { roots: [<ws>] },
    "exec.run": { root: <ws> },
    "git":      { ops: ["status","diff","add","commit","log"] },
    "proc.raw": false            // escape bash mentah — MATI kecuali diaktifkan
  },
  gas: { maks: <n>, biaya: {...} },
  hashAlgo: "sha256"
}
```

Sifat yang menentukan: **tak ada operasi selama sesi yang bisa mengubah
`genesis`.** Bukan prompt, bukan konten yang disuntikkan, bukan aksi agent.
Prompt-injection tak bisa membujuk sistem melonggarkan aturan — aturannya
invariant, bukan instruksi. Ini "pastikan terhardcode" sebagai jaminan
arsitektural.

### 4.2 Kosakata kapabilitas (operasi = transaksi)

Setiap tool agent dipetakan ke satu operasi bertipe. Yang sudah broker-backed
tinggal dibungkus; yang bebas (`bash`) diganti.

| Operasi                       | Sumber                                  | Penegakan                                                           |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| `fs.read` `fs.list` `fs.grep` | broker                                  | ✅ deny-by-default                                                  |
| `fs.write` `fs.edit`          | broker + gerbang kualitas               | ✅                                                                  |
| `exec.run`                    | verify loop (attested)                  | ⚠️ advisory di Windows                                              |
| `git`                         | **baru** — argumen dari allowlist `ops` | ◻ deterministik                                                     |
| `proc.raw`                    | **escape eksplisit**                    | ⚠️ UNCONFINED, ditandai + dicatat keras; di Linux lewat `bash-jail` |

`proc.raw` adalah kejujuran yang membuat model ini bekerja: bash sembarang tetap
mungkin, TAPI ia operasi yang **harus diizinkan genesis**, selalu ditandai
UNCONFINED, dan tercatat di rantai — jadi bahkan pelariannya teraudit. Default:
mati.

### 4.3 Amplop transaksi + rantai hash

Tiap operasi dibungkus dan dirantai:

```
tx = {
  seq,                 // 0 = genesis, 1, 2, ...
  prevHash,            // hash tx sebelumnya  ← ini yang membuatnya "chain"
  ts,
  capability,          // "fs.read" | "proc.raw" | ...
  params,              // DIRINGKAS: dipotong + field rahasia disunting (audit-log.cjs)
  decision,            // ALLOW | DENY | BLOCKED
  reason,
  gasUsed,
  kurungan             // status cakupan eksekusi (sudah ada di zona/verify)
}
hash(tx) = sha256(prevHash + canonicalJSON(tx tanpa hash))
```

Rantai = tamper-evident: mengubah satu transaksi lama memutus semua hash
sesudahnya. Ledger `broker.jsonl` yang sudah ada diperluas dengan `seq`,
`prevHash`, `hash`.

### 4.4 Admission control (fungsi murni, sebelum eksekusi)

```
function periksa(genesis, capability, params) -> { allow, reason }
```

Deny-by-default. Sebuah operasi ditolak bila: (a) bukan kapabilitas yang
dideklarasikan genesis, (b) di luar cakupan yang dideklarasikan (root/host/ops),
atau (c) gas habis. **Deterministik** — input sama, keputusan sama, selalu.
Inilah tempat "sulit menyimpang dari kebijakan" menjadi nyata: penyimpangan tak
punya representasi yang lolos.

### 4.5 Gas

Anggaran keras per sesi, dibekukan di genesis. Tiap transaksi berbiaya; sesi
berhenti saat habis. Menahan loop tak berujung dan pemakaian berlebih — versi
per-sesi dari `ulimit`, yang tak bisa dilonggarkan di tengah jalan.

---

## 5. Lubang yang ditutup

`bash` hari ini: melompati broker, bisu soal cakupan, tak tercatat, bocor di
Windows. Setelah CommandChain:

- operasi umum (`git status`, baca, grep, jalankan test) → **transaksi bertipe**,
  terverifikasi, terantai;
- bash sembarang → `proc.raw`, **mati secara default**, dan bila diaktifkan
  tetap UNCONFINED + tercatat keras;
- tiap keputusan → di rantai yang tamper-evident, di bawah aturan yang tak bisa
  dilonggarkan agent.

---

## 6. Yang BARU vs yang dipakai ulang

**Dipakai ulang (mayoritas):** broker, Policy, audit-log, snapshot, tools
bertipe, penanda kurungan, gerbang anti-halu.

**Baru (tipis):**

1. `genesis` beku + hash sebagai entri-0.
2. `seq`/`prevHash`/`hash` di amplop transaksi.
3. Kosakata `git` + operasi umum lain (menggantikan sebagian pemakaian `bash`).
4. `proc.raw` sebagai escape eksplisit, off-by-default.
5. Meter gas per sesi.

---

## 7. Non-goal (jujur)

- **Bukan** pencegahan pelarian di Windows tanpa OS. Lapisan ini kebijakan +
  audit; penegakan lantai tetap butuh jail/AppContainer.
- **Bukan** kekekalan ledger. Tamper-evident, bukan tamper-proof.
- **Bukan** menutup kebocoran-BACA. Rantai mencatat & bisa me-revert efek TULIS
  di dalam workspace; membaca rahasia lalu mengeluarkannya tak bisa di-revert.
  `proc.raw` yang UNCONFINED adalah tempat risiko ini tinggal — karena itu ia
  off-by-default dan ditandai.
- **Bukan** menghapus `bash`. Ia tetap ada sebagai `proc.raw`, jujur dan langka.

---

## 8. Rencana eksekusi berfase

Tiap fase berdiri sendiri, memberi nilai nyata, dan portabel (Windows) kecuali
disebut.

- **Fase 1 — rantai + genesis (murah, portabel, nilai langsung).** ✅ **SELESAI.**
  `agent/broker/audit-log.cjs` kini merantai tiap catatan (`seq`/`prevHash`/`hash`)
  dan `agent/broker/commandchain.cjs` menambatkan genesis beku + admission
  deny-by-default. Broker memanggilnya sebelum Policy. Terbukti lewat zona nyata:
  genesis entri-0, `proc.raw` ditolak `COMMANDCHAIN_DENIED`, rantai utuh; dan
  tamper terdeteksi — memalsukan satu catatan memutus rantai sesudahnya. Uji:
  `tests/commandchain.test.js` (11), audit lama tetap hijau.

- **Fase 2 — kosakata + `proc.raw`.**
  Perkenalkan operasi bertipe untuk pemakaian bash yang umum (didahului
  pengukuran: agent sebenarnya memakai bash untuk apa). `bash` bebas → `proc.raw`,
  off-by-default, ditandai UNCONFINED. Uji: operasi umum lewat sebagai transaksi;
  raw ditolak kecuali genesis mengizinkan.

- **Fase 3 — gas.**
  Anggaran per sesi, dibekukan di genesis, dihabiskan per transaksi.

- **Fase 4 — lantai penegakan (butuh OS).**
  `proc.raw` → `bash-jail` di Linux; launcher AppContainer di Windows (proyek
  native terpisah, opsional). Sampai ada, `proc.raw` jujur UNCONFINED.

---

## 9. Keputusan yang menunggu

Sebelum Fase 1 dieksekusi, satu hal yang mengubah detail:

- **Ledger: perluas `broker.jsonl` yang ada, atau berkas rantai terpisah
  (`commandchain.jsonl`)?** Memperluas = satu sumber; terpisah = pemisahan bersih
  antara "audit broker" dan "rantai transaksi". Rekomendasi: **perluas** — satu
  ledger, `seq` menautkan semuanya.
- **Gas: nyata membatasi (hentikan sesi) atau attest saja (catat, jangan
  hentikan) di Fase 1?** Rekomendasi: **attest dulu**, batasi di Fase 3.
