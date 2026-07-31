// Viewport — hook bersama untuk menunda pekerjaan berat sampai elemennya
// mendekati layar. Dimuat SETELAH Config.jsx dan SEBELUM modul lain, karena
// CodeBlocks.jsx dan AgentSteps.jsx sama-sama memakainya.
//
// KENAPA ADA. Riwayat chat dirender utuh (app.jsx: messages.map, tanpa jendela),
// dan tiap blok kode dulu langsung membuat satu editor Monaco PENUH — lengkap
// dengan model, view, ResizeObserver (automaticLayout), dan observer pada
// emitter global Monaco. Riwayat panjang berarti ratusan editor hidup serentak.
//
// Di observer ke-200 Monaco sendiri yang melempar:
//     [001] potential listener LEAK detected, having 200 listeners already
// Lemparan itu ditangkap window.onerror di public/index.html, memicu
// triggerAppRollback, lalu window.location.replace("/?rollback=true") — jadi
// aplikasi tiba-tiba kembali ke UI awal. Gejala yang dilaporkan pemakai
// ("berat, lalu hang, lalu reload ke UI pertama") satu kurva yang sama:
// menumpuk, melambat, menyentuh ambang, meledak.
//
// Ini BUKAN kebocoran: cleanup di kedua komponen sudah membuang editor dan
// model dengan benar. Yang salah adalah jumlah yang hidup BERSAMAAN. Karena itu
// perbaikannya membatasi kapan editor DIBUAT, bukan menambah pembuangan.
//
// Ambang 600px supaya blok sudah siap sebelum masuk layar. Selama Monaco belum
// dipasang, <pre> fallback yang sudah ada di kedua komponen tetap menampilkan
// isinya — jadi teksnya tak pernah hilang dan tetap mengikuti stream.
function useDekatLayar(ref, margin) {
  const [dekat, setDekat] = useState(false);
  useEffect(() => {
    const el = ref.current;
    // Tanpa IntersectionObserver, JANGAN diam-diam menonaktifkan editor —
    // kembali ke perilaku lama (selalu pasang) supaya tak ada fitur yang hilang.
    if (!el || typeof IntersectionObserver === "undefined")
      return setDekat(true);
    const io = new IntersectionObserver(
      (entries) => setDekat(entries[entries.length - 1].isIntersecting),
      { rootMargin: (margin || 600) + "px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return dekat;
}
