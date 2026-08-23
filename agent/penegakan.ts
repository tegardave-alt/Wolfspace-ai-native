// ── One vocabulary for the question "who enforces this boundary?" ──
//
// WHY IT EXISTS. Each execution path grew on its own and reported in different
// words: bash said "namespace"/"regex", zones said "bwrap"/"unshare",
// sandbox_run reported nothing at all. Three vocabularies for one question means
// a caller has to know which path it is talking to — exactly what it should NOT
// need to know.
//
// Two things are separated here, and the separation is deliberate:
//
//   enforcement : WHO refuses. This is what determines the strength.
//   mechanism   : WITH WHAT. This is what is useful for diagnosis.
//
// Collapsing them into one word always ends up misleading: "bwrap" does not
// tell you it is a kernel boundary, and "kernel" does not tell you what to
// inspect when something looks wrong.
"use strict";

/**
 * @typedef {"kernel"|"runtime"|"penasihat"} Penegak
 *
 * kernel    — the operating system refuses: namespaces, bwrap, a hypervisor.
 *             Applies to any process spawned from inside it.
 * runtime   — the language runtime refuses: Node's `--permission`. Strong, but
 *             only for that Node process itself.
 * penasihat — OUR code checks: a text scanner, a path check in a JS helper. A
 *             spawned process is not bound at all. MEASURED to be bypassable: a
 *             path assembled at run time has no token to scan (see
 *             tests/bash-tingkat-penegakan.test.js).
 */

/**
 * @param {Penegak} penegakan
 * @param {string} mekanisme
 * @returns {{penegakan: Penegak, mekanisme: string, terkurungOs: boolean}}
 */
// `export {}` makes this a MODULE rather than a global script — see the module
// ratchet in tests/kontrak-tipe.test.js for what a shared script scope costs.
export {};

function label(penegakan, mekanisme) {
  return {
    penegakan,
    mekanisme,
    // Derived rather than a free field — so a report claiming OS containment
    // while naming its enforcer "advisory" cannot exist.
    terkurungOs: penegakan === "kernel",
  };
}

// A translation of the platform adapter's capabilities(). The adapter has
// answered this question honestly from the start ('none' | 'advisory' |
// 'enforced'); what was missing was a way for its answer to reach the tool's
// caller.
function dariAdapter(kap, mekanismeBila) {
  if (!kap) return label("penasihat", "tak diketahui");
  if (kap.fsIsolation === "enforced")
    return label("kernel", mekanismeBila || "namespace");
  // 'advisory' and 'none' are both not an OS boundary. The only difference is
  // whether our code bothered to check — and that check does not bind a child
  // process.
  return label(
    "penasihat",
    kap.fsIsolation === "advisory" ? "helper-js" : "tak ada",
  );
}

module.exports = { label, dariAdapter };
