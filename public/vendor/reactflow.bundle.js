var RFLib = (() => {
  var fd = Object.create;
  var En = Object.defineProperty;
  var hd = Object.getOwnPropertyDescriptor;
  var pd = Object.getOwnPropertyNames;
  var gd = Object.getPrototypeOf,
    md = Object.prototype.hasOwnProperty;
  var Ue = (e, t) => () => {
      try {
        return (t || e((t = { exports: {} }).exports, t), t.exports);
      } catch (n) {
        throw ((t = 0), n);
      }
    },
    Ur = (e, t) => {
      for (var n in t) En(e, n, { get: t[n], enumerable: !0 });
    },
    Qr = (e, t, n, o) => {
      if ((t && typeof t == "object") || typeof t == "function")
        for (let r of pd(t))
          !md.call(e, r) &&
            r !== n &&
            En(e, r, {
              get: () => t[r],
              enumerable: !(o = hd(t, r)) || o.enumerable,
            });
      return e;
    };
  var Lt = (e, t, n) => (
      (n = e != null ? fd(gd(e)) : {}),
      Qr(
        t || !e || !e.__esModule
          ? En(n, "default", { value: e, enumerable: !0 })
          : n,
        e,
      )
    ),
    yd = (e) => Qr(En({}, "__esModule", { value: !0 }), e);
  var ei = Ue((Wx, Jr) => {
    var _n = window.React;
    function Po(e, t, n) {
      var o = {},
        r;
      for (var i in t) i === "children" ? (r = t[i]) : (o[i] = t[i]);
      return (
        n !== void 0 && (o.key = n),
        r === void 0
          ? _n.createElement(e, o)
          : Array.isArray(r)
            ? _n.createElement.apply(null, [e, o].concat(r))
            : _n.createElement(e, o, r)
      );
    }
    Jr.exports = { jsx: Po, jsxs: Po, jsxDEV: Po, Fragment: _n.Fragment };
  });
  var $t = Ue((qx, ti) => {
    ti.exports = window.React;
  });
  var qa = Ue((Wa) => {
    "use strict";
    var Ot = $t();
    function hp(e, t) {
      return (e === t && (e !== 0 || 1 / e === 1 / t)) || (e !== e && t !== t);
    }
    var pp = typeof Object.is == "function" ? Object.is : hp,
      gp = Ot.useState,
      mp = Ot.useEffect,
      yp = Ot.useLayoutEffect,
      xp = Ot.useDebugValue;
    function wp(e, t) {
      var n = t(),
        o = gp({ inst: { value: n, getSnapshot: t } }),
        r = o[0].inst,
        i = o[1];
      return (
        yp(
          function () {
            ((r.value = n), (r.getSnapshot = t), xr(r) && i({ inst: r }));
          },
          [e, n, t],
        ),
        mp(
          function () {
            return (
              xr(r) && i({ inst: r }),
              e(function () {
                xr(r) && i({ inst: r });
              })
            );
          },
          [e],
        ),
        xp(n),
        n
      );
    }
    function xr(e) {
      var t = e.getSnapshot;
      e = e.value;
      try {
        var n = t();
        return !pp(e, n);
      } catch {
        return !0;
      }
    }
    function vp(e, t) {
      return t();
    }
    var bp =
      typeof window > "u" ||
      typeof window.document > "u" ||
      typeof window.document.createElement > "u"
        ? vp
        : wp;
    Wa.useSyncExternalStore =
      Ot.useSyncExternalStore !== void 0 ? Ot.useSyncExternalStore : bp;
  });
  var ja = Ue((B1, Ga) => {
    "use strict";
    Ga.exports = qa();
  });
  var Ua = Ue((Ka) => {
    "use strict";
    var mo = $t(),
      Ep = ja();
    function _p(e, t) {
      return (e === t && (e !== 0 || 1 / e === 1 / t)) || (e !== e && t !== t);
    }
    var Sp = typeof Object.is == "function" ? Object.is : _p,
      Np = Ep.useSyncExternalStore,
      Cp = mo.useRef,
      Mp = mo.useEffect,
      Ip = mo.useMemo,
      kp = mo.useDebugValue;
    Ka.useSyncExternalStoreWithSelector = function (e, t, n, o, r) {
      var i = Cp(null);
      if (i.current === null) {
        var s = { hasValue: !1, value: null };
        i.current = s;
      } else s = i.current;
      i = Ip(
        function () {
          function c(h) {
            if (!l) {
              if (((l = !0), (u = h), (h = o(h)), r !== void 0 && s.hasValue)) {
                var p = s.value;
                if (r(p, h)) return (d = p);
              }
              return (d = h);
            }
            if (((p = d), Sp(u, h))) return p;
            var x = o(h);
            return r !== void 0 && r(p, x) ? ((u = h), p) : ((u = h), (d = x));
          }
          var l = !1,
            u,
            d,
            f = n === void 0 ? null : n;
          return [
            function () {
              return c(t());
            },
            f === null
              ? void 0
              : function () {
                  return c(f());
                },
          ];
        },
        [t, n, o, r],
      );
      var a = Np(e, i[0], i[1]);
      return (
        Mp(
          function () {
            ((s.hasValue = !0), (s.value = a));
          },
          [a],
        ),
        kp(a),
        a
      );
    };
  });
  var Ja = Ue((F1, Qa) => {
    "use strict";
    Qa.exports = Ua();
  });
  var cc = Ue((q1, ac) => {
    ac.exports = window.ReactDOM;
  });
  var Xx = {};
  Ur(Xx, { XY: () => Or, dagre: () => cu });
  var Or = {};
  Ur(Or, {
    Background: () => Vm,
    BackgroundVariant: () => Be,
    BaseEdge: () => xn,
    BezierEdge: () => dl,
    ConnectionLineType: () => _e,
    ConnectionMode: () => He,
    ControlButton: () => gn,
    Controls: () => Gm,
    EdgeLabelRenderer: () => xl,
    EdgeText: () => Qc,
    EdgeToolbar: () => w0,
    Handle: () => mn,
    MarkerType: () => ct,
    MiniMap: () => a0,
    MiniMapNode: () => bl,
    NodeResizeControl: () => Sr,
    NodeResizer: () => d0,
    NodeToolbar: () => y0,
    PanOnScrollMode: () => Ie,
    Panel: () => yn,
    Position: () => Y,
    ReactFlow: () => hm,
    ReactFlowProvider: () => yl,
    ResizeControlVariant: () => ke,
    SelectionMode: () => We,
    SimpleBezierEdge: () => el,
    SmoothStepEdge: () => kr,
    StepEdge: () => il,
    StraightEdge: () => cl,
    ViewportPortal: () => mm,
    addEdge: () => Bc,
    applyEdgeChanges: () => Cr,
    applyNodeChanges: () => Nr,
    experimental_useOnEdgesChangeMiddleware: () => Rm,
    experimental_useOnNodesChangeMiddleware: () => zm,
    getBezierEdgeCenter: () => fn,
    getBezierPath: () => hn,
    getConnectedEdges: () => or,
    getEdgeCenter: () => lo,
    getIncomers: () => ua,
    getNodesBounds: () => no,
    getOutgoers: () => la,
    getSimpleBezierPath: () => Ir,
    getSmoothStepPath: () => kt,
    getStraightPath: () => pn,
    getViewportForBounds: () => Mt,
    isEdge: () => Vc,
    isNode: () => Er,
    reconnectEdge: () => Jp,
    useConnection: () => pl,
    useEdges: () => bm,
    useEdgesState: () => Nm,
    useHandleConnections: () => Om,
    useInternalNode: () => Dm,
    useKeyPress: () => At,
    useNodeConnections: () => Am,
    useNodeId: () => Tt,
    useNodes: () => wm,
    useNodesData: () => Tm,
    useNodesInitialized: () => km,
    useNodesState: () => Sm,
    useOnSelectionChange: () => Mm,
    useOnViewportChange: () => Cm,
    useReactFlow: () => bo,
    useStore: () => K,
    useStoreApi: () => ne,
    useUpdateNodeInternals: () => ym,
    useViewport: () => _m,
  });
  var k = Lt(ei()),
    C = Lt($t());
  function ie(e) {
    if (typeof e == "string" || typeof e == "number") return "" + e;
    let t = "";
    if (Array.isArray(e))
      for (let n = 0, o; n < e.length; n++)
        (o = ie(e[n])) !== "" && (t += (t && " ") + o);
    else for (let n in e) e[n] && (t += (t && " ") + n);
    return t;
  }
  var xd = { value: () => {} };
  function oi() {
    for (var e = 0, t = arguments.length, n = {}, o; e < t; ++e) {
      if (!(o = arguments[e] + "") || o in n || /[\s.]/.test(o))
        throw new Error("illegal type: " + o);
      n[o] = [];
    }
    return new Sn(n);
  }
  function Sn(e) {
    this._ = e;
  }
  function wd(e, t) {
    return e
      .trim()
      .split(/^|\s+/)
      .map(function (n) {
        var o = "",
          r = n.indexOf(".");
        if (
          (r >= 0 && ((o = n.slice(r + 1)), (n = n.slice(0, r))),
          n && !t.hasOwnProperty(n))
        )
          throw new Error("unknown type: " + n);
        return { type: n, name: o };
      });
  }
  Sn.prototype = oi.prototype = {
    constructor: Sn,
    on: function (e, t) {
      var n = this._,
        o = wd(e + "", n),
        r,
        i = -1,
        s = o.length;
      if (arguments.length < 2) {
        for (; ++i < s;)
          if ((r = (e = o[i]).type) && (r = vd(n[r], e.name))) return r;
        return;
      }
      if (t != null && typeof t != "function")
        throw new Error("invalid callback: " + t);
      for (; ++i < s;)
        if ((r = (e = o[i]).type)) n[r] = ni(n[r], e.name, t);
        else if (t == null) for (r in n) n[r] = ni(n[r], e.name, null);
      return this;
    },
    copy: function () {
      var e = {},
        t = this._;
      for (var n in t) e[n] = t[n].slice();
      return new Sn(e);
    },
    call: function (e, t) {
      if ((r = arguments.length - 2) > 0)
        for (var n = new Array(r), o = 0, r, i; o < r; ++o)
          n[o] = arguments[o + 2];
      if (!this._.hasOwnProperty(e)) throw new Error("unknown type: " + e);
      for (i = this._[e], o = 0, r = i.length; o < r; ++o)
        i[o].value.apply(t, n);
    },
    apply: function (e, t, n) {
      if (!this._.hasOwnProperty(e)) throw new Error("unknown type: " + e);
      for (var o = this._[e], r = 0, i = o.length; r < i; ++r)
        o[r].value.apply(t, n);
    },
  };
  function vd(e, t) {
    for (var n = 0, o = e.length, r; n < o; ++n)
      if ((r = e[n]).name === t) return r.value;
  }
  function ni(e, t, n) {
    for (var o = 0, r = e.length; o < r; ++o)
      if (e[o].name === t) {
        ((e[o] = xd), (e = e.slice(0, o).concat(e.slice(o + 1))));
        break;
      }
    return (n != null && e.push({ name: t, value: n }), e);
  }
  var Qe = oi;
  var Nn = "http://www.w3.org/1999/xhtml",
    Ao = {
      svg: "http://www.w3.org/2000/svg",
      xhtml: Nn,
      xlink: "http://www.w3.org/1999/xlink",
      xml: "http://www.w3.org/XML/1998/namespace",
      xmlns: "http://www.w3.org/2000/xmlns/",
    };
  function ze(e) {
    var t = (e += ""),
      n = t.indexOf(":");
    return (
      n >= 0 && (t = e.slice(0, n)) !== "xmlns" && (e = e.slice(n + 1)),
      Ao.hasOwnProperty(t) ? { space: Ao[t], local: e } : e
    );
  }
  function bd(e) {
    return function () {
      var t = this.ownerDocument,
        n = this.namespaceURI;
      return n === Nn && t.documentElement.namespaceURI === Nn
        ? t.createElement(e)
        : t.createElementNS(n, e);
    };
  }
  function Ed(e) {
    return function () {
      return this.ownerDocument.createElementNS(e.space, e.local);
    };
  }
  function Cn(e) {
    var t = ze(e);
    return (t.local ? Ed : bd)(t);
  }
  function _d() {}
  function Je(e) {
    return e == null
      ? _d
      : function () {
          return this.querySelector(e);
        };
  }
  function ri(e) {
    typeof e != "function" && (e = Je(e));
    for (
      var t = this._groups, n = t.length, o = new Array(n), r = 0;
      r < n;
      ++r
    )
      for (
        var i = t[r], s = i.length, a = (o[r] = new Array(s)), c, l, u = 0;
        u < s;
        ++u
      )
        (c = i[u]) &&
          (l = e.call(c, c.__data__, u, i)) &&
          ("__data__" in c && (l.__data__ = c.__data__), (a[u] = l));
    return new se(o, this._parents);
  }
  function To(e) {
    return e == null ? [] : Array.isArray(e) ? e : Array.from(e);
  }
  function Sd() {
    return [];
  }
  function Ht(e) {
    return e == null
      ? Sd
      : function () {
          return this.querySelectorAll(e);
        };
  }
  function Nd(e) {
    return function () {
      return To(e.apply(this, arguments));
    };
  }
  function ii(e) {
    typeof e == "function" ? (e = Nd(e)) : (e = Ht(e));
    for (var t = this._groups, n = t.length, o = [], r = [], i = 0; i < n; ++i)
      for (var s = t[i], a = s.length, c, l = 0; l < a; ++l)
        (c = s[l]) && (o.push(e.call(c, c.__data__, l, s)), r.push(c));
    return new se(o, r);
  }
  function Bt(e) {
    return function () {
      return this.matches(e);
    };
  }
  function Mn(e) {
    return function (t) {
      return t.matches(e);
    };
  }
  var Cd = Array.prototype.find;
  function Md(e) {
    return function () {
      return Cd.call(this.children, e);
    };
  }
  function Id() {
    return this.firstElementChild;
  }
  function si(e) {
    return this.select(e == null ? Id : Md(typeof e == "function" ? e : Mn(e)));
  }
  var kd = Array.prototype.filter;
  function Od() {
    return Array.from(this.children);
  }
  function Pd(e) {
    return function () {
      return kd.call(this.children, e);
    };
  }
  function ai(e) {
    return this.selectAll(
      e == null ? Od : Pd(typeof e == "function" ? e : Mn(e)),
    );
  }
  function ci(e) {
    typeof e != "function" && (e = Bt(e));
    for (
      var t = this._groups, n = t.length, o = new Array(n), r = 0;
      r < n;
      ++r
    )
      for (var i = t[r], s = i.length, a = (o[r] = []), c, l = 0; l < s; ++l)
        (c = i[l]) && e.call(c, c.__data__, l, i) && a.push(c);
    return new se(o, this._parents);
  }
  function In(e) {
    return new Array(e.length);
  }
  function li() {
    return new se(this._enter || this._groups.map(In), this._parents);
  }
  function Vt(e, t) {
    ((this.ownerDocument = e.ownerDocument),
      (this.namespaceURI = e.namespaceURI),
      (this._next = null),
      (this._parent = e),
      (this.__data__ = t));
  }
  Vt.prototype = {
    constructor: Vt,
    appendChild: function (e) {
      return this._parent.insertBefore(e, this._next);
    },
    insertBefore: function (e, t) {
      return this._parent.insertBefore(e, t);
    },
    querySelector: function (e) {
      return this._parent.querySelector(e);
    },
    querySelectorAll: function (e) {
      return this._parent.querySelectorAll(e);
    },
  };
  function ui(e) {
    return function () {
      return e;
    };
  }
  function Ad(e, t, n, o, r, i) {
    for (var s = 0, a, c = t.length, l = i.length; s < l; ++s)
      (a = t[s]) ? ((a.__data__ = i[s]), (o[s] = a)) : (n[s] = new Vt(e, i[s]));
    for (; s < c; ++s) (a = t[s]) && (r[s] = a);
  }
  function Td(e, t, n, o, r, i, s) {
    var a,
      c,
      l = new Map(),
      u = t.length,
      d = i.length,
      f = new Array(u),
      h;
    for (a = 0; a < u; ++a)
      (c = t[a]) &&
        ((f[a] = h = s.call(c, c.__data__, a, t) + ""),
        l.has(h) ? (r[a] = c) : l.set(h, c));
    for (a = 0; a < d; ++a)
      ((h = s.call(e, i[a], a, i) + ""),
        (c = l.get(h))
          ? ((o[a] = c), (c.__data__ = i[a]), l.delete(h))
          : (n[a] = new Vt(e, i[a])));
    for (a = 0; a < u; ++a) (c = t[a]) && l.get(f[a]) === c && (r[a] = c);
  }
  function Dd(e) {
    return e.__data__;
  }
  function di(e, t) {
    if (!arguments.length) return Array.from(this, Dd);
    var n = t ? Td : Ad,
      o = this._parents,
      r = this._groups;
    typeof e != "function" && (e = ui(e));
    for (
      var i = r.length,
        s = new Array(i),
        a = new Array(i),
        c = new Array(i),
        l = 0;
      l < i;
      ++l
    ) {
      var u = o[l],
        d = r[l],
        f = d.length,
        h = zd(e.call(u, u && u.__data__, l, o)),
        p = h.length,
        x = (a[l] = new Array(p)),
        y = (s[l] = new Array(p)),
        m = (c[l] = new Array(f));
      n(u, d, x, y, m, h, t);
      for (var b = 0, g = 0, v, N; b < p; ++b)
        if ((v = x[b])) {
          for (b >= g && (g = b + 1); !(N = y[g]) && ++g < p;);
          v._next = N || null;
        }
    }
    return ((s = new se(s, o)), (s._enter = a), (s._exit = c), s);
  }
  function zd(e) {
    return typeof e == "object" && "length" in e ? e : Array.from(e);
  }
  function fi() {
    return new se(this._exit || this._groups.map(In), this._parents);
  }
  function hi(e, t, n) {
    var o = this.enter(),
      r = this,
      i = this.exit();
    return (
      typeof e == "function"
        ? ((o = e(o)), o && (o = o.selection()))
        : (o = o.append(e + "")),
      t != null && ((r = t(r)), r && (r = r.selection())),
      n == null ? i.remove() : n(i),
      o && r ? o.merge(r).order() : r
    );
  }
  function pi(e) {
    for (
      var t = e.selection ? e.selection() : e,
        n = this._groups,
        o = t._groups,
        r = n.length,
        i = o.length,
        s = Math.min(r, i),
        a = new Array(r),
        c = 0;
      c < s;
      ++c
    )
      for (
        var l = n[c],
          u = o[c],
          d = l.length,
          f = (a[c] = new Array(d)),
          h,
          p = 0;
        p < d;
        ++p
      )
        (h = l[p] || u[p]) && (f[p] = h);
    for (; c < r; ++c) a[c] = n[c];
    return new se(a, this._parents);
  }
  function gi() {
    for (var e = this._groups, t = -1, n = e.length; ++t < n;)
      for (var o = e[t], r = o.length - 1, i = o[r], s; --r >= 0;)
        (s = o[r]) &&
          (i &&
            s.compareDocumentPosition(i) ^ 4 &&
            i.parentNode.insertBefore(s, i),
          (i = s));
    return this;
  }
  function mi(e) {
    e || (e = Rd);
    function t(d, f) {
      return d && f ? e(d.__data__, f.__data__) : !d - !f;
    }
    for (
      var n = this._groups, o = n.length, r = new Array(o), i = 0;
      i < o;
      ++i
    ) {
      for (
        var s = n[i], a = s.length, c = (r[i] = new Array(a)), l, u = 0;
        u < a;
        ++u
      )
        (l = s[u]) && (c[u] = l);
      c.sort(t);
    }
    return new se(r, this._parents).order();
  }
  function Rd(e, t) {
    return e < t ? -1 : e > t ? 1 : e >= t ? 0 : NaN;
  }
  function yi() {
    var e = arguments[0];
    return ((arguments[0] = this), e.apply(null, arguments), this);
  }
  function xi() {
    return Array.from(this);
  }
  function wi() {
    for (var e = this._groups, t = 0, n = e.length; t < n; ++t)
      for (var o = e[t], r = 0, i = o.length; r < i; ++r) {
        var s = o[r];
        if (s) return s;
      }
    return null;
  }
  function vi() {
    let e = 0;
    for (let t of this) ++e;
    return e;
  }
  function bi() {
    return !this.node();
  }
  function Ei(e) {
    for (var t = this._groups, n = 0, o = t.length; n < o; ++n)
      for (var r = t[n], i = 0, s = r.length, a; i < s; ++i)
        (a = r[i]) && e.call(a, a.__data__, i, r);
    return this;
  }
  function Ld(e) {
    return function () {
      this.removeAttribute(e);
    };
  }
  function $d(e) {
    return function () {
      this.removeAttributeNS(e.space, e.local);
    };
  }
  function Hd(e, t) {
    return function () {
      this.setAttribute(e, t);
    };
  }
  function Bd(e, t) {
    return function () {
      this.setAttributeNS(e.space, e.local, t);
    };
  }
  function Vd(e, t) {
    return function () {
      var n = t.apply(this, arguments);
      n == null ? this.removeAttribute(e) : this.setAttribute(e, n);
    };
  }
  function Fd(e, t) {
    return function () {
      var n = t.apply(this, arguments);
      n == null
        ? this.removeAttributeNS(e.space, e.local)
        : this.setAttributeNS(e.space, e.local, n);
    };
  }
  function _i(e, t) {
    var n = ze(e);
    if (arguments.length < 2) {
      var o = this.node();
      return n.local ? o.getAttributeNS(n.space, n.local) : o.getAttribute(n);
    }
    return this.each(
      (t == null
        ? n.local
          ? $d
          : Ld
        : typeof t == "function"
          ? n.local
            ? Fd
            : Vd
          : n.local
            ? Bd
            : Hd)(n, t),
    );
  }
  function kn(e) {
    return (
      (e.ownerDocument && e.ownerDocument.defaultView) ||
      (e.document && e) ||
      e.defaultView
    );
  }
  function Yd(e) {
    return function () {
      this.style.removeProperty(e);
    };
  }
  function Xd(e, t, n) {
    return function () {
      this.style.setProperty(e, t, n);
    };
  }
  function Zd(e, t, n) {
    return function () {
      var o = t.apply(this, arguments);
      o == null
        ? this.style.removeProperty(e)
        : this.style.setProperty(e, o, n);
    };
  }
  function Si(e, t, n) {
    return arguments.length > 1
      ? this.each(
          (t == null ? Yd : typeof t == "function" ? Zd : Xd)(e, t, n ?? ""),
        )
      : Ve(this.node(), e);
  }
  function Ve(e, t) {
    return (
      e.style.getPropertyValue(t) ||
      kn(e).getComputedStyle(e, null).getPropertyValue(t)
    );
  }
  function Wd(e) {
    return function () {
      delete this[e];
    };
  }
  function qd(e, t) {
    return function () {
      this[e] = t;
    };
  }
  function Gd(e, t) {
    return function () {
      var n = t.apply(this, arguments);
      n == null ? delete this[e] : (this[e] = n);
    };
  }
  function Ni(e, t) {
    return arguments.length > 1
      ? this.each((t == null ? Wd : typeof t == "function" ? Gd : qd)(e, t))
      : this.node()[e];
  }
  function Ci(e) {
    return e.trim().split(/^|\s+/);
  }
  function Do(e) {
    return e.classList || new Mi(e);
  }
  function Mi(e) {
    ((this._node = e), (this._names = Ci(e.getAttribute("class") || "")));
  }
  Mi.prototype = {
    add: function (e) {
      var t = this._names.indexOf(e);
      t < 0 &&
        (this._names.push(e),
        this._node.setAttribute("class", this._names.join(" ")));
    },
    remove: function (e) {
      var t = this._names.indexOf(e);
      t >= 0 &&
        (this._names.splice(t, 1),
        this._node.setAttribute("class", this._names.join(" ")));
    },
    contains: function (e) {
      return this._names.indexOf(e) >= 0;
    },
  };
  function Ii(e, t) {
    for (var n = Do(e), o = -1, r = t.length; ++o < r;) n.add(t[o]);
  }
  function ki(e, t) {
    for (var n = Do(e), o = -1, r = t.length; ++o < r;) n.remove(t[o]);
  }
  function jd(e) {
    return function () {
      Ii(this, e);
    };
  }
  function Kd(e) {
    return function () {
      ki(this, e);
    };
  }
  function Ud(e, t) {
    return function () {
      (t.apply(this, arguments) ? Ii : ki)(this, e);
    };
  }
  function Oi(e, t) {
    var n = Ci(e + "");
    if (arguments.length < 2) {
      for (var o = Do(this.node()), r = -1, i = n.length; ++r < i;)
        if (!o.contains(n[r])) return !1;
      return !0;
    }
    return this.each((typeof t == "function" ? Ud : t ? jd : Kd)(n, t));
  }
  function Qd() {
    this.textContent = "";
  }
  function Jd(e) {
    return function () {
      this.textContent = e;
    };
  }
  function ef(e) {
    return function () {
      var t = e.apply(this, arguments);
      this.textContent = t ?? "";
    };
  }
  function Pi(e) {
    return arguments.length
      ? this.each(e == null ? Qd : (typeof e == "function" ? ef : Jd)(e))
      : this.node().textContent;
  }
  function tf() {
    this.innerHTML = "";
  }
  function nf(e) {
    return function () {
      this.innerHTML = e;
    };
  }
  function of(e) {
    return function () {
      var t = e.apply(this, arguments);
      this.innerHTML = t ?? "";
    };
  }
  function Ai(e) {
    return arguments.length
      ? this.each(e == null ? tf : (typeof e == "function" ? of : nf)(e))
      : this.node().innerHTML;
  }
  function rf() {
    this.nextSibling && this.parentNode.appendChild(this);
  }
  function Ti() {
    return this.each(rf);
  }
  function sf() {
    this.previousSibling &&
      this.parentNode.insertBefore(this, this.parentNode.firstChild);
  }
  function Di() {
    return this.each(sf);
  }
  function zi(e) {
    var t = typeof e == "function" ? e : Cn(e);
    return this.select(function () {
      return this.appendChild(t.apply(this, arguments));
    });
  }
  function af() {
    return null;
  }
  function Ri(e, t) {
    var n = typeof e == "function" ? e : Cn(e),
      o = t == null ? af : typeof t == "function" ? t : Je(t);
    return this.select(function () {
      return this.insertBefore(
        n.apply(this, arguments),
        o.apply(this, arguments) || null,
      );
    });
  }
  function cf() {
    var e = this.parentNode;
    e && e.removeChild(this);
  }
  function Li() {
    return this.each(cf);
  }
  function lf() {
    var e = this.cloneNode(!1),
      t = this.parentNode;
    return t ? t.insertBefore(e, this.nextSibling) : e;
  }
  function uf() {
    var e = this.cloneNode(!0),
      t = this.parentNode;
    return t ? t.insertBefore(e, this.nextSibling) : e;
  }
  function $i(e) {
    return this.select(e ? uf : lf);
  }
  function Hi(e) {
    return arguments.length
      ? this.property("__data__", e)
      : this.node().__data__;
  }
  function df(e) {
    return function (t) {
      e.call(this, t, this.__data__);
    };
  }
  function ff(e) {
    return e
      .trim()
      .split(/^|\s+/)
      .map(function (t) {
        var n = "",
          o = t.indexOf(".");
        return (
          o >= 0 && ((n = t.slice(o + 1)), (t = t.slice(0, o))),
          { type: t, name: n }
        );
      });
  }
  function hf(e) {
    return function () {
      var t = this.__on;
      if (t) {
        for (var n = 0, o = -1, r = t.length, i; n < r; ++n)
          ((i = t[n]),
            (!e.type || i.type === e.type) && i.name === e.name
              ? this.removeEventListener(i.type, i.listener, i.options)
              : (t[++o] = i));
        ++o ? (t.length = o) : delete this.__on;
      }
    };
  }
  function pf(e, t, n) {
    return function () {
      var o = this.__on,
        r,
        i = df(t);
      if (o) {
        for (var s = 0, a = o.length; s < a; ++s)
          if ((r = o[s]).type === e.type && r.name === e.name) {
            (this.removeEventListener(r.type, r.listener, r.options),
              this.addEventListener(r.type, (r.listener = i), (r.options = n)),
              (r.value = t));
            return;
          }
      }
      (this.addEventListener(e.type, i, n),
        (r = { type: e.type, name: e.name, value: t, listener: i, options: n }),
        o ? o.push(r) : (this.__on = [r]));
    };
  }
  function Bi(e, t, n) {
    var o = ff(e + ""),
      r,
      i = o.length,
      s;
    if (arguments.length < 2) {
      var a = this.node().__on;
      if (a) {
        for (var c = 0, l = a.length, u; c < l; ++c)
          for (r = 0, u = a[c]; r < i; ++r)
            if ((s = o[r]).type === u.type && s.name === u.name) return u.value;
      }
      return;
    }
    for (a = t ? pf : hf, r = 0; r < i; ++r) this.each(a(o[r], t, n));
    return this;
  }
  function Vi(e, t, n) {
    var o = kn(e),
      r = o.CustomEvent;
    (typeof r == "function"
      ? (r = new r(t, n))
      : ((r = o.document.createEvent("Event")),
        n
          ? (r.initEvent(t, n.bubbles, n.cancelable), (r.detail = n.detail))
          : r.initEvent(t, !1, !1)),
      e.dispatchEvent(r));
  }
  function gf(e, t) {
    return function () {
      return Vi(this, e, t);
    };
  }
  function mf(e, t) {
    return function () {
      return Vi(this, e, t.apply(this, arguments));
    };
  }
  function Fi(e, t) {
    return this.each((typeof t == "function" ? mf : gf)(e, t));
  }
  function* Yi() {
    for (var e = this._groups, t = 0, n = e.length; t < n; ++t)
      for (var o = e[t], r = 0, i = o.length, s; r < i; ++r)
        (s = o[r]) && (yield s);
  }
  var zo = [null];
  function se(e, t) {
    ((this._groups = e), (this._parents = t));
  }
  function Xi() {
    return new se([[document.documentElement]], zo);
  }
  function yf() {
    return this;
  }
  se.prototype = Xi.prototype = {
    constructor: se,
    select: ri,
    selectAll: ii,
    selectChild: si,
    selectChildren: ai,
    filter: ci,
    data: di,
    enter: li,
    exit: fi,
    join: hi,
    merge: pi,
    selection: yf,
    order: gi,
    sort: mi,
    call: yi,
    nodes: xi,
    node: wi,
    size: vi,
    empty: bi,
    each: Ei,
    attr: _i,
    style: Si,
    property: Ni,
    classed: Oi,
    text: Pi,
    html: Ai,
    raise: Ti,
    lower: Di,
    append: zi,
    insert: Ri,
    remove: Li,
    clone: $i,
    datum: Hi,
    on: Bi,
    dispatch: Fi,
    [Symbol.iterator]: Yi,
  };
  var Re = Xi;
  function ce(e) {
    return typeof e == "string"
      ? new se([[document.querySelector(e)]], [document.documentElement])
      : new se([[e]], zo);
  }
  function Zi(e) {
    let t;
    for (; (t = e.sourceEvent);) e = t;
    return e;
  }
  function de(e, t) {
    if (((e = Zi(e)), t === void 0 && (t = e.currentTarget), t)) {
      var n = t.ownerSVGElement || t;
      if (n.createSVGPoint) {
        var o = n.createSVGPoint();
        return (
          (o.x = e.clientX),
          (o.y = e.clientY),
          (o = o.matrixTransform(t.getScreenCTM().inverse())),
          [o.x, o.y]
        );
      }
      if (t.getBoundingClientRect) {
        var r = t.getBoundingClientRect();
        return [
          e.clientX - r.left - t.clientLeft,
          e.clientY - r.top - t.clientTop,
        ];
      }
    }
    return [e.pageX, e.pageY];
  }
  var Wi = { passive: !1 },
    et = { capture: !0, passive: !1 };
  function On(e) {
    e.stopImmediatePropagation();
  }
  function Fe(e) {
    (e.preventDefault(), e.stopImmediatePropagation());
  }
  function Ft(e) {
    var t = e.document.documentElement,
      n = ce(e).on("dragstart.drag", Fe, et);
    "onselectstart" in t
      ? n.on("selectstart.drag", Fe, et)
      : ((t.__noselect = t.style.MozUserSelect),
        (t.style.MozUserSelect = "none"));
  }
  function Yt(e, t) {
    var n = e.document.documentElement,
      o = ce(e).on("dragstart.drag", null);
    (t &&
      (o.on("click.drag", Fe, et),
      setTimeout(function () {
        o.on("click.drag", null);
      }, 0)),
      "onselectstart" in n
        ? o.on("selectstart.drag", null)
        : ((n.style.MozUserSelect = n.__noselect), delete n.__noselect));
  }
  var Xt = (e) => () => e;
  function Zt(
    e,
    {
      sourceEvent: t,
      subject: n,
      target: o,
      identifier: r,
      active: i,
      x: s,
      y: a,
      dx: c,
      dy: l,
      dispatch: u,
    },
  ) {
    Object.defineProperties(this, {
      type: { value: e, enumerable: !0, configurable: !0 },
      sourceEvent: { value: t, enumerable: !0, configurable: !0 },
      subject: { value: n, enumerable: !0, configurable: !0 },
      target: { value: o, enumerable: !0, configurable: !0 },
      identifier: { value: r, enumerable: !0, configurable: !0 },
      active: { value: i, enumerable: !0, configurable: !0 },
      x: { value: s, enumerable: !0, configurable: !0 },
      y: { value: a, enumerable: !0, configurable: !0 },
      dx: { value: c, enumerable: !0, configurable: !0 },
      dy: { value: l, enumerable: !0, configurable: !0 },
      _: { value: u },
    });
  }
  Zt.prototype.on = function () {
    var e = this._.on.apply(this._, arguments);
    return e === this._ ? this : e;
  };
  function xf(e) {
    return !e.ctrlKey && !e.button;
  }
  function wf() {
    return this.parentNode;
  }
  function vf(e, t) {
    return t ?? { x: e.x, y: e.y };
  }
  function bf() {
    return navigator.maxTouchPoints || "ontouchstart" in this;
  }
  function Pn() {
    var e = xf,
      t = wf,
      n = vf,
      o = bf,
      r = {},
      i = Qe("start", "drag", "end"),
      s = 0,
      a,
      c,
      l,
      u,
      d = 0;
    function f(v) {
      v.on("mousedown.drag", h)
        .filter(o)
        .on("touchstart.drag", y)
        .on("touchmove.drag", m, Wi)
        .on("touchend.drag touchcancel.drag", b)
        .style("touch-action", "none")
        .style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
    }
    function h(v, N) {
      if (!(u || !e.call(this, v, N))) {
        var _ = g(this, t.call(this, v, N), v, N, "mouse");
        _ &&
          (ce(v.view).on("mousemove.drag", p, et).on("mouseup.drag", x, et),
          Ft(v.view),
          On(v),
          (l = !1),
          (a = v.clientX),
          (c = v.clientY),
          _("start", v));
      }
    }
    function p(v) {
      if ((Fe(v), !l)) {
        var N = v.clientX - a,
          _ = v.clientY - c;
        l = N * N + _ * _ > d;
      }
      r.mouse("drag", v);
    }
    function x(v) {
      (ce(v.view).on("mousemove.drag mouseup.drag", null),
        Yt(v.view, l),
        Fe(v),
        r.mouse("end", v));
    }
    function y(v, N) {
      if (e.call(this, v, N)) {
        var _ = v.changedTouches,
          I = t.call(this, v, N),
          O = _.length,
          P,
          B;
        for (P = 0; P < O; ++P)
          (B = g(this, I, v, N, _[P].identifier, _[P])) &&
            (On(v), B("start", v, _[P]));
      }
    }
    function m(v) {
      var N = v.changedTouches,
        _ = N.length,
        I,
        O;
      for (I = 0; I < _; ++I)
        (O = r[N[I].identifier]) && (Fe(v), O("drag", v, N[I]));
    }
    function b(v) {
      var N = v.changedTouches,
        _ = N.length,
        I,
        O;
      for (
        u && clearTimeout(u),
          u = setTimeout(function () {
            u = null;
          }, 500),
          I = 0;
        I < _;
        ++I
      )
        (O = r[N[I].identifier]) && (On(v), O("end", v, N[I]));
    }
    function g(v, N, _, I, O, P) {
      var B = i.copy(),
        D = de(P || _, N),
        $,
        z,
        w;
      if (
        (w = n.call(
          v,
          new Zt("beforestart", {
            sourceEvent: _,
            target: f,
            identifier: O,
            active: s,
            x: D[0],
            y: D[1],
            dx: 0,
            dy: 0,
            dispatch: B,
          }),
          I,
        )) != null
      )
        return (
          ($ = w.x - D[0] || 0),
          (z = w.y - D[1] || 0),
          function E(S, M, T) {
            var A = D,
              V;
            switch (S) {
              case "start":
                ((r[O] = E), (V = s++));
                break;
              case "end":
                (delete r[O], --s);
              case "drag":
                ((D = de(T || M, N)), (V = s));
                break;
            }
            B.call(
              S,
              v,
              new Zt(S, {
                sourceEvent: M,
                subject: w,
                target: f,
                identifier: O,
                active: V,
                x: D[0] + $,
                y: D[1] + z,
                dx: D[0] - A[0],
                dy: D[1] - A[1],
                dispatch: B,
              }),
              I,
            );
          }
        );
    }
    return (
      (f.filter = function (v) {
        return arguments.length
          ? ((e = typeof v == "function" ? v : Xt(!!v)), f)
          : e;
      }),
      (f.container = function (v) {
        return arguments.length
          ? ((t = typeof v == "function" ? v : Xt(v)), f)
          : t;
      }),
      (f.subject = function (v) {
        return arguments.length
          ? ((n = typeof v == "function" ? v : Xt(v)), f)
          : n;
      }),
      (f.touchable = function (v) {
        return arguments.length
          ? ((o = typeof v == "function" ? v : Xt(!!v)), f)
          : o;
      }),
      (f.on = function () {
        var v = i.on.apply(i, arguments);
        return v === i ? f : v;
      }),
      (f.clickDistance = function (v) {
        return arguments.length ? ((d = (v = +v) * v), f) : Math.sqrt(d);
      }),
      f
    );
  }
  function An(e, t, n) {
    ((e.prototype = t.prototype = n), (n.constructor = e));
  }
  function Ro(e, t) {
    var n = Object.create(e.prototype);
    for (var o in t) n[o] = t[o];
    return n;
  }
  function Gt() {}
  var Wt = 0.7,
    zn = 1 / Wt,
    gt = "\\s*([+-]?\\d+)\\s*",
    qt = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*",
    Me = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*",
    Ef = /^#([0-9a-f]{3,8})$/,
    _f = new RegExp(`^rgb\\(${gt},${gt},${gt}\\)$`),
    Sf = new RegExp(`^rgb\\(${Me},${Me},${Me}\\)$`),
    Nf = new RegExp(`^rgba\\(${gt},${gt},${gt},${qt}\\)$`),
    Cf = new RegExp(`^rgba\\(${Me},${Me},${Me},${qt}\\)$`),
    Mf = new RegExp(`^hsl\\(${qt},${Me},${Me}\\)$`),
    If = new RegExp(`^hsla\\(${qt},${Me},${Me},${qt}\\)$`),
    qi = {
      aliceblue: 15792383,
      antiquewhite: 16444375,
      aqua: 65535,
      aquamarine: 8388564,
      azure: 15794175,
      beige: 16119260,
      bisque: 16770244,
      black: 0,
      blanchedalmond: 16772045,
      blue: 255,
      blueviolet: 9055202,
      brown: 10824234,
      burlywood: 14596231,
      cadetblue: 6266528,
      chartreuse: 8388352,
      chocolate: 13789470,
      coral: 16744272,
      cornflowerblue: 6591981,
      cornsilk: 16775388,
      crimson: 14423100,
      cyan: 65535,
      darkblue: 139,
      darkcyan: 35723,
      darkgoldenrod: 12092939,
      darkgray: 11119017,
      darkgreen: 25600,
      darkgrey: 11119017,
      darkkhaki: 12433259,
      darkmagenta: 9109643,
      darkolivegreen: 5597999,
      darkorange: 16747520,
      darkorchid: 10040012,
      darkred: 9109504,
      darksalmon: 15308410,
      darkseagreen: 9419919,
      darkslateblue: 4734347,
      darkslategray: 3100495,
      darkslategrey: 3100495,
      darkturquoise: 52945,
      darkviolet: 9699539,
      deeppink: 16716947,
      deepskyblue: 49151,
      dimgray: 6908265,
      dimgrey: 6908265,
      dodgerblue: 2003199,
      firebrick: 11674146,
      floralwhite: 16775920,
      forestgreen: 2263842,
      fuchsia: 16711935,
      gainsboro: 14474460,
      ghostwhite: 16316671,
      gold: 16766720,
      goldenrod: 14329120,
      gray: 8421504,
      green: 32768,
      greenyellow: 11403055,
      grey: 8421504,
      honeydew: 15794160,
      hotpink: 16738740,
      indianred: 13458524,
      indigo: 4915330,
      ivory: 16777200,
      khaki: 15787660,
      lavender: 15132410,
      lavenderblush: 16773365,
      lawngreen: 8190976,
      lemonchiffon: 16775885,
      lightblue: 11393254,
      lightcoral: 15761536,
      lightcyan: 14745599,
      lightgoldenrodyellow: 16448210,
      lightgray: 13882323,
      lightgreen: 9498256,
      lightgrey: 13882323,
      lightpink: 16758465,
      lightsalmon: 16752762,
      lightseagreen: 2142890,
      lightskyblue: 8900346,
      lightslategray: 7833753,
      lightslategrey: 7833753,
      lightsteelblue: 11584734,
      lightyellow: 16777184,
      lime: 65280,
      limegreen: 3329330,
      linen: 16445670,
      magenta: 16711935,
      maroon: 8388608,
      mediumaquamarine: 6737322,
      mediumblue: 205,
      mediumorchid: 12211667,
      mediumpurple: 9662683,
      mediumseagreen: 3978097,
      mediumslateblue: 8087790,
      mediumspringgreen: 64154,
      mediumturquoise: 4772300,
      mediumvioletred: 13047173,
      midnightblue: 1644912,
      mintcream: 16121850,
      mistyrose: 16770273,
      moccasin: 16770229,
      navajowhite: 16768685,
      navy: 128,
      oldlace: 16643558,
      olive: 8421376,
      olivedrab: 7048739,
      orange: 16753920,
      orangered: 16729344,
      orchid: 14315734,
      palegoldenrod: 15657130,
      palegreen: 10025880,
      paleturquoise: 11529966,
      palevioletred: 14381203,
      papayawhip: 16773077,
      peachpuff: 16767673,
      peru: 13468991,
      pink: 16761035,
      plum: 14524637,
      powderblue: 11591910,
      purple: 8388736,
      rebeccapurple: 6697881,
      red: 16711680,
      rosybrown: 12357519,
      royalblue: 4286945,
      saddlebrown: 9127187,
      salmon: 16416882,
      sandybrown: 16032864,
      seagreen: 3050327,
      seashell: 16774638,
      sienna: 10506797,
      silver: 12632256,
      skyblue: 8900331,
      slateblue: 6970061,
      slategray: 7372944,
      slategrey: 7372944,
      snow: 16775930,
      springgreen: 65407,
      steelblue: 4620980,
      tan: 13808780,
      teal: 32896,
      thistle: 14204888,
      tomato: 16737095,
      turquoise: 4251856,
      violet: 15631086,
      wheat: 16113331,
      white: 16777215,
      whitesmoke: 16119285,
      yellow: 16776960,
      yellowgreen: 10145074,
    };
  An(Gt, be, {
    copy(e) {
      return Object.assign(new this.constructor(), this, e);
    },
    displayable() {
      return this.rgb().displayable();
    },
    hex: Gi,
    formatHex: Gi,
    formatHex8: kf,
    formatHsl: Of,
    formatRgb: ji,
    toString: ji,
  });
  function Gi() {
    return this.rgb().formatHex();
  }
  function kf() {
    return this.rgb().formatHex8();
  }
  function Of() {
    return ts(this).formatHsl();
  }
  function ji() {
    return this.rgb().formatRgb();
  }
  function be(e) {
    var t, n;
    return (
      (e = (e + "").trim().toLowerCase()),
      (t = Ef.exec(e))
        ? ((n = t[1].length),
          (t = parseInt(t[1], 16)),
          n === 6
            ? Ki(t)
            : n === 3
              ? new ge(
                  ((t >> 8) & 15) | ((t >> 4) & 240),
                  ((t >> 4) & 15) | (t & 240),
                  ((t & 15) << 4) | (t & 15),
                  1,
                )
              : n === 8
                ? Tn(
                    (t >> 24) & 255,
                    (t >> 16) & 255,
                    (t >> 8) & 255,
                    (t & 255) / 255,
                  )
                : n === 4
                  ? Tn(
                      ((t >> 12) & 15) | ((t >> 8) & 240),
                      ((t >> 8) & 15) | ((t >> 4) & 240),
                      ((t >> 4) & 15) | (t & 240),
                      (((t & 15) << 4) | (t & 15)) / 255,
                    )
                  : null)
        : (t = _f.exec(e))
          ? new ge(t[1], t[2], t[3], 1)
          : (t = Sf.exec(e))
            ? new ge(
                (t[1] * 255) / 100,
                (t[2] * 255) / 100,
                (t[3] * 255) / 100,
                1,
              )
            : (t = Nf.exec(e))
              ? Tn(t[1], t[2], t[3], t[4])
              : (t = Cf.exec(e))
                ? Tn(
                    (t[1] * 255) / 100,
                    (t[2] * 255) / 100,
                    (t[3] * 255) / 100,
                    t[4],
                  )
                : (t = Mf.exec(e))
                  ? Ji(t[1], t[2] / 100, t[3] / 100, 1)
                  : (t = If.exec(e))
                    ? Ji(t[1], t[2] / 100, t[3] / 100, t[4])
                    : qi.hasOwnProperty(e)
                      ? Ki(qi[e])
                      : e === "transparent"
                        ? new ge(NaN, NaN, NaN, 0)
                        : null
    );
  }
  function Ki(e) {
    return new ge((e >> 16) & 255, (e >> 8) & 255, e & 255, 1);
  }
  function Tn(e, t, n, o) {
    return (o <= 0 && (e = t = n = NaN), new ge(e, t, n, o));
  }
  function Pf(e) {
    return (
      e instanceof Gt || (e = be(e)),
      e ? ((e = e.rgb()), new ge(e.r, e.g, e.b, e.opacity)) : new ge()
    );
  }
  function mt(e, t, n, o) {
    return arguments.length === 1 ? Pf(e) : new ge(e, t, n, o ?? 1);
  }
  function ge(e, t, n, o) {
    ((this.r = +e), (this.g = +t), (this.b = +n), (this.opacity = +o));
  }
  An(
    ge,
    mt,
    Ro(Gt, {
      brighter(e) {
        return (
          (e = e == null ? zn : Math.pow(zn, e)),
          new ge(this.r * e, this.g * e, this.b * e, this.opacity)
        );
      },
      darker(e) {
        return (
          (e = e == null ? Wt : Math.pow(Wt, e)),
          new ge(this.r * e, this.g * e, this.b * e, this.opacity)
        );
      },
      rgb() {
        return this;
      },
      clamp() {
        return new ge(nt(this.r), nt(this.g), nt(this.b), Rn(this.opacity));
      },
      displayable() {
        return (
          -0.5 <= this.r &&
          this.r < 255.5 &&
          -0.5 <= this.g &&
          this.g < 255.5 &&
          -0.5 <= this.b &&
          this.b < 255.5 &&
          0 <= this.opacity &&
          this.opacity <= 1
        );
      },
      hex: Ui,
      formatHex: Ui,
      formatHex8: Af,
      formatRgb: Qi,
      toString: Qi,
    }),
  );
  function Ui() {
    return `#${tt(this.r)}${tt(this.g)}${tt(this.b)}`;
  }
  function Af() {
    return `#${tt(this.r)}${tt(this.g)}${tt(this.b)}${tt((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
  }
  function Qi() {
    let e = Rn(this.opacity);
    return `${e === 1 ? "rgb(" : "rgba("}${nt(this.r)}, ${nt(this.g)}, ${nt(this.b)}${e === 1 ? ")" : `, ${e})`}`;
  }
  function Rn(e) {
    return isNaN(e) ? 1 : Math.max(0, Math.min(1, e));
  }
  function nt(e) {
    return Math.max(0, Math.min(255, Math.round(e) || 0));
  }
  function tt(e) {
    return ((e = nt(e)), (e < 16 ? "0" : "") + e.toString(16));
  }
  function Ji(e, t, n, o) {
    return (
      o <= 0
        ? (e = t = n = NaN)
        : n <= 0 || n >= 1
          ? (e = t = NaN)
          : t <= 0 && (e = NaN),
      new ve(e, t, n, o)
    );
  }
  function ts(e) {
    if (e instanceof ve) return new ve(e.h, e.s, e.l, e.opacity);
    if ((e instanceof Gt || (e = be(e)), !e)) return new ve();
    if (e instanceof ve) return e;
    e = e.rgb();
    var t = e.r / 255,
      n = e.g / 255,
      o = e.b / 255,
      r = Math.min(t, n, o),
      i = Math.max(t, n, o),
      s = NaN,
      a = i - r,
      c = (i + r) / 2;
    return (
      a
        ? (t === i
            ? (s = (n - o) / a + (n < o) * 6)
            : n === i
              ? (s = (o - t) / a + 2)
              : (s = (t - n) / a + 4),
          (a /= c < 0.5 ? i + r : 2 - i - r),
          (s *= 60))
        : (a = c > 0 && c < 1 ? 0 : s),
      new ve(s, a, c, e.opacity)
    );
  }
  function ns(e, t, n, o) {
    return arguments.length === 1 ? ts(e) : new ve(e, t, n, o ?? 1);
  }
  function ve(e, t, n, o) {
    ((this.h = +e), (this.s = +t), (this.l = +n), (this.opacity = +o));
  }
  An(
    ve,
    ns,
    Ro(Gt, {
      brighter(e) {
        return (
          (e = e == null ? zn : Math.pow(zn, e)),
          new ve(this.h, this.s, this.l * e, this.opacity)
        );
      },
      darker(e) {
        return (
          (e = e == null ? Wt : Math.pow(Wt, e)),
          new ve(this.h, this.s, this.l * e, this.opacity)
        );
      },
      rgb() {
        var e = (this.h % 360) + (this.h < 0) * 360,
          t = isNaN(e) || isNaN(this.s) ? 0 : this.s,
          n = this.l,
          o = n + (n < 0.5 ? n : 1 - n) * t,
          r = 2 * n - o;
        return new ge(
          Lo(e >= 240 ? e - 240 : e + 120, r, o),
          Lo(e, r, o),
          Lo(e < 120 ? e + 240 : e - 120, r, o),
          this.opacity,
        );
      },
      clamp() {
        return new ve(es(this.h), Dn(this.s), Dn(this.l), Rn(this.opacity));
      },
      displayable() {
        return (
          ((0 <= this.s && this.s <= 1) || isNaN(this.s)) &&
          0 <= this.l &&
          this.l <= 1 &&
          0 <= this.opacity &&
          this.opacity <= 1
        );
      },
      formatHsl() {
        let e = Rn(this.opacity);
        return `${e === 1 ? "hsl(" : "hsla("}${es(this.h)}, ${Dn(this.s) * 100}%, ${Dn(this.l) * 100}%${e === 1 ? ")" : `, ${e})`}`;
      },
    }),
  );
  function es(e) {
    return ((e = (e || 0) % 360), e < 0 ? e + 360 : e);
  }
  function Dn(e) {
    return Math.max(0, Math.min(1, e || 0));
  }
  function Lo(e, t, n) {
    return (
      (e < 60
        ? t + ((n - t) * e) / 60
        : e < 180
          ? n
          : e < 240
            ? t + ((n - t) * (240 - e)) / 60
            : t) * 255
    );
  }
  function $o(e, t, n, o, r) {
    var i = e * e,
      s = i * e;
    return (
      ((1 - 3 * e + 3 * i - s) * t +
        (4 - 6 * i + 3 * s) * n +
        (1 + 3 * e + 3 * i - 3 * s) * o +
        s * r) /
      6
    );
  }
  function os(e) {
    var t = e.length - 1;
    return function (n) {
      var o = n <= 0 ? (n = 0) : n >= 1 ? ((n = 1), t - 1) : Math.floor(n * t),
        r = e[o],
        i = e[o + 1],
        s = o > 0 ? e[o - 1] : 2 * r - i,
        a = o < t - 1 ? e[o + 2] : 2 * i - r;
      return $o((n - o / t) * t, s, r, i, a);
    };
  }
  function rs(e) {
    var t = e.length;
    return function (n) {
      var o = Math.floor(((n %= 1) < 0 ? ++n : n) * t),
        r = e[(o + t - 1) % t],
        i = e[o % t],
        s = e[(o + 1) % t],
        a = e[(o + 2) % t];
      return $o((n - o / t) * t, r, i, s, a);
    };
  }
  var jt = (e) => () => e;
  function Tf(e, t) {
    return function (n) {
      return e + n * t;
    };
  }
  function Df(e, t, n) {
    return (
      (e = Math.pow(e, n)),
      (t = Math.pow(t, n) - e),
      (n = 1 / n),
      function (o) {
        return Math.pow(e + o * t, n);
      }
    );
  }
  function is(e) {
    return (e = +e) == 1
      ? Ln
      : function (t, n) {
          return n - t ? Df(t, n, e) : jt(isNaN(t) ? n : t);
        };
  }
  function Ln(e, t) {
    var n = t - e;
    return n ? Tf(e, n) : jt(isNaN(e) ? t : e);
  }
  var ot = (function e(t) {
    var n = is(t);
    function o(r, i) {
      var s = n((r = mt(r)).r, (i = mt(i)).r),
        a = n(r.g, i.g),
        c = n(r.b, i.b),
        l = Ln(r.opacity, i.opacity);
      return function (u) {
        return (
          (r.r = s(u)),
          (r.g = a(u)),
          (r.b = c(u)),
          (r.opacity = l(u)),
          r + ""
        );
      };
    }
    return ((o.gamma = e), o);
  })(1);
  function ss(e) {
    return function (t) {
      var n = t.length,
        o = new Array(n),
        r = new Array(n),
        i = new Array(n),
        s,
        a;
      for (s = 0; s < n; ++s)
        ((a = mt(t[s])),
          (o[s] = a.r || 0),
          (r[s] = a.g || 0),
          (i[s] = a.b || 0));
      return (
        (o = e(o)),
        (r = e(r)),
        (i = e(i)),
        (a.opacity = 1),
        function (c) {
          return ((a.r = o(c)), (a.g = r(c)), (a.b = i(c)), a + "");
        }
      );
    };
  }
  var zf = ss(os),
    Rf = ss(rs);
  function as(e, t) {
    t || (t = []);
    var n = e ? Math.min(t.length, e.length) : 0,
      o = t.slice(),
      r;
    return function (i) {
      for (r = 0; r < n; ++r) o[r] = e[r] * (1 - i) + t[r] * i;
      return o;
    };
  }
  function cs(e) {
    return ArrayBuffer.isView(e) && !(e instanceof DataView);
  }
  function ls(e, t) {
    var n = t ? t.length : 0,
      o = e ? Math.min(n, e.length) : 0,
      r = new Array(o),
      i = new Array(n),
      s;
    for (s = 0; s < o; ++s) r[s] = Le(e[s], t[s]);
    for (; s < n; ++s) i[s] = t[s];
    return function (a) {
      for (s = 0; s < o; ++s) i[s] = r[s](a);
      return i;
    };
  }
  function us(e, t) {
    var n = new Date();
    return (
      (e = +e),
      (t = +t),
      function (o) {
        return (n.setTime(e * (1 - o) + t * o), n);
      }
    );
  }
  function fe(e, t) {
    return (
      (e = +e),
      (t = +t),
      function (n) {
        return e * (1 - n) + t * n;
      }
    );
  }
  function ds(e, t) {
    var n = {},
      o = {},
      r;
    ((e === null || typeof e != "object") && (e = {}),
      (t === null || typeof t != "object") && (t = {}));
    for (r in t) r in e ? (n[r] = Le(e[r], t[r])) : (o[r] = t[r]);
    return function (i) {
      for (r in n) o[r] = n[r](i);
      return o;
    };
  }
  var Bo = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g,
    Ho = new RegExp(Bo.source, "g");
  function Lf(e) {
    return function () {
      return e;
    };
  }
  function $f(e) {
    return function (t) {
      return e(t) + "";
    };
  }
  function Kt(e, t) {
    var n = (Bo.lastIndex = Ho.lastIndex = 0),
      o,
      r,
      i,
      s = -1,
      a = [],
      c = [];
    for (e = e + "", t = t + ""; (o = Bo.exec(e)) && (r = Ho.exec(t));)
      ((i = r.index) > n &&
        ((i = t.slice(n, i)), a[s] ? (a[s] += i) : (a[++s] = i)),
        (o = o[0]) === (r = r[0])
          ? a[s]
            ? (a[s] += r)
            : (a[++s] = r)
          : ((a[++s] = null), c.push({ i: s, x: fe(o, r) })),
        (n = Ho.lastIndex));
    return (
      n < t.length && ((i = t.slice(n)), a[s] ? (a[s] += i) : (a[++s] = i)),
      a.length < 2
        ? c[0]
          ? $f(c[0].x)
          : Lf(t)
        : ((t = c.length),
          function (l) {
            for (var u = 0, d; u < t; ++u) a[(d = c[u]).i] = d.x(l);
            return a.join("");
          })
    );
  }
  function Le(e, t) {
    var n = typeof t,
      o;
    return t == null || n === "boolean"
      ? jt(t)
      : (n === "number"
          ? fe
          : n === "string"
            ? (o = be(t))
              ? ((t = o), ot)
              : Kt
            : t instanceof be
              ? ot
              : t instanceof Date
                ? us
                : cs(t)
                  ? as
                  : Array.isArray(t)
                    ? ls
                    : (typeof t.valueOf != "function" &&
                          typeof t.toString != "function") ||
                        isNaN(t)
                      ? ds
                      : fe)(e, t);
  }
  var fs = 180 / Math.PI,
    $n = {
      translateX: 0,
      translateY: 0,
      rotate: 0,
      skewX: 0,
      scaleX: 1,
      scaleY: 1,
    };
  function Vo(e, t, n, o, r, i) {
    var s, a, c;
    return (
      (s = Math.sqrt(e * e + t * t)) && ((e /= s), (t /= s)),
      (c = e * n + t * o) && ((n -= e * c), (o -= t * c)),
      (a = Math.sqrt(n * n + o * o)) && ((n /= a), (o /= a), (c /= a)),
      e * o < t * n && ((e = -e), (t = -t), (c = -c), (s = -s)),
      {
        translateX: r,
        translateY: i,
        rotate: Math.atan2(t, e) * fs,
        skewX: Math.atan(c) * fs,
        scaleX: s,
        scaleY: a,
      }
    );
  }
  var Hn;
  function hs(e) {
    let t = new (typeof DOMMatrix == "function" ? DOMMatrix : WebKitCSSMatrix)(
      e + "",
    );
    return t.isIdentity ? $n : Vo(t.a, t.b, t.c, t.d, t.e, t.f);
  }
  function ps(e) {
    return e == null
      ? $n
      : (Hn ||
          (Hn = document.createElementNS("http://www.w3.org/2000/svg", "g")),
        Hn.setAttribute("transform", e),
        (e = Hn.transform.baseVal.consolidate())
          ? ((e = e.matrix), Vo(e.a, e.b, e.c, e.d, e.e, e.f))
          : $n);
  }
  function gs(e, t, n, o) {
    function r(l) {
      return l.length ? l.pop() + " " : "";
    }
    function i(l, u, d, f, h, p) {
      if (l !== d || u !== f) {
        var x = h.push("translate(", null, t, null, n);
        p.push({ i: x - 4, x: fe(l, d) }, { i: x - 2, x: fe(u, f) });
      } else (d || f) && h.push("translate(" + d + t + f + n);
    }
    function s(l, u, d, f) {
      l !== u
        ? (l - u > 180 ? (u += 360) : u - l > 180 && (l += 360),
          f.push({ i: d.push(r(d) + "rotate(", null, o) - 2, x: fe(l, u) }))
        : u && d.push(r(d) + "rotate(" + u + o);
    }
    function a(l, u, d, f) {
      l !== u
        ? f.push({ i: d.push(r(d) + "skewX(", null, o) - 2, x: fe(l, u) })
        : u && d.push(r(d) + "skewX(" + u + o);
    }
    function c(l, u, d, f, h, p) {
      if (l !== d || u !== f) {
        var x = h.push(r(h) + "scale(", null, ",", null, ")");
        p.push({ i: x - 4, x: fe(l, d) }, { i: x - 2, x: fe(u, f) });
      } else
        (d !== 1 || f !== 1) && h.push(r(h) + "scale(" + d + "," + f + ")");
    }
    return function (l, u) {
      var d = [],
        f = [];
      return (
        (l = e(l)),
        (u = e(u)),
        i(l.translateX, l.translateY, u.translateX, u.translateY, d, f),
        s(l.rotate, u.rotate, d, f),
        a(l.skewX, u.skewX, d, f),
        c(l.scaleX, l.scaleY, u.scaleX, u.scaleY, d, f),
        (l = u = null),
        function (h) {
          for (var p = -1, x = f.length, y; ++p < x;) d[(y = f[p]).i] = y.x(h);
          return d.join("");
        }
      );
    };
  }
  var Fo = gs(hs, "px, ", "px)", "deg)"),
    Yo = gs(ps, ", ", ")", ")");
  var Hf = 1e-12;
  function ms(e) {
    return ((e = Math.exp(e)) + 1 / e) / 2;
  }
  function Bf(e) {
    return ((e = Math.exp(e)) - 1 / e) / 2;
  }
  function Vf(e) {
    return ((e = Math.exp(2 * e)) - 1) / (e + 1);
  }
  var rt = (function e(t, n, o) {
    function r(i, s) {
      var a = i[0],
        c = i[1],
        l = i[2],
        u = s[0],
        d = s[1],
        f = s[2],
        h = u - a,
        p = d - c,
        x = h * h + p * p,
        y,
        m;
      if (x < Hf)
        ((m = Math.log(f / l) / t),
          (y = function (I) {
            return [a + I * h, c + I * p, l * Math.exp(t * I * m)];
          }));
      else {
        var b = Math.sqrt(x),
          g = (f * f - l * l + o * x) / (2 * l * n * b),
          v = (f * f - l * l - o * x) / (2 * f * n * b),
          N = Math.log(Math.sqrt(g * g + 1) - g),
          _ = Math.log(Math.sqrt(v * v + 1) - v);
        ((m = (_ - N) / t),
          (y = function (I) {
            var O = I * m,
              P = ms(N),
              B = (l / (n * b)) * (P * Vf(t * O + N) - Bf(N));
            return [a + B * h, c + B * p, (l * P) / ms(t * O + N)];
          }));
      }
      return ((y.duration = (m * 1e3 * t) / Math.SQRT2), y);
    }
    return (
      (r.rho = function (i) {
        var s = Math.max(0.001, +i),
          a = s * s,
          c = a * a;
        return e(s, a, c);
      }),
      r
    );
  })(Math.SQRT2, 2, 4);
  var yt = 0,
    Qt = 0,
    Ut = 0,
    xs = 1e3,
    Bn,
    Jt,
    Vn = 0,
    it = 0,
    Fn = 0,
    en = typeof performance == "object" && performance.now ? performance : Date,
    ws =
      typeof window == "object" && window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : function (e) {
            setTimeout(e, 17);
          };
  function nn() {
    return it || (ws(Ff), (it = en.now() + Fn));
  }
  function Ff() {
    it = 0;
  }
  function tn() {
    this._call = this._time = this._next = null;
  }
  tn.prototype = Yn.prototype = {
    constructor: tn,
    restart: function (e, t, n) {
      if (typeof e != "function")
        throw new TypeError("callback is not a function");
      ((n = (n == null ? nn() : +n) + (t == null ? 0 : +t)),
        !this._next &&
          Jt !== this &&
          (Jt ? (Jt._next = this) : (Bn = this), (Jt = this)),
        (this._call = e),
        (this._time = n),
        Xo());
    },
    stop: function () {
      this._call && ((this._call = null), (this._time = 1 / 0), Xo());
    },
  };
  function Yn(e, t, n) {
    var o = new tn();
    return (o.restart(e, t, n), o);
  }
  function vs() {
    (nn(), ++yt);
    for (var e = Bn, t; e;)
      ((t = it - e._time) >= 0 && e._call.call(void 0, t), (e = e._next));
    --yt;
  }
  function ys() {
    ((it = (Vn = en.now()) + Fn), (yt = Qt = 0));
    try {
      vs();
    } finally {
      ((yt = 0), Xf(), (it = 0));
    }
  }
  function Yf() {
    var e = en.now(),
      t = e - Vn;
    t > xs && ((Fn -= t), (Vn = e));
  }
  function Xf() {
    for (var e, t = Bn, n, o = 1 / 0; t;)
      t._call
        ? (o > t._time && (o = t._time), (e = t), (t = t._next))
        : ((n = t._next), (t._next = null), (t = e ? (e._next = n) : (Bn = n)));
    ((Jt = e), Xo(o));
  }
  function Xo(e) {
    if (!yt) {
      Qt && (Qt = clearTimeout(Qt));
      var t = e - it;
      t > 24
        ? (e < 1 / 0 && (Qt = setTimeout(ys, e - en.now() - Fn)),
          Ut && (Ut = clearInterval(Ut)))
        : (Ut || ((Vn = en.now()), (Ut = setInterval(Yf, xs))),
          (yt = 1),
          ws(ys));
    }
  }
  function Xn(e, t, n) {
    var o = new tn();
    return (
      (t = t == null ? 0 : +t),
      o.restart(
        (r) => {
          (o.stop(), e(r + t));
        },
        t,
        n,
      ),
      o
    );
  }
  var Zf = Qe("start", "end", "cancel", "interrupt"),
    Wf = [],
    _s = 0,
    bs = 1,
    Wn = 2,
    Zn = 3,
    Es = 4,
    qn = 5,
    on = 6;
  function Ye(e, t, n, o, r, i) {
    var s = e.__transition;
    if (!s) e.__transition = {};
    else if (n in s) return;
    qf(e, n, {
      name: t,
      index: o,
      group: r,
      on: Zf,
      tween: Wf,
      time: i.time,
      delay: i.delay,
      duration: i.duration,
      ease: i.ease,
      timer: null,
      state: _s,
    });
  }
  function rn(e, t) {
    var n = ae(e, t);
    if (n.state > _s) throw new Error("too late; already scheduled");
    return n;
  }
  function le(e, t) {
    var n = ae(e, t);
    if (n.state > Zn) throw new Error("too late; already running");
    return n;
  }
  function ae(e, t) {
    var n = e.__transition;
    if (!n || !(n = n[t])) throw new Error("transition not found");
    return n;
  }
  function qf(e, t, n) {
    var o = e.__transition,
      r;
    ((o[t] = n), (n.timer = Yn(i, 0, n.time)));
    function i(l) {
      ((n.state = bs),
        n.timer.restart(s, n.delay, n.time),
        n.delay <= l && s(l - n.delay));
    }
    function s(l) {
      var u, d, f, h;
      if (n.state !== bs) return c();
      for (u in o)
        if (((h = o[u]), h.name === n.name)) {
          if (h.state === Zn) return Xn(s);
          h.state === Es
            ? ((h.state = on),
              h.timer.stop(),
              h.on.call("interrupt", e, e.__data__, h.index, h.group),
              delete o[u])
            : +u < t &&
              ((h.state = on),
              h.timer.stop(),
              h.on.call("cancel", e, e.__data__, h.index, h.group),
              delete o[u]);
        }
      if (
        (Xn(function () {
          n.state === Zn &&
            ((n.state = Es), n.timer.restart(a, n.delay, n.time), a(l));
        }),
        (n.state = Wn),
        n.on.call("start", e, e.__data__, n.index, n.group),
        n.state === Wn)
      ) {
        for (
          n.state = Zn, r = new Array((f = n.tween.length)), u = 0, d = -1;
          u < f;
          ++u
        )
          (h = n.tween[u].value.call(e, e.__data__, n.index, n.group)) &&
            (r[++d] = h);
        r.length = d + 1;
      }
    }
    function a(l) {
      for (
        var u =
            l < n.duration
              ? n.ease.call(null, l / n.duration)
              : (n.timer.restart(c), (n.state = qn), 1),
          d = -1,
          f = r.length;
        ++d < f;
      )
        r[d].call(e, u);
      n.state === qn &&
        (n.on.call("end", e, e.__data__, n.index, n.group), c());
    }
    function c() {
      ((n.state = on), n.timer.stop(), delete o[t]);
      for (var l in o) return;
      delete e.__transition;
    }
  }
  function st(e, t) {
    var n = e.__transition,
      o,
      r,
      i = !0,
      s;
    if (n) {
      t = t == null ? null : t + "";
      for (s in n) {
        if ((o = n[s]).name !== t) {
          i = !1;
          continue;
        }
        ((r = o.state > Wn && o.state < qn),
          (o.state = on),
          o.timer.stop(),
          o.on.call(
            r ? "interrupt" : "cancel",
            e,
            e.__data__,
            o.index,
            o.group,
          ),
          delete n[s]);
      }
      i && delete e.__transition;
    }
  }
  function Ss(e) {
    return this.each(function () {
      st(this, e);
    });
  }
  function Gf(e, t) {
    var n, o;
    return function () {
      var r = le(this, e),
        i = r.tween;
      if (i !== n) {
        o = n = i;
        for (var s = 0, a = o.length; s < a; ++s)
          if (o[s].name === t) {
            ((o = o.slice()), o.splice(s, 1));
            break;
          }
      }
      r.tween = o;
    };
  }
  function jf(e, t, n) {
    var o, r;
    if (typeof n != "function") throw new Error();
    return function () {
      var i = le(this, e),
        s = i.tween;
      if (s !== o) {
        r = (o = s).slice();
        for (var a = { name: t, value: n }, c = 0, l = r.length; c < l; ++c)
          if (r[c].name === t) {
            r[c] = a;
            break;
          }
        c === l && r.push(a);
      }
      i.tween = r;
    };
  }
  function Ns(e, t) {
    var n = this._id;
    if (((e += ""), arguments.length < 2)) {
      for (var o = ae(this.node(), n).tween, r = 0, i = o.length, s; r < i; ++r)
        if ((s = o[r]).name === e) return s.value;
      return null;
    }
    return this.each((t == null ? Gf : jf)(n, e, t));
  }
  function xt(e, t, n) {
    var o = e._id;
    return (
      e.each(function () {
        var r = le(this, o);
        (r.value || (r.value = {}))[t] = n.apply(this, arguments);
      }),
      function (r) {
        return ae(r, o).value[t];
      }
    );
  }
  function Gn(e, t) {
    var n;
    return (
      typeof t == "number"
        ? fe
        : t instanceof be
          ? ot
          : (n = be(t))
            ? ((t = n), ot)
            : Kt
    )(e, t);
  }
  function Kf(e) {
    return function () {
      this.removeAttribute(e);
    };
  }
  function Uf(e) {
    return function () {
      this.removeAttributeNS(e.space, e.local);
    };
  }
  function Qf(e, t, n) {
    var o,
      r = n + "",
      i;
    return function () {
      var s = this.getAttribute(e);
      return s === r ? null : s === o ? i : (i = t((o = s), n));
    };
  }
  function Jf(e, t, n) {
    var o,
      r = n + "",
      i;
    return function () {
      var s = this.getAttributeNS(e.space, e.local);
      return s === r ? null : s === o ? i : (i = t((o = s), n));
    };
  }
  function eh(e, t, n) {
    var o, r, i;
    return function () {
      var s,
        a = n(this),
        c;
      return a == null
        ? void this.removeAttribute(e)
        : ((s = this.getAttribute(e)),
          (c = a + ""),
          s === c
            ? null
            : s === o && c === r
              ? i
              : ((r = c), (i = t((o = s), a))));
    };
  }
  function th(e, t, n) {
    var o, r, i;
    return function () {
      var s,
        a = n(this),
        c;
      return a == null
        ? void this.removeAttributeNS(e.space, e.local)
        : ((s = this.getAttributeNS(e.space, e.local)),
          (c = a + ""),
          s === c
            ? null
            : s === o && c === r
              ? i
              : ((r = c), (i = t((o = s), a))));
    };
  }
  function Cs(e, t) {
    var n = ze(e),
      o = n === "transform" ? Yo : Gn;
    return this.attrTween(
      e,
      typeof t == "function"
        ? (n.local ? th : eh)(n, o, xt(this, "attr." + e, t))
        : t == null
          ? (n.local ? Uf : Kf)(n)
          : (n.local ? Jf : Qf)(n, o, t),
    );
  }
  function nh(e, t) {
    return function (n) {
      this.setAttribute(e, t.call(this, n));
    };
  }
  function oh(e, t) {
    return function (n) {
      this.setAttributeNS(e.space, e.local, t.call(this, n));
    };
  }
  function rh(e, t) {
    var n, o;
    function r() {
      var i = t.apply(this, arguments);
      return (i !== o && (n = (o = i) && oh(e, i)), n);
    }
    return ((r._value = t), r);
  }
  function ih(e, t) {
    var n, o;
    function r() {
      var i = t.apply(this, arguments);
      return (i !== o && (n = (o = i) && nh(e, i)), n);
    }
    return ((r._value = t), r);
  }
  function Ms(e, t) {
    var n = "attr." + e;
    if (arguments.length < 2) return (n = this.tween(n)) && n._value;
    if (t == null) return this.tween(n, null);
    if (typeof t != "function") throw new Error();
    var o = ze(e);
    return this.tween(n, (o.local ? rh : ih)(o, t));
  }
  function sh(e, t) {
    return function () {
      rn(this, e).delay = +t.apply(this, arguments);
    };
  }
  function ah(e, t) {
    return (
      (t = +t),
      function () {
        rn(this, e).delay = t;
      }
    );
  }
  function Is(e) {
    var t = this._id;
    return arguments.length
      ? this.each((typeof e == "function" ? sh : ah)(t, e))
      : ae(this.node(), t).delay;
  }
  function ch(e, t) {
    return function () {
      le(this, e).duration = +t.apply(this, arguments);
    };
  }
  function lh(e, t) {
    return (
      (t = +t),
      function () {
        le(this, e).duration = t;
      }
    );
  }
  function ks(e) {
    var t = this._id;
    return arguments.length
      ? this.each((typeof e == "function" ? ch : lh)(t, e))
      : ae(this.node(), t).duration;
  }
  function uh(e, t) {
    if (typeof t != "function") throw new Error();
    return function () {
      le(this, e).ease = t;
    };
  }
  function Os(e) {
    var t = this._id;
    return arguments.length ? this.each(uh(t, e)) : ae(this.node(), t).ease;
  }
  function dh(e, t) {
    return function () {
      var n = t.apply(this, arguments);
      if (typeof n != "function") throw new Error();
      le(this, e).ease = n;
    };
  }
  function Ps(e) {
    if (typeof e != "function") throw new Error();
    return this.each(dh(this._id, e));
  }
  function As(e) {
    typeof e != "function" && (e = Bt(e));
    for (
      var t = this._groups, n = t.length, o = new Array(n), r = 0;
      r < n;
      ++r
    )
      for (var i = t[r], s = i.length, a = (o[r] = []), c, l = 0; l < s; ++l)
        (c = i[l]) && e.call(c, c.__data__, l, i) && a.push(c);
    return new he(o, this._parents, this._name, this._id);
  }
  function Ts(e) {
    if (e._id !== this._id) throw new Error();
    for (
      var t = this._groups,
        n = e._groups,
        o = t.length,
        r = n.length,
        i = Math.min(o, r),
        s = new Array(o),
        a = 0;
      a < i;
      ++a
    )
      for (
        var c = t[a],
          l = n[a],
          u = c.length,
          d = (s[a] = new Array(u)),
          f,
          h = 0;
        h < u;
        ++h
      )
        (f = c[h] || l[h]) && (d[h] = f);
    for (; a < o; ++a) s[a] = t[a];
    return new he(s, this._parents, this._name, this._id);
  }
  function fh(e) {
    return (e + "")
      .trim()
      .split(/^|\s+/)
      .every(function (t) {
        var n = t.indexOf(".");
        return (n >= 0 && (t = t.slice(0, n)), !t || t === "start");
      });
  }
  function hh(e, t, n) {
    var o,
      r,
      i = fh(t) ? rn : le;
    return function () {
      var s = i(this, e),
        a = s.on;
      (a !== o && (r = (o = a).copy()).on(t, n), (s.on = r));
    };
  }
  function Ds(e, t) {
    var n = this._id;
    return arguments.length < 2
      ? ae(this.node(), n).on.on(e)
      : this.each(hh(n, e, t));
  }
  function ph(e) {
    return function () {
      var t = this.parentNode;
      for (var n in this.__transition) if (+n !== e) return;
      t && t.removeChild(this);
    };
  }
  function zs() {
    return this.on("end.remove", ph(this._id));
  }
  function Rs(e) {
    var t = this._name,
      n = this._id;
    typeof e != "function" && (e = Je(e));
    for (
      var o = this._groups, r = o.length, i = new Array(r), s = 0;
      s < r;
      ++s
    )
      for (
        var a = o[s], c = a.length, l = (i[s] = new Array(c)), u, d, f = 0;
        f < c;
        ++f
      )
        (u = a[f]) &&
          (d = e.call(u, u.__data__, f, a)) &&
          ("__data__" in u && (d.__data__ = u.__data__),
          (l[f] = d),
          Ye(l[f], t, n, f, l, ae(u, n)));
    return new he(i, this._parents, t, n);
  }
  function Ls(e) {
    var t = this._name,
      n = this._id;
    typeof e != "function" && (e = Ht(e));
    for (var o = this._groups, r = o.length, i = [], s = [], a = 0; a < r; ++a)
      for (var c = o[a], l = c.length, u, d = 0; d < l; ++d)
        if ((u = c[d])) {
          for (
            var f = e.call(u, u.__data__, d, c),
              h,
              p = ae(u, n),
              x = 0,
              y = f.length;
            x < y;
            ++x
          )
            (h = f[x]) && Ye(h, t, n, x, f, p);
          (i.push(f), s.push(u));
        }
    return new he(i, s, t, n);
  }
  var gh = Re.prototype.constructor;
  function $s() {
    return new gh(this._groups, this._parents);
  }
  function mh(e, t) {
    var n, o, r;
    return function () {
      var i = Ve(this, e),
        s = (this.style.removeProperty(e), Ve(this, e));
      return i === s
        ? null
        : i === n && s === o
          ? r
          : (r = t((n = i), (o = s)));
    };
  }
  function Hs(e) {
    return function () {
      this.style.removeProperty(e);
    };
  }
  function yh(e, t, n) {
    var o,
      r = n + "",
      i;
    return function () {
      var s = Ve(this, e);
      return s === r ? null : s === o ? i : (i = t((o = s), n));
    };
  }
  function xh(e, t, n) {
    var o, r, i;
    return function () {
      var s = Ve(this, e),
        a = n(this),
        c = a + "";
      return (
        a == null && (c = a = (this.style.removeProperty(e), Ve(this, e))),
        s === c ? null : s === o && c === r ? i : ((r = c), (i = t((o = s), a)))
      );
    };
  }
  function wh(e, t) {
    var n,
      o,
      r,
      i = "style." + t,
      s = "end." + i,
      a;
    return function () {
      var c = le(this, e),
        l = c.on,
        u = c.value[i] == null ? a || (a = Hs(t)) : void 0;
      ((l !== n || r !== u) && (o = (n = l).copy()).on(s, (r = u)), (c.on = o));
    };
  }
  function Bs(e, t, n) {
    var o = (e += "") == "transform" ? Fo : Gn;
    return t == null
      ? this.styleTween(e, mh(e, o)).on("end.style." + e, Hs(e))
      : typeof t == "function"
        ? this.styleTween(e, xh(e, o, xt(this, "style." + e, t))).each(
            wh(this._id, e),
          )
        : this.styleTween(e, yh(e, o, t), n).on("end.style." + e, null);
  }
  function vh(e, t, n) {
    return function (o) {
      this.style.setProperty(e, t.call(this, o), n);
    };
  }
  function bh(e, t, n) {
    var o, r;
    function i() {
      var s = t.apply(this, arguments);
      return (s !== r && (o = (r = s) && vh(e, s, n)), o);
    }
    return ((i._value = t), i);
  }
  function Vs(e, t, n) {
    var o = "style." + (e += "");
    if (arguments.length < 2) return (o = this.tween(o)) && o._value;
    if (t == null) return this.tween(o, null);
    if (typeof t != "function") throw new Error();
    return this.tween(o, bh(e, t, n ?? ""));
  }
  function Eh(e) {
    return function () {
      this.textContent = e;
    };
  }
  function _h(e) {
    return function () {
      var t = e(this);
      this.textContent = t ?? "";
    };
  }
  function Fs(e) {
    return this.tween(
      "text",
      typeof e == "function"
        ? _h(xt(this, "text", e))
        : Eh(e == null ? "" : e + ""),
    );
  }
  function Sh(e) {
    return function (t) {
      this.textContent = e.call(this, t);
    };
  }
  function Nh(e) {
    var t, n;
    function o() {
      var r = e.apply(this, arguments);
      return (r !== n && (t = (n = r) && Sh(r)), t);
    }
    return ((o._value = e), o);
  }
  function Ys(e) {
    var t = "text";
    if (arguments.length < 1) return (t = this.tween(t)) && t._value;
    if (e == null) return this.tween(t, null);
    if (typeof e != "function") throw new Error();
    return this.tween(t, Nh(e));
  }
  function Xs() {
    for (
      var e = this._name,
        t = this._id,
        n = jn(),
        o = this._groups,
        r = o.length,
        i = 0;
      i < r;
      ++i
    )
      for (var s = o[i], a = s.length, c, l = 0; l < a; ++l)
        if ((c = s[l])) {
          var u = ae(c, t);
          Ye(c, e, n, l, s, {
            time: u.time + u.delay + u.duration,
            delay: 0,
            duration: u.duration,
            ease: u.ease,
          });
        }
    return new he(o, this._parents, e, n);
  }
  function Zs() {
    var e,
      t,
      n = this,
      o = n._id,
      r = n.size();
    return new Promise(function (i, s) {
      var a = { value: s },
        c = {
          value: function () {
            --r === 0 && i();
          },
        };
      (n.each(function () {
        var l = le(this, o),
          u = l.on;
        (u !== e &&
          ((t = (e = u).copy()),
          t._.cancel.push(a),
          t._.interrupt.push(a),
          t._.end.push(c)),
          (l.on = t));
      }),
        r === 0 && i());
    });
  }
  var Ch = 0;
  function he(e, t, n, o) {
    ((this._groups = e), (this._parents = t), (this._name = n), (this._id = o));
  }
  function Ws(e) {
    return Re().transition(e);
  }
  function jn() {
    return ++Ch;
  }
  var $e = Re.prototype;
  he.prototype = Ws.prototype = {
    constructor: he,
    select: Rs,
    selectAll: Ls,
    selectChild: $e.selectChild,
    selectChildren: $e.selectChildren,
    filter: As,
    merge: Ts,
    selection: $s,
    transition: Xs,
    call: $e.call,
    nodes: $e.nodes,
    node: $e.node,
    size: $e.size,
    empty: $e.empty,
    each: $e.each,
    on: Ds,
    attr: Cs,
    attrTween: Ms,
    style: Bs,
    styleTween: Vs,
    text: Fs,
    textTween: Ys,
    remove: zs,
    tween: Ns,
    delay: Is,
    duration: ks,
    ease: Os,
    easeVarying: Ps,
    end: Zs,
    [Symbol.iterator]: $e[Symbol.iterator],
  };
  function Kn(e) {
    return ((e *= 2) <= 1 ? e * e * e : (e -= 2) * e * e + 2) / 2;
  }
  var Mh = { time: null, delay: 0, duration: 250, ease: Kn };
  function Ih(e, t) {
    for (var n; !(n = e.__transition) || !(n = n[t]);)
      if (!(e = e.parentNode)) throw new Error(`transition ${t} not found`);
    return n;
  }
  function qs(e) {
    var t, n;
    e instanceof he
      ? ((t = e._id), (e = e._name))
      : ((t = jn()), ((n = Mh).time = nn()), (e = e == null ? null : e + ""));
    for (var o = this._groups, r = o.length, i = 0; i < r; ++i)
      for (var s = o[i], a = s.length, c, l = 0; l < a; ++l)
        (c = s[l]) && Ye(c, e, t, l, s, n || Ih(c, t));
    return new he(o, this._parents, e, t);
  }
  Re.prototype.interrupt = Ss;
  Re.prototype.transition = qs;
  var sn = (e) => () => e;
  function Zo(e, { sourceEvent: t, target: n, transform: o, dispatch: r }) {
    Object.defineProperties(this, {
      type: { value: e, enumerable: !0, configurable: !0 },
      sourceEvent: { value: t, enumerable: !0, configurable: !0 },
      target: { value: n, enumerable: !0, configurable: !0 },
      transform: { value: o, enumerable: !0, configurable: !0 },
      _: { value: r },
    });
  }
  function Ee(e, t, n) {
    ((this.k = e), (this.x = t), (this.y = n));
  }
  Ee.prototype = {
    constructor: Ee,
    scale: function (e) {
      return e === 1 ? this : new Ee(this.k * e, this.x, this.y);
    },
    translate: function (e, t) {
      return (e === 0) & (t === 0)
        ? this
        : new Ee(this.k, this.x + this.k * e, this.y + this.k * t);
    },
    apply: function (e) {
      return [e[0] * this.k + this.x, e[1] * this.k + this.y];
    },
    applyX: function (e) {
      return e * this.k + this.x;
    },
    applyY: function (e) {
      return e * this.k + this.y;
    },
    invert: function (e) {
      return [(e[0] - this.x) / this.k, (e[1] - this.y) / this.k];
    },
    invertX: function (e) {
      return (e - this.x) / this.k;
    },
    invertY: function (e) {
      return (e - this.y) / this.k;
    },
    rescaleX: function (e) {
      return e
        .copy()
        .domain(e.range().map(this.invertX, this).map(e.invert, e));
    },
    rescaleY: function (e) {
      return e
        .copy()
        .domain(e.range().map(this.invertY, this).map(e.invert, e));
    },
    toString: function () {
      return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
    },
  };
  var at = new Ee(1, 0, 0);
  an.prototype = Ee.prototype;
  function an(e) {
    for (; !e.__zoom;) if (!(e = e.parentNode)) return at;
    return e.__zoom;
  }
  function Un(e) {
    e.stopImmediatePropagation();
  }
  function wt(e) {
    (e.preventDefault(), e.stopImmediatePropagation());
  }
  function kh(e) {
    return (!e.ctrlKey || e.type === "wheel") && !e.button;
  }
  function Oh() {
    var e = this;
    return e instanceof SVGElement
      ? ((e = e.ownerSVGElement || e),
        e.hasAttribute("viewBox")
          ? ((e = e.viewBox.baseVal),
            [
              [e.x, e.y],
              [e.x + e.width, e.y + e.height],
            ])
          : [
              [0, 0],
              [e.width.baseVal.value, e.height.baseVal.value],
            ])
      : [
          [0, 0],
          [e.clientWidth, e.clientHeight],
        ];
  }
  function Gs() {
    return this.__zoom || at;
  }
  function Ph(e) {
    return (
      -e.deltaY *
      (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) *
      (e.ctrlKey ? 10 : 1)
    );
  }
  function Ah() {
    return navigator.maxTouchPoints || "ontouchstart" in this;
  }
  function Th(e, t, n) {
    var o = e.invertX(t[0][0]) - n[0][0],
      r = e.invertX(t[1][0]) - n[1][0],
      i = e.invertY(t[0][1]) - n[0][1],
      s = e.invertY(t[1][1]) - n[1][1];
    return e.translate(
      r > o ? (o + r) / 2 : Math.min(0, o) || Math.max(0, r),
      s > i ? (i + s) / 2 : Math.min(0, i) || Math.max(0, s),
    );
  }
  function Qn() {
    var e = kh,
      t = Oh,
      n = Th,
      o = Ph,
      r = Ah,
      i = [0, 1 / 0],
      s = [
        [-1 / 0, -1 / 0],
        [1 / 0, 1 / 0],
      ],
      a = 250,
      c = rt,
      l = Qe("start", "zoom", "end"),
      u,
      d,
      f,
      h = 500,
      p = 150,
      x = 0,
      y = 10;
    function m(w) {
      w.property("__zoom", Gs)
        .on("wheel.zoom", O, { passive: !1 })
        .on("mousedown.zoom", P)
        .on("dblclick.zoom", B)
        .filter(r)
        .on("touchstart.zoom", D)
        .on("touchmove.zoom", $)
        .on("touchend.zoom touchcancel.zoom", z)
        .style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
    }
    ((m.transform = function (w, E, S, M) {
      var T = w.selection ? w.selection() : w;
      (T.property("__zoom", Gs),
        w !== T
          ? N(w, E, S, M)
          : T.interrupt().each(function () {
              _(this, arguments)
                .event(M)
                .start()
                .zoom(
                  null,
                  typeof E == "function" ? E.apply(this, arguments) : E,
                )
                .end();
            }));
    }),
      (m.scaleBy = function (w, E, S, M) {
        m.scaleTo(
          w,
          function () {
            var T = this.__zoom.k,
              A = typeof E == "function" ? E.apply(this, arguments) : E;
            return T * A;
          },
          S,
          M,
        );
      }),
      (m.scaleTo = function (w, E, S, M) {
        m.transform(
          w,
          function () {
            var T = t.apply(this, arguments),
              A = this.__zoom,
              V =
                S == null
                  ? v(T)
                  : typeof S == "function"
                    ? S.apply(this, arguments)
                    : S,
              H = A.invert(V),
              L = typeof E == "function" ? E.apply(this, arguments) : E;
            return n(g(b(A, L), V, H), T, s);
          },
          S,
          M,
        );
      }),
      (m.translateBy = function (w, E, S, M) {
        m.transform(
          w,
          function () {
            return n(
              this.__zoom.translate(
                typeof E == "function" ? E.apply(this, arguments) : E,
                typeof S == "function" ? S.apply(this, arguments) : S,
              ),
              t.apply(this, arguments),
              s,
            );
          },
          null,
          M,
        );
      }),
      (m.translateTo = function (w, E, S, M, T) {
        m.transform(
          w,
          function () {
            var A = t.apply(this, arguments),
              V = this.__zoom,
              H =
                M == null
                  ? v(A)
                  : typeof M == "function"
                    ? M.apply(this, arguments)
                    : M;
            return n(
              at
                .translate(H[0], H[1])
                .scale(V.k)
                .translate(
                  typeof E == "function" ? -E.apply(this, arguments) : -E,
                  typeof S == "function" ? -S.apply(this, arguments) : -S,
                ),
              A,
              s,
            );
          },
          M,
          T,
        );
      }));
    function b(w, E) {
      return (
        (E = Math.max(i[0], Math.min(i[1], E))),
        E === w.k ? w : new Ee(E, w.x, w.y)
      );
    }
    function g(w, E, S) {
      var M = E[0] - S[0] * w.k,
        T = E[1] - S[1] * w.k;
      return M === w.x && T === w.y ? w : new Ee(w.k, M, T);
    }
    function v(w) {
      return [(+w[0][0] + +w[1][0]) / 2, (+w[0][1] + +w[1][1]) / 2];
    }
    function N(w, E, S, M) {
      w.on("start.zoom", function () {
        _(this, arguments).event(M).start();
      })
        .on("interrupt.zoom end.zoom", function () {
          _(this, arguments).event(M).end();
        })
        .tween("zoom", function () {
          var T = this,
            A = arguments,
            V = _(T, A).event(M),
            H = t.apply(T, A),
            L = S == null ? v(H) : typeof S == "function" ? S.apply(T, A) : S,
            Z = Math.max(H[1][0] - H[0][0], H[1][1] - H[0][1]),
            X = T.__zoom,
            q = typeof E == "function" ? E.apply(T, A) : E,
            J = c(X.invert(L).concat(Z / X.k), q.invert(L).concat(Z / q.k));
          return function (G) {
            if (G === 1) G = q;
            else {
              var R = J(G),
                F = Z / R[2];
              G = new Ee(F, L[0] - R[0] * F, L[1] - R[1] * F);
            }
            V.zoom(null, G);
          };
        });
    }
    function _(w, E, S) {
      return (!S && w.__zooming) || new I(w, E);
    }
    function I(w, E) {
      ((this.that = w),
        (this.args = E),
        (this.active = 0),
        (this.sourceEvent = null),
        (this.extent = t.apply(w, E)),
        (this.taps = 0));
    }
    I.prototype = {
      event: function (w) {
        return (w && (this.sourceEvent = w), this);
      },
      start: function () {
        return (
          ++this.active === 1 &&
            ((this.that.__zooming = this), this.emit("start")),
          this
        );
      },
      zoom: function (w, E) {
        return (
          this.mouse &&
            w !== "mouse" &&
            (this.mouse[1] = E.invert(this.mouse[0])),
          this.touch0 &&
            w !== "touch" &&
            (this.touch0[1] = E.invert(this.touch0[0])),
          this.touch1 &&
            w !== "touch" &&
            (this.touch1[1] = E.invert(this.touch1[0])),
          (this.that.__zoom = E),
          this.emit("zoom"),
          this
        );
      },
      end: function () {
        return (
          --this.active === 0 && (delete this.that.__zooming, this.emit("end")),
          this
        );
      },
      emit: function (w) {
        var E = ce(this.that).datum();
        l.call(
          w,
          this.that,
          new Zo(w, {
            sourceEvent: this.sourceEvent,
            target: m,
            type: w,
            transform: this.that.__zoom,
            dispatch: l,
          }),
          E,
        );
      },
    };
    function O(w, ...E) {
      if (!e.apply(this, arguments)) return;
      var S = _(this, E).event(w),
        M = this.__zoom,
        T = Math.max(
          i[0],
          Math.min(i[1], M.k * Math.pow(2, o.apply(this, arguments))),
        ),
        A = de(w);
      if (S.wheel)
        ((S.mouse[0][0] !== A[0] || S.mouse[0][1] !== A[1]) &&
          (S.mouse[1] = M.invert((S.mouse[0] = A))),
          clearTimeout(S.wheel));
      else {
        if (M.k === T) return;
        ((S.mouse = [A, M.invert(A)]), st(this), S.start());
      }
      (wt(w),
        (S.wheel = setTimeout(V, p)),
        S.zoom("mouse", n(g(b(M, T), S.mouse[0], S.mouse[1]), S.extent, s)));
      function V() {
        ((S.wheel = null), S.end());
      }
    }
    function P(w, ...E) {
      if (f || !e.apply(this, arguments)) return;
      var S = w.currentTarget,
        M = _(this, E, !0).event(w),
        T = ce(w.view).on("mousemove.zoom", L, !0).on("mouseup.zoom", Z, !0),
        A = de(w, S),
        V = w.clientX,
        H = w.clientY;
      (Ft(w.view),
        Un(w),
        (M.mouse = [A, this.__zoom.invert(A)]),
        st(this),
        M.start());
      function L(X) {
        if ((wt(X), !M.moved)) {
          var q = X.clientX - V,
            J = X.clientY - H;
          M.moved = q * q + J * J > x;
        }
        M.event(X).zoom(
          "mouse",
          n(g(M.that.__zoom, (M.mouse[0] = de(X, S)), M.mouse[1]), M.extent, s),
        );
      }
      function Z(X) {
        (T.on("mousemove.zoom mouseup.zoom", null),
          Yt(X.view, M.moved),
          wt(X),
          M.event(X).end());
      }
    }
    function B(w, ...E) {
      if (e.apply(this, arguments)) {
        var S = this.__zoom,
          M = de(w.changedTouches ? w.changedTouches[0] : w, this),
          T = S.invert(M),
          A = S.k * (w.shiftKey ? 0.5 : 2),
          V = n(g(b(S, A), M, T), t.apply(this, E), s);
        (wt(w),
          a > 0
            ? ce(this).transition().duration(a).call(N, V, M, w)
            : ce(this).call(m.transform, V, M, w));
      }
    }
    function D(w, ...E) {
      if (e.apply(this, arguments)) {
        var S = w.touches,
          M = S.length,
          T = _(this, E, w.changedTouches.length === M).event(w),
          A,
          V,
          H,
          L;
        for (Un(w), V = 0; V < M; ++V)
          ((H = S[V]),
            (L = de(H, this)),
            (L = [L, this.__zoom.invert(L), H.identifier]),
            T.touch0
              ? !T.touch1 &&
                T.touch0[2] !== L[2] &&
                ((T.touch1 = L), (T.taps = 0))
              : ((T.touch0 = L), (A = !0), (T.taps = 1 + !!u)));
        (u && (u = clearTimeout(u)),
          A &&
            (T.taps < 2 &&
              ((d = L[0]),
              (u = setTimeout(function () {
                u = null;
              }, h))),
            st(this),
            T.start()));
      }
    }
    function $(w, ...E) {
      if (this.__zooming) {
        var S = _(this, E).event(w),
          M = w.changedTouches,
          T = M.length,
          A,
          V,
          H,
          L;
        for (wt(w), A = 0; A < T; ++A)
          ((V = M[A]),
            (H = de(V, this)),
            S.touch0 && S.touch0[2] === V.identifier
              ? (S.touch0[0] = H)
              : S.touch1 && S.touch1[2] === V.identifier && (S.touch1[0] = H));
        if (((V = S.that.__zoom), S.touch1)) {
          var Z = S.touch0[0],
            X = S.touch0[1],
            q = S.touch1[0],
            J = S.touch1[1],
            G = (G = q[0] - Z[0]) * G + (G = q[1] - Z[1]) * G,
            R = (R = J[0] - X[0]) * R + (R = J[1] - X[1]) * R;
          ((V = b(V, Math.sqrt(G / R))),
            (H = [(Z[0] + q[0]) / 2, (Z[1] + q[1]) / 2]),
            (L = [(X[0] + J[0]) / 2, (X[1] + J[1]) / 2]));
        } else if (S.touch0) ((H = S.touch0[0]), (L = S.touch0[1]));
        else return;
        S.zoom("touch", n(g(V, H, L), S.extent, s));
      }
    }
    function z(w, ...E) {
      if (this.__zooming) {
        var S = _(this, E).event(w),
          M = w.changedTouches,
          T = M.length,
          A,
          V;
        for (
          Un(w),
            f && clearTimeout(f),
            f = setTimeout(function () {
              f = null;
            }, h),
            A = 0;
          A < T;
          ++A
        )
          ((V = M[A]),
            S.touch0 && S.touch0[2] === V.identifier
              ? delete S.touch0
              : S.touch1 && S.touch1[2] === V.identifier && delete S.touch1);
        if (
          (S.touch1 && !S.touch0 && ((S.touch0 = S.touch1), delete S.touch1),
          S.touch0)
        )
          S.touch0[1] = this.__zoom.invert(S.touch0[0]);
        else if (
          (S.end(),
          S.taps === 2 &&
            ((V = de(V, this)), Math.hypot(d[0] - V[0], d[1] - V[1]) < y))
        ) {
          var H = ce(this).on("dblclick.zoom");
          H && H.apply(this, arguments);
        }
      }
    }
    return (
      (m.wheelDelta = function (w) {
        return arguments.length
          ? ((o = typeof w == "function" ? w : sn(+w)), m)
          : o;
      }),
      (m.filter = function (w) {
        return arguments.length
          ? ((e = typeof w == "function" ? w : sn(!!w)), m)
          : e;
      }),
      (m.touchable = function (w) {
        return arguments.length
          ? ((r = typeof w == "function" ? w : sn(!!w)), m)
          : r;
      }),
      (m.extent = function (w) {
        return arguments.length
          ? ((t =
              typeof w == "function"
                ? w
                : sn([
                    [+w[0][0], +w[0][1]],
                    [+w[1][0], +w[1][1]],
                  ])),
            m)
          : t;
      }),
      (m.scaleExtent = function (w) {
        return arguments.length
          ? ((i[0] = +w[0]), (i[1] = +w[1]), m)
          : [i[0], i[1]];
      }),
      (m.translateExtent = function (w) {
        return arguments.length
          ? ((s[0][0] = +w[0][0]),
            (s[1][0] = +w[1][0]),
            (s[0][1] = +w[0][1]),
            (s[1][1] = +w[1][1]),
            m)
          : [
              [s[0][0], s[0][1]],
              [s[1][0], s[1][1]],
            ];
      }),
      (m.constrain = function (w) {
        return arguments.length ? ((n = w), m) : n;
      }),
      (m.duration = function (w) {
        return arguments.length ? ((a = +w), m) : a;
      }),
      (m.interpolate = function (w) {
        return arguments.length ? ((c = w), m) : c;
      }),
      (m.on = function () {
        var w = l.on.apply(l, arguments);
        return w === l ? m : w;
      }),
      (m.clickDistance = function (w) {
        return arguments.length ? ((x = (w = +w) * w), m) : Math.sqrt(x);
      }),
      (m.tapDistance = function (w) {
        return arguments.length ? ((y = +w), m) : y;
      }),
      m
    );
  }
  var pe = {
      error001: (e = "react") =>
        `Seems like you have not used ${e === "svelte" ? "SvelteFlowProvider" : "ReactFlowProvider"} as an ancestor. Help: https://${e}flow.dev/error#001`,
      error002: () =>
        "It looks like you've created a new nodeTypes or edgeTypes object. If this wasn't on purpose please define the nodeTypes/edgeTypes outside of the component or memoize them.",
      error003: (e) =>
        `Node type "${e}" not found. Using fallback type "default".`,
      error004: () =>
        "The parent container needs a width and a height to render the graph.",
      error005: () => "Only child nodes can use a parent extent.",
      error006: () => "Can't create edge. An edge needs a source and a target.",
      error007: (e) => `The old edge with id=${e} does not exist.`,
      error009: (e) => `Marker type "${e}" doesn't exist.`,
      error008: (e, { id: t, sourceHandle: n, targetHandle: o }) =>
        `Couldn't create edge for ${e} handle id: "${e === "source" ? n : o}", edge id: ${t}.`,
      error010: () =>
        "Handle: No node id found. Make sure to only use a Handle inside a custom Node.",
      error011: (e) =>
        `Edge type "${e}" not found. Using fallback type "default".`,
      error012: (e) =>
        `Node with id "${e}" does not exist, it may have been removed. This can happen when a node is deleted before the "onNodeClick" handler is called.`,
      error013: (e = "react") =>
        `It seems that you haven't loaded the styles. Please import '@xyflow/${e}/dist/style.css' or base.css to make sure everything is working properly.`,
      error014: () =>
        "useNodeConnections: No node ID found. Call useNodeConnections inside a custom Node or provide a node ID.",
      error015: () =>
        "It seems that you are trying to drag a node that is not initialized. Please use onNodesChange as explained in the docs.",
      error016: (e) =>
        `Edge with id "${e}" does not exist, it may have been removed. This can happen when an edge is deleted before the "onEdgeClick" handler is called.`,
    },
    _t = [
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ],
    Ko = ["Enter", " ", "Escape"],
    Uo = {
      "node.a11yDescription.default":
        "Press enter or space to select a node. Press delete to remove it and escape to cancel.",
      "node.a11yDescription.keyboardDisabled":
        "Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.",
      "node.a11yDescription.ariaLiveMessage": ({ direction: e, x: t, y: n }) =>
        `Moved selected node ${e}. New position, x: ${t}, y: ${n}`,
      "edge.a11yDescription.default":
        "Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.",
      "controls.ariaLabel": "Control Panel",
      "controls.zoomIn.ariaLabel": "Zoom In",
      "controls.zoomOut.ariaLabel": "Zoom Out",
      "controls.fitView.ariaLabel": "Fit View",
      "controls.interactive.ariaLabel": "Toggle Interactivity",
      "minimap.ariaLabel": "Mini Map",
      "handle.ariaLabel": "Handle",
    },
    He;
  (function (e) {
    ((e.Strict = "strict"), (e.Loose = "loose"));
  })(He || (He = {}));
  var Ie;
  (function (e) {
    ((e.Free = "free"),
      (e.Vertical = "vertical"),
      (e.Horizontal = "horizontal"));
  })(Ie || (Ie = {}));
  var We;
  (function (e) {
    ((e.Partial = "partial"), (e.Full = "full"));
  })(We || (We = {}));
  var Qo = {
      inProgress: !1,
      isValid: null,
      from: null,
      fromHandle: null,
      fromPosition: null,
      fromNode: null,
      to: null,
      toHandle: null,
      toPosition: null,
      toNode: null,
      pointer: null,
    },
    _e;
  (function (e) {
    ((e.Bezier = "default"),
      (e.Straight = "straight"),
      (e.Step = "step"),
      (e.SmoothStep = "smoothstep"),
      (e.SimpleBezier = "simplebezier"));
  })(_e || (_e = {}));
  var ct;
  (function (e) {
    ((e.Arrow = "arrow"), (e.ArrowClosed = "arrowclosed"));
  })(ct || (ct = {}));
  var Y;
  (function (e) {
    ((e.Left = "left"),
      (e.Top = "top"),
      (e.Right = "right"),
      (e.Bottom = "bottom"));
  })(Y || (Y = {}));
  var js = {
    [Y.Left]: Y.Right,
    [Y.Right]: Y.Left,
    [Y.Top]: Y.Bottom,
    [Y.Bottom]: Y.Top,
  };
  function Jo(e, t) {
    if (!e && !t) return !0;
    if (!e || !t || e.size !== t.size) return !1;
    if (!e.size && !t.size) return !0;
    for (let n of e.keys()) if (!t.has(n)) return !1;
    return !0;
  }
  function ln(e, t, n) {
    if (!n) return;
    let o = [];
    (e.forEach((r, i) => {
      t?.has(i) || o.push(r);
    }),
      o.length && n(o));
  }
  function er(e) {
    return e === null ? null : e ? "valid" : "invalid";
  }
  var tr = (e) =>
      !!e &&
      typeof e == "object" &&
      "id" in e &&
      "source" in e &&
      "target" in e,
    ca = (e) =>
      !!e &&
      typeof e == "object" &&
      "id" in e &&
      "position" in e &&
      !("source" in e) &&
      !("target" in e),
    nr = (e) =>
      !!e &&
      typeof e == "object" &&
      "id" in e &&
      "internals" in e &&
      !("source" in e) &&
      !("target" in e),
    la = (e, t, n) => {
      if (!e.id) return [];
      let o = new Set();
      return (
        n.forEach((r) => {
          r.source === e.id && o.add(r.target);
        }),
        t.filter((r) => o.has(r.id))
      );
    },
    ua = (e, t, n) => {
      if (!e.id) return [];
      let o = new Set();
      return (
        n.forEach((r) => {
          r.target === e.id && o.add(r.source);
        }),
        t.filter((r) => o.has(r.id))
      );
    },
    un = (e, t = [0, 0]) => {
      let { width: n, height: o } = Se(e),
        r = e.origin ?? t,
        i = n * r[0],
        s = o * r[1];
      return { x: e.position.x - i, y: e.position.y - s };
    },
    no = (e, t = { nodeOrigin: [0, 0] }) => {
      if (e.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      let n = e.reduce(
        (o, r) => {
          let i = typeof r == "string",
            s = !t.nodeLookup && !i ? r : void 0;
          t.nodeLookup &&
            (s = i ? t.nodeLookup.get(r) : nr(r) ? r : t.nodeLookup.get(r.id));
          let a = s ? to(s, t.nodeOrigin) : { x: 0, y: 0, x2: 0, y2: 0 };
          return io(o, a);
        },
        { x: 1 / 0, y: 1 / 0, x2: -1 / 0, y2: -1 / 0 },
      );
      return so(n);
    },
    ft = (e, t = {}) => {
      let n = { x: 1 / 0, y: 1 / 0, x2: -1 / 0, y2: -1 / 0 },
        o = !1;
      return (
        e.forEach((r) => {
          (t.filter === void 0 || t.filter(r)) &&
            ((n = io(n, to(r))), (o = !0));
        }),
        o ? so(n) : { x: 0, y: 0, width: 0, height: 0 }
      );
    },
    oo = (e, t, [n, o, r] = [0, 0, 1], i = !1, s = !1) => {
      let a = (t.x - n) / r,
        c = (t.y - o) / r,
        l = t.width / r,
        u = t.height / r,
        d = [];
      for (let f of e.values()) {
        let { measured: h, selectable: p = !0, hidden: x = !1 } = f;
        if ((s && !p) || x) continue;
        let y = h.width ?? f.width ?? f.initialWidth ?? 0,
          m = h.height ?? f.height ?? f.initialHeight ?? 0,
          { x: b, y: g } = f.internals.positionAbsolute,
          v = pa(a, c, l, u, b, g, y, m),
          N = y * m,
          _ = i && v > 0;
        (!f.internals.handleBounds || _ || v >= N || f.dragging) && d.push(f);
      }
      return d;
    },
    or = (e, t) => {
      let n = new Set();
      return (
        e.forEach((o) => {
          n.add(o.id);
        }),
        t.filter((o) => n.has(o.source) || n.has(o.target))
      );
    };
  function Dh(e, t) {
    let n = new Map(),
      o = t?.nodes ? new Set(t.nodes.map((r) => r.id)) : null;
    return (
      e.forEach((r) => {
        let i;
        if (t?.includeHiddenNodes) {
          let { width: s, height: a } = Se(r);
          i = s > 0 && a > 0;
        } else i = !!(r.measured.width && r.measured.height && !r.hidden);
        i && (!o || o.has(r.id)) && n.set(r.id, r);
      }),
      n
    );
  }
  async function da(
    { nodes: e, width: t, height: n, panZoom: o, minZoom: r, maxZoom: i },
    s,
  ) {
    if (e.size === 0) return !0;
    let a = Dh(e, s),
      c = ft(a),
      l = Mt(c, t, n, s?.minZoom ?? r, s?.maxZoom ?? i, s?.padding ?? 0.1);
    return (
      await o.setViewport(l, {
        duration: s?.duration,
        ease: s?.ease,
        interpolate: s?.interpolate,
      }),
      !0
    );
  }
  function rr({
    nodeId: e,
    nextPosition: t,
    nodeLookup: n,
    nodeOrigin: o = [0, 0],
    nodeExtent: r,
    onError: i,
  }) {
    let s = n.get(e),
      a = s.parentId ? n.get(s.parentId) : void 0,
      { x: c, y: l } = a ? a.internals.positionAbsolute : { x: 0, y: 0 },
      u = s.origin ?? o,
      d = s.extent || r;
    if (s.extent === "parent" && !s.expandParent)
      if (!a) i?.("005", pe.error005());
      else {
        let h = a.measured.width,
          p = a.measured.height;
        h &&
          p &&
          (d = [
            [c, l],
            [c + h, l + p],
          ]);
      }
    else
      a &&
        dt(s.extent) &&
        (d = [
          [s.extent[0][0] + c, s.extent[0][1] + l],
          [s.extent[1][0] + c, s.extent[1][1] + l],
        ]);
    let f = dt(d) ? lt(t, d, s.measured) : t;
    return (
      (s.measured.width === void 0 || s.measured.height === void 0) &&
        i?.("015", pe.error015()),
      {
        position: {
          x: f.x - c + (s.measured.width ?? 0) * u[0],
          y: f.y - l + (s.measured.height ?? 0) * u[1],
        },
        positionAbsolute: f,
      }
    );
  }
  async function fa({
    nodesToRemove: e = [],
    edgesToRemove: t = [],
    nodes: n,
    edges: o,
    onBeforeDelete: r,
  }) {
    let i = new Set(e.map((f) => f.id)),
      s = [];
    for (let f of n) {
      if (f.deletable === !1) continue;
      let h = i.has(f.id),
        p = !h && f.parentId && s.find((x) => x.id === f.parentId);
      (h || p) && s.push(f);
    }
    let a = new Set(t.map((f) => f.id)),
      c = o.filter((f) => f.deletable !== !1),
      u = or(s, c);
    for (let f of c) a.has(f.id) && !u.find((p) => p.id === f.id) && u.push(f);
    if (!r) return { edges: u, nodes: s };
    let d = await r({ nodes: s, edges: u });
    return typeof d == "boolean"
      ? d
        ? { edges: u, nodes: s }
        : { edges: [], nodes: [] }
      : d;
  }
  var Et = (e, t = 0, n = 1) => Math.min(Math.max(e, t), n),
    lt = (e = { x: 0, y: 0 }, t, n) => ({
      x: Et(e.x, t[0][0], t[1][0] - (n?.width ?? 0)),
      y: Et(e.y, t[0][1], t[1][1] - (n?.height ?? 0)),
    });
  function ha(e, t, n) {
    let { width: o, height: r } = Se(n),
      { x: i, y: s } = n.internals.positionAbsolute;
    return lt(
      e,
      [
        [i, s],
        [i + o, s + r],
      ],
      t,
    );
  }
  var Ks = (e, t, n) =>
      e < t
        ? Et(Math.abs(e - t), 1, t) / t
        : e > n
          ? -Et(Math.abs(e - n), 1, t) / t
          : 0,
    ro = (e, t, n = 15, o = 40) => {
      let r = Ks(e.x, o, t.width - o) * n,
        i = Ks(e.y, o, t.height - o) * n;
      return [r, i];
    },
    io = (e, t) => ({
      x: Math.min(e.x, t.x),
      y: Math.min(e.y, t.y),
      x2: Math.max(e.x2, t.x2),
      y2: Math.max(e.y2, t.y2),
    }),
    jo = ({ x: e, y: t, width: n, height: o }) => ({
      x: e,
      y: t,
      x2: e + n,
      y2: t + o,
    }),
    so = ({ x: e, y: t, x2: n, y2: o }) => ({
      x: e,
      y: t,
      width: n - e,
      height: o - t,
    }),
    St = (e, t = [0, 0]) => {
      let { x: n, y: o } = nr(e) ? e.internals.positionAbsolute : un(e, t);
      return {
        x: n,
        y: o,
        width: e.measured?.width ?? e.width ?? e.initialWidth ?? 0,
        height: e.measured?.height ?? e.height ?? e.initialHeight ?? 0,
      };
    },
    to = (e, t = [0, 0]) => {
      let { x: n, y: o } = nr(e) ? e.internals.positionAbsolute : un(e, t);
      return {
        x: n,
        y: o,
        x2: n + (e.measured?.width ?? e.width ?? e.initialWidth ?? 0),
        y2: o + (e.measured?.height ?? e.height ?? e.initialHeight ?? 0),
      };
    },
    ir = (e, t) => so(io(jo(e), jo(t))),
    pa = (e, t, n, o, r, i, s, a) => {
      let c = Math.max(0, Math.min(e + n, r + s) - Math.max(e, r)),
        l = Math.max(0, Math.min(t + o, i + a) - Math.max(t, i));
      return Math.ceil(c * l);
    },
    dn = (e, t) => pa(e.x, e.y, e.width, e.height, t.x, t.y, t.width, t.height),
    sr = (e) => me(e.width) && me(e.height) && me(e.x) && me(e.y),
    me = (e) => !isNaN(e) && isFinite(e),
    ar = (e, t) => (n, o) => {},
    Nt = (e, t = [1, 1]) => ({
      x: t[0] * Math.round(e.x / t[0]),
      y: t[1] * Math.round(e.y / t[1]),
    }),
    Ct = ({ x: e, y: t }, [n, o, r], i = !1, s = [1, 1]) => {
      let a = { x: (e - n) / r, y: (t - o) / r };
      return i ? Nt(a, s) : a;
    },
    ut = ({ x: e, y: t }, [n, o, r]) => ({ x: e * r + n, y: t * r + o });
  function vt(e, t) {
    if (typeof e == "number") return Math.floor((t - t / (1 + e)) * 0.5);
    if (typeof e == "string" && e.endsWith("px")) {
      let n = parseFloat(e);
      if (!Number.isNaN(n)) return Math.floor(n);
    }
    if (typeof e == "string" && e.endsWith("%")) {
      let n = parseFloat(e);
      if (!Number.isNaN(n)) return Math.floor(t * n * 0.01);
    }
    return (
      console.error(
        `The padding value "${e}" is invalid. Please provide a number or a string with a valid unit (px or %).`,
      ),
      0
    );
  }
  function zh(e, t, n) {
    if (typeof e == "string" || typeof e == "number") {
      let o = vt(e, n),
        r = vt(e, t);
      return { top: o, right: r, bottom: o, left: r, x: r * 2, y: o * 2 };
    }
    if (typeof e == "object") {
      let o = vt(e.top ?? e.y ?? 0, n),
        r = vt(e.bottom ?? e.y ?? 0, n),
        i = vt(e.left ?? e.x ?? 0, t),
        s = vt(e.right ?? e.x ?? 0, t);
      return { top: o, right: s, bottom: r, left: i, x: i + s, y: o + r };
    }
    return { top: 0, right: 0, bottom: 0, left: 0, x: 0, y: 0 };
  }
  function Rh(e, t, n, o, r, i) {
    let { x: s, y: a } = ut(e, [t, n, o]),
      { x: c, y: l } = ut({ x: e.x + e.width, y: e.y + e.height }, [t, n, o]),
      u = r - c,
      d = i - l;
    return {
      left: Math.floor(s),
      top: Math.floor(a),
      right: Math.floor(u),
      bottom: Math.floor(d),
    };
  }
  var Mt = (e, t, n, o, r, i) => {
      let s = zh(i, t, n),
        a = (t - s.x) / e.width,
        c = (n - s.y) / e.height,
        l = Math.min(a, c),
        u = Et(l, o, r),
        d = e.x + e.width / 2,
        f = e.y + e.height / 2,
        h = t / 2 - d * u,
        p = n / 2 - f * u,
        x = Rh(e, h, p, u, t, n),
        y = {
          left: Math.min(x.left - s.left, 0),
          top: Math.min(x.top - s.top, 0),
          right: Math.min(x.right - s.right, 0),
          bottom: Math.min(x.bottom - s.bottom, 0),
        };
      return { x: h - y.left + y.right, y: p - y.top + y.bottom, zoom: u };
    },
    It = () =>
      typeof navigator < "u" && navigator?.userAgent?.indexOf("Mac") >= 0;
  function dt(e) {
    return e != null && e !== "parent";
  }
  function Se(e) {
    return {
      width: e.measured?.width ?? e.width ?? e.initialWidth ?? 0,
      height: e.measured?.height ?? e.height ?? e.initialHeight ?? 0,
    };
  }
  function ao(e) {
    return (
      (e.measured?.width ?? e.width ?? e.initialWidth) !== void 0 &&
      (e.measured?.height ?? e.height ?? e.initialHeight) !== void 0
    );
  }
  function cr(e, t = { width: 0, height: 0 }, n, o, r) {
    let i = { ...e },
      s = o.get(n);
    if (s) {
      let a = s.origin || r;
      ((i.x += s.internals.positionAbsolute.x - (t.width ?? 0) * a[0]),
        (i.y += s.internals.positionAbsolute.y - (t.height ?? 0) * a[1]));
    }
    return i;
  }
  function lr(e, t) {
    if (e.size !== t.size) return !1;
    for (let n of e) if (!t.has(n)) return !1;
    return !0;
  }
  function ga() {
    let e, t;
    return {
      promise: new Promise((o, r) => {
        ((e = o), (t = r));
      }),
      resolve: e,
      reject: t,
    };
  }
  function ma(e) {
    return { ...Uo, ...(e || {}) };
  }
  function cn(
    e,
    {
      snapGrid: t = [0, 0],
      snapToGrid: n = !1,
      transform: o,
      containerBounds: r,
    },
  ) {
    let { x: i, y: s } = ye(e),
      a = Ct({ x: i - (r?.left ?? 0), y: s - (r?.top ?? 0) }, o),
      { x: c, y: l } = n ? Nt(a, t) : a;
    return { xSnapped: c, ySnapped: l, ...a };
  }
  var co = (e) => ({ width: e.offsetWidth, height: e.offsetHeight }),
    ur = (e) => e?.getRootNode?.() || window?.document,
    Lh = ["INPUT", "SELECT", "TEXTAREA"];
  function dr(e) {
    let t = e.composedPath?.()?.[0] || e.target;
    return t?.nodeType !== 1
      ? !1
      : Lh.includes(t.nodeName) ||
          t.hasAttribute("contenteditable") ||
          !!t.closest(".nokey");
  }
  var fr = (e) => "clientX" in e,
    ye = (e, t) => {
      let n = fr(e),
        o = n ? e.clientX : e.touches?.[0].clientX,
        r = n ? e.clientY : e.touches?.[0].clientY;
      return { x: o - (t?.left ?? 0), y: r - (t?.top ?? 0) };
    },
    Us = (e, t, n, o, r) => {
      let i = t.querySelectorAll(`.${e}`);
      return !i || !i.length
        ? null
        : Array.from(i).map((s) => {
            let a = s.getBoundingClientRect();
            return {
              id: s.getAttribute("data-handleid"),
              type: e,
              nodeId: r,
              position: s.getAttribute("data-handlepos"),
              x: (a.left - n.left) / o,
              y: (a.top - n.top) / o,
              ...co(s),
            };
          });
    };
  function fn({
    sourceX: e,
    sourceY: t,
    targetX: n,
    targetY: o,
    sourceControlX: r,
    sourceControlY: i,
    targetControlX: s,
    targetControlY: a,
  }) {
    let c = e * 0.125 + r * 0.375 + s * 0.375 + n * 0.125,
      l = t * 0.125 + i * 0.375 + a * 0.375 + o * 0.125,
      u = Math.abs(c - e),
      d = Math.abs(l - t);
    return [c, l, u, d];
  }
  function Jn(e, t) {
    return e >= 0 ? 0.5 * e : t * 25 * Math.sqrt(-e);
  }
  function Qs({ pos: e, x1: t, y1: n, x2: o, y2: r, c: i }) {
    switch (e) {
      case Y.Left:
        return [t - Jn(t - o, i), n];
      case Y.Right:
        return [t + Jn(o - t, i), n];
      case Y.Top:
        return [t, n - Jn(n - r, i)];
      case Y.Bottom:
        return [t, n + Jn(r - n, i)];
    }
  }
  function hn({
    sourceX: e,
    sourceY: t,
    sourcePosition: n = Y.Bottom,
    targetX: o,
    targetY: r,
    targetPosition: i = Y.Top,
    curvature: s = 0.25,
  }) {
    let [a, c] = Qs({ pos: n, x1: e, y1: t, x2: o, y2: r, c: s }),
      [l, u] = Qs({ pos: i, x1: o, y1: r, x2: e, y2: t, c: s }),
      [d, f, h, p] = fn({
        sourceX: e,
        sourceY: t,
        targetX: o,
        targetY: r,
        sourceControlX: a,
        sourceControlY: c,
        targetControlX: l,
        targetControlY: u,
      });
    return [`M${e},${t} C${a},${c} ${l},${u} ${o},${r}`, d, f, h, p];
  }
  function lo({ sourceX: e, sourceY: t, targetX: n, targetY: o }) {
    let r = Math.abs(n - e) / 2,
      i = n < e ? n + r : n - r,
      s = Math.abs(o - t) / 2,
      a = o < t ? o + s : o - s;
    return [i, a, r, s];
  }
  function ya({
    sourceNode: e,
    targetNode: t,
    selected: n = !1,
    zIndex: o = 0,
    elevateOnSelect: r = !1,
    zIndexMode: i = "basic",
  }) {
    if (i === "manual") return o;
    let s = r && n ? o + 1e3 : o,
      a = Math.max(
        e.parentId || (r && e.selected) ? e.internals.z : 0,
        t.parentId || (r && t.selected) ? t.internals.z : 0,
      );
    return s + a;
  }
  function xa({
    sourceNode: e,
    targetNode: t,
    width: n,
    height: o,
    transform: r,
  }) {
    let i = io(to(e), to(t));
    (i.x === i.x2 && (i.x2 += 1), i.y === i.y2 && (i.y2 += 1));
    let s = {
      x: -r[0] / r[2],
      y: -r[1] / r[2],
      width: n / r[2],
      height: o / r[2],
    };
    return dn(s, so(i)) > 0;
  }
  var wa = ({ source: e, sourceHandle: t, target: n, targetHandle: o }) =>
      `xy-edge__${e}${t || ""}-${n}${o || ""}`,
    $h = (e, t) =>
      t.some(
        (n) =>
          n.source === e.source &&
          n.target === e.target &&
          (n.sourceHandle === e.sourceHandle ||
            (!n.sourceHandle && !e.sourceHandle)) &&
          (n.targetHandle === e.targetHandle ||
            (!n.targetHandle && !e.targetHandle)),
      ),
    va = (e, t, n = {}) => {
      if (!e.source || !e.target) return (n.onError?.("006", pe.error006()), t);
      let o = n.getEdgeId || wa,
        r;
      return (
        tr(e) ? (r = { ...e }) : (r = { ...e, id: o(e) }),
        $h(r, t)
          ? t
          : (r.sourceHandle === null && delete r.sourceHandle,
            r.targetHandle === null && delete r.targetHandle,
            t.concat(r))
      );
    },
    ba = (e, t, n, o = { shouldReplaceId: !0 }) => {
      let { id: r, ...i } = e;
      if (!t.source || !t.target) return (o.onError?.("006", pe.error006()), n);
      if (!n.find((l) => l.id === e.id))
        return (o.onError?.("007", pe.error007(r)), n);
      let a = o.getEdgeId || wa,
        c = {
          ...i,
          id: o.shouldReplaceId ? a(t) : r,
          source: t.source,
          target: t.target,
          sourceHandle: t.sourceHandle,
          targetHandle: t.targetHandle,
        };
      return n.filter((l) => l.id !== r).concat(c);
    };
  function pn({ sourceX: e, sourceY: t, targetX: n, targetY: o }) {
    let [r, i, s, a] = lo({ sourceX: e, sourceY: t, targetX: n, targetY: o });
    return [`M ${e},${t}L ${n},${o}`, r, i, s, a];
  }
  var Js = {
      [Y.Left]: { x: -1, y: 0 },
      [Y.Right]: { x: 1, y: 0 },
      [Y.Top]: { x: 0, y: -1 },
      [Y.Bottom]: { x: 0, y: 1 },
    },
    Hh = ({ source: e, sourcePosition: t = Y.Bottom, target: n }) =>
      t === Y.Left || t === Y.Right
        ? e.x < n.x
          ? { x: 1, y: 0 }
          : { x: -1, y: 0 }
        : e.y < n.y
          ? { x: 0, y: 1 }
          : { x: 0, y: -1 },
    ea = (e, t) => Math.sqrt(Math.pow(t.x - e.x, 2) + Math.pow(t.y - e.y, 2));
  function Bh({
    source: e,
    sourcePosition: t = Y.Bottom,
    target: n,
    targetPosition: o = Y.Top,
    center: r,
    offset: i,
    stepPosition: s,
  }) {
    let a = Js[t],
      c = Js[o],
      l = { x: e.x + a.x * i, y: e.y + a.y * i },
      u = { x: n.x + c.x * i, y: n.y + c.y * i },
      d = Hh({ source: l, sourcePosition: t, target: u }),
      f = d.x !== 0 ? "x" : "y",
      h = d[f],
      p = [],
      x,
      y,
      m = { x: 0, y: 0 },
      b = { x: 0, y: 0 },
      [, , g, v] = lo({
        sourceX: e.x,
        sourceY: e.y,
        targetX: n.x,
        targetY: n.y,
      });
    if (a[f] * c[f] === -1) {
      f === "x"
        ? ((x = r.x ?? l.x + (u.x - l.x) * s), (y = r.y ?? (l.y + u.y) / 2))
        : ((x = r.x ?? (l.x + u.x) / 2), (y = r.y ?? l.y + (u.y - l.y) * s));
      let O = [
          { x, y: l.y },
          { x, y: u.y },
        ],
        P = [
          { x: l.x, y },
          { x: u.x, y },
        ];
      a[f] === h ? (p = f === "x" ? O : P) : (p = f === "x" ? P : O);
    } else {
      let O = [{ x: l.x, y: u.y }],
        P = [{ x: u.x, y: l.y }];
      if (
        (f === "x" ? (p = a.x === h ? P : O) : (p = a.y === h ? O : P), t === o)
      ) {
        let w = Math.abs(e[f] - n[f]);
        if (w <= i) {
          let E = Math.min(i - 1, i - w);
          a[f] === h
            ? (m[f] = (l[f] > e[f] ? -1 : 1) * E)
            : (b[f] = (u[f] > n[f] ? -1 : 1) * E);
        }
      }
      if (t !== o) {
        let w = f === "x" ? "y" : "x",
          E = a[f] === c[w],
          S = l[w] > u[w],
          M = l[w] < u[w];
        ((a[f] === 1 && ((!E && S) || (E && M))) ||
          (a[f] !== 1 && ((!E && M) || (E && S)))) &&
          (p = f === "x" ? O : P);
      }
      let B = { x: l.x + m.x, y: l.y + m.y },
        D = { x: u.x + b.x, y: u.y + b.y },
        $ = Math.max(Math.abs(B.x - p[0].x), Math.abs(D.x - p[0].x)),
        z = Math.max(Math.abs(B.y - p[0].y), Math.abs(D.y - p[0].y));
      $ >= z
        ? ((x = (B.x + D.x) / 2), (y = p[0].y))
        : ((x = p[0].x), (y = (B.y + D.y) / 2));
    }
    let N = { x: l.x + m.x, y: l.y + m.y },
      _ = { x: u.x + b.x, y: u.y + b.y };
    return [
      [
        e,
        ...(N.x !== p[0].x || N.y !== p[0].y ? [N] : []),
        ...p,
        ...(_.x !== p[p.length - 1].x || _.y !== p[p.length - 1].y ? [_] : []),
        n,
      ],
      x,
      y,
      g,
      v,
    ];
  }
  function Vh(e, t, n, o) {
    let r = Math.min(ea(e, t) / 2, ea(t, n) / 2, o),
      { x: i, y: s } = t;
    if ((e.x === i && i === n.x) || (e.y === s && s === n.y))
      return `L${i} ${s}`;
    if (e.y === s) {
      let l = e.x < n.x ? -1 : 1,
        u = e.y < n.y ? 1 : -1;
      return `L ${i + r * l},${s}Q ${i},${s} ${i},${s + r * u}`;
    }
    let a = e.x < n.x ? 1 : -1,
      c = e.y < n.y ? -1 : 1;
    return `L ${i},${s + r * c}Q ${i},${s} ${i + r * a},${s}`;
  }
  function kt({
    sourceX: e,
    sourceY: t,
    sourcePosition: n = Y.Bottom,
    targetX: o,
    targetY: r,
    targetPosition: i = Y.Top,
    borderRadius: s = 5,
    centerX: a,
    centerY: c,
    offset: l = 20,
    stepPosition: u = 0.5,
  }) {
    let [d, f, h, p, x] = Bh({
        source: { x: e, y: t },
        sourcePosition: n,
        target: { x: o, y: r },
        targetPosition: i,
        center: { x: a, y: c },
        offset: l,
        stepPosition: u,
      }),
      y = `M${d[0].x} ${d[0].y}`;
    for (let m = 1; m < d.length - 1; m++) y += Vh(d[m - 1], d[m], d[m + 1], s);
    return (
      (y += `L${d[d.length - 1].x} ${d[d.length - 1].y}`),
      [y, f, h, p, x]
    );
  }
  function ta(e) {
    return (
      e &&
      !!(e.internals.handleBounds || e.handles?.length) &&
      !!(e.measured.width || e.width || e.initialWidth)
    );
  }
  function Ea(e) {
    let { sourceNode: t, targetNode: n } = e;
    if (!ta(t) || !ta(n)) return null;
    let o = t.internals.handleBounds || na(t.handles),
      r = n.internals.handleBounds || na(n.handles),
      i = oa(o?.source ?? [], e.sourceHandle),
      s = oa(
        e.connectionMode === He.Strict
          ? (r?.target ?? [])
          : (r?.target ?? []).concat(r?.source ?? []),
        e.targetHandle,
      );
    if (!i || !s)
      return (
        e.onError?.(
          "008",
          pe.error008(i ? "target" : "source", {
            id: e.id,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          }),
        ),
        null
      );
    let a = i?.position || Y.Bottom,
      c = s?.position || Y.Top,
      l = qe(t, i, a),
      u = qe(n, s, c);
    return {
      sourceX: l.x,
      sourceY: l.y,
      targetX: u.x,
      targetY: u.y,
      sourcePosition: a,
      targetPosition: c,
    };
  }
  function na(e) {
    if (!e) return null;
    let t = [],
      n = [];
    for (let o of e)
      ((o.width = o.width ?? 1),
        (o.height = o.height ?? 1),
        o.type === "source" ? t.push(o) : o.type === "target" && n.push(o));
    return { source: t, target: n };
  }
  function qe(e, t, n = Y.Left, o = !1) {
    let r = (t?.x ?? 0) + e.internals.positionAbsolute.x,
      i = (t?.y ?? 0) + e.internals.positionAbsolute.y,
      { width: s, height: a } = t ?? Se(e);
    if (o) return { x: r + s / 2, y: i + a / 2 };
    switch (t?.position ?? n) {
      case Y.Top:
        return { x: r + s / 2, y: i };
      case Y.Right:
        return { x: r + s, y: i + a / 2 };
      case Y.Bottom:
        return { x: r + s / 2, y: i + a };
      case Y.Left:
        return { x: r, y: i + a / 2 };
    }
  }
  function oa(e, t) {
    return (e && (t ? e.find((n) => n.id === t) : e[0])) || null;
  }
  function uo(e, t) {
    return e
      ? typeof e == "string"
        ? e
        : `${t ? `${t}__` : ""}${Object.keys(e)
            .sort()
            .map((o) => `${o}=${e[o]}`)
            .join("&")}`
      : "";
  }
  function _a(
    e,
    { id: t, defaultColor: n, defaultMarkerStart: o, defaultMarkerEnd: r },
  ) {
    let i = new Set();
    return e
      .reduce(
        (s, a) => (
          [a.markerStart || o, a.markerEnd || r].forEach((c) => {
            if (c && typeof c == "object") {
              let l = uo(c, t);
              i.has(l) ||
                (s.push({ id: l, color: c.color || n, ...c }), i.add(l));
            }
          }),
          s
        ),
        [],
      )
      .sort((s, a) => s.id.localeCompare(a.id));
  }
  function Sa(e, t, n, o, r) {
    let i = 0.5;
    r === "start" ? (i = 0) : r === "end" && (i = 1);
    let s = [(e.x + e.width * i) * t.zoom + t.x, e.y * t.zoom + t.y - o],
      a = [-100 * i, -100];
    switch (n) {
      case Y.Right:
        ((s = [
          (e.x + e.width) * t.zoom + t.x + o,
          (e.y + e.height * i) * t.zoom + t.y,
        ]),
          (a = [0, -100 * i]));
        break;
      case Y.Bottom:
        ((s[1] = (e.y + e.height) * t.zoom + t.y + o), (a[1] = 0));
        break;
      case Y.Left:
        ((s = [e.x * t.zoom + t.x - o, (e.y + e.height * i) * t.zoom + t.y]),
          (a = [-100, -100 * i]));
        break;
    }
    return `translate(${s[0]}px, ${s[1]}px) translate(${a[0]}%, ${a[1]}%)`;
  }
  var Fh = { left: 0, center: 50, right: 100 },
    Yh = { top: 0, center: 50, bottom: 100 };
  function Na(e, t, n, o = "center", r = "center") {
    return `translate(${e}px, ${t}px) scale(${1 / n}) translate(${-(Fh[o] ?? 50)}%, ${-(Yh[r] ?? 50)}%)`;
  }
  var Ca = 1e3,
    Xh = 10,
    hr = {
      nodeOrigin: [0, 0],
      nodeExtent: _t,
      elevateNodesOnSelect: !0,
      zIndexMode: "basic",
      defaults: {},
    },
    Zh = { ...hr, checkEquality: !0 };
  function pr(e, t) {
    let n = { ...e };
    for (let o in t) t[o] !== void 0 && (n[o] = t[o]);
    return n;
  }
  function Ma(e, t, n) {
    let o = pr(hr, n);
    for (let r of e.values())
      if (r.parentId) mr(r, e, t, o);
      else {
        let i = un(r, o.nodeOrigin),
          s = dt(r.extent) ? r.extent : o.nodeExtent,
          a = lt(i, s, Se(r));
        r.internals.positionAbsolute = a;
      }
  }
  function Wh(e, t) {
    if (!e.handles) return e.measured ? t?.internals.handleBounds : void 0;
    let n = [],
      o = [];
    for (let r of e.handles) {
      let i = {
        id: r.id,
        width: r.width ?? 1,
        height: r.height ?? 1,
        nodeId: e.id,
        x: r.x,
        y: r.y,
        position: r.position,
        type: r.type,
      };
      r.type === "source" ? n.push(i) : r.type === "target" && o.push(i);
    }
    return { source: n, target: o };
  }
  function gr(e) {
    return e === "manual";
  }
  function fo(e, t, n, o = {}) {
    let r = pr(Zh, o),
      i = { i: 0 },
      s = new Map(t),
      a = r?.elevateNodesOnSelect && !gr(r.zIndexMode) ? Ca : 0,
      c = e.length > 0,
      l = !1;
    (t.clear(), n.clear());
    for (let u of e) {
      let d = s.get(u.id);
      if (r.checkEquality && u === d?.internals.userNode) t.set(u.id, d);
      else {
        let f = un(u, r.nodeOrigin),
          h = dt(u.extent) ? u.extent : r.nodeExtent,
          p = lt(f, h, Se(u));
        ((d = {
          ...r.defaults,
          ...u,
          measured: { width: u.measured?.width, height: u.measured?.height },
          internals: {
            positionAbsolute: p,
            handleBounds: Wh(u, d),
            z: Ia(u, a, r.zIndexMode),
            userNode: u,
          },
        }),
          t.set(u.id, d));
      }
      ((d.measured === void 0 ||
        d.measured.width === void 0 ||
        d.measured.height === void 0) &&
        !d.hidden &&
        (c = !1),
        u.parentId && mr(d, t, n, o, i),
        (l ||= u.selected ?? !1));
    }
    return { nodesInitialized: c, hasSelectedNodes: l };
  }
  function qh(e, t) {
    if (!e.parentId) return;
    let n = t.get(e.parentId);
    n ? n.set(e.id, e) : t.set(e.parentId, new Map([[e.id, e]]));
  }
  function mr(e, t, n, o, r) {
    let {
        elevateNodesOnSelect: i,
        nodeOrigin: s,
        nodeExtent: a,
        zIndexMode: c,
      } = pr(hr, o),
      l = e.parentId,
      u = t.get(l);
    if (!u) {
      console.warn(
        `Parent node ${l} not found. Please make sure that parent nodes are in front of their child nodes in the nodes array.`,
      );
      return;
    }
    (qh(e, n),
      r &&
        !u.parentId &&
        u.internals.rootParentIndex === void 0 &&
        c === "auto" &&
        ((u.internals.rootParentIndex = ++r.i),
        (u.internals.z = u.internals.z + r.i * Xh)),
      r &&
        u.internals.rootParentIndex !== void 0 &&
        (r.i = u.internals.rootParentIndex));
    let d = i && !gr(c) ? Ca : 0,
      { x: f, y: h, z: p } = Gh(e, u, s, a, d, c),
      { positionAbsolute: x } = e.internals,
      y = f !== x.x || h !== x.y;
    (y || p !== e.internals.z) &&
      t.set(e.id, {
        ...e,
        internals: {
          ...e.internals,
          positionAbsolute: y ? { x: f, y: h } : x,
          z: p,
        },
      });
  }
  function Ia(e, t, n) {
    let o = me(e.zIndex) ? e.zIndex : 0;
    return gr(n) ? o : o + (e.selected ? t : 0);
  }
  function Gh(e, t, n, o, r, i) {
    let { x: s, y: a } = t.internals.positionAbsolute,
      c = Se(e),
      l = un(e, n),
      u = dt(e.extent) ? lt(l, e.extent, c) : l,
      d = lt({ x: s + u.x, y: a + u.y }, o, c);
    e.extent === "parent" && (d = ha(d, c, t));
    let f = Ia(e, r, i),
      h = t.internals.z ?? 0;
    return { x: d.x, y: d.y, z: h >= f ? h + 1 : f };
  }
  function ho(e, t, n, o = [0, 0]) {
    let r = [],
      i = new Map();
    for (let s of e) {
      let a = t.get(s.parentId);
      if (!a) continue;
      let c = i.get(s.parentId)?.expandedRect ?? St(a),
        l = ir(c, s.rect);
      i.set(s.parentId, { expandedRect: l, parent: a });
    }
    return (
      i.size > 0 &&
        i.forEach(({ expandedRect: s, parent: a }, c) => {
          let l = a.internals.positionAbsolute,
            u = Se(a),
            d = a.origin ?? o,
            f = s.x < l.x ? Math.round(Math.abs(l.x - s.x)) : 0,
            h = s.y < l.y ? Math.round(Math.abs(l.y - s.y)) : 0,
            p = Math.max(u.width, Math.round(s.width)),
            x = Math.max(u.height, Math.round(s.height)),
            y = (p - u.width) * d[0],
            m = (x - u.height) * d[1];
          ((f > 0 || h > 0 || y || m) &&
            (r.push({
              id: c,
              type: "position",
              position: { x: a.position.x - f + y, y: a.position.y - h + m },
            }),
            n.get(c)?.forEach((b) => {
              e.some((g) => g.id === b.id) ||
                r.push({
                  id: b.id,
                  type: "position",
                  position: { x: b.position.x + f, y: b.position.y + h },
                });
            })),
            (u.width < s.width || u.height < s.height || f || h) &&
              r.push({
                id: c,
                type: "dimensions",
                setAttributes: !0,
                dimensions: {
                  width: p + (f ? d[0] * f - y : 0),
                  height: x + (h ? d[1] * h - m : 0),
                },
              }));
        }),
      r
    );
  }
  function ka(e, t, n, o, r, i, s) {
    let a = o?.querySelector(".xyflow__viewport"),
      c = !1;
    if (!a) return { changes: [], updatedInternals: c };
    let l = [],
      u = window.getComputedStyle(a),
      { m22: d } = new window.DOMMatrixReadOnly(u.transform),
      f = [];
    for (let h of e.values()) {
      let p = t.get(h.id);
      if (!p) continue;
      if (p.hidden) {
        (t.set(p.id, {
          ...p,
          internals: { ...p.internals, handleBounds: void 0 },
        }),
          (c = !0));
        continue;
      }
      let x = co(h.nodeElement),
        y = p.measured.width !== x.width || p.measured.height !== x.height;
      if (!!(
        x.width &&
        x.height &&
        (y || !p.internals.handleBounds || h.force)
      )) {
        let b = h.nodeElement.getBoundingClientRect(),
          g = dt(p.extent) ? p.extent : i,
          { positionAbsolute: v } = p.internals;
        if (p.parentId && p.extent === "parent") {
          let _ = t.get(p.parentId);
          _ && (v = ha(v, x, _));
        } else g && (v = lt(v, g, x));
        let N = {
          ...p,
          measured: x,
          internals: {
            ...p.internals,
            positionAbsolute: v,
            handleBounds: {
              source: Us("source", h.nodeElement, b, d, p.id),
              target: Us("target", h.nodeElement, b, d, p.id),
            },
          },
        };
        (t.set(p.id, N),
          p.parentId && mr(N, t, n, { nodeOrigin: r, zIndexMode: s }),
          (c = !0),
          y &&
            (l.push({ id: p.id, type: "dimensions", dimensions: x }),
            p.expandParent &&
              p.parentId &&
              f.push({ id: p.id, parentId: p.parentId, rect: St(N, r) })));
      }
    }
    if (f.length > 0) {
      let h = ho(f, t, n, r);
      l.push(...h);
    }
    return { changes: l, updatedInternals: c };
  }
  async function Oa({
    delta: e,
    panZoom: t,
    transform: n,
    translateExtent: o,
    width: r,
    height: i,
  }) {
    if (!t || (!e.x && !e.y)) return !1;
    let s = await t.setViewportConstrained(
      { x: n[0] + e.x, y: n[1] + e.y, zoom: n[2] },
      [
        [0, 0],
        [r, i],
      ],
      o,
    );
    return !!s && (s.x !== n[0] || s.y !== n[1] || s.k !== n[2]);
  }
  function ra(e, t, n, o, r, i) {
    let s = r,
      a = o.get(s) || new Map();
    (o.set(s, a.set(n, t)), (s = `${r}-${e}`));
    let c = o.get(s) || new Map();
    if ((o.set(s, c.set(n, t)), i)) {
      s = `${r}-${e}-${i}`;
      let l = o.get(s) || new Map();
      o.set(s, l.set(n, t));
    }
  }
  function yr(e, t, n) {
    (e.clear(), t.clear());
    for (let o of n) {
      let {
          source: r,
          target: i,
          sourceHandle: s = null,
          targetHandle: a = null,
        } = o,
        c = {
          edgeId: o.id,
          source: r,
          target: i,
          sourceHandle: s,
          targetHandle: a,
        },
        l = `${r}-${s}--${i}-${a}`,
        u = `${i}-${a}--${r}-${s}`;
      (ra("source", c, u, e, r, s),
        ra("target", c, l, e, i, a),
        t.set(o.id, o));
    }
  }
  function Pa(e, t) {
    if (e === null || t === null) return !1;
    let n = Array.isArray(e) ? e : [e],
      o = Array.isArray(t) ? t : [t];
    if (n.length !== o.length) return !1;
    for (let r = 0; r < n.length; r++)
      if (
        n[r].id !== o[r].id ||
        n[r].type !== o[r].type ||
        !Object.is(n[r].data, o[r].data)
      )
        return !1;
    return !0;
  }
  function Aa(e, t) {
    if (!e.parentId) return !1;
    let n = t.get(e.parentId);
    return n ? (n.selected ? !0 : Aa(n, t)) : !1;
  }
  function ia(e, t, n) {
    let o = e;
    do {
      if (o?.matches?.(t)) return !0;
      if (o === n) return !1;
      o = o?.parentElement;
    } while (o);
    return !1;
  }
  function jh(e, t, n, o) {
    let r = new Map();
    for (let [i, s] of e)
      if (
        (s.selected || s.id === o) &&
        (!s.parentId || !Aa(s, e)) &&
        (s.draggable || (t && typeof s.draggable > "u"))
      ) {
        let a = e.get(i);
        a &&
          r.set(i, {
            id: i,
            position: a.position || { x: 0, y: 0 },
            distance: {
              x: n.x - a.internals.positionAbsolute.x,
              y: n.y - a.internals.positionAbsolute.y,
            },
            extent: a.extent,
            parentId: a.parentId,
            origin: a.origin,
            expandParent: a.expandParent,
            internals: {
              positionAbsolute: a.internals.positionAbsolute || { x: 0, y: 0 },
            },
            measured: {
              width: a.measured.width ?? 0,
              height: a.measured.height ?? 0,
            },
          });
      }
    return r;
  }
  function Wo({ nodeId: e, dragItems: t, nodeLookup: n, dragging: o = !0 }) {
    let r = [];
    for (let [s, a] of t) {
      let c = n.get(s)?.internals.userNode;
      c && r.push({ ...c, position: a.position, dragging: o });
    }
    if (!e) return [r[0], r];
    let i = n.get(e)?.internals.userNode;
    return [
      i
        ? { ...i, position: t.get(e)?.position || i.position, dragging: o }
        : r[0],
      r,
    ];
  }
  function Kh({ dragItems: e, snapGrid: t, x: n, y: o }) {
    let r = e.values().next().value;
    if (!r) return null;
    let i = { x: n - r.distance.x, y: o - r.distance.y },
      s = Nt(i, t);
    return { x: s.x - i.x, y: s.y - i.y };
  }
  function Ta({
    onNodeMouseDown: e,
    getStoreItems: t,
    onDragStart: n,
    onDrag: o,
    onDragStop: r,
  }) {
    let i = { x: null, y: null },
      s = 0,
      a = new Map(),
      c = !1,
      l = { x: 0, y: 0 },
      u = null,
      d = !1,
      f = null,
      h = !1,
      p = !1,
      x = null;
    function y({
      noDragClassName: b,
      handleSelector: g,
      domNode: v,
      isSelectable: N,
      nodeId: _,
      nodeClickDistance: I = 0,
    }) {
      f = ce(v);
      function O({ x: $, y: z }) {
        let {
          nodeLookup: w,
          nodeExtent: E,
          snapGrid: S,
          snapToGrid: M,
          nodeOrigin: T,
          onNodeDrag: A,
          onSelectionDrag: V,
          onError: H,
          updateNodePositions: L,
        } = t();
        i = { x: $, y: z };
        let Z = !1,
          X = a.size > 1,
          q = X && E ? jo(ft(a)) : null,
          J = X && M ? Kh({ dragItems: a, snapGrid: S, x: $, y: z }) : null;
        for (let [G, R] of a) {
          if (!w.has(G)) continue;
          let F = { x: $ - R.distance.x, y: z - R.distance.y };
          M &&
            (F = J
              ? { x: Math.round(F.x + J.x), y: Math.round(F.y + J.y) }
              : Nt(F, S));
          let Q = null;
          if (X && E && !R.extent && q) {
            let { positionAbsolute: j } = R.internals,
              ee = j.x - q.x + E[0][0],
              te = j.x + R.measured.width - q.x2 + E[1][0],
              re = j.y - q.y + E[0][1],
              ue = j.y + R.measured.height - q.y2 + E[1][1];
            Q = [
              [ee, re],
              [te, ue],
            ];
          }
          let { position: U, positionAbsolute: W } = rr({
            nodeId: G,
            nextPosition: F,
            nodeLookup: w,
            nodeExtent: Q || E,
            nodeOrigin: T,
            onError: H,
          });
          ((Z = Z || R.position.x !== U.x || R.position.y !== U.y),
            (R.position = U),
            (R.internals.positionAbsolute = W));
        }
        if (((p = p || Z), !!Z && (L(a, !0), x && (o || A || (!_ && V))))) {
          let [G, R] = Wo({ nodeId: _, dragItems: a, nodeLookup: w });
          (o?.(x, a, G, R), A?.(x, G, R), _ || V?.(x, R));
        }
      }
      async function P() {
        if (!u) return;
        let {
          transform: $,
          panBy: z,
          autoPanSpeed: w,
          autoPanOnNodeDrag: E,
        } = t();
        if (!E) {
          ((c = !1), cancelAnimationFrame(s));
          return;
        }
        let [S, M] = ro(l, u, w);
        ((S !== 0 || M !== 0) &&
          ((i.x = (i.x ?? 0) - S / $[2]),
          (i.y = (i.y ?? 0) - M / $[2]),
          (await z({ x: S, y: M })) && O(i)),
          (s = requestAnimationFrame(P)));
      }
      function B($) {
        let {
          nodeLookup: z,
          multiSelectionActive: w,
          nodesDraggable: E,
          transform: S,
          snapGrid: M,
          snapToGrid: T,
          selectNodesOnDrag: A,
          onNodeDragStart: V,
          onSelectionDragStart: H,
          unselectNodesAndEdges: L,
        } = t();
        ((d = !0),
          (!A || !N) && !w && _ && (z.get(_)?.selected || L()),
          N && A && _ && e?.(_));
        let Z = cn($.sourceEvent, {
          transform: S,
          snapGrid: M,
          snapToGrid: T,
          containerBounds: u,
        });
        if (
          ((i = Z), (a = jh(z, E, Z, _)), a.size > 0 && (n || V || (!_ && H)))
        ) {
          let [X, q] = Wo({ nodeId: _, dragItems: a, nodeLookup: z });
          (n?.($.sourceEvent, a, X, q),
            V?.($.sourceEvent, X, q),
            _ || H?.($.sourceEvent, q));
        }
      }
      let D = Pn()
        .clickDistance(I)
        .on("start", ($) => {
          let {
            domNode: z,
            nodeDragThreshold: w,
            transform: E,
            snapGrid: S,
            snapToGrid: M,
          } = t();
          ((u = z?.getBoundingClientRect() || null),
            (h = !1),
            (p = !1),
            (x = $.sourceEvent),
            w === 0 && B($),
            (i = cn($.sourceEvent, {
              transform: E,
              snapGrid: S,
              snapToGrid: M,
              containerBounds: u,
            })),
            (l = ye($.sourceEvent, u)));
        })
        .on("drag", ($) => {
          let {
              autoPanOnNodeDrag: z,
              transform: w,
              snapGrid: E,
              snapToGrid: S,
              nodeDragThreshold: M,
              nodeLookup: T,
            } = t(),
            A = cn($.sourceEvent, {
              transform: w,
              snapGrid: E,
              snapToGrid: S,
              containerBounds: u,
            });
          if (
            ((x = $.sourceEvent),
            (($.sourceEvent.type === "touchmove" &&
              $.sourceEvent.touches.length > 1) ||
              (_ && !T.has(_))) &&
              (h = !0),
            !h)
          ) {
            if ((!c && z && d && ((c = !0), P()), !d)) {
              let V = ye($.sourceEvent, u),
                H = V.x - l.x,
                L = V.y - l.y;
              Math.sqrt(H * H + L * L) > M && B($);
            }
            (i.x !== A.xSnapped || i.y !== A.ySnapped) &&
              a &&
              d &&
              ((l = ye($.sourceEvent, u)), O(A));
          }
        })
        .on("end", ($) => {
          if (!d || h) {
            h && a.size > 0 && t().updateNodePositions(a, !1);
            return;
          }
          if (((c = !1), (d = !1), cancelAnimationFrame(s), a.size > 0)) {
            let {
              nodeLookup: z,
              updateNodePositions: w,
              onNodeDragStop: E,
              onSelectionDragStop: S,
            } = t();
            if ((p && (w(a, !1), (p = !1)), r || E || (!_ && S))) {
              let [M, T] = Wo({
                nodeId: _,
                dragItems: a,
                nodeLookup: z,
                dragging: !1,
              });
              (r?.($.sourceEvent, a, M, T),
                E?.($.sourceEvent, M, T),
                _ || S?.($.sourceEvent, T));
            }
          }
        })
        .filter(($) => {
          let z = $.target;
          return !$.button && (!b || !ia(z, `.${b}`, v)) && (!g || ia(z, g, v));
        });
      f.call(D);
    }
    function m() {
      f?.on(".drag", null);
    }
    return { update: y, destroy: m };
  }
  function Uh(e, t, n) {
    let o = [],
      r = { x: e.x - n, y: e.y - n, width: n * 2, height: n * 2 };
    for (let i of t.values()) dn(r, St(i)) > 0 && o.push(i);
    return o;
  }
  var Qh = 250;
  function Jh(e, t, n, o) {
    let r = [],
      i = 1 / 0,
      s = Uh(e, n, t + Qh);
    for (let a of s) {
      let c = [
        ...(a.internals.handleBounds?.source ?? []),
        ...(a.internals.handleBounds?.target ?? []),
      ];
      for (let l of c) {
        if (o.nodeId === l.nodeId && o.type === l.type && o.id === l.id)
          continue;
        let { x: u, y: d } = qe(a, l, l.position, !0),
          f = Math.sqrt(Math.pow(u - e.x, 2) + Math.pow(d - e.y, 2));
        f > t ||
          (f < i
            ? ((r = [{ ...l, x: u, y: d }]), (i = f))
            : f === i && r.push({ ...l, x: u, y: d }));
      }
    }
    if (!r.length) return null;
    if (r.length > 1) {
      let a = o.type === "source" ? "target" : "source";
      return r.find((c) => c.type === a) ?? r[0];
    }
    return r[0];
  }
  function Da(e, t, n, o, r, i = !1) {
    let s = o.get(e);
    if (!s) return null;
    let a =
        r === "strict"
          ? s.internals.handleBounds?.[t]
          : [
              ...(s.internals.handleBounds?.source ?? []),
              ...(s.internals.handleBounds?.target ?? []),
            ],
      c = (n ? a?.find((l) => l.id === n) : a?.[0]) ?? null;
    return c && i ? { ...c, ...qe(s, c, c.position, !0) } : c;
  }
  function za(e, t) {
    return (
      e ||
      (t?.classList.contains("target")
        ? "target"
        : t?.classList.contains("source")
          ? "source"
          : null)
    );
  }
  function ep(e, t) {
    let n = null;
    return (t ? (n = !0) : e && !t && (n = !1), n);
  }
  var Ra = () => !0;
  function tp(
    e,
    {
      connectionMode: t,
      connectionRadius: n,
      handleId: o,
      nodeId: r,
      edgeUpdaterType: i,
      isTarget: s,
      domNode: a,
      nodeLookup: c,
      lib: l,
      autoPanOnConnect: u,
      flowId: d,
      panBy: f,
      cancelConnection: h,
      onConnectStart: p,
      onConnect: x,
      onConnectEnd: y,
      isValidConnection: m = Ra,
      onReconnectEnd: b,
      updateConnection: g,
      getTransform: v,
      getFromHandle: N,
      autoPanSpeed: _,
      dragThreshold: I = 1,
      handleDomNode: O,
    },
  ) {
    let P = ur(e.target),
      B = 0,
      D,
      { x: $, y: z } = ye(e),
      w = za(i, O),
      E = a?.getBoundingClientRect(),
      S = !1;
    if (!E || !w) return;
    let M = Da(r, w, o, c, t);
    if (!M) return;
    let T = ye(e, E),
      A = !1,
      V = null,
      H = !1,
      L = null;
    function Z() {
      if (!u || !E) return;
      let [U, W] = ro(T, E, _);
      (f({ x: U, y: W }), (B = requestAnimationFrame(Z)));
    }
    let X = { ...M, nodeId: r, type: w, position: M.position },
      q = c.get(r),
      G = {
        inProgress: !0,
        isValid: null,
        from: qe(q, X, Y.Left, !0),
        fromHandle: X,
        fromPosition: X.position,
        fromNode: q,
        to: T,
        toHandle: null,
        toPosition: js[X.position],
        toNode: null,
        pointer: T,
      };
    function R() {
      ((S = !0), g(G), p?.(e, { nodeId: r, handleId: o, handleType: w }));
    }
    I === 0 && R();
    function F(U) {
      if (!S) {
        let { x: ue, y: Pe } = ye(U),
          Ne = ue - $,
          Ce = Pe - z;
        if (!(Ne * Ne + Ce * Ce > I * I)) return;
        R();
      }
      if (!N() || !X) {
        Q(U);
        return;
      }
      let W = v();
      ((T = ye(U, E)),
        (D = Jh(Ct(T, W, !1, [1, 1]), n, c, X)),
        A || (Z(), (A = !0)));
      let j = La(U, {
        handle: D,
        connectionMode: t,
        fromNodeId: r,
        fromHandleId: o,
        fromType: s ? "target" : "source",
        isValidConnection: m,
        doc: P,
        lib: l,
        flowId: d,
        nodeLookup: c,
      });
      ((L = j.handleDomNode), (V = j.connection), (H = ep(!!D, j.isValid)));
      let ee = c.get(r),
        te = ee ? qe(ee, X, Y.Left, !0) : G.from,
        re = {
          ...G,
          from: te,
          isValid: H,
          to: j.toHandle && H ? ut({ x: j.toHandle.x, y: j.toHandle.y }, W) : T,
          toHandle: j.toHandle,
          toPosition: H && j.toHandle ? j.toHandle.position : js[X.position],
          toNode: j.toHandle ? c.get(j.toHandle.nodeId) : null,
          pointer: T,
        };
      (g(re), (G = re));
    }
    function Q(U) {
      if (!("touches" in U && U.touches.length > 0)) {
        if (S) {
          (D || L) && V && H && x?.(V);
          let { inProgress: W, ...j } = G,
            ee = { ...j, toPosition: G.toHandle ? G.toPosition : null };
          (y?.(U, ee), i && b?.(U, ee));
        }
        (h(),
          cancelAnimationFrame(B),
          (A = !1),
          (H = !1),
          (V = null),
          (L = null),
          P.removeEventListener("mousemove", F),
          P.removeEventListener("mouseup", Q),
          P.removeEventListener("touchmove", F),
          P.removeEventListener("touchend", Q));
      }
    }
    (P.addEventListener("mousemove", F),
      P.addEventListener("mouseup", Q),
      P.addEventListener("touchmove", F),
      P.addEventListener("touchend", Q));
  }
  function La(
    e,
    {
      handle: t,
      connectionMode: n,
      fromNodeId: o,
      fromHandleId: r,
      fromType: i,
      doc: s,
      lib: a,
      flowId: c,
      isValidConnection: l = Ra,
      nodeLookup: u,
    },
  ) {
    let d = i === "target",
      f = t
        ? s.querySelector(
            `.${a}-flow__handle[data-id="${c}-${t?.nodeId}-${t?.id}-${t?.type}"]`,
          )
        : null,
      { x: h, y: p } = ye(e),
      x = s.elementFromPoint(h, p),
      y = x?.classList.contains(`${a}-flow__handle`) ? x : f,
      m = { handleDomNode: y, isValid: !1, connection: null, toHandle: null };
    if (y) {
      let b = za(void 0, y),
        g = y.getAttribute("data-nodeid"),
        v = y.getAttribute("data-handleid"),
        N = y.classList.contains("connectable"),
        _ = y.classList.contains("connectableend");
      if (!g || !b) return m;
      let I = {
        source: d ? g : o,
        sourceHandle: d ? v : r,
        target: d ? o : g,
        targetHandle: d ? r : v,
      };
      m.connection = I;
      let P =
        N &&
        _ &&
        (n === He.Strict
          ? (d && b === "source") || (!d && b === "target")
          : g !== o || v !== r);
      ((m.isValid = P && l(I)), (m.toHandle = Da(g, b, v, u, n, !0)));
    }
    return m;
  }
  var po = { onPointerDown: tp, isValid: La };
  function $a({ domNode: e, panZoom: t, getTransform: n, getViewScale: o }) {
    let r = ce(e);
    function i({
      translateExtent: a,
      width: c,
      height: l,
      zoomStep: u = 1,
      pannable: d = !0,
      zoomable: f = !0,
      inversePan: h = !1,
    }) {
      let p = (g) => {
          if (g.sourceEvent.type !== "wheel" || !t) return;
          let v = n(),
            N = g.sourceEvent.ctrlKey && It() ? 10 : 1,
            _ =
              -g.sourceEvent.deltaY *
              (g.sourceEvent.deltaMode === 1
                ? 0.05
                : g.sourceEvent.deltaMode
                  ? 1
                  : 0.002) *
              u,
            I = v[2] * Math.pow(2, _ * N);
          t.scaleTo(I);
        },
        x = [0, 0],
        y = (g) => {
          (g.sourceEvent.type === "mousedown" ||
            g.sourceEvent.type === "touchstart") &&
            (x = [
              g.sourceEvent.clientX ?? g.sourceEvent.touches[0].clientX,
              g.sourceEvent.clientY ?? g.sourceEvent.touches[0].clientY,
            ]);
        },
        m = (g) => {
          let v = n();
          if (
            (g.sourceEvent.type !== "mousemove" &&
              g.sourceEvent.type !== "touchmove") ||
            !t
          )
            return;
          let N = [
              g.sourceEvent.clientX ?? g.sourceEvent.touches[0].clientX,
              g.sourceEvent.clientY ?? g.sourceEvent.touches[0].clientY,
            ],
            _ = [N[0] - x[0], N[1] - x[1]];
          x = N;
          let I = o() * Math.max(v[2], Math.log(v[2])) * (h ? -1 : 1),
            O = { x: v[0] - _[0] * I, y: v[1] - _[1] * I },
            P = [
              [0, 0],
              [c, l],
            ];
          t.setViewportConstrained({ x: O.x, y: O.y, zoom: v[2] }, P, a);
        },
        b = Qn()
          .on("start", y)
          .on("zoom", d ? m : null)
          .on("zoom.wheel", f ? p : null);
      r.call(b, {});
    }
    function s() {
      r.on("zoom", null);
    }
    return { update: i, destroy: s, pointer: de };
  }
  var go = (e) => ({ x: e.x, y: e.y, zoom: e.k }),
    qo = ({ x: e, y: t, zoom: n }) => at.translate(e, t).scale(n),
    bt = (e, t) => e.target.closest(`.${t}`),
    Ha = (e, t) => t === 2 && Array.isArray(e) && e.includes(2),
    np = (e) => ((e *= 2) <= 1 ? e * e * e : (e -= 2) * e * e + 2) / 2,
    Go = (e, t = 0, n = np, o = () => {}) => {
      let r = typeof t == "number" && t > 0;
      return (
        r || o(),
        r ? e.transition().duration(t).ease(n).on("end", o) : e
      );
    },
    Ba = (e) => {
      let t = e.ctrlKey && It() ? 10 : 1;
      return (
        -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * t
      );
    };
  function op({
    zoomPanValues: e,
    noWheelClassName: t,
    d3Selection: n,
    d3Zoom: o,
    panOnScrollMode: r,
    panOnScrollSpeed: i,
    zoomOnPinch: s,
    onPanZoomStart: a,
    onPanZoom: c,
    onPanZoomEnd: l,
  }) {
    return (u) => {
      if (bt(u, t)) return (u.ctrlKey && u.preventDefault(), !1);
      (u.preventDefault(), u.stopImmediatePropagation());
      let d = n.property("__zoom").k || 1;
      if (u.ctrlKey && s) {
        let y = de(u),
          m = Ba(u),
          b = d * Math.pow(2, m);
        o.scaleTo(n, b, y, u);
        return;
      }
      let f = u.deltaMode === 1 ? 20 : 1,
        h = r === Ie.Vertical ? 0 : u.deltaX * f,
        p = r === Ie.Horizontal ? 0 : u.deltaY * f;
      (!It() &&
        u.shiftKey &&
        r !== Ie.Vertical &&
        ((h = u.deltaY * f), (p = 0)),
        o.translateBy(n, -(h / d) * i, -(p / d) * i, { internal: !0 }));
      let x = go(n.property("__zoom"));
      (clearTimeout(e.panScrollTimeout),
        e.isPanScrolling ? c?.(u, x) : ((e.isPanScrolling = !0), a?.(u, x)),
        (e.panScrollTimeout = setTimeout(() => {
          (l?.(u, x), (e.isPanScrolling = !1));
        }, 150)));
    };
  }
  function rp({ noWheelClassName: e, preventScrolling: t, d3ZoomHandler: n }) {
    return function (o, r) {
      let i = o.type === "wheel",
        s = !t && i && !o.ctrlKey,
        a = bt(o, e);
      if ((o.ctrlKey && i && a && o.preventDefault(), s || a)) return null;
      (o.preventDefault(), n.call(this, o, r));
    };
  }
  function ip({ zoomPanValues: e, onDraggingChange: t, onPanZoomStart: n }) {
    return (o) => {
      if (o.sourceEvent?.internal) return;
      let r = go(o.transform);
      ((e.mouseButton = o.sourceEvent?.button || 0),
        (e.isZoomingOrPanning = !0),
        (e.prevViewport = r),
        o.sourceEvent?.type === "mousedown" && t(!0),
        n && n?.(o.sourceEvent, r));
    };
  }
  function sp({
    zoomPanValues: e,
    panOnDrag: t,
    onPaneContextMenu: n,
    onTransformChange: o,
    onPanZoom: r,
  }) {
    return (i) => {
      ((e.usedRightMouseButton = !!(n && Ha(t, e.mouseButton ?? 0))),
        i.sourceEvent?.sync || o([i.transform.x, i.transform.y, i.transform.k]),
        r && !i.sourceEvent?.internal && r?.(i.sourceEvent, go(i.transform)));
    };
  }
  function ap({
    zoomPanValues: e,
    panOnDrag: t,
    panOnScroll: n,
    onDraggingChange: o,
    onPanZoomEnd: r,
    onPaneContextMenu: i,
  }) {
    return (s) => {
      if (
        !s.sourceEvent?.internal &&
        ((e.isZoomingOrPanning = !1),
        i &&
          Ha(t, e.mouseButton ?? 0) &&
          !e.usedRightMouseButton &&
          s.sourceEvent &&
          i(s.sourceEvent),
        (e.usedRightMouseButton = !1),
        o(!1),
        r)
      ) {
        let a = go(s.transform);
        ((e.prevViewport = a),
          clearTimeout(e.timerId),
          (e.timerId = setTimeout(
            () => {
              r?.(s.sourceEvent, a);
            },
            n ? 150 : 0,
          )));
      }
    };
  }
  function cp({
    zoomActivationKeyPressed: e,
    zoomOnScroll: t,
    zoomOnPinch: n,
    panOnDrag: o,
    panOnScroll: r,
    zoomOnDoubleClick: i,
    userSelectionActive: s,
    noWheelClassName: a,
    noPanClassName: c,
    lib: l,
    connectionInProgress: u,
  }) {
    return (d) => {
      let f = e || t,
        h = n && d.ctrlKey,
        p = d.type === "wheel";
      if (
        d.button === 1 &&
        d.type === "mousedown" &&
        (bt(d, `${l}-flow__node`) || bt(d, `${l}-flow__edge`))
      )
        return !0;
      if (
        (!o && !f && !r && !i && !n) ||
        s ||
        (u && !p) ||
        (bt(d, a) && p) ||
        (bt(d, c) && (!p || (r && p && !e))) ||
        (!n && d.ctrlKey && p)
      )
        return !1;
      if (!n && d.type === "touchstart" && d.touches?.length > 1)
        return (d.preventDefault(), !1);
      if (
        (!f && !r && !h && p) ||
        (!o && (d.type === "mousedown" || d.type === "touchstart")) ||
        (Array.isArray(o) && !o.includes(d.button) && d.type === "mousedown")
      )
        return !1;
      let x =
        (Array.isArray(o) && o.includes(d.button)) ||
        !d.button ||
        d.button <= 1;
      return (!d.ctrlKey || p) && x;
    };
  }
  function Va({
    domNode: e,
    minZoom: t,
    maxZoom: n,
    translateExtent: o,
    viewport: r,
    onPanZoom: i,
    onPanZoomStart: s,
    onPanZoomEnd: a,
    onDraggingChange: c,
  }) {
    let l = {
        isZoomingOrPanning: !1,
        usedRightMouseButton: !1,
        prevViewport: {},
        mouseButton: 0,
        timerId: void 0,
        panScrollTimeout: void 0,
        isPanScrolling: !1,
      },
      u = e.getBoundingClientRect(),
      d = [
        [0, 0],
        [u.width, u.height],
      ];
    (typeof ResizeObserver < "u"
      ? new ResizeObserver((z) => {
          let w = z[0];
          w &&
            (d = [
              [0, 0],
              [w.contentRect.width, w.contentRect.height],
            ]);
        })
      : null
    )?.observe(e);
    let h = Qn()
        .extent(() => d)
        .scaleExtent([t, n])
        .translateExtent(o),
      p = ce(e).call(h);
    v(
      { x: r.x, y: r.y, zoom: Et(r.zoom, t, n) },
      [
        [0, 0],
        [u.width, u.height],
      ],
      o,
    );
    let x = p.on("wheel.zoom"),
      y = p.on("dblclick.zoom");
    h.wheelDelta(Ba);
    async function m(z, w) {
      return p
        ? new Promise((E) => {
            h?.interpolate(w?.interpolate === "linear" ? Le : rt).transform(
              Go(p, w?.duration, w?.ease, () => E(!0)),
              z,
            );
          })
        : !1;
    }
    function b({
      noWheelClassName: z,
      noPanClassName: w,
      onPaneContextMenu: E,
      userSelectionActive: S,
      panOnScroll: M,
      panOnDrag: T,
      panOnScrollMode: A,
      panOnScrollSpeed: V,
      preventScrolling: H,
      zoomOnPinch: L,
      zoomOnScroll: Z,
      zoomOnDoubleClick: X,
      zoomActivationKeyPressed: q,
      lib: J,
      onTransformChange: G,
      connectionInProgress: R,
      paneClickDistance: F,
      selectionOnDrag: Q,
    }) {
      S && !l.isZoomingOrPanning && g();
      let U = M && !q && !S;
      h.clickDistance(Q ? 1 / 0 : !me(F) || F < 0 ? 0 : F);
      let W = U
        ? op({
            zoomPanValues: l,
            noWheelClassName: z,
            d3Selection: p,
            d3Zoom: h,
            panOnScrollMode: A,
            panOnScrollSpeed: V,
            zoomOnPinch: L,
            onPanZoomStart: s,
            onPanZoom: i,
            onPanZoomEnd: a,
          })
        : rp({ noWheelClassName: z, preventScrolling: H, d3ZoomHandler: x });
      p.on("wheel.zoom", W, { passive: !1 });
      let j = ip({ zoomPanValues: l, onDraggingChange: c, onPanZoomStart: s });
      h.on("start", j);
      let ee = sp({
        zoomPanValues: l,
        panOnDrag: T,
        onPaneContextMenu: !!E,
        onPanZoom: i,
        onTransformChange: G,
      });
      h.on("zoom", ee);
      let te = ap({
        zoomPanValues: l,
        panOnDrag: T,
        panOnScroll: M,
        onPaneContextMenu: E,
        onPanZoomEnd: a,
        onDraggingChange: c,
      });
      h.on("end", te);
      let re = cp({
        zoomActivationKeyPressed: q,
        panOnDrag: T,
        zoomOnScroll: Z,
        panOnScroll: M,
        zoomOnDoubleClick: X,
        zoomOnPinch: L,
        userSelectionActive: S,
        noPanClassName: w,
        noWheelClassName: z,
        lib: J,
        connectionInProgress: R,
      });
      (h.filter(re),
        X ? p.on("dblclick.zoom", y) : p.on("dblclick.zoom", null));
    }
    function g() {
      h.on("zoom", null);
    }
    async function v(z, w, E) {
      let S = qo(z),
        M = h?.constrain()(S, w, E);
      return (M && (await m(M)), M);
    }
    async function N(z, w) {
      let E = qo(z);
      return (await m(E, w), E);
    }
    function _(z) {
      if (p) {
        let w = qo(z),
          E = p.property("__zoom");
        (E.k !== z.zoom || E.x !== z.x || E.y !== z.y) &&
          h?.transform(p, w, null, { sync: !0 });
      }
    }
    function I() {
      let z = p ? an(p.node()) : { x: 0, y: 0, k: 1 };
      return { x: z.x, y: z.y, zoom: z.k };
    }
    async function O(z, w) {
      return p
        ? new Promise((E) => {
            h?.interpolate(w?.interpolate === "linear" ? Le : rt).scaleTo(
              Go(p, w?.duration, w?.ease, () => E(!0)),
              z,
            );
          })
        : !1;
    }
    async function P(z, w) {
      return p
        ? new Promise((E) => {
            h?.interpolate(w?.interpolate === "linear" ? Le : rt).scaleBy(
              Go(p, w?.duration, w?.ease, () => E(!0)),
              z,
            );
          })
        : !1;
    }
    function B(z) {
      h?.scaleExtent(z);
    }
    function D(z) {
      h?.translateExtent(z);
    }
    function $(z) {
      let w = !me(z) || z < 0 ? 0 : z;
      h?.clickDistance(w);
    }
    return {
      update: b,
      destroy: g,
      setViewport: N,
      setViewportConstrained: v,
      getViewport: I,
      scaleTo: O,
      scaleBy: P,
      setScaleExtent: B,
      setTranslateExtent: D,
      syncViewport: _,
      setClickDistance: $,
    };
  }
  var ke;
  (function (e) {
    ((e.Line = "line"), (e.Handle = "handle"));
  })(ke || (ke = {}));
  var Fa = ["top-left", "top-right", "bottom-left", "bottom-right"],
    Ya = ["top", "right", "bottom", "left"];
  function lp({
    width: e,
    prevWidth: t,
    height: n,
    prevHeight: o,
    affectsX: r,
    affectsY: i,
  }) {
    let s = e - t,
      a = n - o,
      c = [s > 0 ? 1 : s < 0 ? -1 : 0, a > 0 ? 1 : a < 0 ? -1 : 0];
    return (s && r && (c[0] = c[0] * -1), a && i && (c[1] = c[1] * -1), c);
  }
  function sa(e) {
    let t = e.includes("right") || e.includes("left"),
      n = e.includes("bottom") || e.includes("top"),
      o = e.includes("left"),
      r = e.includes("top");
    return { isHorizontal: t, isVertical: n, affectsX: o, affectsY: r };
  }
  function Xe(e, t) {
    return Math.max(0, t - e);
  }
  function Ze(e, t) {
    return Math.max(0, e - t);
  }
  function eo(e, t, n) {
    return Math.max(0, t - e, e - n);
  }
  function aa(e, t) {
    return e ? !t : t;
  }
  function up(e, t, n, o, r, i, s, a) {
    let { affectsX: c, affectsY: l } = t,
      { isHorizontal: u, isVertical: d } = t,
      f = u && d,
      { xSnapped: h, ySnapped: p } = n,
      { minWidth: x, maxWidth: y, minHeight: m, maxHeight: b } = o,
      { x: g, y: v, width: N, height: _, aspectRatio: I } = e,
      O = Math.floor(u ? h - e.pointerX : 0),
      P = Math.floor(d ? p - e.pointerY : 0),
      B = N + (c ? -O : O),
      D = _ + (l ? -P : P),
      $ = -i[0] * N,
      z = -i[1] * _,
      w = eo(B, x, y),
      E = eo(D, m, b);
    if (s) {
      let T = 0,
        A = 0;
      (c && O < 0
        ? (T = Xe(g + O + $, s[0][0]))
        : !c && O > 0 && (T = Ze(g + B + $, s[1][0])),
        l && P < 0
          ? (A = Xe(v + P + z, s[0][1]))
          : !l && P > 0 && (A = Ze(v + D + z, s[1][1])),
        (w = Math.max(w, T)),
        (E = Math.max(E, A)));
    }
    if (a) {
      let T = 0,
        A = 0;
      (c && O > 0
        ? (T = Ze(g + O, a[0][0]))
        : !c && O < 0 && (T = Xe(g + B, a[1][0])),
        l && P > 0
          ? (A = Ze(v + P, a[0][1]))
          : !l && P < 0 && (A = Xe(v + D, a[1][1])),
        (w = Math.max(w, T)),
        (E = Math.max(E, A)));
    }
    if (r) {
      if (u) {
        let T = eo(B / I, m, b) * I;
        if (((w = Math.max(w, T)), s)) {
          let A = 0;
          ((!c && !l) || (c && !l && f)
            ? (A = Ze(v + z + B / I, s[1][1]) * I)
            : (A = Xe(v + z + (c ? O : -O) / I, s[0][1]) * I),
            (w = Math.max(w, A)));
        }
        if (a) {
          let A = 0;
          ((!c && !l) || (c && !l && f)
            ? (A = Xe(v + B / I, a[1][1]) * I)
            : (A = Ze(v + (c ? O : -O) / I, a[0][1]) * I),
            (w = Math.max(w, A)));
        }
      }
      if (d) {
        let T = eo(D * I, x, y) / I;
        if (((E = Math.max(E, T)), s)) {
          let A = 0;
          ((!c && !l) || (l && !c && f)
            ? (A = Ze(g + D * I + $, s[1][0]) / I)
            : (A = Xe(g + (l ? P : -P) * I + $, s[0][0]) / I),
            (E = Math.max(E, A)));
        }
        if (a) {
          let A = 0;
          ((!c && !l) || (l && !c && f)
            ? (A = Xe(g + D * I, a[1][0]) / I)
            : (A = Ze(g + (l ? P : -P) * I, a[0][0]) / I),
            (E = Math.max(E, A)));
        }
      }
    }
    ((P = P + (P < 0 ? E : -E)),
      (O = O + (O < 0 ? w : -w)),
      r &&
        (f
          ? B > D * I
            ? (P = (aa(c, l) ? -O : O) / I)
            : (O = (aa(c, l) ? -P : P) * I)
          : u
            ? ((P = O / I), (l = c))
            : ((O = P * I), (c = l))));
    let S = c ? g + O : g,
      M = l ? v + P : v;
    return {
      width: N + (c ? -O : O),
      height: _ + (l ? -P : P),
      x: i[0] * O * (c ? -1 : 1) + S,
      y: i[1] * P * (l ? -1 : 1) + M,
    };
  }
  var Xa = { width: 0, height: 0, x: 0, y: 0 },
    dp = { ...Xa, pointerX: 0, pointerY: 0, aspectRatio: 1 };
  function fp(e, t, n) {
    let o = t.position.x + e.position.x,
      r = t.position.y + e.position.y,
      i = e.measured.width ?? 0,
      s = e.measured.height ?? 0,
      a = n[0] * i,
      c = n[1] * s;
    return [
      [o - a, r - c],
      [o + i - a, r + s - c],
    ];
  }
  function Za({
    domNode: e,
    nodeId: t,
    getStoreItems: n,
    onChange: o,
    onEnd: r,
  }) {
    let i = ce(e),
      s = {
        controlDirection: sa("bottom-right"),
        boundaries: {
          minWidth: 0,
          minHeight: 0,
          maxWidth: Number.MAX_VALUE,
          maxHeight: Number.MAX_VALUE,
        },
        resizeDirection: void 0,
        keepAspectRatio: !1,
      };
    function a({
      controlPosition: l,
      boundaries: u,
      keepAspectRatio: d,
      resizeDirection: f,
      onResizeStart: h,
      onResize: p,
      onResizeEnd: x,
      shouldResize: y,
    }) {
      let m = { ...Xa },
        b = { ...dp };
      s = {
        boundaries: u,
        resizeDirection: f,
        keepAspectRatio: d,
        controlDirection: sa(l),
      };
      let g,
        v = null,
        N = [],
        _,
        I,
        O,
        P = !1,
        B = Pn()
          .on("start", (D) => {
            let {
              nodeLookup: $,
              transform: z,
              snapGrid: w,
              snapToGrid: E,
              nodeOrigin: S,
              paneDomNode: M,
            } = n();
            if (((g = $.get(t)), !g)) return;
            v = M?.getBoundingClientRect() ?? null;
            let { xSnapped: T, ySnapped: A } = cn(D.sourceEvent, {
              transform: z,
              snapGrid: w,
              snapToGrid: E,
              containerBounds: v,
            });
            ((m = {
              width: g.measured.width ?? 0,
              height: g.measured.height ?? 0,
              x: g.position.x ?? 0,
              y: g.position.y ?? 0,
            }),
              (b = {
                ...m,
                pointerX: T,
                pointerY: A,
                aspectRatio: m.width / m.height,
              }),
              (_ = void 0),
              (I = dt(g.extent) ? g.extent : void 0),
              g.parentId &&
                (g.extent === "parent" || g.expandParent) &&
                (_ = $.get(g.parentId)),
              _ &&
                g.extent === "parent" &&
                (I = [
                  [0, 0],
                  [_.measured.width, _.measured.height],
                ]),
              (N = []),
              (O = void 0));
            for (let [V, H] of $)
              if (
                H.parentId === t &&
                (N.push({
                  id: V,
                  position: { ...H.position },
                  extent: H.extent,
                }),
                H.extent === "parent" || H.expandParent)
              ) {
                let L = fp(H, g, H.origin ?? S);
                O
                  ? (O = [
                      [Math.min(L[0][0], O[0][0]), Math.min(L[0][1], O[0][1])],
                      [Math.max(L[1][0], O[1][0]), Math.max(L[1][1], O[1][1])],
                    ])
                  : (O = L);
              }
            h?.(D, { ...m });
          })
          .on("drag", (D) => {
            let {
                transform: $,
                snapGrid: z,
                snapToGrid: w,
                nodeOrigin: E,
              } = n(),
              S = cn(D.sourceEvent, {
                transform: $,
                snapGrid: z,
                snapToGrid: w,
                containerBounds: v,
              }),
              M = [];
            if (!g) return;
            let { x: T, y: A, width: V, height: H } = m,
              L = {},
              Z = g.origin ?? E,
              {
                width: X,
                height: q,
                x: J,
                y: G,
              } = up(
                b,
                s.controlDirection,
                S,
                s.boundaries,
                s.keepAspectRatio,
                Z,
                I,
                O,
              ),
              R = X !== V,
              F = q !== H,
              Q = J !== T && R,
              U = G !== A && F;
            if (!Q && !U && !R && !F) return;
            if (
              (Q || U || Z[0] === 1 || Z[1] === 1) &&
              ((L.x = Q ? J : m.x),
              (L.y = U ? G : m.y),
              (m.x = L.x),
              (m.y = L.y),
              N.length > 0)
            ) {
              let te = J - T,
                re = G - A;
              for (let ue of N)
                ((ue.position = {
                  x: ue.position.x - te + Z[0] * (X - V),
                  y: ue.position.y - re + Z[1] * (q - H),
                }),
                  M.push(ue));
            }
            if (
              ((R || F) &&
                ((L.width =
                  R &&
                  (!s.resizeDirection || s.resizeDirection === "horizontal")
                    ? X
                    : m.width),
                (L.height =
                  F && (!s.resizeDirection || s.resizeDirection === "vertical")
                    ? q
                    : m.height),
                (m.width = L.width),
                (m.height = L.height)),
              _ && g.expandParent)
            ) {
              let te = Z[0] * (L.width ?? 0);
              L.x && L.x < te && ((m.x = te), (b.x = b.x - (L.x - te)));
              let re = Z[1] * (L.height ?? 0);
              L.y && L.y < re && ((m.y = re), (b.y = b.y - (L.y - re)));
            }
            let W = lp({
                width: m.width,
                prevWidth: V,
                height: m.height,
                prevHeight: H,
                affectsX: s.controlDirection.affectsX,
                affectsY: s.controlDirection.affectsY,
              }),
              j = { ...m, direction: W };
            y?.(D, j) !== !1 && ((P = !0), p?.(D, j), o(L, M));
          })
          .on("end", (D) => {
            P && (x?.(D, { ...m }), r?.({ ...m }), (P = !1));
          });
      i.call(B);
    }
    function c() {
      i.on(".drag", null);
    }
    return { update: a, destroy: c };
  }
  var rc = Lt($t(), 1),
    ic = Lt(Ja(), 1);
  var tc = {},
    ec = (e) => {
      let t,
        n = new Set(),
        o = (u, d) => {
          let f = typeof u == "function" ? u(t) : u;
          if (!Object.is(f, t)) {
            let h = t;
            ((t =
              (d ?? (typeof f != "object" || f === null))
                ? f
                : Object.assign({}, t, f)),
              n.forEach((p) => p(t, h)));
          }
        },
        r = () => t,
        c = {
          setState: o,
          getState: r,
          getInitialState: () => l,
          subscribe: (u) => (n.add(u), () => n.delete(u)),
          destroy: () => {
            ((tc.env ? tc.env.MODE : void 0) !== "production" &&
              console.warn(
                "[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected.",
              ),
              n.clear());
          },
        },
        l = (t = e(o, r, c));
      return c;
    },
    nc = (e) => (e ? ec(e) : ec);
  var { useDebugValue: Op } = rc.default,
    { useSyncExternalStoreWithSelector: Pp } = ic.default,
    Ap = (e) => e;
  function wr(e, t = Ap, n) {
    let o = Pp(
      e.subscribe,
      e.getState,
      e.getServerState || e.getInitialState,
      t,
      n,
    );
    return (Op(o), o);
  }
  var oc = (e, t) => {
      let n = nc(e),
        o = (r, i = t) => wr(n, r, i);
      return (Object.assign(o, n), o);
    },
    sc = (e, t) => (e ? oc(e, t) : oc);
  function oe(e, t) {
    if (Object.is(e, t)) return !0;
    if (
      typeof e != "object" ||
      e === null ||
      typeof t != "object" ||
      t === null
    )
      return !1;
    if (e instanceof Map && t instanceof Map) {
      if (e.size !== t.size) return !1;
      for (let [o, r] of e) if (!Object.is(r, t.get(o))) return !1;
      return !0;
    }
    if (e instanceof Set && t instanceof Set) {
      if (e.size !== t.size) return !1;
      for (let o of e) if (!t.has(o)) return !1;
      return !0;
    }
    let n = Object.keys(e);
    if (n.length !== Object.keys(t).length) return !1;
    for (let o of n)
      if (!Object.prototype.hasOwnProperty.call(t, o) || !Object.is(e[o], t[o]))
        return !1;
    return !0;
  }
  var wo = Lt(cc()),
    vo = (0, C.createContext)(null),
    Tp = vo.Provider,
    Dc = pe.error001("react");
  function K(e, t) {
    let n = (0, C.useContext)(vo);
    if (n === null) throw new Error(Dc);
    return wr(n, e, t);
  }
  function ne() {
    let e = (0, C.useContext)(vo);
    if (e === null) throw new Error(Dc);
    return (0, C.useMemo)(
      () => ({
        getState: e.getState,
        setState: e.setState,
        subscribe: e.subscribe,
      }),
      [e],
    );
  }
  var lc = { display: "none" },
    Dp = {
      position: "absolute",
      width: 1,
      height: 1,
      margin: -1,
      border: 0,
      padding: 0,
      overflow: "hidden",
      clip: "rect(0px, 0px, 0px, 0px)",
      clipPath: "inset(100%)",
    },
    zc = "react-flow__node-desc",
    Rc = "react-flow__edge-desc",
    zp = "react-flow__aria-live",
    Rp = (e) => e.ariaLiveMessage,
    Lp = (e) => e.ariaLabelConfig;
  function $p({ rfId: e }) {
    let t = K(Rp);
    return (0, k.jsx)("div", {
      id: `${zp}-${e}`,
      "aria-live": "assertive",
      "aria-atomic": "true",
      style: Dp,
      children: t,
    });
  }
  function Hp({ rfId: e, disableKeyboardA11y: t }) {
    let n = K(Lp);
    return (0, k.jsxs)(k.Fragment, {
      children: [
        (0, k.jsx)("div", {
          id: `${zc}-${e}`,
          style: lc,
          children: t
            ? n["node.a11yDescription.default"]
            : n["node.a11yDescription.keyboardDisabled"],
        }),
        (0, k.jsx)("div", {
          id: `${Rc}-${e}`,
          style: lc,
          children: n["edge.a11yDescription.default"],
        }),
        !t && (0, k.jsx)($p, { rfId: e }),
      ],
    });
  }
  var yn = (0, C.forwardRef)(
    (
      { position: e = "top-left", children: t, className: n, style: o, ...r },
      i,
    ) => {
      let s = `${e}`.split("-");
      return (0, k.jsx)("div", {
        className: ie(["react-flow__panel", n, ...s]),
        style: o,
        ref: i,
        ...r,
        children: t,
      });
    },
  );
  yn.displayName = "Panel";
  var uc = "https://reactflow.dev?utm_source=attribution";
  function Bp({ proOptions: e, position: t = "bottom-right" }) {
    return e?.hideAttribution
      ? null
      : (0, k.jsx)(yn, {
          position: t,
          className: "react-flow__attribution",
          "data-message": `Please only hide this attribution when you are subscribed to React Flow Pro: ${uc}`,
          children: (0, k.jsx)("a", {
            href: uc,
            target: "_blank",
            rel: "noopener noreferrer",
            "aria-label": "React Flow attribution",
            children: "React Flow",
          }),
        });
  }
  var Vp = (e) => {
      let t = [],
        n = [];
      for (let [, o] of e.nodeLookup)
        o.selected && t.push(o.internals.userNode);
      for (let [, o] of e.edgeLookup) o.selected && n.push(o);
      return { selectedNodes: t, selectedEdges: n };
    },
    yo = (e) => e.id;
  function Fp(e, t) {
    return (
      oe(e.selectedNodes.map(yo), t.selectedNodes.map(yo)) &&
      oe(e.selectedEdges.map(yo), t.selectedEdges.map(yo))
    );
  }
  function Yp({ onSelectionChange: e }) {
    let t = ne(),
      { selectedNodes: n, selectedEdges: o } = K(Vp, Fp);
    return (
      (0, C.useEffect)(() => {
        let r = { nodes: n, edges: o };
        (e?.(r), t.getState().onSelectionChangeHandlers.forEach((i) => i(r)));
      }, [n, o, e]),
      null
    );
  }
  var Xp = (e) => !!e.onSelectionChangeHandlers;
  function Zp({ onSelectionChange: e }) {
    let t = K(Xp);
    return e || t ? (0, k.jsx)(Yp, { onSelectionChange: e }) : null;
  }
  var Lc = [0, 0],
    Wp = { x: 0, y: 0, zoom: 1 },
    qp = [
      "nodes",
      "edges",
      "defaultNodes",
      "defaultEdges",
      "onConnect",
      "onConnectStart",
      "onConnectEnd",
      "onClickConnectStart",
      "onClickConnectEnd",
      "nodesDraggable",
      "autoPanOnNodeFocus",
      "nodesConnectable",
      "nodesFocusable",
      "edgesFocusable",
      "edgesReconnectable",
      "elevateNodesOnSelect",
      "elevateEdgesOnSelect",
      "minZoom",
      "maxZoom",
      "nodeExtent",
      "onNodesChange",
      "onEdgesChange",
      "elementsSelectable",
      "connectionMode",
      "snapGrid",
      "snapToGrid",
      "translateExtent",
      "connectOnClick",
      "defaultEdgeOptions",
      "fitView",
      "fitViewOptions",
      "onNodesDelete",
      "onEdgesDelete",
      "onDelete",
      "onNodeDrag",
      "onNodeDragStart",
      "onNodeDragStop",
      "onSelectionDrag",
      "onSelectionDragStart",
      "onSelectionDragStop",
      "onMoveStart",
      "onMove",
      "onMoveEnd",
      "noPanClassName",
      "nodeOrigin",
      "autoPanOnConnect",
      "autoPanOnNodeDrag",
      "onError",
      "connectionRadius",
      "isValidConnection",
      "selectNodesOnDrag",
      "nodeDragThreshold",
      "connectionDragThreshold",
      "onBeforeDelete",
      "debug",
      "autoPanSpeed",
      "ariaLabelConfig",
      "zIndexMode",
    ],
    dc = [...qp, "rfId"],
    Gp = (e) => ({
      setNodes: e.setNodes,
      setEdges: e.setEdges,
      setMinZoom: e.setMinZoom,
      setMaxZoom: e.setMaxZoom,
      setTranslateExtent: e.setTranslateExtent,
      setNodeExtent: e.setNodeExtent,
      reset: e.reset,
      setDefaultNodesAndEdges: e.setDefaultNodesAndEdges,
    }),
    fc = {
      translateExtent: _t,
      nodeOrigin: Lc,
      minZoom: 0.5,
      maxZoom: 2,
      elementsSelectable: !0,
      noPanClassName: "nopan",
      rfId: "1",
    };
  function jp(e) {
    let {
        setNodes: t,
        setEdges: n,
        setMinZoom: o,
        setMaxZoom: r,
        setTranslateExtent: i,
        setNodeExtent: s,
        reset: a,
        setDefaultNodesAndEdges: c,
      } = K(Gp, oe),
      l = ne();
    (0, C.useEffect)(
      () => (
        c(e.defaultNodes, e.defaultEdges),
        () => {
          ((u.current = fc), a());
        }
      ),
      [],
    );
    let u = (0, C.useRef)(fc);
    return (
      (0, C.useEffect)(
        () => {
          for (let d of dc) {
            let f = e[d],
              h = u.current[d];
            f !== h &&
              (typeof e[d] > "u" ||
                (d === "nodes"
                  ? t(f)
                  : d === "edges"
                    ? n(f)
                    : d === "minZoom"
                      ? o(f)
                      : d === "maxZoom"
                        ? r(f)
                        : d === "translateExtent"
                          ? i(f)
                          : d === "nodeExtent"
                            ? s(f)
                            : d === "ariaLabelConfig"
                              ? l.setState({ ariaLabelConfig: ma(f) })
                              : d === "fitView"
                                ? l.setState({ fitViewQueued: f })
                                : d === "fitViewOptions"
                                  ? l.setState({ fitViewOptions: f })
                                  : l.setState({ [d]: f })));
          }
          u.current = e;
        },
        dc.map((d) => e[d]),
      ),
      null
    );
  }
  function hc() {
    return typeof window > "u" || !window.matchMedia
      ? null
      : window.matchMedia("(prefers-color-scheme: dark)");
  }
  function Kp(e) {
    let [t, n] = (0, C.useState)(e === "system" ? null : e);
    return (
      (0, C.useEffect)(() => {
        if (e !== "system") {
          n(e);
          return;
        }
        let o = hc(),
          r = () => n(o?.matches ? "dark" : "light");
        return (
          r(),
          o?.addEventListener("change", r),
          () => {
            o?.removeEventListener("change", r);
          }
        );
      }, [e]),
      t !== null ? t : hc()?.matches ? "dark" : "light"
    );
  }
  var pc = typeof document < "u" ? document : null;
  function At(e = null, t = { target: pc, actInsideInputWithModifier: !0 }) {
    let [n, o] = (0, C.useState)(!1),
      r = (0, C.useRef)(!1),
      i = (0, C.useRef)(new Set([])),
      [s, a] = (0, C.useMemo)(() => {
        if (e !== null) {
          let l = (Array.isArray(e) ? e : [e])
              .filter((d) => typeof d == "string")
              .map((d) =>
                d
                  .replace(
                    "+",
                    `
`,
                  )
                  .replace(
                    `

`,
                    `
+`,
                  ).split(`
`),
              ),
            u = l.reduce((d, f) => d.concat(...f), []);
          return [l, u];
        }
        return [[], []];
      }, [e]);
    return (
      (0, C.useEffect)(() => {
        let c = t?.target ?? pc,
          l = t?.actInsideInputWithModifier ?? !0;
        if (e !== null) {
          let u = (h) => {
              if (
                ((r.current = h.ctrlKey || h.metaKey || h.shiftKey || h.altKey),
                (!r.current || (r.current && !l)) && dr(h))
              )
                return !1;
              let x = mc(h.code, a);
              if ((i.current.add(h[x]), gc(s, i.current, !1))) {
                let y = h.composedPath?.()?.[0] || h.target,
                  m = y?.nodeName === "BUTTON" || y?.nodeName === "A";
                (t.preventDefault !== !1 &&
                  (r.current || !m) &&
                  h.preventDefault(),
                  o(!0));
              }
            },
            d = (h) => {
              let p = mc(h.code, a);
              (gc(s, i.current, !0)
                ? (o(!1), i.current.clear())
                : i.current.delete(h[p]),
                h.key === "Meta" && i.current.clear(),
                (r.current = !1));
            },
            f = () => {
              (i.current.clear(), o(!1));
            };
          return (
            c?.addEventListener("keydown", u),
            c?.addEventListener("keyup", d),
            window.addEventListener("blur", f),
            window.addEventListener("contextmenu", f),
            () => {
              (c?.removeEventListener("keydown", u),
                c?.removeEventListener("keyup", d),
                window.removeEventListener("blur", f),
                window.removeEventListener("contextmenu", f));
            }
          );
        }
      }, [e, o]),
      n
    );
  }
  function gc(e, t, n) {
    return e
      .filter((o) => n || o.length === t.size)
      .some((o) => o.every((r) => t.has(r)));
  }
  function mc(e, t) {
    return t.includes(e) ? "code" : "key";
  }
  var Up = () => {
    let e = ne();
    return (0, C.useMemo)(
      () => ({
        zoomIn: async (t) => {
          let { panZoom: n } = e.getState();
          return n ? n.scaleBy(1.2, t) : !1;
        },
        zoomOut: async (t) => {
          let { panZoom: n } = e.getState();
          return n ? n.scaleBy(1 / 1.2, t) : !1;
        },
        zoomTo: async (t, n) => {
          let { panZoom: o } = e.getState();
          return o ? o.scaleTo(t, n) : !1;
        },
        getZoom: () => e.getState().transform[2],
        setViewport: async (t, n) => {
          let {
            transform: [o, r, i],
            panZoom: s,
          } = e.getState();
          return s
            ? (await s.setViewport(
                { x: t.x ?? o, y: t.y ?? r, zoom: t.zoom ?? i },
                n,
              ),
              !0)
            : !1;
        },
        getViewport: () => {
          let [t, n, o] = e.getState().transform;
          return { x: t, y: n, zoom: o };
        },
        setCenter: async (t, n, o) => e.getState().setCenter(t, n, o),
        fitBounds: async (t, n) => {
          let {
              width: o,
              height: r,
              minZoom: i,
              maxZoom: s,
              panZoom: a,
            } = e.getState(),
            c = Mt(t, o, r, i, s, n?.padding ?? 0.1);
          return a
            ? (await a.setViewport(c, {
                duration: n?.duration,
                ease: n?.ease,
                interpolate: n?.interpolate,
              }),
              !0)
            : !1;
        },
        screenToFlowPosition: (t, n = {}) => {
          let {
            transform: o,
            snapGrid: r,
            snapToGrid: i,
            domNode: s,
          } = e.getState();
          if (!s) return t;
          let { x: a, y: c } = s.getBoundingClientRect(),
            l = { x: t.x - a, y: t.y - c },
            u = n.snapGrid ?? r,
            d = n.snapToGrid ?? i;
          return Ct(l, o, d, u);
        },
        flowToScreenPosition: (t) => {
          let { transform: n, domNode: o } = e.getState();
          if (!o) return t;
          let { x: r, y: i } = o.getBoundingClientRect(),
            s = ut(t, n);
          return { x: s.x + r, y: s.y + i };
        },
      }),
      [],
    );
  };
  function $c(e, t) {
    let n = [],
      o = new Map(),
      r = [];
    for (let i of e)
      if (i.type === "add") {
        r.push(i);
        continue;
      } else if (i.type === "remove" || i.type === "replace") o.set(i.id, [i]);
      else {
        let s = o.get(i.id);
        s ? s.push(i) : o.set(i.id, [i]);
      }
    for (let i of t) {
      let s = o.get(i.id);
      if (!s) {
        n.push(i);
        continue;
      }
      if (s[0].type === "remove") continue;
      if (s[0].type === "replace") {
        n.push({ ...s[0].item });
        continue;
      }
      let a = { ...i };
      for (let c of s) Qp(c, a);
      n.push(a);
    }
    return (
      r.length &&
        r.forEach((i) => {
          i.index !== void 0
            ? n.splice(i.index, 0, { ...i.item })
            : n.push({ ...i.item });
        }),
      n
    );
  }
  function Qp(e, t) {
    switch (e.type) {
      case "select": {
        t.selected = e.selected;
        break;
      }
      case "position": {
        (typeof e.position < "u" && (t.position = e.position),
          typeof e.dragging < "u" && (t.dragging = e.dragging));
        break;
      }
      case "dimensions": {
        (typeof e.dimensions < "u" &&
          ((t.measured = { ...e.dimensions }),
          e.setAttributes &&
            ((e.setAttributes === !0 || e.setAttributes === "width") &&
              (t.width = e.dimensions.width),
            (e.setAttributes === !0 || e.setAttributes === "height") &&
              (t.height = e.dimensions.height))),
          typeof e.resizing == "boolean" && (t.resizing = e.resizing));
        break;
      }
    }
  }
  function Nr(e, t) {
    return $c(e, t);
  }
  function Cr(e, t) {
    return $c(e, t);
  }
  function ht(e, t) {
    return { id: e, type: "select", selected: t };
  }
  function Pt(e, t = new Set(), n = !1) {
    let o = [];
    for (let [r, i] of e) {
      let s = t.has(r);
      !(i.selected === void 0 && !s) &&
        i.selected !== s &&
        (n && (i.selected = s), o.push(ht(i.id, s)));
    }
    return o;
  }
  function yc({ items: e = [], lookup: t }) {
    let n = [],
      o = new Map(e.map((r) => [r.id, r]));
    for (let [r, i] of e.entries()) {
      let s = t.get(i.id),
        a = s?.internals?.userNode ?? s;
      (a !== void 0 &&
        a !== i &&
        n.push({ id: i.id, item: i, type: "replace" }),
        a === void 0 && n.push({ item: i, type: "add", index: r }));
    }
    for (let [r] of t) o.get(r) === void 0 && n.push({ id: r, type: "remove" });
    return n;
  }
  function xc(e) {
    return { id: e.id, type: "remove" };
  }
  var Hc = ar("React Flow", "https://reactflow.dev/");
  function Bc(e, t, n = {}) {
    return va(e, t, { ...n, onError: n.onError ?? Hc });
  }
  function Jp(e, t, n, o = { shouldReplaceId: !0 }) {
    return ba(e, t, n, { ...o, onError: o.onError ?? Hc });
  }
  var Er = (e) => ca(e),
    Vc = (e) => tr(e);
  function Fc(e) {
    return (0, C.forwardRef)(e);
  }
  var Yc = typeof window < "u" ? C.useLayoutEffect : C.useEffect;
  function wc(e) {
    let [t, n] = (0, C.useState)(BigInt(0)),
      [o] = (0, C.useState)(() => eg(() => n((r) => r + BigInt(1))));
    return (
      Yc(() => {
        let r = o.get();
        r.length && (e(r), o.reset());
      }, [t]),
      o
    );
  }
  function eg(e) {
    let t = [];
    return {
      get: () => t,
      reset: () => {
        t = [];
      },
      push: (n) => {
        (t.push(n), e());
      },
    };
  }
  var Xc = (0, C.createContext)(null);
  function tg({ children: e }) {
    let t = ne(),
      n = (0, C.useCallback)((a) => {
        let {
            nodes: c = [],
            setNodes: l,
            hasDefaultNodes: u,
            onNodesChange: d,
            nodeLookup: f,
            fitViewQueued: h,
            onNodesChangeMiddlewareMap: p,
          } = t.getState(),
          x = c;
        for (let m of a) x = typeof m == "function" ? m(x) : m;
        let y = yc({ items: x, lookup: f });
        for (let m of p.values()) y = m(y);
        (u && l(x),
          y.length > 0
            ? d?.(y)
            : h &&
              window.requestAnimationFrame(() => {
                let { fitViewQueued: m, nodes: b, setNodes: g } = t.getState();
                m && g(b);
              }));
      }, []),
      o = wc(n),
      r = (0, C.useCallback)((a) => {
        let {
            edges: c = [],
            setEdges: l,
            hasDefaultEdges: u,
            onEdgesChange: d,
            edgeLookup: f,
          } = t.getState(),
          h = c;
        for (let p of a) h = typeof p == "function" ? p(h) : p;
        u ? l(h) : d && d(yc({ items: h, lookup: f }));
      }, []),
      i = wc(r),
      s = (0, C.useMemo)(() => ({ nodeQueue: o, edgeQueue: i }), []);
    return (0, k.jsx)(Xc.Provider, { value: s, children: e });
  }
  function ng() {
    let e = (0, C.useContext)(Xc);
    if (!e)
      throw new Error("useBatchContext must be used within a BatchProvider");
    return e;
  }
  var og = (e) => !!e.panZoom;
  function bo() {
    let e = Up(),
      t = ne(),
      n = ng(),
      o = K(og),
      r = (0, C.useMemo)(() => {
        let i = (d) => t.getState().nodeLookup.get(d),
          s = (d) => {
            n.nodeQueue.push(d);
          },
          a = (d) => {
            n.edgeQueue.push(d);
          },
          c = (d) => {
            let { nodeLookup: f, nodeOrigin: h } = t.getState(),
              p = Er(d) ? d : f.get(d.id),
              x = p.parentId
                ? cr(p.position, p.measured, p.parentId, f, h)
                : p.position,
              y = {
                ...p,
                position: x,
                width: p.measured?.width ?? p.width,
                height: p.measured?.height ?? p.height,
              };
            return St(y);
          },
          l = (d, f, h = { replace: !1 }) => {
            s((p) =>
              p.map((x) => {
                if (x.id === d) {
                  let y = typeof f == "function" ? f(x) : f;
                  return h.replace && Er(y) ? y : { ...x, ...y };
                }
                return x;
              }),
            );
          },
          u = (d, f, h = { replace: !1 }) => {
            a((p) =>
              p.map((x) => {
                if (x.id === d) {
                  let y = typeof f == "function" ? f(x) : f;
                  return h.replace && Vc(y) ? y : { ...x, ...y };
                }
                return x;
              }),
            );
          };
        return {
          getNodes: () => t.getState().nodes.map((d) => ({ ...d })),
          getNode: (d) => i(d)?.internals.userNode,
          getInternalNode: i,
          getEdges: () => {
            let { edges: d = [] } = t.getState();
            return d.map((f) => ({ ...f }));
          },
          getEdge: (d) => t.getState().edgeLookup.get(d),
          setNodes: s,
          setEdges: a,
          addNodes: (d) => {
            let f = Array.isArray(d) ? d : [d];
            n.nodeQueue.push((h) => [...h, ...f]);
          },
          addEdges: (d) => {
            let f = Array.isArray(d) ? d : [d];
            n.edgeQueue.push((h) => [...h, ...f]);
          },
          toObject: () => {
            let { nodes: d = [], edges: f = [], transform: h } = t.getState(),
              [p, x, y] = h;
            return {
              nodes: d.map((m) => ({ ...m })),
              edges: f.map((m) => ({ ...m })),
              viewport: { x: p, y: x, zoom: y },
            };
          },
          deleteElements: async ({ nodes: d = [], edges: f = [] }) => {
            let {
                nodes: h,
                edges: p,
                onNodesDelete: x,
                onEdgesDelete: y,
                triggerNodeChanges: m,
                triggerEdgeChanges: b,
                onDelete: g,
                onBeforeDelete: v,
              } = t.getState(),
              { nodes: N, edges: _ } = await fa({
                nodesToRemove: d,
                edgesToRemove: f,
                nodes: h,
                edges: p,
                onBeforeDelete: v,
              }),
              I = _.length > 0,
              O = N.length > 0;
            if (I) {
              let P = _.map(xc);
              (y?.(_), b(P));
            }
            if (O) {
              let P = N.map(xc);
              (x?.(N), m(P));
            }
            return (
              (O || I) && g?.({ nodes: N, edges: _ }),
              { deletedNodes: N, deletedEdges: _ }
            );
          },
          getIntersectingNodes: (d, f = !0, h) => {
            let p = sr(d),
              x = p ? d : c(d),
              y = h !== void 0;
            return x
              ? (h || t.getState().nodes).filter((m) => {
                  let b = t.getState().nodeLookup.get(m.id);
                  if (
                    b &&
                    !p &&
                    (m.id === d.id || !b.internals.positionAbsolute)
                  )
                    return !1;
                  let g = St(y ? m : b),
                    v = dn(g, x);
                  return (
                    (f && v > 0) ||
                    v >= g.width * g.height ||
                    v >= x.width * x.height
                  );
                })
              : [];
          },
          isNodeIntersecting: (d, f, h = !0) => {
            let x = sr(d) ? d : c(d);
            if (!x) return !1;
            let y = dn(x, f);
            return (
              (h && y > 0) || y >= f.width * f.height || y >= x.width * x.height
            );
          },
          updateNode: l,
          updateNodeData: (d, f, h = { replace: !1 }) => {
            l(
              d,
              (p) => {
                let x = typeof f == "function" ? f(p) : f;
                return h.replace
                  ? { ...p, data: x }
                  : { ...p, data: { ...p.data, ...x } };
              },
              h,
            );
          },
          updateEdge: u,
          updateEdgeData: (d, f, h = { replace: !1 }) => {
            u(
              d,
              (p) => {
                let x = typeof f == "function" ? f(p) : f;
                return h.replace
                  ? { ...p, data: x }
                  : { ...p, data: { ...p.data, ...x } };
              },
              h,
            );
          },
          getNodesBounds: (d) => {
            let { nodeLookup: f, nodeOrigin: h } = t.getState();
            return no(d, { nodeLookup: f, nodeOrigin: h });
          },
          getHandleConnections: ({ type: d, id: f, nodeId: h }) =>
            Array.from(
              t
                .getState()
                .connectionLookup.get(`${h}-${d}${f ? `-${f}` : ""}`)
                ?.values() ?? [],
            ),
          getNodeConnections: ({ type: d, handleId: f, nodeId: h }) =>
            Array.from(
              t
                .getState()
                .connectionLookup.get(
                  `${h}${d ? (f ? `-${d}-${f}` : `-${d}`) : ""}`,
                )
                ?.values() ?? [],
            ),
          fitView: async (d) => {
            let f = t.getState().fitViewResolver ?? ga();
            return (
              t.setState({
                fitViewQueued: !0,
                fitViewOptions: d,
                fitViewResolver: f,
              }),
              n.nodeQueue.push((h) => [...h]),
              f.promise
            );
          },
        };
      }, []);
    return (0, C.useMemo)(() => ({ ...r, ...e, viewportInitialized: o }), [o]);
  }
  var vc = (e) => e.selected,
    rg = typeof window < "u" ? window : void 0;
  function ig({ deleteKeyCode: e, multiSelectionKeyCode: t }) {
    let n = ne(),
      { deleteElements: o } = bo(),
      r = At(e, { actInsideInputWithModifier: !1 }),
      i = At(t, { target: rg });
    ((0, C.useEffect)(() => {
      if (r) {
        let { edges: s, nodes: a } = n.getState();
        (o({ nodes: a.filter(vc), edges: s.filter(vc) }),
          n.setState({ nodesSelectionActive: !1 }));
      }
    }, [r]),
      (0, C.useEffect)(() => {
        n.setState({ multiSelectionActive: i });
      }, [i]));
  }
  function sg(e) {
    let t = ne();
    (0, C.useEffect)(() => {
      let n = () => {
        if (!e.current || !(e.current.checkVisibility?.() ?? !0)) return !1;
        let o = co(e.current);
        ((o.height === 0 || o.width === 0) &&
          t.getState().onError?.("004", pe.error004()),
          t.setState({ width: o.width || 500, height: o.height || 500 }));
      };
      if (e.current) {
        (n(), window.addEventListener("resize", n));
        let o = new ResizeObserver(() => n());
        return (
          o.observe(e.current),
          () => {
            (window.removeEventListener("resize", n),
              o && e.current && o.unobserve(e.current));
          }
        );
      }
    }, []);
  }
  var Eo = {
      position: "absolute",
      width: "100%",
      height: "100%",
      top: 0,
      left: 0,
    },
    ag = (e) => ({
      userSelectionActive: e.userSelectionActive,
      lib: e.lib,
      connectionInProgress: e.connection.inProgress,
    });
  function cg({
    onPaneContextMenu: e,
    zoomOnScroll: t = !0,
    zoomOnPinch: n = !0,
    panOnScroll: o = !1,
    panOnScrollSpeed: r = 0.5,
    panOnScrollMode: i = Ie.Free,
    zoomOnDoubleClick: s = !0,
    panOnDrag: a = !0,
    defaultViewport: c,
    translateExtent: l,
    minZoom: u,
    maxZoom: d,
    zoomActivationKeyCode: f,
    preventScrolling: h = !0,
    children: p,
    noWheelClassName: x,
    noPanClassName: y,
    onViewportChange: m,
    isControlledViewport: b,
    paneClickDistance: g,
    selectionOnDrag: v,
  }) {
    let N = ne(),
      _ = (0, C.useRef)(null),
      { userSelectionActive: I, lib: O, connectionInProgress: P } = K(ag, oe),
      B = At(f),
      D = (0, C.useRef)();
    sg(_);
    let $ = (0, C.useCallback)(
      (z) => {
        (m?.({ x: z[0], y: z[1], zoom: z[2] }),
          b || N.setState({ transform: z }));
      },
      [m, b],
    );
    return (
      (0, C.useEffect)(() => {
        if (_.current) {
          D.current = Va({
            domNode: _.current,
            minZoom: u,
            maxZoom: d,
            translateExtent: l,
            viewport: c,
            onDraggingChange: (S) =>
              N.setState((M) =>
                M.paneDragging === S ? M : { paneDragging: S },
              ),
            onPanZoomStart: (S, M) => {
              let { onViewportChangeStart: T, onMoveStart: A } = N.getState();
              (A?.(S, M), T?.(M));
            },
            onPanZoom: (S, M) => {
              let { onViewportChange: T, onMove: A } = N.getState();
              (A?.(S, M), T?.(M));
            },
            onPanZoomEnd: (S, M) => {
              let { onViewportChangeEnd: T, onMoveEnd: A } = N.getState();
              (A?.(S, M), T?.(M));
            },
          });
          let { x: z, y: w, zoom: E } = D.current.getViewport();
          return (
            N.setState({
              panZoom: D.current,
              transform: [z, w, E],
              domNode: _.current.closest(".react-flow"),
            }),
            () => {
              D.current?.destroy();
            }
          );
        }
      }, []),
      (0, C.useEffect)(() => {
        D.current?.update({
          onPaneContextMenu: e,
          zoomOnScroll: t,
          zoomOnPinch: n,
          panOnScroll: o,
          panOnScrollSpeed: r,
          panOnScrollMode: i,
          zoomOnDoubleClick: s,
          panOnDrag: a,
          zoomActivationKeyPressed: B,
          preventScrolling: h,
          noPanClassName: y,
          userSelectionActive: I,
          noWheelClassName: x,
          lib: O,
          onTransformChange: $,
          connectionInProgress: P,
          selectionOnDrag: v,
          paneClickDistance: g,
        });
      }, [e, t, n, o, r, i, s, a, B, h, y, I, x, O, $, P, v, g]),
      (0, k.jsx)("div", {
        className: "react-flow__renderer",
        ref: _,
        style: Eo,
        children: p,
      })
    );
  }
  var lg = (e) => ({
    userSelectionActive: e.userSelectionActive,
    userSelectionRect: e.userSelectionRect,
  });
  function ug() {
    let { userSelectionActive: e, userSelectionRect: t } = K(lg, oe);
    return e && t
      ? (0, k.jsx)("div", {
          className: "react-flow__selection react-flow__container",
          style: {
            width: t.width,
            height: t.height,
            transform: `translate(${t.x}px, ${t.y}px)`,
          },
        })
      : null;
  }
  var vr = (e, t) => (n) => {
      n.target === t.current && e?.(n);
    },
    dg = (e) => ({
      userSelectionActive: e.userSelectionActive,
      elementsSelectable: e.elementsSelectable,
      dragging: e.paneDragging,
      panBy: e.panBy,
      autoPanSpeed: e.autoPanSpeed,
    });
  function fg({
    isSelecting: e,
    selectionKeyPressed: t,
    selectionMode: n = We.Full,
    panOnDrag: o,
    autoPanOnSelection: r,
    paneClickDistance: i,
    selectionOnDrag: s,
    onSelectionStart: a,
    onSelectionEnd: c,
    onPaneClick: l,
    onPaneContextMenu: u,
    onPaneScroll: d,
    onPaneMouseEnter: f,
    onPaneMouseMove: h,
    onPaneMouseLeave: p,
    children: x,
  }) {
    let y = (0, C.useRef)(0),
      m = ne(),
      {
        userSelectionActive: b,
        elementsSelectable: g,
        dragging: v,
        panBy: N,
        autoPanSpeed: _,
      } = K(dg, oe),
      I = g && (e || b),
      O = (0, C.useRef)(null),
      P = (0, C.useRef)(),
      B = (0, C.useRef)(new Set()),
      D = (0, C.useRef)(new Set()),
      $ = (0, C.useRef)(!1),
      z = (0, C.useRef)(!1),
      w = (0, C.useRef)({ x: 0, y: 0 }),
      E = (0, C.useRef)(!1),
      S = (R) => {
        if (z.current || $.current || m.getState().connection.inProgress) {
          ((z.current = !1), ($.current = !1));
          return;
        }
        (l?.(R),
          m.getState().resetSelectedElements(),
          m.setState({ nodesSelectionActive: !1 }));
      },
      M = (R) => {
        if (Array.isArray(o) && o?.includes(2)) {
          R.preventDefault();
          return;
        }
        u?.(R);
      },
      T = d ? (R) => d(R) : void 0,
      A = (R) => {
        z.current && (R.stopPropagation(), (z.current = !1));
      },
      V = (R) => {
        let { domNode: F, transform: Q } = m.getState();
        if (((P.current = F?.getBoundingClientRect()), !P.current)) return;
        let U = R.target === O.current;
        if (
          (!U && !!R.target.closest(".nokey")) ||
          !e ||
          !((s && U) || t) ||
          R.button !== 0 ||
          !R.isPrimary
        )
          return;
        (R.target?.setPointerCapture?.(R.pointerId), (z.current = !1));
        let { x: ee, y: te } = ye(R.nativeEvent, P.current),
          re = Ct({ x: ee, y: te }, Q);
        (m.setState({
          userSelectionRect: {
            width: 0,
            height: 0,
            startX: re.x,
            startY: re.y,
            x: ee,
            y: te,
          },
        }),
          U || (R.stopPropagation(), R.preventDefault()));
      };
    function H(R, F) {
      let { userSelectionRect: Q } = m.getState();
      if (!Q) return;
      let {
          transform: U,
          nodeLookup: W,
          edgeLookup: j,
          connectionLookup: ee,
          triggerNodeChanges: te,
          triggerEdgeChanges: re,
          defaultEdgeOptions: ue,
        } = m.getState(),
        Pe = { x: Q.startX, y: Q.startY },
        { x: Ne, y: Ce } = ut(Pe, U),
        Ae = {
          startX: Pe.x,
          startY: Pe.y,
          x: R < Ne ? R : Ne,
          y: F < Ce ? F : Ce,
          width: Math.abs(R - Ne),
          height: Math.abs(F - Ce),
        },
        Rt = B.current,
        Ge = D.current;
      ((B.current = new Set(
        oo(W, Ae, U, n === We.Partial, !0).map((we) => we.id),
      )),
        (D.current = new Set()));
      let je = ue?.selectable ?? !0;
      for (let we of B.current) {
        let Te = ee.get(we);
        if (Te)
          for (let { edgeId: De } of Te.values()) {
            let Ke = j.get(De);
            Ke && (Ke.selectable ?? je) && D.current.add(De);
          }
      }
      if (!lr(Rt, B.current)) {
        let we = Pt(W, B.current, !0);
        te(we);
      }
      if (!lr(Ge, D.current)) {
        let we = Pt(j, D.current);
        re(we);
      }
      m.setState({
        userSelectionRect: Ae,
        userSelectionActive: !0,
        nodesSelectionActive: !1,
      });
    }
    function L() {
      if (!r || !P.current) return;
      let [R, F] = ro(w.current, P.current, _);
      N({ x: R, y: F }).then((Q) => {
        if (!z.current || !Q) {
          y.current = requestAnimationFrame(L);
          return;
        }
        let { x: U, y: W } = w.current;
        (H(U, W), (y.current = requestAnimationFrame(L)));
      });
    }
    let Z = () => {
      (cancelAnimationFrame(y.current), (y.current = 0), (E.current = !1));
    };
    (0, C.useEffect)(() => () => Z(), []);
    let X = (R) => {
        let {
          userSelectionRect: F,
          transform: Q,
          resetSelectedElements: U,
        } = m.getState();
        if (!P.current || !F) return;
        let { x: W, y: j } = ye(R.nativeEvent, P.current);
        w.current = { x: W, y: j };
        let ee = ut({ x: F.startX, y: F.startY }, Q);
        if (!z.current) {
          let te = t ? 0 : i;
          if (Math.hypot(W - ee.x, j - ee.y) <= te) return;
          (U(), a?.(R));
        }
        ((z.current = !0), E.current || (L(), (E.current = !0)), H(W, j));
      },
      q = (R) => {
        if (!I) {
          R.target === O.current &&
            m.getState().connection.inProgress &&
            ($.current = !0);
          return;
        }
        R.button === 0 &&
          (R.target?.releasePointerCapture?.(R.pointerId),
          !b &&
            R.target === O.current &&
            m.getState().userSelectionRect &&
            S?.(R),
          m.setState({ userSelectionActive: !1, userSelectionRect: null }),
          z.current &&
            (c?.(R), m.setState({ nodesSelectionActive: B.current.size > 0 })),
          Z());
      },
      J = (R) => {
        (R.target?.releasePointerCapture?.(R.pointerId), Z());
      },
      G = o === !0 || (Array.isArray(o) && o.includes(0));
    return (0, k.jsxs)("div", {
      className: ie([
        "react-flow__pane",
        { draggable: G, dragging: v, selection: e },
      ]),
      onClick: I ? void 0 : vr(S, O),
      onContextMenu: vr(M, O),
      onWheel: vr(T, O),
      onPointerEnter: I ? void 0 : f,
      onPointerMove: I ? X : h,
      onPointerUp: q,
      onPointerCancel: I ? J : void 0,
      onPointerDownCapture: I ? V : void 0,
      onClickCapture: I ? A : void 0,
      onPointerLeave: p,
      ref: O,
      style: Eo,
      children: [x, (0, k.jsx)(ug, {})],
    });
  }
  function _r({ id: e, store: t, unselect: n = !1, nodeRef: o }) {
    let {
        addSelectedNodes: r,
        unselectNodesAndEdges: i,
        multiSelectionActive: s,
        nodeLookup: a,
        onError: c,
      } = t.getState(),
      l = a.get(e);
    if (!l) {
      c?.("012", pe.error012(e));
      return;
    }
    (t.setState({ nodesSelectionActive: !1 }),
      l.selected
        ? (n || (l.selected && s)) &&
          (i({ nodes: [l], edges: [] }),
          requestAnimationFrame(() => o?.current?.blur()))
        : r([e]));
  }
  function Zc({
    nodeRef: e,
    disabled: t = !1,
    noDragClassName: n,
    handleSelector: o,
    nodeId: r,
    isSelectable: i,
    nodeClickDistance: s,
  }) {
    let a = ne(),
      [c, l] = (0, C.useState)(!1),
      u = (0, C.useRef)();
    return (
      (0, C.useEffect)(() => {
        if (!t)
          return (
            (u.current = Ta({
              getStoreItems: () => a.getState(),
              onNodeMouseDown: (d) => {
                _r({ id: d, store: a, nodeRef: e });
              },
              onDragStart: () => {
                l(!0);
              },
              onDragStop: () => {
                l(!1);
              },
            })),
            () => {
              (u.current?.destroy(), (u.current = void 0));
            }
          );
      }, [t, a, e]),
      (0, C.useEffect)(() => {
        t ||
          !e.current ||
          !u.current ||
          u.current.update({
            noDragClassName: n,
            handleSelector: o,
            domNode: e.current,
            isSelectable: i,
            nodeId: r,
            nodeClickDistance: s,
          });
      }, [n, o, t, i, e, r, s]),
      c
    );
  }
  var hg = (e) => (t) =>
    t.selected && (t.draggable || (e && typeof t.draggable > "u"));
  function Wc() {
    let e = ne();
    return (0, C.useCallback)((n) => {
      let {
          nodeExtent: o,
          snapToGrid: r,
          snapGrid: i,
          nodesDraggable: s,
          onError: a,
          updateNodePositions: c,
          nodeLookup: l,
          nodeOrigin: u,
        } = e.getState(),
        d = new Map(),
        f = hg(s),
        h = r ? i[0] : 5,
        p = r ? i[1] : 5,
        x = n.direction.x * h * n.factor,
        y = n.direction.y * p * n.factor;
      for (let [, m] of l) {
        if (!f(m)) continue;
        let b = {
          x: m.internals.positionAbsolute.x + x,
          y: m.internals.positionAbsolute.y + y,
        };
        r && (b = Nt(b, i));
        let { position: g, positionAbsolute: v } = rr({
          nodeId: m.id,
          nextPosition: b,
          nodeLookup: l,
          nodeExtent: o,
          nodeOrigin: u,
          onError: a,
        });
        ((m.position = g), (m.internals.positionAbsolute = v), d.set(m.id, m));
      }
      c(d);
    }, []);
  }
  var Mr = (0, C.createContext)(null),
    pg = Mr.Provider;
  Mr.Consumer;
  var Tt = () => (0, C.useContext)(Mr),
    gg = (e) => ({
      connectOnClick: e.connectOnClick,
      noPanClassName: e.noPanClassName,
      rfId: e.rfId,
    }),
    qc = (0, C.createContext)(null);
  function mg({ children: e }) {
    let t = K(gg, oe);
    return (0, k.jsx)(qc.Provider, { value: t, children: e });
  }
  function yg() {
    let e = (0, C.useContext)(qc);
    if (!e)
      throw new Error(
        "useHandleConfig must be used within a HandleConfigProvider",
      );
    return e;
  }
  var xg = {
      connectingFrom: !1,
      connectingTo: !1,
      clickConnecting: !1,
      isPossibleEndHandle: !0,
      connectionInProcess: !1,
      clickConnectionInProcess: !1,
      valid: !1,
    },
    wg = (e, t, n) => (o) => {
      let {
          connectionClickStartHandle: r,
          connectionMode: i,
          connection: s,
        } = o,
        { fromHandle: a, toHandle: c, isValid: l } = s;
      if (!a && !r) return xg;
      let u = c?.nodeId === e && c?.id === t && c?.type === n;
      return {
        connectingFrom: a?.nodeId === e && a?.id === t && a?.type === n,
        connectingTo: u,
        clickConnecting: r?.nodeId === e && r?.id === t && r?.type === n,
        isPossibleEndHandle:
          i === He.Strict ? a?.type !== n : e !== a?.nodeId || t !== a?.id,
        connectionInProcess: !!a,
        clickConnectionInProcess: !!r,
        valid: u && l,
      };
    };
  function vg(
    {
      type: e = "source",
      position: t = Y.Top,
      isValidConnection: n,
      isConnectable: o = !0,
      isConnectableStart: r = !0,
      isConnectableEnd: i = !0,
      id: s,
      onConnect: a,
      children: c,
      className: l,
      onMouseDown: u,
      onTouchStart: d,
      ...f
    },
    h,
  ) {
    let p = s || null,
      x = e === "target",
      y = ne(),
      m = Tt(),
      { connectOnClick: b, noPanClassName: g, rfId: v } = yg(),
      {
        connectingFrom: N,
        connectingTo: _,
        clickConnecting: I,
        isPossibleEndHandle: O,
        connectionInProcess: P,
        clickConnectionInProcess: B,
        valid: D,
      } = K(wg(m, p, e), oe);
    m || y.getState().onError?.("010", pe.error010());
    let $ = (E) => {
        let {
            defaultEdgeOptions: S,
            onConnect: M,
            hasDefaultEdges: T,
          } = y.getState(),
          A = { ...S, ...E };
        if (T) {
          let { edges: V, setEdges: H, onError: L } = y.getState();
          H(Bc(A, V, { onError: L }));
        }
        (M?.(A), a?.(A));
      },
      z = (E) => {
        if (!m) return;
        let S = fr(E.nativeEvent);
        if (r && ((S && E.button === 0) || !S)) {
          let M = y.getState();
          po.onPointerDown(E.nativeEvent, {
            handleDomNode: E.currentTarget,
            autoPanOnConnect: M.autoPanOnConnect,
            connectionMode: M.connectionMode,
            connectionRadius: M.connectionRadius,
            domNode: M.domNode,
            nodeLookup: M.nodeLookup,
            lib: M.lib,
            isTarget: x,
            handleId: p,
            nodeId: m,
            flowId: M.rfId,
            panBy: M.panBy,
            cancelConnection: M.cancelConnection,
            onConnectStart: M.onConnectStart,
            onConnectEnd: (...T) => y.getState().onConnectEnd?.(...T),
            updateConnection: M.updateConnection,
            onConnect: $,
            isValidConnection:
              n || ((...T) => y.getState().isValidConnection?.(...T) ?? !0),
            getTransform: () => y.getState().transform,
            getFromHandle: () => y.getState().connection.fromHandle,
            autoPanSpeed: M.autoPanSpeed,
            dragThreshold: M.connectionDragThreshold,
          });
        }
        S ? u?.(E) : d?.(E);
      },
      w = (E) => {
        let {
          onClickConnectStart: S,
          onClickConnectEnd: M,
          connectionClickStartHandle: T,
          connectionMode: A,
          isValidConnection: V,
          lib: H,
          rfId: L,
          nodeLookup: Z,
          connection: X,
        } = y.getState();
        if (!m || (!T && !r)) return;
        if (!T) {
          (S?.(E.nativeEvent, { nodeId: m, handleId: p, handleType: e }),
            y.setState({
              connectionClickStartHandle: { nodeId: m, type: e, id: p },
            }));
          return;
        }
        let q = ur(E.target),
          J = n || V,
          { connection: G, isValid: R } = po.isValid(E.nativeEvent, {
            handle: { nodeId: m, id: p, type: e },
            connectionMode: A,
            fromNodeId: T.nodeId,
            fromHandleId: T.id || null,
            fromType: T.type,
            isValidConnection: J,
            flowId: L,
            doc: q,
            lib: H,
            nodeLookup: Z,
          });
        R && G && $(G);
        let F = structuredClone(X);
        (delete F.inProgress,
          (F.toPosition = F.toHandle ? F.toHandle.position : null),
          M?.(E, F),
          y.setState({ connectionClickStartHandle: null }));
      };
    return (0, k.jsx)("div", {
      "data-handleid": p,
      "data-nodeid": m,
      "data-handlepos": t,
      "data-id": `${v}-${m}-${p}-${e}`,
      className: ie([
        "react-flow__handle",
        `react-flow__handle-${t}`,
        "nodrag",
        g,
        l,
        {
          source: !x,
          target: x,
          connectable: o,
          connectablestart: r,
          connectableend: i,
          clickconnecting: I,
          connectingfrom: N,
          connectingto: _,
          valid: D,
          connectionindicator: o && (!P || O) && (P || B ? i : r),
        },
      ]),
      onMouseDown: z,
      onTouchStart: z,
      onClick: b ? w : void 0,
      ref: h,
      ...f,
      children: c,
    });
  }
  var mn = (0, C.memo)(Fc(vg));
  function bg({ data: e, isConnectable: t, sourcePosition: n = Y.Bottom }) {
    return (0, k.jsxs)(k.Fragment, {
      children: [
        e?.label,
        (0, k.jsx)(mn, { type: "source", position: n, isConnectable: t }),
      ],
    });
  }
  function Eg({
    data: e,
    isConnectable: t,
    targetPosition: n = Y.Top,
    sourcePosition: o = Y.Bottom,
  }) {
    return (0, k.jsxs)(k.Fragment, {
      children: [
        (0, k.jsx)(mn, { type: "target", position: n, isConnectable: t }),
        e?.label,
        (0, k.jsx)(mn, { type: "source", position: o, isConnectable: t }),
      ],
    });
  }
  function _g() {
    return null;
  }
  function Sg({ data: e, isConnectable: t, targetPosition: n = Y.Top }) {
    return (0, k.jsxs)(k.Fragment, {
      children: [
        (0, k.jsx)(mn, { type: "target", position: n, isConnectable: t }),
        e?.label,
      ],
    });
  }
  var xo = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    },
    bc = { input: bg, default: Eg, output: Sg, group: _g };
  function Ng(e) {
    return e.internals.handleBounds === void 0
      ? {
          width: e.width ?? e.initialWidth ?? e.style?.width,
          height: e.height ?? e.initialHeight ?? e.style?.height,
        }
      : {
          width: e.width ?? e.style?.width,
          height: e.height ?? e.style?.height,
        };
  }
  var Cg = (e) => {
    let {
      width: t,
      height: n,
      x: o,
      y: r,
    } = ft(e.nodeLookup, { filter: (i) => !!i.selected });
    return {
      width: me(t) ? t : null,
      height: me(n) ? n : null,
      userSelectionActive: e.userSelectionActive,
      transformString: `translate(${e.transform[0]}px,${e.transform[1]}px) scale(${e.transform[2]}) translate(${o}px,${r}px)`,
    };
  };
  function Mg({
    onSelectionContextMenu: e,
    noPanClassName: t,
    disableKeyboardA11y: n,
  }) {
    let o = ne(),
      {
        width: r,
        height: i,
        transformString: s,
        userSelectionActive: a,
      } = K(Cg, oe),
      c = Wc(),
      l = (0, C.useRef)(null);
    (0, C.useEffect)(() => {
      n || l.current?.focus({ preventScroll: !0 });
    }, [n]);
    let u = !a && r !== null && i !== null;
    if ((Zc({ nodeRef: l, disabled: !u }), !u)) return null;
    let d = e
        ? (h) => {
            let p = o.getState().nodes.filter((x) => x.selected);
            e(h, p);
          }
        : void 0,
      f = (h) => {
        Object.prototype.hasOwnProperty.call(xo, h.key) &&
          (h.preventDefault(),
          c({ direction: xo[h.key], factor: h.shiftKey ? 4 : 1 }));
      };
    return (0, k.jsx)("div", {
      className: ie(["react-flow__nodesselection", "react-flow__container", t]),
      style: { transform: s },
      children: (0, k.jsx)("div", {
        ref: l,
        className: "react-flow__nodesselection-rect",
        onContextMenu: d,
        tabIndex: n ? void 0 : -1,
        onKeyDown: n ? void 0 : f,
        style: { width: r, height: i },
      }),
    });
  }
  var Ec = typeof window < "u" ? window : void 0,
    Ig = (e) => ({
      nodesSelectionActive: e.nodesSelectionActive,
      userSelectionActive: e.userSelectionActive,
    });
  function Gc({
    children: e,
    onPaneClick: t,
    onPaneMouseEnter: n,
    onPaneMouseMove: o,
    onPaneMouseLeave: r,
    onPaneContextMenu: i,
    onPaneScroll: s,
    paneClickDistance: a,
    deleteKeyCode: c,
    selectionKeyCode: l,
    selectionOnDrag: u,
    selectionMode: d,
    onSelectionStart: f,
    onSelectionEnd: h,
    multiSelectionKeyCode: p,
    panActivationKeyCode: x,
    zoomActivationKeyCode: y,
    elementsSelectable: m,
    zoomOnScroll: b,
    zoomOnPinch: g,
    panOnScroll: v,
    panOnScrollSpeed: N,
    panOnScrollMode: _,
    zoomOnDoubleClick: I,
    panOnDrag: O,
    autoPanOnSelection: P,
    defaultViewport: B,
    translateExtent: D,
    minZoom: $,
    maxZoom: z,
    preventScrolling: w,
    onSelectionContextMenu: E,
    noWheelClassName: S,
    noPanClassName: M,
    disableKeyboardA11y: T,
    onViewportChange: A,
    isControlledViewport: V,
  }) {
    let { nodesSelectionActive: H, userSelectionActive: L } = K(Ig, oe),
      Z = At(l, { target: Ec }),
      X = At(x, { target: Ec }),
      q = X || O,
      J = X || v,
      G = u && q !== !0,
      R = Z || L || G;
    return (
      ig({ deleteKeyCode: c, multiSelectionKeyCode: p }),
      (0, k.jsx)(cg, {
        onPaneContextMenu: i,
        elementsSelectable: m,
        zoomOnScroll: b,
        zoomOnPinch: g,
        panOnScroll: J,
        panOnScrollSpeed: N,
        panOnScrollMode: _,
        zoomOnDoubleClick: I,
        panOnDrag: !Z && q,
        defaultViewport: B,
        translateExtent: D,
        minZoom: $,
        maxZoom: z,
        zoomActivationKeyCode: y,
        preventScrolling: w,
        noWheelClassName: S,
        noPanClassName: M,
        onViewportChange: A,
        isControlledViewport: V,
        paneClickDistance: a,
        selectionOnDrag: G,
        children: (0, k.jsxs)(fg, {
          onSelectionStart: f,
          onSelectionEnd: h,
          onPaneClick: t,
          onPaneMouseEnter: n,
          onPaneMouseMove: o,
          onPaneMouseLeave: r,
          onPaneContextMenu: i,
          onPaneScroll: s,
          panOnDrag: q,
          autoPanOnSelection: P,
          isSelecting: !!R,
          selectionMode: d,
          selectionKeyPressed: Z,
          paneClickDistance: a,
          selectionOnDrag: G,
          children: [
            e,
            H &&
              (0, k.jsx)(Mg, {
                onSelectionContextMenu: E,
                noPanClassName: M,
                disableKeyboardA11y: T,
              }),
          ],
        }),
      })
    );
  }
  Gc.displayName = "FlowRenderer";
  var kg = (0, C.memo)(Gc),
    Og = (e) => (t) =>
      e
        ? oo(
            t.nodeLookup,
            { x: 0, y: 0, width: t.width, height: t.height },
            t.transform,
            !0,
          ).map((n) => n.id)
        : Array.from(t.nodeLookup.keys());
  function Pg(e) {
    return K((0, C.useCallback)(Og(e), [e]), oe);
  }
  var Ag = (e) => e.updateNodeInternals;
  function Tg() {
    let e = K(Ag),
      [t] = (0, C.useState)(() =>
        typeof ResizeObserver > "u"
          ? null
          : new ResizeObserver((n) => {
              let o = new Map();
              (n.forEach((r) => {
                let i = r.target.getAttribute("data-id");
                o.set(i, { id: i, nodeElement: r.target, force: !0 });
              }),
                e(o));
            }),
      );
    return (
      (0, C.useEffect)(
        () => () => {
          t?.disconnect();
        },
        [t],
      ),
      t
    );
  }
  function Dg({ node: e, nodeType: t, hasDimensions: n, resizeObserver: o }) {
    let r = ne(),
      i = (0, C.useRef)(null),
      s = (0, C.useRef)(null),
      a = (0, C.useRef)(e.sourcePosition),
      c = (0, C.useRef)(e.targetPosition),
      l = (0, C.useRef)(t),
      u = n && !!e.internals.handleBounds;
    return (
      (0, C.useEffect)(() => {
        i.current &&
          !e.hidden &&
          (!u || s.current !== i.current) &&
          (s.current && o?.unobserve(s.current),
          o?.observe(i.current),
          (s.current = i.current));
      }, [u, e.hidden]),
      (0, C.useEffect)(
        () => () => {
          s.current && (o?.unobserve(s.current), (s.current = null));
        },
        [],
      ),
      (0, C.useEffect)(() => {
        if (i.current) {
          let d = l.current !== t,
            f = a.current !== e.sourcePosition,
            h = c.current !== e.targetPosition;
          (d || f || h) &&
            ((l.current = t),
            (a.current = e.sourcePosition),
            (c.current = e.targetPosition),
            r
              .getState()
              .updateNodeInternals(
                new Map([
                  [e.id, { id: e.id, nodeElement: i.current, force: !0 }],
                ]),
              ));
        }
      }, [e.id, t, e.sourcePosition, e.targetPosition]),
      i
    );
  }
  function zg({
    id: e,
    onClick: t,
    onMouseEnter: n,
    onMouseMove: o,
    onMouseLeave: r,
    onContextMenu: i,
    onDoubleClick: s,
    nodesDraggable: a,
    elementsSelectable: c,
    nodesConnectable: l,
    nodesFocusable: u,
    resizeObserver: d,
    noDragClassName: f,
    noPanClassName: h,
    disableKeyboardA11y: p,
    rfId: x,
    nodeTypes: y,
    nodeClickDistance: m,
    onError: b,
  }) {
    let {
        node: g,
        internals: v,
        isParent: N,
      } = K((R) => {
        let F = R.nodeLookup.get(e),
          Q = R.parentLookup.has(e);
        return { node: F, internals: F.internals, isParent: Q };
      }, oe),
      _ = g.type || "default",
      I = y?.[_] || bc[_];
    I === void 0 &&
      (b?.("003", pe.error003(_)),
      (_ = "default"),
      (I = y?.default || bc.default));
    let O = !!(g.draggable || (a && typeof g.draggable > "u")),
      P = !!(g.selectable || (c && typeof g.selectable > "u")),
      B = !!(g.connectable || (l && typeof g.connectable > "u")),
      D = !!(g.focusable || (u && typeof g.focusable > "u")),
      $ = ne(),
      z = ao(g),
      w = Dg({ node: g, nodeType: _, hasDimensions: z, resizeObserver: d }),
      E = Zc({
        nodeRef: w,
        disabled: g.hidden || !O,
        noDragClassName: f,
        handleSelector: g.dragHandle,
        nodeId: e,
        isSelectable: P,
        nodeClickDistance: m,
      }),
      S = Wc();
    if (g.hidden) return null;
    let M = Se(g),
      T = Ng(g),
      A = P || O || t || n || o || r,
      V = n ? (R) => n(R, { ...v.userNode }) : void 0,
      H = o ? (R) => o(R, { ...v.userNode }) : void 0,
      L = r ? (R) => r(R, { ...v.userNode }) : void 0,
      Z = i ? (R) => i(R, { ...v.userNode }) : void 0,
      X = s ? (R) => s(R, { ...v.userNode }) : void 0,
      q = (R) => {
        let { selectNodesOnDrag: F, nodeDragThreshold: Q } = $.getState();
        (P && (!F || !O || Q > 0) && _r({ id: e, store: $, nodeRef: w }),
          t && t(R, { ...v.userNode }));
      },
      J = (R) => {
        if (!(dr(R.nativeEvent) || p)) {
          if (Ko.includes(R.key) && P) {
            let F = R.key === "Escape";
            _r({ id: e, store: $, unselect: F, nodeRef: w });
          } else if (
            O &&
            g.selected &&
            Object.prototype.hasOwnProperty.call(xo, R.key)
          ) {
            R.preventDefault();
            let { ariaLabelConfig: F } = $.getState();
            ($.setState({
              ariaLiveMessage: F["node.a11yDescription.ariaLiveMessage"]({
                direction: R.key.replace("Arrow", "").toLowerCase(),
                x: ~~v.positionAbsolute.x,
                y: ~~v.positionAbsolute.y,
              }),
            }),
              S({ direction: xo[R.key], factor: R.shiftKey ? 4 : 1 }));
          }
        }
      },
      G = () => {
        if (p || !w.current?.matches(":focus-visible")) return;
        let {
          transform: R,
          width: F,
          height: Q,
          autoPanOnNodeFocus: U,
          setCenter: W,
        } = $.getState();
        if (!U) return;
        oo(new Map([[e, g]]), { x: 0, y: 0, width: F, height: Q }, R, !0)
          .length > 0 ||
          W(g.position.x + M.width / 2, g.position.y + M.height / 2, {
            zoom: R[2],
          });
      };
    return (0, k.jsx)("div", {
      className: ie([
        "react-flow__node",
        `react-flow__node-${_}`,
        { [h]: O },
        g.className,
        {
          selected: g.selected,
          selectable: P,
          parent: N,
          draggable: O,
          dragging: E,
        },
      ]),
      ref: w,
      style: {
        zIndex: v.z,
        transform: `translate(${v.positionAbsolute.x}px,${v.positionAbsolute.y}px)`,
        pointerEvents: A ? "all" : "none",
        visibility: z ? "visible" : "hidden",
        ...g.style,
        ...T,
      },
      "data-id": e,
      "data-testid": `rf__node-${e}`,
      onMouseEnter: V,
      onMouseMove: H,
      onMouseLeave: L,
      onContextMenu: Z,
      onClick: q,
      onDoubleClick: X,
      onKeyDown: D ? J : void 0,
      tabIndex: D ? 0 : void 0,
      onFocus: D ? G : void 0,
      role: g.ariaRole ?? (D ? "group" : void 0),
      "aria-roledescription": "node",
      "aria-describedby": p ? void 0 : `${zc}-${x}`,
      "aria-label": g.ariaLabel,
      ...g.domAttributes,
      children: (0, k.jsx)(pg, {
        value: e,
        children: (0, k.jsx)(I, {
          id: e,
          data: g.data,
          type: _,
          positionAbsoluteX: v.positionAbsolute.x,
          positionAbsoluteY: v.positionAbsolute.y,
          selected: g.selected ?? !1,
          selectable: P,
          draggable: O,
          deletable: g.deletable ?? !0,
          isConnectable: B,
          sourcePosition: g.sourcePosition,
          targetPosition: g.targetPosition,
          dragging: E,
          dragHandle: g.dragHandle,
          zIndex: v.z,
          parentId: g.parentId,
          ...M,
        }),
      }),
    });
  }
  var Rg = (0, C.memo)(zg),
    Lg = (e) => ({
      nodesConnectable: e.nodesConnectable,
      nodesFocusable: e.nodesFocusable,
      elementsSelectable: e.elementsSelectable,
      onError: e.onError,
    });
  function jc(e) {
    let {
        nodesConnectable: t,
        nodesFocusable: n,
        elementsSelectable: o,
        onError: r,
      } = K(Lg, oe),
      i = Pg(e.onlyRenderVisibleElements),
      s = Tg();
    return (0, k.jsx)("div", {
      className: "react-flow__nodes",
      style: Eo,
      children: i.map((a) =>
        (0, k.jsx)(
          Rg,
          {
            id: a,
            nodeTypes: e.nodeTypes,
            nodeExtent: e.nodeExtent,
            onClick: e.onNodeClick,
            onMouseEnter: e.onNodeMouseEnter,
            onMouseMove: e.onNodeMouseMove,
            onMouseLeave: e.onNodeMouseLeave,
            onContextMenu: e.onNodeContextMenu,
            onDoubleClick: e.onNodeDoubleClick,
            noDragClassName: e.noDragClassName,
            noPanClassName: e.noPanClassName,
            rfId: e.rfId,
            disableKeyboardA11y: e.disableKeyboardA11y,
            resizeObserver: s,
            nodesDraggable: e.nodesDraggable ?? !0,
            nodesConnectable: t,
            nodesFocusable: n,
            elementsSelectable: o,
            nodeClickDistance: e.nodeClickDistance,
            onError: r,
          },
          a,
        ),
      ),
    });
  }
  jc.displayName = "NodeRenderer";
  var $g = (0, C.memo)(jc);
  function Hg(e) {
    return K(
      (0, C.useCallback)(
        (n) => {
          if (!e) return n.edges.map((r) => r.id);
          let o = [];
          if (n.width && n.height)
            for (let r of n.edges) {
              let i = n.nodeLookup.get(r.source),
                s = n.nodeLookup.get(r.target);
              i &&
                s &&
                xa({
                  sourceNode: i,
                  targetNode: s,
                  width: n.width,
                  height: n.height,
                  transform: n.transform,
                }) &&
                o.push(r.id);
            }
          return o;
        },
        [e],
      ),
      oe,
    );
  }
  var Bg = ({ color: e = "none", strokeWidth: t = 1 }) => {
      let n = { strokeWidth: t, ...(e && { stroke: e }) };
      return (0, k.jsx)("polyline", {
        className: "arrow",
        style: n,
        strokeLinecap: "round",
        fill: "none",
        strokeLinejoin: "round",
        points: "-5,-4 0,0 -5,4",
      });
    },
    Vg = ({ color: e = "none", strokeWidth: t = 1 }) => {
      let n = { strokeWidth: t, ...(e && { stroke: e, fill: e }) };
      return (0, k.jsx)("polyline", {
        className: "arrowclosed",
        style: n,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        points: "-5,-4 0,0 -5,4 -5,-4",
      });
    },
    _c = { [ct.Arrow]: Bg, [ct.ArrowClosed]: Vg };
  function Fg(e) {
    let t = ne();
    return (0, C.useMemo)(
      () =>
        Object.prototype.hasOwnProperty.call(_c, e)
          ? _c[e]
          : (t.getState().onError?.("009", pe.error009(e)), null),
      [e],
    );
  }
  var Yg = ({
      id: e,
      type: t,
      color: n,
      width: o = 12.5,
      height: r = 12.5,
      markerUnits: i = "strokeWidth",
      strokeWidth: s,
      orient: a = "auto-start-reverse",
    }) => {
      let c = Fg(t);
      return c
        ? (0, k.jsx)("marker", {
            className: "react-flow__arrowhead",
            id: e,
            markerWidth: `${o}`,
            markerHeight: `${r}`,
            viewBox: "-10 -10 20 20",
            markerUnits: i,
            orient: a,
            refX: "0",
            refY: "0",
            children: (0, k.jsx)(c, { color: n, strokeWidth: s }),
          })
        : null;
    },
    Kc = ({ defaultColor: e, rfId: t }) => {
      let n = K((i) => i.edges),
        o = K((i) => i.defaultEdgeOptions),
        r = (0, C.useMemo)(
          () =>
            _a(n, {
              id: t,
              defaultColor: e,
              defaultMarkerStart: o?.markerStart,
              defaultMarkerEnd: o?.markerEnd,
            }),
          [n, o, t, e],
        );
      return r.length
        ? (0, k.jsx)("svg", {
            className: "react-flow__marker",
            "aria-hidden": "true",
            children: (0, k.jsx)("defs", {
              children: r.map((i) =>
                (0, k.jsx)(
                  Yg,
                  {
                    id: i.id,
                    type: i.type,
                    color: i.color,
                    width: i.width,
                    height: i.height,
                    markerUnits: i.markerUnits,
                    strokeWidth: i.strokeWidth,
                    orient: i.orient,
                  },
                  i.id,
                ),
              ),
            }),
          })
        : null;
    };
  Kc.displayName = "MarkerDefinitions";
  var Xg = (0, C.memo)(Kc);
  function Uc({
    x: e,
    y: t,
    label: n,
    labelStyle: o,
    labelShowBg: r = !0,
    labelBgStyle: i,
    labelBgPadding: s = [2, 4],
    labelBgBorderRadius: a = 2,
    children: c,
    className: l,
    ...u
  }) {
    let [d, f] = (0, C.useState)({ x: 1, y: 0, width: 0, height: 0 }),
      h = ie(["react-flow__edge-textwrapper", l]),
      p = (0, C.useRef)(null);
    return (
      (0, C.useEffect)(() => {
        if (p.current) {
          let x = p.current.getBBox();
          f({ x: x.x, y: x.y, width: x.width, height: x.height });
        }
      }, [n]),
      n
        ? (0, k.jsxs)("g", {
            transform: `translate(${e - d.width / 2} ${t - d.height / 2})`,
            className: h,
            visibility: d.width ? "visible" : "hidden",
            ...u,
            children: [
              r &&
                (0, k.jsx)("rect", {
                  width: d.width + 2 * s[0],
                  x: -s[0],
                  y: -s[1],
                  height: d.height + 2 * s[1],
                  className: "react-flow__edge-textbg",
                  style: i,
                  rx: a,
                  ry: a,
                }),
              (0, k.jsx)("text", {
                className: "react-flow__edge-text",
                y: d.height / 2,
                dy: "0.3em",
                ref: p,
                style: o,
                children: n,
              }),
              c,
            ],
          })
        : null
    );
  }
  Uc.displayName = "EdgeText";
  var Qc = (0, C.memo)(Uc);
  function xn({
    path: e,
    labelX: t,
    labelY: n,
    label: o,
    labelStyle: r,
    labelShowBg: i,
    labelBgStyle: s,
    labelBgPadding: a,
    labelBgBorderRadius: c,
    interactionWidth: l = 20,
    ...u
  }) {
    return (0, k.jsxs)(k.Fragment, {
      children: [
        (0, k.jsx)("path", {
          ...u,
          d: e,
          fill: "none",
          className: ie(["react-flow__edge-path", u.className]),
        }),
        l
          ? (0, k.jsx)("path", {
              d: e,
              fill: "none",
              strokeOpacity: 0,
              strokeWidth: l,
              className: "react-flow__edge-interaction",
            })
          : null,
        o && me(t) && me(n)
          ? (0, k.jsx)(Qc, {
              x: t,
              y: n,
              label: o,
              labelStyle: r,
              labelShowBg: i,
              labelBgStyle: s,
              labelBgPadding: a,
              labelBgBorderRadius: c,
            })
          : null,
      ],
    });
  }
  function Sc({ pos: e, x1: t, y1: n, x2: o, y2: r }) {
    return e === Y.Left || e === Y.Right
      ? [0.5 * (t + o), n]
      : [t, 0.5 * (n + r)];
  }
  function Ir({
    sourceX: e,
    sourceY: t,
    sourcePosition: n = Y.Bottom,
    targetX: o,
    targetY: r,
    targetPosition: i = Y.Top,
  }) {
    let [s, a] = Sc({ pos: n, x1: e, y1: t, x2: o, y2: r }),
      [c, l] = Sc({ pos: i, x1: o, y1: r, x2: e, y2: t }),
      [u, d, f, h] = fn({
        sourceX: e,
        sourceY: t,
        targetX: o,
        targetY: r,
        sourceControlX: s,
        sourceControlY: a,
        targetControlX: c,
        targetControlY: l,
      });
    return [`M${e},${t} C${s},${a} ${c},${l} ${o},${r}`, u, d, f, h];
  }
  function Jc(e) {
    return (0, C.memo)(
      ({
        id: t,
        sourceX: n,
        sourceY: o,
        targetX: r,
        targetY: i,
        sourcePosition: s,
        targetPosition: a,
        label: c,
        labelStyle: l,
        labelShowBg: u,
        labelBgStyle: d,
        labelBgPadding: f,
        labelBgBorderRadius: h,
        style: p,
        markerEnd: x,
        markerStart: y,
        interactionWidth: m,
      }) => {
        let [b, g, v] = Ir({
            sourceX: n,
            sourceY: o,
            sourcePosition: s,
            targetX: r,
            targetY: i,
            targetPosition: a,
          }),
          N = e.isInternal ? void 0 : t;
        return (0, k.jsx)(xn, {
          id: N,
          path: b,
          labelX: g,
          labelY: v,
          label: c,
          labelStyle: l,
          labelShowBg: u,
          labelBgStyle: d,
          labelBgPadding: f,
          labelBgBorderRadius: h,
          style: p,
          markerEnd: x,
          markerStart: y,
          interactionWidth: m,
        });
      },
    );
  }
  var el = Jc({ isInternal: !1 }),
    tl = Jc({ isInternal: !0 });
  el.displayName = "SimpleBezierEdge";
  tl.displayName = "SimpleBezierEdgeInternal";
  function nl(e) {
    return (0, C.memo)(
      ({
        id: t,
        sourceX: n,
        sourceY: o,
        targetX: r,
        targetY: i,
        label: s,
        labelStyle: a,
        labelShowBg: c,
        labelBgStyle: l,
        labelBgPadding: u,
        labelBgBorderRadius: d,
        style: f,
        sourcePosition: h = Y.Bottom,
        targetPosition: p = Y.Top,
        markerEnd: x,
        markerStart: y,
        pathOptions: m,
        interactionWidth: b,
      }) => {
        let [g, v, N] = kt({
            sourceX: n,
            sourceY: o,
            sourcePosition: h,
            targetX: r,
            targetY: i,
            targetPosition: p,
            borderRadius: m?.borderRadius,
            offset: m?.offset,
            stepPosition: m?.stepPosition,
          }),
          _ = e.isInternal ? void 0 : t;
        return (0, k.jsx)(xn, {
          id: _,
          path: g,
          labelX: v,
          labelY: N,
          label: s,
          labelStyle: a,
          labelShowBg: c,
          labelBgStyle: l,
          labelBgPadding: u,
          labelBgBorderRadius: d,
          style: f,
          markerEnd: x,
          markerStart: y,
          interactionWidth: b,
        });
      },
    );
  }
  var kr = nl({ isInternal: !1 }),
    ol = nl({ isInternal: !0 });
  kr.displayName = "SmoothStepEdge";
  ol.displayName = "SmoothStepEdgeInternal";
  function rl(e) {
    return (0, C.memo)(({ id: t, ...n }) => {
      let o = e.isInternal ? void 0 : t;
      return (0, k.jsx)(kr, {
        ...n,
        id: o,
        pathOptions: (0, C.useMemo)(
          () => ({ borderRadius: 0, offset: n.pathOptions?.offset }),
          [n.pathOptions?.offset],
        ),
      });
    });
  }
  var il = rl({ isInternal: !1 }),
    sl = rl({ isInternal: !0 });
  il.displayName = "StepEdge";
  sl.displayName = "StepEdgeInternal";
  function al(e) {
    return (0, C.memo)(
      ({
        id: t,
        sourceX: n,
        sourceY: o,
        targetX: r,
        targetY: i,
        label: s,
        labelStyle: a,
        labelShowBg: c,
        labelBgStyle: l,
        labelBgPadding: u,
        labelBgBorderRadius: d,
        style: f,
        markerEnd: h,
        markerStart: p,
        interactionWidth: x,
      }) => {
        let [y, m, b] = pn({ sourceX: n, sourceY: o, targetX: r, targetY: i }),
          g = e.isInternal ? void 0 : t;
        return (0, k.jsx)(xn, {
          id: g,
          path: y,
          labelX: m,
          labelY: b,
          label: s,
          labelStyle: a,
          labelShowBg: c,
          labelBgStyle: l,
          labelBgPadding: u,
          labelBgBorderRadius: d,
          style: f,
          markerEnd: h,
          markerStart: p,
          interactionWidth: x,
        });
      },
    );
  }
  var cl = al({ isInternal: !1 }),
    ll = al({ isInternal: !0 });
  cl.displayName = "StraightEdge";
  ll.displayName = "StraightEdgeInternal";
  function ul(e) {
    return (0, C.memo)(
      ({
        id: t,
        sourceX: n,
        sourceY: o,
        targetX: r,
        targetY: i,
        sourcePosition: s = Y.Bottom,
        targetPosition: a = Y.Top,
        label: c,
        labelStyle: l,
        labelShowBg: u,
        labelBgStyle: d,
        labelBgPadding: f,
        labelBgBorderRadius: h,
        style: p,
        markerEnd: x,
        markerStart: y,
        pathOptions: m,
        interactionWidth: b,
      }) => {
        let [g, v, N] = hn({
            sourceX: n,
            sourceY: o,
            sourcePosition: s,
            targetX: r,
            targetY: i,
            targetPosition: a,
            curvature: m?.curvature,
          }),
          _ = e.isInternal ? void 0 : t;
        return (0, k.jsx)(xn, {
          id: _,
          path: g,
          labelX: v,
          labelY: N,
          label: c,
          labelStyle: l,
          labelShowBg: u,
          labelBgStyle: d,
          labelBgPadding: f,
          labelBgBorderRadius: h,
          style: p,
          markerEnd: x,
          markerStart: y,
          interactionWidth: b,
        });
      },
    );
  }
  var dl = ul({ isInternal: !1 }),
    fl = ul({ isInternal: !0 });
  dl.displayName = "BezierEdge";
  fl.displayName = "BezierEdgeInternal";
  var Nc = {
      default: fl,
      straight: ll,
      step: sl,
      smoothstep: ol,
      simplebezier: tl,
    },
    Cc = {
      sourceX: null,
      sourceY: null,
      targetX: null,
      targetY: null,
      sourcePosition: null,
      targetPosition: null,
      zIndex: void 0,
    },
    Zg = (e, t, n) => (n === Y.Left ? e - t : n === Y.Right ? e + t : e),
    Wg = (e, t, n) => (n === Y.Top ? e - t : n === Y.Bottom ? e + t : e),
    Mc = "react-flow__edgeupdater";
  function Ic({
    position: e,
    centerX: t,
    centerY: n,
    radius: o = 10,
    onMouseDown: r,
    onMouseEnter: i,
    onMouseOut: s,
    type: a,
  }) {
    return (0, k.jsx)("circle", {
      onMouseDown: r,
      onMouseEnter: i,
      onMouseOut: s,
      className: ie([Mc, `${Mc}-${a}`]),
      cx: Zg(t, o, e),
      cy: Wg(n, o, e),
      r: o,
      stroke: "transparent",
      fill: "transparent",
    });
  }
  function qg({
    isReconnectable: e,
    reconnectRadius: t,
    edge: n,
    sourceX: o,
    sourceY: r,
    targetX: i,
    targetY: s,
    sourcePosition: a,
    targetPosition: c,
    onReconnect: l,
    onReconnectStart: u,
    onReconnectEnd: d,
    setReconnecting: f,
    setUpdateHover: h,
  }) {
    let p = ne(),
      x = (v, N) => {
        if (v.button !== 0) return;
        let {
            autoPanOnConnect: _,
            domNode: I,
            connectionMode: O,
            connectionRadius: P,
            lib: B,
            onConnectStart: D,
            cancelConnection: $,
            nodeLookup: z,
            rfId: w,
            panBy: E,
            updateConnection: S,
          } = p.getState(),
          M = N.type === "target",
          T = (H, L) => {
            (f(!1), d?.(H, n, N.type, L));
          },
          A = (H) => l?.(n, H),
          V = (H, L) => {
            (f(!0), u?.(v, n, N.type), D?.(H, L));
          };
        po.onPointerDown(v.nativeEvent, {
          autoPanOnConnect: _,
          connectionMode: O,
          connectionRadius: P,
          domNode: I,
          handleId: N.id,
          nodeId: N.nodeId,
          nodeLookup: z,
          isTarget: M,
          edgeUpdaterType: N.type,
          lib: B,
          flowId: w,
          cancelConnection: $,
          panBy: E,
          isValidConnection: (...H) =>
            p.getState().isValidConnection?.(...H) ?? !0,
          onConnect: A,
          onConnectStart: V,
          onConnectEnd: (...H) => p.getState().onConnectEnd?.(...H),
          onReconnectEnd: T,
          updateConnection: S,
          getTransform: () => p.getState().transform,
          getFromHandle: () => p.getState().connection.fromHandle,
          dragThreshold: p.getState().connectionDragThreshold,
          handleDomNode: v.currentTarget,
        });
      },
      y = (v) =>
        x(v, { nodeId: n.target, id: n.targetHandle ?? null, type: "target" }),
      m = (v) =>
        x(v, { nodeId: n.source, id: n.sourceHandle ?? null, type: "source" }),
      b = () => h(!0),
      g = () => h(!1);
    return (0, k.jsxs)(k.Fragment, {
      children: [
        (e === !0 || e === "source") &&
          (0, k.jsx)(Ic, {
            position: a,
            centerX: o,
            centerY: r,
            radius: t,
            onMouseDown: y,
            onMouseEnter: b,
            onMouseOut: g,
            type: "source",
          }),
        (e === !0 || e === "target") &&
          (0, k.jsx)(Ic, {
            position: c,
            centerX: i,
            centerY: s,
            radius: t,
            onMouseDown: m,
            onMouseEnter: b,
            onMouseOut: g,
            type: "target",
          }),
      ],
    });
  }
  function Gg({
    id: e,
    edgesFocusable: t,
    edgesReconnectable: n,
    elementsSelectable: o,
    onClick: r,
    onDoubleClick: i,
    onContextMenu: s,
    onMouseEnter: a,
    onMouseMove: c,
    onMouseLeave: l,
    reconnectRadius: u,
    onReconnect: d,
    onReconnectStart: f,
    onReconnectEnd: h,
    rfId: p,
    edgeTypes: x,
    noPanClassName: y,
    onError: m,
    disableKeyboardA11y: b,
  }) {
    let g = K((W) => W.edgeLookup.get(e)),
      v = K((W) => W.defaultEdgeOptions);
    g = v ? { ...v, ...g } : g;
    let N = g.type || "default",
      _ = x?.[N] || Nc[N];
    _ === void 0 &&
      (m?.("011", pe.error011(N)),
      (N = "default"),
      (_ = x?.default || Nc.default));
    let I = !!(g.focusable || (t && typeof g.focusable > "u")),
      O =
        typeof d < "u" &&
        (g.reconnectable || (n && typeof g.reconnectable > "u")),
      P = !!(g.selectable || (o && typeof g.selectable > "u")),
      B = (0, C.useRef)(null),
      [D, $] = (0, C.useState)(!1),
      [z, w] = (0, C.useState)(!1),
      E = ne(),
      {
        zIndex: S = g.zIndex,
        sourceX: M,
        sourceY: T,
        targetX: A,
        targetY: V,
        sourcePosition: H,
        targetPosition: L,
      } = K(
        (0, C.useCallback)(
          (W) => {
            let j = W.nodeLookup.get(g.source),
              ee = W.nodeLookup.get(g.target);
            if (!j || !ee) return Cc;
            let te = Ea({
                id: e,
                sourceNode: j,
                targetNode: ee,
                sourceHandle: g.sourceHandle || null,
                targetHandle: g.targetHandle || null,
                connectionMode: W.connectionMode,
                onError: m,
              }),
              re = ya({
                selected: g.selected,
                zIndex: g.zIndex,
                sourceNode: j,
                targetNode: ee,
                elevateOnSelect: W.elevateEdgesOnSelect,
                zIndexMode: W.zIndexMode,
              });
            return { ...(te || Cc), zIndex: re };
          },
          [
            g.source,
            g.target,
            g.sourceHandle,
            g.targetHandle,
            g.selected,
            g.zIndex,
          ],
        ),
        oe,
      ),
      Z = (0, C.useMemo)(
        () => (g.markerStart ? `url('#${uo(g.markerStart, p)}')` : void 0),
        [g.markerStart, p],
      ),
      X = (0, C.useMemo)(
        () => (g.markerEnd ? `url('#${uo(g.markerEnd, p)}')` : void 0),
        [g.markerEnd, p],
      );
    if (g.hidden || M === null || T === null || A === null || V === null)
      return null;
    let q = (W) => {
        let {
          addSelectedEdges: j,
          unselectNodesAndEdges: ee,
          multiSelectionActive: te,
        } = E.getState();
        (P &&
          (E.setState({ nodesSelectionActive: !1 }),
          g.selected && te
            ? (ee({ nodes: [], edges: [g] }), B.current?.blur())
            : j([e])),
          r && r(W, g));
      },
      J = i
        ? (W) => {
            i(W, { ...g });
          }
        : void 0,
      G = s
        ? (W) => {
            s(W, { ...g });
          }
        : void 0,
      R = a
        ? (W) => {
            a(W, { ...g });
          }
        : void 0,
      F = c
        ? (W) => {
            c(W, { ...g });
          }
        : void 0,
      Q = l
        ? (W) => {
            l(W, { ...g });
          }
        : void 0,
      U = (W) => {
        if (!b && Ko.includes(W.key) && P) {
          let { unselectNodesAndEdges: j, addSelectedEdges: ee } = E.getState();
          W.key === "Escape" ? (B.current?.blur(), j({ edges: [g] })) : ee([e]);
        }
      };
    return (0, k.jsx)("svg", {
      style: { zIndex: S },
      children: (0, k.jsxs)("g", {
        className: ie([
          "react-flow__edge",
          `react-flow__edge-${N}`,
          g.className,
          y,
          {
            selected: g.selected,
            animated: g.animated,
            inactive: !P && !r,
            updating: D,
            selectable: P,
          },
        ]),
        onClick: q,
        onDoubleClick: J,
        onContextMenu: G,
        onMouseEnter: R,
        onMouseMove: F,
        onMouseLeave: Q,
        onKeyDown: I ? U : void 0,
        tabIndex: I ? 0 : void 0,
        role: g.ariaRole ?? (I ? "group" : "img"),
        "aria-roledescription": "edge",
        "data-id": e,
        "data-testid": `rf__edge-${e}`,
        "aria-label":
          g.ariaLabel === null
            ? void 0
            : g.ariaLabel || `Edge from ${g.source} to ${g.target}`,
        "aria-describedby": I ? `${Rc}-${p}` : void 0,
        ref: B,
        ...g.domAttributes,
        children: [
          !z &&
            (0, k.jsx)(_, {
              id: e,
              source: g.source,
              target: g.target,
              type: g.type,
              selected: g.selected,
              animated: g.animated,
              selectable: P,
              deletable: g.deletable ?? !0,
              label: g.label,
              labelStyle: g.labelStyle,
              labelShowBg: g.labelShowBg,
              labelBgStyle: g.labelBgStyle,
              labelBgPadding: g.labelBgPadding,
              labelBgBorderRadius: g.labelBgBorderRadius,
              sourceX: M,
              sourceY: T,
              targetX: A,
              targetY: V,
              sourcePosition: H,
              targetPosition: L,
              data: g.data,
              style: g.style,
              sourceHandleId: g.sourceHandle,
              targetHandleId: g.targetHandle,
              markerStart: Z,
              markerEnd: X,
              pathOptions: "pathOptions" in g ? g.pathOptions : void 0,
              interactionWidth: g.interactionWidth,
            }),
          O &&
            (0, k.jsx)(qg, {
              edge: g,
              isReconnectable: O,
              reconnectRadius: u,
              onReconnect: d,
              onReconnectStart: f,
              onReconnectEnd: h,
              sourceX: M,
              sourceY: T,
              targetX: A,
              targetY: V,
              sourcePosition: H,
              targetPosition: L,
              setUpdateHover: $,
              setReconnecting: w,
            }),
        ],
      }),
    });
  }
  var jg = (0, C.memo)(Gg),
    Kg = (e) => ({
      edgesFocusable: e.edgesFocusable,
      edgesReconnectable: e.edgesReconnectable,
      elementsSelectable: e.elementsSelectable,
      connectionMode: e.connectionMode,
      onError: e.onError,
    });
  function hl({
    defaultMarkerColor: e,
    onlyRenderVisibleElements: t,
    rfId: n,
    edgeTypes: o,
    noPanClassName: r,
    onReconnect: i,
    onEdgeContextMenu: s,
    onEdgeMouseEnter: a,
    onEdgeMouseMove: c,
    onEdgeMouseLeave: l,
    onEdgeClick: u,
    reconnectRadius: d,
    onEdgeDoubleClick: f,
    onReconnectStart: h,
    onReconnectEnd: p,
    disableKeyboardA11y: x,
  }) {
    let {
        edgesFocusable: y,
        edgesReconnectable: m,
        elementsSelectable: b,
        onError: g,
      } = K(Kg, oe),
      v = Hg(t);
    return (0, k.jsxs)("div", {
      className: "react-flow__edges",
      children: [
        (0, k.jsx)(Xg, { defaultColor: e, rfId: n }),
        v.map((N) =>
          (0, k.jsx)(
            jg,
            {
              id: N,
              edgesFocusable: y,
              edgesReconnectable: m,
              elementsSelectable: b,
              noPanClassName: r,
              onReconnect: i,
              onContextMenu: s,
              onMouseEnter: a,
              onMouseMove: c,
              onMouseLeave: l,
              onClick: u,
              reconnectRadius: d,
              onDoubleClick: f,
              onReconnectStart: h,
              onReconnectEnd: p,
              rfId: n,
              onError: g,
              edgeTypes: o,
              disableKeyboardA11y: x,
            },
            N,
          ),
        ),
      ],
    });
  }
  hl.displayName = "EdgeRenderer";
  var Ug = (0, C.memo)(hl),
    kc = (e) => `translate(${e[0]}px,${e[1]}px) scale(${e[2]})`;
  function Qg({ children: e }) {
    let t = ne(),
      n = (0, C.useRef)(null),
      [o] = (0, C.useState)(() => t.getState().transform);
    return (
      Yc(() => {
        let r = null,
          i = () => {
            let s = t.getState().transform;
            (r && s[0] === r[0] && s[1] === r[1] && s[2] === r[2]) ||
              ((r = s), n.current && (n.current.style.transform = kc(s)));
          };
        return (i(), t.subscribe(i));
      }, [t]),
      (0, k.jsx)("div", {
        ref: n,
        className:
          "react-flow__viewport xyflow__viewport react-flow__container",
        style: { transform: kc(o) },
        children: e,
      })
    );
  }
  function Jg(e) {
    let t = bo(),
      n = (0, C.useRef)(!1);
    (0, C.useEffect)(() => {
      !n.current &&
        t.viewportInitialized &&
        e &&
        (setTimeout(() => e(t), 1), (n.current = !0));
    }, [e, t.viewportInitialized]);
  }
  var em = (e) => e.panZoom?.syncViewport;
  function tm(e) {
    let t = K(em),
      n = ne();
    return (
      (0, C.useEffect)(() => {
        e && (t?.(e), n.setState({ transform: [e.x, e.y, e.zoom] }));
      }, [e, t]),
      null
    );
  }
  function Oc(e) {
    return e.connection.inProgress
      ? { ...e.connection, to: Ct(e.connection.to, e.transform) }
      : { ...e.connection };
  }
  function nm(e) {
    return e
      ? (n) => {
          let o = Oc(n);
          return e(o);
        }
      : Oc;
  }
  function pl(e) {
    let t = nm(e);
    return K(t, oe);
  }
  var om = (e) => ({
    nodesConnectable: e.nodesConnectable,
    isValid: e.connection.isValid,
    inProgress: e.connection.inProgress,
    width: e.width,
    height: e.height,
  });
  function rm({ containerStyle: e, style: t, type: n, component: o }) {
    let {
      nodesConnectable: r,
      width: i,
      height: s,
      isValid: a,
      inProgress: c,
    } = K(om, oe);
    return !(i && r && c)
      ? null
      : (0, k.jsx)("svg", {
          style: e,
          width: i,
          height: s,
          className: "react-flow__connectionline react-flow__container",
          children: (0, k.jsx)("g", {
            className: ie(["react-flow__connection", er(a)]),
            children: (0, k.jsx)(gl, {
              style: t,
              type: n,
              CustomComponent: o,
              isValid: a,
            }),
          }),
        });
  }
  var gl = ({
    style: e,
    type: t = _e.Bezier,
    CustomComponent: n,
    isValid: o,
  }) => {
    let {
      inProgress: r,
      from: i,
      fromNode: s,
      fromHandle: a,
      fromPosition: c,
      to: l,
      toNode: u,
      toHandle: d,
      toPosition: f,
      pointer: h,
    } = pl();
    if (!r) return;
    if (n)
      return (0, k.jsx)(n, {
        connectionLineType: t,
        connectionLineStyle: e,
        fromNode: s,
        fromHandle: a,
        fromX: i.x,
        fromY: i.y,
        toX: l.x,
        toY: l.y,
        fromPosition: c,
        toPosition: f,
        connectionStatus: er(o),
        toNode: u,
        toHandle: d,
        pointer: h,
      });
    let p = "",
      x = {
        sourceX: i.x,
        sourceY: i.y,
        sourcePosition: c,
        targetX: l.x,
        targetY: l.y,
        targetPosition: f,
      };
    switch (t) {
      case _e.Bezier:
        [p] = hn(x);
        break;
      case _e.SimpleBezier:
        [p] = Ir(x);
        break;
      case _e.Step:
        [p] = kt({ ...x, borderRadius: 0 });
        break;
      case _e.SmoothStep:
        [p] = kt(x);
        break;
      default:
        [p] = pn(x);
    }
    return (0, k.jsx)("path", {
      d: p,
      fill: "none",
      className: "react-flow__connection-path",
      style: e,
    });
  };
  gl.displayName = "ConnectionLine";
  var im = {};
  function Pc(e = im) {
    let t = (0, C.useRef)(e),
      n = ne();
    (0, C.useEffect)(() => {}, [e]);
  }
  function sm() {
    let e = ne(),
      t = (0, C.useRef)(!1);
    (0, C.useEffect)(() => {}, []);
  }
  function ml({
    nodeTypes: e,
    edgeTypes: t,
    onInit: n,
    onNodeClick: o,
    onEdgeClick: r,
    onNodeDoubleClick: i,
    onEdgeDoubleClick: s,
    onNodeMouseEnter: a,
    onNodeMouseMove: c,
    onNodeMouseLeave: l,
    onNodeContextMenu: u,
    onSelectionContextMenu: d,
    onSelectionStart: f,
    onSelectionEnd: h,
    connectionLineType: p,
    connectionLineStyle: x,
    connectionLineComponent: y,
    connectionLineContainerStyle: m,
    selectionKeyCode: b,
    selectionOnDrag: g,
    selectionMode: v,
    multiSelectionKeyCode: N,
    panActivationKeyCode: _,
    zoomActivationKeyCode: I,
    deleteKeyCode: O,
    onlyRenderVisibleElements: P,
    elementsSelectable: B,
    defaultViewport: D,
    translateExtent: $,
    minZoom: z,
    maxZoom: w,
    preventScrolling: E,
    defaultMarkerColor: S,
    zoomOnScroll: M,
    zoomOnPinch: T,
    panOnScroll: A,
    panOnScrollSpeed: V,
    panOnScrollMode: H,
    zoomOnDoubleClick: L,
    panOnDrag: Z,
    autoPanOnSelection: X,
    onPaneClick: q,
    onPaneMouseEnter: J,
    onPaneMouseMove: G,
    onPaneMouseLeave: R,
    onPaneScroll: F,
    onPaneContextMenu: Q,
    paneClickDistance: U,
    nodeClickDistance: W,
    onEdgeContextMenu: j,
    onEdgeMouseEnter: ee,
    onEdgeMouseMove: te,
    onEdgeMouseLeave: re,
    reconnectRadius: ue,
    onReconnect: Pe,
    onReconnectStart: Ne,
    onReconnectEnd: Ce,
    noDragClassName: Ae,
    noWheelClassName: Rt,
    noPanClassName: Ge,
    disableKeyboardA11y: je,
    nodeExtent: we,
    rfId: Te,
    viewport: De,
    onViewportChange: Ke,
    nodesDraggable: Io,
  }) {
    return (
      Pc(e),
      Pc(t),
      sm(),
      Jg(n),
      tm(De),
      (0, k.jsx)(kg, {
        onPaneClick: q,
        onPaneMouseEnter: J,
        onPaneMouseMove: G,
        onPaneMouseLeave: R,
        onPaneContextMenu: Q,
        onPaneScroll: F,
        paneClickDistance: U,
        deleteKeyCode: O,
        selectionKeyCode: b,
        selectionOnDrag: g,
        selectionMode: v,
        onSelectionStart: f,
        onSelectionEnd: h,
        multiSelectionKeyCode: N,
        panActivationKeyCode: _,
        zoomActivationKeyCode: I,
        elementsSelectable: B,
        zoomOnScroll: M,
        zoomOnPinch: T,
        zoomOnDoubleClick: L,
        panOnScroll: A,
        panOnScrollSpeed: V,
        panOnScrollMode: H,
        panOnDrag: Z,
        autoPanOnSelection: X,
        defaultViewport: D,
        translateExtent: $,
        minZoom: z,
        maxZoom: w,
        onSelectionContextMenu: d,
        preventScrolling: E,
        noDragClassName: Ae,
        noWheelClassName: Rt,
        noPanClassName: Ge,
        disableKeyboardA11y: je,
        onViewportChange: Ke,
        isControlledViewport: !!De,
        children: (0, k.jsxs)(Qg, {
          children: [
            (0, k.jsx)(Ug, {
              edgeTypes: t,
              onEdgeClick: r,
              onEdgeDoubleClick: s,
              onReconnect: Pe,
              onReconnectStart: Ne,
              onReconnectEnd: Ce,
              onlyRenderVisibleElements: P,
              onEdgeContextMenu: j,
              onEdgeMouseEnter: ee,
              onEdgeMouseMove: te,
              onEdgeMouseLeave: re,
              reconnectRadius: ue,
              defaultMarkerColor: S,
              noPanClassName: Ge,
              disableKeyboardA11y: je,
              rfId: Te,
            }),
            (0, k.jsx)(rm, {
              style: x,
              type: p,
              component: y,
              containerStyle: m,
            }),
            (0, k.jsx)("div", { className: "react-flow__edgelabel-renderer" }),
            (0, k.jsx)($g, {
              nodeTypes: e,
              onNodeClick: o,
              onNodeDoubleClick: i,
              onNodeMouseEnter: a,
              onNodeMouseMove: c,
              onNodeMouseLeave: l,
              onNodeContextMenu: u,
              nodeClickDistance: W,
              onlyRenderVisibleElements: P,
              noPanClassName: Ge,
              noDragClassName: Ae,
              disableKeyboardA11y: je,
              nodeExtent: we,
              rfId: Te,
              nodesDraggable: Io,
            }),
            (0, k.jsx)("div", { className: "react-flow__viewport-portal" }),
          ],
        }),
      })
    );
  }
  ml.displayName = "GraphView";
  var am = (0, C.memo)(ml),
    cm = ar("React Flow", "https://reactflow.dev/"),
    Ac = ({
      nodes: e,
      edges: t,
      defaultNodes: n,
      defaultEdges: o,
      width: r,
      height: i,
      fitView: s,
      fitViewOptions: a,
      minZoom: c = 0.5,
      maxZoom: l = 2,
      nodeOrigin: u,
      nodeExtent: d,
      zIndexMode: f = "basic",
    } = {}) => {
      let h = new Map(),
        p = new Map(),
        x = new Map(),
        y = new Map(),
        m = o ?? t ?? [],
        b = n ?? e ?? [],
        g = u ?? [0, 0],
        v = d ?? _t;
      yr(x, y, m);
      let { nodesInitialized: N } = fo(b, h, p, {
          nodeOrigin: g,
          nodeExtent: v,
          zIndexMode: f,
        }),
        _ = [0, 0, 1];
      if (s && r && i) {
        let I = ft(h, {
            filter: (D) =>
              !!((D.width || D.initialWidth) && (D.height || D.initialHeight)),
          }),
          { x: O, y: P, zoom: B } = Mt(I, r, i, c, l, a?.padding ?? 0.1);
        _ = [O, P, B];
      }
      return {
        rfId: "1",
        width: r ?? 0,
        height: i ?? 0,
        transform: _,
        nodes: b,
        nodesInitialized: N,
        nodeLookup: h,
        parentLookup: p,
        edges: m,
        edgeLookup: y,
        connectionLookup: x,
        onNodesChange: null,
        onEdgesChange: null,
        hasDefaultNodes: n !== void 0,
        hasDefaultEdges: o !== void 0,
        panZoom: null,
        minZoom: c,
        maxZoom: l,
        translateExtent: _t,
        nodeExtent: v,
        nodesSelectionActive: !1,
        userSelectionActive: !1,
        userSelectionRect: null,
        connectionMode: He.Strict,
        domNode: null,
        paneDragging: !1,
        noPanClassName: "nopan",
        nodeOrigin: g,
        nodeDragThreshold: 1,
        connectionDragThreshold: 1,
        snapGrid: [15, 15],
        snapToGrid: !1,
        nodesDraggable: !0,
        nodesConnectable: !0,
        nodesFocusable: !0,
        edgesFocusable: !0,
        edgesReconnectable: !0,
        elementsSelectable: !0,
        elevateNodesOnSelect: !0,
        elevateEdgesOnSelect: !0,
        selectNodesOnDrag: !0,
        multiSelectionActive: !1,
        fitViewQueued: s ?? !1,
        fitViewOptions: a,
        fitViewResolver: null,
        connection: { ...Qo },
        connectionClickStartHandle: null,
        connectOnClick: !0,
        ariaLiveMessage: "",
        autoPanOnConnect: !0,
        autoPanOnNodeDrag: !0,
        autoPanOnNodeFocus: !0,
        autoPanSpeed: 15,
        connectionRadius: 20,
        onError: cm,
        isValidConnection: void 0,
        onSelectionChangeHandlers: [],
        lib: "react",
        debug: !1,
        ariaLabelConfig: Uo,
        zIndexMode: f,
        onNodesChangeMiddlewareMap: new Map(),
        onEdgesChangeMiddlewareMap: new Map(),
      };
    },
    lm = ({
      nodes: e,
      edges: t,
      defaultNodes: n,
      defaultEdges: o,
      width: r,
      height: i,
      fitView: s,
      fitViewOptions: a,
      minZoom: c,
      maxZoom: l,
      nodeOrigin: u,
      nodeExtent: d,
      zIndexMode: f,
    }) =>
      sc((h, p) => {
        async function x() {
          let {
            nodeLookup: y,
            panZoom: m,
            fitViewOptions: b,
            fitViewResolver: g,
            width: v,
            height: N,
            minZoom: _,
            maxZoom: I,
          } = p();
          m &&
            (await da(
              {
                nodes: y,
                width: v,
                height: N,
                panZoom: m,
                minZoom: _,
                maxZoom: I,
              },
              b,
            ),
            g?.resolve(!0),
            h({ fitViewResolver: null }));
        }
        return {
          ...Ac({
            nodes: e,
            edges: t,
            width: r,
            height: i,
            fitView: s,
            fitViewOptions: a,
            minZoom: c,
            maxZoom: l,
            nodeOrigin: u,
            nodeExtent: d,
            defaultNodes: n,
            defaultEdges: o,
            zIndexMode: f,
          }),
          setNodes: (y) => {
            let {
                nodeLookup: m,
                parentLookup: b,
                nodeOrigin: g,
                elevateNodesOnSelect: v,
                fitViewQueued: N,
                zIndexMode: _,
                nodesSelectionActive: I,
              } = p(),
              { nodesInitialized: O, hasSelectedNodes: P } = fo(y, m, b, {
                nodeOrigin: g,
                nodeExtent: d,
                elevateNodesOnSelect: v,
                checkEquality: !0,
                zIndexMode: _,
              }),
              B = I && P;
            N && O
              ? (x(),
                h({
                  nodes: y,
                  nodesInitialized: O,
                  fitViewQueued: !1,
                  fitViewOptions: void 0,
                  nodesSelectionActive: B,
                }))
              : h({ nodes: y, nodesInitialized: O, nodesSelectionActive: B });
          },
          setEdges: (y) => {
            let { connectionLookup: m, edgeLookup: b } = p();
            (yr(m, b, y), h({ edges: y }));
          },
          setDefaultNodesAndEdges: (y, m) => {
            if (y) {
              let { setNodes: b } = p();
              (b(y), h({ hasDefaultNodes: !0 }));
            }
            if (m) {
              let { setEdges: b } = p();
              (b(m), h({ hasDefaultEdges: !0 }));
            }
          },
          updateNodeInternals: (y) => {
            let {
                triggerNodeChanges: m,
                nodeLookup: b,
                parentLookup: g,
                domNode: v,
                nodeOrigin: N,
                nodeExtent: _,
                debug: I,
                fitViewQueued: O,
                zIndexMode: P,
              } = p(),
              { changes: B, updatedInternals: D } = ka(y, b, g, v, N, _, P);
            D &&
              (Ma(b, g, { nodeOrigin: N, nodeExtent: _, zIndexMode: P }),
              O
                ? (x(), h({ fitViewQueued: !1, fitViewOptions: void 0 }))
                : h({}),
              B?.length > 0 &&
                (I && console.log("React Flow: trigger node changes", B),
                m?.(B)));
          },
          updateNodePositions: (y, m = !1) => {
            let b = [],
              g = [],
              {
                nodeLookup: v,
                triggerNodeChanges: N,
                connection: _,
                updateConnection: I,
                onNodesChangeMiddlewareMap: O,
              } = p();
            for (let [P, B] of y) {
              let D = v.get(P),
                $ = !!(D?.expandParent && D?.parentId && B?.position),
                z = {
                  id: P,
                  type: "position",
                  position: $
                    ? {
                        x: Math.max(0, B.position.x),
                        y: Math.max(0, B.position.y),
                      }
                    : B.position,
                  dragging: m,
                };
              if (D && _.inProgress && _.fromNode.id === D.id) {
                let w = qe(D, _.fromHandle, Y.Left, !0);
                I({ ..._, from: w });
              }
              ($ &&
                D.parentId &&
                b.push({
                  id: P,
                  parentId: D.parentId,
                  rect: {
                    ...B.internals.positionAbsolute,
                    width: B.measured.width ?? 0,
                    height: B.measured.height ?? 0,
                  },
                }),
                g.push(z));
            }
            if (b.length > 0) {
              let { parentLookup: P, nodeOrigin: B } = p(),
                D = ho(b, v, P, B);
              g.push(...D);
            }
            for (let P of O.values()) g = P(g);
            N(g);
          },
          triggerNodeChanges: (y) => {
            let {
              onNodesChange: m,
              setNodes: b,
              nodes: g,
              hasDefaultNodes: v,
              debug: N,
            } = p();
            if (y?.length) {
              if (v) {
                let _ = Nr(y, g);
                b(_);
              }
              (N && console.log("React Flow: trigger node changes", y), m?.(y));
            }
          },
          triggerEdgeChanges: (y) => {
            let {
              onEdgesChange: m,
              setEdges: b,
              edges: g,
              hasDefaultEdges: v,
              debug: N,
            } = p();
            if (y?.length) {
              if (v) {
                let _ = Cr(y, g);
                b(_);
              }
              (N && console.log("React Flow: trigger edge changes", y), m?.(y));
            }
          },
          addSelectedNodes: (y) => {
            let {
              multiSelectionActive: m,
              edgeLookup: b,
              nodeLookup: g,
              triggerNodeChanges: v,
              triggerEdgeChanges: N,
            } = p();
            if (m) {
              let _ = y.map((I) => ht(I, !0));
              v(_);
              return;
            }
            (v(Pt(g, new Set([...y]), !0)), N(Pt(b)));
          },
          addSelectedEdges: (y) => {
            let {
              multiSelectionActive: m,
              edgeLookup: b,
              nodeLookup: g,
              triggerNodeChanges: v,
              triggerEdgeChanges: N,
            } = p();
            if (m) {
              let _ = y.map((I) => ht(I, !0));
              N(_);
              return;
            }
            (N(Pt(b, new Set([...y]))), v(Pt(g, new Set(), !0)));
          },
          unselectNodesAndEdges: ({ nodes: y, edges: m } = {}) => {
            let {
                edges: b,
                nodes: g,
                nodeLookup: v,
                triggerNodeChanges: N,
                triggerEdgeChanges: _,
              } = p(),
              I = y || g,
              O = m || b,
              P = [];
            for (let D of I) {
              if (!D.selected) continue;
              let $ = v.get(D.id);
              ($ && ($.selected = !1), P.push(ht(D.id, !1)));
            }
            let B = [];
            for (let D of O) D.selected && B.push(ht(D.id, !1));
            (N(P), _(B));
          },
          setMinZoom: (y) => {
            let { panZoom: m, maxZoom: b } = p();
            (m?.setScaleExtent([y, b]), h({ minZoom: y }));
          },
          setMaxZoom: (y) => {
            let { panZoom: m, minZoom: b } = p();
            (m?.setScaleExtent([b, y]), h({ maxZoom: y }));
          },
          setTranslateExtent: (y) => {
            (p().panZoom?.setTranslateExtent(y), h({ translateExtent: y }));
          },
          resetSelectedElements: () => {
            let {
              edges: y,
              nodes: m,
              triggerNodeChanges: b,
              triggerEdgeChanges: g,
              elementsSelectable: v,
            } = p();
            if (!v) return;
            let N = m.reduce(
                (I, O) => (O.selected ? [...I, ht(O.id, !1)] : I),
                [],
              ),
              _ = y.reduce(
                (I, O) => (O.selected ? [...I, ht(O.id, !1)] : I),
                [],
              );
            (b(N), g(_));
          },
          setNodeExtent: (y) => {
            let {
              nodes: m,
              nodeLookup: b,
              parentLookup: g,
              nodeOrigin: v,
              elevateNodesOnSelect: N,
              nodeExtent: _,
              zIndexMode: I,
            } = p();
            (y[0][0] === _[0][0] &&
              y[0][1] === _[0][1] &&
              y[1][0] === _[1][0] &&
              y[1][1] === _[1][1]) ||
              (fo(m, b, g, {
                nodeOrigin: v,
                nodeExtent: y,
                elevateNodesOnSelect: N,
                checkEquality: !1,
                zIndexMode: I,
              }),
              h({ nodeExtent: y }));
          },
          panBy: (y) => {
            let {
              transform: m,
              width: b,
              height: g,
              panZoom: v,
              translateExtent: N,
            } = p();
            return Oa({
              delta: y,
              panZoom: v,
              transform: m,
              translateExtent: N,
              width: b,
              height: g,
            });
          },
          setCenter: async (y, m, b) => {
            let { width: g, height: v, maxZoom: N, panZoom: _ } = p();
            if (!_) return !1;
            let I = typeof b?.zoom < "u" ? b.zoom : N;
            return (
              await _.setViewport(
                { x: g / 2 - y * I, y: v / 2 - m * I, zoom: I },
                {
                  duration: b?.duration,
                  ease: b?.ease,
                  interpolate: b?.interpolate,
                },
              ),
              !0
            );
          },
          cancelConnection: () => {
            h({ connection: { ...Qo } });
          },
          updateConnection: (y) => {
            h({ connection: y });
          },
          reset: () => h({ ...Ac() }),
        };
      }, Object.is);
  function yl({
    initialNodes: e,
    initialEdges: t,
    defaultNodes: n,
    defaultEdges: o,
    initialWidth: r,
    initialHeight: i,
    initialMinZoom: s,
    initialMaxZoom: a,
    initialFitViewOptions: c,
    fitView: l,
    nodeOrigin: u,
    nodeExtent: d,
    zIndexMode: f,
    children: h,
  }) {
    let [p] = (0, C.useState)(() =>
      lm({
        nodes: e,
        edges: t,
        defaultNodes: n,
        defaultEdges: o,
        width: r,
        height: i,
        fitView: l,
        minZoom: s,
        maxZoom: a,
        fitViewOptions: c,
        nodeOrigin: u,
        nodeExtent: d,
        zIndexMode: f,
      }),
    );
    return (0, k.jsx)(Tp, {
      value: p,
      children: (0, k.jsx)(tg, { children: (0, k.jsx)(mg, { children: h }) }),
    });
  }
  function um({
    children: e,
    nodes: t,
    edges: n,
    defaultNodes: o,
    defaultEdges: r,
    width: i,
    height: s,
    fitView: a,
    fitViewOptions: c,
    minZoom: l,
    maxZoom: u,
    nodeOrigin: d,
    nodeExtent: f,
    zIndexMode: h,
  }) {
    return (0, C.useContext)(vo)
      ? (0, k.jsx)(k.Fragment, { children: e })
      : (0, k.jsx)(yl, {
          initialNodes: t,
          initialEdges: n,
          defaultNodes: o,
          defaultEdges: r,
          initialWidth: i,
          initialHeight: s,
          fitView: a,
          initialFitViewOptions: c,
          initialMinZoom: l,
          initialMaxZoom: u,
          nodeOrigin: d,
          nodeExtent: f,
          zIndexMode: h,
          children: e,
        });
  }
  var dm = {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    position: "relative",
    zIndex: 0,
  };
  function fm(
    {
      nodes: e,
      edges: t,
      defaultNodes: n,
      defaultEdges: o,
      className: r,
      nodeTypes: i,
      edgeTypes: s,
      onNodeClick: a,
      onEdgeClick: c,
      onInit: l,
      onMove: u,
      onMoveStart: d,
      onMoveEnd: f,
      onConnect: h,
      onConnectStart: p,
      onConnectEnd: x,
      onClickConnectStart: y,
      onClickConnectEnd: m,
      onNodeMouseEnter: b,
      onNodeMouseMove: g,
      onNodeMouseLeave: v,
      onNodeContextMenu: N,
      onNodeDoubleClick: _,
      onNodeDragStart: I,
      onNodeDrag: O,
      onNodeDragStop: P,
      onNodesDelete: B,
      onEdgesDelete: D,
      onDelete: $,
      onSelectionChange: z,
      onSelectionDragStart: w,
      onSelectionDrag: E,
      onSelectionDragStop: S,
      onSelectionContextMenu: M,
      onSelectionStart: T,
      onSelectionEnd: A,
      onBeforeDelete: V,
      connectionMode: H,
      connectionLineType: L = _e.Bezier,
      connectionLineStyle: Z,
      connectionLineComponent: X,
      connectionLineContainerStyle: q,
      deleteKeyCode: J = "Backspace",
      selectionKeyCode: G = "Shift",
      selectionOnDrag: R = !1,
      selectionMode: F = We.Full,
      panActivationKeyCode: Q = "Space",
      multiSelectionKeyCode: U = It() ? "Meta" : "Control",
      zoomActivationKeyCode: W = It() ? "Meta" : "Control",
      snapToGrid: j,
      snapGrid: ee,
      onlyRenderVisibleElements: te = !1,
      selectNodesOnDrag: re,
      nodesDraggable: ue,
      autoPanOnNodeFocus: Pe,
      nodesConnectable: Ne,
      nodesFocusable: Ce,
      nodeOrigin: Ae = Lc,
      edgesFocusable: Rt,
      edgesReconnectable: Ge,
      elementsSelectable: je = !0,
      defaultViewport: we = Wp,
      minZoom: Te = 0.5,
      maxZoom: De = 2,
      translateExtent: Ke = _t,
      preventScrolling: Io = !0,
      nodeExtent: ko,
      defaultMarkerColor: lu = "#b1b1b7",
      zoomOnScroll: uu = !0,
      zoomOnPinch: du = !0,
      panOnScroll: fu = !1,
      panOnScrollSpeed: hu = 0.5,
      panOnScrollMode: pu = Ie.Free,
      zoomOnDoubleClick: gu = !0,
      panOnDrag: mu = !0,
      onPaneClick: yu,
      onPaneMouseEnter: xu,
      onPaneMouseMove: wu,
      onPaneMouseLeave: vu,
      onPaneScroll: bu,
      onPaneContextMenu: Eu,
      paneClickDistance: _u = 1,
      nodeClickDistance: Su = 0,
      children: Nu,
      onReconnect: Cu,
      onReconnectStart: Mu,
      onReconnectEnd: Iu,
      onEdgeContextMenu: ku,
      onEdgeDoubleClick: Ou,
      onEdgeMouseEnter: Pu,
      onEdgeMouseMove: Au,
      onEdgeMouseLeave: Tu,
      reconnectRadius: Du = 10,
      onNodesChange: zu,
      onEdgesChange: Ru,
      noDragClassName: Lu = "nodrag",
      noWheelClassName: $u = "nowheel",
      noPanClassName: Yr = "nopan",
      fitView: Xr,
      fitViewOptions: Zr,
      connectOnClick: Hu,
      attributionPosition: Bu,
      proOptions: Vu,
      defaultEdgeOptions: Fu,
      elevateNodesOnSelect: Yu = !0,
      elevateEdgesOnSelect: Xu = !1,
      disableKeyboardA11y: Wr = !1,
      autoPanOnConnect: Zu,
      autoPanOnNodeDrag: Wu,
      autoPanOnSelection: qu = !0,
      autoPanSpeed: Gu,
      connectionRadius: ju,
      isValidConnection: Ku,
      onError: Uu,
      style: Qu,
      id: qr,
      nodeDragThreshold: Ju,
      connectionDragThreshold: ed,
      viewport: td,
      onViewportChange: nd,
      width: od,
      height: rd,
      colorMode: id = "light",
      debug: sd,
      onScroll: Gr,
      ariaLabelConfig: ad,
      zIndexMode: jr = "basic",
      ...cd
    },
    ld,
  ) {
    let Oo = qr || "1",
      ud = Kp(id),
      dd = (0, C.useCallback)(
        (Kr) => {
          (Kr.currentTarget.scrollTo({ top: 0, left: 0, behavior: "instant" }),
            Gr?.(Kr));
        },
        [Gr],
      );
    return (0, k.jsx)("div", {
      "data-testid": "rf__wrapper",
      ...cd,
      onScroll: dd,
      style: { ...Qu, ...dm },
      ref: ld,
      className: ie(["react-flow", r, ud]),
      id: qr,
      role: "application",
      children: (0, k.jsxs)(um, {
        nodes: e,
        edges: t,
        width: od,
        height: rd,
        fitView: Xr,
        fitViewOptions: Zr,
        minZoom: Te,
        maxZoom: De,
        nodeOrigin: Ae,
        nodeExtent: ko,
        zIndexMode: jr,
        children: [
          (0, k.jsx)(jp, {
            nodes: e,
            edges: t,
            defaultNodes: n,
            defaultEdges: o,
            onConnect: h,
            onConnectStart: p,
            onConnectEnd: x,
            onClickConnectStart: y,
            onClickConnectEnd: m,
            nodesDraggable: ue,
            autoPanOnNodeFocus: Pe,
            nodesConnectable: Ne,
            nodesFocusable: Ce,
            edgesFocusable: Rt,
            edgesReconnectable: Ge,
            elementsSelectable: je,
            elevateNodesOnSelect: Yu,
            elevateEdgesOnSelect: Xu,
            minZoom: Te,
            maxZoom: De,
            nodeExtent: ko,
            onNodesChange: zu,
            onEdgesChange: Ru,
            snapToGrid: j,
            snapGrid: ee,
            connectionMode: H,
            translateExtent: Ke,
            connectOnClick: Hu,
            defaultEdgeOptions: Fu,
            fitView: Xr,
            fitViewOptions: Zr,
            onNodesDelete: B,
            onEdgesDelete: D,
            onDelete: $,
            onNodeDragStart: I,
            onNodeDrag: O,
            onNodeDragStop: P,
            onSelectionDrag: E,
            onSelectionDragStart: w,
            onSelectionDragStop: S,
            onMove: u,
            onMoveStart: d,
            onMoveEnd: f,
            noPanClassName: Yr,
            nodeOrigin: Ae,
            rfId: Oo,
            autoPanOnConnect: Zu,
            autoPanOnNodeDrag: Wu,
            autoPanSpeed: Gu,
            onError: Uu,
            connectionRadius: ju,
            isValidConnection: Ku,
            selectNodesOnDrag: re,
            nodeDragThreshold: Ju,
            connectionDragThreshold: ed,
            onBeforeDelete: V,
            debug: sd,
            ariaLabelConfig: ad,
            zIndexMode: jr,
          }),
          (0, k.jsx)(am, {
            onInit: l,
            onNodeClick: a,
            onEdgeClick: c,
            onNodeMouseEnter: b,
            onNodeMouseMove: g,
            onNodeMouseLeave: v,
            onNodeContextMenu: N,
            onNodeDoubleClick: _,
            nodeTypes: i,
            edgeTypes: s,
            connectionLineType: L,
            connectionLineStyle: Z,
            connectionLineComponent: X,
            connectionLineContainerStyle: q,
            selectionKeyCode: G,
            selectionOnDrag: R,
            selectionMode: F,
            deleteKeyCode: J,
            multiSelectionKeyCode: U,
            panActivationKeyCode: Q,
            zoomActivationKeyCode: W,
            onlyRenderVisibleElements: te,
            defaultViewport: we,
            translateExtent: Ke,
            minZoom: Te,
            maxZoom: De,
            preventScrolling: Io,
            zoomOnScroll: uu,
            zoomOnPinch: du,
            zoomOnDoubleClick: gu,
            panOnScroll: fu,
            panOnScrollSpeed: hu,
            panOnScrollMode: pu,
            panOnDrag: mu,
            autoPanOnSelection: qu,
            onPaneClick: yu,
            onPaneMouseEnter: xu,
            onPaneMouseMove: wu,
            onPaneMouseLeave: vu,
            onPaneScroll: bu,
            onPaneContextMenu: Eu,
            paneClickDistance: _u,
            nodeClickDistance: Su,
            onSelectionContextMenu: M,
            onSelectionStart: T,
            onSelectionEnd: A,
            onReconnect: Cu,
            onReconnectStart: Mu,
            onReconnectEnd: Iu,
            onEdgeContextMenu: ku,
            onEdgeDoubleClick: Ou,
            onEdgeMouseEnter: Pu,
            onEdgeMouseMove: Au,
            onEdgeMouseLeave: Tu,
            reconnectRadius: Du,
            defaultMarkerColor: lu,
            noDragClassName: Lu,
            noWheelClassName: $u,
            noPanClassName: Yr,
            rfId: Oo,
            disableKeyboardA11y: Wr,
            nodeExtent: ko,
            viewport: td,
            onViewportChange: nd,
            nodesDraggable: ue,
          }),
          (0, k.jsx)(Zp, { onSelectionChange: z }),
          Nu,
          (0, k.jsx)(Bp, { proOptions: Vu, position: Bu }),
          (0, k.jsx)(Hp, { rfId: Oo, disableKeyboardA11y: Wr }),
        ],
      }),
    });
  }
  var hm = Fc(fm),
    pm = (e) => e.domNode?.querySelector(".react-flow__edgelabel-renderer");
  function xl({ children: e }) {
    let t = K(pm);
    return t ? (0, wo.createPortal)(e, t) : null;
  }
  var gm = (e) => e.domNode?.querySelector(".react-flow__viewport-portal");
  function mm({ children: e }) {
    let t = K(gm);
    return t ? (0, wo.createPortal)(e, t) : null;
  }
  function ym() {
    let e = ne();
    return (0, C.useCallback)((t) => {
      let { domNode: n, updateNodeInternals: o } = e.getState(),
        r = Array.isArray(t) ? t : [t],
        i = new Map();
      (r.forEach((s) => {
        let a = n?.querySelector(`.react-flow__node[data-id="${s}"]`);
        a && i.set(s, { id: s, nodeElement: a, force: !0 });
      }),
        requestAnimationFrame(() => o(i, { triggerFitView: !1 })));
    }, []);
  }
  var xm = (e) => e.nodes;
  function wm() {
    return K(xm, oe);
  }
  var vm = (e) => e.edges;
  function bm() {
    return K(vm, oe);
  }
  var Em = (e) => ({
    x: e.transform[0],
    y: e.transform[1],
    zoom: e.transform[2],
  });
  function _m() {
    return K(Em, oe);
  }
  function Sm(e) {
    let [t, n] = (0, C.useState)(e),
      o = (0, C.useCallback)((r) => n((i) => Nr(r, i)), []);
    return [t, n, o];
  }
  function Nm(e) {
    let [t, n] = (0, C.useState)(e),
      o = (0, C.useCallback)((r) => n((i) => Cr(r, i)), []);
    return [t, n, o];
  }
  function Cm({ onStart: e, onChange: t, onEnd: n }) {
    let o = ne();
    ((0, C.useEffect)(() => {
      o.setState({ onViewportChangeStart: e });
    }, [e]),
      (0, C.useEffect)(() => {
        o.setState({ onViewportChange: t });
      }, [t]),
      (0, C.useEffect)(() => {
        o.setState({ onViewportChangeEnd: n });
      }, [n]));
  }
  function Mm({ onChange: e }) {
    let t = ne();
    (0, C.useEffect)(() => {
      let n = [...t.getState().onSelectionChangeHandlers, e];
      return (
        t.setState({ onSelectionChangeHandlers: n }),
        () => {
          let o = t.getState().onSelectionChangeHandlers.filter((r) => r !== e);
          t.setState({ onSelectionChangeHandlers: o });
        }
      );
    }, [e]);
  }
  var Im = (e) => (t) => {
    if (!e.includeHiddenNodes) return t.nodesInitialized;
    if (t.nodeLookup.size === 0) return !1;
    for (let [, { internals: n }] of t.nodeLookup)
      if (n.handleBounds === void 0 || !ao(n.userNode)) return !1;
    return !0;
  };
  function km(e = { includeHiddenNodes: !1 }) {
    return K(Im(e));
  }
  function Om({ type: e, id: t, nodeId: n, onConnect: o, onDisconnect: r }) {
    console.warn(
      "[DEPRECATED] `useHandleConnections` is deprecated. Instead use `useNodeConnections` https://reactflow.dev/api-reference/hooks/useNodeConnections",
    );
    let i = Tt(),
      s = n ?? i,
      a = (0, C.useRef)(null),
      c = K((l) => l.connectionLookup.get(`${s}-${e}${t ? `-${t}` : ""}`), Jo);
    return (
      (0, C.useEffect)(() => {
        if (a.current && a.current !== c) {
          let l = c ?? new Map();
          (ln(a.current, l, r), ln(l, a.current, o));
        }
        a.current = c ?? new Map();
      }, [c, o, r]),
      (0, C.useMemo)(() => Array.from(c?.values() ?? []), [c])
    );
  }
  var Pm = pe.error014();
  function Am({
    id: e,
    handleType: t,
    handleId: n,
    onConnect: o,
    onDisconnect: r,
  } = {}) {
    let i = Tt(),
      s = e ?? i;
    if (!s) throw new Error(Pm);
    let a = (0, C.useRef)(null),
      c = K(
        (l) =>
          l.connectionLookup.get(
            `${s}${t ? (n ? `-${t}-${n}` : `-${t}`) : ""}`,
          ),
        Jo,
      );
    return (
      (0, C.useEffect)(() => {
        if (a.current && a.current !== c) {
          let l = c ?? new Map();
          (ln(a.current, l, r), ln(l, a.current, o));
        }
        a.current = c ?? new Map();
      }, [c, o, r]),
      (0, C.useMemo)(() => Array.from(c?.values() ?? []), [c])
    );
  }
  function Tm(e) {
    return K(
      (0, C.useCallback)(
        (n) => {
          let o = [],
            r = Array.isArray(e),
            i = r ? e : [e];
          for (let s of i) {
            let a = n.nodeLookup.get(s);
            a && o.push({ id: a.id, type: a.type, data: a.data });
          }
          return r ? o : (o[0] ?? null);
        },
        [e],
      ),
      Pa,
    );
  }
  function Dm(e) {
    return K(
      (0, C.useCallback)((n) => n.nodeLookup.get(e), [e]),
      oe,
    );
  }
  function zm(e) {
    let t = ne(),
      [n] = (0, C.useState)(() => Symbol());
    ((0, C.useEffect)(() => {
      let { onNodesChangeMiddlewareMap: o } = t.getState();
      o.set(n, e);
    }, [e]),
      (0, C.useEffect)(() => {
        let { onNodesChangeMiddlewareMap: o } = t.getState();
        return () => {
          o.delete(n);
        };
      }, []));
  }
  function Rm(e) {
    let t = ne(),
      [n] = (0, C.useState)(() => Symbol());
    ((0, C.useEffect)(() => {
      let { onEdgesChangeMiddlewareMap: o } = t.getState();
      o.set(n, e);
    }, [e]),
      (0, C.useEffect)(() => {
        let { onEdgesChangeMiddlewareMap: o } = t.getState();
        return () => {
          o.delete(n);
        };
      }, []));
  }
  function Lm({ dimensions: e, lineWidth: t, variant: n, className: o }) {
    return (0, k.jsx)("path", {
      strokeWidth: t,
      d: `M${e[0] / 2} 0 V${e[1]} M0 ${e[1] / 2} H${e[0]}`,
      className: ie(["react-flow__background-pattern", n, o]),
    });
  }
  function $m({ radius: e, className: t }) {
    return (0, k.jsx)("circle", {
      cx: e,
      cy: e,
      r: e,
      className: ie(["react-flow__background-pattern", "dots", t]),
    });
  }
  var Be;
  (function (e) {
    ((e.Lines = "lines"), (e.Dots = "dots"), (e.Cross = "cross"));
  })(Be || (Be = {}));
  var Hm = { [Be.Dots]: 1, [Be.Lines]: 1, [Be.Cross]: 6 },
    Bm = (e) => ({ transform: e.transform, patternId: `pattern-${e.rfId}` });
  function wl({
    id: e,
    variant: t = Be.Dots,
    gap: n = 20,
    size: o,
    lineWidth: r = 1,
    offset: i = 0,
    color: s,
    bgColor: a,
    style: c,
    className: l,
    patternClassName: u,
  }) {
    let d = (0, C.useRef)(null),
      { transform: f, patternId: h } = K(Bm, oe),
      p = o || Hm[t],
      x = t === Be.Dots,
      y = t === Be.Cross,
      m = Array.isArray(n) ? n : [n, n],
      b = [m[0] * f[2] || 1, m[1] * f[2] || 1],
      g = p * f[2],
      v = Array.isArray(i) ? i : [i, i],
      N = y ? [g, g] : b,
      _ = [v[0] * f[2] || 1 + N[0] / 2, v[1] * f[2] || 1 + N[1] / 2],
      I = `${h}${e || ""}`;
    return (0, k.jsxs)("svg", {
      className: ie(["react-flow__background", l]),
      style: {
        ...c,
        ...Eo,
        "--xy-background-color-props": a,
        "--xy-background-pattern-color-props": s,
      },
      ref: d,
      "data-testid": "rf__background",
      children: [
        (0, k.jsx)("pattern", {
          id: I,
          x: f[0] % b[0],
          y: f[1] % b[1],
          width: b[0],
          height: b[1],
          patternUnits: "userSpaceOnUse",
          patternTransform: `translate(-${_[0]},-${_[1]})`,
          children: x
            ? (0, k.jsx)($m, { radius: g / 2, className: u })
            : (0, k.jsx)(Lm, {
                dimensions: N,
                lineWidth: r,
                variant: t,
                className: u,
              }),
        }),
        (0, k.jsx)("rect", {
          x: "0",
          y: "0",
          width: "100%",
          height: "100%",
          fill: `url(#${I})`,
        }),
      ],
    });
  }
  wl.displayName = "Background";
  var Vm = (0, C.memo)(wl);
  function Fm() {
    return (0, k.jsx)("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 32 32",
      children: (0, k.jsx)("path", {
        d: "M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z",
      }),
    });
  }
  function Ym() {
    return (0, k.jsx)("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 32 5",
      children: (0, k.jsx)("path", { d: "M0 0h32v4.2H0z" }),
    });
  }
  function Xm() {
    return (0, k.jsx)("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 32 30",
      children: (0, k.jsx)("path", {
        d: "M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z",
      }),
    });
  }
  function Zm() {
    return (0, k.jsx)("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 25 32",
      children: (0, k.jsx)("path", {
        d: "M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z",
      }),
    });
  }
  function Wm() {
    return (0, k.jsx)("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 25 32",
      children: (0, k.jsx)("path", {
        d: "M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z",
      }),
    });
  }
  function gn({ children: e, className: t, ...n }) {
    return (0, k.jsx)("button", {
      type: "button",
      className: ie(["react-flow__controls-button", t]),
      ...n,
      children: e,
    });
  }
  var qm = (e) => ({
    isInteractive:
      e.nodesDraggable || e.nodesConnectable || e.elementsSelectable,
    minZoomReached: e.transform[2] <= e.minZoom,
    maxZoomReached: e.transform[2] >= e.maxZoom,
    ariaLabelConfig: e.ariaLabelConfig,
  });
  function vl({
    style: e,
    showZoom: t = !0,
    showFitView: n = !0,
    showInteractive: o = !0,
    fitViewOptions: r,
    onZoomIn: i,
    onZoomOut: s,
    onFitView: a,
    onInteractiveChange: c,
    className: l,
    children: u,
    position: d = "bottom-left",
    orientation: f = "vertical",
    "aria-label": h,
  }) {
    let p = ne(),
      {
        isInteractive: x,
        minZoomReached: y,
        maxZoomReached: m,
        ariaLabelConfig: b,
      } = K(qm, oe),
      { zoomIn: g, zoomOut: v, fitView: N } = bo(),
      _ = () => {
        (g(), i?.());
      },
      I = () => {
        (v(), s?.());
      },
      O = () => {
        (N(r), a?.());
      },
      P = () => {
        (p.setState({
          nodesDraggable: !x,
          nodesConnectable: !x,
          elementsSelectable: !x,
        }),
          c?.(!x));
      };
    return (0, k.jsxs)(yn, {
      className: ie([
        "react-flow__controls",
        f === "horizontal" ? "horizontal" : "vertical",
        l,
      ]),
      position: d,
      style: e,
      "data-testid": "rf__controls",
      "aria-label": h ?? b["controls.ariaLabel"],
      children: [
        t &&
          (0, k.jsxs)(k.Fragment, {
            children: [
              (0, k.jsx)(gn, {
                onClick: _,
                className: "react-flow__controls-zoomin",
                title: b["controls.zoomIn.ariaLabel"],
                "aria-label": b["controls.zoomIn.ariaLabel"],
                disabled: m,
                children: (0, k.jsx)(Fm, {}),
              }),
              (0, k.jsx)(gn, {
                onClick: I,
                className: "react-flow__controls-zoomout",
                title: b["controls.zoomOut.ariaLabel"],
                "aria-label": b["controls.zoomOut.ariaLabel"],
                disabled: y,
                children: (0, k.jsx)(Ym, {}),
              }),
            ],
          }),
        n &&
          (0, k.jsx)(gn, {
            className: "react-flow__controls-fitview",
            onClick: O,
            title: b["controls.fitView.ariaLabel"],
            "aria-label": b["controls.fitView.ariaLabel"],
            children: (0, k.jsx)(Xm, {}),
          }),
        o &&
          (0, k.jsx)(gn, {
            className: "react-flow__controls-interactive",
            onClick: P,
            title: b["controls.interactive.ariaLabel"],
            "aria-label": b["controls.interactive.ariaLabel"],
            children: x ? (0, k.jsx)(Wm, {}) : (0, k.jsx)(Zm, {}),
          }),
        u,
      ],
    });
  }
  vl.displayName = "Controls";
  var Gm = (0, C.memo)(vl);
  function jm({
    id: e,
    x: t,
    y: n,
    width: o,
    height: r,
    style: i,
    color: s,
    strokeColor: a,
    strokeWidth: c,
    className: l,
    borderRadius: u,
    shapeRendering: d,
    selected: f,
    onClick: h,
  }) {
    let { background: p, backgroundColor: x } = i || {},
      y = s || p || x;
    return (0, k.jsx)("rect", {
      className: ie(["react-flow__minimap-node", { selected: f }, l]),
      x: t,
      y: n,
      rx: u,
      ry: u,
      width: o,
      height: r,
      style: { fill: y, stroke: a, strokeWidth: c },
      shapeRendering: d,
      onClick: h ? (m) => h(m, e) : void 0,
    });
  }
  var bl = (0, C.memo)(jm),
    Km = (e) => e.nodes.map((t) => t.id),
    br = (e) => (e instanceof Function ? e : () => e);
  function Um({
    nodeStrokeColor: e,
    nodeColor: t,
    nodeClassName: n = "",
    nodeBorderRadius: o = 5,
    nodeStrokeWidth: r,
    nodeComponent: i = bl,
    onClick: s,
  }) {
    let a = K(Km, oe),
      c = br(t),
      l = br(e),
      u = br(n),
      d =
        typeof window > "u" || window.chrome
          ? "crispEdges"
          : "geometricPrecision";
    return (0, k.jsx)(k.Fragment, {
      children: a.map((f) =>
        (0, k.jsx)(
          Jm,
          {
            id: f,
            nodeColorFunc: c,
            nodeStrokeColorFunc: l,
            nodeClassNameFunc: u,
            nodeBorderRadius: o,
            nodeStrokeWidth: r,
            NodeComponent: i,
            onClick: s,
            shapeRendering: d,
          },
          f,
        ),
      ),
    });
  }
  function Qm({
    id: e,
    nodeColorFunc: t,
    nodeStrokeColorFunc: n,
    nodeClassNameFunc: o,
    nodeBorderRadius: r,
    nodeStrokeWidth: i,
    shapeRendering: s,
    NodeComponent: a,
    onClick: c,
  }) {
    let {
      node: l,
      x: u,
      y: d,
      width: f,
      height: h,
    } = K((p) => {
      let x = p.nodeLookup.get(e);
      if (!x) return { node: void 0, x: 0, y: 0, width: 0, height: 0 };
      let y = x.internals.userNode,
        { x: m, y: b } = x.internals.positionAbsolute,
        { width: g, height: v } = Se(y);
      return { node: y, x: m, y: b, width: g, height: v };
    }, oe);
    return !l || l.hidden || !ao(l)
      ? null
      : (0, k.jsx)(a, {
          x: u,
          y: d,
          width: f,
          height: h,
          style: l.style,
          selected: !!l.selected,
          className: o(l),
          color: t(l),
          borderRadius: r,
          strokeColor: n(l),
          strokeWidth: i,
          shapeRendering: s,
          onClick: c,
          id: l.id,
        });
  }
  var Jm = (0, C.memo)(Qm),
    e0 = (0, C.memo)(Um),
    t0 = 200,
    n0 = 150,
    o0 = (e) => !e.hidden,
    r0 = (e) => {
      let t = {
        x: -e.transform[0] / e.transform[2],
        y: -e.transform[1] / e.transform[2],
        width: e.width / e.transform[2],
        height: e.height / e.transform[2],
      };
      return {
        viewBB: t,
        boundingRect:
          e.nodeLookup.size > 0 ? ir(ft(e.nodeLookup, { filter: o0 }), t) : t,
        rfId: e.rfId,
        panZoom: e.panZoom,
        translateExtent: e.translateExtent,
        flowWidth: e.width,
        flowHeight: e.height,
        ariaLabelConfig: e.ariaLabelConfig,
      };
    },
    Tc = (e, t) =>
      e.x === t.x &&
      e.y === t.y &&
      e.width === t.width &&
      e.height === t.height,
    i0 = (e, t) =>
      Tc(e.viewBB, t.viewBB) &&
      Tc(e.boundingRect, t.boundingRect) &&
      e.rfId === t.rfId &&
      e.panZoom === t.panZoom &&
      e.translateExtent === t.translateExtent &&
      e.flowWidth === t.flowWidth &&
      e.flowHeight === t.flowHeight &&
      e.ariaLabelConfig === t.ariaLabelConfig,
    s0 = "react-flow__minimap-desc";
  function El({
    style: e,
    className: t,
    nodeStrokeColor: n,
    nodeColor: o,
    nodeClassName: r = "",
    nodeBorderRadius: i = 5,
    nodeStrokeWidth: s,
    nodeComponent: a,
    bgColor: c,
    maskColor: l,
    maskStrokeColor: u,
    maskStrokeWidth: d,
    position: f = "bottom-right",
    onClick: h,
    onNodeClick: p,
    pannable: x = !1,
    zoomable: y = !1,
    ariaLabel: m,
    inversePan: b,
    zoomStep: g = 1,
    offsetScale: v = 5,
  }) {
    let N = ne(),
      _ = (0, C.useRef)(null),
      {
        boundingRect: I,
        viewBB: O,
        rfId: P,
        panZoom: B,
        translateExtent: D,
        flowWidth: $,
        flowHeight: z,
        ariaLabelConfig: w,
      } = K(r0, i0),
      E = e?.width ?? t0,
      S = e?.height ?? n0,
      M = I.width / E,
      T = I.height / S,
      A = Math.max(M, T),
      V = A * E,
      H = A * S,
      L = v * A,
      Z = I.x - (V - I.width) / 2 - L,
      X = I.y - (H - I.height) / 2 - L,
      q = V + L * 2,
      J = H + L * 2,
      G = `${s0}-${P}`,
      R = (0, C.useRef)(0),
      F = (0, C.useRef)();
    ((R.current = A),
      (0, C.useEffect)(() => {
        if (_.current && B)
          return (
            (F.current = $a({
              domNode: _.current,
              panZoom: B,
              getTransform: () => N.getState().transform,
              getViewScale: () => R.current,
            })),
            () => {
              F.current?.destroy();
            }
          );
      }, [B]),
      (0, C.useEffect)(() => {
        F.current?.update({
          translateExtent: D,
          width: $,
          height: z,
          inversePan: b,
          pannable: x,
          zoomStep: g,
          zoomable: y,
        });
      }, [x, y, b, g, D, $, z]));
    let Q = h
        ? (j) => {
            let [ee, te] = F.current?.pointer(j) || [0, 0];
            h(j, { x: ee, y: te });
          }
        : void 0,
      U = p
        ? (0, C.useCallback)((j, ee) => {
            let te = N.getState().nodeLookup.get(ee).internals.userNode;
            p(j, te);
          }, [])
        : void 0,
      W = m ?? w["minimap.ariaLabel"];
    return (0, k.jsx)(yn, {
      position: f,
      style: {
        ...e,
        "--xy-minimap-background-color-props":
          typeof c == "string" ? c : void 0,
        "--xy-minimap-mask-background-color-props":
          typeof l == "string" ? l : void 0,
        "--xy-minimap-mask-stroke-color-props":
          typeof u == "string" ? u : void 0,
        "--xy-minimap-mask-stroke-width-props":
          typeof d == "number" ? d * A : void 0,
        "--xy-minimap-node-background-color-props":
          typeof o == "string" ? o : void 0,
        "--xy-minimap-node-stroke-color-props":
          typeof n == "string" ? n : void 0,
        "--xy-minimap-node-stroke-width-props":
          typeof s == "number" ? s : void 0,
      },
      className: ie(["react-flow__minimap", t]),
      "data-testid": "rf__minimap",
      children: (0, k.jsxs)("svg", {
        width: E,
        height: S,
        viewBox: `${Z} ${X} ${q} ${J}`,
        className: "react-flow__minimap-svg",
        role: "img",
        "aria-labelledby": G,
        ref: _,
        onClick: Q,
        children: [
          W && (0, k.jsx)("title", { id: G, children: W }),
          (0, k.jsx)(e0, {
            onClick: U,
            nodeColor: o,
            nodeStrokeColor: n,
            nodeBorderRadius: i,
            nodeClassName: r,
            nodeStrokeWidth: s,
            nodeComponent: a,
          }),
          (0, k.jsx)("path", {
            className: "react-flow__minimap-mask",
            d: `M${Z - L},${X - L}h${q + L * 2}v${J + L * 2}h${-q - L * 2}z
        M${O.x},${O.y}h${O.width}v${O.height}h${-O.width}z`,
            fillRule: "evenodd",
            pointerEvents: "none",
          }),
        ],
      }),
    });
  }
  El.displayName = "MiniMap";
  var a0 = (0, C.memo)(El),
    c0 = (e) => (t) => (e ? `${Math.max(1 / t.transform[2], 1)}` : void 0),
    l0 = { [ke.Line]: "right", [ke.Handle]: "bottom-right" };
  function u0({
    nodeId: e,
    position: t,
    variant: n = ke.Handle,
    className: o,
    style: r = void 0,
    children: i,
    color: s,
    minWidth: a = 10,
    minHeight: c = 10,
    maxWidth: l = Number.MAX_VALUE,
    maxHeight: u = Number.MAX_VALUE,
    keepAspectRatio: d = !1,
    resizeDirection: f,
    autoScale: h = !0,
    shouldResize: p,
    onResizeStart: x,
    onResize: y,
    onResizeEnd: m,
  }) {
    let b = Tt(),
      g = typeof e == "string" ? e : b,
      v = ne(),
      N = (0, C.useRef)(null),
      _ = n === ke.Handle,
      I = K((0, C.useCallback)(c0(_ && h), [_, h]), oe),
      O = (0, C.useRef)(null),
      P = t ?? l0[n];
    (0, C.useEffect)(() => {
      if (!(!N.current || !g))
        return (
          O.current ||
            (O.current = Za({
              domNode: N.current,
              nodeId: g,
              getStoreItems: () => {
                let {
                  nodeLookup: D,
                  transform: $,
                  snapGrid: z,
                  snapToGrid: w,
                  nodeOrigin: E,
                  domNode: S,
                } = v.getState();
                return {
                  nodeLookup: D,
                  transform: $,
                  snapGrid: z,
                  snapToGrid: w,
                  nodeOrigin: E,
                  paneDomNode: S,
                };
              },
              onChange: (D, $) => {
                let {
                    triggerNodeChanges: z,
                    nodeLookup: w,
                    parentLookup: E,
                    nodeOrigin: S,
                  } = v.getState(),
                  M = [],
                  T = { x: D.x, y: D.y },
                  A = w.get(g);
                if (A && A.expandParent && A.parentId) {
                  let V = A.origin ?? S,
                    H = D.width ?? A.measured.width ?? 0,
                    L = D.height ?? A.measured.height ?? 0,
                    Z = {
                      id: A.id,
                      parentId: A.parentId,
                      rect: {
                        width: H,
                        height: L,
                        ...cr(
                          { x: D.x ?? A.position.x, y: D.y ?? A.position.y },
                          { width: H, height: L },
                          A.parentId,
                          w,
                          V,
                        ),
                      },
                    },
                    X = ho([Z], w, E, S);
                  (M.push(...X),
                    (T.x = D.x ? Math.max(V[0] * H, D.x) : void 0),
                    (T.y = D.y ? Math.max(V[1] * L, D.y) : void 0));
                }
                if (T.x !== void 0 && T.y !== void 0) {
                  let V = { id: g, type: "position", position: { ...T } };
                  M.push(V);
                }
                if (D.width !== void 0 && D.height !== void 0) {
                  let H = {
                    id: g,
                    type: "dimensions",
                    resizing: !0,
                    setAttributes: f
                      ? f === "horizontal"
                        ? "width"
                        : "height"
                      : !0,
                    dimensions: { width: D.width, height: D.height },
                  };
                  M.push(H);
                }
                for (let V of $) {
                  let H = { ...V, type: "position" };
                  M.push(H);
                }
                z(M);
              },
              onEnd: ({ width: D, height: $ }) => {
                let z = {
                  id: g,
                  type: "dimensions",
                  resizing: !1,
                  dimensions: { width: D, height: $ },
                };
                v.getState().triggerNodeChanges([z]);
              },
            })),
          O.current.update({
            controlPosition: P,
            boundaries: {
              minWidth: a,
              minHeight: c,
              maxWidth: l,
              maxHeight: u,
            },
            keepAspectRatio: d,
            resizeDirection: f,
            onResizeStart: x,
            onResize: y,
            onResizeEnd: m,
            shouldResize: p,
          }),
          () => {
            O.current?.destroy();
          }
        );
    }, [P, a, c, l, u, d, x, y, m, p]);
    let B = P.split("-");
    return (0, k.jsx)("div", {
      className: ie(["react-flow__resize-control", "nodrag", ...B, n, o]),
      ref: N,
      style: {
        ...r,
        scale: I,
        ...(s && { [_ ? "backgroundColor" : "borderColor"]: s }),
      },
      children: i,
    });
  }
  var Sr = (0, C.memo)(u0);
  function d0({
    nodeId: e,
    isVisible: t = !0,
    handleClassName: n,
    handleStyle: o,
    lineClassName: r,
    lineStyle: i,
    color: s,
    minWidth: a = 10,
    minHeight: c = 10,
    maxWidth: l = Number.MAX_VALUE,
    maxHeight: u = Number.MAX_VALUE,
    keepAspectRatio: d = !1,
    autoScale: f = !0,
    shouldResize: h,
    onResizeStart: p,
    onResize: x,
    onResizeEnd: y,
  }) {
    return t
      ? (0, k.jsxs)(k.Fragment, {
          children: [
            Ya.map((m) =>
              (0, k.jsx)(
                Sr,
                {
                  className: r,
                  style: i,
                  nodeId: e,
                  position: m,
                  variant: ke.Line,
                  color: s,
                  minWidth: a,
                  minHeight: c,
                  maxWidth: l,
                  maxHeight: u,
                  onResizeStart: p,
                  keepAspectRatio: d,
                  autoScale: f,
                  shouldResize: h,
                  onResize: x,
                  onResizeEnd: y,
                },
                m,
              ),
            ),
            Fa.map((m) =>
              (0, k.jsx)(
                Sr,
                {
                  className: n,
                  style: o,
                  nodeId: e,
                  position: m,
                  color: s,
                  minWidth: a,
                  minHeight: c,
                  maxWidth: l,
                  maxHeight: u,
                  onResizeStart: p,
                  keepAspectRatio: d,
                  autoScale: f,
                  shouldResize: h,
                  onResize: x,
                  onResizeEnd: y,
                },
                m,
              ),
            ),
          ],
        })
      : null;
  }
  var f0 = (e) => e.domNode?.querySelector(".react-flow__renderer");
  function h0({ children: e }) {
    let t = K(f0);
    return t ? (0, wo.createPortal)(e, t) : null;
  }
  var p0 = (e, t) =>
      e?.internals.positionAbsolute.x !== t?.internals.positionAbsolute.x ||
      e?.internals.positionAbsolute.y !== t?.internals.positionAbsolute.y ||
      e?.measured.width !== t?.measured.width ||
      e?.measured.height !== t?.measured.height ||
      e?.selected !== t?.selected ||
      e?.internals.z !== t?.internals.z,
    g0 = (e, t) => {
      if (e.size !== t.size) return !1;
      for (let [n, o] of e) if (p0(o, t.get(n))) return !1;
      return !0;
    },
    m0 = (e) => ({
      x: e.transform[0],
      y: e.transform[1],
      zoom: e.transform[2],
      selectedNodesCount: e.nodes.filter((t) => t.selected).length,
    });
  function y0({
    nodeId: e,
    children: t,
    className: n,
    style: o,
    isVisible: r,
    position: i = Y.Top,
    offset: s = 10,
    align: a = "center",
    ...c
  }) {
    let l = Tt(),
      u = (0, C.useCallback)(
        (N) =>
          (Array.isArray(e) ? e : [e || l || ""]).reduce((O, P) => {
            let B = N.nodeLookup.get(P);
            return (B && O.set(B.id, B), O);
          }, new Map()),
        [e, l],
      ),
      d = K(u, g0),
      { x: f, y: h, zoom: p, selectedNodesCount: x } = K(m0, oe);
    if (
      !(typeof r == "boolean"
        ? r
        : d.size === 1 && d.values().next().value?.selected && x === 1) ||
      !d.size
    )
      return null;
    let m = ft(d),
      b = Array.from(d.values()),
      g = Math.max(...b.map((N) => N.internals.z + 1)),
      v = {
        position: "absolute",
        transform: Sa(m, { x: f, y: h, zoom: p }, i, s, a),
        zIndex: g,
        ...o,
      };
    return (0, k.jsx)(h0, {
      children: (0, k.jsx)("div", {
        style: v,
        className: ie(["react-flow__node-toolbar", n]),
        ...c,
        "data-id": b.reduce((N, _) => `${N}${_.id} `, "").trim(),
        children: t,
      }),
    });
  }
  var x0 = (e) => e.transform[2];
  function w0({
    edgeId: e,
    x: t,
    y: n,
    children: o,
    className: r,
    style: i,
    isVisible: s,
    alignX: a = "center",
    alignY: c = "center",
    ...l
  }) {
    let u = (0, C.useCallback)((y) => y.edgeLookup.get(e), [e]),
      d = K(u, oe),
      f = typeof s == "boolean" ? s : d?.selected,
      h = K(x0);
    if (!f) return null;
    let p = (d?.zIndex ?? 0) + 1,
      x = Na(t, n, h, a, c);
    return (0, k.jsx)(xl, {
      children: (0, k.jsx)("div", {
        style: {
          position: "absolute",
          transform: x,
          zIndex: p,
          pointerEvents: "all",
          transformOrigin: "0 0",
          ...i,
        },
        className: ie(["react-flow__edge-toolbar", r]),
        "data-id": d?.id ?? "",
        ...l,
        children: o,
      }),
    });
  }
  var Rl = Object.defineProperty,
    v0 = (e, t, n) =>
      t in e
        ? Rl(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n })
        : (e[t] = n),
    b0 = (e, t) => {
      for (var n in t) Rl(e, n, { get: t[n], enumerable: !0 });
    },
    E0 = (e, t, n) => v0(e, typeof t != "symbol" ? t + "" : t, n),
    Ll = {};
  b0(Ll, { Graph: () => xe, alg: () => $r, json: () => Hl, version: () => N0 });
  var _0 = Object.defineProperty,
    $l = (e, t) => {
      for (var n in t) _0(e, n, { get: t[n], enumerable: !0 });
    },
    xe = class {
      constructor(e) {
        ((this._isDirected = !0),
          (this._isMultigraph = !1),
          (this._isCompound = !1),
          (this._nodes = {}),
          (this._in = {}),
          (this._preds = {}),
          (this._out = {}),
          (this._sucs = {}),
          (this._edgeObjs = {}),
          (this._edgeLabels = {}),
          (this._nodeCount = 0),
          (this._edgeCount = 0),
          (this._defaultNodeLabelFn = () => {}),
          (this._defaultEdgeLabelFn = () => {}),
          e &&
            ((this._isDirected = "directed" in e ? e.directed : !0),
            (this._isMultigraph = "multigraph" in e ? e.multigraph : !1),
            (this._isCompound = "compound" in e ? e.compound : !1)),
          this._isCompound &&
            ((this._parent = {}),
            (this._children = {}),
            (this._children["\0"] = {})));
      }
      isDirected() {
        return this._isDirected;
      }
      isMultigraph() {
        return this._isMultigraph;
      }
      isCompound() {
        return this._isCompound;
      }
      setGraph(e) {
        return ((this._label = e), this);
      }
      graph() {
        return this._label;
      }
      setDefaultNodeLabel(e) {
        return (
          typeof e != "function"
            ? (this._defaultNodeLabelFn = () => e)
            : (this._defaultNodeLabelFn = e),
          this
        );
      }
      nodeCount() {
        return this._nodeCount;
      }
      nodes() {
        return Object.keys(this._nodes);
      }
      sources() {
        return this.nodes().filter(
          (e) => Object.keys(this._in[e]).length === 0,
        );
      }
      sinks() {
        return this.nodes().filter(
          (e) => Object.keys(this._out[e]).length === 0,
        );
      }
      setNodes(e, t) {
        return (
          e.forEach((n) => {
            t !== void 0 ? this.setNode(n, t) : this.setNode(n);
          }),
          this
        );
      }
      setNode(e, t) {
        return e in this._nodes
          ? (arguments.length > 1 && (this._nodes[e] = t), this)
          : ((this._nodes[e] =
              arguments.length > 1 ? t : this._defaultNodeLabelFn(e)),
            this._isCompound &&
              ((this._parent[e] = "\0"),
              (this._children[e] = {}),
              (this._children["\0"][e] = !0)),
            (this._in[e] = {}),
            (this._preds[e] = {}),
            (this._out[e] = {}),
            (this._sucs[e] = {}),
            ++this._nodeCount,
            this);
      }
      node(e) {
        return this._nodes[e];
      }
      hasNode(e) {
        return e in this._nodes;
      }
      removeNode(e) {
        if (e in this._nodes) {
          let t = (n) => this.removeEdge(this._edgeObjs[n]);
          (delete this._nodes[e],
            this._isCompound &&
              (this._removeFromParentsChildList(e),
              delete this._parent[e],
              this.children(e).forEach((n) => {
                this.setParent(n);
              }),
              delete this._children[e]),
            Object.keys(this._in[e]).forEach(t),
            delete this._in[e],
            delete this._preds[e],
            Object.keys(this._out[e]).forEach(t),
            delete this._out[e],
            delete this._sucs[e],
            --this._nodeCount);
        }
        return this;
      }
      setParent(e, t) {
        if (!this._isCompound)
          throw new Error("Cannot set parent in a non-compound graph");
        if (t === void 0) t = "\0";
        else {
          t += "";
          for (let n = t; n !== void 0; n = this.parent(n))
            if (n === e)
              throw new Error(
                "Setting " + t + " as parent of " + e + " would create a cycle",
              );
          this.setNode(t);
        }
        return (
          this.setNode(e),
          this._removeFromParentsChildList(e),
          (this._parent[e] = t),
          (this._children[t][e] = !0),
          this
        );
      }
      parent(e) {
        if (this._isCompound) {
          let t = this._parent[e];
          if (t !== "\0") return t;
        }
      }
      children(e = "\0") {
        if (this._isCompound) {
          let t = this._children[e];
          if (t) return Object.keys(t);
        } else {
          if (e === "\0") return this.nodes();
          if (this.hasNode(e)) return [];
        }
        return [];
      }
      predecessors(e) {
        let t = this._preds[e];
        if (t) return Object.keys(t);
      }
      successors(e) {
        let t = this._sucs[e];
        if (t) return Object.keys(t);
      }
      neighbors(e) {
        let t = this.predecessors(e);
        if (t) {
          let n = new Set(t);
          for (let o of this.successors(e)) n.add(o);
          return Array.from(n.values());
        }
      }
      isLeaf(e) {
        let t;
        return (
          this.isDirected()
            ? (t = this.successors(e))
            : (t = this.neighbors(e)),
          t.length === 0
        );
      }
      filterNodes(e) {
        let t = new this.constructor({
          directed: this._isDirected,
          multigraph: this._isMultigraph,
          compound: this._isCompound,
        });
        (t.setGraph(this.graph()),
          Object.entries(this._nodes).forEach(([r, i]) => {
            e(r) && t.setNode(r, i);
          }),
          Object.values(this._edgeObjs).forEach((r) => {
            t.hasNode(r.v) && t.hasNode(r.w) && t.setEdge(r, this.edge(r));
          }));
        let n = {},
          o = (r) => {
            let i = this.parent(r);
            return !i || t.hasNode(i)
              ? ((n[r] = i ?? void 0), i ?? void 0)
              : i in n
                ? n[i]
                : o(i);
          };
        return (
          this._isCompound && t.nodes().forEach((r) => t.setParent(r, o(r))),
          t
        );
      }
      setDefaultEdgeLabel(e) {
        return (
          typeof e != "function"
            ? (this._defaultEdgeLabelFn = () => e)
            : (this._defaultEdgeLabelFn = e),
          this
        );
      }
      edgeCount() {
        return this._edgeCount;
      }
      edges() {
        return Object.values(this._edgeObjs);
      }
      setPath(e, t) {
        return (
          e.reduce(
            (n, o) => (
              t !== void 0 ? this.setEdge(n, o, t) : this.setEdge(n, o),
              o
            ),
          ),
          this
        );
      }
      setEdge(e, t, n, o) {
        let r,
          i,
          s,
          a,
          c = !1;
        (typeof e == "object" && e !== null && "v" in e
          ? ((r = e.v),
            (i = e.w),
            (s = e.name),
            arguments.length === 2 && ((a = t), (c = !0)))
          : ((r = e),
            (i = t),
            (s = o),
            arguments.length > 2 && ((a = n), (c = !0))),
          (r = "" + r),
          (i = "" + i),
          s !== void 0 && (s = "" + s));
        let l = wn(this._isDirected, r, i, s);
        if (l in this._edgeLabels)
          return (c && (this._edgeLabels[l] = a), this);
        if (s !== void 0 && !this._isMultigraph)
          throw new Error("Cannot set a named edge when isMultigraph = false");
        (this.setNode(r),
          this.setNode(i),
          (this._edgeLabels[l] = c ? a : this._defaultEdgeLabelFn(r, i, s)));
        let u = S0(this._isDirected, r, i, s);
        return (
          (r = u.v),
          (i = u.w),
          Object.freeze(u),
          (this._edgeObjs[l] = u),
          _l(this._preds[i], r),
          _l(this._sucs[r], i),
          (this._in[i][l] = u),
          (this._out[r][l] = u),
          this._edgeCount++,
          this
        );
      }
      edge(e, t, n) {
        let o =
          arguments.length === 1
            ? Pr(this._isDirected, e)
            : wn(this._isDirected, e, t, n);
        return this._edgeLabels[o];
      }
      edgeAsObj(e, t, n) {
        let o = arguments.length === 1 ? this.edge(e) : this.edge(e, t, n);
        return typeof o != "object" ? { label: o } : o;
      }
      hasEdge(e, t, n) {
        return (
          (arguments.length === 1
            ? Pr(this._isDirected, e)
            : wn(this._isDirected, e, t, n)) in this._edgeLabels
        );
      }
      removeEdge(e, t, n) {
        let o =
            arguments.length === 1
              ? Pr(this._isDirected, e)
              : wn(this._isDirected, e, t, n),
          r = this._edgeObjs[o];
        if (r) {
          let i = r.v,
            s = r.w;
          (delete this._edgeLabels[o],
            delete this._edgeObjs[o],
            Sl(this._preds[s], i),
            Sl(this._sucs[i], s),
            delete this._in[s][o],
            delete this._out[i][o],
            this._edgeCount--);
        }
        return this;
      }
      inEdges(e, t) {
        return this.isDirected()
          ? this.filterEdges(this._in[e], e, t)
          : this.nodeEdges(e, t);
      }
      outEdges(e, t) {
        return this.isDirected()
          ? this.filterEdges(this._out[e], e, t)
          : this.nodeEdges(e, t);
      }
      nodeEdges(e, t) {
        if (e in this._nodes)
          return this.filterEdges({ ...this._in[e], ...this._out[e] }, e, t);
      }
      _removeFromParentsChildList(e) {
        delete this._children[this._parent[e]][e];
      }
      filterEdges(e, t, n) {
        if (!e) return;
        let o = Object.values(e);
        return n
          ? o.filter(
              (r) => (r.v === t && r.w === n) || (r.v === n && r.w === t),
            )
          : o;
      }
    };
  function _l(e, t) {
    e[t] ? e[t]++ : (e[t] = 1);
  }
  function Sl(e, t) {
    e[t] !== void 0 && !--e[t] && delete e[t];
  }
  function wn(e, t, n, o) {
    let r = "" + t,
      i = "" + n;
    if (!e && r > i) {
      let s = r;
      ((r = i), (i = s));
    }
    return r + "" + i + "" + (o === void 0 ? "\0" : o);
  }
  function S0(e, t, n, o) {
    let r = "" + t,
      i = "" + n;
    if (!e && r > i) {
      let a = r;
      ((r = i), (i = a));
    }
    let s = { v: r, w: i };
    return (o && (s.name = o), s);
  }
  function Pr(e, t) {
    return wn(e, t.v, t.w, t.name);
  }
  var N0 = "4.0.1",
    Hl = {};
  $l(Hl, { read: () => k0, write: () => C0 });
  function C0(e) {
    let t = {
        options: {
          directed: e.isDirected(),
          multigraph: e.isMultigraph(),
          compound: e.isCompound(),
        },
        nodes: M0(e),
        edges: I0(e),
      },
      n = e.graph();
    return (n !== void 0 && (t.value = structuredClone(n)), t);
  }
  function M0(e) {
    return e.nodes().map((t) => {
      let n = e.node(t),
        o = e.parent(t),
        r = { v: t };
      return (n !== void 0 && (r.value = n), o !== void 0 && (r.parent = o), r);
    });
  }
  function I0(e) {
    return e.edges().map((t) => {
      let n = e.edge(t),
        o = { v: t.v, w: t.w };
      return (
        t.name !== void 0 && (o.name = t.name),
        n !== void 0 && (o.value = n),
        o
      );
    });
  }
  function k0(e) {
    let t = new xe(e.options);
    return (
      e.value !== void 0 && t.setGraph(e.value),
      e.nodes.forEach((n) => {
        (t.setNode(n.v, n.value), n.parent && t.setParent(n.v, n.parent));
      }),
      e.edges.forEach((n) => {
        t.setEdge({ v: n.v, w: n.w, name: n.name }, n.value);
      }),
      t
    );
  }
  var $r = {};
  $l($r, {
    CycleException: () => So,
    bellmanFord: () => Bl,
    components: () => A0,
    dijkstra: () => _o,
    dijkstraAll: () => z0,
    findCycles: () => R0,
    floydWarshall: () => $0,
    isAcyclic: () => B0,
    postorder: () => F0,
    preorder: () => Y0,
    prim: () => X0,
    shortestPaths: () => Z0,
    tarjan: () => Fl,
    topsort: () => Yl,
  });
  var O0 = () => 1;
  function Bl(e, t, n, o) {
    return P0(
      e,
      String(t),
      n || O0,
      o ||
        function (r) {
          return e.outEdges(r);
        },
    );
  }
  function P0(e, t, n, o) {
    let r = {},
      i,
      s = 0,
      a = e.nodes(),
      c = function (d) {
        let f = n(d);
        r[d.v].distance + f < r[d.w].distance &&
          ((r[d.w] = { distance: r[d.v].distance + f, predecessor: d.v }),
          (i = !0));
      },
      l = function () {
        a.forEach(function (d) {
          o(d).forEach(function (f) {
            let h = f.v === d ? f.v : f.w,
              p = h === f.v ? f.w : f.v;
            c({ v: h, w: p });
          });
        });
      };
    a.forEach(function (d) {
      let f = d === t ? 0 : Number.POSITIVE_INFINITY;
      r[d] = { distance: f, predecessor: "" };
    });
    let u = a.length;
    for (let d = 1; d < u && ((i = !1), s++, l(), !!i); d++);
    if (s === u - 1 && ((i = !1), l(), i))
      throw new Error("The graph contains a negative weight cycle");
    return r;
  }
  function A0(e) {
    let t = {},
      n = [],
      o;
    function r(i) {
      i in t ||
        ((t[i] = !0),
        o.push(i),
        e.successors(i).forEach(r),
        e.predecessors(i).forEach(r));
    }
    return (
      e.nodes().forEach(function (i) {
        ((o = []), r(i), o.length && n.push(o));
      }),
      n
    );
  }
  var Vl = class {
      constructor() {
        ((this._arr = []), (this._keyIndices = {}));
      }
      size() {
        return this._arr.length;
      }
      keys() {
        return this._arr.map((e) => e.key);
      }
      has(e) {
        return e in this._keyIndices;
      }
      priority(e) {
        let t = this._keyIndices[e];
        if (t !== void 0) return this._arr[t].priority;
      }
      min() {
        if (this.size() === 0) throw new Error("Queue underflow");
        return this._arr[0].key;
      }
      add(e, t) {
        let n = this._keyIndices,
          o = String(e);
        if (!(o in n)) {
          let r = this._arr,
            i = r.length;
          return (
            (n[o] = i),
            r.push({ key: o, priority: t }),
            this._decrease(i),
            !0
          );
        }
        return !1;
      }
      removeMin() {
        this._swap(0, this._arr.length - 1);
        let e = this._arr.pop();
        return (delete this._keyIndices[e.key], this._heapify(0), e.key);
      }
      decrease(e, t) {
        let n = this._keyIndices[e];
        if (n === void 0) throw new Error(`Key not found: ${e}`);
        let o = this._arr[n].priority;
        if (t > o)
          throw new Error(
            `New priority is greater than current priority. Key: ${e} Old: ${o} New: ${t}`,
          );
        ((this._arr[n].priority = t), this._decrease(n));
      }
      _heapify(e) {
        let t = this._arr,
          n = 2 * e,
          o = n + 1,
          r = e;
        n < t.length &&
          ((r = t[n].priority < t[r].priority ? n : r),
          o < t.length && (r = t[o].priority < t[r].priority ? o : r),
          r !== e && (this._swap(e, r), this._heapify(r)));
      }
      _decrease(e) {
        let t = this._arr,
          n = t[e].priority,
          o;
        for (; e !== 0 && ((o = e >> 1), !(t[o].priority < n));)
          (this._swap(e, o), (e = o));
      }
      _swap(e, t) {
        let n = this._arr,
          o = this._keyIndices,
          r = n[e],
          i = n[t];
        ((n[e] = i), (n[t] = r), (o[i.key] = e), (o[r.key] = t));
      }
    },
    T0 = () => 1;
  function _o(e, t, n, o) {
    let r = function (i) {
      return e.outEdges(i);
    };
    return D0(e, String(t), n || T0, o || r);
  }
  function D0(e, t, n, o) {
    let r = {},
      i = new Vl(),
      s,
      a,
      c = function (l) {
        let u = l.v !== s ? l.v : l.w,
          d = r[u],
          f = n(l),
          h = a.distance + f;
        if (f < 0)
          throw new Error(
            "dijkstra does not allow negative edge weights. Bad edge: " +
              l +
              " Weight: " +
              f,
          );
        h < d.distance &&
          ((d.distance = h), (d.predecessor = s), i.decrease(u, h));
      };
    for (
      e.nodes().forEach(function (l) {
        let u = l === t ? 0 : Number.POSITIVE_INFINITY;
        ((r[l] = { distance: u, predecessor: "" }), i.add(l, u));
      });
      i.size() > 0 &&
      ((s = i.removeMin()),
      (a = r[s]),
      a.distance !== Number.POSITIVE_INFINITY);
    )
      o(s).forEach(c);
    return r;
  }
  function z0(e, t, n) {
    return e.nodes().reduce(function (o, r) {
      return ((o[r] = _o(e, r, t, n)), o);
    }, {});
  }
  function Fl(e) {
    let t = 0,
      n = [],
      o = {},
      r = [];
    function i(s) {
      let a = (o[s] = { onStack: !0, lowlink: t, index: t++ });
      if (
        (n.push(s),
        e.successors(s).forEach(function (c) {
          c in o
            ? o[c].onStack && (a.lowlink = Math.min(a.lowlink, o[c].index))
            : (i(c), (a.lowlink = Math.min(a.lowlink, o[c].lowlink)));
        }),
        a.lowlink === a.index)
      ) {
        let c = [],
          l;
        do ((l = n.pop()), (o[l].onStack = !1), c.push(l));
        while (s !== l);
        r.push(c);
      }
    }
    return (
      e.nodes().forEach(function (s) {
        s in o || i(s);
      }),
      r
    );
  }
  function R0(e) {
    return Fl(e).filter(function (t) {
      return t.length > 1 || (t.length === 1 && e.hasEdge(t[0], t[0]));
    });
  }
  var L0 = () => 1;
  function $0(e, t, n) {
    return H0(
      e,
      t || L0,
      n ||
        function (o) {
          return e.outEdges(o);
        },
    );
  }
  function H0(e, t, n) {
    let o = {},
      r = e.nodes();
    return (
      r.forEach(function (i) {
        ((o[i] = {}),
          (o[i][i] = { distance: 0, predecessor: "" }),
          r.forEach(function (s) {
            i !== s &&
              (o[i][s] = {
                distance: Number.POSITIVE_INFINITY,
                predecessor: "",
              });
          }),
          n(i).forEach(function (s) {
            let a = s.v === i ? s.w : s.v,
              c = t(s);
            o[i][a] = { distance: c, predecessor: i };
          }));
      }),
      r.forEach(function (i) {
        let s = o[i];
        r.forEach(function (a) {
          let c = o[a];
          r.forEach(function (l) {
            let u = c[i],
              d = s[l],
              f = c[l],
              h = u.distance + d.distance;
            h < f.distance &&
              ((f.distance = h), (f.predecessor = d.predecessor));
          });
        });
      }),
      o
    );
  }
  var So = class extends Error {
    constructor(...e) {
      super(...e);
    }
  };
  function Yl(e) {
    let t = {},
      n = {},
      o = [];
    function r(i) {
      if (i in n) throw new So();
      i in t ||
        ((n[i] = !0),
        (t[i] = !0),
        e.predecessors(i).forEach(r),
        delete n[i],
        o.push(i));
    }
    if ((e.sinks().forEach(r), Object.keys(t).length !== e.nodeCount()))
      throw new So();
    return o;
  }
  function B0(e) {
    try {
      Yl(e);
    } catch (t) {
      if (t instanceof So) return !1;
      throw t;
    }
    return !0;
  }
  function V0(e, t, n, o, r) {
    Array.isArray(t) || (t = [t]);
    let i = (a) => {
        var c;
        return (c = e.isDirected() ? e.successors(a) : e.neighbors(a)) != null
          ? c
          : [];
      },
      s = {};
    return (
      t.forEach(function (a) {
        if (!e.hasNode(a)) throw new Error("Graph does not have node: " + a);
        r = Xl(e, a, n === "post", s, i, o, r);
      }),
      r
    );
  }
  function Xl(e, t, n, o, r, i, s) {
    return (
      t in o ||
        ((o[t] = !0),
        n || (s = i(s, t)),
        r(t).forEach(function (a) {
          s = Xl(e, a, n, o, r, i, s);
        }),
        n && (s = i(s, t))),
      s
    );
  }
  function Zl(e, t, n) {
    return V0(
      e,
      t,
      n,
      function (o, r) {
        return (o.push(r), o);
      },
      [],
    );
  }
  function F0(e, t) {
    return Zl(e, t, "post");
  }
  function Y0(e, t) {
    return Zl(e, t, "pre");
  }
  function X0(e, t) {
    let n = new xe(),
      o = {},
      r = new Vl(),
      i;
    function s(c) {
      let l = c.v === i ? c.w : c.v,
        u = r.priority(l);
      if (u !== void 0) {
        let d = t(c);
        d < u && ((o[l] = i), r.decrease(l, d));
      }
    }
    if (e.nodeCount() === 0) return n;
    (e.nodes().forEach(function (c) {
      (r.add(c, Number.POSITIVE_INFINITY), n.setNode(c));
    }),
      r.decrease(e.nodes()[0], 0));
    let a = !1;
    for (; r.size() > 0;) {
      if (((i = r.removeMin()), i in o)) n.setEdge(i, o[i]);
      else {
        if (a) throw new Error("Input graph is not connected: " + e);
        a = !0;
      }
      e.nodeEdges(i).forEach(s);
    }
    return n;
  }
  function Z0(e, t, n, o) {
    return W0(
      e,
      t,
      n,
      o ??
        ((r) => {
          let i = e.outEdges(r);
          return i ?? [];
        }),
    );
  }
  function W0(e, t, n, o) {
    if (n === void 0) return _o(e, t, n, o);
    let r = !1,
      i = e.nodes();
    for (let s = 0; s < i.length; s++) {
      let a = o(i[s]);
      for (let c = 0; c < a.length; c++) {
        let l = a[c],
          u = l.v === i[s] ? l.v : l.w,
          d = u === l.v ? l.w : l.v;
        n({ v: u, w: d }) < 0 && (r = !0);
      }
      if (r) return Bl(e, t, n, o);
    }
    return _o(e, t, n, o);
  }
  function zt(e, t, n, o) {
    let r = o;
    for (; e.hasNode(r);) r = Hr(o);
    return ((n.dummy = t), e.setNode(r, n), r);
  }
  function q0(e) {
    let t = new xe().setGraph(e.graph());
    return (
      e.nodes().forEach((n) => t.setNode(n, e.node(n))),
      e.edges().forEach((n) => {
        let o = t.edge(n.v, n.w) || { weight: 0, minlen: 1 },
          r = e.edge(n);
        t.setEdge(n.v, n.w, {
          weight: o.weight + r.weight,
          minlen: Math.max(o.minlen, r.minlen),
        });
      }),
      t
    );
  }
  function Wl(e) {
    let t = new xe({ multigraph: e.isMultigraph() }).setGraph(e.graph());
    return (
      e.nodes().forEach((n) => {
        e.children(n).length || t.setNode(n, e.node(n));
      }),
      e.edges().forEach((n) => {
        t.setEdge(n, e.edge(n));
      }),
      t
    );
  }
  function Nl(e, t) {
    let n = e.x,
      o = e.y,
      r = t.x - n,
      i = t.y - o,
      s = e.width / 2,
      a = e.height / 2;
    if (!r && !i)
      throw new Error(
        "Not possible to find intersection inside of the rectangle",
      );
    let c, l;
    return (
      Math.abs(i) * s > Math.abs(r) * a
        ? (i < 0 && (a = -a), (c = (a * r) / i), (l = a))
        : (r < 0 && (s = -s), (c = s), (l = (s * i) / r)),
      { x: n + c, y: o + l }
    );
  }
  function bn(e) {
    let t = vn(Gl(e) + 1).map(() => []);
    return (
      e.nodes().forEach((n) => {
        let o = e.node(n),
          r = o.rank;
        r !== void 0 && (t[r] || (t[r] = []), (t[r][o.order] = n));
      }),
      t
    );
  }
  function G0(e) {
    let t = e.nodes().map((o) => {
        let r = e.node(o).rank;
        return r === void 0 ? Number.MAX_VALUE : r;
      }),
      n = Oe(Math.min, t);
    e.nodes().forEach((o) => {
      let r = e.node(o);
      Object.hasOwn(r, "rank") && (r.rank -= n);
    });
  }
  function j0(e) {
    let t = e
        .nodes()
        .map((s) => e.node(s).rank)
        .filter((s) => s !== void 0),
      n = Oe(Math.min, t),
      o = [];
    e.nodes().forEach((s) => {
      let a = e.node(s).rank - n;
      (o[a] || (o[a] = []), o[a].push(s));
    });
    let r = 0,
      i = e.graph().nodeRankFactor;
    Array.from(o).forEach((s, a) => {
      s === void 0 && a % i !== 0
        ? --r
        : s !== void 0 && r && s.forEach((c) => (e.node(c).rank += r));
    });
  }
  function Cl(e, t, n, o) {
    let r = { width: 0, height: 0 };
    return (
      arguments.length >= 4 && ((r.rank = n), (r.order = o)),
      zt(e, "border", r, t)
    );
  }
  function K0(e, t = ql) {
    let n = [];
    for (let o = 0; o < e.length; o += t) {
      let r = e.slice(o, o + t);
      n.push(r);
    }
    return n;
  }
  var ql = 65535;
  function Oe(e, t) {
    if (t.length > ql) {
      let n = K0(t);
      return e(...n.map((o) => e(...o)));
    } else return e(...t);
  }
  function Gl(e) {
    let t = e.nodes().map((n) => {
      let o = e.node(n).rank;
      return o === void 0 ? Number.MIN_VALUE : o;
    });
    return Oe(Math.max, t);
  }
  function U0(e, t) {
    let n = { lhs: [], rhs: [] };
    return (
      e.forEach((o) => {
        t(o) ? n.lhs.push(o) : n.rhs.push(o);
      }),
      n
    );
  }
  function jl(e, t) {
    let n = Date.now();
    try {
      return t();
    } finally {
      console.log(e + " time: " + (Date.now() - n) + "ms");
    }
  }
  function Kl(e, t) {
    return t();
  }
  var Q0 = 0;
  function Hr(e) {
    let t = ++Q0;
    return e + ("" + t);
  }
  function vn(e, t, n = 1) {
    t == null && ((t = e), (e = 0));
    let o = (i) => i < t;
    n < 0 && (o = (i) => t < i);
    let r = [];
    for (let i = e; o(i); i += n) r.push(i);
    return r;
  }
  function No(e, t) {
    let n = {};
    for (let o of t) e[o] !== void 0 && (n[o] = e[o]);
    return n;
  }
  function Co(e, t) {
    let n;
    return (
      typeof t == "string" ? (n = (o) => o[t]) : (n = t),
      Object.entries(e).reduce((o, [r, i]) => ((o[r] = n(i, r)), o), {})
    );
  }
  function J0(e, t) {
    return e.reduce((n, o, r) => ((n[o] = t[r]), n), {});
  }
  var Mo = "\0",
    ey = "3.0.0",
    ty = class {
      constructor() {
        E0(this, "_sentinel");
        let e = {};
        ((e._next = e._prev = e), (this._sentinel = e));
      }
      dequeue() {
        let e = this._sentinel,
          t = e._prev;
        if (t !== e) return (Ml(t), t);
      }
      enqueue(e) {
        let t = this._sentinel;
        (e._prev && e._next && Ml(e),
          (e._next = t._next),
          (t._next._prev = e),
          (t._next = e),
          (e._prev = t));
      }
      toString() {
        let e = [],
          t = this._sentinel,
          n = t._prev;
        for (; n !== t;) (e.push(JSON.stringify(n, ny)), (n = n._prev));
        return "[" + e.join(", ") + "]";
      }
    };
  function Ml(e) {
    ((e._prev._next = e._next),
      (e._next._prev = e._prev),
      delete e._next,
      delete e._prev);
  }
  function ny(e, t) {
    if (e !== "_next" && e !== "_prev") return t;
  }
  var oy = ty,
    ry = () => 1;
  function iy(e, t) {
    if (e.nodeCount() <= 1) return [];
    let n = ay(e, t || ry);
    return sy(n.graph, n.buckets, n.zeroIdx).flatMap(
      (o) => e.outEdges(o.v, o.w) || [],
    );
  }
  function sy(e, t, n) {
    var o;
    let r = [],
      i = t[t.length - 1],
      s = t[0],
      a;
    for (; e.nodeCount();) {
      for (; (a = s.dequeue());) Ar(e, t, n, a);
      for (; (a = i.dequeue());) Ar(e, t, n, a);
      if (e.nodeCount()) {
        for (let c = t.length - 2; c > 0; --c)
          if (((a = (o = t[c]) == null ? void 0 : o.dequeue()), a)) {
            r = r.concat(Ar(e, t, n, a, !0) || []);
            break;
          }
      }
    }
    return r;
  }
  function Ar(e, t, n, o, r) {
    let i = [],
      s = r ? i : void 0;
    return (
      (e.inEdges(o.v) || []).forEach((a) => {
        let c = e.edge(a),
          l = e.node(a.v);
        (r && i.push({ v: a.v, w: a.w }), (l.out -= c), Lr(t, n, l));
      }),
      (e.outEdges(o.v) || []).forEach((a) => {
        let c = e.edge(a),
          l = a.w,
          u = e.node(l);
        ((u.in -= c), Lr(t, n, u));
      }),
      e.removeNode(o.v),
      s
    );
  }
  function ay(e, t) {
    let n = new xe(),
      o = 0,
      r = 0;
    (e.nodes().forEach((a) => {
      n.setNode(a, { v: a, in: 0, out: 0 });
    }),
      e.edges().forEach((a) => {
        let c = n.edge(a.v, a.w) || 0,
          l = t(a),
          u = c + l;
        n.setEdge(a.v, a.w, u);
        let d = n.node(a.v),
          f = n.node(a.w);
        ((r = Math.max(r, (d.out += l))), (o = Math.max(o, (f.in += l))));
      }));
    let i = cy(r + o + 3).map(() => new oy()),
      s = o + 1;
    return (
      n.nodes().forEach((a) => {
        Lr(i, s, n.node(a));
      }),
      { graph: n, buckets: i, zeroIdx: s }
    );
  }
  function Lr(e, t, n) {
    var o, r, i;
    n.out
      ? n.in
        ? (i = e[n.out - n.in + t]) == null || i.enqueue(n)
        : (r = e[e.length - 1]) == null || r.enqueue(n)
      : (o = e[0]) == null || o.enqueue(n);
  }
  function cy(e) {
    let t = [];
    for (let n = 0; n < e; n++) t.push(n);
    return t;
  }
  function ly(e) {
    (e.graph().acyclicer === "greedy" ? iy(e, t(e)) : uy(e)).forEach((n) => {
      let o = e.edge(n);
      (e.removeEdge(n),
        (o.forwardName = n.name),
        (o.reversed = !0),
        e.setEdge(n.w, n.v, o, Hr("rev")));
    });
    function t(n) {
      return (o) => n.edge(o).weight;
    }
  }
  function uy(e) {
    let t = [],
      n = {},
      o = {};
    function r(i) {
      Object.hasOwn(o, i) ||
        ((o[i] = !0),
        (n[i] = !0),
        e.outEdges(i).forEach((s) => {
          Object.hasOwn(n, s.w) ? t.push(s) : r(s.w);
        }),
        delete n[i]);
    }
    return (e.nodes().forEach(r), t);
  }
  function dy(e) {
    e.edges().forEach((t) => {
      let n = e.edge(t);
      if (n.reversed) {
        e.removeEdge(t);
        let o = n.forwardName;
        (delete n.reversed, delete n.forwardName, e.setEdge(t.w, t.v, n, o));
      }
    });
  }
  function fy(e) {
    ((e.graph().dummyChains = []), e.edges().forEach((t) => hy(e, t)));
  }
  function hy(e, t) {
    let n = t.v,
      o = e.node(n).rank,
      r = t.w,
      i = e.node(r).rank,
      s = t.name,
      a = e.edge(t),
      c = a.labelRank;
    if (i === o + 1) return;
    e.removeEdge(t);
    let l, u, d;
    for (d = 0, ++o; o < i; ++d, ++o)
      ((a.points = []),
        (u = { width: 0, height: 0, edgeLabel: a, edgeObj: t, rank: o }),
        (l = zt(e, "edge", u, "_d")),
        o === c &&
          ((u.width = a.width),
          (u.height = a.height),
          (u.dummy = "edge-label"),
          (u.labelpos = a.labelpos)),
        e.setEdge(n, l, { weight: a.weight }, s),
        d === 0 && e.graph().dummyChains.push(l),
        (n = l));
    e.setEdge(n, r, { weight: a.weight }, s);
  }
  function py(e) {
    e.graph().dummyChains.forEach((t) => {
      let n = e.node(t),
        o = n.edgeLabel,
        r;
      for (e.setEdge(n.edgeObj, o); n.dummy;)
        ((r = e.successors(t)[0]),
          e.removeNode(t),
          o.points.push({ x: n.x, y: n.y }),
          n.dummy === "edge-label" &&
            ((o.x = n.x),
            (o.y = n.y),
            (o.width = n.width),
            (o.height = n.height)),
          (t = r),
          (n = e.node(t)));
    });
  }
  function Br(e) {
    let t = {};
    function n(o) {
      let r = e.node(o);
      if (Object.hasOwn(t, o)) return r.rank;
      t[o] = !0;
      let i = e.outEdges(o),
        s = i
          ? i.map((c) =>
              c == null ? Number.POSITIVE_INFINITY : n(c.w) - e.edge(c).minlen,
            )
          : [],
        a = Oe(Math.min, s);
      return (a === Number.POSITIVE_INFINITY && (a = 0), (r.rank = a));
    }
    e.sources().forEach(n);
  }
  function Dt(e, t) {
    return e.node(t.w).rank - e.node(t.v).rank - e.edge(t).minlen;
  }
  var Ul = gy;
  function gy(e) {
    let t = new xe({ directed: !1 }),
      n = e.nodes();
    if (n.length === 0) throw new Error("Graph must have at least one node");
    let o = n[0],
      r = e.nodeCount();
    t.setNode(o, {});
    let i, s;
    for (; my(t, e) < r && ((i = yy(t, e)), !!i);)
      ((s = t.hasNode(i.v) ? Dt(e, i) : -Dt(e, i)), xy(t, e, s));
    return t;
  }
  function my(e, t) {
    function n(o) {
      let r = t.nodeEdges(o);
      r &&
        r.forEach((i) => {
          let s = i.v,
            a = o === s ? i.w : s;
          !e.hasNode(a) &&
            !Dt(t, i) &&
            (e.setNode(a, {}), e.setEdge(o, a, {}), n(a));
        });
    }
    return (e.nodes().forEach(n), e.nodeCount());
  }
  function yy(e, t) {
    return t.edges().reduce(
      (n, o) => {
        let r = Number.POSITIVE_INFINITY;
        return (
          e.hasNode(o.v) !== e.hasNode(o.w) && (r = Dt(t, o)),
          r < n[0] ? [r, o] : n
        );
      },
      [Number.POSITIVE_INFINITY, null],
    )[1];
  }
  function xy(e, t, n) {
    e.nodes().forEach((o) => (t.node(o).rank += n));
  }
  var { preorder: wy, postorder: vy } = $r,
    by = pt;
  pt.initLowLimValues = Fr;
  pt.initCutValues = Vr;
  pt.calcCutValue = Ql;
  pt.leaveEdge = eu;
  pt.enterEdge = tu;
  pt.exchangeEdges = nu;
  function pt(e) {
    ((e = q0(e)), Br(e));
    let t = Ul(e);
    (Fr(t), Vr(t, e));
    let n, o;
    for (; (n = eu(t));) ((o = tu(t, e, n)), nu(t, e, n, o));
  }
  function Vr(e, t) {
    let n = vy(e, e.nodes());
    ((n = n.slice(0, n.length - 1)), n.forEach((o) => Ey(e, t, o)));
  }
  function Ey(e, t, n) {
    let o = e.node(n).parent,
      r = e.edge(n, o);
    r.cutvalue = Ql(e, t, n);
  }
  function Ql(e, t, n) {
    let o = e.node(n).parent,
      r = !0,
      i = t.edge(n, o),
      s = 0;
    (i || ((r = !1), (i = t.edge(o, n))), (s = i.weight));
    let a = t.nodeEdges(n);
    return (
      a &&
        a.forEach((c) => {
          let l = c.v === n,
            u = l ? c.w : c.v;
          if (u !== o) {
            let d = l === r,
              f = t.edge(c).weight;
            if (((s += d ? f : -f), Sy(e, n, u))) {
              let h = e.edge(n, u).cutvalue;
              s += d ? -h : h;
            }
          }
        }),
      s
    );
  }
  function Fr(e, t) {
    (arguments.length < 2 && (t = e.nodes()[0]), Jl(e, {}, 1, t));
  }
  function Jl(e, t, n, o, r) {
    let i = n,
      s = e.node(o);
    t[o] = !0;
    let a = e.neighbors(o);
    return (
      a &&
        a.forEach((c) => {
          Object.hasOwn(t, c) || (n = Jl(e, t, n, c, o));
        }),
      (s.low = i),
      (s.lim = n++),
      r ? (s.parent = r) : delete s.parent,
      n
    );
  }
  function eu(e) {
    return e.edges().find((t) => e.edge(t).cutvalue < 0);
  }
  function tu(e, t, n) {
    let o = n.v,
      r = n.w;
    t.hasEdge(o, r) || ((o = n.w), (r = n.v));
    let i = e.node(o),
      s = e.node(r),
      a = i,
      c = !1;
    return (
      i.lim > s.lim && ((a = s), (c = !0)),
      t
        .edges()
        .filter(
          (l) => c === Il(e, e.node(l.v), a) && c !== Il(e, e.node(l.w), a),
        )
        .reduce((l, u) => (Dt(t, u) < Dt(t, l) ? u : l))
    );
  }
  function nu(e, t, n, o) {
    let r = n.v,
      i = n.w;
    (e.removeEdge(r, i), e.setEdge(o.v, o.w, {}), Fr(e), Vr(e, t), _y(e, t));
  }
  function _y(e, t) {
    let n = e.nodes().find((r) => !e.node(r).parent);
    if (!n) return;
    let o = wy(e, [n]);
    ((o = o.slice(1)),
      o.forEach((r) => {
        let i = e.node(r).parent,
          s = t.edge(r, i),
          a = !1;
        (s || ((s = t.edge(i, r)), (a = !0)),
          (t.node(r).rank = t.node(i).rank + (a ? s.minlen : -s.minlen)));
      }));
  }
  function Sy(e, t, n) {
    return e.hasEdge(t, n);
  }
  function Il(e, t, n) {
    return n.low <= t.lim && t.lim <= n.lim;
  }
  var Ny = Cy;
  function Cy(e) {
    let t = e.graph().ranker;
    if (typeof t == "function") return t(e);
    switch (t) {
      case "network-simplex":
        kl(e);
        break;
      case "tight-tree":
        Iy(e);
        break;
      case "longest-path":
        My(e);
        break;
      case "none":
        break;
      default:
        kl(e);
    }
  }
  var My = Br;
  function Iy(e) {
    (Br(e), Ul(e));
  }
  function kl(e) {
    by(e);
  }
  var ky = Oy;
  function Oy(e) {
    let t = Ay(e);
    e.graph().dummyChains.forEach((n) => {
      let o = e.node(n),
        r = o.edgeObj,
        i = Py(e, t, r.v, r.w),
        s = i.path,
        a = i.lca,
        c = 0,
        l = s[c],
        u = !0;
      for (; n !== r.w;) {
        if (((o = e.node(n)), u)) {
          for (; (l = s[c]) !== a && e.node(l).maxRank < o.rank;) c++;
          l === a && (u = !1);
        }
        if (!u) {
          for (; c < s.length - 1 && e.node(s[c + 1]).minRank <= o.rank;) c++;
          l = s[c];
        }
        (l !== void 0 && e.setParent(n, l), (n = e.successors(n)[0]));
      }
    });
  }
  function Py(e, t, n, o) {
    let r = [],
      i = [],
      s = Math.min(t[n].low, t[o].low),
      a = Math.max(t[n].lim, t[o].lim),
      c;
    c = n;
    do ((c = e.parent(c)), r.push(c));
    while (c && (t[c].low > s || a > t[c].lim));
    let l = c,
      u = o;
    for (; (u = e.parent(u)) !== l;) i.push(u);
    return { path: r.concat(i.reverse()), lca: l };
  }
  function Ay(e) {
    let t = {},
      n = 0;
    function o(r) {
      let i = n;
      (e.children(r).forEach(o), (t[r] = { low: i, lim: n++ }));
    }
    return (e.children(Mo).forEach(o), t);
  }
  function Ty(e) {
    let t = zt(e, "root", {}, "_root"),
      n = Dy(e),
      o = Object.values(n),
      r = Oe(Math.max, o) - 1,
      i = 2 * r + 1;
    ((e.graph().nestingRoot = t),
      e.edges().forEach((a) => (e.edge(a).minlen *= i)));
    let s = zy(e) + 1;
    (e.children(Mo).forEach((a) => ou(e, t, i, s, r, n, a)),
      (e.graph().nodeRankFactor = i));
  }
  function ou(e, t, n, o, r, i, s) {
    var a;
    let c = e.children(s);
    if (!c.length) {
      s !== t && e.setEdge(t, s, { weight: 0, minlen: n });
      return;
    }
    let l = Cl(e, "_bt"),
      u = Cl(e, "_bb"),
      d = e.node(s);
    (e.setParent(l, s),
      (d.borderTop = l),
      e.setParent(u, s),
      (d.borderBottom = u),
      c.forEach((f) => {
        var h;
        ou(e, t, n, o, r, i, f);
        let p = e.node(f),
          x = p.borderTop ? p.borderTop : f,
          y = p.borderBottom ? p.borderBottom : f,
          m = p.borderTop ? o : 2 * o,
          b = x !== y ? 1 : r - ((h = i[s]) != null ? h : 0) + 1;
        (e.setEdge(l, x, { weight: m, minlen: b, nestingEdge: !0 }),
          e.setEdge(y, u, { weight: m, minlen: b, nestingEdge: !0 }));
      }),
      e.parent(s) ||
        e.setEdge(t, l, {
          weight: 0,
          minlen: r + ((a = i[s]) != null ? a : 0),
        }));
  }
  function Dy(e) {
    let t = {};
    function n(o, r) {
      let i = e.children(o);
      (i && i.length && i.forEach((s) => n(s, r + 1)), (t[o] = r));
    }
    return (e.children(Mo).forEach((o) => n(o, 1)), t);
  }
  function zy(e) {
    return e.edges().reduce((t, n) => t + e.edge(n).weight, 0);
  }
  function Ry(e) {
    let t = e.graph();
    (e.removeNode(t.nestingRoot),
      delete t.nestingRoot,
      e.edges().forEach((n) => {
        e.edge(n).nestingEdge && e.removeEdge(n);
      }));
  }
  var Ly = $y;
  function $y(e) {
    function t(n) {
      let o = e.children(n),
        r = e.node(n);
      if ((o.length && o.forEach(t), Object.hasOwn(r, "minRank"))) {
        ((r.borderLeft = []), (r.borderRight = []));
        for (let i = r.minRank, s = r.maxRank + 1; i < s; ++i)
          (Ol(e, "borderLeft", "_bl", n, r, i),
            Ol(e, "borderRight", "_br", n, r, i));
      }
    }
    e.children(Mo).forEach(t);
  }
  function Ol(e, t, n, o, r, i) {
    let s = { width: 0, height: 0, rank: i, borderType: t },
      a = r[t][i - 1],
      c = zt(e, "border", s, n);
    ((r[t][i] = c), e.setParent(c, o), a && e.setEdge(a, c, { weight: 1 }));
  }
  function Hy(e) {
    var t;
    let n = (t = e.graph().rankdir) == null ? void 0 : t.toLowerCase();
    (n === "lr" || n === "rl") && ru(e);
  }
  function By(e) {
    var t;
    let n = (t = e.graph().rankdir) == null ? void 0 : t.toLowerCase();
    ((n === "bt" || n === "rl") && Vy(e),
      (n === "lr" || n === "rl") && (Fy(e), ru(e)));
  }
  function ru(e) {
    (e.nodes().forEach((t) => Pl(e.node(t))),
      e.edges().forEach((t) => Pl(e.edge(t))));
  }
  function Pl(e) {
    let t = e.width;
    ((e.width = e.height), (e.height = t));
  }
  function Vy(e) {
    (e.nodes().forEach((t) => Tr(e.node(t))),
      e.edges().forEach((t) => {
        var n;
        let o = e.edge(t);
        ((n = o.points) == null || n.forEach(Tr),
          Object.hasOwn(o, "y") && Tr(o));
      }));
  }
  function Tr(e) {
    e.y = -e.y;
  }
  function Fy(e) {
    (e.nodes().forEach((t) => Dr(e.node(t))),
      e.edges().forEach((t) => {
        var n;
        let o = e.edge(t);
        ((n = o.points) == null || n.forEach(Dr),
          Object.hasOwn(o, "x") && Dr(o));
      }));
  }
  function Dr(e) {
    let t = e.x;
    ((e.x = e.y), (e.y = t));
  }
  function Yy(e) {
    let t = {},
      n = e.nodes().filter((a) => !e.children(a).length),
      o = n.map((a) => e.node(a).rank),
      r = Oe(Math.max, o),
      i = vn(r + 1).map(() => []);
    function s(a) {
      if (t[a]) return;
      t[a] = !0;
      let c = e.node(a);
      i[c.rank].push(a);
      let l = e.successors(a);
      l && l.forEach(s);
    }
    return (n.sort((a, c) => e.node(a).rank - e.node(c).rank).forEach(s), i);
  }
  function Xy(e, t) {
    let n = 0;
    for (let o = 1; o < t.length; ++o) n += Zy(e, t[o - 1], t[o]);
    return n;
  }
  function Zy(e, t, n) {
    let o = J0(
        n,
        n.map((l, u) => u),
      ),
      r = t.flatMap((l) => {
        let u = e.outEdges(l);
        return u
          ? u
              .map((d) => ({ pos: o[d.w], weight: e.edge(d).weight }))
              .sort((d, f) => d.pos - f.pos)
          : [];
      }),
      i = 1;
    for (; i < n.length;) i <<= 1;
    let s = 2 * i - 1;
    i -= 1;
    let a = new Array(s).fill(0),
      c = 0;
    return (
      r.forEach((l) => {
        let u = l.pos + i;
        a[u] += l.weight;
        let d = 0;
        for (; u > 0;)
          (u % 2 && (d += a[u + 1]), (u = (u - 1) >> 1), (a[u] += l.weight));
        c += l.weight * d;
      }),
      c
    );
  }
  function Wy(e, t = []) {
    return t.map((n) => {
      let o = e.inEdges(n);
      if (!o || !o.length) return { v: n };
      {
        let r = o.reduce(
          (i, s) => {
            let a = e.edge(s),
              c = e.node(s.v);
            return {
              sum: i.sum + a.weight * c.order,
              weight: i.weight + a.weight,
            };
          },
          { sum: 0, weight: 0 },
        );
        return { v: n, barycenter: r.sum / r.weight, weight: r.weight };
      }
    });
  }
  function qy(e, t) {
    let n = {};
    (e.forEach((r, i) => {
      let s = { indegree: 0, in: [], out: [], vs: [r.v], i };
      (r.barycenter !== void 0 &&
        ((s.barycenter = r.barycenter), (s.weight = r.weight)),
        (n[r.v] = s));
    }),
      t.edges().forEach((r) => {
        let i = n[r.v],
          s = n[r.w];
        i !== void 0 && s !== void 0 && (s.indegree++, i.out.push(s));
      }));
    let o = Object.values(n).filter((r) => !r.indegree);
    return Gy(o);
  }
  function Gy(e) {
    let t = [];
    function n(r) {
      return (i) => {
        i.merged ||
          ((i.barycenter === void 0 ||
            r.barycenter === void 0 ||
            i.barycenter >= r.barycenter) &&
            jy(r, i));
      };
    }
    function o(r) {
      return (i) => {
        (i.in.push(r), --i.indegree === 0 && e.push(i));
      };
    }
    for (; e.length;) {
      let r = e.pop();
      (t.push(r), r.in.reverse().forEach(n(r)), r.out.forEach(o(r)));
    }
    return t
      .filter((r) => !r.merged)
      .map((r) => No(r, ["vs", "i", "barycenter", "weight"]));
  }
  function jy(e, t) {
    let n = 0,
      o = 0;
    (e.weight && ((n += e.barycenter * e.weight), (o += e.weight)),
      t.weight && ((n += t.barycenter * t.weight), (o += t.weight)),
      (e.vs = t.vs.concat(e.vs)),
      (e.barycenter = n / o),
      (e.weight = o),
      (e.i = Math.min(t.i, e.i)),
      (t.merged = !0));
  }
  function Ky(e, t) {
    let n = U0(e, (u) => Object.hasOwn(u, "barycenter")),
      o = n.lhs,
      r = n.rhs.sort((u, d) => d.i - u.i),
      i = [],
      s = 0,
      a = 0,
      c = 0;
    (o.sort(Uy(!!t)),
      (c = Al(i, r, c)),
      o.forEach((u) => {
        ((c += u.vs.length),
          i.push(u.vs),
          (s += u.barycenter * u.weight),
          (a += u.weight),
          (c = Al(i, r, c)));
      }));
    let l = { vs: i.flat(1) };
    return (a && ((l.barycenter = s / a), (l.weight = a)), l);
  }
  function Al(e, t, n) {
    let o;
    for (; t.length && (o = t[t.length - 1]).i <= n;)
      (t.pop(), e.push(o.vs), n++);
    return n;
  }
  function Uy(e) {
    return (t, n) =>
      t.barycenter < n.barycenter
        ? -1
        : t.barycenter > n.barycenter
          ? 1
          : e
            ? n.i - t.i
            : t.i - n.i;
  }
  function iu(e, t, n, o) {
    let r = e.children(t),
      i = e.node(t),
      s = i ? i.borderLeft : void 0,
      a = i ? i.borderRight : void 0,
      c = {};
    s && (r = r.filter((f) => f !== s && f !== a));
    let l = Wy(e, r);
    l.forEach((f) => {
      if (e.children(f.v).length) {
        let h = iu(e, f.v, n, o);
        ((c[f.v] = h), Object.hasOwn(h, "barycenter") && Jy(f, h));
      }
    });
    let u = qy(l, n);
    Qy(u, c);
    let d = Ky(u, o);
    if (s && a) {
      d.vs = [s, d.vs, a].flat(1);
      let f = e.predecessors(s);
      if (f && f.length) {
        let h = e.node(f[0]),
          p = e.predecessors(a),
          x = e.node(p[0]);
        (Object.hasOwn(d, "barycenter") || ((d.barycenter = 0), (d.weight = 0)),
          (d.barycenter =
            (d.barycenter * d.weight + h.order + x.order) / (d.weight + 2)),
          (d.weight += 2));
      }
    }
    return d;
  }
  function Qy(e, t) {
    e.forEach((n) => {
      n.vs = n.vs.flatMap((o) => (t[o] ? t[o].vs : o));
    });
  }
  function Jy(e, t) {
    e.barycenter !== void 0
      ? ((e.barycenter =
          (e.barycenter * e.weight + t.barycenter * t.weight) /
          (e.weight + t.weight)),
        (e.weight += t.weight))
      : ((e.barycenter = t.barycenter), (e.weight = t.weight));
  }
  function ex(e, t, n, o) {
    o || (o = e.nodes());
    let r = tx(e),
      i = new xe({ compound: !0 })
        .setGraph({ root: r })
        .setDefaultNodeLabel((s) => e.node(s));
    return (
      o.forEach((s) => {
        let a = e.node(s),
          c = e.parent(s);
        if (a.rank === t || (a.minRank <= t && t <= a.maxRank)) {
          (i.setNode(s), i.setParent(s, c || r));
          let l = e[n](s);
          (l &&
            l.forEach((u) => {
              let d = u.v === s ? u.w : u.v,
                f = i.edge(d, s),
                h = f !== void 0 ? f.weight : 0;
              i.setEdge(d, s, { weight: e.edge(u).weight + h });
            }),
            Object.hasOwn(a, "minRank") &&
              i.setNode(s, {
                borderLeft: a.borderLeft[t],
                borderRight: a.borderRight[t],
              }));
        }
      }),
      i
    );
  }
  function tx(e) {
    let t;
    for (; e.hasNode((t = Hr("_root"))););
    return t;
  }
  function nx(e, t, n) {
    let o = {},
      r;
    n.forEach((i) => {
      let s = e.parent(i),
        a,
        c;
      for (; s;) {
        if (
          ((a = e.parent(s)),
          a ? ((c = o[a]), (o[a] = s)) : ((c = r), (r = s)),
          c && c !== s)
        ) {
          t.setEdge(c, s);
          return;
        }
        s = a;
      }
    });
  }
  function su(e, t = {}) {
    if (typeof t.customOrder == "function") {
      t.customOrder(e, su);
      return;
    }
    let n = Gl(e),
      o = Tl(e, vn(1, n + 1), "inEdges"),
      r = Tl(e, vn(n - 1, -1, -1), "outEdges"),
      i = Yy(e);
    if ((Dl(e, i), t.disableOptimalOrderHeuristic)) return;
    let s = Number.POSITIVE_INFINITY,
      a,
      c = t.constraints || [];
    for (let l = 0, u = 0; u < 4; ++l, ++u) {
      (ox(l % 2 ? o : r, l % 4 >= 2, c), (i = bn(e)));
      let d = Xy(e, i);
      d < s
        ? ((u = 0), (a = Object.assign({}, i)), (s = d))
        : d === s && (a = structuredClone(i));
    }
    Dl(e, a);
  }
  function Tl(e, t, n) {
    let o = new Map(),
      r = (i, s) => {
        (o.has(i) || o.set(i, []), o.get(i).push(s));
      };
    for (let i of e.nodes()) {
      let s = e.node(i);
      if (
        (typeof s.rank == "number" && r(s.rank, i),
        typeof s.minRank == "number" && typeof s.maxRank == "number")
      )
        for (let a = s.minRank; a <= s.maxRank; a++) a !== s.rank && r(a, i);
    }
    return t.map(function (i) {
      return ex(e, i, n, o.get(i) || []);
    });
  }
  function ox(e, t, n) {
    let o = new xe();
    e.forEach(function (r) {
      n.forEach((a) => o.setEdge(a.left, a.right));
      let i = r.graph().root,
        s = iu(r, i, o, t);
      (s.vs.forEach((a, c) => (r.node(a).order = c)), nx(r, o, s.vs));
    });
  }
  function Dl(e, t) {
    Object.values(t).forEach((n) => n.forEach((o, r) => (e.node(o).order = r)));
  }
  function rx(e, t) {
    let n = {};
    function o(r, i) {
      let s = 0,
        a = 0,
        c = r.length,
        l = i[i.length - 1];
      return (
        i.forEach((u, d) => {
          let f = sx(e, u),
            h = f ? e.node(f).order : c;
          (f || u === l) &&
            (i.slice(a, d + 1).forEach((p) => {
              let x = e.predecessors(p);
              x &&
                x.forEach((y) => {
                  let m = e.node(y),
                    b = m.order;
                  (b < s || h < b) &&
                    !(m.dummy && e.node(p).dummy) &&
                    au(n, y, p);
                });
            }),
            (a = d + 1),
            (s = h));
        }),
        i
      );
    }
    return (t.length && t.reduce(o), n);
  }
  function ix(e, t) {
    let n = {};
    function o(i, s, a, c, l) {
      vn(s, a).forEach((u) => {
        let d = i[u];
        if (d !== void 0 && e.node(d).dummy) {
          let f = e.predecessors(d);
          f &&
            f.forEach((h) => {
              if (h === void 0) return;
              let p = e.node(h);
              p.dummy && (p.order < c || p.order > l) && au(n, h, d);
            });
        }
      });
    }
    function r(i, s) {
      let a = -1,
        c = -1,
        l = 0;
      return (
        s.forEach((u, d) => {
          if (e.node(u).dummy === "border") {
            let f = e.predecessors(u);
            if (f && f.length) {
              let h = f[0];
              if (h === void 0) return;
              ((c = e.node(h).order), o(s, l, d, a, c), (l = d), (a = c));
            }
          }
          o(s, l, s.length, c, i.length);
        }),
        s
      );
    }
    return (t.length && t.reduce(r), n);
  }
  function sx(e, t) {
    if (e.node(t).dummy) {
      let n = e.predecessors(t);
      if (n) return n.find((o) => e.node(o).dummy);
    }
  }
  function au(e, t, n) {
    if (t > n) {
      let r = t;
      ((t = n), (n = r));
    }
    let o = e[t];
    (o || (e[t] = o = {}), (o[n] = !0));
  }
  function ax(e, t, n) {
    if (t > n) {
      let r = t;
      ((t = n), (n = r));
    }
    let o = e[t];
    return o !== void 0 && Object.hasOwn(o, n);
  }
  function cx(e, t, n, o) {
    let r = {},
      i = {},
      s = {};
    return (
      t.forEach((a) => {
        a.forEach((c, l) => {
          ((r[c] = c), (i[c] = c), (s[c] = l));
        });
      }),
      t.forEach((a) => {
        let c = -1;
        a.forEach((l) => {
          let u = o(l);
          if (u && u.length) {
            let d = u.sort((h, p) => {
                let x = s[h],
                  y = s[p];
                return (x !== void 0 ? x : 0) - (y !== void 0 ? y : 0);
              }),
              f = (d.length - 1) / 2;
            for (let h = Math.floor(f), p = Math.ceil(f); h <= p; ++h) {
              let x = d[h];
              if (x === void 0) continue;
              let y = s[x];
              if (y !== void 0 && i[l] === l && c < y && !ax(n, l, x)) {
                let m = r[x];
                m !== void 0 && ((i[x] = l), (i[l] = r[l] = m), (c = y));
              }
            }
          }
        });
      }),
      { root: r, align: i }
    );
  }
  function lx(e, t, n, o, r = !1) {
    let i = {},
      s = ux(e, t, n, r),
      a = r ? "borderLeft" : "borderRight";
    function c(h, p) {
      let x = s.nodes().slice(),
        y = {},
        m = x.pop();
      for (; m;) {
        if (y[m]) h(m);
        else {
          ((y[m] = !0), x.push(m));
          for (let b of p(m)) x.push(b);
        }
        m = x.pop();
      }
    }
    function l(h) {
      let p = s.inEdges(h);
      p
        ? (i[h] = p.reduce((x, y) => {
            var m;
            let b = (m = i[y.v]) != null ? m : 0,
              g = s.edge(y);
            return Math.max(x, b + (g !== void 0 ? g : 0));
          }, 0))
        : (i[h] = 0);
    }
    function u(h) {
      let p = s.outEdges(h),
        x = Number.POSITIVE_INFINITY;
      p &&
        (x = p.reduce((m, b) => {
          let g = i[b.w],
            v = s.edge(b);
          return Math.min(m, (g !== void 0 ? g : 0) - (v !== void 0 ? v : 0));
        }, Number.POSITIVE_INFINITY));
      let y = e.node(h);
      x !== Number.POSITIVE_INFINITY &&
        y.borderType !== a &&
        (i[h] = Math.max(i[h] !== void 0 ? i[h] : 0, x));
    }
    function d(h) {
      return s.predecessors(h) || [];
    }
    function f(h) {
      return s.successors(h) || [];
    }
    return (
      c(l, d),
      c(u, f),
      Object.keys(o).forEach((h) => {
        var p;
        let x = n[h];
        x !== void 0 && (i[h] = (p = i[x]) != null ? p : 0);
      }),
      i
    );
  }
  function ux(e, t, n, o) {
    let r = new xe(),
      i = e.graph(),
      s = gx(i.nodesep, i.edgesep, o);
    return (
      t.forEach((a) => {
        let c;
        a.forEach((l) => {
          let u = n[l];
          if (u !== void 0) {
            if ((r.setNode(u), c !== void 0)) {
              let d = n[c];
              if (d !== void 0) {
                let f = r.edge(d, u);
                r.setEdge(d, u, Math.max(s(e, l, c), f || 0));
              }
            }
            c = l;
          }
        });
      }),
      r
    );
  }
  function dx(e, t) {
    return Object.values(t).reduce(
      (n, o) => {
        let r = Number.NEGATIVE_INFINITY,
          i = Number.POSITIVE_INFINITY;
        Object.entries(o).forEach(([a, c]) => {
          let l = mx(e, a) / 2;
          ((r = Math.max(c + l, r)), (i = Math.min(c - l, i)));
        });
        let s = r - i;
        return (s < n[0] && (n = [s, o]), n);
      },
      [Number.POSITIVE_INFINITY, null],
    )[1];
  }
  function fx(e, t) {
    let n = Object.values(t),
      o = Oe(Math.min, n),
      r = Oe(Math.max, n);
    ["u", "d"].forEach((i) => {
      ["l", "r"].forEach((s) => {
        let a = i + s,
          c = e[a];
        if (!c || c === t) return;
        let l = Object.values(c),
          u = o - Oe(Math.min, l);
        (s !== "l" && (u = r - Oe(Math.max, l)),
          u && (e[a] = Co(c, (d) => d + u)));
      });
    });
  }
  function hx(e, t = void 0) {
    let n = e.ul;
    return n
      ? Co(n, (o, r) => {
          var i, s;
          if (t) {
            let c = t.toLowerCase(),
              l = e[c];
            if (l && l[r] !== void 0) return l[r];
          }
          let a = Object.values(e)
            .map((c) => {
              let l = c[r];
              return l !== void 0 ? l : 0;
            })
            .sort((c, l) => c - l);
          return (
            (((i = a[1]) != null ? i : 0) + ((s = a[2]) != null ? s : 0)) / 2
          );
        })
      : {};
  }
  function px(e) {
    let t = bn(e),
      n = Object.assign(rx(e, t), ix(e, t)),
      o = {},
      r;
    ["u", "d"].forEach((s) => {
      ((r = s === "u" ? t : Object.values(t).reverse()),
        ["l", "r"].forEach((a) => {
          a === "r" && (r = r.map((u) => Object.values(u).reverse()));
          let c = cx(
              e,
              r,
              n,
              (u) => (s === "u" ? e.predecessors(u) : e.successors(u)) || [],
            ),
            l = lx(e, r, c.root, c.align, a === "r");
          (a === "r" && (l = Co(l, (u) => -u)), (o[s + a] = l));
        }));
    });
    let i = dx(e, o);
    return (fx(o, i), hx(o, e.graph().align));
  }
  function gx(e, t, n) {
    return (o, r, i) => {
      let s = o.node(r),
        a = o.node(i),
        c = 0,
        l;
      if (((c += s.width / 2), Object.hasOwn(s, "labelpos")))
        switch (s.labelpos.toLowerCase()) {
          case "l":
            l = -s.width / 2;
            break;
          case "r":
            l = s.width / 2;
            break;
        }
      if (
        (l && (c += n ? l : -l),
        (l = void 0),
        (c += (s.dummy ? t : e) / 2),
        (c += (a.dummy ? t : e) / 2),
        (c += a.width / 2),
        Object.hasOwn(a, "labelpos"))
      )
        switch (a.labelpos.toLowerCase()) {
          case "l":
            l = a.width / 2;
            break;
          case "r":
            l = -a.width / 2;
            break;
        }
      return (l && (c += n ? l : -l), c);
    };
  }
  function mx(e, t) {
    return e.node(t).width;
  }
  function yx(e) {
    ((e = Wl(e)),
      xx(e),
      Object.entries(px(e)).forEach(([t, n]) => (e.node(t).x = n)));
  }
  function xx(e) {
    let t = bn(e),
      n = e.graph(),
      o = n.ranksep,
      r = n.rankalign,
      i = 0;
    t.forEach((s) => {
      let a = s.reduce((c, l) => {
        var u;
        let d = (u = e.node(l).height) != null ? u : 0;
        return c > d ? c : d;
      }, 0);
      (s.forEach((c) => {
        let l = e.node(c);
        r === "top"
          ? (l.y = i + l.height / 2)
          : r === "bottom"
            ? (l.y = i + a - l.height / 2)
            : (l.y = i + a / 2);
      }),
        (i += a + o));
    });
  }
  function wx(e, t = {}) {
    let n = t.debugTiming ? jl : Kl;
    return n("layout", () => {
      let o = n("  buildLayoutGraph", () => kx(e));
      return (
        n("  runLayout", () => vx(o, n, t)),
        n("  updateInputGraph", () => bx(e, o)),
        o
      );
    });
  }
  function vx(e, t, n) {
    (t("    makeSpaceForEdgeLabels", () => Ox(e)),
      t("    removeSelfEdges", () => Hx(e)),
      t("    acyclic", () => ly(e)),
      t("    nestingGraph.run", () => Ty(e)),
      t("    rank", () => Ny(Wl(e))),
      t("    injectEdgeLabelProxies", () => Px(e)),
      t("    removeEmptyRanks", () => j0(e)),
      t("    nestingGraph.cleanup", () => Ry(e)),
      t("    normalizeRanks", () => G0(e)),
      t("    assignRankMinMax", () => Ax(e)),
      t("    removeEdgeLabelProxies", () => Tx(e)),
      t("    normalize.run", () => fy(e)),
      t("    parentDummyChains", () => ky(e)),
      t("    addBorderSegments", () => Ly(e)),
      t("    order", () => su(e, n)),
      t("    insertSelfEdges", () => Bx(e)),
      t("    adjustCoordinateSystem", () => Hy(e)),
      t("    position", () => yx(e)),
      t("    positionSelfEdges", () => Vx(e)),
      t("    removeBorderNodes", () => $x(e)),
      t("    normalize.undo", () => py(e)),
      t("    fixupEdgeLabelCoords", () => Rx(e)),
      t("    undoCoordinateSystem", () => By(e)),
      t("    translateGraph", () => Dx(e)),
      t("    assignNodeIntersects", () => zx(e)),
      t("    reversePoints", () => Lx(e)),
      t("    acyclic.undo", () => dy(e)));
  }
  function bx(e, t) {
    (e.nodes().forEach((n) => {
      let o = e.node(n),
        r = t.node(n);
      o &&
        ((o.x = r.x),
        (o.y = r.y),
        (o.order = r.order),
        (o.rank = r.rank),
        t.children(n).length && ((o.width = r.width), (o.height = r.height)));
    }),
      e.edges().forEach((n) => {
        let o = e.edge(n),
          r = t.edge(n);
        ((o.points = r.points),
          Object.hasOwn(r, "x") && ((o.x = r.x), (o.y = r.y)));
      }),
      (e.graph().width = t.graph().width),
      (e.graph().height = t.graph().height));
  }
  var Ex = ["nodesep", "edgesep", "ranksep", "marginx", "marginy"],
    _x = {
      ranksep: 50,
      edgesep: 20,
      nodesep: 50,
      rankdir: "TB",
      rankalign: "center",
    },
    Sx = ["acyclicer", "ranker", "rankdir", "align", "rankalign"],
    Nx = ["width", "height", "rank"],
    zl = { width: 0, height: 0 },
    Cx = ["minlen", "weight", "width", "height", "labeloffset"],
    Mx = {
      minlen: 1,
      weight: 1,
      width: 0,
      height: 0,
      labeloffset: 10,
      labelpos: "r",
    },
    Ix = ["labelpos"];
  function kx(e) {
    let t = new xe({ multigraph: !0, compound: !0 }),
      n = Rr(e.graph());
    return (
      t.setGraph(Object.assign({}, _x, zr(n, Ex), No(n, Sx))),
      e.nodes().forEach((o) => {
        let r = Rr(e.node(o)),
          i = zr(r, Nx);
        (Object.keys(zl).forEach((a) => {
          i[a] === void 0 && (i[a] = zl[a]);
        }),
          t.setNode(o, i));
        let s = e.parent(o);
        s !== void 0 && t.setParent(o, s);
      }),
      e.edges().forEach((o) => {
        let r = Rr(e.edge(o));
        t.setEdge(o, Object.assign({}, Mx, zr(r, Cx), No(r, Ix)));
      }),
      t
    );
  }
  function Ox(e) {
    let t = e.graph();
    ((t.ranksep /= 2),
      e.edges().forEach((n) => {
        let o = e.edge(n);
        ((o.minlen *= 2),
          o.labelpos.toLowerCase() !== "c" &&
            (t.rankdir === "TB" || t.rankdir === "BT"
              ? (o.width += o.labeloffset)
              : (o.height += o.labeloffset)));
      }));
  }
  function Px(e) {
    e.edges().forEach((t) => {
      let n = e.edge(t);
      if (n.width && n.height) {
        let o = e.node(t.v),
          r = { rank: (e.node(t.w).rank - o.rank) / 2 + o.rank, e: t };
        zt(e, "edge-proxy", r, "_ep");
      }
    });
  }
  function Ax(e) {
    let t = 0;
    (e.nodes().forEach((n) => {
      let o = e.node(n);
      o.borderTop &&
        ((o.minRank = e.node(o.borderTop).rank),
        (o.maxRank = e.node(o.borderBottom).rank),
        (t = Math.max(t, o.maxRank)));
    }),
      (e.graph().maxRank = t));
  }
  function Tx(e) {
    e.nodes().forEach((t) => {
      let n = e.node(t);
      if (n.dummy === "edge-proxy") {
        let o = n;
        ((e.edge(o.e).labelRank = n.rank), e.removeNode(t));
      }
    });
  }
  function Dx(e) {
    let t = Number.POSITIVE_INFINITY,
      n = 0,
      o = Number.POSITIVE_INFINITY,
      r = 0,
      i = e.graph(),
      s = i.marginx || 0,
      a = i.marginy || 0;
    function c(l) {
      let u = l.x,
        d = l.y,
        f = l.width,
        h = l.height;
      ((t = Math.min(t, u - f / 2)),
        (n = Math.max(n, u + f / 2)),
        (o = Math.min(o, d - h / 2)),
        (r = Math.max(r, d + h / 2)));
    }
    (e.nodes().forEach((l) => c(e.node(l))),
      e.edges().forEach((l) => {
        let u = e.edge(l);
        Object.hasOwn(u, "x") && c(u);
      }),
      (t -= s),
      (o -= a),
      e.nodes().forEach((l) => {
        let u = e.node(l);
        ((u.x -= t), (u.y -= o));
      }),
      e.edges().forEach((l) => {
        let u = e.edge(l);
        (u.points.forEach((d) => {
          ((d.x -= t), (d.y -= o));
        }),
          Object.hasOwn(u, "x") && (u.x -= t),
          Object.hasOwn(u, "y") && (u.y -= o));
      }),
      (i.width = n - t + s),
      (i.height = r - o + a));
  }
  function zx(e) {
    e.edges().forEach((t) => {
      let n = e.edge(t),
        o = e.node(t.v),
        r = e.node(t.w),
        i,
        s;
      (n.points
        ? ((i = n.points[0]), (s = n.points[n.points.length - 1]))
        : ((n.points = []), (i = r), (s = o)),
        n.points.unshift(Nl(o, i)),
        n.points.push(Nl(r, s)));
    });
  }
  function Rx(e) {
    e.edges().forEach((t) => {
      let n = e.edge(t);
      if (Object.hasOwn(n, "x"))
        switch (
          ((n.labelpos === "l" || n.labelpos === "r") &&
            (n.width -= n.labeloffset),
          n.labelpos)
        ) {
          case "l":
            n.x -= n.width / 2 + n.labeloffset;
            break;
          case "r":
            n.x += n.width / 2 + n.labeloffset;
            break;
        }
    });
  }
  function Lx(e) {
    e.edges().forEach((t) => {
      let n = e.edge(t);
      n.reversed && n.points.reverse();
    });
  }
  function $x(e) {
    (e.nodes().forEach((t) => {
      if (e.children(t).length) {
        let n = e.node(t),
          o = e.node(n.borderTop),
          r = e.node(n.borderBottom),
          i = e.node(n.borderLeft[n.borderLeft.length - 1]),
          s = e.node(n.borderRight[n.borderRight.length - 1]);
        ((n.width = Math.abs(s.x - i.x)),
          (n.height = Math.abs(r.y - o.y)),
          (n.x = i.x + n.width / 2),
          (n.y = o.y + n.height / 2));
      }
    }),
      e.nodes().forEach((t) => {
        e.node(t).dummy === "border" && e.removeNode(t);
      }));
  }
  function Hx(e) {
    e.edges().forEach((t) => {
      if (t.v === t.w) {
        let n = e.node(t.v);
        (n.selfEdges || (n.selfEdges = []),
          n.selfEdges.push({ e: t, label: e.edge(t) }),
          e.removeEdge(t));
      }
    });
  }
  function Bx(e) {
    bn(e).forEach((t) => {
      let n = 0;
      t.forEach((o, r) => {
        let i = e.node(o);
        ((i.order = r + n),
          (i.selfEdges || []).forEach((s) => {
            zt(
              e,
              "selfedge",
              {
                width: s.label.width,
                height: s.label.height,
                rank: i.rank,
                order: r + ++n,
                e: s.e,
                label: s.label,
              },
              "_se",
            );
          }),
          delete i.selfEdges);
      });
    });
  }
  function Vx(e) {
    e.nodes().forEach((t) => {
      let n = e.node(t);
      if (n.dummy === "selfedge") {
        let o = n,
          r = e.node(o.e.v),
          i = r.x + r.width / 2,
          s = r.y,
          a = n.x - i,
          c = r.height / 2;
        (e.setEdge(o.e, o.label),
          e.removeNode(t),
          (o.label.points = [
            { x: i + (2 * a) / 3, y: s - c },
            { x: i + (5 * a) / 6, y: s - c },
            { x: i + a, y: s },
            { x: i + (5 * a) / 6, y: s + c },
            { x: i + (2 * a) / 3, y: s + c },
          ]),
          (o.label.x = n.x),
          (o.label.y = n.y));
      }
    });
  }
  function zr(e, t) {
    return Co(No(e, t), Number);
  }
  function Rr(e) {
    let t = {};
    return (
      e &&
        Object.entries(e).forEach(([n, o]) => {
          (typeof n == "string" && (n = n.toLowerCase()), (t[n] = o));
        }),
      t
    );
  }
  function Fx(e) {
    let t = bn(e),
      n = new xe({ compound: !0, multigraph: !0 }).setGraph({});
    return (
      e.nodes().forEach((o) => {
        (n.setNode(o, { label: o }), n.setParent(o, "layer" + e.node(o).rank));
      }),
      e.edges().forEach((o) => n.setEdge(o.v, o.w, {}, o.name)),
      t.forEach((o, r) => {
        let i = "layer" + r;
        (n.setNode(i, { rank: "same" }),
          o.reduce((s, a) => (n.setEdge(s, a, { style: "invis" }), a)));
      }),
      n
    );
  }
  var Yx = {
      graphlib: Ll,
      version: ey,
      layout: wx,
      debug: Fx,
      util: { time: jl, notime: Kl },
    },
    cu = Yx;
  return yd(Xx);
})();
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store-shim.production.js:
  (**
   * @license React
   * use-sync-external-store-shim.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js:
  (**
   * @license React
   * use-sync-external-store-shim/with-selector.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

@dagrejs/dagre/dist/dagre.esm.js:
  (*! For license information please see dagre.esm.js.LEGAL.txt *)
*/
