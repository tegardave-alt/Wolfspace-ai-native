// a2ui.ts — the agent proposes a small, native UI instead of describing one.
//
// ROLE IN THE SYSTEM. Visual Draw lets the user say WHERE ("this region, on
// this element"); this is the reply channel: the agent answers with a
// declarative panel — sliders, a choice, a button — that WOLFSPACE renders
// with its own components, anchored to that region. The user adjusts, sees
// the effect live in the preview, and presses Apply; only then does the
// agent edit the source. The wire format follows A2UI (components + data
// model, no code), trimmed to what this app can render.
//
// WHY A CLOSED CATALOG. A payload from the model is untrusted content that
// is about to be rendered next to the user's own UI. Every component type,
// every prop, every action name is checked against the list below; anything
// else is rejected before it reaches the renderer. The model cannot smuggle
// markup, URLs or scripts through here because there is nowhere in the
// schema to put them.
//
// CONNECTS TO
//   used by  agent/tools/index.ts (ui_propose), agent/self_agent.ts (emit),
//            public/app/A2UI.tsx (renderer, the same catalog by name)

/** Component types the renderer knows. Adding one means adding it there too. */
export const KATALOG: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    Card: ["title", "description"],
    Text: ["text", "muted"],
    Slider: ["label", "min", "max", "step", "unit"],
    Select: ["label", "options"],
    Toggle: ["label"],
    Actions: [],
    Button: ["label", "primary", "danger"],
  });

/** What a Button may do. The renderer maps these to one reply each. */
export const AKSI = Object.freeze(["apply", "cancel", "choose"]);

/** Hard limits: a panel, not a page. */
export const BATAS = Object.freeze({
  komponen: 24,
  karakter: 6000,
  anchor: 200,
  teks: 400,
  opsi: 12,
});

export interface Komponen {
  id: string;
  type: string;
  props?: Record<string, any>;
  children?: string[];
  /** dataModel key this input reads and writes. */
  bind?: string;
  /** For Button: one of AKSI. */
  action?: string;
}

export interface Proposal {
  /** CSS selector the panel is anchored to — from Visual Draw's data-target. */
  anchor: string;
  components: Komponen[];
  dataModel: Record<string, string | number | boolean>;
  /**
   * Live preview: inline CSS applied to `selector` while the user adjusts,
   * with {key} placeholders read from dataModel. Removed on cancel. Values
   * are checked to be plain CSS values — no url(), no expressions.
   */
  preview?: { selector: string; css: Record<string, string> };
}

export interface HasilValidasi {
  ok: boolean;
  proposal?: Proposal;
  error?: string;
}

const _idSah = (s: any) =>
  typeof s === "string" && /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(s);
const _teksSah = (s: any, n: number = BATAS.teks) =>
  typeof s === "string" && s.length <= n && !/[<>]/.test(s);
