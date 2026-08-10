// Perangkat uji butuh shell untuk MENGUJI shell.
//
// Sejak proc.raw dimatikan secara bawaan (lihat agent/broker/commandchain.cjs),
// tool bash dan sandbox_run ditolak kecuali WOLFSPACE_SHELL=1. Itu perubahan
// pada PRODUK, bukan pada cara mengujinya: suite ini justru berisi uji yang
// memastikan bash terkurung, dilabeli benar, dan gagal pada kasus yang tepat —
// semuanya mustahil kalau bash-nya sendiri ditolak lebih dulu.
//
// Yang TIDAK boleh dilakukan: mengubah uji supaya "lulus" dengan menerima
// penolakan. Itu akan membuat suite hijau sambil berhenti menguji apa pun.
//
// Uji yang memang menguji LOCKDOWN (tests/lockdown-proc-raw.test.js) tidak
// terpengaruh: ia menjalankan proses anak dengan env-nya sendiri, karena
// ruleset dibekukan sekali per proses.
process.env.WOLFSPACE_SHELL = "1";
