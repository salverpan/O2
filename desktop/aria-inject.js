(() => {
  // node_modules/playwright-injected/dist/index.js
  function yi(e, t) {
    if (e.role !== t.role || e.name !== t.name || !Si(e, t) || st(e) !== st(t))
      return false;
    const r = Object.keys(e.props), n = Object.keys(t.props);
    return r.length === n.length && r.every((i) => e.props[i] === t.props[i]);
  }
  function st(e) {
    return e.box.cursor === "pointer";
  }
  function Si(e, t) {
    return e.active === t.active && e.checked === t.checked && e.disabled === t.disabled && e.expanded === t.expanded && e.selected === t.selected && e.level === t.level && e.pressed === t.pressed;
  }
  function Ur(e, t, r = {}) {
    const n = new e.LineCounter(), i = {
      keepSourceTokens: true,
      lineCounter: n,
      ...r
    }, s = e.parseDocument(t, i), o = [], a = (d) => [n.linePos(d[0]), n.linePos(d[1])], l = (d) => {
      o.push({
        message: d.message,
        range: [n.linePos(d.pos[0]), n.linePos(d.pos[1])]
      });
    }, c = (d, b) => {
      for (const h of b.items) {
        if (h instanceof e.Scalar && typeof h.value == "string") {
          const w = hr.parse(h, i, o);
          w && (d.children = d.children || [], d.children.push(w));
          continue;
        }
        if (h instanceof e.YAMLMap) {
          u(d, h);
          continue;
        }
        o.push({
          message: "Sequence items should be strings or maps",
          range: a(h.range || b.range)
        });
      }
    }, u = (d, b) => {
      for (const h of b.items) {
        if (d.children = d.children || [], !(h.key instanceof e.Scalar && typeof h.key.value == "string")) {
          o.push({
            message: "Only string keys are supported",
            range: a(h.key.range || b.range)
          });
          continue;
        }
        const p = h.key, w = h.value;
        if (p.value === "text") {
          if (!(w instanceof e.Scalar && typeof w.value == "string")) {
            o.push({
              message: "Text value should be a string",
              range: a(h.value.range || b.range)
            });
            continue;
          }
          d.children.push({
            kind: "text",
            text: Ct(w.value)
          });
          continue;
        }
        if (p.value === "/children") {
          if (!(w instanceof e.Scalar && typeof w.value == "string") || w.value !== "contain" && w.value !== "equal" && w.value !== "deep-equal") {
            o.push({
              message: 'Strict value should be "contain", "equal" or "deep-equal"',
              range: a(h.value.range || b.range)
            });
            continue;
          }
          d.containerMode = w.value;
          continue;
        }
        if (p.value.startsWith("/")) {
          if (!(w instanceof e.Scalar && typeof w.value == "string")) {
            o.push({
              message: "Property value should be a string",
              range: a(h.value.range || b.range)
            });
            continue;
          }
          d.props = d.props ?? {}, d.props[p.value.slice(1)] = Ct(w.value);
          continue;
        }
        const v = hr.parse(p, i, o);
        if (!v)
          continue;
        if (w instanceof e.Scalar) {
          const E = typeof w.value;
          if (E !== "string" && E !== "number" && E !== "boolean") {
            o.push({
              message: "Node value should be a string or a sequence",
              range: a(h.value.range || b.range)
            });
            continue;
          }
          d.children.push({
            ...v,
            children: [{
              kind: "text",
              text: Ct(String(w.value))
            }]
          });
          continue;
        }
        if (w instanceof e.YAMLSeq) {
          d.children.push(v), c(v, w);
          continue;
        }
        o.push({
          message: "Map values should be strings or sequences",
          range: a(h.value.range || b.range)
        });
      }
    }, f = { kind: "role", role: "fragment" };
    return s.errors.forEach(l), o.length ? { errors: o, fragment: f } : (s.contents instanceof e.YAMLSeq || o.push({
      message: 'Aria snapshot must be a YAML sequence, elements starting with " -"',
      range: s.contents ? a(s.contents.range) : [{ line: 0, col: 0 }, { line: 0, col: 0 }]
    }), o.length ? { errors: o, fragment: f } : (c(f, s.contents), o.length ? { errors: o, fragment: Ei } : f.children?.length === 1 && (!f.containerMode || f.containerMode === "contain") ? { fragment: f.children[0], errors: [] } : { fragment: f, errors: [] }));
  }
  var Ei = { kind: "role", role: "fragment" };
  function zr(e) {
    return e.replace(/[\u200b\u00ad]/g, "").replace(/[\r\n\s\t]+/g, " ").trim();
  }
  function Ct(e) {
    return {
      raw: e,
      normalized: zr(e)
    };
  }
  var hr = class Gr {
    static parse(t, r, n) {
      try {
        return new Gr(t.value)._parse();
      } catch (i) {
        if (i instanceof fr) {
          const s = r.prettyErrors === false ? i.message : i.message + `:

` + t.value + `
` + " ".repeat(i.pos) + `^
`;
          return n.push({
            message: s,
            range: [r.lineCounter.linePos(t.range[0]), r.lineCounter.linePos(t.range[0] + i.pos)]
          }), null;
        }
        throw i;
      }
    }
    constructor(t) {
      this._input = t, this._pos = 0, this._length = t.length;
    }
    _peek() {
      return this._input[this._pos] || "";
    }
    _next() {
      return this._pos < this._length ? this._input[this._pos++] : null;
    }
    _eof() {
      return this._pos >= this._length;
    }
    _isWhitespace() {
      return !this._eof() && /\s/.test(this._peek());
    }
    _skipWhitespace() {
      for (; this._isWhitespace(); )
        this._pos++;
    }
    _readIdentifier(t) {
      this._eof() && this._throwError(`Unexpected end of input when expecting ${t}`);
      const r = this._pos;
      for (; !this._eof() && /[a-zA-Z]/.test(this._peek()); )
        this._pos++;
      return this._input.slice(r, this._pos);
    }
    _readString() {
      let t = "", r = false;
      for (; !this._eof(); ) {
        const n = this._next();
        if (r)
          t += n, r = false;
        else if (n === "\\")
          r = true;
        else {
          if (n === '"')
            return t;
          t += n;
        }
      }
      this._throwError("Unterminated string");
    }
    _throwError(t, r = 0) {
      throw new fr(t, r || this._pos);
    }
    _readRegex() {
      let t = "", r = false, n = false;
      for (; !this._eof(); ) {
        const i = this._next();
        if (r)
          t += i, r = false;
        else if (i === "\\")
          r = true, t += i;
        else {
          if (i === "/" && !n)
            return { pattern: t };
          i === "[" ? (n = true, t += i) : i === "]" && n ? (t += i, n = false) : t += i;
        }
      }
      this._throwError("Unterminated regex");
    }
    _readStringOrRegex() {
      const t = this._peek();
      return t === '"' ? (this._next(), zr(this._readString())) : t === "/" ? (this._next(), this._readRegex()) : null;
    }
    _readAttributes(t) {
      let r = this._pos;
      for (; this._skipWhitespace(), this._peek() === "["; ) {
        this._next(), this._skipWhitespace(), r = this._pos;
        const n = this._readIdentifier("attribute");
        this._skipWhitespace();
        let i = "";
        if (this._peek() === "=")
          for (this._next(), this._skipWhitespace(), r = this._pos; this._peek() !== "]" && !this._isWhitespace() && !this._eof(); )
            i += this._next();
        this._skipWhitespace(), this._peek() !== "]" && this._throwError("Expected ]"), this._next(), this._applyAttribute(t, n, i || "true", r);
      }
    }
    _parse() {
      this._skipWhitespace();
      const t = this._readIdentifier("role");
      this._skipWhitespace();
      const r = this._readStringOrRegex() || "", n = { kind: "role", role: t, name: r };
      return this._readAttributes(n), this._skipWhitespace(), this._eof() || this._throwError("Unexpected input"), n;
    }
    _applyAttribute(t, r, n, i) {
      if (r === "checked") {
        this._assert(n === "true" || n === "false" || n === "mixed", 'Value of "checked" attribute must be a boolean or "mixed"', i), t.checked = n === "true" ? true : n === "false" ? false : "mixed";
        return;
      }
      if (r === "disabled") {
        this._assert(n === "true" || n === "false", 'Value of "disabled" attribute must be a boolean', i), t.disabled = n === "true";
        return;
      }
      if (r === "expanded") {
        this._assert(n === "true" || n === "false", 'Value of "expanded" attribute must be a boolean', i), t.expanded = n === "true";
        return;
      }
      if (r === "active") {
        this._assert(n === "true" || n === "false", 'Value of "active" attribute must be a boolean', i), t.active = n === "true";
        return;
      }
      if (r === "level") {
        this._assert(!isNaN(Number(n)), 'Value of "level" attribute must be a number', i), t.level = Number(n);
        return;
      }
      if (r === "pressed") {
        this._assert(n === "true" || n === "false" || n === "mixed", 'Value of "pressed" attribute must be a boolean or "mixed"', i), t.pressed = n === "true" ? true : n === "false" ? false : "mixed";
        return;
      }
      if (r === "selected") {
        this._assert(n === "true" || n === "false", 'Value of "selected" attribute must be a boolean', i), t.selected = n === "true";
        return;
      }
      this._assert(false, `Unsupported attribute [${r}]`, i);
    }
    _assert(t, r, n) {
      t || this._throwError(r || "Assertion error", n);
    }
  };
  var fr = class extends Error {
    constructor(e, t) {
      super(e), this.pos = t;
    }
  };
  function _i(e, t) {
    function r(o, a, l) {
      let c = 1, u = l + c;
      for (const f of o.children || [])
        typeof f == "string" ? (c++, u++) : (c += r(f, a, u), u += c);
      if (!["none", "presentation", "fragment", "iframe", "generic"].includes(o.role) && o.name) {
        let f = a.get(o.role);
        f || (f = /* @__PURE__ */ new Map(), a.set(o.role, f));
        const d = f.get(o.name), b = c * 100 - l;
        (!d || d.sizeAndPosition < b) && f.set(o.name, { node: o, sizeAndPosition: b });
      }
      return c;
    }
    const n = /* @__PURE__ */ new Map();
    e && r(e, n, 0);
    const i = /* @__PURE__ */ new Map();
    r(t, i, 0);
    const s = [];
    for (const [o, a] of i)
      for (const [l, c] of a)
        n.get(o)?.get(l) || s.push(c);
    return s.sort((o, a) => a.sizeAndPosition - o.sizeAndPosition), s[0]?.node;
  }
  function De(e, t = "'") {
    const r = JSON.stringify(e), n = r.substring(1, r.length - 1).replace(/\\"/g, '"');
    if (t === "'")
      return t + n.replace(/[']/g, "\\'") + t;
    if (t === '"')
      return t + n.replace(/["]/g, '\\"') + t;
    if (t === "`")
      return t + n.replace(/[`]/g, "\\`") + t;
    throw new Error("Invalid escape char");
  }
  function ot(e) {
    return e.charAt(0).toUpperCase() + e.substring(1);
  }
  function Jr(e) {
    return e.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
  }
  function fe(e) {
    return `"${e.replace(/["\\]/g, (t) => "\\" + t)}"`;
  }
  var Mt;
  function Ti() {
    Mt = /* @__PURE__ */ new Map();
  }
  function W(e) {
    let t = Mt?.get(e);
    return t === void 0 && (t = e.replace(/[\u200b\u00ad]/g, "").trim().replace(/\s+/g, " "), Mt?.set(e, t)), t;
  }
  function Et(e) {
    return e.replace(/(^|[^\\])(\\\\)*\\(['"`])/g, "$1$2$3");
  }
  function Qr(e) {
    return e.unicode || e.unicodeSets ? String(e) : String(e).replace(/(^|[^\\])(\\\\)*(["'`])/g, "$1$2\\$3").replace(/>>/g, "\\>\\>");
  }
  function z(e, t) {
    return typeof e != "string" ? Qr(e) : `${JSON.stringify(e)}${t ? "s" : "i"}`;
  }
  function j(e, t) {
    return typeof e != "string" ? Qr(e) : `"${e.replace(/\\/g, "\\\\").replace(/["]/g, '\\"')}"${t ? "s" : "i"}`;
  }
  function ki(e, t, r = "") {
    if (e.length <= t)
      return e;
    const n = [...e];
    return n.length > t ? n.slice(0, t - r.length).join("") + r : n.join("");
  }
  function pr(e, t) {
    return ki(e, t, "\u2026");
  }
  function at(e) {
    return e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function Ai(e, t) {
    const r = e.length, n = t.length;
    let i = 0, s = 0;
    const o = Array(r + 1).fill(null).map(() => Array(n + 1).fill(0));
    for (let a = 1; a <= r; a++)
      for (let l = 1; l <= n; l++)
        e[a - 1] === t[l - 1] && (o[a][l] = o[a - 1][l - 1] + 1, o[a][l] > i && (i = o[a][l], s = a));
    return e.slice(s - i, s);
  }
  var Ci = new RegExp("([\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])))", "g");
  function Ii(e) {
    return Kr(e) ? "'" + e.replace(/'/g, "''") + "'" : e;
  }
  function It(e) {
    return Kr(e) ? '"' + e.replace(/[\\"\x00-\x1f\x7f-\x9f]/g, (t) => {
      switch (t) {
        case "\\":
          return "\\\\";
        case '"':
          return '\\"';
        case "\b":
          return "\\b";
        case "\f":
          return "\\f";
        case `
`:
          return "\\n";
        case "\r":
          return "\\r";
        case "	":
          return "\\t";
        default:
          return "\\x" + t.charCodeAt(0).toString(16).padStart(2, "0");
      }
    }) + '"' : e;
  }
  function Kr(e) {
    return !!(e.length === 0 || /^\s|\s$/.test(e) || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(e) || /^-/.test(e) || /[\n:](\s|$)/.test(e) || /\s#/.test(e) || /[\n\r]/.test(e) || /^[&*\],?!>|@"'#%]/.test(e) || /[{}`]/.test(e) || /^\[/.test(e) || !isNaN(Number(e)) || ["y", "n", "yes", "no", "true", "false", "on", "off", "null"].includes(e.toLowerCase()));
  }
  var Gt = {};
  function Pi(e) {
    Gt = e;
  }
  function Ft(e, t) {
    for (; t; ) {
      if (e.contains(t))
        return true;
      t = Zr(t);
    }
    return false;
  }
  function B(e) {
    if (e.parentElement)
      return e.parentElement;
    if (e.parentNode && e.parentNode.nodeType === 11 && e.parentNode.host)
      return e.parentNode.host;
  }
  function Yr(e) {
    let t = e;
    for (; t.parentNode; )
      t = t.parentNode;
    if (t.nodeType === 11 || t.nodeType === 9)
      return t;
  }
  function Zr(e) {
    for (; e.parentElement; )
      e = e.parentElement;
    return B(e);
  }
  function _e(e, t, r) {
    for (; e; ) {
      const n = e.closest(t);
      if (r && n !== r && n?.contains(r))
        return;
      if (n)
        return n;
      e = Zr(e);
    }
  }
  function ne(e, t) {
    const r = t === "::before" ? ut : t === "::after" ? ht : ct;
    if (r && r.has(e))
      return r.get(e);
    const n = e.ownerDocument && e.ownerDocument.defaultView ? e.ownerDocument.defaultView.getComputedStyle(e, t) : void 0;
    return r?.set(e, n), n;
  }
  function en(e, t) {
    if (t = t ?? ne(e), !t)
      return true;
    if (Element.prototype.checkVisibility && Gt.browserNameForWorkarounds !== "webkit") {
      if (!e.checkVisibility())
        return false;
    } else {
      const r = e.closest("details,summary");
      if (r !== e && r?.nodeName === "DETAILS" && !r.open)
        return false;
    }
    return t.visibility === "visible";
  }
  function lt(e) {
    const t = ne(e);
    if (!t)
      return { visible: true, inline: false };
    const r = t.cursor;
    if (t.display === "contents") {
      for (let i = e.firstChild; i; i = i.nextSibling) {
        if (i.nodeType === 1 && re(i))
          return { visible: true, inline: false, cursor: r };
        if (i.nodeType === 3 && tn(i))
          return { visible: true, inline: true, cursor: r };
      }
      return { visible: false, inline: false, cursor: r };
    }
    if (!en(e, t))
      return { cursor: r, visible: false, inline: false };
    const n = e.getBoundingClientRect();
    return { cursor: r, visible: n.width > 0 && n.height > 0, inline: t.display === "inline" };
  }
  function re(e) {
    return lt(e).visible;
  }
  function tn(e) {
    const t = e.ownerDocument.createRange();
    t.selectNode(e);
    const r = t.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function I(e) {
    const t = e.tagName;
    return typeof t == "string" ? t.toUpperCase() : e instanceof HTMLFormElement ? "FORM" : e.tagName.toUpperCase();
  }
  var ct;
  var ut;
  var ht;
  var rn = 0;
  function Vt() {
    ++rn, ct ?? (ct = /* @__PURE__ */ new Map()), ut ?? (ut = /* @__PURE__ */ new Map()), ht ?? (ht = /* @__PURE__ */ new Map());
  }
  function Jt() {
    --rn || (ct = void 0, ut = void 0, ht = void 0);
  }
  var $ = function(e, t, r) {
    return e >= t && e <= r;
  };
  function U(e) {
    return $(e, 48, 57);
  }
  function dr(e) {
    return U(e) || $(e, 65, 70) || $(e, 97, 102);
  }
  function Ni(e) {
    return $(e, 65, 90);
  }
  function $i(e) {
    return $(e, 97, 122);
  }
  function Ri(e) {
    return Ni(e) || $i(e);
  }
  function Li(e) {
    return e >= 128;
  }
  function Ze(e) {
    return Ri(e) || Li(e) || e === 95;
  }
  function gr(e) {
    return Ze(e) || U(e) || e === 45;
  }
  function Oi(e) {
    return $(e, 0, 8) || e === 11 || $(e, 14, 31) || e === 127;
  }
  function et(e) {
    return e === 10;
  }
  function K(e) {
    return et(e) || e === 9 || e === 32;
  }
  var Mi = 1114111;
  var Qt = class extends Error {
    constructor(e) {
      super(e), this.name = "InvalidCharacterError";
    }
  };
  function Fi(e) {
    const t = [];
    for (let r = 0; r < e.length; r++) {
      let n = e.charCodeAt(r);
      if (n === 13 && e.charCodeAt(r + 1) === 10 && (n = 10, r++), (n === 13 || n === 12) && (n = 10), n === 0 && (n = 65533), $(n, 55296, 56319) && $(e.charCodeAt(r + 1), 56320, 57343)) {
        const i = n - 55296, s = e.charCodeAt(r + 1) - 56320;
        n = Math.pow(2, 16) + i * Math.pow(2, 10) + s, r++;
      }
      t.push(n);
    }
    return t;
  }
  function L(e) {
    if (e <= 65535)
      return String.fromCharCode(e);
    e -= Math.pow(2, 16);
    const t = Math.floor(e / Math.pow(2, 10)) + 55296, r = e % Math.pow(2, 10) + 56320;
    return String.fromCharCode(t) + String.fromCharCode(r);
  }
  function nn(e) {
    const t = Fi(e);
    let r = -1;
    const n = [];
    let i;
    const s = function(m) {
      return m >= t.length ? -1 : t[m];
    }, o = function(m) {
      if (m === void 0 && (m = 1), m > 3)
        throw "Spec Error: no more than three codepoints of lookahead.";
      return s(r + m);
    }, a = function(m) {
      return m === void 0 && (m = 1), r += m, i = s(r), true;
    }, l = function() {
      return r -= 1, true;
    }, c = function(m) {
      return m === void 0 && (m = i), m === -1;
    }, u = function() {
      if (f(), a(), K(i)) {
        for (; K(o()); )
          a();
        return new ft();
      } else {
        if (i === 34)
          return h();
        if (i === 35)
          if (gr(o()) || w(o(1), o(2))) {
            const m = new xn("");
            return T(o(1), o(2), o(3)) && (m.type = "id"), m.value = A(), m;
          } else
            return new F(i);
        else return i === 36 ? o() === 61 ? (a(), new Hi()) : new F(i) : i === 39 ? h() : i === 40 ? new dn() : i === 41 ? new Xt() : i === 42 ? o() === 61 ? (a(), new ji()) : new F(i) : i === 43 ? S() ? (l(), d()) : new F(i) : i === 44 ? new un() : i === 45 ? S() ? (l(), d()) : o(1) === 45 && o(2) === 62 ? (a(2), new an()) : _() ? (l(), b()) : new F(i) : i === 46 ? S() ? (l(), d()) : new F(i) : i === 58 ? new ln() : i === 59 ? new cn() : i === 60 ? o(1) === 33 && o(2) === 45 && o(3) === 45 ? (a(3), new on()) : new F(i) : i === 64 ? T(o(1), o(2), o(3)) ? new mn(A()) : new F(i) : i === 91 ? new pn() : i === 92 ? v() ? (l(), b()) : new F(i) : i === 93 ? new Dt() : i === 94 ? o() === 61 ? (a(), new Bi()) : new F(i) : i === 123 ? new hn() : i === 124 ? o() === 61 ? (a(), new qi()) : o() === 124 ? (a(), new gn()) : new F(i) : i === 125 ? new fn() : i === 126 ? o() === 61 ? (a(), new Di()) : new F(i) : U(i) ? (l(), d()) : Ze(i) ? (l(), b()) : c() ? new rt() : new F(i);
      }
    }, f = function() {
      for (; o(1) === 47 && o(2) === 42; )
        for (a(2); ; )
          if (a(), i === 42 && o() === 47) {
            a();
            break;
          } else if (c())
            return;
    }, d = function() {
      const m = k();
      if (T(o(1), o(2), o(3))) {
        const y = new Wi();
        return y.value = m.value, y.repr = m.repr, y.type = m.type, y.unit = A(), y;
      } else if (o() === 37) {
        a();
        const y = new vn();
        return y.value = m.value, y.repr = m.repr, y;
      } else {
        const y = new bn();
        return y.value = m.value, y.repr = m.repr, y.type = m.type, y;
      }
    }, b = function() {
      const m = A();
      if (m.toLowerCase() === "url" && o() === 40) {
        for (a(); K(o(1)) && K(o(2)); )
          a();
        return o() === 34 || o() === 39 ? new Ce(m) : K(o()) && (o(2) === 34 || o(2) === 39) ? new Ce(m) : x();
      } else return o() === 40 ? (a(), new Ce(m)) : new Kt(m);
    }, h = function(m) {
      m === void 0 && (m = i);
      let y = "";
      for (; a(); ) {
        if (i === m || c())
          return new Yt(y);
        if (et(i))
          return l(), new sn();
        i === 92 ? c(o()) || (et(o()) ? a() : y += L(p())) : y += L(i);
      }
      throw new Error("Internal error");
    }, x = function() {
      const m = new wn("");
      for (; K(o()); )
        a();
      if (c(o()))
        return m;
      for (; a(); ) {
        if (i === 41 || c())
          return m;
        if (K(i)) {
          for (; K(o()); )
            a();
          return o() === 41 || c(o()) ? (a(), m) : (C(), new tt());
        } else {
          if (i === 34 || i === 39 || i === 40 || Oi(i))
            return C(), new tt();
          if (i === 92)
            if (v())
              m.value += L(p());
            else
              return C(), new tt();
          else
            m.value += L(i);
        }
      }
      throw new Error("Internal error");
    }, p = function() {
      if (a(), dr(i)) {
        const m = [i];
        for (let H = 0; H < 5 && dr(o()); H++)
          a(), m.push(i);
        K(o()) && a();
        let y = parseInt(m.map(function(H) {
          return String.fromCharCode(H);
        }).join(""), 16);
        return y > Mi && (y = 65533), y;
      } else return c() ? 65533 : i;
    }, w = function(m, y) {
      return !(m !== 92 || et(y));
    }, v = function() {
      return w(i, o());
    }, T = function(m, y, H) {
      return m === 45 ? Ze(y) || y === 45 || w(y, H) : Ze(m) ? true : m === 92 ? w(m, y) : false;
    }, _ = function() {
      return T(i, o(1), o(2));
    }, E = function(m, y, H) {
      return m === 43 || m === 45 ? !!(U(y) || y === 46 && U(H)) : m === 46 ? !!U(y) : !!U(m);
    }, S = function() {
      return E(i, o(1), o(2));
    }, A = function() {
      let m = "";
      for (; a(); )
        if (gr(i))
          m += L(i);
        else if (v())
          m += L(p());
        else
          return l(), m;
      throw new Error("Internal parse error");
    }, k = function() {
      let m = "", y = "integer";
      for ((o() === 43 || o() === 45) && (a(), m += L(i)); U(o()); )
        a(), m += L(i);
      if (o(1) === 46 && U(o(2)))
        for (a(), m += L(i), a(), m += L(i), y = "number"; U(o()); )
          a(), m += L(i);
      const H = o(1), te = o(2), Q = o(3);
      if ((H === 69 || H === 101) && U(te))
        for (a(), m += L(i), a(), m += L(i), y = "number"; U(o()); )
          a(), m += L(i);
      else if ((H === 69 || H === 101) && (te === 43 || te === 45) && U(Q))
        for (a(), m += L(i), a(), m += L(i), a(), m += L(i), y = "number"; U(o()); )
          a(), m += L(i);
      const le = g(m);
      return { type: y, value: le, repr: m };
    }, g = function(m) {
      return +m;
    }, C = function() {
      for (; a(); ) {
        if (i === 41 || c())
          return;
        v() && p();
      }
    };
    let N = 0;
    for (; !c(o()); )
      if (n.push(u()), N++, N > t.length * 2)
        throw new Error("I'm infinite-looping!");
    return n;
  }
  var P = class {
    constructor() {
      this.tokenType = "";
    }
    toJSON() {
      return { token: this.tokenType };
    }
    toString() {
      return this.tokenType;
    }
    toSource() {
      return "" + this;
    }
  };
  var sn = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "BADSTRING";
    }
  };
  var tt = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "BADURL";
    }
  };
  var ft = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "WHITESPACE";
    }
    toString() {
      return "WS";
    }
    toSource() {
      return " ";
    }
  };
  var on = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "CDO";
    }
    toSource() {
      return "<!--";
    }
  };
  var an = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "CDC";
    }
    toSource() {
      return "-->";
    }
  };
  var ln = class extends P {
    constructor() {
      super(...arguments), this.tokenType = ":";
    }
  };
  var cn = class extends P {
    constructor() {
      super(...arguments), this.tokenType = ";";
    }
  };
  var un = class extends P {
    constructor() {
      super(...arguments), this.tokenType = ",";
    }
  };
  var ge = class extends P {
    constructor() {
      super(...arguments), this.value = "", this.mirror = "";
    }
  };
  var hn = class extends ge {
    constructor() {
      super(), this.tokenType = "{", this.value = "{", this.mirror = "}";
    }
  };
  var fn = class extends ge {
    constructor() {
      super(), this.tokenType = "}", this.value = "}", this.mirror = "{";
    }
  };
  var pn = class extends ge {
    constructor() {
      super(), this.tokenType = "[", this.value = "[", this.mirror = "]";
    }
  };
  var Dt = class extends ge {
    constructor() {
      super(), this.tokenType = "]", this.value = "]", this.mirror = "[";
    }
  };
  var dn = class extends ge {
    constructor() {
      super(), this.tokenType = "(", this.value = "(", this.mirror = ")";
    }
  };
  var Xt = class extends ge {
    constructor() {
      super(), this.tokenType = ")", this.value = ")", this.mirror = "(";
    }
  };
  var Di = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "~=";
    }
  };
  var qi = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "|=";
    }
  };
  var Bi = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "^=";
    }
  };
  var Hi = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "$=";
    }
  };
  var ji = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "*=";
    }
  };
  var gn = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "||";
    }
  };
  var rt = class extends P {
    constructor() {
      super(...arguments), this.tokenType = "EOF";
    }
    toSource() {
      return "";
    }
  };
  var F = class extends P {
    constructor(e) {
      super(), this.tokenType = "DELIM", this.value = "", this.value = L(e);
    }
    toString() {
      return "DELIM(" + this.value + ")";
    }
    toJSON() {
      const e = this.constructor.prototype.constructor.prototype.toJSON.call(this);
      return e.value = this.value, e;
    }
    toSource() {
      return this.value === "\\" ? `\\
` : this.value;
    }
  };
  var me = class extends P {
    constructor() {
      super(...arguments), this.value = "";
    }
    ASCIIMatch(e) {
      return this.value.toLowerCase() === e.toLowerCase();
    }
    toJSON() {
      const e = this.constructor.prototype.constructor.prototype.toJSON.call(this);
      return e.value = this.value, e;
    }
  };
  var Kt = class extends me {
    constructor(e) {
      super(), this.tokenType = "IDENT", this.value = e;
    }
    toString() {
      return "IDENT(" + this.value + ")";
    }
    toSource() {
      return qe(this.value);
    }
  };
  var Ce = class extends me {
    constructor(e) {
      super(), this.tokenType = "FUNCTION", this.value = e, this.mirror = ")";
    }
    toString() {
      return "FUNCTION(" + this.value + ")";
    }
    toSource() {
      return qe(this.value) + "(";
    }
  };
  var mn = class extends me {
    constructor(e) {
      super(), this.tokenType = "AT-KEYWORD", this.value = e;
    }
    toString() {
      return "AT(" + this.value + ")";
    }
    toSource() {
      return "@" + qe(this.value);
    }
  };
  var xn = class extends me {
    constructor(e) {
      super(), this.tokenType = "HASH", this.value = e, this.type = "unrestricted";
    }
    toString() {
      return "HASH(" + this.value + ")";
    }
    toJSON() {
      const e = this.constructor.prototype.constructor.prototype.toJSON.call(this);
      return e.value = this.value, e.type = this.type, e;
    }
    toSource() {
      return this.type === "id" ? "#" + qe(this.value) : "#" + Ui(this.value);
    }
  };
  var Yt = class extends me {
    constructor(e) {
      super(), this.tokenType = "STRING", this.value = e;
    }
    toString() {
      return '"' + yn(this.value) + '"';
    }
  };
  var wn = class extends me {
    constructor(e) {
      super(), this.tokenType = "URL", this.value = e;
    }
    toString() {
      return "URL(" + this.value + ")";
    }
    toSource() {
      return 'url("' + yn(this.value) + '")';
    }
  };
  var bn = class extends P {
    constructor() {
      super(), this.tokenType = "NUMBER", this.type = "integer", this.repr = "";
    }
    toString() {
      return this.type === "integer" ? "INT(" + this.value + ")" : "NUMBER(" + this.value + ")";
    }
    toJSON() {
      const e = super.toJSON();
      return e.value = this.value, e.type = this.type, e.repr = this.repr, e;
    }
    toSource() {
      return this.repr;
    }
  };
  var vn = class extends P {
    constructor() {
      super(), this.tokenType = "PERCENTAGE", this.repr = "";
    }
    toString() {
      return "PERCENTAGE(" + this.value + ")";
    }
    toJSON() {
      const e = this.constructor.prototype.constructor.prototype.toJSON.call(this);
      return e.value = this.value, e.repr = this.repr, e;
    }
    toSource() {
      return this.repr + "%";
    }
  };
  var Wi = class extends P {
    constructor() {
      super(), this.tokenType = "DIMENSION", this.type = "integer", this.repr = "", this.unit = "";
    }
    toString() {
      return "DIM(" + this.value + "," + this.unit + ")";
    }
    toJSON() {
      const e = this.constructor.prototype.constructor.prototype.toJSON.call(this);
      return e.value = this.value, e.type = this.type, e.repr = this.repr, e.unit = this.unit, e;
    }
    toSource() {
      const e = this.repr;
      let t = qe(this.unit);
      return t[0].toLowerCase() === "e" && (t[1] === "-" || $(t.charCodeAt(1), 48, 57)) && (t = "\\65 " + t.slice(1, t.length)), e + t;
    }
  };
  function qe(e) {
    e = "" + e;
    let t = "";
    const r = e.charCodeAt(0);
    for (let n = 0; n < e.length; n++) {
      const i = e.charCodeAt(n);
      if (i === 0)
        throw new Qt("Invalid character: the input contains U+0000.");
      $(i, 1, 31) || i === 127 || n === 0 && $(i, 48, 57) || n === 1 && $(i, 48, 57) && r === 45 ? t += "\\" + i.toString(16) + " " : i >= 128 || i === 45 || i === 95 || $(i, 48, 57) || $(i, 65, 90) || $(i, 97, 122) ? t += e[n] : t += "\\" + e[n];
    }
    return t;
  }
  function Ui(e) {
    e = "" + e;
    let t = "";
    for (let r = 0; r < e.length; r++) {
      const n = e.charCodeAt(r);
      if (n === 0)
        throw new Qt("Invalid character: the input contains U+0000.");
      n >= 128 || n === 45 || n === 95 || $(n, 48, 57) || $(n, 65, 90) || $(n, 97, 122) ? t += e[r] : t += "\\" + n.toString(16) + " ";
    }
    return t;
  }
  function yn(e) {
    e = "" + e;
    let t = "";
    for (let r = 0; r < e.length; r++) {
      const n = e.charCodeAt(r);
      if (n === 0)
        throw new Qt("Invalid character: the input contains U+0000.");
      $(n, 1, 31) || n === 127 ? t += "\\" + n.toString(16) + " " : n === 34 || n === 92 ? t += "\\" + e[r] : t += e[r];
    }
    return t;
  }
  function mr(e) {
    return e.hasAttribute("aria-label") || e.hasAttribute("aria-labelledby");
  }
  var xr = "article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]";
  var zi = [
    ["aria-atomic", void 0],
    ["aria-busy", void 0],
    ["aria-controls", void 0],
    ["aria-current", void 0],
    ["aria-describedby", void 0],
    ["aria-details", void 0],
    // Global use deprecated in ARIA 1.2
    // ['aria-disabled', undefined],
    ["aria-dropeffect", void 0],
    // Global use deprecated in ARIA 1.2
    // ['aria-errormessage', undefined],
    ["aria-flowto", void 0],
    ["aria-grabbed", void 0],
    // Global use deprecated in ARIA 1.2
    // ['aria-haspopup', undefined],
    ["aria-hidden", void 0],
    // Global use deprecated in ARIA 1.2
    // ['aria-invalid', undefined],
    ["aria-keyshortcuts", void 0],
    ["aria-label", ["caption", "code", "deletion", "emphasis", "generic", "insertion", "paragraph", "presentation", "strong", "subscript", "superscript"]],
    ["aria-labelledby", ["caption", "code", "deletion", "emphasis", "generic", "insertion", "paragraph", "presentation", "strong", "subscript", "superscript"]],
    ["aria-live", void 0],
    ["aria-owns", void 0],
    ["aria-relevant", void 0],
    ["aria-roledescription", ["generic"]]
  ];
  function Sn(e, t) {
    return zi.some(([r, n]) => !n?.includes(t || "") && e.hasAttribute(r));
  }
  function En(e) {
    return !Number.isNaN(Number(String(e.getAttribute("tabindex"))));
  }
  function Gi(e) {
    return !On(e) && (Vi(e) || En(e));
  }
  function Vi(e) {
    const t = I(e);
    return ["BUTTON", "DETAILS", "SELECT", "TEXTAREA"].includes(t) ? true : t === "A" || t === "AREA" ? e.hasAttribute("href") : t === "INPUT" ? !e.hidden : false;
  }
  var Ji = {
    A: (e) => e.hasAttribute("href") ? "link" : null,
    AREA: (e) => e.hasAttribute("href") ? "link" : null,
    ARTICLE: () => "article",
    ASIDE: () => "complementary",
    BLOCKQUOTE: () => "blockquote",
    BUTTON: () => "button",
    CAPTION: () => "caption",
    CODE: () => "code",
    DATALIST: () => "listbox",
    DD: () => "definition",
    DEL: () => "deletion",
    DETAILS: () => "group",
    DFN: () => "term",
    DIALOG: () => "dialog",
    DT: () => "term",
    EM: () => "emphasis",
    FIELDSET: () => "group",
    FIGURE: () => "figure",
    FOOTER: (e) => _e(e, xr) ? null : "contentinfo",
    FORM: (e) => mr(e) ? "form" : null,
    H1: () => "heading",
    H2: () => "heading",
    H3: () => "heading",
    H4: () => "heading",
    H5: () => "heading",
    H6: () => "heading",
    HEADER: (e) => _e(e, xr) ? null : "banner",
    HR: () => "separator",
    HTML: () => "document",
    IMG: (e) => e.getAttribute("alt") === "" && !e.getAttribute("title") && !Sn(e) && !En(e) ? "presentation" : "img",
    INPUT: (e) => {
      const t = e.type.toLowerCase();
      if (t === "search")
        return e.hasAttribute("list") ? "combobox" : "searchbox";
      if (["email", "tel", "text", "url", ""].includes(t)) {
        const r = xe(e, e.getAttribute("list"))[0];
        return r && I(r) === "DATALIST" ? "combobox" : "textbox";
      }
      return t === "hidden" ? null : t === "file" ? "button" : us[t] || "textbox";
    },
    INS: () => "insertion",
    LI: () => "listitem",
    MAIN: () => "main",
    MARK: () => "mark",
    MATH: () => "math",
    MENU: () => "list",
    METER: () => "meter",
    NAV: () => "navigation",
    OL: () => "list",
    OPTGROUP: () => "group",
    OPTION: () => "option",
    OUTPUT: () => "status",
    P: () => "paragraph",
    PROGRESS: () => "progressbar",
    SEARCH: () => "search",
    SECTION: (e) => mr(e) ? "region" : null,
    SELECT: (e) => e.hasAttribute("multiple") || e.size > 1 ? "listbox" : "combobox",
    STRONG: () => "strong",
    SUB: () => "subscript",
    SUP: () => "superscript",
    // For <svg> we default to Chrome behavior:
    // - Chrome reports 'img'.
    // - Firefox reports 'diagram' that is not in official ARIA spec yet.
    // - Safari reports 'no role', but still computes accessible name.
    SVG: () => "img",
    TABLE: () => "table",
    TBODY: () => "rowgroup",
    TD: (e) => {
      const t = _e(e, "table"), r = t ? Zt(t) : "";
      return r === "grid" || r === "treegrid" ? "gridcell" : "cell";
    },
    TEXTAREA: () => "textbox",
    TFOOT: () => "rowgroup",
    TH: (e) => {
      const t = e.getAttribute("scope");
      if (t === "col" || t === "colgroup")
        return "columnheader";
      if (t === "row" || t === "rowgroup")
        return "rowheader";
      const r = e.nextElementSibling, n = e.previousElementSibling, i = e.parentElement && I(e.parentElement) === "TR" ? e.parentElement : void 0;
      if (!r && !n) {
        if (i) {
          const s = _e(i, "table");
          if (s && s.rows.length <= 1)
            return null;
        }
        return "columnheader";
      }
      return wr(r) && wr(n) ? "columnheader" : br(r) || br(n) ? "rowheader" : "columnheader";
    },
    THEAD: () => "rowgroup",
    TIME: () => "time",
    TR: () => "row",
    UL: () => "list"
  };
  function wr(e) {
    return !!e && I(e) === "TH";
  }
  function br(e) {
    return !e || I(e) !== "TD" ? false : !!(e.textContent?.trim() || e.children.length > 0);
  }
  var Qi = {
    DD: ["DL", "DIV"],
    DIV: ["DL"],
    DT: ["DL", "DIV"],
    LI: ["OL", "UL"],
    TBODY: ["TABLE"],
    TD: ["TR"],
    TFOOT: ["TABLE"],
    TH: ["TR"],
    THEAD: ["TABLE"],
    TR: ["THEAD", "TBODY", "TFOOT", "TABLE"]
  };
  function vr(e) {
    const t = Ji[I(e)]?.(e) || "";
    if (!t)
      return null;
    let r = e;
    for (; r; ) {
      const n = B(r), i = Qi[I(r)];
      if (!i || !n || !i.includes(I(n)))
        break;
      const s = Zt(n);
      if ((s === "none" || s === "presentation") && !_n(n, s))
        return s;
      r = n;
    }
    return t;
  }
  var Xi = [
    "alert",
    "alertdialog",
    "application",
    "article",
    "banner",
    "blockquote",
    "button",
    "caption",
    "cell",
    "checkbox",
    "code",
    "columnheader",
    "combobox",
    "complementary",
    "contentinfo",
    "definition",
    "deletion",
    "dialog",
    "directory",
    "document",
    "emphasis",
    "feed",
    "figure",
    "form",
    "generic",
    "grid",
    "gridcell",
    "group",
    "heading",
    "img",
    "insertion",
    "link",
    "list",
    "listbox",
    "listitem",
    "log",
    "main",
    "mark",
    "marquee",
    "math",
    "meter",
    "menu",
    "menubar",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "navigation",
    "none",
    "note",
    "option",
    "paragraph",
    "presentation",
    "progressbar",
    "radio",
    "radiogroup",
    "region",
    "row",
    "rowgroup",
    "rowheader",
    "scrollbar",
    "search",
    "searchbox",
    "separator",
    "slider",
    "spinbutton",
    "status",
    "strong",
    "subscript",
    "superscript",
    "switch",
    "tab",
    "table",
    "tablist",
    "tabpanel",
    "term",
    "textbox",
    "time",
    "timer",
    "toolbar",
    "tooltip",
    "tree",
    "treegrid",
    "treeitem"
  ];
  function Zt(e) {
    return (e.getAttribute("role") || "").split(" ").map((r) => r.trim()).find((r) => Xi.includes(r)) || null;
  }
  function _n(e, t) {
    return Sn(e, t) || Gi(e);
  }
  function q(e) {
    const t = Zt(e);
    if (!t)
      return vr(e);
    if (t === "none" || t === "presentation") {
      const r = vr(e);
      if (_n(e, r))
        return r;
    }
    return t;
  }
  function Tn(e) {
    return e === null ? void 0 : e.toLowerCase() === "true";
  }
  function kn(e) {
    return ["STYLE", "SCRIPT", "NOSCRIPT", "TEMPLATE"].includes(I(e));
  }
  function V(e) {
    if (kn(e))
      return true;
    const t = ne(e), r = e.nodeName === "SLOT";
    if (t?.display === "contents" && !r) {
      for (let i = e.firstChild; i; i = i.nextSibling)
        if (i.nodeType === 1 && !V(i) || i.nodeType === 3 && tn(i))
          return false;
      return true;
    }
    return !(e.nodeName === "OPTION" && !!e.closest("select")) && !r && !en(e, t) ? true : An(e);
  }
  function An(e) {
    let t = Me?.get(e);
    if (t === void 0) {
      if (t = false, e.parentElement && e.parentElement.shadowRoot && !e.assignedSlot && (t = true), !t) {
        const r = ne(e);
        t = !r || r.display === "none" || Tn(e.getAttribute("aria-hidden")) === true;
      }
      if (!t) {
        const r = B(e);
        r && (t = An(r));
      }
      Me?.set(e, t);
    }
    return t;
  }
  function xe(e, t) {
    if (!t)
      return [];
    const r = Yr(e);
    if (!r)
      return [];
    try {
      const n = t.split(" ").filter((s) => !!s), i = [];
      for (const s of n) {
        const o = r.querySelector("#" + CSS.escape(s));
        o && !i.includes(o) && i.push(o);
      }
      return i;
    } catch {
      return [];
    }
  }
  function Y(e) {
    return e.trim();
  }
  function Ie(e) {
    return e.split("\xA0").map((t) => t.replace(/\r\n/g, `
`).replace(/[\u200b\u00ad]/g, "").replace(/\s\s*/g, " ")).join("\xA0").trim();
  }
  function yr(e, t) {
    const r = [...e.querySelectorAll(t)];
    for (const n of xe(e, e.getAttribute("aria-owns")))
      n.matches(t) && r.push(n), r.push(...n.querySelectorAll(t));
    return r;
  }
  function Pe(e, t) {
    const r = t === "::before" ? bt : t === "::after" ? vt : wt;
    if (r?.has(e))
      return r?.get(e);
    const n = ne(e, t);
    let i;
    if (n) {
      const s = n.content;
      s && s !== "none" && s !== "normal" && n.display !== "none" && n.visibility !== "hidden" && (i = Ki(e, s, !!t));
    }
    return t && i !== void 0 && (n?.display || "inline") !== "inline" && (i = " " + i + " "), r && r.set(e, i), i;
  }
  function Ki(e, t, r) {
    if (!(!t || t === "none" || t === "normal"))
      try {
        let n = nn(t).filter((a) => !(a instanceof ft));
        const i = n.findIndex((a) => a instanceof F && a.value === "/");
        if (i !== -1)
          n = n.slice(i + 1);
        else if (!r)
          return;
        const s = [];
        let o = 0;
        for (; o < n.length; )
          if (n[o] instanceof Yt)
            s.push(n[o].value), o++;
          else if (o + 2 < n.length && n[o] instanceof Ce && n[o].value === "attr" && n[o + 1] instanceof Kt && n[o + 2] instanceof Xt) {
            const a = n[o + 1].value;
            s.push(e.getAttribute(a) || ""), o += 3;
          } else
            return;
        return s.join("");
      } catch {
      }
  }
  function Cn(e) {
    const t = e.getAttribute("aria-labelledby");
    if (t === null)
      return null;
    const r = xe(e, t);
    return r.length ? r : null;
  }
  function Yi(e, t) {
    const r = ["button", "cell", "checkbox", "columnheader", "gridcell", "heading", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "row", "rowheader", "switch", "tab", "tooltip", "treeitem"].includes(e), n = t && ["", "caption", "code", "contentinfo", "definition", "deletion", "emphasis", "insertion", "list", "listitem", "mark", "none", "paragraph", "presentation", "region", "row", "rowgroup", "section", "strong", "subscript", "superscript", "table", "term", "time"].includes(e);
    return r || n;
  }
  function Le(e, t) {
    const r = t ? gt : dt;
    let n = r?.get(e);
    return n === void 0 && (n = "", ["caption", "code", "definition", "deletion", "emphasis", "generic", "insertion", "mark", "paragraph", "presentation", "strong", "subscript", "suggestion", "superscript", "term", "time"].includes(q(e) || "") || (n = Ie(J(e, {
      includeHidden: t,
      visitedElements: /* @__PURE__ */ new Set(),
      embeddedInTargetElement: "self"
    }))), r?.set(e, n)), n;
  }
  function Sr(e, t) {
    const r = t ? xt : mt;
    let n = r?.get(e);
    if (n === void 0) {
      if (n = "", e.hasAttribute("aria-describedby")) {
        const i = xe(e, e.getAttribute("aria-describedby"));
        n = Ie(i.map((s) => J(s, {
          includeHidden: t,
          visitedElements: /* @__PURE__ */ new Set(),
          embeddedInDescribedBy: { element: s, hidden: V(s) }
        })).join(" "));
      } else e.hasAttribute("aria-description") ? n = Ie(e.getAttribute("aria-description") || "") : n = Ie(e.getAttribute("title") || "");
      r?.set(e, n);
    }
    return n;
  }
  function Zi(e) {
    const t = e.getAttribute("aria-invalid");
    return !t || t.trim() === "" || t.toLocaleLowerCase() === "false" ? "false" : t === "true" || t === "grammar" || t === "spelling" ? t : "true";
  }
  function es(e) {
    return "validity" in e ? e.validity?.valid === false : false;
  }
  function ts(e) {
    const t = Oe;
    let r = Oe?.get(e);
    if (r === void 0) {
      r = "";
      const n = Zi(e) !== "false", i = es(e);
      if (n || i) {
        const s = e.getAttribute("aria-errormessage");
        r = xe(e, s).map((l) => Ie(
          J(l, {
            visitedElements: /* @__PURE__ */ new Set(),
            embeddedInDescribedBy: { element: l, hidden: V(l) }
          })
        )).join(" ").trim();
      }
      t?.set(e, r);
    }
    return r;
  }
  function J(e, t) {
    if (t.visitedElements.has(e))
      return "";
    const r = {
      ...t,
      embeddedInTargetElement: t.embeddedInTargetElement === "self" ? "descendant" : t.embeddedInTargetElement
    };
    if (!t.includeHidden) {
      const l = !!t.embeddedInLabelledBy?.hidden || !!t.embeddedInDescribedBy?.hidden || !!t.embeddedInNativeTextAlternative?.hidden || !!t.embeddedInLabel?.hidden;
      if (kn(e) || !l && V(e))
        return t.visitedElements.add(e), "";
    }
    const n = Cn(e);
    if (!t.embeddedInLabelledBy) {
      const l = (n || []).map((c) => J(c, {
        ...t,
        embeddedInLabelledBy: { element: c, hidden: V(c) },
        embeddedInDescribedBy: void 0,
        embeddedInTargetElement: void 0,
        embeddedInLabel: void 0,
        embeddedInNativeTextAlternative: void 0
      })).join(" ");
      if (l)
        return l;
    }
    const i = q(e) || "", s = I(e);
    if (t.embeddedInLabel || t.embeddedInLabelledBy || t.embeddedInTargetElement === "descendant") {
      const l = [...e.labels || []].includes(e), c = (n || []).includes(e);
      if (!l && !c) {
        if (i === "textbox")
          return t.visitedElements.add(e), s === "INPUT" || s === "TEXTAREA" ? e.value : e.textContent || "";
        if (["combobox", "listbox"].includes(i)) {
          t.visitedElements.add(e);
          let u;
          if (s === "SELECT")
            u = [...e.selectedOptions], !u.length && e.options.length && u.push(e.options[0]);
          else {
            const f = i === "combobox" ? yr(e, "*").find((d) => q(d) === "listbox") : e;
            u = f ? yr(f, '[aria-selected="true"]').filter((d) => q(d) === "option") : [];
          }
          return !u.length && s === "INPUT" ? e.value : u.map((f) => J(f, r)).join(" ");
        }
        if (["progressbar", "scrollbar", "slider", "spinbutton", "meter"].includes(i))
          return t.visitedElements.add(e), e.hasAttribute("aria-valuetext") ? e.getAttribute("aria-valuetext") || "" : e.hasAttribute("aria-valuenow") ? e.getAttribute("aria-valuenow") || "" : e.getAttribute("value") || "";
        if (["menu"].includes(i))
          return t.visitedElements.add(e), "";
      }
    }
    const o = e.getAttribute("aria-label") || "";
    if (Y(o))
      return t.visitedElements.add(e), o;
    if (!["presentation", "none"].includes(i)) {
      if (s === "INPUT" && ["button", "submit", "reset"].includes(e.type)) {
        t.visitedElements.add(e);
        const l = e.value || "";
        return Y(l) ? l : e.type === "submit" ? "Submit" : e.type === "reset" ? "Reset" : e.getAttribute("title") || "";
      }
      if (s === "INPUT" && e.type === "file") {
        t.visitedElements.add(e);
        const l = e.labels || [];
        return l.length && !t.embeddedInLabelledBy ? be(l, t) : "Choose File";
      }
      if (s === "INPUT" && e.type === "image") {
        t.visitedElements.add(e);
        const l = e.labels || [];
        if (l.length && !t.embeddedInLabelledBy)
          return be(l, t);
        const c = e.getAttribute("alt") || "";
        if (Y(c))
          return c;
        const u = e.getAttribute("title") || "";
        return Y(u) ? u : "Submit";
      }
      if (!n && s === "BUTTON") {
        t.visitedElements.add(e);
        const l = e.labels || [];
        if (l.length)
          return be(l, t);
      }
      if (!n && s === "OUTPUT") {
        t.visitedElements.add(e);
        const l = e.labels || [];
        return l.length ? be(l, t) : e.getAttribute("title") || "";
      }
      if (!n && (s === "TEXTAREA" || s === "SELECT" || s === "INPUT")) {
        t.visitedElements.add(e);
        const l = e.labels || [];
        if (l.length)
          return be(l, t);
        const c = s === "INPUT" && ["text", "password", "search", "tel", "email", "url"].includes(e.type) || s === "TEXTAREA", u = e.getAttribute("placeholder") || "", f = e.getAttribute("title") || "";
        return !c || f ? f : u;
      }
      if (!n && s === "FIELDSET") {
        t.visitedElements.add(e);
        for (let c = e.firstElementChild; c; c = c.nextElementSibling)
          if (I(c) === "LEGEND")
            return J(c, {
              ...r,
              embeddedInNativeTextAlternative: { element: c, hidden: V(c) }
            });
        return e.getAttribute("title") || "";
      }
      if (!n && s === "FIGURE") {
        t.visitedElements.add(e);
        for (let c = e.firstElementChild; c; c = c.nextElementSibling)
          if (I(c) === "FIGCAPTION")
            return J(c, {
              ...r,
              embeddedInNativeTextAlternative: { element: c, hidden: V(c) }
            });
        return e.getAttribute("title") || "";
      }
      if (s === "IMG") {
        t.visitedElements.add(e);
        const l = e.getAttribute("alt") || "";
        return Y(l) ? l : e.getAttribute("title") || "";
      }
      if (s === "TABLE") {
        t.visitedElements.add(e);
        for (let c = e.firstElementChild; c; c = c.nextElementSibling)
          if (I(c) === "CAPTION")
            return J(c, {
              ...r,
              embeddedInNativeTextAlternative: { element: c, hidden: V(c) }
            });
        const l = e.getAttribute("summary") || "";
        if (l)
          return l;
      }
      if (s === "AREA") {
        t.visitedElements.add(e);
        const l = e.getAttribute("alt") || "";
        return Y(l) ? l : e.getAttribute("title") || "";
      }
      if (s === "SVG" || e.ownerSVGElement) {
        t.visitedElements.add(e);
        for (let l = e.firstElementChild; l; l = l.nextElementSibling)
          if (I(l) === "TITLE" && l.ownerSVGElement)
            return J(l, {
              ...r,
              embeddedInLabelledBy: { element: l, hidden: V(l) }
            });
      }
      if (e.ownerSVGElement && s === "A") {
        const l = e.getAttribute("xlink:title") || "";
        if (Y(l))
          return t.visitedElements.add(e), l;
      }
    }
    const a = s === "SUMMARY" && !["presentation", "none"].includes(i);
    if (Yi(i, t.embeddedInTargetElement === "descendant") || a || t.embeddedInLabelledBy || t.embeddedInDescribedBy || t.embeddedInLabel || t.embeddedInNativeTextAlternative) {
      t.visitedElements.add(e);
      const l = rs(e, r);
      if (t.embeddedInTargetElement === "self" ? Y(l) : l)
        return l;
    }
    if (!["presentation", "none"].includes(i) || s === "IFRAME") {
      t.visitedElements.add(e);
      const l = e.getAttribute("title") || "";
      if (Y(l))
        return l;
    }
    return t.visitedElements.add(e), "";
  }
  function rs(e, t) {
    const r = [], n = (s, o) => {
      if (!(o && s.assignedSlot))
        if (s.nodeType === 1) {
          const a = ne(s)?.display || "inline";
          let l = J(s, t);
          (a !== "inline" || s.nodeName === "BR") && (l = " " + l + " "), r.push(l);
        } else s.nodeType === 3 && r.push(s.textContent || "");
    };
    r.push(Pe(e, "::before") || "");
    const i = Pe(e);
    if (i !== void 0)
      r.push(i);
    else {
      const s = e.nodeName === "SLOT" ? e.assignedNodes() : [];
      if (s.length)
        for (const o of s)
          n(o, false);
      else {
        for (let o = e.firstChild; o; o = o.nextSibling)
          n(o, true);
        if (e.shadowRoot)
          for (let o = e.shadowRoot.firstChild; o; o = o.nextSibling)
            n(o, true);
        for (const o of xe(e, e.getAttribute("aria-owns")))
          n(o, true);
      }
    }
    return r.push(Pe(e, "::after") || ""), r.join("");
  }
  var er = ["gridcell", "option", "row", "tab", "rowheader", "columnheader", "treeitem"];
  function In(e) {
    return I(e) === "OPTION" ? e.selected : er.includes(q(e) || "") ? Tn(e.getAttribute("aria-selected")) === true : false;
  }
  var tr = ["checkbox", "menuitemcheckbox", "option", "radio", "switch", "menuitemradio", "treeitem"];
  function Pn(e) {
    const t = rr(e, true);
    return t === "error" ? false : t;
  }
  function ns(e) {
    return rr(e, true);
  }
  function is(e) {
    return rr(e, false);
  }
  function rr(e, t) {
    const r = I(e);
    if (t && r === "INPUT" && e.indeterminate)
      return "mixed";
    if (r === "INPUT" && ["checkbox", "radio"].includes(e.type))
      return e.checked;
    if (tr.includes(q(e) || "")) {
      const n = e.getAttribute("aria-checked");
      return n === "true" ? true : t && n === "mixed" ? "mixed" : false;
    }
    return "error";
  }
  var ss = ["checkbox", "combobox", "grid", "gridcell", "listbox", "radiogroup", "slider", "spinbutton", "textbox", "columnheader", "rowheader", "searchbox", "switch", "treegrid"];
  function os(e) {
    const t = I(e);
    return ["INPUT", "TEXTAREA", "SELECT"].includes(t) ? e.hasAttribute("readonly") : ss.includes(q(e) || "") ? e.getAttribute("aria-readonly") === "true" : e.isContentEditable ? false : "error";
  }
  var nr = ["button"];
  function Nn(e) {
    if (nr.includes(q(e) || "")) {
      const t = e.getAttribute("aria-pressed");
      if (t === "true")
        return true;
      if (t === "mixed")
        return "mixed";
    }
    return false;
  }
  var ir = ["application", "button", "checkbox", "combobox", "gridcell", "link", "listbox", "menuitem", "row", "rowheader", "tab", "treeitem", "columnheader", "menuitemcheckbox", "menuitemradio", "rowheader", "switch"];
  function $n(e) {
    if (I(e) === "DETAILS")
      return e.open;
    if (ir.includes(q(e) || "")) {
      const t = e.getAttribute("aria-expanded");
      return t === null ? void 0 : t === "true";
    }
  }
  var sr = ["heading", "listitem", "row", "treeitem"];
  function Rn(e) {
    const t = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }[I(e)];
    if (t)
      return t;
    if (sr.includes(q(e) || "")) {
      const r = e.getAttribute("aria-level"), n = r === null ? Number.NaN : Number(r);
      if (Number.isInteger(n) && n >= 1)
        return n;
    }
    return 0;
  }
  var Ln = ["application", "button", "composite", "gridcell", "group", "input", "link", "menuitem", "scrollbar", "separator", "tab", "checkbox", "columnheader", "combobox", "grid", "listbox", "menu", "menubar", "menuitemcheckbox", "menuitemradio", "option", "radio", "radiogroup", "row", "rowheader", "searchbox", "select", "slider", "spinbutton", "switch", "tablist", "textbox", "toolbar", "tree", "treegrid", "treeitem"];
  function pt(e) {
    return On(e) || Mn(e);
  }
  function On(e) {
    return ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "OPTION", "OPTGROUP"].includes(I(e)) && (e.hasAttribute("disabled") || as(e) || ls(e));
  }
  function as(e) {
    return I(e) === "OPTION" && !!e.closest("OPTGROUP[DISABLED]");
  }
  function ls(e) {
    const t = e?.closest("FIELDSET[DISABLED]");
    if (!t)
      return false;
    const r = t.querySelector(":scope > LEGEND");
    return !r || !r.contains(e);
  }
  function Mn(e, t = false) {
    if (!e)
      return false;
    if (t || Ln.includes(q(e) || "")) {
      const r = (e.getAttribute("aria-disabled") || "").toLowerCase();
      return r === "true" ? true : r === "false" ? false : Mn(B(e), true);
    }
    return false;
  }
  function be(e, t) {
    return [...e].map((r) => J(r, {
      ...t,
      embeddedInLabel: { element: r, hidden: V(r) },
      embeddedInNativeTextAlternative: void 0,
      embeddedInLabelledBy: void 0,
      embeddedInDescribedBy: void 0,
      embeddedInTargetElement: void 0
    })).filter((r) => !!r).join(" ");
  }
  function cs(e) {
    const t = yt;
    let r = e, n;
    const i = [];
    for (; r; r = B(r)) {
      const s = t.get(r);
      if (s !== void 0) {
        n = s;
        break;
      }
      i.push(r);
      const o = ne(r);
      if (!o) {
        n = true;
        break;
      }
      const a = o.pointerEvents;
      if (a) {
        n = a !== "none";
        break;
      }
    }
    n === void 0 && (n = true);
    for (const s of i)
      t.set(s, n);
    return n;
  }
  var dt;
  var gt;
  var mt;
  var xt;
  var Oe;
  var Me;
  var wt;
  var bt;
  var vt;
  var yt;
  var Fn = 0;
  function _t() {
    Vt(), ++Fn, dt ?? (dt = /* @__PURE__ */ new Map()), gt ?? (gt = /* @__PURE__ */ new Map()), mt ?? (mt = /* @__PURE__ */ new Map()), xt ?? (xt = /* @__PURE__ */ new Map()), Oe ?? (Oe = /* @__PURE__ */ new Map()), Me ?? (Me = /* @__PURE__ */ new Map()), wt ?? (wt = /* @__PURE__ */ new Map()), bt ?? (bt = /* @__PURE__ */ new Map()), vt ?? (vt = /* @__PURE__ */ new Map()), yt ?? (yt = /* @__PURE__ */ new Map());
  }
  function Tt() {
    --Fn || (dt = void 0, gt = void 0, mt = void 0, xt = void 0, Oe = void 0, Me = void 0, wt = void 0, bt = void 0, vt = void 0, yt = void 0), Jt();
  }
  var us = {
    button: "button",
    checkbox: "checkbox",
    image: "button",
    number: "spinbutton",
    radio: "radio",
    range: "slider",
    reset: "button",
    submit: "button"
  };
  var hs = 0;
  function Dn(e) {
    return e.mode === "ai" ? {
      visibility: "ariaOrVisible",
      refs: "interactable",
      refPrefix: e.refPrefix,
      includeGenericRole: true,
      renderActive: !e.doNotRenderActive,
      renderCursorPointer: true
    } : e.mode === "autoexpect" ? { visibility: "ariaAndVisible", refs: "none" } : e.mode === "codegen" ? { visibility: "aria", refs: "none", renderStringsAsRegex: true } : { visibility: "aria", refs: "none" };
  }
  function Ne(e, t) {
    const r = Dn(t), n = /* @__PURE__ */ new Set(), i = {
      root: { role: "fragment", name: "", children: [], props: {}, box: lt(e), receivesPointerEvents: true },
      elements: /* @__PURE__ */ new Map(),
      refs: /* @__PURE__ */ new Map(),
      iframeRefs: []
    };
    qt(i.root, e);
    const s = (a, l, c) => {
      if (n.has(l))
        return;
      if (n.add(l), l.nodeType === Node.TEXT_NODE && l.nodeValue) {
        if (!c)
          return;
        const x = l.nodeValue;
        a.role !== "textbox" && x && a.children.push(l.nodeValue || "");
        return;
      }
      if (l.nodeType !== Node.ELEMENT_NODE)
        return;
      const u = l, f = !V(u);
      let d = f;
      if (r.visibility === "ariaOrVisible" && (d = f || re(u)), r.visibility === "ariaAndVisible" && (d = f && re(u)), r.visibility === "aria" && !d)
        return;
      const b = [];
      if (u.hasAttribute("aria-owns")) {
        const x = u.getAttribute("aria-owns").split(/\s+/);
        for (const p of x) {
          const w = e.ownerDocument.getElementById(p);
          w && b.push(w);
        }
      }
      const h = d ? fs(u, r) : null;
      h && (h.ref && (i.elements.set(h.ref, u), i.refs.set(u, h.ref), h.role === "iframe" && i.iframeRefs.push(h.ref)), a.children.push(h)), o(h || a, u, b, d);
    };
    function o(a, l, c, u) {
      const d = (ne(l)?.display || "inline") !== "inline" || l.nodeName === "BR" ? " " : "";
      d && a.children.push(d), a.children.push(Pe(l, "::before") || "");
      const b = l.nodeName === "SLOT" ? l.assignedNodes() : [];
      if (b.length)
        for (const h of b)
          s(a, h, u);
      else {
        for (let h = l.firstChild; h; h = h.nextSibling)
          h.assignedSlot || s(a, h, u);
        if (l.shadowRoot)
          for (let h = l.shadowRoot.firstChild; h; h = h.nextSibling)
            s(a, h, u);
      }
      for (const h of c)
        s(a, h, u);
      if (a.children.push(Pe(l, "::after") || ""), d && a.children.push(d), a.children.length === 1 && a.name === a.children[0] && (a.children = []), a.role === "link" && l.hasAttribute("href")) {
        const h = l.getAttribute("href");
        a.props.url = h;
      }
      if (a.role === "textbox" && l.hasAttribute("placeholder") && l.getAttribute("placeholder") !== a.name) {
        const h = l.getAttribute("placeholder");
        a.props.placeholder = h;
      }
    }
    _t();
    try {
      s(i.root, e, true);
    } finally {
      Tt();
    }
    return ds(i.root), ps(i.root), i;
  }
  function Er(e, t) {
    if (t.refs === "none" || t.refs === "interactable" && (!e.box.visible || !e.receivesPointerEvents))
      return;
    const r = ar(e);
    let n = r._ariaRef;
    (!n || n.role !== e.role || n.name !== e.name) && (n = { role: e.role, name: e.name, ref: (t.refPrefix ?? "") + "e" + ++hs }, r._ariaRef = n), e.ref = n.ref;
  }
  function fs(e, t) {
    const r = e.ownerDocument.activeElement === e;
    if (e.nodeName === "IFRAME") {
      const c = {
        role: "iframe",
        name: "",
        children: [],
        props: {},
        box: lt(e),
        receivesPointerEvents: true,
        active: r
      };
      return qt(c, e), Er(c, t), c;
    }
    const n = t.includeGenericRole ? "generic" : null, i = q(e) ?? n;
    if (!i || i === "presentation" || i === "none")
      return null;
    const s = W(Le(e, false) || ""), o = cs(e), a = lt(e);
    if (i === "generic" && a.inline && e.childNodes.length === 1 && e.childNodes[0].nodeType === Node.TEXT_NODE)
      return null;
    const l = {
      role: i,
      name: s,
      children: [],
      props: {},
      box: a,
      receivesPointerEvents: o,
      active: r
    };
    return qt(l, e), Er(l, t), tr.includes(i) && (l.checked = Pn(e)), Ln.includes(i) && (l.disabled = pt(e)), ir.includes(i) && (l.expanded = $n(e)), sr.includes(i) && (l.level = Rn(e)), nr.includes(i) && (l.pressed = Nn(e)), er.includes(i) && (l.selected = In(e)), (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) && e.type !== "checkbox" && e.type !== "radio" && e.type !== "file" && (l.children = [e.value]), l;
  }
  function ps(e) {
    const t = (r) => {
      const n = [];
      for (const s of r.children || []) {
        if (typeof s == "string") {
          n.push(s);
          continue;
        }
        const o = t(s);
        n.push(...o);
      }
      return r.role === "generic" && !r.name && n.length <= 1 && n.every((s) => typeof s != "string" && !!s.ref) ? n : (r.children = n, [r]);
    };
    t(e);
  }
  function ds(e) {
    const t = (n, i) => {
      if (!n.length)
        return;
      const s = W(n.join(""));
      s && i.push(s), n.length = 0;
    }, r = (n) => {
      const i = [], s = [];
      for (const o of n.children || [])
        typeof o == "string" ? s.push(o) : (t(s, i), r(o), i.push(o));
      t(s, i), n.children = i.length ? i : [], n.children.length === 1 && n.children[0] === n.name && (n.children = []);
    };
    r(e);
  }
  function gs(e, t) {
    return t ? e ? typeof t == "string" ? e === t : !!e.match(new RegExp(t.pattern)) : false : true;
  }
  function _r(e, t) {
    if (!t?.normalized)
      return true;
    if (!e)
      return false;
    if (e === t.normalized || e === t.raw)
      return true;
    const r = ms(t);
    return r ? !!e.match(r) : false;
  }
  var Pt = /* @__PURE__ */ Symbol("cachedRegex");
  function ms(e) {
    if (e[Pt] !== void 0)
      return e[Pt];
    const { raw: t } = e, r = t.startsWith("/") && t.endsWith("/") && t.length > 1;
    let n;
    try {
      n = r ? new RegExp(t.slice(1, -1)) : null;
    } catch {
      n = null;
    }
    return e[Pt] = n, n;
  }
  function xs(e, t) {
    const r = Ne(e, { mode: "default" });
    return {
      matches: qn(r.root, t, false, false),
      received: {
        raw: $e(r, { mode: "default" }).text,
        regex: $e(r, { mode: "codegen" }).text
      }
    };
  }
  function ws(e, t) {
    const r = Ne(e, { mode: "default" }).root;
    return qn(r, t, true, false).map((i) => ar(i));
  }
  function or(e, t, r) {
    return typeof e == "string" && t.kind === "text" ? _r(e, t.text) : e === null || typeof e != "object" || t.kind !== "role" || t.role !== "fragment" && t.role !== e.role || t.checked !== void 0 && t.checked !== e.checked || t.disabled !== void 0 && t.disabled !== e.disabled || t.expanded !== void 0 && t.expanded !== e.expanded || t.level !== void 0 && t.level !== e.level || t.pressed !== void 0 && t.pressed !== e.pressed || t.selected !== void 0 && t.selected !== e.selected || !gs(e.name, t.name) || !_r(e.props.url, t.props?.url) ? false : t.containerMode === "contain" ? kr(e.children || [], t.children || []) : t.containerMode === "equal" ? Tr(e.children || [], t.children || [], false) : t.containerMode === "deep-equal" || r ? Tr(e.children || [], t.children || [], true) : kr(e.children || [], t.children || []);
  }
  function Tr(e, t, r) {
    if (t.length !== e.length)
      return false;
    for (let n = 0; n < t.length; ++n)
      if (!or(e[n], t[n], r))
        return false;
    return true;
  }
  function kr(e, t) {
    if (t.length > e.length)
      return false;
    const r = e.slice(), n = t.slice();
    for (const i of n) {
      let s = r.shift();
      for (; s && !or(s, i, false); )
        s = r.shift();
      if (!s)
        return false;
    }
    return true;
  }
  function qn(e, t, r, n) {
    const i = [], s = (o, a) => {
      if (or(o, t, n)) {
        const l = typeof o == "string" ? a : o;
        return l && i.push(l), !r;
      }
      if (typeof o == "string")
        return false;
      for (const l of o.children || [])
        if (s(l, o))
          return true;
      return false;
    };
    return s(e, null), i;
  }
  function Bn(e, t = /* @__PURE__ */ new Map()) {
    e?.ref && t.set(e.ref, e);
    for (const r of e?.children || [])
      typeof r != "string" && Bn(r, t);
    return t;
  }
  function bs(e, t) {
    const r = Bn(t?.root), n = /* @__PURE__ */ new Map(), i = (s, o) => {
      let a = s.children.length === o?.children.length && yi(s, o), l = a;
      for (let c = 0; c < s.children.length; c++) {
        const u = s.children[c], f = o?.children[c];
        if (typeof u == "string")
          a && (a = u === f), l && (l = u === f);
        else {
          let d = typeof f != "string" ? f : void 0;
          u.ref && (d = r.get(u.ref));
          const b = i(u, d);
          (!d || !b && !u.ref || d !== f) && (l = false), a && (a = b && d === f);
        }
      }
      return n.set(s, a ? "same" : l ? "skip" : "changed"), a;
    };
    return i(e.root, r.get(t?.root?.ref)), n;
  }
  function vs(e, t) {
    const r = [], n = (i) => {
      const s = t.get(i);
      if (s !== "same") if (s === "skip")
        for (const o of i.children)
          typeof o != "string" && n(o);
      else
        r.push(i);
    };
    for (const i of e)
      typeof i == "string" ? r.push(i) : n(i);
    return r;
  }
  function Ve(e) {
    return "  ".repeat(e);
  }
  function $e(e, t, r) {
    const n = Dn(t), i = [], s = {}, o = n.renderStringsAsRegex ? Ss : () => true, a = n.renderStringsAsRegex ? ys : (h) => h;
    let l = e.root.role === "fragment" ? e.root.children : [e.root];
    const c = bs(e, r);
    r && (l = vs(l, c));
    const u = (h, x) => {
      if (t.depth && x > t.depth)
        return;
      const p = It(a(h));
      p && i.push(Ve(x) + "- text: " + p);
    }, f = (h, x) => {
      let p = h.role;
      if (h.name && h.name.length <= 900) {
        const w = a(h.name);
        if (w) {
          const v = w.startsWith("/") && w.endsWith("/") ? w : JSON.stringify(w);
          p += " " + v;
        }
      }
      return h.checked === "mixed" && (p += " [checked=mixed]"), h.checked === true && (p += " [checked]"), h.disabled && (p += " [disabled]"), h.expanded && (p += " [expanded]"), h.active && n.renderActive && (p += " [active]"), h.level && (p += ` [level=${h.level}]`), h.pressed === "mixed" && (p += " [pressed=mixed]"), h.pressed === true && (p += " [pressed]"), h.selected === true && (p += " [selected]"), h.ref && (p += ` [ref=${h.ref}]`, x && st(h) && (p += " [cursor=pointer]")), p;
    }, d = (h) => h?.children.length === 1 && typeof h.children[0] == "string" && !Object.keys(h.props).length ? h.children[0] : void 0, b = (h, x, p) => {
      if (t.depth && x > t.depth)
        return;
      if (h.role === "iframe" && h.ref && (s[h.ref] = x), c.get(h) === "same" && h.ref) {
        i.push(Ve(x) + `- ref=${h.ref} [unchanged]`);
        return;
      }
      const w = !!r && !x, v = Ve(x) + "- " + (w ? "<changed> " : "") + Ii(f(h, p)), T = d(h), _ = !!t.depth && x === t.depth;
      if (!T && (!h.children.length || _) && !Object.keys(h.props).length)
        i.push(v);
      else if (T !== void 0)
        o(h, T) ? i.push(v + ": " + It(a(T))) : i.push(v);
      else {
        i.push(v + ":");
        for (const [A, k] of Object.entries(h.props))
          i.push(Ve(x + 1) + "- /" + A + ": " + It(k));
        const S = !!h.ref && p && st(h);
        for (const A of h.children)
          typeof A == "string" ? u(o(h, A) ? A : "", x + 1) : b(A, x + 1, p && !S);
      }
    };
    for (const h of l)
      typeof h == "string" ? u(h, 0) : b(h, 0, !!n.renderCursorPointer);
    return { text: i.join(`
`), iframeDepths: s };
  }
  function ys(e) {
    const t = [
      // 550e8400-e29b-41d4-a716-446655440000
      { regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/, replacement: "[0-9a-fA-F-]+" },
      // 2mb
      { regex: /\b[\d,.]+[bkmBKM]+\b/, replacement: "[\\d,.]+[bkmBKM]+" },
      // 2ms, 20s
      { regex: /\b\d+[hmsp]+\b/, replacement: "\\d+[hmsp]+" },
      { regex: /\b[\d,.]+[hmsp]+\b/, replacement: "[\\d,.]+[hmsp]+" },
      // Do not replace single digits with regex by default.
      // 2+ digits: [Issue 22, 22.3, 2.33, 2,333]
      { regex: /\b\d+,\d+\b/, replacement: "\\d+,\\d+" },
      { regex: /\b\d+\.\d{2,}\b/, replacement: "\\d+\\.\\d+" },
      { regex: /\b\d{2,}\.\d+\b/, replacement: "\\d+\\.\\d+" },
      { regex: /\b\d{2,}\b/, replacement: "\\d+" }
    ];
    let r = "", n = 0;
    const i = new RegExp(t.map((s) => "(" + s.regex.source + ")").join("|"), "g");
    return e.replace(i, (s, ...o) => {
      const a = o[o.length - 2], l = o.slice(0, -2);
      r += at(e.slice(n, a));
      for (let c = 0; c < l.length; c++)
        if (l[c]) {
          const { replacement: u } = t[c];
          r += u;
          break;
        }
      return n = a + s.length, s;
    }), r ? (r += at(e.slice(n)), String(new RegExp(r))) : e;
  }
  function Ss(e, t) {
    if (!t.length)
      return false;
    if (!e.name)
      return true;
    if (e.name.length > t.length)
      return false;
    const r = t.length <= 200 && e.name.length <= 200 ? Ai(t, e.name) : "";
    let n = t;
    for (; r && n.includes(r); )
      n = n.replace(r, "");
    return n.trim().length / t.length > 0.1;
  }
  var Hn = /* @__PURE__ */ Symbol("element");
  function ar(e) {
    return e[Hn];
  }
  function qt(e, t) {
    e[Hn] = t;
  }
  function Es(e, t) {
    const r = _i(e, t);
    return r ? ar(r) : void 0;
  }
  function _s(e) {
    try {
      return e instanceof RegExp || Object.prototype.toString.call(e) === "[object RegExp]";
    } catch {
      return false;
    }
  }
  function Ts(e) {
    try {
      return e instanceof Date || Object.prototype.toString.call(e) === "[object Date]";
    } catch {
      return false;
    }
  }
  function ks(e) {
    try {
      return e instanceof URL || Object.prototype.toString.call(e) === "[object URL]";
    } catch {
      return false;
    }
  }
  function As(e) {
    try {
      return e instanceof Error || e && Object.getPrototypeOf(e)?.name === "Error";
    } catch {
      return false;
    }
  }
  function Cs(e, t) {
    try {
      return e instanceof t || Object.prototype.toString.call(e) === `[object ${t.name}]`;
    } catch {
      return false;
    }
  }
  function Is(e) {
    try {
      return e instanceof ArrayBuffer || Object.prototype.toString.call(e) === "[object ArrayBuffer]";
    } catch {
      return false;
    }
  }
  var jn = {
    i8: Int8Array,
    ui8: Uint8Array,
    ui8c: Uint8ClampedArray,
    i16: Int16Array,
    ui16: Uint16Array,
    i32: Int32Array,
    ui32: Uint32Array,
    // TODO: add Float16Array once it's in baseline
    f32: Float32Array,
    f64: Float64Array,
    bi64: BigInt64Array,
    bui64: BigUint64Array
  };
  function Ar(e) {
    if ("toBase64" in e)
      return e.toBase64();
    const t = Array.from(new Uint8Array(e.buffer, e.byteOffset, e.byteLength)).map((r) => String.fromCharCode(r)).join("");
    return btoa(t);
  }
  function Cr(e, t) {
    const r = atob(e), n = new Uint8Array(r.length);
    for (let i = 0; i < r.length; i++)
      n[i] = r.charCodeAt(i);
    return new t(n.buffer);
  }
  function Fe(e, t = [], r = /* @__PURE__ */ new Map()) {
    if (!Object.is(e, void 0)) {
      if (typeof e == "object" && e) {
        if ("ref" in e)
          return r.get(e.ref);
        if ("v" in e)
          return e.v === "undefined" ? void 0 : e.v === "null" ? null : e.v === "NaN" ? NaN : e.v === "Infinity" ? 1 / 0 : e.v === "-Infinity" ? -1 / 0 : e.v === "-0" ? -0 : void 0;
        if ("d" in e)
          return new Date(e.d);
        if ("u" in e)
          return new URL(e.u);
        if ("bi" in e)
          return BigInt(e.bi);
        if ("e" in e) {
          const n = new Error(e.e.m);
          return n.name = e.e.n, n.stack = e.e.s, n;
        }
        if ("r" in e)
          return new RegExp(e.r.p, e.r.f);
        if ("a" in e) {
          const n = [];
          r.set(e.id, n);
          for (const i of e.a)
            n.push(Fe(i, t, r));
          return n;
        }
        if ("o" in e) {
          const n = {};
          r.set(e.id, n);
          for (const { k: i, v: s } of e.o)
            i !== "__proto__" && (n[i] = Fe(s, t, r));
          return n;
        }
        if ("h" in e)
          return t[e.h];
        if ("ta" in e)
          return Cr(e.ta.b, jn[e.ta.k]);
        if ("ab" in e)
          return Cr(e.ab.b, Uint8Array).buffer;
      }
      return e;
    }
  }
  function lr(e, t) {
    return Bt(e, t, { visited: /* @__PURE__ */ new Map(), lastId: 0 });
  }
  function Bt(e, t, r) {
    if (e && typeof e == "object") {
      if (typeof globalThis.Window == "function" && e instanceof globalThis.Window)
        return "ref: <Window>";
      if (typeof globalThis.Document == "function" && e instanceof globalThis.Document)
        return "ref: <Document>";
      if (typeof globalThis.Node == "function" && e instanceof globalThis.Node)
        return "ref: <Node>";
    }
    return Wn(e, t, r);
  }
  function Wn(e, t, r) {
    const n = t(e);
    if ("fallThrough" in n)
      e = n.fallThrough;
    else
      return n;
    if (typeof e == "symbol")
      return { v: "undefined" };
    if (Object.is(e, void 0))
      return { v: "undefined" };
    if (Object.is(e, null))
      return { v: "null" };
    if (Object.is(e, NaN))
      return { v: "NaN" };
    if (Object.is(e, 1 / 0))
      return { v: "Infinity" };
    if (Object.is(e, -1 / 0))
      return { v: "-Infinity" };
    if (Object.is(e, -0))
      return { v: "-0" };
    if (typeof e == "boolean" || typeof e == "number" || typeof e == "string")
      return e;
    if (typeof e == "bigint")
      return { bi: e.toString() };
    if (As(e)) {
      let s;
      return e.stack?.startsWith(e.name + ": " + e.message) ? s = e.stack : s = `${e.name}: ${e.message}
${e.stack}`, { e: { n: e.name, m: e.message, s } };
    }
    if (Ts(e))
      return { d: e.toJSON() };
    if (ks(e))
      return { u: e.toJSON() };
    if (_s(e))
      return { r: { p: e.source, f: e.flags } };
    for (const [s, o] of Object.entries(jn))
      if (Cs(e, o))
        return { ta: { b: Ar(e), k: s } };
    if (Is(e))
      return { ab: { b: Ar(new Uint8Array(e)) } };
    const i = r.visited.get(e);
    if (i)
      return { ref: i };
    if (Array.isArray(e)) {
      const s = [], o = ++r.lastId;
      r.visited.set(e, o);
      for (let a = 0; a < e.length; ++a)
        s.push(Bt(e[a], t, r));
      return { a: s, id: o };
    }
    if (typeof e == "object") {
      const s = [], o = ++r.lastId;
      r.visited.set(e, o);
      for (const l of Object.keys(e)) {
        let c;
        try {
          c = e[l];
        } catch {
          continue;
        }
        l === "toJSON" && typeof c == "function" ? s.push({ k: l, v: { o: [], id: 0 } }) : s.push({ k: l, v: Bt(c, t, r) });
      }
      let a;
      try {
        s.length === 0 && e.toJSON && typeof e.toJSON == "function" && (a = { value: e.toJSON() });
      } catch {
      }
      return a ? Wn(a.value, t, r) : { o: s, id: o };
    }
  }
  var Ir = Math.pow(2, 31) - 1;
  var M = class extends Error {
  };
  function js(e, t) {
    let r;
    try {
      r = nn(e), r[r.length - 1] instanceof rt || r.push(new rt());
    } catch (g) {
      const C = g.message + ` while parsing css selector "${e}". Did you mean to CSS.escape it?`, N = (g.stack || "").indexOf(g.message);
      throw N !== -1 && (g.stack = g.stack.substring(0, N) + C + g.stack.substring(N + g.message.length)), g.message = C, g;
    }
    const n = r.find((g) => g instanceof mn || g instanceof sn || g instanceof tt || g instanceof gn || g instanceof on || g instanceof an || g instanceof cn || // TODO: Consider using these for something, e.g. to escape complex strings.
    // For example :xpath{ (//div/bar[@attr="foo"])[2]/baz }
    // Or this way :xpath( {complex-xpath-goes-here("hello")} )
    g instanceof hn || g instanceof fn || // TODO: Consider treating these as strings?
    g instanceof wn || g instanceof vn);
    if (n)
      throw new M(`Unsupported token "${n.toSource()}" while parsing css selector "${e}". Did you mean to CSS.escape it?`);
    let i = 0;
    const s = /* @__PURE__ */ new Set();
    function o() {
      return new M(`Unexpected token "${r[i].toSource()}" while parsing css selector "${e}". Did you mean to CSS.escape it?`);
    }
    function a() {
      for (; r[i] instanceof ft; )
        i++;
    }
    function l(g = i) {
      return r[g] instanceof Kt;
    }
    function c(g = i) {
      return r[g] instanceof Yt;
    }
    function u(g = i) {
      return r[g] instanceof bn;
    }
    function f(g = i) {
      return r[g] instanceof un;
    }
    function d(g = i) {
      return r[g] instanceof dn;
    }
    function b(g = i) {
      return r[g] instanceof Xt;
    }
    function h(g = i) {
      return r[g] instanceof Ce;
    }
    function x(g = i) {
      return r[g] instanceof F && r[g].value === "*";
    }
    function p(g = i) {
      return r[g] instanceof rt;
    }
    function w(g = i) {
      return r[g] instanceof F && [">", "+", "~"].includes(r[g].value);
    }
    function v(g = i) {
      return f(g) || b(g) || p(g) || w(g) || r[g] instanceof ft;
    }
    function T() {
      const g = [_()];
      for (; a(), !!f(); )
        i++, g.push(_());
      return g;
    }
    function _() {
      return a(), u() || c() ? r[i++].value : E();
    }
    function E() {
      const g = { simples: [] };
      for (a(), w() ? g.simples.push({ selector: { functions: [{ name: "scope", args: [] }] }, combinator: "" }) : g.simples.push({ selector: S(), combinator: "" }); ; ) {
        if (a(), w())
          g.simples[g.simples.length - 1].combinator = r[i++].value, a();
        else if (v())
          break;
        g.simples.push({ combinator: "", selector: S() });
      }
      return g;
    }
    function S() {
      let g = "";
      const C = [];
      for (; !v(); )
        if (l() || x())
          g += r[i++].toSource();
        else if (r[i] instanceof xn)
          g += r[i++].toSource();
        else if (r[i] instanceof F && r[i].value === ".")
          if (i++, l())
            g += "." + r[i++].toSource();
          else
            throw o();
        else if (r[i] instanceof ln)
          if (i++, l())
            if (!t.has(r[i].value.toLowerCase()))
              g += ":" + r[i++].toSource();
            else {
              const N = r[i++].value.toLowerCase();
              C.push({ name: N, args: [] }), s.add(N);
            }
          else if (h()) {
            const N = r[i++].value.toLowerCase();
            if (t.has(N) ? (C.push({ name: N, args: T() }), s.add(N)) : g += `:${N}(${A()})`, a(), !b())
              throw o();
            i++;
          } else
            throw o();
        else if (r[i] instanceof pn) {
          for (g += "[", i++; !(r[i] instanceof Dt) && !p(); )
            g += r[i++].toSource();
          if (!(r[i] instanceof Dt))
            throw o();
          g += "]", i++;
        } else
          throw o();
      if (!g && !C.length)
        throw o();
      return { css: g || void 0, functions: C };
    }
    function A() {
      let g = "", C = 1;
      for (; !p() && ((d() || h()) && C++, b() && C--, !!C); )
        g += r[i++].toSource();
      return g;
    }
    const k = T();
    if (!p())
      throw o();
    if (k.some((g) => typeof g != "object" || !("simples" in g)))
      throw new M(`Error while parsing css selector "${e}". Did you mean to CSS.escape it?`);
    return { selector: k, names: Array.from(s) };
  }
  var Ht = /* @__PURE__ */ new Set(["internal:has", "internal:has-not", "internal:and", "internal:or", "internal:chain", "left-of", "right-of", "above", "below", "near"]);
  var Us = /* @__PURE__ */ new Set(["left-of", "right-of", "above", "below", "near"]);
  var zn = /* @__PURE__ */ new Set(["not", "is", "where", "has", "scope", "light", "visible", "text", "text-matches", "text-is", "has-text", "above", "below", "right-of", "left-of", "near", "nth-match"]);
  function ae(e) {
    const t = Vs(e), r = [];
    for (const n of t.parts) {
      if (n.name === "css" || n.name === "css:light") {
        n.name === "css:light" && (n.body = ":light(" + n.body + ")");
        const i = js(n.body, zn);
        r.push({
          name: "css",
          body: i.selector,
          source: n.body
        });
        continue;
      }
      if (Ht.has(n.name)) {
        let i, s;
        try {
          const c = JSON.parse("[" + n.body + "]");
          if (!Array.isArray(c) || c.length < 1 || c.length > 2 || typeof c[0] != "string")
            throw new M(`Malformed selector: ${n.name}=` + n.body);
          if (i = c[0], c.length === 2) {
            if (typeof c[1] != "number" || !Us.has(n.name))
              throw new M(`Malformed selector: ${n.name}=` + n.body);
            s = c[1];
          }
        } catch {
          throw new M(`Malformed selector: ${n.name}=` + n.body);
        }
        const o = { name: n.name, source: n.body, body: { parsed: ae(i), distance: s } }, a = [...o.body.parsed.parts].reverse().find((c) => c.name === "internal:control" && c.body === "enter-frame"), l = a ? o.body.parsed.parts.indexOf(a) : -1;
        l !== -1 && zs(o.body.parsed.parts.slice(0, l + 1), r.slice(0, l + 1)) && o.body.parsed.parts.splice(0, l + 1), r.push(o);
        continue;
      }
      r.push({ ...n, source: n.body });
    }
    if (Ht.has(r[0].name))
      throw new M(`"${r[0].name}" selector cannot be first`);
    return {
      capture: t.capture,
      parts: r
    };
  }
  function zs(e, t) {
    return X({ parts: e }) === X({ parts: t });
  }
  function X(e, t) {
    return typeof e == "string" ? e : e.parts.map((r, n) => {
      let i = true;
      !t && n !== e.capture && (r.name === "css" || r.name === "xpath" && r.source.startsWith("//") || r.source.startsWith("..")) && (i = false);
      const s = i ? r.name + "=" : "";
      return `${n === e.capture ? "*" : ""}${s}${r.source}`;
    }).join(" >> ");
  }
  function Gs(e, t) {
    const r = (n, i) => {
      for (const s of n.parts)
        t(s, i), Ht.has(s.name) && r(s.body.parsed, true);
    };
    r(e, false);
  }
  function Vs(e) {
    let t = 0, r, n = 0;
    const i = { parts: [] }, s = () => {
      const a = e.substring(n, t).trim(), l = a.indexOf("=");
      let c, u;
      l !== -1 && a.substring(0, l).trim().match(/^[a-zA-Z_0-9-+:*]+$/) ? (c = a.substring(0, l).trim(), u = a.substring(l + 1)) : a.length > 1 && a[0] === '"' && a[a.length - 1] === '"' || a.length > 1 && a[0] === "'" && a[a.length - 1] === "'" ? (c = "text", u = a) : /^\(*\/\//.test(a) || a.startsWith("..") ? (c = "xpath", u = a) : (c = "css", u = a);
      let f = false;
      if (c[0] === "*" && (f = true, c = c.substring(1)), i.parts.push({ name: c, body: u }), f) {
        if (i.capture !== void 0)
          throw new M("Only one of the selectors can capture using * modifier");
        i.capture = i.parts.length - 1;
      }
    };
    if (!e.includes(">>"))
      return t = e.length, s(), i;
    const o = () => {
      const l = e.substring(n, t).match(/^\s*text\s*=(.*)$/);
      return !!l && !!l[1];
    };
    for (; t < e.length; ) {
      const a = e[t];
      a === "\\" && t + 1 < e.length ? t += 2 : a === r ? (r = void 0, t++) : !r && (a === '"' || a === "'" || a === "`") && !o() ? (r = a, t++) : !r && a === ">" && e[t + 1] === ">" ? (s(), t += 2, n = t) : t++;
    }
    return s(), i;
  }
  function Re(e, t) {
    let r = 0, n = e.length === 0;
    const i = () => e[r] || "", s = () => {
      const p = i();
      return ++r, n = r >= e.length, p;
    }, o = (p) => {
      throw n ? new M(`Unexpected end of selector while parsing selector \`${e}\``) : new M(`Error while parsing selector \`${e}\` - unexpected symbol "${i()}" at position ${r}` + (p ? " during " + p : ""));
    };
    function a() {
      for (; !n && /\s/.test(i()); )
        s();
    }
    function l(p) {
      return p >= "\x80" || p >= "0" && p <= "9" || p >= "A" && p <= "Z" || p >= "a" && p <= "z" || p >= "0" && p <= "9" || p === "_" || p === "-";
    }
    function c() {
      let p = "";
      for (a(); !n && l(i()); )
        p += s();
      return p;
    }
    function u(p) {
      let w = s();
      for (w !== p && o("parsing quoted string"); !n && i() !== p; )
        i() === "\\" && s(), w += s();
      return i() !== p && o("parsing quoted string"), w += s(), w;
    }
    function f() {
      s() !== "/" && o("parsing regular expression");
      let p = "", w = false;
      for (; !n; ) {
        if (i() === "\\")
          p += s(), n && o("parsing regular expression");
        else if (w && i() === "]")
          w = false;
        else if (!w && i() === "[")
          w = true;
        else if (!w && i() === "/")
          break;
        p += s();
      }
      s() !== "/" && o("parsing regular expression");
      let v = "";
      for (; !n && i().match(/[dgimsuy]/); )
        v += s();
      try {
        return new RegExp(p, v);
      } catch (T) {
        throw new M(`Error while parsing selector \`${e}\`: ${T.message}`);
      }
    }
    function d() {
      let p = "";
      return a(), i() === "'" || i() === '"' ? p = u(i()).slice(1, -1) : p = c(), p || o("parsing property path"), p;
    }
    function b() {
      a();
      let p = "";
      return n || (p += s()), !n && p !== "=" && (p += s()), ["=", "*=", "^=", "$=", "|=", "~="].includes(p) || o("parsing operator"), p;
    }
    function h() {
      s();
      const p = [];
      for (p.push(d()), a(); i() === "."; )
        s(), p.push(d()), a();
      if (i() === "]")
        return s(), { name: p.join("."), jsonPath: p, op: "<truthy>", value: null, caseSensitive: false };
      const w = b();
      let v, T = true;
      if (a(), i() === "/") {
        if (w !== "=")
          throw new M(`Error while parsing selector \`${e}\` - cannot use ${w} in attribute with regular expression`);
        v = f();
      } else if (i() === "'" || i() === '"')
        v = u(i()).slice(1, -1), a(), i() === "i" || i() === "I" ? (T = false, s()) : (i() === "s" || i() === "S") && (T = true, s());
      else {
        for (v = ""; !n && (l(i()) || i() === "+" || i() === "."); )
          v += s();
        v === "true" ? v = true : v === "false" ? v = false : t || (v = +v, Number.isNaN(v) && o("parsing attribute value"));
      }
      if (a(), i() !== "]" && o("parsing attribute value"), s(), w !== "=" && typeof v != "string")
        throw new M(`Error while parsing selector \`${e}\` - cannot use ${w} in attribute with non-string matching value - ${v}`);
      return { name: p.join("."), jsonPath: p, op: w, value: v, caseSensitive: T };
    }
    const x = {
      name: "",
      attributes: []
    };
    for (x.name = c(), a(); i() === "["; )
      x.attributes.push(h()), a();
    if (n || o(void 0), !x.name && !x.attributes.length)
      throw new M(`Error while parsing selector \`${e}\` - selector cannot be empty`);
    return x;
  }
  function pe(e, t, r = false) {
    return Vn(e, t, r, 1)[0];
  }
  function Vn(e, t, r = false, n = 20, i) {
    try {
      return oe(new Jn[e](i), ae(t), r, n);
    } catch {
      return [t];
    }
  }
  function oe(e, t, r = false, n = 20) {
    const i = [...t.parts], s = [];
    let o = r ? "frame-locator" : "page";
    for (let a = 0; a < i.length; a++) {
      const l = i[a], c = o;
      if (o = "locator", l.name === "internal:describe")
        continue;
      if (l.name === "nth") {
        l.body === "0" ? s.push([e.generateLocator(c, "first", ""), e.generateLocator(c, "nth", "0")]) : l.body === "-1" ? s.push([e.generateLocator(c, "last", ""), e.generateLocator(c, "nth", "-1")]) : s.push([e.generateLocator(c, "nth", l.body)]);
        continue;
      }
      if (l.name === "visible") {
        s.push([e.generateLocator(c, "visible", l.body), e.generateLocator(c, "default", `visible=${l.body}`)]);
        continue;
      }
      if (l.name === "internal:text") {
        const { exact: h, text: x } = ve(l.body);
        s.push([e.generateLocator(c, "text", x, { exact: h })]);
        continue;
      }
      if (l.name === "internal:has-text") {
        const { exact: h, text: x } = ve(l.body);
        if (!h) {
          s.push([e.generateLocator(c, "has-text", x, { exact: h })]);
          continue;
        }
      }
      if (l.name === "internal:has-not-text") {
        const { exact: h, text: x } = ve(l.body);
        if (!h) {
          s.push([e.generateLocator(c, "has-not-text", x, { exact: h })]);
          continue;
        }
      }
      if (l.name === "internal:has") {
        const h = oe(e, l.body.parsed, false, n);
        s.push(h.map((x) => e.generateLocator(c, "has", x)));
        continue;
      }
      if (l.name === "internal:has-not") {
        const h = oe(e, l.body.parsed, false, n);
        s.push(h.map((x) => e.generateLocator(c, "hasNot", x)));
        continue;
      }
      if (l.name === "internal:and") {
        const h = oe(e, l.body.parsed, false, n);
        s.push(h.map((x) => e.generateLocator(c, "and", x)));
        continue;
      }
      if (l.name === "internal:or") {
        const h = oe(e, l.body.parsed, false, n);
        s.push(h.map((x) => e.generateLocator(c, "or", x)));
        continue;
      }
      if (l.name === "internal:chain") {
        const h = oe(e, l.body.parsed, false, n);
        s.push(h.map((x) => e.generateLocator(c, "chain", x)));
        continue;
      }
      if (l.name === "internal:label") {
        const { exact: h, text: x } = ve(l.body);
        s.push([e.generateLocator(c, "label", x, { exact: h })]);
        continue;
      }
      if (l.name === "internal:role") {
        const h = Re(l.body, true), x = { attrs: [] };
        for (const p of h.attributes)
          p.name === "name" ? (x.exact = p.caseSensitive, x.name = p.value) : (p.name === "level" && typeof p.value == "string" && (p.value = +p.value), x.attrs.push({ name: p.name === "include-hidden" ? "includeHidden" : p.name, value: p.value }));
        s.push([e.generateLocator(c, "role", h.name, x)]);
        continue;
      }
      if (l.name === "internal:testid") {
        const h = Re(l.body, true), { value: x } = h.attributes[0];
        s.push([e.generateLocator(c, "test-id", x)]);
        continue;
      }
      if (l.name === "internal:attr") {
        const h = Re(l.body, true), { name: x, value: p, caseSensitive: w } = h.attributes[0], v = p, T = !!w;
        if (x === "placeholder") {
          s.push([e.generateLocator(c, "placeholder", v, { exact: T })]);
          continue;
        }
        if (x === "alt") {
          s.push([e.generateLocator(c, "alt", v, { exact: T })]);
          continue;
        }
        if (x === "title") {
          s.push([e.generateLocator(c, "title", v, { exact: T })]);
          continue;
        }
      }
      if (l.name === "internal:control" && l.body === "enter-frame") {
        const h = s[s.length - 1], x = i[a - 1], p = h.map((w) => e.chainLocators([w, e.generateLocator(c, "frame", "")]));
        ["xpath", "css"].includes(x.name) && p.push(
          e.generateLocator(c, "frame-locator", X({ parts: [x] })),
          e.generateLocator(c, "frame-locator", X({ parts: [x] }, true))
        ), h.splice(0, h.length, ...p), o = "frame-locator";
        continue;
      }
      const u = i[a + 1], f = X({ parts: [l] }), d = e.generateLocator(c, "default", f);
      if (u && ["internal:has-text", "internal:has-not-text"].includes(u.name)) {
        const { exact: h, text: x } = ve(u.body);
        if (!h) {
          const p = e.generateLocator("locator", u.name === "internal:has-text" ? "has-text" : "has-not-text", x, { exact: h }), w = {};
          u.name === "internal:has-text" ? w.hasText = x : w.hasNotText = x;
          const v = e.generateLocator(c, "default", f, w);
          s.push([e.chainLocators([d, p]), v]), a++;
          continue;
        }
      }
      let b;
      if (["xpath", "css"].includes(l.name)) {
        const h = X(
          { parts: [l] },
          /* forceEngineName */
          true
        );
        b = e.generateLocator(c, "default", h);
      }
      s.push([d, b].filter(Boolean));
    }
    return Js(e, s, n);
  }
  function Js(e, t, r) {
    const n = t.map(() => ""), i = [], s = (o) => {
      if (o === t.length)
        return i.push(e.chainLocators(n)), i.length < r;
      for (const a of t[o])
        if (n[o] = a, !s(o + 1))
          return false;
      return true;
    };
    return s(0), i;
  }
  function ve(e) {
    let t = false;
    const r = e.match(/^\/(.*)\/([igm]*)$/);
    return r ? { text: new RegExp(r[1], r[2]) } : (e.endsWith('"') ? (e = JSON.parse(e), t = true) : e.endsWith('"s') ? (e = JSON.parse(e.substring(0, e.length - 1)), t = true) : e.endsWith('"i') && (e = JSON.parse(e.substring(0, e.length - 1)), t = false), { exact: t, text: e });
  }
  var Qs = class {
    constructor(e) {
      this.preferredQuote = e;
    }
    generateLocator(e, t, r, n = {}) {
      switch (t) {
        case "default":
          return n.hasText !== void 0 ? `locator(${this.quote(r)}, { hasText: ${this.toHasText(n.hasText)} })` : n.hasNotText !== void 0 ? `locator(${this.quote(r)}, { hasNotText: ${this.toHasText(n.hasNotText)} })` : `locator(${this.quote(r)})`;
        case "frame-locator":
          return `frameLocator(${this.quote(r)})`;
        case "frame":
          return "contentFrame()";
        case "nth":
          return `nth(${r})`;
        case "first":
          return "first()";
        case "last":
          return "last()";
        case "visible":
          return `filter({ visible: ${r === "true" ? "true" : "false"} })`;
        case "role":
          const i = [];
          D(n.name) ? i.push(`name: ${this.regexToSourceString(n.name)}`) : typeof n.name == "string" && (i.push(`name: ${this.quote(n.name)}`), n.exact && i.push("exact: true"));
          for (const { name: o, value: a } of n.attrs)
            i.push(`${o}: ${typeof a == "string" ? this.quote(a) : a}`);
          const s = i.length ? `, { ${i.join(", ")} }` : "";
          return `getByRole(${this.quote(r)}${s})`;
        case "has-text":
          return `filter({ hasText: ${this.toHasText(r)} })`;
        case "has-not-text":
          return `filter({ hasNotText: ${this.toHasText(r)} })`;
        case "has":
          return `filter({ has: ${r} })`;
        case "hasNot":
          return `filter({ hasNot: ${r} })`;
        case "and":
          return `and(${r})`;
        case "or":
          return `or(${r})`;
        case "chain":
          return `locator(${r})`;
        case "test-id":
          return `getByTestId(${this.toTestIdValue(r)})`;
        case "text":
          return this.toCallWithExact("getByText", r, !!n.exact);
        case "alt":
          return this.toCallWithExact("getByAltText", r, !!n.exact);
        case "placeholder":
          return this.toCallWithExact("getByPlaceholder", r, !!n.exact);
        case "label":
          return this.toCallWithExact("getByLabel", r, !!n.exact);
        case "title":
          return this.toCallWithExact("getByTitle", r, !!n.exact);
        default:
          throw new Error("Unknown selector kind " + t);
      }
    }
    chainLocators(e) {
      return e.join(".");
    }
    regexToSourceString(e) {
      return Et(String(e));
    }
    toCallWithExact(e, t, r) {
      return D(t) ? `${e}(${this.regexToSourceString(t)})` : r ? `${e}(${this.quote(t)}, { exact: true })` : `${e}(${this.quote(t)})`;
    }
    toHasText(e) {
      return D(e) ? this.regexToSourceString(e) : this.quote(e);
    }
    toTestIdValue(e) {
      return D(e) ? this.regexToSourceString(e) : this.quote(e);
    }
    quote(e) {
      return De(e, this.preferredQuote ?? "'");
    }
  };
  var Xs = class {
    generateLocator(e, t, r, n = {}) {
      switch (t) {
        case "default":
          return n.hasText !== void 0 ? `locator(${this.quote(r)}, has_text=${this.toHasText(n.hasText)})` : n.hasNotText !== void 0 ? `locator(${this.quote(r)}, has_not_text=${this.toHasText(n.hasNotText)})` : `locator(${this.quote(r)})`;
        case "frame-locator":
          return `frame_locator(${this.quote(r)})`;
        case "frame":
          return "content_frame";
        case "nth":
          return `nth(${r})`;
        case "first":
          return "first";
        case "last":
          return "last";
        case "visible":
          return `filter(visible=${r === "true" ? "True" : "False"})`;
        case "role":
          const i = [];
          D(n.name) ? i.push(`name=${this.regexToString(n.name)}`) : typeof n.name == "string" && (i.push(`name=${this.quote(n.name)}`), n.exact && i.push("exact=True"));
          for (const { name: o, value: a } of n.attrs) {
            let l = typeof a == "string" ? this.quote(a) : a;
            typeof a == "boolean" && (l = a ? "True" : "False"), i.push(`${Jr(o)}=${l}`);
          }
          const s = i.length ? `, ${i.join(", ")}` : "";
          return `get_by_role(${this.quote(r)}${s})`;
        case "has-text":
          return `filter(has_text=${this.toHasText(r)})`;
        case "has-not-text":
          return `filter(has_not_text=${this.toHasText(r)})`;
        case "has":
          return `filter(has=${r})`;
        case "hasNot":
          return `filter(has_not=${r})`;
        case "and":
          return `and_(${r})`;
        case "or":
          return `or_(${r})`;
        case "chain":
          return `locator(${r})`;
        case "test-id":
          return `get_by_test_id(${this.toTestIdValue(r)})`;
        case "text":
          return this.toCallWithExact("get_by_text", r, !!n.exact);
        case "alt":
          return this.toCallWithExact("get_by_alt_text", r, !!n.exact);
        case "placeholder":
          return this.toCallWithExact("get_by_placeholder", r, !!n.exact);
        case "label":
          return this.toCallWithExact("get_by_label", r, !!n.exact);
        case "title":
          return this.toCallWithExact("get_by_title", r, !!n.exact);
        default:
          throw new Error("Unknown selector kind " + t);
      }
    }
    chainLocators(e) {
      return e.join(".");
    }
    regexToString(e) {
      const t = e.flags.includes("i") ? ", re.IGNORECASE" : "";
      return `re.compile(r"${Et(e.source).replace(/\\\//, "/").replace(/"/g, '\\"')}"${t})`;
    }
    toCallWithExact(e, t, r) {
      return D(t) ? `${e}(${this.regexToString(t)})` : r ? `${e}(${this.quote(t)}, exact=True)` : `${e}(${this.quote(t)})`;
    }
    toHasText(e) {
      return D(e) ? this.regexToString(e) : `${this.quote(e)}`;
    }
    toTestIdValue(e) {
      return D(e) ? this.regexToString(e) : this.quote(e);
    }
    quote(e) {
      return De(e, '"');
    }
  };
  var Ks = class {
    generateLocator(e, t, r, n = {}) {
      let i;
      switch (e) {
        case "page":
          i = "Page";
          break;
        case "frame-locator":
          i = "FrameLocator";
          break;
        case "locator":
          i = "Locator";
          break;
      }
      switch (t) {
        case "default":
          return n.hasText !== void 0 ? `locator(${this.quote(r)}, new ${i}.LocatorOptions().setHasText(${this.toHasText(n.hasText)}))` : n.hasNotText !== void 0 ? `locator(${this.quote(r)}, new ${i}.LocatorOptions().setHasNotText(${this.toHasText(n.hasNotText)}))` : `locator(${this.quote(r)})`;
        case "frame-locator":
          return `frameLocator(${this.quote(r)})`;
        case "frame":
          return "contentFrame()";
        case "nth":
          return `nth(${r})`;
        case "first":
          return "first()";
        case "last":
          return "last()";
        case "visible":
          return `filter(new ${i}.FilterOptions().setVisible(${r === "true" ? "true" : "false"}))`;
        case "role":
          const s = [];
          D(n.name) ? s.push(`.setName(${this.regexToString(n.name)})`) : typeof n.name == "string" && (s.push(`.setName(${this.quote(n.name)})`), n.exact && s.push(".setExact(true)"));
          for (const { name: a, value: l } of n.attrs)
            s.push(`.set${ot(a)}(${typeof l == "string" ? this.quote(l) : l})`);
          const o = s.length ? `, new ${i}.GetByRoleOptions()${s.join("")}` : "";
          return `getByRole(AriaRole.${Jr(r).toUpperCase()}${o})`;
        case "has-text":
          return `filter(new ${i}.FilterOptions().setHasText(${this.toHasText(r)}))`;
        case "has-not-text":
          return `filter(new ${i}.FilterOptions().setHasNotText(${this.toHasText(r)}))`;
        case "has":
          return `filter(new ${i}.FilterOptions().setHas(${r}))`;
        case "hasNot":
          return `filter(new ${i}.FilterOptions().setHasNot(${r}))`;
        case "and":
          return `and(${r})`;
        case "or":
          return `or(${r})`;
        case "chain":
          return `locator(${r})`;
        case "test-id":
          return `getByTestId(${this.toTestIdValue(r)})`;
        case "text":
          return this.toCallWithExact(i, "getByText", r, !!n.exact);
        case "alt":
          return this.toCallWithExact(i, "getByAltText", r, !!n.exact);
        case "placeholder":
          return this.toCallWithExact(i, "getByPlaceholder", r, !!n.exact);
        case "label":
          return this.toCallWithExact(i, "getByLabel", r, !!n.exact);
        case "title":
          return this.toCallWithExact(i, "getByTitle", r, !!n.exact);
        default:
          throw new Error("Unknown selector kind " + t);
      }
    }
    chainLocators(e) {
      return e.join(".");
    }
    regexToString(e) {
      const t = e.flags.includes("i") ? ", Pattern.CASE_INSENSITIVE" : "";
      return `Pattern.compile(${this.quote(Et(e.source))}${t})`;
    }
    toCallWithExact(e, t, r, n) {
      return D(r) ? `${t}(${this.regexToString(r)})` : n ? `${t}(${this.quote(r)}, new ${e}.${ot(t)}Options().setExact(true))` : `${t}(${this.quote(r)})`;
    }
    toHasText(e) {
      return D(e) ? this.regexToString(e) : this.quote(e);
    }
    toTestIdValue(e) {
      return D(e) ? this.regexToString(e) : this.quote(e);
    }
    quote(e) {
      return De(e, '"');
    }
  };
  var Ys = class {
    generateLocator(e, t, r, n = {}) {
      switch (t) {
        case "default":
          return n.hasText !== void 0 ? `Locator(${this.quote(r)}, new() { ${this.toHasText(n.hasText)} })` : n.hasNotText !== void 0 ? `Locator(${this.quote(r)}, new() { ${this.toHasNotText(n.hasNotText)} })` : `Locator(${this.quote(r)})`;
        case "frame-locator":
          return `FrameLocator(${this.quote(r)})`;
        case "frame":
          return "ContentFrame";
        case "nth":
          return `Nth(${r})`;
        case "first":
          return "First";
        case "last":
          return "Last";
        case "visible":
          return `Filter(new() { Visible = ${r === "true" ? "true" : "false"} })`;
        case "role":
          const i = [];
          D(n.name) ? i.push(`NameRegex = ${this.regexToString(n.name)}`) : typeof n.name == "string" && (i.push(`Name = ${this.quote(n.name)}`), n.exact && i.push("Exact = true"));
          for (const { name: o, value: a } of n.attrs)
            i.push(`${ot(o)} = ${typeof a == "string" ? this.quote(a) : a}`);
          const s = i.length ? `, new() { ${i.join(", ")} }` : "";
          return `GetByRole(AriaRole.${ot(r)}${s})`;
        case "has-text":
          return `Filter(new() { ${this.toHasText(r)} })`;
        case "has-not-text":
          return `Filter(new() { ${this.toHasNotText(r)} })`;
        case "has":
          return `Filter(new() { Has = ${r} })`;
        case "hasNot":
          return `Filter(new() { HasNot = ${r} })`;
        case "and":
          return `And(${r})`;
        case "or":
          return `Or(${r})`;
        case "chain":
          return `Locator(${r})`;
        case "test-id":
          return `GetByTestId(${this.toTestIdValue(r)})`;
        case "text":
          return this.toCallWithExact("GetByText", r, !!n.exact);
        case "alt":
          return this.toCallWithExact("GetByAltText", r, !!n.exact);
        case "placeholder":
          return this.toCallWithExact("GetByPlaceholder", r, !!n.exact);
        case "label":
          return this.toCallWithExact("GetByLabel", r, !!n.exact);
        case "title":
          return this.toCallWithExact("GetByTitle", r, !!n.exact);
        default:
          throw new Error("Unknown selector kind " + t);
      }
    }
    chainLocators(e) {
      return e.join(".");
    }
    regexToString(e) {
      const t = e.flags.includes("i") ? ", RegexOptions.IgnoreCase" : "";
      return `new Regex(${this.quote(Et(e.source))}${t})`;
    }
    toCallWithExact(e, t, r) {
      return D(t) ? `${e}(${this.regexToString(t)})` : r ? `${e}(${this.quote(t)}, new() { Exact = true })` : `${e}(${this.quote(t)})`;
    }
    toHasText(e) {
      return D(e) ? `HasTextRegex = ${this.regexToString(e)}` : `HasText = ${this.quote(e)}`;
    }
    toTestIdValue(e) {
      return D(e) ? this.regexToString(e) : this.quote(e);
    }
    toHasNotText(e) {
      return D(e) ? `HasNotTextRegex = ${this.regexToString(e)}` : `HasNotText = ${this.quote(e)}`;
    }
    quote(e) {
      return De(e, '"');
    }
  };
  var Zs = class {
    generateLocator(e, t, r, n = {}) {
      return JSON.stringify({
        kind: t,
        body: r,
        options: n
      });
    }
    chainLocators(e) {
      const t = e.map((r) => JSON.parse(r));
      for (let r = 0; r < t.length - 1; ++r)
        t[r].next = t[r + 1];
      return JSON.stringify(t[0]);
    }
  };
  var Jn = {
    javascript: Qs,
    python: Xs,
    java: Ks,
    csharp: Ys,
    jsonl: Zs
  };
  function D(e) {
    return e instanceof RegExp;
  }
  function cr(e, t, r) {
    return `internal:attr=[${e}=${j(t, r?.exact || false)}]`;
  }
  function eo(e, t) {
    return `internal:testid=[${e}=${j(t, true)}]`;
  }
  function to(e, t) {
    return "internal:label=" + z(e, !!t?.exact);
  }
  function ro(e, t) {
    return cr("alt", e, t);
  }
  function no(e, t) {
    return cr("title", e, t);
  }
  function io(e, t) {
    return cr("placeholder", e, t);
  }
  function so(e, t) {
    return "internal:text=" + z(e, !!t?.exact);
  }
  function oo(e, t = {}) {
    const r = [];
    return t.checked !== void 0 && r.push(["checked", String(t.checked)]), t.disabled !== void 0 && r.push(["disabled", String(t.disabled)]), t.selected !== void 0 && r.push(["selected", String(t.selected)]), t.expanded !== void 0 && r.push(["expanded", String(t.expanded)]), t.includeHidden !== void 0 && r.push(["include-hidden", String(t.includeHidden)]), t.level !== void 0 && r.push(["level", String(t.level)]), t.name !== void 0 && r.push(["name", j(t.name, !!t.exact)]), t.pressed !== void 0 && r.push(["pressed", String(t.pressed)]), `internal:role=${e}${r.map(([n, i]) => `[${n}=${i}]`).join("")}`;
  }
  var ye = /* @__PURE__ */ Symbol("selector");
  var ao = class Te {
    constructor(t, r, n) {
      if (n?.hasText && (r += ` >> internal:has-text=${z(n.hasText, false)}`), n?.hasNotText && (r += ` >> internal:has-not-text=${z(n.hasNotText, false)}`), n?.has && (r += " >> internal:has=" + JSON.stringify(n.has[ye])), n?.hasNot && (r += " >> internal:has-not=" + JSON.stringify(n.hasNot[ye])), n?.visible !== void 0 && (r += ` >> visible=${n.visible ? "true" : "false"}`), this[ye] = r, r) {
        const o = t.parseSelector(r);
        this.element = t.querySelector(o, t.document, false), this.elements = t.querySelectorAll(o, t.document);
      }
      const i = r, s = this;
      s.locator = (o, a) => new Te(t, i ? i + " >> " + o : o, a), s.getByTestId = (o) => s.locator(eo(t.testIdAttributeNameForStrictErrorAndConsoleCodegen(), o)), s.getByAltText = (o, a) => s.locator(ro(o, a)), s.getByLabel = (o, a) => s.locator(to(o, a)), s.getByPlaceholder = (o, a) => s.locator(io(o, a)), s.getByText = (o, a) => s.locator(so(o, a)), s.getByTitle = (o, a) => s.locator(no(o, a)), s.getByRole = (o, a = {}) => s.locator(oo(o, a)), s.filter = (o) => new Te(t, r, o), s.first = () => s.locator("nth=0"), s.last = () => s.locator("nth=-1"), s.nth = (o) => s.locator(`nth=${o}`), s.and = (o) => new Te(t, i + " >> internal:and=" + JSON.stringify(o[ye])), s.or = (o) => new Te(t, i + " >> internal:or=" + JSON.stringify(o[ye]));
    }
  };
  var lo = ao;
  var co = class {
    constructor(e) {
      this._injectedScript = e;
    }
    install() {
      this._injectedScript.window.playwright || (this._injectedScript.window.playwright = {
        $: (e, t) => this._querySelector(e, !!t),
        $$: (e) => this._querySelectorAll(e),
        inspect: (e) => this._inspect(e),
        selector: (e) => this._selector(e),
        generateLocator: (e, t) => this._generateLocator(e, t),
        ariaSnapshot: (e, t) => this._injectedScript.ariaSnapshot(e || this._injectedScript.document.body, t || { mode: "default" }),
        resume: () => this._resume(),
        ...new lo(this._injectedScript, "")
      }, delete this._injectedScript.window.playwright.filter, delete this._injectedScript.window.playwright.first, delete this._injectedScript.window.playwright.last, delete this._injectedScript.window.playwright.nth, delete this._injectedScript.window.playwright.and, delete this._injectedScript.window.playwright.or);
    }
    _querySelector(e, t) {
      if (typeof e != "string")
        throw new Error("Usage: playwright.query('Playwright >> selector').");
      const r = this._injectedScript.parseSelector(e);
      return this._injectedScript.querySelector(r, this._injectedScript.document, t);
    }
    _querySelectorAll(e) {
      if (typeof e != "string")
        throw new Error("Usage: playwright.$$('Playwright >> selector').");
      const t = this._injectedScript.parseSelector(e);
      return this._injectedScript.querySelectorAll(t, this._injectedScript.document);
    }
    _inspect(e) {
      if (typeof e != "string")
        throw new Error("Usage: playwright.inspect('Playwright >> selector').");
      this._injectedScript.window.inspect(this._querySelector(e, false));
    }
    _selector(e) {
      if (!(e instanceof Element))
        throw new Error("Usage: playwright.selector(element).");
      return this._injectedScript.generateSelectorSimple(e);
    }
    _generateLocator(e, t) {
      if (!(e instanceof Element))
        throw new Error("Usage: playwright.locator(element).");
      const r = this._injectedScript.generateSelectorSimple(e);
      return pe(t || "javascript", r);
    }
    _resume() {
      if (!this._injectedScript.window.__pw_resume)
        return false;
      this._injectedScript.window.__pw_resume().catch(() => {
      });
    }
  };
  var Nr = `:host{font-size:13px;font-family:system-ui,Ubuntu,Droid Sans,sans-serif;color:#333}svg{position:absolute;height:0}x-pw-tooltip{backdrop-filter:blur(5px);background-color:#fff;border-radius:6px;box-shadow:0 .5rem 1.2rem #0000004d;display:none;font-size:12.8px;font-weight:400;left:0;line-height:1.5;max-width:600px;position:absolute;top:0;padding:0;flex-direction:column;overflow:hidden}x-pw-tooltip-line{display:flex;max-width:600px;padding:6px;user-select:none;cursor:pointer}x-pw-tooltip-footer{display:flex;max-width:600px;padding:6px;user-select:none;color:#777}x-pw-dialog{background-color:#fff;pointer-events:auto;border-radius:6px;box-shadow:0 .5rem 1.2rem #0000004d;display:flex;flex-direction:column;position:absolute;z-index:10;font-size:13px}x-pw-dialog:not(.autosize){width:400px;height:150px}x-pw-dialog-body{display:flex;flex-direction:column;flex:auto}x-pw-dialog-body label{margin:5px 8px;display:flex;flex-direction:row;align-items:center}x-pw-highlight{position:absolute;top:0;left:0;width:0;height:0}x-pw-action-point{position:absolute;width:20px;height:20px;background:red;border-radius:10px;margin:-10px 0 0 -10px;z-index:2}x-pw-title{position:absolute;backdrop-filter:blur(5px);background-color:#00000080;color:#fff;border-radius:6px;padding:6px;font-size:24px;line-height:1.4;white-space:nowrap;user-select:none;z-index:3}x-pw-user-overlays,x-pw-user-overlay{position:absolute;inset:0}@keyframes pw-fade-out{0%{opacity:1}to{opacity:0}}x-pw-separator{height:1px;margin:6px 9px;background:#949494e5}x-pw-tool-gripper{height:28px;width:24px;margin:2px 0;cursor:grab}x-pw-tool-gripper:active{cursor:grabbing}x-pw-tool-gripper>x-div{width:16px;height:16px;margin:6px 4px;clip-path:url(#icon-gripper);background-color:#555}x-pw-tools-list>label{display:flex;align-items:center;margin:0 10px;user-select:none}x-pw-tools-list{display:flex;width:100%;border-bottom:1px solid #dddddd}x-pw-tool-item{pointer-events:auto;height:28px;width:28px;border-radius:3px}x-pw-tool-item:not(.disabled){cursor:pointer}x-pw-tool-item:not(.disabled):hover{background-color:#dbdbdb}x-pw-tool-item.toggled{background-color:#8acae480}x-pw-tool-item.toggled:not(.disabled):hover{background-color:#8acae4c4}x-pw-tool-item>x-div{width:16px;height:16px;margin:6px;background-color:#3a3a3a}x-pw-tool-item.disabled>x-div{background-color:#61616180;cursor:default}x-pw-tool-item.record.toggled{background-color:transparent}x-pw-tool-item.record.toggled:not(.disabled):hover{background-color:#dbdbdb}x-pw-tool-item.record.toggled>x-div{background-color:#a1260d}x-pw-tool-item.record.disabled.toggled>x-div{opacity:.8}x-pw-tool-item.accept>x-div{background-color:#388a34}x-pw-tool-item.record>x-div{clip-path:url(#icon-circle-large-filled)}x-pw-tool-item.record.toggled>x-div{clip-path:url(#icon-stop-circle)}x-pw-tool-item.pick-locator>x-div{clip-path:url(#icon-inspect)}x-pw-tool-item.text>x-div{clip-path:url(#icon-whole-word)}x-pw-tool-item.visibility>x-div{clip-path:url(#icon-eye)}x-pw-tool-item.value>x-div{clip-path:url(#icon-symbol-constant)}x-pw-tool-item.snapshot>x-div{clip-path:url(#icon-gist)}x-pw-tool-item.accept>x-div{clip-path:url(#icon-check)}x-pw-tool-item.cancel>x-div{clip-path:url(#icon-close)}x-pw-tool-item.succeeded>x-div{clip-path:url(#icon-pass);background-color:#388a34!important}x-pw-overlay{position:absolute;top:0;max-width:min-content;z-index:2147483647;background:transparent;pointer-events:auto}x-pw-overlay x-pw-tools-list{background-color:#fffd;box-shadow:#0000001a 0 5px 5px;border-radius:3px;border-bottom:none}x-pw-overlay x-pw-tool-item{margin:2px}textarea.text-editor{font-family:system-ui,Ubuntu,Droid Sans,sans-serif;flex:auto;border:none;margin:6px 10px;color:#333;outline:1px solid transparent!important;resize:none;padding:0;font-size:13px}textarea.text-editor.does-not-match{outline:1px solid red!important}x-div{display:block}x-spacer{flex:auto}*{box-sizing:border-box}*[hidden]{display:none!important}x-locator-editor{flex:none;width:100%;height:60px;padding:4px;border-bottom:1px solid #dddddd;outline:1px solid transparent}x-locator-editor.does-not-match{outline:1px solid red}.CodeMirror{width:100%!important;height:100%!important}x-pw-action-list{flex:auto;display:flex;flex-direction:column;user-select:none}x-pw-action-item{padding:6px 10px;cursor:pointer;overflow:hidden}x-pw-action-item:hover{background-color:#f2f2f2}x-pw-action-item:last-child{border-bottom-left-radius:6px;border-bottom-right-radius:6px}
`;
  var Je = class {
    constructor(e) {
      this._renderedEntries = [], this._userOverlays = /* @__PURE__ */ new Map(), this._userOverlayHidden = false, this._language = "javascript", this._injectedScript = e;
      const t = e.document;
      if (this._isUnderTest = e.isUnderTest, this._glassPaneElement = t.createElement("x-pw-glass"), this._glassPaneElement.setAttribute("popover", "manual"), this._glassPaneElement.style.inset = "0", this._glassPaneElement.style.width = "100%", this._glassPaneElement.style.height = "100%", this._glassPaneElement.style.maxWidth = "none", this._glassPaneElement.style.maxHeight = "none", this._glassPaneElement.style.padding = "0", this._glassPaneElement.style.margin = "0", this._glassPaneElement.style.border = "none", this._glassPaneElement.style.overflow = "visible", this._glassPaneElement.style.pointerEvents = "none", this._glassPaneElement.style.display = "flex", this._glassPaneElement.style.backgroundColor = "transparent", this._actionPointElement = t.createElement("x-pw-action-point"), this._actionPointElement.setAttribute("hidden", "true"), this._titleElement = t.createElement("x-pw-title"), this._titleElement.setAttribute("hidden", "true"), this._userOverlayContainer = t.createElement("x-pw-user-overlays"), this._userOverlayContainer.setAttribute("hidden", "true"), this._glassPaneShadow = this._glassPaneElement.attachShadow({ mode: this._isUnderTest ? "open" : "closed" }), typeof this._glassPaneShadow.adoptedStyleSheets.push == "function") {
        const r = new this._injectedScript.window.CSSStyleSheet();
        r.replaceSync(Nr), this._glassPaneShadow.adoptedStyleSheets.push(r);
      } else {
        const r = this._injectedScript.document.createElement("style");
        r.textContent = Nr, this._glassPaneShadow.appendChild(r);
      }
      this._glassPaneShadow.appendChild(this._actionPointElement), this._glassPaneShadow.appendChild(this._titleElement), this._glassPaneShadow.appendChild(this._userOverlayContainer);
    }
    install() {
      this._injectedScript.document.documentElement && ((!this._injectedScript.document.documentElement.contains(this._glassPaneElement) || this._glassPaneElement.nextElementSibling) && this._injectedScript.document.documentElement.appendChild(this._glassPaneElement), this._bringToFront());
    }
    _bringToFront() {
      this._glassPaneElement.hidePopover(), this._glassPaneElement.showPopover();
    }
    setLanguage(e) {
      this._language = e;
    }
    runHighlightOnRaf(e) {
      this._rafRequest && this._injectedScript.utils.builtins.cancelAnimationFrame(this._rafRequest);
      const t = this._injectedScript.querySelectorAll(e, this._injectedScript.document.documentElement), r = pe(this._language, X(e)), n = t.length > 1 ? "#f6b26b7f" : "#6fa8dc7f";
      this.updateHighlight(t.map((i, s) => {
        const o = t.length > 1 ? ` [${s + 1} of ${t.length}]` : "";
        return { element: i, color: n, tooltipText: r + o };
      })), this._rafRequest = this._injectedScript.utils.builtins.requestAnimationFrame(() => this.runHighlightOnRaf(e));
    }
    uninstall() {
      this._rafRequest && this._injectedScript.utils.builtins.cancelAnimationFrame(this._rafRequest), this._glassPaneElement.remove();
    }
    showActionPoint(e, t, r) {
      this._actionPointElement.style.top = t + "px", this._actionPointElement.style.left = e + "px", this._actionPointElement.hidden = false, r ? this._actionPointElement.style.animation = `pw-fade-out ${r}ms ease-out forwards` : this._actionPointElement.style.animation = "";
    }
    hideActionPoint() {
      this._actionPointElement.hidden = true;
    }
    showActionTitle(e, t, r, n) {
      if (this._titleElement.textContent = e, this._titleElement.hidden = false, t) {
        const i = t / 4;
        this._titleElement.style.animation = `pw-fade-out ${i}ms ease-out ${t - i}ms forwards`;
      } else
        this._titleElement.style.animation = "";
      switch (this._titleElement.style.top = "", this._titleElement.style.bottom = "", this._titleElement.style.left = "", this._titleElement.style.right = "", this._titleElement.style.transform = "", r) {
        case "top-left":
          this._titleElement.style.top = "6px", this._titleElement.style.left = "6px";
          break;
        case "top":
          this._titleElement.style.top = "6px", this._titleElement.style.left = "50%", this._titleElement.style.transform = "translateX(-50%)";
          break;
        case "bottom-left":
          this._titleElement.style.bottom = "6px", this._titleElement.style.left = "6px";
          break;
        case "bottom":
          this._titleElement.style.bottom = "6px", this._titleElement.style.left = "50%", this._titleElement.style.transform = "translateX(-50%)";
          break;
        case "bottom-right":
          this._titleElement.style.bottom = "6px", this._titleElement.style.right = "6px";
          break;
        default:
          this._titleElement.style.top = "6px", this._titleElement.style.right = "6px";
          break;
      }
      n && (this._titleElement.style.fontSize = n + "px");
    }
    hideActionTitle() {
      this._titleElement.hidden = true;
    }
    addUserOverlay(e, t) {
      const r = this._injectedScript.document.createElement("div");
      r.className = "x-pw-user-overlay", r.innerHTML = t;
      for (const n of r.querySelectorAll("script"))
        n.remove();
      for (const n of r.querySelectorAll("*"))
        for (const i of [...n.attributes])
          i.name.startsWith("on") && n.removeAttribute(i.name);
      return this._userOverlays.set(e, r), this._userOverlayContainer.appendChild(r), this._userOverlayContainer.hidden = this._userOverlayHidden, e;
    }
    getUserOverlay(e) {
      return this._userOverlays.get(e);
    }
    removeUserOverlay(e) {
      const t = this._userOverlays.get(e);
      t && (t.remove(), this._userOverlays.delete(e)), this._userOverlays.size === 0 && (this._userOverlayContainer.hidden = true);
    }
    setUserOverlaysVisible(e) {
      this._userOverlayHidden = !e, this._userOverlayContainer.hidden = !e || this._userOverlays.size === 0;
    }
    clearHighlight() {
      for (const e of this._renderedEntries)
        e.highlightElement?.remove(), e.tooltipElement?.remove();
      this._renderedEntries = [];
    }
    maskElements(e, t) {
      this.updateHighlight(e.map((r) => ({ element: r, color: t })));
    }
    updateHighlight(e) {
      if (!this._highlightIsUpToDate(e)) {
        this.clearHighlight();
        for (const t of e) {
          const r = this._createHighlightElement();
          this._glassPaneShadow.appendChild(r);
          let n;
          if (t.tooltipText) {
            n = this._injectedScript.document.createElement("x-pw-tooltip"), this._glassPaneShadow.appendChild(n), n.style.top = "0", n.style.left = "0", n.style.display = "flex";
            const i = this._injectedScript.document.createElement("x-pw-tooltip-line");
            i.textContent = t.tooltipText, n.appendChild(i);
          }
          this._renderedEntries.push({ targetElement: t.element, box: $r(t.box), color: t.color, borderColor: t.borderColor, fadeDuration: t.fadeDuration, cssStyle: t.cssStyle, tooltipElement: n, highlightElement: r });
        }
        for (const t of this._renderedEntries) {
          if (!t.box && !t.targetElement || (t.box = t.box || t.targetElement.getBoundingClientRect(), !t.tooltipElement))
            continue;
          const { anchorLeft: r, anchorTop: n } = this.tooltipPosition(t.box, t.tooltipElement);
          t.tooltipTop = n, t.tooltipLeft = r;
        }
        for (const t of this._renderedEntries) {
          t.tooltipElement && (t.tooltipElement.style.top = t.tooltipTop + "px", t.tooltipElement.style.left = t.tooltipLeft + "px");
          const r = t.box;
          t.highlightElement.style.backgroundColor = t.color, t.highlightElement.style.left = r.x + "px", t.highlightElement.style.top = r.y + "px", t.highlightElement.style.width = r.width + "px", t.highlightElement.style.height = r.height + "px", t.highlightElement.style.display = "block", t.borderColor && (t.highlightElement.style.border = "2px solid " + t.borderColor), t.fadeDuration && (t.highlightElement.style.animation = `pw-fade-out ${t.fadeDuration}ms ease-out forwards`), t.cssStyle && (t.highlightElement.style.cssText += ";" + t.cssStyle), this._isUnderTest && console.error("Highlight box for test: " + JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }));
        }
      }
    }
    firstBox() {
      return this._renderedEntries[0]?.box;
    }
    firstTooltipBox() {
      const e = this._renderedEntries[0];
      if (!(!e || !e.tooltipElement || e.tooltipLeft === void 0 || e.tooltipTop === void 0))
        return {
          x: e.tooltipLeft,
          y: e.tooltipTop,
          left: e.tooltipLeft,
          top: e.tooltipTop,
          width: e.tooltipElement.offsetWidth,
          height: e.tooltipElement.offsetHeight,
          bottom: e.tooltipTop + e.tooltipElement.offsetHeight,
          right: e.tooltipLeft + e.tooltipElement.offsetWidth,
          toJSON: () => {
          }
        };
    }
    // Note: there is a copy of this method in dialog.tsx. Please fix bugs in both places.
    tooltipPosition(e, t) {
      const r = t.offsetWidth, n = t.offsetHeight, i = this._glassPaneElement.offsetWidth, s = this._glassPaneElement.offsetHeight;
      let o = Math.max(5, e.left);
      o + r > i - 5 && (o = i - r - 5);
      let a = Math.max(0, e.bottom) + 5;
      return a + n > s - 5 && (Math.max(0, e.top) > n + 5 ? a = Math.max(0, e.top) - n - 5 : a = s - 5 - n), { anchorLeft: o, anchorTop: a };
    }
    _highlightIsUpToDate(e) {
      if (e.length !== this._renderedEntries.length)
        return false;
      for (let t = 0; t < this._renderedEntries.length; ++t) {
        if (e[t].element !== this._renderedEntries[t].targetElement || e[t].color !== this._renderedEntries[t].color)
          return false;
        const r = this._renderedEntries[t].box;
        if (!r)
          return false;
        const n = e[t].box ? $r(e[t].box) : e[t].element.getBoundingClientRect();
        if (n.top !== r.top || n.right !== r.right || n.bottom !== r.bottom || n.left !== r.left)
          return false;
      }
      return true;
    }
    _createHighlightElement() {
      return this._injectedScript.document.createElement("x-pw-highlight");
    }
    appendChild(e) {
      this._glassPaneShadow.appendChild(e);
    }
    onGlassPaneClick(e) {
      this._glassPaneElement.style.pointerEvents = "auto", this._glassPaneElement.style.backgroundColor = "rgba(0, 0, 0, 0.3)", this._glassPaneElement.addEventListener("click", e);
    }
    offGlassPaneClick(e) {
      this._glassPaneElement.style.pointerEvents = "none", this._glassPaneElement.style.backgroundColor = "transparent", this._glassPaneElement.removeEventListener("click", e);
    }
  };
  function $r(e) {
    if (e)
      return new DOMRect(e.x, e.y, e.width, e.height);
  }
  function uo(e, t, r) {
    const n = e.left - t.right;
    if (!(n < 0 || r !== void 0 && n > r))
      return n + Math.max(t.bottom - e.bottom, 0) + Math.max(e.top - t.top, 0);
  }
  function ho(e, t, r) {
    const n = t.left - e.right;
    if (!(n < 0 || r !== void 0 && n > r))
      return n + Math.max(t.bottom - e.bottom, 0) + Math.max(e.top - t.top, 0);
  }
  function fo(e, t, r) {
    const n = t.top - e.bottom;
    if (!(n < 0 || r !== void 0 && n > r))
      return n + Math.max(e.left - t.left, 0) + Math.max(t.right - e.right, 0);
  }
  function po(e, t, r) {
    const n = e.top - t.bottom;
    if (!(n < 0 || r !== void 0 && n > r))
      return n + Math.max(e.left - t.left, 0) + Math.max(t.right - e.right, 0);
  }
  function go(e, t, r) {
    const n = r === void 0 ? 50 : r;
    let i = 0;
    return e.left - t.right >= 0 && (i += e.left - t.right), t.left - e.right >= 0 && (i += t.left - e.right), t.top - e.bottom >= 0 && (i += t.top - e.bottom), e.top - t.bottom >= 0 && (i += e.top - t.bottom), i > n ? void 0 : i;
  }
  var mo = ["left-of", "right-of", "above", "below", "near"];
  function Qn(e, t, r, n) {
    const i = t.getBoundingClientRect(), s = { "left-of": ho, "right-of": uo, above: fo, below: po, near: go }[e];
    let o;
    for (const a of r) {
      if (a === t)
        continue;
      const l = s(i, a.getBoundingClientRect(), n);
      l !== void 0 && (o === void 0 || l < o) && (o = l);
    }
    return o;
  }
  function Xn(e, t) {
    const r = typeof e == "string" && !t.caseSensitive ? e.toUpperCase() : e, n = typeof t.value == "string" && !t.caseSensitive ? t.value.toUpperCase() : t.value;
    return t.op === "<truthy>" ? !!r : t.op === "=" ? n instanceof RegExp ? typeof r == "string" && !!r.match(n) : r === n : typeof r != "string" || typeof n != "string" ? false : t.op === "*=" ? r.includes(n) : t.op === "^=" ? r.startsWith(n) : t.op === "$=" ? r.endsWith(n) : t.op === "|=" ? r === n || r.startsWith(n + "-") : t.op === "~=" ? r.split(" ").includes(n) : false;
  }
  function ur(e) {
    const t = e.ownerDocument;
    return e.nodeName === "SCRIPT" || e.nodeName === "NOSCRIPT" || e.nodeName === "STYLE" || t.head && t.head.contains(e);
  }
  function G(e, t) {
    let r = e.get(t);
    if (r === void 0) {
      if (r = { full: "", normalized: "", immediate: [] }, !ur(t)) {
        let n = "";
        if (t instanceof HTMLInputElement && (t.type === "submit" || t.type === "button"))
          r = { full: t.value, normalized: W(t.value), immediate: [t.value] };
        else {
          for (let i = t.firstChild; i; i = i.nextSibling)
            if (i.nodeType === Node.TEXT_NODE)
              r.full += i.nodeValue || "", n += i.nodeValue || "";
            else {
              if (i.nodeType === Node.COMMENT_NODE)
                continue;
              n && r.immediate.push(n), n = "", i.nodeType === Node.ELEMENT_NODE && (r.full += G(e, i).full);
            }
          n && r.immediate.push(n), t.shadowRoot && (r.full += G(e, t.shadowRoot).full), r.full && (r.normalized = W(r.full));
        }
      }
      e.set(t, r);
    }
    return r;
  }
  function kt(e, t, r) {
    if (ur(t) || !r(G(e, t)))
      return "none";
    for (let n = t.firstChild; n; n = n.nextSibling)
      if (n.nodeType === Node.ELEMENT_NODE && r(G(e, n)))
        return "selfAndChildren";
    return t.shadowRoot && r(G(e, t.shadowRoot)) ? "selfAndChildren" : "self";
  }
  function Kn(e, t) {
    const r = Cn(t);
    if (r)
      return r.map((s) => G(e, s));
    const n = t.getAttribute("aria-label");
    if (n !== null && n.trim())
      return [{ full: n, normalized: W(n), immediate: [n] }];
    const i = t.nodeName === "INPUT" && t.type !== "hidden";
    if (["BUTTON", "METER", "OUTPUT", "PROGRESS", "SELECT", "TEXTAREA"].includes(t.nodeName) || i) {
      const s = t.labels;
      if (s)
        return [...s].map((o) => G(e, o));
    }
    return [];
  }
  var Yn = ["selected", "checked", "pressed", "expanded", "level", "disabled", "name", "include-hidden"];
  Yn.sort();
  function Se(e, t, r) {
    if (!t.includes(r))
      throw new Error(`"${e}" attribute is only supported for roles: ${t.slice().sort().map((n) => `"${n}"`).join(", ")}`);
  }
  function ce(e, t) {
    if (e.op !== "<truthy>" && !t.includes(e.value))
      throw new Error(`"${e.name}" must be one of ${t.map((r) => JSON.stringify(r)).join(", ")}`);
  }
  function ue(e, t) {
    if (!t.includes(e.op))
      throw new Error(`"${e.name}" does not support "${e.op}" matcher`);
  }
  function xo(e, t) {
    const r = { role: t };
    for (const n of e)
      switch (n.name) {
        case "checked": {
          Se(n.name, tr, t), ce(n, [true, false, "mixed"]), ue(n, ["<truthy>", "="]), r.checked = n.op === "<truthy>" ? true : n.value;
          break;
        }
        case "pressed": {
          Se(n.name, nr, t), ce(n, [true, false, "mixed"]), ue(n, ["<truthy>", "="]), r.pressed = n.op === "<truthy>" ? true : n.value;
          break;
        }
        case "selected": {
          Se(n.name, er, t), ce(n, [true, false]), ue(n, ["<truthy>", "="]), r.selected = n.op === "<truthy>" ? true : n.value;
          break;
        }
        case "expanded": {
          Se(n.name, ir, t), ce(n, [true, false]), ue(n, ["<truthy>", "="]), r.expanded = n.op === "<truthy>" ? true : n.value;
          break;
        }
        case "level": {
          if (Se(n.name, sr, t), typeof n.value == "string" && (n.value = +n.value), n.op !== "=" || typeof n.value != "number" || Number.isNaN(n.value))
            throw new Error('"level" attribute must be compared to a number');
          r.level = n.value;
          break;
        }
        case "disabled": {
          ce(n, [true, false]), ue(n, ["<truthy>", "="]), r.disabled = n.op === "<truthy>" ? true : n.value;
          break;
        }
        case "name": {
          if (n.op === "<truthy>")
            throw new Error('"name" attribute must have a value');
          if (typeof n.value != "string" && !(n.value instanceof RegExp))
            throw new Error('"name" attribute must be a string or a regular expression');
          r.name = n.value, r.nameOp = n.op, r.exact = n.caseSensitive;
          break;
        }
        case "include-hidden": {
          ce(n, [true, false]), ue(n, ["<truthy>", "="]), r.includeHidden = n.op === "<truthy>" ? true : n.value;
          break;
        }
        default:
          throw new Error(`Unknown attribute "${n.name}", must be one of ${Yn.map((i) => `"${i}"`).join(", ")}.`);
      }
    return r;
  }
  function wo(e, t, r) {
    const n = [], i = (o) => {
      if (q(o) === t.role && !(t.selected !== void 0 && In(o) !== t.selected) && !(t.checked !== void 0 && Pn(o) !== t.checked) && !(t.pressed !== void 0 && Nn(o) !== t.pressed) && !(t.expanded !== void 0 && $n(o) !== t.expanded) && !(t.level !== void 0 && Rn(o) !== t.level) && !(t.disabled !== void 0 && pt(o) !== t.disabled) && !(!t.includeHidden && V(o))) {
        if (t.name !== void 0) {
          const a = W(Le(o, !!t.includeHidden));
          if (typeof t.name == "string" && (t.name = W(t.name)), r && !t.exact && t.nameOp === "=" && (t.nameOp = "*="), !Xn(a, { op: t.nameOp || "=", value: t.name, caseSensitive: !!t.exact }))
            return;
        }
        n.push(o);
      }
    }, s = (o) => {
      const a = [];
      o.shadowRoot && a.push(o.shadowRoot);
      for (const l of o.querySelectorAll("*"))
        i(l), l.shadowRoot && a.push(l.shadowRoot);
      a.forEach(s);
    };
    return s(e), n;
  }
  function Rr(e) {
    return {
      queryAll: (t, r) => {
        const n = Re(r, true), i = n.name.toLowerCase();
        if (!i)
          throw new Error("Role must not be empty");
        const s = xo(n.attributes, i);
        _t();
        try {
          return wo(t, s, e);
        } finally {
          Tt();
        }
      }
    };
  }
  var bo = class {
    constructor() {
      this._retainCacheCounter = 0, this._cacheText = /* @__PURE__ */ new Map(), this._cacheQueryCSS = /* @__PURE__ */ new Map(), this._cacheMatches = /* @__PURE__ */ new Map(), this._cacheQuery = /* @__PURE__ */ new Map(), this._cacheMatchesSimple = /* @__PURE__ */ new Map(), this._cacheMatchesParents = /* @__PURE__ */ new Map(), this._cacheCallMatches = /* @__PURE__ */ new Map(), this._cacheCallQuery = /* @__PURE__ */ new Map(), this._cacheQuerySimple = /* @__PURE__ */ new Map(), this._engines = /* @__PURE__ */ new Map(), this._engines.set("not", So), this._engines.set("is", ke), this._engines.set("where", ke), this._engines.set("has", vo), this._engines.set("scope", yo), this._engines.set("light", Eo), this._engines.set("visible", _o), this._engines.set("text", To), this._engines.set("text-is", ko), this._engines.set("text-matches", Ao), this._engines.set("has-text", Co), this._engines.set("right-of", Ee("right-of")), this._engines.set("left-of", Ee("left-of")), this._engines.set("above", Ee("above")), this._engines.set("below", Ee("below")), this._engines.set("near", Ee("near")), this._engines.set("nth-match", Io);
      const e = [...this._engines.keys()];
      e.sort();
      const t = [...zn];
      if (t.sort(), e.join("|") !== t.join("|"))
        throw new Error(`Please keep customCSSNames in sync with evaluator engines: ${e.join("|")} vs ${t.join("|")}`);
    }
    begin() {
      ++this._retainCacheCounter;
    }
    end() {
      --this._retainCacheCounter, this._retainCacheCounter || (this._cacheQueryCSS.clear(), this._cacheMatches.clear(), this._cacheQuery.clear(), this._cacheMatchesSimple.clear(), this._cacheMatchesParents.clear(), this._cacheCallMatches.clear(), this._cacheCallQuery.clear(), this._cacheQuerySimple.clear(), this._cacheText.clear());
    }
    _cached(e, t, r, n) {
      e.has(t) || e.set(t, []);
      const i = e.get(t), s = i.find((a) => r.every((l, c) => a.rest[c] === l));
      if (s)
        return s.result;
      const o = n();
      return i.push({ rest: r, result: o }), o;
    }
    _checkSelector(e) {
      if (!(typeof e == "object" && e && (Array.isArray(e) || "simples" in e && e.simples.length)))
        throw new Error(`Malformed selector "${e}"`);
      return e;
    }
    matches(e, t, r) {
      const n = this._checkSelector(t);
      this.begin();
      try {
        return this._cached(this._cacheMatches, e, [n, r.scope, r.pierceShadow, r.originalScope], () => Array.isArray(n) ? this._matchesEngine(ke, e, n, r) : (this._hasScopeClause(n) && (r = this._expandContextForScopeMatching(r)), this._matchesSimple(e, n.simples[n.simples.length - 1].selector, r) ? this._matchesParents(e, n, n.simples.length - 2, r) : false));
      } finally {
        this.end();
      }
    }
    query(e, t) {
      const r = this._checkSelector(t);
      this.begin();
      try {
        return this._cached(this._cacheQuery, r, [e.scope, e.pierceShadow, e.originalScope], () => {
          if (Array.isArray(r))
            return this._queryEngine(ke, e, r);
          this._hasScopeClause(r) && (e = this._expandContextForScopeMatching(e));
          const n = this._scoreMap;
          this._scoreMap = /* @__PURE__ */ new Map();
          let i = this._querySimple(e, r.simples[r.simples.length - 1].selector);
          return i = i.filter((s) => this._matchesParents(s, r, r.simples.length - 2, e)), this._scoreMap.size && i.sort((s, o) => {
            const a = this._scoreMap.get(s), l = this._scoreMap.get(o);
            return a === l ? 0 : a === void 0 ? 1 : l === void 0 ? -1 : a - l;
          }), this._scoreMap = n, i;
        });
      } finally {
        this.end();
      }
    }
    _markScore(e, t) {
      this._scoreMap && this._scoreMap.set(e, t);
    }
    _hasScopeClause(e) {
      return e.simples.some((t) => t.selector.functions.some((r) => r.name === "scope"));
    }
    _expandContextForScopeMatching(e) {
      if (e.scope.nodeType !== 1)
        return e;
      const t = B(e.scope);
      return t ? { ...e, scope: t, originalScope: e.originalScope || e.scope } : e;
    }
    _matchesSimple(e, t, r) {
      return this._cached(this._cacheMatchesSimple, e, [t, r.scope, r.pierceShadow, r.originalScope], () => {
        if (e === r.scope || t.css && !this._matchesCSS(e, t.css))
          return false;
        for (const n of t.functions)
          if (!this._matchesEngine(this._getEngine(n.name), e, n.args, r))
            return false;
        return true;
      });
    }
    _querySimple(e, t) {
      return t.functions.length ? this._cached(this._cacheQuerySimple, t, [e.scope, e.pierceShadow, e.originalScope], () => {
        let r = t.css;
        const n = t.functions;
        r === "*" && n.length && (r = void 0);
        let i, s = -1;
        r !== void 0 ? i = this._queryCSS(e, r) : (s = n.findIndex((o) => this._getEngine(o.name).query !== void 0), s === -1 && (s = 0), i = this._queryEngine(this._getEngine(n[s].name), e, n[s].args));
        for (let o = 0; o < n.length; o++) {
          if (o === s)
            continue;
          const a = this._getEngine(n[o].name);
          a.matches !== void 0 && (i = i.filter((l) => this._matchesEngine(a, l, n[o].args, e)));
        }
        for (let o = 0; o < n.length; o++) {
          if (o === s)
            continue;
          const a = this._getEngine(n[o].name);
          a.matches === void 0 && (i = i.filter((l) => this._matchesEngine(a, l, n[o].args, e)));
        }
        return i;
      }) : this._queryCSS(e, t.css || "*");
    }
    _matchesParents(e, t, r, n) {
      return r < 0 ? true : this._cached(this._cacheMatchesParents, e, [t, r, n.scope, n.pierceShadow, n.originalScope], () => {
        const { selector: i, combinator: s } = t.simples[r];
        if (s === ">") {
          const o = Qe(e, n);
          return !o || !this._matchesSimple(o, i, n) ? false : this._matchesParents(o, t, r - 1, n);
        }
        if (s === "+") {
          const o = Nt(e, n);
          return !o || !this._matchesSimple(o, i, n) ? false : this._matchesParents(o, t, r - 1, n);
        }
        if (s === "") {
          let o = Qe(e, n);
          for (; o; ) {
            if (this._matchesSimple(o, i, n)) {
              if (this._matchesParents(o, t, r - 1, n))
                return true;
              if (t.simples[r - 1].combinator === "")
                break;
            }
            o = Qe(o, n);
          }
          return false;
        }
        if (s === "~") {
          let o = Nt(e, n);
          for (; o; ) {
            if (this._matchesSimple(o, i, n)) {
              if (this._matchesParents(o, t, r - 1, n))
                return true;
              if (t.simples[r - 1].combinator === "~")
                break;
            }
            o = Nt(o, n);
          }
          return false;
        }
        if (s === ">=") {
          let o = e;
          for (; o; ) {
            if (this._matchesSimple(o, i, n)) {
              if (this._matchesParents(o, t, r - 1, n))
                return true;
              if (t.simples[r - 1].combinator === "")
                break;
            }
            o = Qe(o, n);
          }
          return false;
        }
        throw new Error(`Unsupported combinator "${s}"`);
      });
    }
    _matchesEngine(e, t, r, n) {
      if (e.matches)
        return this._callMatches(e, t, r, n);
      if (e.query)
        return this._callQuery(e, r, n).includes(t);
      throw new Error('Selector engine should implement "matches" or "query"');
    }
    _queryEngine(e, t, r) {
      if (e.query)
        return this._callQuery(e, r, t);
      if (e.matches)
        return this._queryCSS(t, "*").filter((n) => this._callMatches(e, n, r, t));
      throw new Error('Selector engine should implement "matches" or "query"');
    }
    _callMatches(e, t, r, n) {
      return this._cached(this._cacheCallMatches, t, [e, n.scope, n.pierceShadow, n.originalScope, ...r], () => e.matches(t, r, n, this));
    }
    _callQuery(e, t, r) {
      return this._cached(this._cacheCallQuery, e, [r.scope, r.pierceShadow, r.originalScope, ...t], () => e.query(r, t, this));
    }
    _matchesCSS(e, t) {
      return e.matches(t);
    }
    _queryCSS(e, t) {
      return this._cached(this._cacheQueryCSS, t, [e.scope, e.pierceShadow, e.originalScope], () => {
        let r = [];
        function n(i) {
          if (r = r.concat([...i.querySelectorAll(t)]), !!e.pierceShadow) {
            i.shadowRoot && n(i.shadowRoot);
            for (const s of i.querySelectorAll("*"))
              s.shadowRoot && n(s.shadowRoot);
          }
        }
        return n(e.scope), r;
      });
    }
    _getEngine(e) {
      const t = this._engines.get(e);
      if (!t)
        throw new Error(`Unknown selector engine "${e}"`);
      return t;
    }
  };
  var ke = {
    matches(e, t, r, n) {
      if (t.length === 0)
        throw new Error('"is" engine expects non-empty selector list');
      return t.some((i) => n.matches(e, i, r));
    },
    query(e, t, r) {
      if (t.length === 0)
        throw new Error('"is" engine expects non-empty selector list');
      let n = [];
      for (const i of t)
        n = n.concat(r.query(e, i));
      return t.length === 1 ? n : Zn(n);
    }
  };
  var vo = {
    matches(e, t, r, n) {
      if (t.length === 0)
        throw new Error('"has" engine expects non-empty selector list');
      return n.query({ ...r, scope: e }, t).length > 0;
    }
    // TODO: we can implement efficient "query" by matching "args" and returning
    // all parents/descendants, just have to be careful with the ":scope" matching.
  };
  var yo = {
    matches(e, t, r, n) {
      if (t.length !== 0)
        throw new Error('"scope" engine expects no arguments');
      const i = r.originalScope || r.scope;
      return i.nodeType === 9 ? e === i.documentElement : e === i;
    },
    query(e, t, r) {
      if (t.length !== 0)
        throw new Error('"scope" engine expects no arguments');
      const n = e.originalScope || e.scope;
      if (n.nodeType === 9) {
        const i = n.documentElement;
        return i ? [i] : [];
      }
      return n.nodeType === 1 ? [n] : [];
    }
  };
  var So = {
    matches(e, t, r, n) {
      if (t.length === 0)
        throw new Error('"not" engine expects non-empty selector list');
      return !n.matches(e, t, r);
    }
  };
  var Eo = {
    query(e, t, r) {
      return r.query({ ...e, pierceShadow: false }, t);
    },
    matches(e, t, r, n) {
      return n.matches(e, t, { ...r, pierceShadow: false });
    }
  };
  var _o = {
    matches(e, t, r, n) {
      if (t.length)
        throw new Error('"visible" engine expects no arguments');
      return re(e);
    }
  };
  var To = {
    matches(e, t, r, n) {
      if (t.length !== 1 || typeof t[0] != "string")
        throw new Error('"text" engine expects a single string');
      const i = W(t[0]).toLowerCase(), s = (o) => o.normalized.toLowerCase().includes(i);
      return kt(n._cacheText, e, s) === "self";
    }
  };
  var ko = {
    matches(e, t, r, n) {
      if (t.length !== 1 || typeof t[0] != "string")
        throw new Error('"text-is" engine expects a single string');
      const i = W(t[0]), s = (o) => !i && !o.immediate.length ? true : o.immediate.some((a) => W(a) === i);
      return kt(n._cacheText, e, s) !== "none";
    }
  };
  var Ao = {
    matches(e, t, r, n) {
      if (t.length === 0 || typeof t[0] != "string" || t.length > 2 || t.length === 2 && typeof t[1] != "string")
        throw new Error('"text-matches" engine expects a regexp body and optional regexp flags');
      const i = new RegExp(t[0], t.length === 2 ? t[1] : void 0), s = (o) => i.test(o.full);
      return kt(n._cacheText, e, s) === "self";
    }
  };
  var Co = {
    matches(e, t, r, n) {
      if (t.length !== 1 || typeof t[0] != "string")
        throw new Error('"has-text" engine expects a single string');
      if (ur(e))
        return false;
      const i = W(t[0]).toLowerCase();
      return ((o) => o.normalized.toLowerCase().includes(i))(G(n._cacheText, e));
    }
  };
  function Ee(e) {
    return {
      matches(t, r, n, i) {
        const s = r.length && typeof r[r.length - 1] == "number" ? r[r.length - 1] : void 0, o = s === void 0 ? r : r.slice(0, r.length - 1);
        if (r.length < 1 + (s === void 0 ? 0 : 1))
          throw new Error(`"${e}" engine expects a selector list and optional maximum distance in pixels`);
        const a = i.query(n, o), l = Qn(e, t, a, s);
        return l === void 0 ? false : (i._markScore(t, l), true);
      }
    };
  }
  var Io = {
    query(e, t, r) {
      let n = t[t.length - 1];
      if (t.length < 2)
        throw new Error('"nth-match" engine expects non-empty selector list and an index argument');
      if (typeof n != "number" || n < 1)
        throw new Error('"nth-match" engine expects a one-based index as the last argument');
      const i = ke.query(e, t.slice(0, t.length - 1), r);
      return n--, n < i.length ? [i[n]] : [];
    }
  };
  function Qe(e, t) {
    if (e !== t.scope)
      return t.pierceShadow ? B(e) : e.parentElement || void 0;
  }
  function Nt(e, t) {
    if (e !== t.scope)
      return e.previousElementSibling || void 0;
  }
  function Zn(e) {
    const t = /* @__PURE__ */ new Map(), r = [], n = [];
    function i(o) {
      let a = t.get(o);
      if (a)
        return a;
      const l = B(o);
      return l ? i(l).children.push(o) : r.push(o), a = { children: [], taken: false }, t.set(o, a), a;
    }
    for (const o of e)
      i(o).taken = true;
    function s(o) {
      const a = t.get(o);
      if (a.taken && n.push(o), a.children.length > 1) {
        const l = new Set(a.children);
        a.children = [];
        let c = o.firstElementChild;
        for (; c && a.children.length < l.size; )
          l.has(c) && a.children.push(c), c = c.nextElementSibling;
        for (c = o.shadowRoot ? o.shadowRoot.firstElementChild : null; c && a.children.length < l.size; )
          l.has(c) && a.children.push(c), c = c.nextElementSibling;
      }
      a.children.forEach(s);
    }
    return r.forEach(s), n;
  }
  var ei = 10;
  var we = ei / 2;
  var Lr = 1;
  var Po = 2;
  var No = 10;
  var $o = 50;
  var ti = 100;
  var ri = 120;
  var ni = 140;
  var ii = 160;
  var nt = 180;
  var si = 200;
  var Or = 250;
  var Ro = ri + we;
  var Lo = ni + we;
  var Oo = ti + we;
  var Mo = ii + we;
  var Fo = nt + we;
  var Do = si + we;
  var qo = 300;
  var Bo = 500;
  var oi = 510;
  var $t = 520;
  var ai = 530;
  var jt = 1e4;
  var Ho = 1e7;
  var jo = 1e3;
  function Mr(e, t, r) {
    e._evaluator.begin();
    const n = { allowText: /* @__PURE__ */ new Map(), disallowText: /* @__PURE__ */ new Map() };
    _t(), Vt();
    try {
      let i = [];
      if (r.forTextExpect) {
        let a = Ae(e, t.ownerDocument.documentElement, r);
        for (let l = t; l; l = B(l)) {
          const c = ie(n, e, l, { ...r, noText: true });
          if (!c)
            continue;
          if (se(c) <= jo) {
            a = c;
            break;
          }
        }
        i = [it(a)];
      } else {
        if (!t.matches("input,textarea,select") && !t.isContentEditable) {
          const a = _e(t, "button,select,input,[role=button],[role=checkbox],[role=radio],a,[role=link]", r.root);
          a && re(a) && (t = a);
        }
        if (r.multiple) {
          const a = ie(n, e, t, r), l = ie(n, e, t, { ...r, noText: true });
          let c = [a, l];
          if (n.allowText.clear(), n.disallowText.clear(), a && Rt(a) && c.push(ie(n, e, t, { ...r, noCSSId: true })), l && Rt(l) && c.push(ie(n, e, t, { ...r, noText: true, noCSSId: true })), c = c.filter(Boolean), !c.length) {
            const u = Ae(e, t, r);
            c.push(u), Rt(u) && c.push(Ae(e, t, { ...r, noCSSId: true }));
          }
          i = [...new Set(c.map((u) => it(u)))];
        } else {
          const a = ie(n, e, t, r) || Ae(e, t, r);
          i = [it(a)];
        }
      }
      const s = i[0], o = e.parseSelector(s);
      return {
        selector: s,
        selectors: i,
        elements: e.querySelectorAll(o, r.root ?? t.ownerDocument)
      };
    } finally {
      Jt(), Tt(), e._evaluator.end();
    }
  }
  function ie(e, t, r, n) {
    if (n.root && !Ft(n.root, r))
      throw new Error("Target element must belong to the root's subtree");
    if (r === n.root)
      return [{ engine: "css", selector: ":scope", score: 1 }];
    if (r.ownerDocument.documentElement === r)
      return [{ engine: "css", selector: "html", score: 1 }];
    let i = null;
    const s = (a) => {
      (!i || se(a) < se(i)) && (i = a);
    }, o = [];
    if (!n.noText)
      for (const a of Uo(t, r, !n.isRecursive))
        o.push({ candidate: a, isTextCandidate: true });
    for (const a of Wo(t, r, n))
      n.omitInternalEngines && a.engine.startsWith("internal:") || o.push({ candidate: [a], isTextCandidate: false });
    o.sort((a, l) => se(a.candidate) - se(l.candidate));
    for (const { candidate: a, isTextCandidate: l } of o) {
      const c = t.querySelectorAll(t.parseSelector(it(a)), n.root ?? r.ownerDocument);
      if (!c.includes(r))
        continue;
      if (c.length === 1) {
        s(a);
        break;
      }
      const u = c.indexOf(r);
      if (!(u > 5) && (s([...a, { engine: "nth", selector: String(u), score: jt }]), !n.isRecursive))
        for (let f = B(r); f && f !== n.root; f = B(f)) {
          const d = c.filter((T) => Ft(f, T) && T !== f), b = d.indexOf(r);
          if (d.length > 5 || b === -1 || b === u && d.length > 1)
            continue;
          const h = d.length === 1 ? a : [...a, { engine: "nth", selector: String(b), score: jt }];
          if (i && se([{ engine: "", selector: "", score: 1 }, ...h]) >= se(i))
            continue;
          const p = !!n.noText || l, w = p ? e.disallowText : e.allowText;
          let v = w.get(f);
          v === void 0 && (v = ie(e, t, f, { ...n, isRecursive: true, noText: p }) || Ae(t, f, n), w.set(f, v)), v && s([...v, ...h]);
        }
    }
    return i;
  }
  function Wo(e, t, r) {
    const n = [];
    {
      for (const o of ["data-testid", "data-test-id", "data-test"])
        o !== r.testIdAttributeName && t.getAttribute(o) && n.push({ engine: "css", selector: `[${o}=${fe(t.getAttribute(o))}]`, score: Po });
      if (!r.noCSSId) {
        const o = t.getAttribute("id");
        o && !zo(o) && n.push({ engine: "css", selector: li(o), score: Bo });
      }
      n.push({ engine: "css", selector: ee(t), score: ai });
    }
    if (t.nodeName === "IFRAME") {
      for (const o of ["name", "title"])
        t.getAttribute(o) && n.push({ engine: "css", selector: `${ee(t)}[${o}=${fe(t.getAttribute(o))}]`, score: No });
      return t.getAttribute(r.testIdAttributeName) && n.push({ engine: "css", selector: `[${r.testIdAttributeName}=${fe(t.getAttribute(r.testIdAttributeName))}]`, score: Lr }), Wt([n]), n;
    }
    if (t.getAttribute(r.testIdAttributeName) && n.push({ engine: "internal:testid", selector: `[${r.testIdAttributeName}=${j(t.getAttribute(r.testIdAttributeName), true)}]`, score: Lr }), t.nodeName === "INPUT" || t.nodeName === "TEXTAREA") {
      const o = t;
      if (o.placeholder) {
        n.push({ engine: "internal:attr", selector: `[placeholder=${j(o.placeholder, true)}]`, score: Ro });
        for (const a of de(o.placeholder))
          n.push({ engine: "internal:attr", selector: `[placeholder=${j(a.text, false)}]`, score: ri - a.scoreBonus });
      }
    }
    const i = Kn(e._evaluator._cacheText, t);
    for (const o of i) {
      const a = o.normalized;
      n.push({ engine: "internal:label", selector: z(a, true), score: Lo });
      for (const l of de(a))
        n.push({ engine: "internal:label", selector: z(l.text, false), score: ni - l.scoreBonus });
    }
    const s = q(t);
    return s && !["none", "presentation"].includes(s) && n.push({ engine: "internal:role", selector: s, score: oi }), t.getAttribute("name") && ["BUTTON", "FORM", "FIELDSET", "FRAME", "IFRAME", "INPUT", "KEYGEN", "OBJECT", "OUTPUT", "SELECT", "TEXTAREA", "MAP", "META", "PARAM"].includes(t.nodeName) && n.push({ engine: "css", selector: `${ee(t)}[name=${fe(t.getAttribute("name"))}]`, score: $t }), ["INPUT", "TEXTAREA"].includes(t.nodeName) && t.getAttribute("type") !== "hidden" && t.getAttribute("type") && n.push({ engine: "css", selector: `${ee(t)}[type=${fe(t.getAttribute("type"))}]`, score: $t }), ["INPUT", "TEXTAREA", "SELECT"].includes(t.nodeName) && t.getAttribute("type") !== "hidden" && n.push({ engine: "css", selector: ee(t), score: $t + 1 }), Wt([n]), n;
  }
  function Uo(e, t, r) {
    if (t.nodeName === "SELECT")
      return [];
    const n = [], i = t.getAttribute("title");
    if (i) {
      n.push([{ engine: "internal:attr", selector: `[title=${j(i, true)}]`, score: Do }]);
      for (const c of de(i))
        n.push([{ engine: "internal:attr", selector: `[title=${j(c.text, false)}]`, score: si - c.scoreBonus }]);
    }
    const s = t.getAttribute("alt");
    if (s && ["APPLET", "AREA", "IMG", "INPUT"].includes(t.nodeName)) {
      n.push([{ engine: "internal:attr", selector: `[alt=${j(s, true)}]`, score: Mo }]);
      for (const c of de(s))
        n.push([{ engine: "internal:attr", selector: `[alt=${j(c.text, false)}]`, score: ii - c.scoreBonus }]);
    }
    const o = G(e._evaluator._cacheText, t).normalized, a = o ? de(o) : [];
    if (o) {
      if (r) {
        o.length <= 80 && n.push([{ engine: "internal:text", selector: z(o, true), score: Fo }]);
        for (const u of a)
          n.push([{ engine: "internal:text", selector: z(u.text, false), score: nt - u.scoreBonus }]);
      }
      const c = { engine: "css", selector: ee(t), score: ai };
      for (const u of a)
        n.push([c, { engine: "internal:has-text", selector: z(u.text, false), score: nt - u.scoreBonus }]);
      if (r && o.length <= 80) {
        const u = new RegExp("^" + at(o) + "$");
        n.push([c, { engine: "internal:has-text", selector: z(u, false), score: Or }]);
      }
    }
    const l = q(t);
    if (l && !["none", "presentation"].includes(l)) {
      const c = Le(t, false);
      if (c && !c.match(new RegExp("^\\p{Co}+$", "u"))) {
        const u = { engine: "internal:role", selector: `${l}[name=${j(c, true)}]`, score: Oo };
        n.push([u]);
        for (const f of de(c))
          n.push([{ engine: "internal:role", selector: `${l}[name=${j(f.text, false)}]`, score: ti - f.scoreBonus }]);
      } else {
        const u = { engine: "internal:role", selector: `${l}`, score: oi };
        for (const f of a)
          n.push([u, { engine: "internal:has-text", selector: z(f.text, false), score: nt - f.scoreBonus }]);
        if (r && o.length <= 80) {
          const f = new RegExp("^" + at(o) + "$");
          n.push([u, { engine: "internal:has-text", selector: z(f, false), score: Or }]);
        }
      }
    }
    return Wt(n), n;
  }
  function li(e) {
    return /^[a-zA-Z][a-zA-Z0-9\-\_]+$/.test(e) ? "#" + e : `[id=${fe(e)}]`;
  }
  function Rt(e) {
    return e.some((t) => t.engine === "css" && (t.selector.startsWith("#") || t.selector.startsWith('[id="')));
  }
  function Ae(e, t, r) {
    const n = r.root ?? t.ownerDocument, i = [];
    function s(a) {
      const l = i.slice();
      a && l.unshift(a);
      const c = l.join(" > "), u = e.parseSelector(c);
      return e.querySelector(u, n, false) === t ? c : void 0;
    }
    function o(a) {
      const l = { engine: "css", selector: a, score: Ho }, c = e.parseSelector(a), u = e.querySelectorAll(c, n);
      if (u.length === 1)
        return [l];
      const f = { engine: "nth", selector: String(u.indexOf(t)), score: jt };
      return [l, f];
    }
    for (let a = t; a && a !== n; a = B(a)) {
      let l = "";
      if (a.id && !r.noCSSId) {
        const f = li(a.id), d = s(f);
        if (d)
          return o(d);
        l = f;
      }
      const c = a.parentNode, u = [...a.classList].map(Go);
      for (let f = 0; f < u.length; ++f) {
        const d = "." + u.slice(0, f + 1).join("."), b = s(d);
        if (b)
          return o(b);
        !l && c && c.querySelectorAll(d).length === 1 && (l = d);
      }
      if (c) {
        const f = [...c.children], d = a.nodeName, h = f.filter((p) => p.nodeName === d).indexOf(a) === 0 ? ee(a) : `${ee(a)}:nth-child(${1 + f.indexOf(a)})`, x = s(h);
        if (x)
          return o(x);
        l || (l = h);
      } else l || (l = ee(a));
      i.unshift(l);
    }
    return o(s());
  }
  function Wt(e) {
    for (const t of e)
      for (const r of t)
        r.score > $o && r.score < qo && (r.score += Math.min(ei, r.selector.length / 10 | 0));
  }
  function it(e) {
    const t = [];
    let r = "";
    for (const { engine: n, selector: i } of e)
      t.length && (r !== "css" || n !== "css" || i.startsWith(":nth-match(")) && t.push(">>"), r = n, n === "css" ? t.push(i) : t.push(`${n}=${i}`);
    return t.join(" ");
  }
  function se(e) {
    let t = 0;
    for (let r = 0; r < e.length; r++)
      t += e[r].score * (e.length - r);
    return t;
  }
  function zo(e) {
    let t, r = 0;
    for (let n = 0; n < e.length; ++n) {
      const i = e[n];
      let s;
      if (!(i === "-" || i === "_")) {
        if (i >= "a" && i <= "z" ? s = "lower" : i >= "A" && i <= "Z" ? s = "upper" : i >= "0" && i <= "9" ? s = "digit" : s = "other", s === "lower" && t === "upper") {
          t = s;
          continue;
        }
        t && t !== s && ++r, t = s;
      }
    }
    return r >= e.length / 4;
  }
  function Xe(e, t) {
    if (e.length <= t)
      return e;
    e = e.substring(0, t);
    const r = e.match(/^(.*)\b(.+?)$/);
    return r ? r[1].trimEnd() : "";
  }
  function de(e) {
    let t = [];
    {
      const r = e.match(/^([\d.,]+)[^.,\w]/), n = r ? r[1].length : 0;
      if (n) {
        const i = Xe(e.substring(n).trimStart(), 80);
        t.push({ text: i, scoreBonus: i.length <= 30 ? 2 : 1 });
      }
    }
    {
      const r = e.match(/[^.,\w]([\d.,]+)$/), n = r ? r[1].length : 0;
      if (n) {
        const i = Xe(e.substring(0, e.length - n).trimEnd(), 80);
        t.push({ text: i, scoreBonus: i.length <= 30 ? 2 : 1 });
      }
    }
    return e.length <= 30 ? t.push({ text: e, scoreBonus: 0 }) : (t.push({ text: Xe(e, 80), scoreBonus: 0 }), t.push({ text: Xe(e, 30), scoreBonus: 1 })), t = t.filter((r) => r.text), t.length || t.push({ text: e.substring(0, 80), scoreBonus: 0 }), t;
  }
  function ee(e) {
    return e.nodeName.toLocaleLowerCase().replace(/[:\.]/g, (t) => "\\" + t);
  }
  function Go(e) {
    let t = "";
    for (let r = 0; r < e.length; r++)
      t += Vo(e, r);
    return t;
  }
  function Vo(e, t) {
    const r = e.charCodeAt(t);
    return r === 0 ? "\uFFFD" : r >= 1 && r <= 31 || r >= 48 && r <= 57 && (t === 0 || t === 1 && e.charCodeAt(0) === 45) ? "\\" + r.toString(16) + " " : t === 0 && r === 45 && e.length === 1 ? "\\" + e.charAt(t) : r >= 128 || r === 45 || r === 95 || r >= 48 && r <= 57 || r >= 65 && r <= 90 || r >= 97 && r <= 122 ? e.charAt(t) : "\\" + e.charAt(t);
  }
  var Fr = {
    queryAll(e, t) {
      t.startsWith("/") && e.nodeType !== Node.DOCUMENT_NODE && (t = "." + t);
      const r = [], n = e.ownerDocument || e;
      if (!n)
        return r;
      const i = n.evaluate(t, e, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE);
      for (let s = i.iterateNext(); s; s = i.iterateNext())
        s.nodeType === Node.ELEMENT_NODE && r.push(s);
      return r;
    }
  };
  var Jo = class {
    constructor(e, t) {
      this.global = e, this.isUnderTest = t, e.__pwClock ? this.builtins = e.__pwClock.builtins : this.builtins = {
        setTimeout: e.setTimeout?.bind(e),
        clearTimeout: e.clearTimeout?.bind(e),
        setInterval: e.setInterval?.bind(e),
        clearInterval: e.clearInterval?.bind(e),
        requestAnimationFrame: e.requestAnimationFrame?.bind(e),
        cancelAnimationFrame: e.cancelAnimationFrame?.bind(e),
        requestIdleCallback: e.requestIdleCallback?.bind(e),
        cancelIdleCallback: e.cancelIdleCallback?.bind(e),
        performance: e.performance,
        Intl: e.Intl,
        Date: e.Date,
        AbortSignal: e.AbortSignal
      }, this.isUnderTest && (e.builtins = this.builtins);
    }
    evaluate(e, t, r, n, ...i) {
      const s = i.slice(0, n), o = i.slice(n), a = [];
      for (let c = 0; c < s.length; c++)
        a[c] = Fe(s[c], o);
      let l = this.global.eval(r);
      return e === true ? l = l(...a) : e === false ? l = l : typeof l == "function" && (l = l(...a)), t ? this._promiseAwareJsonValueNoThrow(l) : l;
    }
    jsonValue(e, t) {
      if (t !== void 0)
        return lr(t, (r) => ({ fallThrough: r }));
    }
    _promiseAwareJsonValueNoThrow(e) {
      const t = (r) => {
        try {
          return this.jsonValue(true, r);
        } catch {
          return;
        }
      };
      return e && typeof e == "object" && typeof e.then == "function" ? (async () => {
        const r = await e;
        return t(r);
      })() : t(e);
    }
  };
  var La = class {
    constructor(e, t) {
      this._testIdAttributeNameForStrictErrorAndConsoleCodegen = "data-testid", this._lastAriaSnapshotForTrack = /* @__PURE__ */ new Map(), this.utils = {
        asLocator: pe,
        cacheNormalizedWhitespaces: Ti,
        elementText: G,
        getAriaRole: q,
        getElementAccessibleDescription: Sr,
        getElementAccessibleName: Le,
        isElementVisible: re,
        isInsideScope: Ft,
        normalizeWhiteSpace: W,
        parseAriaSnapshot: Ur,
        generateAriaTree: Ne,
        findNewElement: Es,
        // Builtins protect injected code from clock emulation.
        builtins: null
      }, this.window = e, this.document = e.document, this.isUnderTest = t.isUnderTest, this.utils.builtins = new Jo(e, t.isUnderTest).builtins, this._sdkLanguage = t.sdkLanguage, this._testIdAttributeNameForStrictErrorAndConsoleCodegen = t.testIdAttributeName, this._evaluator = new bo(), this.consoleApi = new co(this), this.onGlobalListenersRemoved = /* @__PURE__ */ new Set(), this._autoClosingTags = /* @__PURE__ */ new Set(["AREA", "BASE", "BR", "COL", "COMMAND", "EMBED", "HR", "IMG", "INPUT", "KEYGEN", "LINK", "MENUITEM", "META", "PARAM", "SOURCE", "TRACK", "WBR"]), this._booleanAttributes = /* @__PURE__ */ new Set(["checked", "selected", "disabled", "readonly", "multiple"]), this._eventTypes = /* @__PURE__ */ new Map([
        ["auxclick", "mouse"],
        ["click", "mouse"],
        ["dblclick", "mouse"],
        ["mousedown", "mouse"],
        ["mouseeenter", "mouse"],
        ["mouseleave", "mouse"],
        ["mousemove", "mouse"],
        ["mouseout", "mouse"],
        ["mouseover", "mouse"],
        ["mouseup", "mouse"],
        ["mouseleave", "mouse"],
        ["mousewheel", "mouse"],
        ["keydown", "keyboard"],
        ["keyup", "keyboard"],
        ["keypress", "keyboard"],
        ["textInput", "keyboard"],
        ["touchstart", "touch"],
        ["touchmove", "touch"],
        ["touchend", "touch"],
        ["touchcancel", "touch"],
        ["pointerover", "pointer"],
        ["pointerout", "pointer"],
        ["pointerenter", "pointer"],
        ["pointerleave", "pointer"],
        ["pointerdown", "pointer"],
        ["pointerup", "pointer"],
        ["pointermove", "pointer"],
        ["pointercancel", "pointer"],
        ["gotpointercapture", "pointer"],
        ["lostpointercapture", "pointer"],
        ["focus", "focus"],
        ["blur", "focus"],
        ["drag", "drag"],
        ["dragstart", "drag"],
        ["dragend", "drag"],
        ["dragover", "drag"],
        ["dragenter", "drag"],
        ["dragleave", "drag"],
        ["dragexit", "drag"],
        ["drop", "drag"],
        ["wheel", "wheel"],
        ["deviceorientation", "deviceorientation"],
        ["deviceorientationabsolute", "deviceorientation"],
        ["devicemotion", "devicemotion"]
      ]), this._hoverHitTargetInterceptorEvents = /* @__PURE__ */ new Set(["mousemove"]), this._tapHitTargetInterceptorEvents = /* @__PURE__ */ new Set(["pointerdown", "pointerup", "touchstart", "touchend", "touchcancel"]), this._mouseHitTargetInterceptorEvents = /* @__PURE__ */ new Set(["mousedown", "mouseup", "pointerdown", "pointerup", "click", "auxclick", "dblclick", "contextmenu"]), this._allHitTargetInterceptorEvents = /* @__PURE__ */ new Set([...this._hoverHitTargetInterceptorEvents, ...this._tapHitTargetInterceptorEvents, ...this._mouseHitTargetInterceptorEvents]), this._engines = /* @__PURE__ */ new Map(), this._engines.set("xpath", Fr), this._engines.set("xpath:light", Fr), this._engines.set("role", Rr(false)), this._engines.set("text", this._createTextEngine(true, false)), this._engines.set("text:light", this._createTextEngine(false, false)), this._engines.set("id", this._createAttributeEngine("id", true)), this._engines.set("id:light", this._createAttributeEngine("id", false)), this._engines.set("data-testid", this._createAttributeEngine("data-testid", true)), this._engines.set("data-testid:light", this._createAttributeEngine("data-testid", false)), this._engines.set("data-test-id", this._createAttributeEngine("data-test-id", true)), this._engines.set("data-test-id:light", this._createAttributeEngine("data-test-id", false)), this._engines.set("data-test", this._createAttributeEngine("data-test", true)), this._engines.set("data-test:light", this._createAttributeEngine("data-test", false)), this._engines.set("css", this._createCSSEngine()), this._engines.set("nth", { queryAll: () => [] }), this._engines.set("visible", this._createVisibleEngine()), this._engines.set("internal:control", this._createControlEngine()), this._engines.set("internal:has", this._createHasEngine()), this._engines.set("internal:has-not", this._createHasNotEngine()), this._engines.set("internal:and", { queryAll: () => [] }), this._engines.set("internal:or", { queryAll: () => [] }), this._engines.set("internal:chain", this._createInternalChainEngine()), this._engines.set("internal:label", this._createInternalLabelEngine()), this._engines.set("internal:text", this._createTextEngine(true, true)), this._engines.set("internal:has-text", this._createInternalHasTextEngine()), this._engines.set("internal:has-not-text", this._createInternalHasNotTextEngine()), this._engines.set("internal:attr", this._createNamedAttributeEngine()), this._engines.set("internal:testid", this._createNamedAttributeEngine()), this._engines.set("internal:role", Rr(true)), this._engines.set("internal:describe", this._createDescribeEngine()), this._engines.set("aria-ref", this._createAriaRefEngine());
      for (const { name: r, source: n } of t.customEngines)
        this._engines.set(r, this.eval(n));
      this._stableRafCount = t.stableRafCount, this._browserName = t.browserName, this._isUtilityWorld = !!t.isUtilityWorld, Pi({ browserNameForWorkarounds: t.browserName }), this._setupGlobalListenersRemovalDetection(), this._setupHitTargetInterceptors(), this.isUnderTest && (this.window.__injectedScript = this);
    }
    eval(e) {
      return this.window.eval(e);
    }
    testIdAttributeNameForStrictErrorAndConsoleCodegen() {
      return this._testIdAttributeNameForStrictErrorAndConsoleCodegen;
    }
    parseSelector(e) {
      const t = ae(e);
      return Gs(t, (r) => {
        if (!this._engines.has(r.name))
          throw this.createStacklessError(`Unknown engine "${r.name}" while parsing selector ${e}`);
      }), t;
    }
    generateSelector(e, t) {
      return Mr(this, e, t);
    }
    generateSelectorSimple(e, t) {
      return Mr(this, e, { ...t, testIdAttributeName: this._testIdAttributeNameForStrictErrorAndConsoleCodegen }).selector;
    }
    querySelector(e, t, r) {
      const n = this.querySelectorAll(e, t);
      if (r && n.length > 1)
        throw this.strictModeViolationError(e, n);
      return this.checkDeprecatedSelectorUsage(e, n), n[0];
    }
    _queryNth(e, t) {
      const r = [...e];
      let n = +t.body;
      return n === -1 && (n = r.length - 1), new Set(r.slice(n, n + 1));
    }
    _queryLayoutSelector(e, t, r) {
      const n = t.name, i = t.body, s = [], o = this.querySelectorAll(i.parsed, r);
      for (const a of e) {
        const l = Qn(n, a, o, i.distance);
        l !== void 0 && s.push({ element: a, score: l });
      }
      return s.sort((a, l) => a.score - l.score), new Set(s.map((a) => a.element));
    }
    ariaSnapshot(e, t) {
      return this.incrementalAriaSnapshot(e, t).full;
    }
    incrementalAriaSnapshot(e, t) {
      if (e.nodeType !== Node.ELEMENT_NODE)
        throw this.createStacklessError("Can only capture aria snapshot of Element nodes.");
      const r = Ne(e, t), n = $e(r, t);
      let i;
      if (t.track) {
        const s = this._lastAriaSnapshotForTrack.get(t.track);
        s && (i = $e(r, t, s).text), this._lastAriaSnapshotForTrack.set(t.track, r);
      }
      return this._lastAriaSnapshotForQuery = r, { full: n.text, incremental: i, iframeRefs: r.iframeRefs, iframeDepths: n.iframeDepths };
    }
    ariaSnapshotForRecorder() {
      const e = Ne(this.document.body, { mode: "ai" }), { text: t } = $e(e, { mode: "ai" });
      return { ariaSnapshot: t, refs: e.refs };
    }
    getAllElementsMatchingExpectAriaTemplate(e, t) {
      return ws(e.documentElement, t);
    }
    querySelectorAll(e, t) {
      if (e.capture !== void 0) {
        if (e.parts.some((n) => n.name === "nth"))
          throw this.createStacklessError("Can't query n-th element in a request with the capture.");
        const r = { parts: e.parts.slice(0, e.capture + 1) };
        if (e.capture < e.parts.length - 1) {
          const n = { parts: e.parts.slice(e.capture + 1) }, i = { name: "internal:has", body: { parsed: n }, source: X(n) };
          r.parts.push(i);
        }
        return this.querySelectorAll(r, t);
      }
      if (!t.querySelectorAll)
        throw this.createStacklessError("Node is not queryable.");
      if (e.capture !== void 0)
        throw this.createStacklessError("Internal error: there should not be a capture in the selector.");
      if (t.nodeType === 11 && e.parts.length === 1 && e.parts[0].name === "css" && e.parts[0].source === ":scope")
        return [t];
      this._evaluator.begin();
      try {
        let r = /* @__PURE__ */ new Set([t]);
        for (const n of e.parts)
          if (n.name === "nth")
            r = this._queryNth(r, n);
          else if (n.name === "internal:and") {
            const i = this.querySelectorAll(n.body.parsed, t);
            r = new Set(i.filter((s) => r.has(s)));
          } else if (n.name === "internal:or") {
            const i = this.querySelectorAll(n.body.parsed, t);
            r = new Set(Zn(/* @__PURE__ */ new Set([...r, ...i])));
          } else if (mo.includes(n.name))
            r = this._queryLayoutSelector(r, n, t);
          else {
            const i = /* @__PURE__ */ new Set();
            for (const s of r) {
              const o = this._queryEngineAll(n, s);
              for (const a of o)
                i.add(a);
            }
            r = i;
          }
        return [...r];
      } finally {
        this._evaluator.end();
      }
    }
    _queryEngineAll(e, t) {
      const r = this._engines.get(e.name).queryAll(t, e.body);
      for (const n of r)
        if (!("nodeName" in n))
          throw this.createStacklessError(`Expected a Node but got ${Object.prototype.toString.call(n)}`);
      return r;
    }
    _createAttributeEngine(e, t) {
      const r = (n) => [{ simples: [{ selector: { css: `[${e}=${JSON.stringify(n)}]`, functions: [] }, combinator: "" }] }];
      return {
        queryAll: (n, i) => this._evaluator.query({ scope: n, pierceShadow: t }, r(i))
      };
    }
    _createCSSEngine() {
      return {
        queryAll: (e, t) => this._evaluator.query({ scope: e, pierceShadow: true }, t)
      };
    }
    _createTextEngine(e, t) {
      return { queryAll: (n, i) => {
        const { matcher: s, kind: o } = Ye(i, t), a = [];
        let l = null;
        const c = (f) => {
          if (o === "lax" && l && l.contains(f))
            return false;
          const d = kt(this._evaluator._cacheText, f, s);
          d === "none" && (l = f), (d === "self" || d === "selfAndChildren" && o === "strict" && !t) && a.push(f);
        };
        n.nodeType === Node.ELEMENT_NODE && c(n);
        const u = this._evaluator._queryCSS({ scope: n, pierceShadow: e }, "*");
        for (const f of u)
          c(f);
        return a;
      } };
    }
    _createInternalHasTextEngine() {
      return {
        queryAll: (e, t) => {
          if (e.nodeType !== 1)
            return [];
          const r = e, n = G(this._evaluator._cacheText, r), { matcher: i } = Ye(t, true);
          return i(n) ? [r] : [];
        }
      };
    }
    _createInternalHasNotTextEngine() {
      return {
        queryAll: (e, t) => {
          if (e.nodeType !== 1)
            return [];
          const r = e, n = G(this._evaluator._cacheText, r), { matcher: i } = Ye(t, true);
          return i(n) ? [] : [r];
        }
      };
    }
    _createInternalLabelEngine() {
      return {
        queryAll: (e, t) => {
          const { matcher: r } = Ye(t, true);
          return this._evaluator._queryCSS({ scope: e, pierceShadow: true }, "*").filter((i) => Kn(this._evaluator._cacheText, i).some((s) => r(s)));
        }
      };
    }
    _createNamedAttributeEngine() {
      return { queryAll: (t, r) => {
        const n = Re(r, true);
        if (n.name || n.attributes.length !== 1)
          throw new Error("Malformed attribute selector: " + r);
        const { name: i, value: s, caseSensitive: o } = n.attributes[0], a = o ? null : s.toLowerCase();
        let l;
        return s instanceof RegExp ? l = (u) => !!u.match(s) : o ? l = (u) => u === s : l = (u) => u.toLowerCase().includes(a), this._evaluator._queryCSS({ scope: t, pierceShadow: true }, `[${i}]`).filter((u) => l(u.getAttribute(i)));
      } };
    }
    _createDescribeEngine() {
      return { queryAll: (t) => t.nodeType !== 1 ? [] : [t] };
    }
    _createControlEngine() {
      return {
        queryAll(e, t) {
          if (t === "enter-frame")
            return [];
          if (t === "return-empty")
            return [];
          if (t === "component")
            return e.nodeType !== 1 ? [] : [e.childElementCount === 1 ? e.firstElementChild : e];
          throw new Error(`Internal error, unknown internal:control selector ${t}`);
        }
      };
    }
    _createHasEngine() {
      return { queryAll: (t, r) => t.nodeType !== 1 ? [] : !!this.querySelector(r.parsed, t, false) ? [t] : [] };
    }
    _createHasNotEngine() {
      return { queryAll: (t, r) => t.nodeType !== 1 ? [] : !!this.querySelector(r.parsed, t, false) ? [] : [t] };
    }
    _createVisibleEngine() {
      return { queryAll: (t, r) => {
        if (t.nodeType !== 1)
          return [];
        const n = r === "true";
        return re(t) === n ? [t] : [];
      } };
    }
    _createInternalChainEngine() {
      return { queryAll: (t, r) => this.querySelectorAll(r.parsed, t) };
    }
    extend(e, t) {
      const r = this.window.eval(`
    (() => {
      const module = {};
      ${e}
      return module.exports.default();
    })()`);
      return new r(this, t);
    }
    async viewportRatio(e) {
      return await new Promise((t) => {
        const r = new IntersectionObserver((n) => {
          t(n[0].intersectionRatio), r.disconnect();
        });
        r.observe(e), this.utils.builtins.requestAnimationFrame(() => {
        });
      });
    }
    getElementBorderWidth(e) {
      if (e.nodeType !== Node.ELEMENT_NODE || !e.ownerDocument || !e.ownerDocument.defaultView)
        return { left: 0, top: 0 };
      const t = e.ownerDocument.defaultView.getComputedStyle(e);
      return { left: parseInt(t.borderLeftWidth || "", 10), top: parseInt(t.borderTopWidth || "", 10) };
    }
    describeIFrameStyle(e) {
      if (!e.ownerDocument || !e.ownerDocument.defaultView)
        return "error:notconnected";
      const t = e.ownerDocument.defaultView;
      for (let n = e; n; n = B(n))
        if (t.getComputedStyle(n).transform !== "none")
          return "transformed";
      const r = t.getComputedStyle(e);
      return {
        left: parseInt(r.borderLeftWidth || "", 10) + parseInt(r.paddingLeft || "", 10),
        top: parseInt(r.borderTopWidth || "", 10) + parseInt(r.paddingTop || "", 10)
      };
    }
    retarget(e, t) {
      let r = e.nodeType === Node.ELEMENT_NODE ? e : e.parentElement;
      if (!r)
        return null;
      if (t === "none")
        return r;
      if (!r.matches("input, textarea, select") && !r.isContentEditable && (t === "button-link" ? r = r.closest("button, [role=button], a, [role=link]") || r : r = r.closest("button, [role=button], [role=checkbox], [role=radio]") || r), t === "follow-label" && !r.matches("a, input, textarea, button, select, [role=link], [role=button], [role=checkbox], [role=radio]") && !r.isContentEditable) {
        const n = r.closest("label");
        n && n.control && (r = n.control);
      }
      return r;
    }
    async checkElementStates(e, t) {
      if (t.includes("stable")) {
        const r = await this._checkElementIsStable(e);
        if (r === false)
          return { missingState: "stable" };
        if (r === "error:notconnected")
          return "error:notconnected";
      }
      for (const r of t)
        if (r !== "stable") {
          const n = this.elementState(e, r);
          if (n.received === "error:notconnected")
            return "error:notconnected";
          if (!n.matches)
            return { missingState: r };
        }
    }
    async _checkElementIsStable(e) {
      const t = /* @__PURE__ */ Symbol("continuePolling");
      let r, n = 0, i = 0;
      const s = () => {
        const u = this.retarget(e, "no-follow-label");
        if (!u)
          return "error:notconnected";
        const f = this.utils.builtins.performance.now();
        if (this._stableRafCount > 1 && f - i < 15)
          return t;
        i = f;
        const d = u.getBoundingClientRect(), b = { x: d.top, y: d.left, width: d.width, height: d.height };
        if (r) {
          if (!(b.x === r.x && b.y === r.y && b.width === r.width && b.height === r.height))
            return false;
          if (++n >= this._stableRafCount)
            return true;
        }
        return r = b, t;
      };
      let o, a;
      const l = new Promise((u, f) => {
        o = u, a = f;
      }), c = () => {
        try {
          const u = s();
          u !== t ? o(u) : this.utils.builtins.requestAnimationFrame(c);
        } catch (u) {
          a(u);
        }
      };
      return this.utils.builtins.requestAnimationFrame(c), l;
    }
    _createAriaRefEngine() {
      return { queryAll: (t, r) => {
        const n = this._lastAriaSnapshotForQuery?.elements?.get(r);
        return n && n.isConnected ? [n] : [];
      } };
    }
    elementState(e, t) {
      const r = this.retarget(e, ["visible", "hidden"].includes(t) ? "none" : "follow-label");
      if (!r || !r.isConnected)
        return t === "hidden" ? { matches: true, received: "hidden" } : { matches: false, received: "error:notconnected" };
      if (t === "visible" || t === "hidden") {
        const n = re(r);
        return {
          matches: t === "visible" ? n : !n,
          received: n ? "visible" : "hidden"
        };
      }
      if (t === "disabled" || t === "enabled") {
        const n = pt(r);
        return {
          matches: t === "disabled" ? n : !n,
          received: n ? "disabled" : "enabled"
        };
      }
      if (t === "editable") {
        const n = pt(r), i = os(r);
        if (i === "error")
          throw this.createStacklessError("Element is not an <input>, <textarea>, <select> or [contenteditable] and does not have a role allowing [aria-readonly]");
        return {
          matches: !n && !i,
          received: n ? "disabled" : i ? "readOnly" : "editable"
        };
      }
      if (t === "checked" || t === "unchecked") {
        const n = t === "checked", i = is(r);
        if (i === "error")
          throw this.createStacklessError("Not a checkbox or radio button");
        const s = r.nodeName === "INPUT" && r.type === "radio";
        return {
          matches: n === i,
          received: i ? "checked" : "unchecked",
          isRadio: s
        };
      }
      if (t === "indeterminate") {
        const n = ns(r);
        if (n === "error")
          throw this.createStacklessError("Not a checkbox or radio button");
        return {
          matches: n === "mixed",
          received: n === true ? "checked" : n === false ? "unchecked" : "mixed"
        };
      }
      throw this.createStacklessError(`Unexpected element state "${t}"`);
    }
    selectOptions(e, t) {
      const r = this.retarget(e, "follow-label");
      if (!r)
        return "error:notconnected";
      if (r.nodeName.toLowerCase() !== "select")
        throw this.createStacklessError("Element is not a <select> element");
      const n = r, i = [...n.options], s = [];
      let o = t.slice();
      for (let a = 0; a < i.length; a++) {
        const l = i[a], c = (u) => {
          if (u instanceof Node)
            return l === u;
          let f = true;
          return u.valueOrLabel !== void 0 && (f = f && (u.valueOrLabel === l.value || u.valueOrLabel === l.label)), u.value !== void 0 && (f = f && u.value === l.value), u.label !== void 0 && (f = f && u.label === l.label), u.index !== void 0 && (f = f && u.index === a), f;
        };
        if (o.some(c)) {
          if (!this.elementState(l, "enabled").matches)
            return "error:optionnotenabled";
          if (s.push(l), n.multiple)
            o = o.filter((u) => !c(u));
          else {
            o = [];
            break;
          }
        }
      }
      return o.length ? "error:optionsnotfound" : (n.value = void 0, s.forEach((a) => a.selected = true), n.dispatchEvent(new Event("input", { bubbles: true, composed: true })), n.dispatchEvent(new Event("change", { bubbles: true })), s.map((a) => a.value));
    }
    fill(e, t) {
      const r = this.retarget(e, "follow-label");
      if (!r)
        return "error:notconnected";
      if (r.nodeName.toLowerCase() === "input") {
        const n = r, i = n.type.toLowerCase(), s = /* @__PURE__ */ new Set(["color", "date", "time", "datetime-local", "month", "range", "week"]);
        if (!(/* @__PURE__ */ new Set(["", "email", "number", "password", "search", "tel", "text", "url"])).has(i) && !s.has(i))
          throw this.createStacklessError(`Input of type "${i}" cannot be filled`);
        if (i === "number" && (t = t.trim(), isNaN(Number(t))))
          throw this.createStacklessError("Cannot type text into input[type=number]");
        if (i === "color" && (t = t.toLowerCase()), s.has(i)) {
          if (t = t.trim(), n.focus(), n.value = t, n.value !== t)
            throw this.createStacklessError("Malformed value");
          return r.dispatchEvent(new Event("input", { bubbles: true, composed: true })), r.dispatchEvent(new Event("change", { bubbles: true })), "done";
        }
      } else if (r.nodeName.toLowerCase() !== "textarea") {
        if (!r.isContentEditable)
          throw this.createStacklessError("Element is not an <input>, <textarea> or [contenteditable] element");
      }
      return this.selectText(r), "needsinput";
    }
    selectText(e) {
      const t = this.retarget(e, "follow-label");
      if (!t)
        return "error:notconnected";
      if (t.nodeName.toLowerCase() === "input") {
        const i = t;
        return i.select(), i.focus(), "done";
      }
      if (t.nodeName.toLowerCase() === "textarea") {
        const i = t;
        return i.selectionStart = 0, i.selectionEnd = i.value.length, i.focus(), "done";
      }
      t.focus();
      const r = t.ownerDocument.createRange();
      r.selectNodeContents(t);
      const n = t.ownerDocument.defaultView.getSelection();
      return n && (n.removeAllRanges(), n.addRange(r)), "done";
    }
    _activelyFocused(e) {
      const t = e.getRootNode().activeElement, r = t === e && !!e.ownerDocument && e.ownerDocument.hasFocus();
      return { activeElement: t, isFocused: r };
    }
    focusNode(e, t) {
      if (!e.isConnected)
        return "error:notconnected";
      if (e.nodeType !== Node.ELEMENT_NODE)
        throw this.createStacklessError("Node is not an element");
      const { activeElement: r, isFocused: n } = this._activelyFocused(e);
      if (e.isContentEditable && !n && r && r.blur && r.blur(), e.focus(), e.focus(), t && !n && e.nodeName.toLowerCase() === "input")
        try {
          e.setSelectionRange(0, 0);
        } catch {
        }
      return "done";
    }
    blurNode(e) {
      if (!e.isConnected)
        return "error:notconnected";
      if (e.nodeType !== Node.ELEMENT_NODE)
        throw this.createStacklessError("Node is not an element");
      return e.blur(), "done";
    }
    setInputFiles(e, t) {
      if (e.nodeType !== Node.ELEMENT_NODE)
        return "Node is not of type HTMLElement";
      const r = e;
      if (r.nodeName !== "INPUT")
        return "Not an <input> element";
      const n = r;
      if ((n.getAttribute("type") || "").toLowerCase() !== "file")
        return "Not an input[type=file] element";
      const s = t.map((a) => {
        const l = Uint8Array.from(atob(a.buffer), (c) => c.charCodeAt(0));
        return new File([l], a.name, { type: a.mimeType, lastModified: a.lastModifiedMs });
      }), o = new DataTransfer();
      for (const a of s)
        o.items.add(a);
      n.files = o.files, n.dispatchEvent(new Event("input", { bubbles: true, composed: true })), n.dispatchEvent(new Event("change", { bubbles: true }));
    }
    expectHitTarget(e, t) {
      const r = [];
      let n = t;
      for (; n; ) {
        const c = Yr(n);
        if (!c || (r.push(c), c.nodeType === 9))
          break;
        n = c.host;
      }
      let i;
      for (let c = r.length - 1; c >= 0; c--) {
        const u = r[c], f = u.elementsFromPoint(e.x, e.y), d = u.elementFromPoint(e.x, e.y);
        d && f[0] && B(d) === f[0] && this.window.getComputedStyle(d)?.display === "contents" && f.unshift(d), f[0] && f[0].shadowRoot === u && f[1] === d && f.shift();
        const b = f[0];
        if (!b || (i = b, c && b !== r[c - 1].host))
          break;
      }
      const s = [];
      for (; i && i !== t; )
        s.push(i), i = i.assignedSlot ?? B(i);
      if (i === t)
        return "done";
      const o = this.previewNode(s[0] || this.document.documentElement);
      let a, l = t;
      for (; l; ) {
        const c = s.indexOf(l);
        if (c !== -1) {
          c > 1 && (a = this.previewNode(s[c - 1]));
          break;
        }
        l = B(l);
      }
      return a ? { hitTargetDescription: `${o} from ${a} subtree` } : { hitTargetDescription: o };
    }
    // Life of a pointer action, for example click.
    //
    // 0. Retry items 1 and 2 while action fails due to navigation or element being detached.
    //   1. Resolve selector to an element.
    //   2. Retry the following steps until the element is detached or frame navigates away.
    //     2a. Wait for the element to be stable (not moving), visible and enabled.
    //     2b. Scroll element into view. Scrolling alternates between:
    //         - Built-in protocol scrolling.
    //         - Anchoring to the top/left, bottom/right and center/center.
    //         This is to scroll elements from under sticky headers/footers.
    //     2c. Click point is calculated, either based on explicitly specified position,
    //         or some visible point of the element based on protocol content quads.
    //     2d. Click point relative to page viewport is converted relative to the target iframe
    //         for the next hit-point check.
    //     2e. (injected) Hit target at the click point must be a descendant of the target element.
    //         This prevents mis-clicking in edge cases like <iframe> overlaying the target.
    //     2f. (injected) Events specific for click (or some other action type) are intercepted on
    //         the Window with capture:true. See 2i for details.
    //         Note: this step is skipped for drag&drop (see inline comments for the reason).
    //     2g. Necessary keyboard modifiers are pressed.
    //     2h. Click event is issued (mousemove + mousedown + mouseup).
    //     2i. (injected) For each event, we check that hit target at the event point
    //         is a descendant of the target element.
    //         This guarantees no race between issuing the event and handling it in the page,
    //         for example due to layout shift.
    //         When hit target check fails, we block all future events in the page.
    //     2j. Keyboard modifiers are restored.
    //     2k. (injected) Event interceptor is removed.
    //     2l. All navigations triggered between 2g-2k are awaited to be either committed or canceled.
    //     2m. If failed, wait for increasing amount of time before the next retry.
    setupHitTargetInterceptor(e, t, r, n) {
      const i = this.retarget(e, "button-link");
      if (!i || !i.isConnected)
        return "error:notconnected";
      if (r) {
        const c = this.expectHitTarget(r, i);
        if (c !== "done")
          return c.hitTargetDescription;
      }
      if (t === "drag")
        return { stop: () => "done" };
      const s = {
        hover: this._hoverHitTargetInterceptorEvents,
        tap: this._tapHitTargetInterceptorEvents,
        mouse: this._mouseHitTargetInterceptorEvents
      }[t];
      let o;
      const a = (c) => {
        if (!s.has(c.type) || !c.isTrusted)
          return;
        const u = this.window.TouchEvent && c instanceof this.window.TouchEvent ? c.touches[0] : c;
        o === void 0 && u && (o = this.expectHitTarget({ x: u.clientX, y: u.clientY }, i)), (n || o !== "done" && o !== void 0) && (c.preventDefault(), c.stopPropagation(), c.stopImmediatePropagation());
      }, l = () => (this._hitTargetInterceptor === a && (this._hitTargetInterceptor = void 0), o || "done");
      return this._hitTargetInterceptor = a, { stop: l };
    }
    dispatchEvent(e, t, r) {
      let n;
      const i = { bubbles: true, cancelable: true, composed: true, ...r };
      switch (this._eventTypes.get(t)) {
        case "mouse":
          n = new MouseEvent(t, i);
          break;
        case "keyboard":
          n = new KeyboardEvent(t, i);
          break;
        case "touch": {
          if (this._browserName === "webkit") {
            const s = (a) => {
              if (a instanceof Touch)
                return a;
              let l = a.pageX;
              l === void 0 && a.clientX !== void 0 && (l = a.clientX + (this.document.scrollingElement?.scrollLeft || 0));
              let c = a.pageY;
              return c === void 0 && a.clientY !== void 0 && (c = a.clientY + (this.document.scrollingElement?.scrollTop || 0)), this.document.createTouch(this.window, a.target ?? e, a.identifier, l, c, a.screenX, a.screenY, a.radiusX, a.radiusY, a.rotationAngle, a.force);
            }, o = (a) => a instanceof TouchList || !a ? a : this.document.createTouchList(...a.map(s));
            i.target ?? (i.target = e), i.touches = o(i.touches), i.targetTouches = o(i.targetTouches), i.changedTouches = o(i.changedTouches), n = new TouchEvent(t, i);
          } else
            i.target ?? (i.target = e), i.touches = i.touches?.map((s) => s instanceof Touch ? s : new Touch({ ...s, target: s.target ?? e })), i.targetTouches = i.targetTouches?.map((s) => s instanceof Touch ? s : new Touch({ ...s, target: s.target ?? e })), i.changedTouches = i.changedTouches?.map((s) => s instanceof Touch ? s : new Touch({ ...s, target: s.target ?? e })), n = new TouchEvent(t, i);
          break;
        }
        case "pointer":
          n = new PointerEvent(t, i);
          break;
        case "focus":
          n = new FocusEvent(t, i);
          break;
        case "drag":
          n = new DragEvent(t, i);
          break;
        case "wheel":
          n = new WheelEvent(t, i);
          break;
        case "deviceorientation":
          try {
            n = new DeviceOrientationEvent(t, i);
          } catch {
            const { bubbles: s, cancelable: o, alpha: a, beta: l, gamma: c, absolute: u } = i;
            n = this.document.createEvent("DeviceOrientationEvent"), n.initDeviceOrientationEvent(t, s, o, a, l, c, u);
          }
          break;
        case "devicemotion":
          try {
            n = new DeviceMotionEvent(t, i);
          } catch {
            const { bubbles: s, cancelable: o, acceleration: a, accelerationIncludingGravity: l, rotationRate: c, interval: u } = i;
            n = this.document.createEvent("DeviceMotionEvent"), n.initDeviceMotionEvent(t, s, o, a, l, c, u);
          }
          break;
        default:
          n = new Event(t, i);
          break;
      }
      e.dispatchEvent(n);
    }
    previewNode(e) {
      if (e.nodeType === Node.TEXT_NODE)
        return Ke(`#text=${e.nodeValue || ""}`);
      if (e.nodeType !== Node.ELEMENT_NODE)
        return Ke(`<${e.nodeName.toLowerCase()} />`);
      const t = e, r = [];
      for (let a = 0; a < t.attributes.length; a++) {
        const { name: l, value: c } = t.attributes[a];
        l !== "style" && (!c && this._booleanAttributes.has(l) ? r.push(` ${l}`) : r.push(` ${l}="${c}"`));
      }
      r.sort((a, l) => a.length - l.length);
      const n = pr(r.join(""), 500);
      if (this._autoClosingTags.has(t.nodeName))
        return Ke(`<${t.nodeName.toLowerCase()}${n}/>`);
      const i = t.childNodes;
      let s = false;
      if (i.length <= 5) {
        s = true;
        for (let a = 0; a < i.length; a++)
          s = s && i[a].nodeType === Node.TEXT_NODE;
      }
      const o = s ? t.textContent || "" : i.length ? "\u2026" : "";
      return Ke(`<${t.nodeName.toLowerCase()}${n}>${pr(o, 50)}</${t.nodeName.toLowerCase()}>`);
    }
    _generateSelectors(e) {
      this._evaluator.begin(), _t(), Vt();
      try {
        const t = this._isUtilityWorld && this._browserName === "firefox" ? 2 : 10;
        return e.slice(0, t).map((n) => ({
          preview: this.previewNode(n),
          selector: this.generateSelectorSimple(n)
        })).map((n, i) => `${i + 1}) ${n.preview} aka ${pe(this._sdkLanguage, n.selector)}`);
      } finally {
        Jt(), Tt(), this._evaluator.end();
      }
    }
    strictModeViolationError(e, t) {
      const r = this._generateSelectors(t).map((n) => `
    ` + n);
      return r.length < t.length && r.push(`
    ...`), this.createStacklessError(`strict mode violation: ${pe(this._sdkLanguage, X(e))} resolved to ${t.length} elements:${r.join("")}
`);
    }
    checkDeprecatedSelectorUsage(e, t) {
      const r = /* @__PURE__ */ new Set([
        "_react",
        "_vue",
        "xpath:light",
        "text:light",
        "id:light",
        "data-testid:light",
        "data-test-id:light",
        "data-test:light"
      ]);
      if (!t.length)
        return;
      const n = e.parts.find((s) => r.has(s.name));
      if (!n)
        return;
      const i = this._generateSelectors(t).map((s) => `
    ` + s);
      throw i.length < t.length && i.push(`
    ...`), this.createStacklessError(`"${n.name}" selector is not supported: ${pe(this._sdkLanguage, X(e))} resolved to ${t.length} element${t.length === 1 ? "" : "s"}:${i.join("")}
`);
    }
    createStacklessError(e) {
      if (this._browserName === "firefox") {
        const r = new Error("Error: " + e);
        return r.stack = "", r;
      }
      const t = new Error(e);
      return delete t.stack, t;
    }
    createHighlight() {
      return new Je(this);
    }
    maskSelectors(e, t) {
      const r = this._createHighlight(), n = [];
      for (const i of e)
        n.push(this.querySelectorAll(i, this.document.documentElement));
      r.maskElements(n.flat(), t);
    }
    _createHighlight() {
      return this._highlight && this.hideHighlight(), this._highlight = new Je(this), this._highlight.install(), this._highlight;
    }
    _ensureHighlight() {
      return this._highlight || (this._highlight = new Je(this), this._highlight.install()), this._highlight;
    }
    highlight(e) {
      this._highlight || (this._highlight = new Je(this), this._highlight.install()), this._highlight.runHighlightOnRaf(e);
    }
    setScreencastAnnotation(e) {
      const t = this._ensureHighlight();
      if (!e) {
        t.updateHighlight([]), t.hideActionPoint(), t.hideActionTitle();
        return;
      }
      const r = e.duration ?? 500;
      e.box && t.updateHighlight([{
        box: e.box,
        color: "rgba(0, 128, 255, 0.15)",
        borderColor: "rgba(0, 128, 255, 0.6)",
        fadeDuration: r
      }]), e.point && t.showActionPoint(e.point.x, e.point.y, r), e.actionTitle && t.showActionTitle(e.actionTitle, r, e.position, e.fontSize);
    }
    addUserOverlay(e, t) {
      this._ensureHighlight().addUserOverlay(e, t);
    }
    getUserOverlay(e) {
      return this._ensureHighlight().getUserOverlay(e);
    }
    removeUserOverlay(e) {
      this._ensureHighlight().removeUserOverlay(e);
    }
    setUserOverlaysVisible(e) {
      this._ensureHighlight().setUserOverlaysVisible(e);
    }
    hideHighlight() {
      this._highlight && (this._highlight.uninstall(), delete this._highlight);
    }
    markTargetElements(e, t) {
      this._markedElements?.callId !== t && (this._markedElements = void 0);
      const r = this._markedElements?.elements || /* @__PURE__ */ new Set(), n = new CustomEvent("__playwright_unmark_target__", {
        bubbles: true,
        cancelable: true,
        detail: t,
        composed: true
      });
      for (const s of r)
        e.has(s) || s.dispatchEvent(n);
      const i = new CustomEvent("__playwright_mark_target__", {
        bubbles: true,
        cancelable: true,
        detail: t,
        composed: true
      });
      for (const s of e)
        r.has(s) || s.dispatchEvent(i);
      this._markedElements = { callId: t, elements: e };
    }
    _setupGlobalListenersRemovalDetection() {
      const e = "__playwright_global_listeners_check__";
      let t = false;
      const r = () => t = true;
      this.window.addEventListener(e, r), new MutationObserver((n) => {
        if (n.some((s) => Array.from(s.addedNodes).includes(this.document.documentElement)) && (t = false, this.window.dispatchEvent(new CustomEvent(e)), !t)) {
          this.window.addEventListener(e, r);
          for (const s of this.onGlobalListenersRemoved)
            s();
        }
      }).observe(this.document, { childList: true });
    }
    _setupHitTargetInterceptors() {
      const e = (r) => this._hitTargetInterceptor?.(r), t = () => {
        for (const r of this._allHitTargetInterceptorEvents)
          this.window.addEventListener(r, e, { capture: true, passive: false });
      };
      t(), this.onGlobalListenersRemoved.add(t);
    }
    async expect(e, t, r) {
      if (t.expression === "to.have.count" || t.expression.endsWith(".array"))
        return this.expectArray(r, t);
      if (!e) {
        if (!t.isNot && t.expression === "to.be.hidden")
          return { matches: true };
        if (t.isNot && t.expression === "to.be.visible")
          return { matches: false };
        if (!t.isNot && t.expression === "to.be.detached")
          return { matches: true };
        if (t.isNot && t.expression === "to.be.attached")
          return { matches: false };
        if (t.isNot && t.expression === "to.be.in.viewport")
          return { matches: false };
        if (t.expression === "to.have.title" && t?.expectedText?.[0]) {
          const i = new he(t.expectedText[0]), s = this.document.title;
          return { received: s, matches: i.matches(s) };
        }
        if (t.expression === "to.have.url" && t?.expectedText?.[0]) {
          const i = new he(t.expectedText[0]), s = this.document.location.href;
          return { received: s, matches: i.matches(s) };
        }
        return { matches: t.isNot, missingReceived: true };
      }
      return await this.expectSingleElement(e, t);
    }
    async expectSingleElement(e, t) {
      const r = t.expression;
      {
        let n;
        if (r === "to.have.attribute") {
          const i = e.hasAttribute(t.expressionArg);
          n = {
            matches: i,
            received: i ? "attribute present" : "attribute not present"
          };
        } else if (r === "to.be.checked") {
          const { checked: i, indeterminate: s } = t.expectedValue;
          if (s) {
            if (i !== void 0)
              throw this.createStacklessError("Can't assert indeterminate and checked at the same time");
            n = this.elementState(e, "indeterminate");
          } else
            n = this.elementState(e, i === false ? "unchecked" : "checked");
        } else if (r === "to.be.disabled")
          n = this.elementState(e, "disabled");
        else if (r === "to.be.editable")
          n = this.elementState(e, "editable");
        else if (r === "to.be.readonly")
          n = this.elementState(e, "editable"), n.matches = !n.matches;
        else if (r === "to.be.empty")
          if (e.nodeName === "INPUT" || e.nodeName === "TEXTAREA") {
            const i = e.value;
            n = { matches: !i, received: i ? "notEmpty" : "empty" };
          } else {
            const i = e.textContent?.trim();
            n = { matches: !i, received: i ? "notEmpty" : "empty" };
          }
        else if (r === "to.be.enabled")
          n = this.elementState(e, "enabled");
        else if (r === "to.be.focused") {
          const i = this._activelyFocused(e).isFocused;
          n = {
            matches: i,
            received: i ? "focused" : "inactive"
          };
        } else r === "to.be.hidden" ? n = this.elementState(e, "hidden") : r === "to.be.visible" ? n = this.elementState(e, "visible") : r === "to.be.attached" ? n = {
          matches: true,
          received: "attached"
        } : r === "to.be.detached" && (n = {
          matches: false,
          received: "attached"
        });
        if (n) {
          if (n.received === "error:notconnected")
            throw this.createStacklessError("Element is not connected");
          return n;
        }
      }
      if (r === "to.have.property") {
        let n = e;
        const i = t.expressionArg.split(".");
        for (let a = 0; a < i.length - 1; a++) {
          if (typeof n != "object" || !(i[a] in n))
            return { received: void 0, matches: false };
          n = n[i[a]];
        }
        const s = n[i[i.length - 1]], o = Ut(s, t.expectedValue);
        return { received: s, matches: o };
      }
      if (r === "to.be.in.viewport") {
        const n = await this.viewportRatio(e);
        return { received: `viewport ratio ${n}`, matches: n > 0 && n > (t.expectedNumber ?? 0) - 1e-9 };
      }
      if (r === "to.have.values") {
        if (e = this.retarget(e, "follow-label"), e.nodeName !== "SELECT" || !e.multiple)
          throw this.createStacklessError("Not a select element with a multiple attribute");
        const n = [...e.selectedOptions].map((i) => i.value);
        return n.length !== t.expectedText.length ? { received: n, matches: false } : { received: n, matches: n.map((i, s) => new he(t.expectedText[s]).matches(i)).every(Boolean) };
      }
      if (r === "to.match.aria") {
        const n = xs(e, t.expectedValue);
        return {
          received: n.received,
          matches: !!n.matches.length
        };
      }
      {
        let n;
        if (r === "to.have.attribute.value") {
          const i = e.getAttribute(t.expressionArg);
          if (i === null)
            return { received: null, matches: false };
          n = i;
        } else if (["to.have.class", "to.contain.class"].includes(r)) {
          if (!t.expectedText)
            throw this.createStacklessError("Expected text is not provided for " + r);
          return {
            received: e.classList.toString(),
            matches: new he(t.expectedText[0]).matchesClassList(
              this,
              e.classList,
              /* partial */
              r === "to.contain.class"
            )
          };
        } else if (r === "to.have.css")
          n = this.window.getComputedStyle(e).getPropertyValue(t.expressionArg);
        else if (r === "to.have.id")
          n = e.id;
        else if (r === "to.have.text")
          n = t.useInnerText ? e.innerText : G(/* @__PURE__ */ new Map(), e).full;
        else if (r === "to.have.accessible.name")
          n = Le(
            e,
            false
            /* includeHidden */
          );
        else if (r === "to.have.accessible.description")
          n = Sr(
            e,
            false
            /* includeHidden */
          );
        else if (r === "to.have.accessible.error.message")
          n = ts(e);
        else if (r === "to.have.role")
          n = q(e) || "";
        else if (r === "to.have.value") {
          if (e = this.retarget(e, "follow-label"), e.nodeName !== "INPUT" && e.nodeName !== "TEXTAREA" && e.nodeName !== "SELECT")
            throw this.createStacklessError("Not an input element");
          n = e.value;
        }
        if (n !== void 0 && t.expectedText) {
          const i = new he(t.expectedText[0]);
          return { received: n, matches: i.matches(n) };
        }
      }
      throw this.createStacklessError("Unknown expect matcher: " + r);
    }
    expectArray(e, t) {
      const r = t.expression;
      if (r === "to.have.count") {
        const a = e.length, l = a === t.expectedNumber;
        return { received: a, matches: l };
      }
      if (!t.expectedText)
        throw this.createStacklessError("Expected text is not provided for " + r);
      if (["to.have.class.array", "to.contain.class.array"].includes(r)) {
        const a = e.map((u) => u.classList), l = a.map(String);
        if (a.length !== t.expectedText.length)
          return { received: l, matches: false };
        const c = this._matchSequentially(
          t.expectedText,
          a,
          (u, f) => u.matchesClassList(
            this,
            f,
            /* partial */
            r === "to.contain.class.array"
          )
        );
        return {
          received: l,
          matches: c
        };
      }
      if (!["to.contain.text.array", "to.have.text.array"].includes(r))
        throw this.createStacklessError("Unknown expect matcher: " + r);
      const n = e.map((a) => t.useInnerText ? a.innerText : G(/* @__PURE__ */ new Map(), a).full), i = r !== "to.contain.text.array";
      if (!(n.length === t.expectedText.length || !i))
        return { received: n, matches: false };
      const o = this._matchSequentially(t.expectedText, n, (a, l) => a.matches(l));
      return { received: n, matches: o };
    }
    _matchSequentially(e, t, r) {
      const n = e.map((o) => new he(o));
      let i = 0, s = 0;
      for (; i < n.length && s < t.length; )
        r(n[i], t[s]) && ++i, ++s;
      return i === n.length;
    }
  };
  function Ke(e) {
    return e.replace(/\n/g, "\u21B5").replace(/\t/g, "\u21C6");
  }
  function Qo(e) {
    if (e = e.substring(1, e.length - 1), !e.includes("\\"))
      return e;
    const t = [];
    let r = 0;
    for (; r < e.length; )
      e[r] === "\\" && r + 1 < e.length && r++, t.push(e[r++]);
    return t.join("");
  }
  function Ye(e, t) {
    if (e[0] === "/" && e.lastIndexOf("/") > 0) {
      const i = e.lastIndexOf("/"), s = new RegExp(e.substring(1, i), e.substring(i + 1));
      return { matcher: (o) => s.test(o.full), kind: "regex" };
    }
    const r = t ? JSON.parse.bind(JSON) : Qo;
    let n = false;
    return e.length > 1 && e[0] === '"' && e[e.length - 1] === '"' ? (e = r(e), n = true) : t && e.length > 1 && e[0] === '"' && e[e.length - 2] === '"' && e[e.length - 1] === "i" ? (e = r(e.substring(0, e.length - 1)), n = false) : t && e.length > 1 && e[0] === '"' && e[e.length - 2] === '"' && e[e.length - 1] === "s" ? (e = r(e.substring(0, e.length - 1)), n = true) : e.length > 1 && e[0] === "'" && e[e.length - 1] === "'" && (e = r(e), n = true), e = W(e), n ? t ? { kind: "strict", matcher: (s) => s.normalized === e } : { matcher: (s) => !e && !s.immediate.length ? true : s.immediate.some((o) => W(o) === e), kind: "strict" } : (e = e.toLowerCase(), { kind: "lax", matcher: (i) => i.normalized.toLowerCase().includes(e) });
  }
  var he = class {
    constructor(e) {
      if (this._normalizeWhiteSpace = e.normalizeWhiteSpace, this._ignoreCase = e.ignoreCase, this._string = e.matchSubstring ? void 0 : this.normalize(e.string), this._substring = e.matchSubstring ? this.normalize(e.string) : void 0, e.regexSource) {
        const t = new Set((e.regexFlags || "").split(""));
        e.ignoreCase === false && t.delete("i"), e.ignoreCase === true && t.add("i"), this._regex = new RegExp(e.regexSource, [...t].join(""));
      }
    }
    matches(e) {
      return this._regex || (e = this.normalize(e)), this._string !== void 0 ? e === this._string : this._substring !== void 0 ? e.includes(this._substring) : this._regex ? !!this._regex.test(e) : false;
    }
    matchesClassList(e, t, r) {
      if (r) {
        if (this._regex)
          throw e.createStacklessError("Partial matching does not support regular expressions. Please provide a string value.");
        return this._string.split(/\s+/g).filter(Boolean).every((n) => t.contains(n));
      }
      return this.matches(t.toString());
    }
    normalize(e) {
      return e && (this._normalizeWhiteSpace && (e = W(e)), this._ignoreCase && (e = e.toLocaleLowerCase()), e);
    }
  };
  function Ut(e, t) {
    if (e === t)
      return true;
    if (e && t && typeof e == "object" && typeof t == "object") {
      if (e.constructor !== t.constructor)
        return false;
      if (Array.isArray(e)) {
        if (e.length !== t.length)
          return false;
        for (let n = 0; n < e.length; ++n)
          if (!Ut(e[n], t[n]))
            return false;
        return true;
      }
      if (e instanceof RegExp)
        return e.source === t.source && e.flags === t.flags;
      if (e.valueOf !== Object.prototype.valueOf)
        return e.valueOf() === t.valueOf();
      if (e.toString !== Object.prototype.toString)
        return e.toString() === t.toString();
      const r = Object.keys(e);
      if (r.length !== Object.keys(t).length)
        return false;
      for (let n = 0; n < r.length; ++n)
        if (!t.hasOwnProperty(r[n]))
          return false;
      for (const n of r)
        if (!Ut(e[n], t[n]))
          return false;
      return true;
    }
    return typeof e == "number" && typeof t == "number" ? isNaN(e) && isNaN(t) : false;
  }
  var ra = new RegExp(
    "^(?:\\s*at )?(?:(new) )?(?:(.*?) \\()?(?:eval at ([^ ]+) \\((.+?):(\\d+):(\\d+)\\), )?(?:(.+?):(\\d+):(\\d+)|(native))(\\)?)$"
  );
  var fi = performance.timeOrigin;
  var fl = 180 * 1e3;

  // aria-entry.mjs
  (function(w) {
    if (!w || w.__o2EnsureAria) return;
    w.__o2EnsureAria = function() {
      if (w.__o2Aria) return w.__o2Aria;
      w.__o2Aria = new La(w, {
        isUnderTest: false,
        sdkLanguage: "javascript",
        testIdAttributeName: "data-testid",
        stableRafCount: 0,
        browserName: "chromium",
        customEngines: []
      });
      return w.__o2Aria;
    };
  })(typeof window !== "undefined" ? window : globalThis);
})();
