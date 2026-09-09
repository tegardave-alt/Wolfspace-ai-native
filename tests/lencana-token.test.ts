// Token accounting, from the API chunk to the badge on the answer bubble.
//
// WHAT THIS PROTECTS. A cost display is believed. Every number it shows has to
// come from the provider's own usage report, and where no report arrives the
// badge must be ABSENT rather than zero or estimated — a plausible wrong figure
// is worse than none, because nobody checks it.
//
// THREE THINGS ARE EASY TO GET WRONG HERE AND SILENT WHEN WRONG:
//
//   1. OpenAI-compatible providers send usage only when asked. Without
//      stream_options.include_usage the field never arrives, and the badge
//      would simply never appear — with nothing in any log to say why.
//   2. Usage arrives in a FINAL chunk with an empty `choices` array. The tools
//      parser skips chunks with no delta, so absorbing after that guard reads
//      every chunk except the only one that carries the answer.
//   3. Each shape reports a RUNNING TOTAL. Adding across chunks multiplies the
//      input count by however many chunks mention it.

const path = require("path");
const fs = require("fs");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const cloud = require(path.join(AKAR, "agent", "cloud.ts"));

const serap = cloud._serapPakai;
const SRC_CLOUD = fs.readFileSync(path.join(AKAR, "agent", "cloud.ts"), "utf8");
const SRC_AGENT = fs.readFileSync(
  path.join(AKAR, "agent", "self_agent.ts"),
  "utf8",
);
const SRC_UI = fs.readFileSync(
  path.join(AKAR, "public", "app", "AgentSteps.tsx"),
  "utf8",
);
const SRC_CSS = fs.readFileSync(
  path.join(AKAR, "public", "styles.css"),
  "utf8",
);

describe("_serapPakai membaca tiga bentuk API", () => {
  test("OpenAI-compatible", () => {
    const p: any = { masuk: 0, keluar: 0 };
    serap({ usage: { prompt_tokens: 1200, completion_tokens: 340 } }, p);
    expect(p.masuk).toBe(1200);
    expect(p.keluar).toBe(340);
  });

  test("Anthropic, across two different events", () => {
    // message_start nests usage under `message`; message_delta puts it at the
    // top. One accumulator has to survive between them.
    const p: any = { masuk: 0, keluar: 0 };
    serap(
      { type: "message_start", message: { usage: { input_tokens: 900 } } },
      p,
    );
    expect(p.masuk).toBe(900);
    expect(p.keluar).toBe(0);
    serap({ type: "message_delta", usage: { output_tokens: 210 } }, p);
    expect(p.masuk).toBe(900);
    expect(p.keluar).toBe(210);
  });

  test("Anthropic cache tokens are kept apart from input", () => {
    // Folding them into `masuk` would understate a cached turn — the turn a
    // user is most likely to be checking the cost of.
    const p: any = { masuk: 0, keluar: 0 };
    serap(
      {
        usage: {
          input_tokens: 50,
          cache_read_input_tokens: 8000,
          cache_creation_input_tokens: 120,
        },
      },
      p,
    );
    expect(p.masuk).toBe(50);
    expect(p.cacheBaca).toBe(8000);
    expect(p.cacheTulis).toBe(120);
  });

  test("Gemini", () => {
    const p: any = { masuk: 0, keluar: 0 };
    serap(
      { usageMetadata: { promptTokenCount: 77, candidatesTokenCount: 9 } },
      p,
    );
    expect(p.masuk).toBe(77);
    expect(p.keluar).toBe(9);
  });

  test("counts are ASSIGNED, never accumulated", () => {
    // The whole defect in one assertion: every shape reports a running total,
    // so a chunk repeating it must not double the figure.
    const p: any = { masuk: 0, keluar: 0 };
    const chunk = { usage: { prompt_tokens: 500, completion_tokens: 100 } };
    serap(chunk, p);
    serap(chunk, p);
    serap(chunk, p);
    expect(p.masuk).toBe(500);
    expect(p.keluar).toBe(100);
  });

  test("a chunk carrying no usage changes nothing", () => {
    const p: any = { masuk: 12, keluar: 3 };
    serap({ choices: [{ delta: { content: "hai" } }] }, p);
    serap({}, p);
    serap(null, p);
    expect(p).toEqual({ masuk: 12, keluar: 3 });
  });
});

