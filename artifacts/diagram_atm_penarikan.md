# Diagram ATM Penarikan

```mermaid
flowchart TD
    A(( START )) --> B[ Masukkan Kartu ATM ]
    B --> C[ Baca Chip / Magnetic Strip ]
    C --> D{ Kartu Valid? }
    D -->|Tidak| E[ Tampilkan ERROR\nKartu Invalid ]
    E --> Z(( END ))

    D -->|Ya| F[ Minta PIN 6 digit ]
    F --> G[ Masukkan PIN via Keypad ]
    G --> H{ PIN Benar? }
    H -->|Salah 3x| I[ Blokir Kartu ]
    I --> Z

    H -->|Benar| J[ Tampilkan Menu\n1. Tarik Tunai\n2. Cek Saldo\n3. Lainnya ]
    J --> K[ Pilih: Tarik Tunai ]
    K --> L[ Pilih Nominal\natau Custom Amount ]
    L --> M{ Cek Saldo\nCukup? }
    M -->|Tidak| N[ Tampilkan\nSaldo Tidak Cukup ]
    N --> J

    M -->|Ya| O[ Otorisasi ke\nServer Bank ]
    O --> P{ Disetujui? }
    P -->|Tidak| Q[ Tampilkan\nTransaksi Ditolak ]
    Q --> Z

    P -->|Ya| R[ Hitung & Siapkan\nUang di Dispenser ]
    R --> S[ Keluarkan Uang\ndari Slot ]
    S --> T{ Uang Diambil? }
    T -->|Tidak dalam 30dtk| U[ Tarik Kembali Uang ]
    U --> Z

    T -->|Ya| V[ Cetak Struk? ]
    V -->|Ya| W[ Cetak Struk ]
    W --> X[ Keluarkan Kartu ]
    V -->|Tidak| X

    X --> Y[ Tampilkan\nTerima Kasih ]
    Y --> Z(( END ))
```

## Komponen Fisik ATM

| Komponen             | Fungsi                         |
| -------------------- | ------------------------------ |
| **Card Reader**      | Membaca data kartu ATM         |
| **Keypad / PIN Pad** | Input PIN & pilihan menu       |
| **Display Screen**   | Menampilkan instruksi & status |
| **Cash Dispenser**   | Mengeluarkan lembaran uang     |
| **Receipt Printer**  | Mencetak struk transaksi       |
| **Safe Cassette**    | Menyimpan stok uang            |
| **CPU / Controller** | Logika transaksi               |
| **Modem / GSM**      | Koneksi ke server bank         |