// A CSS value the preview may apply: units, colours, keywords, calc-free.
const _cssSah = (s: any) =>
  typeof s === "string" &&
  s.length <= 80 &&
  /^[a-zA-Z0-9 #.,%()\-{}]*$/.test(s) &&
  !/url\(|expression\(|javascript:/i.test(s);

/**
 * Validate a payload from the model. Never throws; the error names what is
 * wrong so the model can resend, the way the edit tool reports a bad
 * old_string.
 */
export function validasi(raw: any): HasilValidasi {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "payload must be an object" };
  const teks = JSON.stringify(raw);
  if (teks.length > BATAS.karakter) {
    return {
      ok: false,
      error:
        "payload is " + teks.length + " chars; the limit is " + BATAS.karakter,
    };
  }
  const anchor = String(raw.anchor || "").trim();
  if (!anchor || anchor.length > BATAS.anchor || /[<>{}]/.test(anchor)) {
    return {
      ok: false,
      error: "anchor must be a CSS selector under " + BATAS.anchor + " chars",
    };
  }
  if (!Array.isArray(raw.components) || raw.components.length === 0) {
    return { ok: false, error: "components must be a non-empty array" };
  }
  if (raw.components.length > BATAS.komponen) {
    return {
      ok: false,
      error:
        "too many components (" +
        raw.components.length +
        " > " +
        BATAS.komponen +
        ")",
    };
  }
  const dataModel: Record<string, any> = {};
  if (raw.dataModel && typeof raw.dataModel === "object") {
    for (const [k, v] of Object.entries(raw.dataModel)) {
      if (!_idSah(k))
        return { ok: false, error: "dataModel key is not an identifier: " + k };
      if (!["string", "number", "boolean"].includes(typeof v)) {
        return {
          ok: false,
          error: "dataModel." + k + " must be a string, number or boolean",
        };
      }
      if (typeof v === "string" && !_teksSah(v))
        return {
          ok: false,
          error: "dataModel." + k + " has markup or is too long",
        };
      dataModel[k] = v;
    }
  }

  const ids = new Set<string>();
  const components: Komponen[] = [];
  for (const c of raw.components) {
    if (!c || typeof c !== "object")
      return { ok: false, error: "component must be an object" };
    if (!_idSah(c.id))
      return {
        ok: false,
        error: "component id is not an identifier: " + JSON.stringify(c.id),
      };
    if (ids.has(c.id))
      return { ok: false, error: "duplicate component id: " + c.id };
    ids.add(c.id);
    const izin = KATALOG[c.type];
    if (!izin)
      return {
        ok: false,
        error:
          "unknown component type: " +
          c.type +
          " (known: " +
          Object.keys(KATALOG).join(", ") +
          ")",
      };
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(c.props || {})) {
      if (!izin.includes(k))
        return { ok: false, error: c.type + " has no prop " + k };
      if (k === "options") {
        if (
          !Array.isArray(v) ||
          v.length === 0 ||
          v.length > BATAS.opsi ||
          !v.every((o) => _teksSah(o, 80))
        ) {
          return {
            ok: false,
            error: c.id + ".options must be 1-" + BATAS.opsi + " short strings",
          };
        }
      } else if (typeof v === "string") {
        if (!_teksSah(v))
          return {
            ok: false,
            error: c.id + "." + k + " has markup or is too long",
          };
      } else if (!["number", "boolean"].includes(typeof v)) {
        return {
          ok: false,
          error: c.id + "." + k + " must be a string, number or boolean",
        };
      }
      props[k] = v;
    }
    const k: Komponen = { id: c.id, type: c.type, props };
    if (c.bind !== undefined) {
      if (!_idSah(c.bind))
        return { ok: false, error: c.id + ".bind is not an identifier" };
      if (!(c.bind in dataModel))
        return {
          ok: false,
          error: c.id + " binds " + c.bind + ", which is not in dataModel",
        };
      k.bind = c.bind;
    }
    if (c.action !== undefined) {
      if (c.type !== "Button")
        return {
          ok: false,
          error: "only a Button may have an action (" + c.id + ")",
        };
      if (!AKSI.includes(c.action))
        return {
          ok: false,
          error: c.id + ".action must be one of " + AKSI.join(", "),
        };
      k.action = c.action;
    }
    if (c.children !== undefined) {
      if (!Array.isArray(c.children) || !c.children.every(_idSah)) {
        return { ok: false, error: c.id + ".children must be an array of ids" };
      }
      k.children = c.children.slice();
    }
    components.push(k);
  }
  // Children must exist, and a Button must offer a way out.
  for (const c of components) {
    for (const ch of c.children || []) {
      if (!ids.has(ch))
        return { ok: false, error: c.id + " references missing child " + ch };
    }
  }
  if (!components.some((c) => c.type === "Button" && c.action === "cancel")) {
    return {
      ok: false,
      error: 'a proposal must include a Button with action "cancel"',
    };
  }

  let preview: Proposal["preview"];
  if (raw.preview !== undefined) {
    const p = raw.preview;
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.selector !== "string" ||
      !p.selector.trim()
    ) {
      return {
        ok: false,
        error: "preview.selector is required when preview is given",
      };
    }
    if (p.selector.length > BATAS.anchor || /[<>{}]/.test(p.selector)) {
      return { ok: false, error: "preview.selector is not a CSS selector" };
    }
    const css: Record<string, string> = {};
    for (const [prop, val] of Object.entries(p.css || {})) {
      if (!/^[a-z-]{1,40}$/.test(prop))
        return {
          ok: false,
          error: "preview.css property is not a CSS property: " + prop,
        };
      if (!_cssSah(val))
        return {
          ok: false,
          error: "preview.css." + prop + " is not a plain CSS value",
        };
      // Every {key} must exist in the data model, or the preview would print
      // the placeholder itself.
      for (const m of String(val).matchAll(/\{([a-zA-Z][a-zA-Z0-9_-]*)\}/g)) {
        if (!(m[1] in dataModel))
          return {
            ok: false,
            error:
              "preview.css." +
              prop +
              " uses {" +
              m[1] +
              "}, which is not in dataModel",
          };
      }
      css[prop] = String(val);
    }
    preview = { selector: p.selector.trim(), css };
  }

  return { ok: true, proposal: { anchor, components, dataModel, preview } };
}

/**
 * What the model reads back after the user acts. One line, machine-shaped,
 * so the next turn can parse it the same way every time.
 */
export function ringkasAksi(aksi: string, data: Record<string, any>): string {
  return "[a2ui:" + aksi + "] " + JSON.stringify(data || {});
}

module.exports = { KATALOG, AKSI, BATAS, validasi, ringkasAksi };