describe("usage benar-benar diminta dan benar-benar dibaca", () => {
  test("both request builders ask for it", () => {
    // Two payloads are built in this file — the plain stream and the tools
    // call. The tools one is what the agent loop uses on every step, so a flag
    // on only one of them would leave real runs uncounted.
    const jumlah = (
      SRC_CLOUD.match(/stream_options: \{ include_usage: true \}/g) || []
    ).length;
    expect(jumlah).toBe(2);
  });

  test("the tools parser absorbs BEFORE the delta guard", () => {
    // The usage chunk has an empty `choices` array, so `if (!delta) continue`
    // would skip it. Ordering is the whole fix and it cannot be observed from
    // the outside — the parser works either way, it just never sees usage.
    // Line endings are not the subject here: a stash round-trip flipped this
    // file to CRLF once and turned a real, passing property into a red test.
    expect(SRC_CLOUD).toMatch(
      /_serapPakai\(j, pakai\);\s*const delta = j\.choices/,
    );
  });

  test("nothing is reported when the provider stayed silent", () => {
    // Zero is a claim. The callback fires only when a real number arrived.
    expect(SRC_CLOUD).toMatch(
      /if \(onPakai && \(pakai\.masuk \|\| pakai\.keluar\)\)/,
    );
  });

  test("usage rides a callback, never the assistant message", () => {
    // The resolved message goes back into the history and is sent to the API
    // again; providers here already reject unknown fields (qwen refuses an
    // empty `tools` array), so metadata must not travel on it.
    const blok = SRC_CLOUD.slice(
      SRC_CLOUD.indexOf("const response: Record<string, any> = {"),
      SRC_CLOUD.indexOf("resolve(response);"),
    );
    expect(blok).not.toMatch(/response\.(pakai|_pakai|usage)/);
  });
});

describe("hitungan berjalan sungguhan, bukan hanya di akhir", () => {
  test("the stream reports while it is still streaming", () => {
    // Exact usage only exists once a request finishes. Waiting for it meant
    // the counter could not move during the one period worth watching, so
    // progress is reported from bytes sent and characters received as they
    // arrive — and labelled as an estimate.
    expect(SRC_CLOUD).toMatch(/const lapor = \(selesai: boolean\) =>/);
    expect(SRC_CLOUD).toMatch(
      /isiSejauhIni = content\.length \+ reasoning\.length/,
    );
    expect(SRC_CLOUD).toMatch(/lapor\(false\);/);
  });

  test("progress reports are throttled", () => {
    // A fast stream sends hundreds of chunks a second; the UI cannot use more
    // than a few updates of the same figure.
    expect(SRC_CLOUD).toMatch(/t - laporTerakhir < \d+/);
  });

  test("the settled report ALWAYS fires", () => {
    // A live estimate is outstanding by then. Staying silent — which the
    // earlier version did whenever a provider reported nothing — leaves that
    // estimate on screen as a permanent guess.
    const blok = SRC_CLOUD.slice(
      SRC_CLOUD.indexOf("const response: Record<string, any> = {"),
      SRC_CLOUD.indexOf("resolve(response);"),
    );
    expect(blok).toMatch(/lapor\(true\);/);
  });

  test("an estimate is never presented as a measurement", () => {
    expect(SRC_CLOUD).toMatch(/taksiran: true/);
    expect(SRC_CLOUD).toMatch(/taksiran: false/);
    // The UI marks it, rather than quietly showing a guess as a figure.
    expect(SRC_UI).toMatch(/pakai\.taksiran \? "~" : ""/);
  });

  test("in-flight reports are added ON TOP, never folded into the total", () => {
    // The same call reports many times. Accumulating those would multiply one
    // call's cost by however many updates it happened to send — the same trap
    // _serapPakai avoids one level down, for the same reason.
    const blok = SRC_AGENT.slice(
      SRC_AGENT.indexOf("if (p.selesai) {"),
      SRC_AGENT.indexOf("if (p.selesai) {") + 1800,
    );
    expect(blok).toMatch(/pakaiRun\.masuk \+ \(p\.masuk \|\| 0\)/);
  });
});

