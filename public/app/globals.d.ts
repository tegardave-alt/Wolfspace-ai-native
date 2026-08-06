// Deklarasi ambient untuk modul di public/app/.
//
// KENAPA ADA. Berkas di sini BUKAN modul ES — index.html mengambilnya satu per
// satu, mentranspilasi masing-masing, lalu MENGGABUNGKAN hasilnya jadi satu
// <script>. Semuanya berbagi satu scope global: `useState` di PluginsView.tsx
// adalah useState yang sama yang di-destructure app.jsx dari React, tanpa satu
// pun import.
//
// Tanpa berkas ini TypeScript menandai tiap nama itu "Cannot find name" — bukan
// karena kodenya salah, tapi karena kontrak scope-nya tak pernah tertulis.
//
// SENGAJA MINIMAL. @types/react tidak dipasang (React datang dari <script>
// vendor, bukan npm), dan menambahkannya hanya demi tipe berarti menambah
// dependensi untuk sesuatu yang tak ikut dikirim. Yang dideklarasikan di sini
// hanya yang benar-benar dipakai. Akibat yang disengaja: props elemen DOM tidak
// diperiksa — yang diperiksa adalah LOGIKA komponennya, dan itu memang bagian
// yang bisa salah.

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [nama: string]: any;
  }
  // Digabung TypeScript ke props SETIAP komponen. Tanpa ini `key` pada elemen
  // hasil .map() ditolak, padahal React justru mewajibkannya.
  interface IntrinsicAttributes {
    key?: string | number;
  }
}

declare var React: {
  createElement(...args: any[]): JSX.Element;
  Fragment: any;
};

// Di-destructure di kepala app.jsx:
//   const { useState, useRef, useEffect, useCallback, useMemo } = React;
declare function useState<T>(
  awal: T | (() => T),
): [T, (nilai: T | ((sebelumnya: T) => T)) => void];
declare function useRef<T>(awal: T): { current: T };
declare function useEffect(
  efek: () => void | (() => void),
  deps?: readonly any[],
): void;
declare function useCallback<F extends (...a: any[]) => any>(
  fn: F,
  deps?: readonly any[],
): F;
declare function useMemo<T>(fn: () => T, deps?: readonly any[]): T;