describe("akumulasi lintas langkah", () => {
  test("the run sums per-call totals", () => {
    // Opposite rule to _serapPakai, and for the opposite reason: each STEP is a
    // separate request, so those totals do add up.
    expect(SRC_AGENT).toMatch(/pakaiRun\.masuk \+= p\.masuk \|\| 0/);
    expect(SRC_AGENT).toMatch(/pakaiRun\.keluar \+= p\.keluar \|\| 0/);
  });

  test("the denominator is the budget this repo declares, not a guessed window", () => {
    // effortTokenBudget already exists and is already stated to the model in
    // the system prompt. A model's real context window is not knowable here.
    expect(SRC_AGENT).toMatch(/anggaran: effortTokenBudget/);
  });

  test("it is emitted per step, so the badge can count while working", () => {
    expect(SRC_AGENT).toMatch(/t: "usage"/);
  });
});

describe("lencana di gelembung jawaban", () => {
  test("it renders nothing without real numbers", () => {
    expect(SRC_UI).toMatch(/if \(!pakai \|\| !total\) return null;/);
  });

  test("the early return sits AFTER the hooks", () => {
    // Returning before useState/useEffect changes the hook count between
    // renders and React throws — and it would throw exactly when a run has no
    // usage, which is the quiet case nobody tests by hand.
    const blok = SRC_UI.slice(
      SRC_UI.indexOf("function LencanaToken"),
      SRC_UI.indexOf("function HitlModal"),
    );
    expect(blok.indexOf("React.useState")).toBeLessThan(
      blok.indexOf("return null;"),
    );
    expect(blok.indexOf("React.useEffect")).toBeLessThan(
      blok.indexOf("return null;"),
    );
  });

  test("the animation respects prefers-reduced-motion", () => {
    expect(SRC_UI).toMatch(/prefers-reduced-motion: reduce/);
  });

  test("it starts at ZERO, so the first appearance actually counts", () => {
    // THE BUG THIS EXISTS FOR. It used to be useState(total): the first render
    // already held the final figure, the effect found `dari === total` and
    // returned without animating. On a single-step run — the only appearance
    // most answers get — the counter therefore never counted once. It popped
    // into existence at 9,468 fully formed, which is exactly what "menghitung,
    // bukan langsung menyimpulkan" was asking it not to do.
    const blok = SRC_UI.slice(
      SRC_UI.indexOf("function LencanaToken"),
      SRC_UI.indexOf("function HitlModal"),
    );
    // Seeded from the shared ref, which itself starts at 0 — so a run's first
    // appearance still climbs from nothing.
    expect(blok).toMatch(
      /React\.useState\(\s*tampilRef \? tampilRef\.current : 0,?\s*\)/,
    );
    expect(blok).toMatch(/React\.useRef\(0\)/);
    expect(blok).not.toMatch(/React\.useState\(total\)/);
  });

  test("a mid-roll update continues from the digits on screen", () => {
    // Live reports land while a roll is still running. Resuming from the
    // previous roll's STARTING value would make the number jump backwards.
    const blok = SRC_UI.slice(
      SRC_UI.indexOf("function LencanaToken"),
      SRC_UI.indexOf("function HitlModal"),
    );
    expect(blok).toMatch(/const dari = jejakRef\.current;/);
    expect(blok).toMatch(/jejakRef\.current = n;/);
  });

  test("the roll is long enough to read, and scaled to the distance", () => {
    // A climb of several thousand is worth watching digit by digit; a 12-token
    // top-up is not. Fixed at 420ms it did neither well.
    const blok = SRC_UI.slice(
      SRC_UI.indexOf("function LencanaToken"),
      SRC_UI.indexOf("function HitlModal"),
    );
    expect(blok).toMatch(/const jarak = Math\.abs\(total - dari\)/);
    expect(blok).toMatch(/Math\.min\(1100, Math\.max\(280, jarak \* 0\.16\)\)/);
  });

  test("the figure is shown in full, not compacted to k", () => {
    // "9.5k" hides the counting: the only digit that moves is a decimal. Full
    // figures are what make 1, 2, 3 ... visible, and tabular-nums keeps the
    // width steady while they move.
    const blok = SRC_UI.slice(
      SRC_UI.indexOf("function LencanaToken"),
      SRC_UI.indexOf("function HitlModal"),
    );
    expect(blok).toMatch(/tampil\.toLocaleString\(\)/);
    expect(blok).not.toMatch(/toFixed\(n >= 10000/);
  });

  test("the digits survive the handover from status row to bubble", () => {
    // THE BUG BEHIND "it only starts counting once the agent has finished".
    // The badge is rendered twice — status row while working, answer bubble
    // once done — and the first unmounts exactly as the second mounts. With
    // the value held inside the badge, that handover reset it to zero and the
    // entire climb replayed AT THE END, so the live counting during the run
    // was invisible and the only roll anyone saw was the final one.
    //
    // One ref, owned by the parent, passed to both.
    expect(SRC_UI).toMatch(/const tampilTokenRef = React\.useRef\(0\)/);
    const n = (
      SRC_UI.match(
        /<LencanaToken pakai=\{run\.pakai\} tampilRef=\{tampilTokenRef\} \/>/g,
      ) || []
    ).length;
    expect(n).toBe(2);
  });

  test("it is legible enough to watch while it moves", () => {
    // --text-faint (#4a5159 on #0b0d11) works for a label that just sits
    // there. It is too dim to follow digits changing in.
    const blok = SRC_CSS.slice(
      SRC_CSS.indexOf(".lencana-token {"),
      SRC_CSS.indexOf(".lencana-token:hover"),
    );
    expect(blok).toMatch(/color: var\(--text-muted\)/);
    expect(blok).not.toMatch(/color: var\(--text-faint\)/);
  });

  test("the unit is spelled out after the figure", () => {
    expect(SRC_UI).toMatch(/lencana-token-unit"> tokens</);
  });

  test("digits are tabular", () => {
    // Not cosmetic: the figure counts up frame by frame, and proportional
    // digits make the badge twitch sideways for the whole animation.
    const blok = SRC_CSS.slice(SRC_CSS.indexOf(".lencana-token {"));
    expect(blok).toMatch(/font-variant-numeric: tabular-nums/);
  });

  test("no pulsing, breathing, or looping animation — counting up is the only motion", () => {
    // Asked for explicitly: a plain count, not a "working" indicator glued on
    // top of it. The rolling total (already covered above) IS the animation;
    // nothing loops or breathes while it waits between updates. Scoped to the
    // badge's OWN block: `infinite` legitimately appears elsewhere in this
    // 4000-line stylesheet, on animations that have nothing to do with it.
    const blok = SRC_CSS.slice(
      SRC_CSS.indexOf(".lencana-token-row {"),
      SRC_CSS.indexOf(".lencana-token:hover {") + 200,
    );
    expect(blok).not.toMatch(/berdenyut/);
    expect(blok).not.toMatch(/infinite/);
    expect(SRC_UI).not.toMatch(/berdenyut/);
  });

  test("it counts DURING the run, not only in the finished answer", () => {
    // The first version rendered only inside the `run.done` block, so it
    // appeared already at its final value: the counter never counted. Two
    // call sites now, identical — the live status row and the finished
    // bubble both just pass the same run.pakai through.
    const n = (SRC_UI.match(/<LencanaToken pakai=\{run\.pakai\}/g) || [])
      .length;
    expect(n).toBe(2);
  });

  test("teks dan angkanya SEJAJAR, satu baris", () => {
    // THREE SHAPES WERE TRIED. A wrapper row above the text pushed the answer
    // down. A right float did not hold here at all — the badge landed on its
    // own line AND on the left. Both asked block flow to do something it only
    // sometimes does. The bubble is the row now, so neither element can push
    // the other onto a line of its own.
    // lastIndexOf, not a multi-line anchor: this rule is the last of the
    // three .av2-result-bubble blocks in the file, and an escaped newline
    // inside the search string has been eaten by tooling twice already.
    const blok = SRC_CSS.slice(SRC_CSS.lastIndexOf(".av2-result-bubble {"));
    expect(blok).toMatch(/display: flex/);
    expect(blok).toMatch(/align-items: flex-start/);
    expect(SRC_CSS).not.toMatch(/\.lencana-token-row/);
    expect(SRC_UI).not.toMatch(/lencana-token-row/);
  });

  test("isi jawaban tetap dalam alur blok normal", () => {
    // Without a wrapper, every paragraph and code block Blocks renders becomes
    // a flex item and lays itself out sideways. min-width:0 is what lets a long
    // line shrink instead of pushing the badge off the edge.
    expect(SRC_UI).toMatch(/<div className="av2-isi">/);
    const isi = SRC_CSS.slice(
      SRC_CSS.indexOf(".av2-isi {"),
      SRC_CSS.indexOf("}", SRC_CSS.indexOf(".av2-isi {")),
    );
    expect(isi).toMatch(/flex: 1/);
    expect(isi).toMatch(/min-width: 0/);
  });

  test("lencananya tidak menyusut saat teksnya panjang", () => {
    const blok = SRC_CSS.slice(
      SRC_CSS.indexOf(".lencana-token {"),
      SRC_CSS.indexOf(".lencana-token:hover"),
    );
    expect(blok).toMatch(/flex: 0 0 auto/);
    expect(blok).toMatch(/white-space: nowrap/);
  });

  test("it never floats and never anchors to a pixel offset", () => {
    // Both were tried; each put it somewhere other than the right.
    const blok = SRC_CSS.slice(
      SRC_CSS.indexOf(".lencana-token {"),
      SRC_CSS.indexOf(".lencana-token:hover"),
    );
    // Anchored to a DECLARATION at the start of a line, not a bare substring:
    // the comment above these rules explains that float was tried, and the
    // first version of this test matched that prose and went red over it.
    expect(blok).not.toMatch(/^\s*float:/m);
    expect(blok).not.toMatch(/^\s*position:\s*absolute/m);
    // The status row is a flex line of its own; this is what ends it there.
    expect(blok).toMatch(/margin-left: auto/);
  });

  test("nothing boxes the number in", () => {
    // Asked for plainly: remove the border so it reads as part of the answer
    // rather than a chip stuck on top of it.
    const blok = SRC_CSS.slice(
      SRC_CSS.indexOf(".lencana-token {"),
      SRC_CSS.indexOf(".lencana-token:hover"),
    );
    expect(blok).not.toMatch(/border:/);
    expect(blok).not.toMatch(/background:/);
    expect(blok).not.toMatch(/border-radius:/);
  });

  test("it stays grey — no colour state", () => {
    // Asked for plainly: grey only. An over-budget red read as an error when
    // nothing had gone wrong.
    expect(SRC_CSS).not.toMatch(/\.lencana-token\.lewat/);
    expect(SRC_UI).not.toMatch(/lewat \? " lewat" : ""/);
  });

  test("it is sized closer to the answer text, not a tiny caption", () => {
    // Asked for twice: "besarin ukuranya". Measured against the 13px the
    // answer paragraph itself uses (.bubble-model), not an arbitrary floor.
    const blok = SRC_CSS.slice(
      SRC_CSS.indexOf(".lencana-token {"),
      SRC_CSS.indexOf(".lencana-token:hover"),
    );
    const px = Number((blok.match(/font-size:\s*(\d+)px/) || [])[1]);
    expect(px).toBeGreaterThanOrEqual(11);
  });
});
