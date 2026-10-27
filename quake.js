/* 캠퍼스 지진 — 진앙을 찾아라.
   학생 폰 = 지진 관측소, 선생님 화면 = 관측망 지도와 수업 진행.
   계산(도착 시각, 파형, 진앙 결정)은 quake-model.js 에 있다.

   실시간 공유는 Firebase Realtime Database 를 쓴다. 위치처럼 몇 초마다 바뀌는 값은
   Firestore 로 보내면 무료 한도(하루 읽기 5만 건)가 한 수업에 바닥나기 때문이다.
   진앙 좌표는 선생님 기기에만 있고, 학생 폰에는 자기 관측소의 도착 시각만 간다.

   주소 뒤에 붙이는 것
     ?room=1234   학생: 그 방 번호를 미리 채운다 (QR 코드가 이 주소다)
     ?host=1234   선생님: 새로고침해도 열어 둔 방으로 돌아온다
     ?demo        가상 학생 24명과 미리 해 보기 (서버 없이 이 기기 안에서만)
     ?local       서버 대신 같은 브라우저의 탭끼리만 연결 (개발·연습용) */
(() => {
  'use strict';
  const M = window.QuakeModel, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  // ── 설정 ─────────────────────────────────────────────────────
  // Firebase 콘솔 → 빌드 → Realtime Database → 데이터베이스 만들기 를 한 뒤
  // 화면 위쪽에 나오는 주소(https://….firebasedatabase.app 또는 ….firebaseio.com)를 databaseURL 에 넣는다.
  // 같은 화면의 '규칙' 탭에는 quake-database.rules.json 내용을 붙여 넣는다 (진앙은 선생님만 읽을 수 있게).
  const FIREBASE = {
    apiKey: 'AIzaSyDyscbvZ4d9dCKHa4EcKEKEKFJJeJTPets',
    authDomain: 'sehwa-f2f95.firebaseapp.com',
    projectId: 'sehwa-f2f95',
    appId: '1:538221310192:web:c0c949065d362562cad235',
    databaseURL: 'https://sehwa-f2f95-default-rtdb.firebaseio.com'
  };
  const FB = 'https://www.gstatic.com/firebasejs/11.6.1/';
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  const SCHOOL = {lat: 37.4985, lon: 126.9962};  // 지도의 기준점 (세화여고)
  const ROOT = 'quake/rooms';
  const params = new URLSearchParams(location.search);
  const DB_URL = params.get('db') || FIREBASE.databaseURL;
  const LOCAL_ONLY = params.has('local');

  // ── 작은 도구들 ─────────────────────────────────────────────
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = (v, d = 1) => (v < 0 && +Math.abs(v).toFixed(d) !== 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const signed = (v, d = 1) => (v > 0 && +v.toFixed(d) !== 0 ? '+' : '') + num(v, d);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const local = p => M.toLocal(SCHOOL, p);
  const geo = q => M.toLatLon(SCHOOL, q);
  const entries = o => Object.entries(o || {});
  const randInt = () => Math.floor(Math.random() * 2 ** 31);
  const team = i => M.TEAMS[i] || {name: '?', color: '#8a96a3'};
  const pref = (k, d) => { try { const v = localStorage.getItem('quake:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('quake:' + k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 동작에는 지장 없음 */ } };
  const INTENSITY_COLORS = ['', '#cfd8dc', '#a5d8ff', '#74c0fc', '#63e6be', '#ffe066', '#ffc078', '#ff922b', '#f03e3e', '#c2255c', '#862e9c'];

  // ── 실시간 저장소 ─────────────────────────────────────────────
  // 두 가지가 같은 모양으로 동작한다: Firebase(실제 수업) / 이 브라우저 안(데모·연습).
  const parts = p => p.split('/').filter(Boolean);
  const copy = v => v == null ? null : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  function getIn(o, ps) {
    for (const k of ps) {
      if (o == null || typeof o !== 'object') return null;
      o = o[k];
    }
    return o === undefined ? null : o;
  }
  function setIn(rootObj, ps, val) {
    let o = rootObj;
    const trail = [];
    for (let i = 0; i < ps.length - 1; i++) {
      const k = ps[i];
      if (o[k] == null || typeof o[k] !== 'object') {
        if (val == null) return;
        o[k] = {};
      }
      trail.push([o, k]);
      o = o[k];
    }
    const last = ps[ps.length - 1];
    if (val == null) delete o[last];
    else o[last] = copy(val);
    // Firebase 처럼 빈 가지는 없앤다
    for (let i = trail.length - 1; i >= 0; i--) {
      const [p, k] = trail[i];
      if (p[k] && typeof p[k] === 'object' && !Object.keys(p[k]).length) delete p[k];
      else break;
    }
  }
  function merge(a, b) {
    if (b == null || typeof b !== 'object' || a == null || typeof a !== 'object') return b == null ? a : b;
    for (const k of Object.keys(b)) a[k] = merge(a[k], b[k]);
    return a;
  }

  class LocalStore {
    constructor() {
      this.kind = 'local';
      this.tree = {};
      this.subs = new Set();
      this.leave = [];
      let uid = null;
      try { uid = sessionStorage.getItem('quake-uid'); } catch (e) { /* 사생활 보호 모드 */ }
      if (!uid) {
        uid = 'u' + randInt().toString(36);
        try { sessionStorage.setItem('quake-uid', uid); } catch (e) { /* 그대로 진행 */ }
      }
      this.uid = uid;
      // 다른 탭이 지금 상태를 보내 줄 때까지 잠깐 기다린다 (아무도 없으면 0.4초 뒤 그냥 시작)
      this.ready = new Promise(ok => { this.readyOk = ok; setTimeout(ok, 400); });
      try {
        this.ch = new BroadcastChannel('campus-quake');
        this.ch.onmessage = e => this.receive(e.data);
        this.ch.postMessage({op: 'hello'});
      } catch (e) { this.ch = null; }
      addEventListener('pagehide', () => this.leave.forEach(([p, o]) => this.update(p, o)));
    }
    now() { return Date.now(); }
    receive(m) {
      if (m.op === 'hello') {
        if (Object.keys(this.tree).length) this.ch.postMessage({op: 'snap', tree: this.tree});
      } else if (m.op === 'snap') {
        this.tree = merge(copy(m.tree), this.tree);
        this.notify(['']);
        this.readyOk();
      } else if (m.op === 'write') {
        this.apply(m.writes, false);
      }
    }
    apply(writes, broadcast = true) {
      for (const [path, val] of writes) setIn(this.tree, parts(path), val);
      this.notify(writes.map(w => w[0]));
      if (broadcast && this.ch) this.ch.postMessage({op: 'write', writes});
    }
    notify(paths) {
      for (const s of this.subs) {
        const hit = paths.some(path => {
          const cp = parts(path), n = Math.min(cp.length, s.ps.length);
          for (let i = 0; i < n; i++) if (cp[i] !== s.ps[i]) return false;
          return true;
        });
        if (hit) s.cb(copy(getIn(this.tree, s.ps)));
      }
    }
    set(path, val) { this.apply([[path, val == null ? null : val]]); return Promise.resolve(); }
    update(path, obj) { this.apply(Object.keys(obj).map(k => [path + '/' + k, obj[k] == null ? null : obj[k]])); return Promise.resolve(); }
    remove(path) { return this.set(path, null); }
    get(path) { return Promise.resolve(copy(getIn(this.tree, parts(path)))); }
    on(path, cb) {
      const s = {ps: parts(path), cb};
      this.subs.add(s);
      cb(copy(getIn(this.tree, s.ps)));
      return () => this.subs.delete(s);
    }
    onLeave(path, obj) { this.leave.push([path, obj]); }
    onStatus(cb) { cb(true); }
  }

  async function firebaseStore() {
    if (!DB_URL) throw new Error('실시간 서버 주소(databaseURL)가 아직 비어 있어요. quake.js 맨 위 설정을 채워 주세요.');
    const [A, Auth, D] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js')
    ]);
    const app = A.getApps().find(a => a.name === 'quake') || A.initializeApp(Object.assign({}, FIREBASE, {databaseURL: DB_URL}), 'quake');
    const auth = Auth.getAuth(app);
    const user = await Promise.race([
      Auth.signInAnonymously(auth).then(c => c.user),
      new Promise((_, no) => setTimeout(() => no(new Error('서버 로그인이 10초 안에 끝나지 않았어요. 인터넷 연결을 확인해 주세요.')), 10000))
    ]);
    const db = D.getDatabase(app);
    let offset = 0;
    D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
    const ref = p => D.ref(db, p);
    return {
      kind: 'firebase',
      uid: user.uid,
      now: () => Date.now() + offset,
      set: (p, v) => D.set(ref(p), v),
      update: (p, o) => D.update(ref(p), o),
      remove: p => D.remove(ref(p)),
      get: p => D.get(ref(p)).then(s => s.val()),
      on: (p, cb) => D.onValue(ref(p), s => cb(s.val()), err => console.warn('[quake]', p, err.message)),
      onLeave: (p, o) => D.onDisconnect(ref(p)).update(o),
      onStatus: cb => D.onValue(ref('.info/connected'), s => cb(!!s.val()))
    };
  }
  async function openStore(demo) {
    if (!demo && !LOCAL_ONLY) return firebaseStore();
    const s = new LocalStore();
    await s.ready;
    return s;
  }

  // ── 소리·진동·화면 켜 두기 ─────────────────────────────────────
  // 아이폰 사파리는 웹에서 진동을 못 쓴다. 그래서 소리와 화면 흔들림이 주 신호이고, 진동은 안드로이드에서만 더한다.
  const Sound = {
    ctx: null, buf: null,
    unlock() {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 무음 스위치 우회는 지원 기기만 */ }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.resume) this.ctx.resume();
      // 아이폰은 사용자가 누른 순간에 소리를 한 번 내야 그다음부터 소리가 난다
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    },
    noise() {
      if (!this.buf) {
        const c = this.ctx, n = c.sampleRate * 3, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
        let last = 0;
        for (let i = 0; i < n; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 3.2; }
        this.buf = b;
      }
      return this.buf;
    },
    band(gain, dur, f, q, attack) {
      const c = this.ctx, t = c.currentTime;
      const src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise(); src.loop = true;
      flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt).connect(g).connect(c.destination);
      src.start(t); src.stop(t + dur + 0.05);
    },
    thump(f0, gain, dur) {
      const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    },
    play(kind, amp) {
      if (!this.ctx) return;
      const k = clamp(0.45 + 0.35 * amp, 0.4, 1);
      if (kind === 'p') {
        this.thump(170, 0.5 * k, 0.25);
        this.band(0.5 * k, 1.3, 1100, 1.4, 0.01);
      } else if (kind === 's') {
        this.thump(110, 0.9 * k, 0.7);
        this.band(1.0 * k, 3.6, 220, 0.8, 0.04);
        this.band(0.35 * k, 2.6, 1800, 2, 0.08); // 물건이 덜그럭거리는 소리
      } else {
        this.thump(660, 0.25, 0.18);
      }
    }
  };
  const buzz = pattern => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 진동 없는 기기 */ } };
  const Wake = {
    want: false, lock: null,
    async on() {
      this.want = true;
      try { if (navigator.wakeLock) this.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* 지원 안 하면 그냥 둔다 */ }
    }
  };
  document.addEventListener('visibilitychange', () => { if (Wake.want && document.visibilityState === 'visible') Wake.on(); });

  function shake(kind) {
    const root = $('shake-root');
    root.classList.remove('shake-p', 'shake-s');
    void root.offsetWidth;
    root.classList.add('shake-' + kind);
    const f = document.createElement('div');
    f.className = 'flash ' + kind;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
    setTimeout(() => root.classList.remove('shake-' + kind), kind === 's' ? 2600 : 1100);
  }

  // ── 관측망 지도 (SVG, 단위 m) ───────────────────────────────────
  // 바탕 지도 없이도 격자와 축척 막대로 거리를 읽을 수 있게 그린다. 위성 사진은 불러와지면 깔고, 안 되면 조용히 뺀다.
  const TILE = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const MIN_S = 0.15, MAX_S = 40;   // 화면 1px 당 m 의 역수 (확대 한계)
  class FieldMap {
    constructor(svg, opts = {}) {
      this.svg = svg;
      this.opts = opts;
      this.view = {x: 0, y: 0, s: 3};
      this.target = null;
      this.auto = true;
      this.follow = false;
      this.sat = pref('sat', true);
      this.tiles = new Map();
      this.tileOk = 0; this.tileBad = 0;
      this.w = 1; this.h = 1;
      this.L = {};
      for (const k of ['tiles', 'grid', 'fill', 'circles', 'chords', 'waves', 'acc', 'players', 'guess', 'marks', 'hud']) this.L[k] = el('g', {class: 'fm-' + k}, svg);
      this.pointers = new Map();
      this.bind();
      const ro = new ResizeObserver(() => { this.resize(); this.draw(this.scene); });
      ro.observe(svg);
      this.resize();
    }
    resize() {
      const r = this.svg.getBoundingClientRect();
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.svg.setAttribute('viewBox', `0 0 ${this.w} ${this.h}`);
    }
    X(p) { return this.w / 2 + (p.x - this.view.x) * this.view.s; }
    Y(p) { return this.h / 2 - (p.y - this.view.y) * this.view.s; }
    world(px, py) { return {x: this.view.x + (px - this.w / 2) / this.view.s, y: this.view.y - (py - this.h / 2) / this.view.s}; }
    bind() {
      const svg = this.svg;
      const pos = e => { const r = svg.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
      // 손가락 수가 바뀔 때마다 기준(손가락 위치, 그때의 지도)을 새로 잡는다.
      // 그래야 두 손가락으로 확대한 뒤 한 손가락이 남아 끌어도 지도가 확대 전으로 튀지 않는다.
      const rebase = () => {
        const pts = [...this.pointers.values()], g = this.gesture;
        this.gesture = pts.length ? {pts: pts.map(p => Object.assign({}, p)), view: Object.assign({}, this.view), moved: g ? g.moved : 0, multi: (g && g.multi) || pts.length > 1} : null;
      };
      svg.addEventListener('pointerdown', e => {
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* 이미 떨어진 손가락 */ }
        this.pointers.set(e.pointerId, pos(e));
        rebase();
      });
      svg.addEventListener('pointermove', e => {
        if (!this.pointers.has(e.pointerId) || !this.gesture) return;
        this.pointers.set(e.pointerId, pos(e));
        const g = this.gesture, pts = [...this.pointers.values()];
        if (pts.length >= 2 && g.pts.length >= 2) {
          const [a, b] = pts, [a0, b0] = g.pts, v = g.view;
          const d = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.max(1, Math.hypot(a0.x - b0.x, a0.y - b0.y));
          const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, mid0 = {x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2};
          const s = clamp(v.s * d / d0, MIN_S, MAX_S);
          const wx = v.x + (mid0.x - this.w / 2) / v.s, wy = v.y - (mid0.y - this.h / 2) / v.s;
          this.view = {s, x: wx - (mid.x - this.w / 2) / s, y: wy + (mid.y - this.h / 2) / s};
          g.moved = Infinity;
          this.manual(false);
        } else if (pts.length === 1 && g.pts.length === 1) {
          const dx = pts[0].x - g.pts[0].x, dy = pts[0].y - g.pts[0].y;
          g.moved = Math.max(g.moved, Math.hypot(dx, dy));
          if (g.moved > 6) {
            this.view = {s: g.view.s, x: g.view.x - dx / g.view.s, y: g.view.y + dy / g.view.s};
            this.manual(true);
          }
        }
      });
      const up = e => {
        if (!this.pointers.has(e.pointerId)) return;
        const p = pos(e), g = this.gesture;
        this.pointers.delete(e.pointerId);
        if (this.pointers.size) { rebase(); return; }
        this.gesture = null;
        if (e.type === 'pointerup' && g && g.moved <= 6 && !g.multi && this.opts.onTap) this.opts.onTap(this.world(p.x, p.y));
      };
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const p = pos(e), w = this.world(p.x, p.y), s = clamp(this.view.s * Math.exp(-e.deltaY * 0.0015), MIN_S, MAX_S);
        this.view = {s, x: w.x - (p.x - this.w / 2) / s, y: w.y + (p.y - this.h / 2) / s};
        this.manual(false);
      }, {passive: false});
      // 아이폰 사파리: 지도 위에서 두 손가락을 쓰면 페이지 전체가 같이 확대·스크롤되는 것을 막는다
      for (const t of ['gesturestart', 'gesturechange', 'gestureend']) svg.addEventListener(t, e => e.preventDefault());
      svg.addEventListener('touchmove', e => e.preventDefault(), {passive: false});
    }
    // 손으로 지도를 움직이면 '모두 보기'는 꺼진다. 끌어서 옮겼으면 '내 위치 따라가기'도 꺼진다.
    manual(panned) {
      this.auto = false;
      this.target = null;
      if (panned) this.follow = false;
      this.draw(this.scene);
      this.mode();
    }
    mode() { if (this.opts.onMode) this.opts.onMode(this.auto ? 'fit' : this.follow ? 'follow' : 'free'); }
    fitNow() { this.auto = true; this.follow = false; this.target = null; this.draw(this.scene, true); this.mode(); }
    zoomBy(f) {
      this.view = Object.assign({}, this.view, {s: clamp(this.view.s * f, MIN_S, MAX_S)});
      this.manual(false);
    }
    // 내 위치(scene.focus)를 가운데 두고 계속 따라간다. 너무 멀리 축소돼 있으면 운동장이 보일 만큼 당겨 온다.
    followNow() {
      this.auto = false;
      this.follow = true;
      const f = this.scene && this.scene.focus;
      if (f) this.view = {x: f.x, y: f.y, s: Math.max(this.view.s, Math.min(this.w, this.h) / 90)};
      this.draw(this.scene);
      this.mode();
    }
    centerOn(p, span = 50) {
      this.auto = false;
      this.follow = false;
      this.view = {x: p.x, y: p.y, s: clamp(Math.max(this.view.s, Math.min(this.w, this.h) / span), MIN_S, MAX_S)};
      this.draw(this.scene);
      this.mode();
    }
    toggleSat() { this.sat = !this.sat; setPref('sat', this.sat); this.tileBad = this.tileOk = 0; this.draw(this.scene); return this.sat; }
    satShown() { return this.sat && !(this.tileBad >= 3 && !this.tileOk); }
    autoFit(scene, snap) {
      const pts = scene.fit || [];
      if (!pts.length) return;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) {
        const r = p.r || 0;
        x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
        y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
      }
      const span = scene.minSpan || 60;
      const sx = Math.max(x1 - x0, span), sy = Math.max(y1 - y0, span);
      const s = clamp(Math.min(this.w / (sx * 1.18), this.h / (sy * 1.22)), MIN_S, 30);
      const t = {x: (x0 + x1) / 2, y: (y0 + y1) / 2, s};
      if (snap || !this.target) this.view = t;
      else {
        // 사람이 조금씩 움직일 때 지도가 덜컹거리지 않게 천천히 따라간다
        const k = 0.15;
        this.view = {x: this.view.x + (t.x - this.view.x) * k, y: this.view.y + (t.y - this.view.y) * k, s: this.view.s * Math.pow(t.s / this.view.s, k)};
      }
      this.target = t;
    }
    draw(scene, snap) {
      if (!scene) return;
      this.scene = scene;
      if (this.auto) this.autoFit(scene, snap);
      else if (this.follow && scene.focus) {
        const k = snap ? 1 : 0.25;
        this.view = {s: this.view.s, x: this.view.x + (scene.focus.x - this.view.x) * k, y: this.view.y + (scene.focus.y - this.view.y) * k};
      }
      const L = this.L, s = this.view.s;
      for (const k of ['grid', 'fill', 'circles', 'chords', 'waves', 'acc', 'players', 'guess', 'marks', 'hud']) clear(L[k]);
      this.drawTiles();
      const sat = this.satShown();
      this.svg.style.background = sat ? '#3b4a3f' : '';
      // 격자: 화면에 6~10칸 정도 보이는 간격
      const stepM = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(v => v * s >= 46) || 1000;
      const g = L.grid;
      g.setAttribute('class', 'fm-grid' + (sat ? ' sat' : ''));
      const tl = this.world(0, 0), br = this.world(this.w, this.h);
      for (let x = Math.ceil(tl.x / stepM) * stepM; x <= br.x; x += stepM) el('line', {x1: this.X({x}), x2: this.X({x}), y1: 0, y2: this.h}, g);
      for (let y = Math.ceil(br.y / stepM) * stepM; y <= tl.y; y += stepM) el('line', {y1: this.Y({y}), y2: this.Y({y}), x1: 0, x2: this.w}, g);
      // 채움 (진도 등)
      for (const f of scene.fills || []) el('circle', {cx: this.X(f), cy: this.Y(f), r: f.r * s, fill: f.color, opacity: f.opacity || 0.25}, L.fill);
      // 판독 원
      for (const c of scene.circles || []) {
        el('circle', {class: 'fm-circle' + (c.mine ? ' mine' : ''), cx: this.X(c), cy: this.Y(c), r: Math.max(0, c.r * s), stroke: c.color, 'stroke-opacity': c.faint ? 0.35 : null}, L.circles);
      }
      for (const [a, b] of scene.chords || []) el('line', {class: 'fm-chord', x1: this.X(a), y1: this.Y(a), x2: this.X(b), y2: this.Y(b)}, L.chords);
      for (const w of scene.waves || []) if (w.r > 0) el('circle', {class: 'fm-wave ' + w.kind, cx: this.X(w), cy: this.Y(w), r: w.r * s, opacity: w.opacity == null ? 0.9 : w.opacity}, L.waves);
      // 관측소 — 이름표는 서로 겹치지 않는 것만 단다
      const placed = [];
      const labelFits = (x, y) => {
        if (placed.some(q => Math.abs(q.x - x) < 46 && Math.abs(q.y - y) < 14)) return false;
        placed.push({x, y});
        return true;
      };
      for (const p of scene.players || []) {
        const x = this.X(p), y = this.Y(p);
        if (p.acc && p.showAcc) el('circle', {class: 'fm-acc', cx: x, cy: y, r: Math.max(6, p.acc * s)}, L.acc);
        const gp = el('g', {class: 'fm-player', opacity: p.off ? 0.35 : 1}, L.players);
        if (p.ring) el('circle', {cx: x, cy: y, r: p.ring.r, fill: 'none', stroke: p.ring.color, 'stroke-width': p.ring.w || 3, opacity: p.ring.opacity == null ? 1 : p.ring.opacity}, gp);
        el('circle', {cx: x, cy: y, r: p.big ? 9 : 7, fill: p.color, stroke: '#fff', 'stroke-width': p.big ? 3 : 2.2}, gp);
        if (p.badge) el('text', {x, y: y + 3.5, 'text-anchor': 'middle', style: 'font-size:9px;fill:#fff;stroke:none;font-weight:900'}, gp, p.badge);
        if (p.label && labelFits(x, y + 21)) el('text', {x, y: y + 21, 'text-anchor': 'middle'}, gp, p.label);
      }
      // 모둠 추정 진앙 (깃발)
      for (const q of scene.guesses || []) {
        const x = this.X(q), y = this.Y(q), gq = el('g', {}, L.guess);
        el('path', {d: `M${x} ${y} v-26`, stroke: '#14283a', 'stroke-width': 2}, gq);
        el('path', {d: `M${x} ${y - 26} h18 l-5 6 l5 6 h-18 z`, fill: q.color, stroke: '#14283a', 'stroke-width': 1.2}, gq);
        el('circle', {cx: x, cy: y, r: 3, fill: '#14283a'}, gq);
        if (q.label) el('text', {class: 'fm-label', x: x + 21, y: y - 15, fill: '#14283a'}, gq, q.label);
      }
      // 표시 (진앙, 반 전체 추정, 내 위치)
      for (const m of scene.marks || []) this.mark(m);
      this.hud(stepM);
      this.edges(scene);
    }
    // 화면 밖에 있는 관측소는 지도 가장자리에 화살표로 알려 준다 (어느 쪽으로 몇 m 떨어져 있는지)
    edges(scene) {
      const pad = 18, cx = this.w / 2, cy = this.h / 2, g = this.L.hud;
      const items = (scene.players || []).filter(p => !p.off).map(p => ({p, color: p.color, label: ''}));
      for (const m of scene.marks || []) if (m.kind === 'me' || m.kind === 'epi') items.push({p: m, color: m.kind === 'me' ? '#1f6feb' : '#e8590c', label: m.kind === 'me' ? (m.label || '나') : '진앙'});
      for (const it of items) {
        const x = this.X(it.p), y = this.Y(it.p);
        if (x >= 0 && x <= this.w && y >= 0 && y <= this.h) continue;
        const dx = x - cx, dy = y - cy;
        const k = Math.min((cx - pad) / Math.max(Math.abs(dx), 1e-6), (cy - pad) / Math.max(Math.abs(dy), 1e-6));
        const ex = cx + dx * k, ey = cy + dy * k, a = Math.atan2(dy, dx) * 180 / Math.PI;
        const arrow = el('g', {transform: `translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${a.toFixed(1)})`}, g);
        el('path', {d: 'M9 0 L-6 -7 L-3 0 L-6 7 Z', fill: it.color, stroke: '#fff', 'stroke-width': 1.6}, arrow);
        if (it.label) el('text', {class: 'fm-label', x: ex, y: ey - 12, 'text-anchor': 'middle', fill: it.color}, g, it.label);
      }
    }
    mark(m) {
      const x = this.X(m), y = this.Y(m), g = el('g', {}, this.L.marks);
      if (m.kind === 'epi') {
        for (const r of [16, 28]) el('circle', {cx: x, cy: y, r, fill: 'none', stroke: '#e8590c', 'stroke-width': 2, opacity: r === 16 ? 0.8 : 0.4}, g);
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5 : 12;
          pts.push((x + r * Math.cos(a)).toFixed(1) + ',' + (y + r * Math.sin(a)).toFixed(1));
        }
        el('polygon', {points: pts.join(' '), fill: '#e8590c', stroke: '#fff', 'stroke-width': 2}, g);
        if (m.label) el('text', {class: 'fm-label', x, y: y - 34, 'text-anchor': 'middle', fill: '#c2410c'}, g, m.label);
      } else if (m.kind === 'est') {
        el('path', {d: `M${x - 13} ${y}h26M${x} ${y - 13}v26`, stroke: '#14283a', 'stroke-width': 3}, g);
        el('circle', {cx: x, cy: y, r: 8, fill: 'none', stroke: '#14283a', 'stroke-width': 2.5}, g);
        if (m.label) el('text', {class: 'fm-label', x: x + 14, y: y + 22, fill: '#14283a'}, g, m.label);
      } else if (m.kind === 'me') {
        el('circle', {cx: x, cy: y, r: Math.max(10, (m.acc || 0) * this.view.s), class: 'fm-acc'}, g);
        el('circle', {cx: x, cy: y, r: 9, fill: '#1f6feb', stroke: '#fff', 'stroke-width': 3.5}, g);
        el('text', {class: 'fm-label', x, y: y - 16, 'text-anchor': 'middle', fill: '#1f6feb'}, g, m.label || '나');
      } else if (m.kind === 'station') {
        el('path', {d: `M${x} ${y - 11} l9 16 h-18 z`, fill: m.color || '#14283a', stroke: '#fff', 'stroke-width': 2}, g);
        if (m.label) el('text', {class: 'fm-label', x, y: y + 20, 'text-anchor': 'middle', fill: '#14283a'}, g, m.label);
      }
    }
    hud(stepM) {
      const g = this.L.hud, y = this.h - 24, x = 14, len = stepM * this.view.s;
      const sc = el('g', {class: 'fm-scale'}, g);
      el('line', {x1: x, y1: y, x2: x + len, y2: y}, sc);
      el('line', {x1: x, y1: y - 5, x2: x, y2: y + 1}, sc);
      el('line', {x1: x + len, y1: y - 5, x2: x + len, y2: y + 1}, sc);
      el('text', {x: x + len + 6, y: y + 4}, sc, stepM + ' m');
      const n = el('g', {class: 'fm-north'}, g), nx = x + len + 60;
      el('path', {d: `M${nx} ${y - 14} l5 12 l-5 -3 l-5 3 z`, fill: '#14283a', stroke: '#fff', 'stroke-width': 1}, n);
      el('text', {x: nx, y: y + 9, 'text-anchor': 'middle'}, n, 'N');
    }
    drawTiles() {
      const layer = this.L.tiles;
      if (!this.sat || (this.tileBad >= 3 && !this.tileOk)) {
        clear(layer); this.tiles.clear();
        if (this.opts.credit) this.opts.credit('');
        return;
      }
      const cosLat = Math.cos(SCHOOL.lat * Math.PI / 180);
      const z = clamp(Math.round(Math.log2(40075016.686 * cosLat * this.view.s / 256)), 13, 19), n = 2 ** z;
      const tl = geo(this.world(0, 0)), br = geo(this.world(this.w, this.h));
      const tx = lon => (lon + 180) / 360 * n;
      const ty = lat => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
      const lonOf = x => x / n * 360 - 180, latOf = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
      const x0 = Math.floor(tx(tl.lon)), x1 = Math.floor(tx(br.lon)), y0 = Math.floor(ty(tl.lat)), y1 = Math.floor(ty(br.lat));
      const keep = new Set();
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 64) {
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const key = `${z}/${x}/${y}`;
          keep.add(key);
          let img = this.tiles.get(key);
          if (!img) {
            img = el('image', {href: TILE(z, x, y), preserveAspectRatio: 'none'}, layer);
            img.addEventListener('load', () => { this.tileOk++; });
            img.addEventListener('error', () => { this.tileBad++; img.remove(); if (this.tileBad === 3 && !this.tileOk) this.draw(this.scene); });
            this.tiles.set(key, img);
          }
          const a = local({lat: latOf(y), lon: lonOf(x)}), b = local({lat: latOf(y + 1), lon: lonOf(x + 1)});
          img.setAttribute('x', this.X(a)); img.setAttribute('y', this.Y(a));
          img.setAttribute('width', Math.max(0, this.X(b) - this.X(a)) + 0.6);
          img.setAttribute('height', Math.max(0, this.Y(b) - this.Y(a)) + 0.6);
        }
      }
      for (const [k, img] of this.tiles) if (!keep.has(k)) { img.remove(); this.tiles.delete(k); }
      if (this.opts.credit) this.opts.credit('위성 사진 © Esri, Maxar, Earthstar Geographics');
    }
  }

  // '모두 보기'에 넣을 관측소: 연결돼 있고, 최근에 위치를 보냈고, GPS 가 엉뚱하지 않은 것만.
  // (꺼진 폰이나 오차 수백 m 짜리 첫 위치 하나 때문에 지도가 멀리 축소되지 않게)
  const fitWorthy = (p, now) => p.on !== false && now - (p.t || 0) < 30000 && (p.acc == null || p.acc <= 60);

  // 지도 오른쪽 위 단추들. prefix 는 'st'(학생) 또는 't'(선생님).
  function bindMapTools(prefix, map, onMe) {
    const q = sel => document.querySelectorAll(`[${sel}^="${prefix}"]`);
    for (const b of q('data-fit')) b.onclick = () => map.fitNow();
    for (const b of q('data-sat')) b.onclick = () => { b.setAttribute('aria-pressed', String(map.toggleSat())); };
    for (const b of q('data-me')) b.onclick = onMe;
    for (const b of document.querySelectorAll(`[data-zoom-map^="${prefix}:"]`)) b.onclick = () => map.zoomBy(+b.dataset.zoomMap.split(':')[1]);
    map.opts.onMode = mode => {
      for (const b of q('data-fit')) b.setAttribute('aria-pressed', String(mode === 'fit'));
      for (const b of q('data-me')) b.setAttribute('aria-pressed', String(mode === 'follow'));
    };
  }

  // ── 지진 기록 그리기 (캔버스) ───────────────────────────────────
  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {ctx, w: r.width, h: r.height};
  }
  // 기록지 위에 t0~t1 구간의 파형을 그린다. 큰 진폭은 펜이 종이 밖으로 나가지 않게 부드럽게 눌러 준다.
  function drawTrace(ctx, data, box, t0, t1, gain, opts = {}) {
    const {x, y, w, h} = box, mid = y + h / 2, half = h / 2 - 6;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    // 1초 눈금
    const span = t1 - t0, step = span > 40 ? 5 : span > 16 ? 2 : span > 6 ? 1 : 0.5;
    ctx.lineWidth = 1;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      const px = x + (t - t0) / span * w;
      ctx.strokeStyle = Math.abs(t % (step * 5)) < 1e-6 ? '#e1d6bd' : '#eee6d4';
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
    }
    ctx.strokeStyle = '#e6dcc6';
    ctx.beginPath(); ctx.moveTo(x, mid); ctx.lineTo(x + w, mid); ctx.stroke();
    // 파형
    const i0 = Math.max(0, Math.floor(t0 * M.RATE)), i1 = Math.min(data.length - 1, Math.ceil(Math.min(t1, opts.until == null ? t1 : opts.until) * M.RATE));
    ctx.strokeStyle = '#1b1f23'; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
    ctx.beginPath();
    const pxPerSample = w / (span * M.RATE);
    if (pxPerSample >= 1) {
      for (let i = i0; i <= i1; i++) {
        const px = x + (i / M.RATE - t0) / span * w, v = Math.tanh(data[i] * gain * 0.9);
        if (i === i0) ctx.moveTo(px, mid - v * half); else ctx.lineTo(px, mid - v * half);
      }
    } else {
      // 화면 한 픽셀에 여러 표본이 들어가면 그 칸의 최소~최대를 세로선으로 그린다 (펜 자국처럼)
      for (let px = 0; px < w; px++) {
        const a = Math.floor((t0 + px / w * span) * M.RATE), b = Math.floor((t0 + (px + 1) / w * span) * M.RATE);
        if (b < i0 || a > i1) continue;
        let lo = Infinity, hi = -Infinity;
        for (let i = Math.max(a, i0); i <= Math.min(b, i1); i++) { const v = Math.tanh(data[i] * gain * 0.9); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        if (lo === Infinity) continue;
        ctx.moveTo(x + px + 0.5, mid - hi * half); ctx.lineTo(x + px + 0.5, mid - lo * half - 0.5);
      }
    }
    ctx.stroke();
    ctx.restore();
    // 시간 눈금 글자
    if (opts.labels) {
      ctx.fillStyle = '#8a7a5c'; ctx.font = '600 11px ui-monospace, monospace'; ctx.textAlign = 'center';
      const lstep = step * (span / step > 14 ? 5 : 2);
      for (let t = Math.ceil(t0 / lstep) * lstep; t <= t1 + 1e-6; t += lstep) ctx.fillText(num(t, lstep < 1 ? 1 : 0) + 's', x + (t - t0) / span * w, y + h + 14);
    }
  }
  function drawPickLine(ctx, box, t0, t1, t, color, label, active) {
    if (t == null || t < t0 || t > t1) return;
    const px = box.x + (t - t0) / (t1 - t0) * box.w;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = active ? 3 : 2;
    ctx.setLineDash(active ? [] : [5, 4]);
    ctx.beginPath(); ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px - 13, box.y + 2, 26, 20, 6) : ctx.rect(px - 13, box.y + 2, 26, 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, px, box.y + 16.5);
    ctx.restore();
  }

  // ── QR 코드 ──────────────────────────────────────────────
  let qrReady = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (!qrReady) qrReady = new Promise((ok, no) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return qrReady;
  }
  async function drawQR(box, text) {
    clear(box);
    try {
      await loadQR();
      const q = window.qrcode(0, 'M');
      q.addData(text); q.make();
      const n = q.getModuleCount(), m = 2;
      const svg = el('svg', {viewBox: `0 0 ${n + 2 * m} ${n + 2 * m}`, 'shape-rendering': 'crispEdges'}, box);
      el('rect', {width: n + 2 * m, height: n + 2 * m, fill: '#fff'}, svg);
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
      el('path', {d, fill: '#14283a'}, svg);
    } catch (e) {
      box.textContent = 'QR 코드를 불러오지 못했어요. 방 번호를 칠판에 적어 주세요.';
    }
  }

  // ════════════════════════════════════════════════════════════
  //  학생: 관측소
  // ════════════════════════════════════════════════════════════
  const S = {
    store: null, code: '', base: '', name: '', team: 0,
    meta: null, arr: null, picks: {}, guesses: {}, players: {}, reveal: null,
    fix: null, manual: false, sent: {t: 0, lat: 0, lon: 0}, gpsError: null, gpsSince: 0,
    rec: null, pick: {p: null, s: null, active: 'p'}, view: {zoom: 'all', gain: 1}, tab: 'map',
    lastMsg: 0, replayAt: 0, map: null, closed: false, connected: true
  };

  function stState() {
    const m = S.meta;
    if (S.closed || !m) return 'closed';
    const round = m.round;
    const rec = S.rec && S.rec.round === round ? S.rec : null;
    if (m.phase === 'lobby') return S.fix ? 'lobby' : 'nofix';
    if (m.phase === 'reveal' && S.reveal && S.reveal.round === round) return 'reveal';
    if (!rec) return m.phase === 'race' ? 'race' : 'missed';
    const el = (S.store.now() - m.startAt) / 1000;
    if (el < 0) return 'countdown';
    if (el < rec.end) return 'recording';
    const mine = myPick();
    if (m.phase === 'race') return mine ? 'race' : 'picking';
    return mine && !S.repick ? 'submitted' : 'picking';
  }
  const myPick = () => { const p = S.picks[S.store.uid]; return p && S.meta && p.round === S.meta.round ? p : null; };
  const roundPicks = () => entries(S.picks).filter(([, p]) => S.meta && p.round === S.meta.round);

  async function joinRoom(code, name, teamIdx) {
    const err = $('join-error');
    err.hidden = true;
    Sound.unlock();
    Wake.on();
    startGPS();
    try {
      S.store = await openStore(false);
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
      return;
    }
    S.code = code; S.base = `${ROOT}/${code}`; S.name = name; S.team = teamIdx;
    const meta = await S.store.get(S.base + '/meta');
    if (!meta) {
      err.textContent = `${code}번 방을 찾을 수 없어요. 방 번호를 다시 확인해 주세요.`;
      err.hidden = false;
      return;
    }
    setPref('me', {name, team: teamIdx});
    const me = S.base + '/players/' + S.store.uid;
    await S.store.update(me, {name, team: teamIdx, on: true, joined: S.store.now()});
    S.store.onLeave(me, {on: false});
    S.store.onStatus(on => { S.connected = on; $('st-conn').className = 'conn ' + (on ? 'on' : 'off'); if (on) S.store.update(me, {on: true}); });
    S.store.on(S.base + '/meta', v => { S.closed = !v; onStudentMeta(v); });
    S.store.on(S.base + '/arr/' + S.store.uid, v => { S.arr = v; prepareRecord(); dirty(); });
    S.store.on(S.base + '/picks', v => { S.picks = v || {}; dirty(); });
    S.store.on(S.base + '/guesses', v => { S.guesses = v || {}; dirty(); });
    S.store.on(S.base + '/players', v => { S.players = v || {}; dirty(); });
    S.store.on(S.base + '/reveal', v => { S.reveal = v; if (v) S.replayAt = performance.now(); dirty(); });
    history.replaceState(null, '', '?room=' + code + (LOCAL_ONLY ? '&local' : ''));
    showScreen('student');
    $('st-name').textContent = `${team(teamIdx).name} · ${name}`;
    $('st-room').textContent = `방 ${code}`;
    $('st-team-dot').style.background = team(teamIdx).color;
    // 가만히 서 있으면 GPS 가 새 값을 안 줄 때가 있다. 그래도 '살아 있음'은 5초마다 알린다.
    setInterval(() => sendPos(), 2500);
    S.map = new FieldMap($('st-map'), {
      onTap: w => { if (S.manual || S.gpsError) setManual(w); },
      credit: t => { $('st-credit').textContent = t; }
    });
    bindMapTools('st', S.map, () => {
      if (!S.fix) { toast('아직 내 위치를 못 찾았어요. 하늘이 트인 곳에서 잠시 기다려 주세요.'); return; }
      S.map.followNow();
    });
    loop();
  }

  function onStudentMeta(m) {
    const prev = S.meta;
    S.meta = m;
    if (m && (!prev || prev.round !== m.round)) { S.pick = {p: null, s: null, active: 'p'}; S.repick = false; S.rec = null; prepareRecord(); }
    if (m && m.msg && m.msg.t > S.lastMsg) {
      const fresh = S.store.now() - m.msg.t < 90000;
      S.lastMsg = m.msg.t;
      if (fresh) toast(m.msg.text, '선생님');
    }
    if (m && prev && prev.phase !== m.phase && m.phase === 'race') { S.tab = 'map'; Sound.play('ding'); }
    prepareRecord();
    dirty();
  }

  function prepareRecord() {
    const m = S.meta, a = S.arr;
    if (!m || !a || a.round !== m.round || !m.startAt) return;
    if (S.rec && S.rec.round === m.round && S.rec.startAt === m.startAt) return;
    const arr = {p: a.p, s: a.s};
    S.rec = {round: m.round, startAt: m.startAt, a: arr, amp: a.amp, I: a.I, data: M.synthesize(arr, a.amp, a.seed), end: M.recordLength(arr), played: {p: false, s: false}};
    S.tab = 'seis';
  }

  // GPS
  function startGPS() {
    S.gpsSince = Date.now();
    if (!navigator.geolocation) { S.gpsError = '이 브라우저는 위치를 쓸 수 없어요.'; return; }
    navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      S.gpsLast = {acc: c.accuracy, t: Date.now()};
      if (S.manual) { dirty(); return; }
      S.gpsError = null;
      S.fix = M.blendFix(S.fix, {lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: Date.now()});
      S.rawAcc = c.accuracy;
      sendPos();
      dirty();
    }, err => {
      S.gpsError = err.code === 1
        ? '위치 권한이 꺼져 있어요. 설정 → 개인정보 보호 및 보안 → 위치 서비스 → Safari 웹 사이트 → "앱을 사용하는 동안"으로 바꾼 뒤 새로고침해 주세요.'
        : '위치를 아직 못 찾았어요. 하늘이 트인 곳으로 가 보세요.';
      dirty();
    }, {enableHighAccuracy: true, maximumAge: 0, timeout: 30000});
  }
  function setManual(w) {
    S.manual = true;
    const g = geo(w);
    S.fix = {lat: g.lat, lon: g.lon, acc: 1, t: Date.now()};
    S.rawAcc = 1;
    sendPos(true);
    dirty();
  }
  function sendPos(force) {
    if (!S.store || !S.fix) return;
    const now = Date.now(), moved = M.geoDist(S.sent, S.fix);
    if (!force && (now - S.sent.t < 1000 || (moved < 1 && now - S.sent.t < 5000))) return;
    S.sent = {t: now, lat: S.fix.lat, lon: S.fix.lon};
    S.store.update(S.base + '/players/' + S.store.uid, {
      lat: +S.fix.lat.toFixed(7), lon: +S.fix.lon.toFixed(7), acc: Math.round(S.rawAcc || S.fix.acc), t: S.store.now(), manual: S.manual || null, on: true
    });
  }

  let toastTimer = 0;
  function toast(text, who) {
    const t = $('st-toast');
    t.innerHTML = `${esc(text)}${who ? `<small>${esc(who)}</small>` : ''}`;
    t.hidden = false;
    Sound.play('ding');
    buzz(120);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 7000);
  }

  // 화면 갱신
  let isDirty = true;
  const dirty = () => { isDirty = true; };
  let lastCard = '';
  function renderStudent() {
    const state = stState(), m = S.meta || {}, sc = M.scaleOf(m.scale), k = M.omori(sc);
    const rec = S.rec && m.round === S.rec.round ? S.rec : null;
    // GPS 알약
    const gps = $('st-gps');
    if (S.manual) { gps.textContent = '직접 찍은 위치'; gps.className = 'pill ok'; }
    else if (!S.fix) { gps.textContent = S.gpsError ? 'GPS 꺼짐' : 'GPS 찾는 중'; gps.className = 'pill bad'; }
    else { const a = Math.round(S.rawAcc || S.fix.acc); gps.textContent = `GPS ±${a} m`; gps.className = 'pill ' + (a <= 8 ? 'good' : a <= 20 ? 'ok' : 'bad'); }

    let card = '', action = '', cls = '';
    const elapsed = rec ? (S.store.now() - m.startAt) / 1000 : 0;
    if (state === 'closed') {
      card = `<p class="kicker">수업 끝</p><h2>선생님이 방을 닫았어요</h2><p>함께 관측해 줘서 고마워요!</p>`;
    } else if (state === 'nofix') {
      const late = Date.now() - S.gpsSince > 12000;
      card = `<p class="kicker">관측소 준비</p><h2>내 위치를 찾고 있어요…</h2><p>${esc(S.gpsError || '하늘이 트인 운동장에서 잠시만 기다려 주세요.')}</p>`;
      if (late || S.gpsError) action = `<button id="st-manual">지도에서 내 위치 직접 찍기</button>`;
    } else if (state === 'lobby') {
      const acc = S.manual ? 0 : Math.round(S.rawAcc || S.fix.acc);
      card = `<p class="kicker">관측 대기 · ${m.round}번째 지진</p><h2>이 폰은 이제 지진 관측소입니다</h2>
        <p>선생님이 지진을 일으키면 지진파가 도착할 때 <b>소리와 함께 화면이 흔들려요</b>. 소리를 켜 두고, 지진이 나면 그 자리에 멈춰 서 있어요.</p>
        ${acc > 20 ? `<p><b>GPS 오차가 ±${acc} m로 커요.</b> 건물에서 떨어져 하늘이 트인 곳으로 가면 좋아져요.</p>` : ''}
        ${S.manual ? '<p>지도를 눌러 내 위치를 옮길 수 있어요.</p>' : ''}`;
      action = `<button id="st-sound">🔊 소리 확인</button>`;
      if (S.manual && S.gpsLast && Date.now() - S.gpsLast.t < 15000) action += `<button id="st-gps-back">📡 GPS로 돌아가기 (±${Math.round(S.gpsLast.acc)} m)</button>`;
    } else if (state === 'countdown') {
      cls = 'alert';
      card = `<p class="kicker">지진 발생 직전</p><div class="big-num">${Math.ceil(-elapsed)}</div><p>그 자리에 멈추세요. 폰을 손에 들고 화면을 보세요.</p>`;
    } else if (state === 'recording') {
      cls = 'alert';
      card = `<p class="kicker">지진 기록 중</p><h2>땅이 흔들리는지 지켜보세요</h2><p>흔들림이 다 끝날 때까지 움직이지 마세요. 관측소는 땅에 붙어 있어요.</p>`;
    } else if (state === 'missed') {
      card = `<p class="kicker">이번 지진은 관측 못 함</p><h2>지진이 난 뒤에 들어왔거나 위치가 없었어요</h2><p>친구들의 원을 보면서 진앙을 같이 찾아보세요. 다음 판에는 관측소로 참여할 수 있어요.</p>`;
    } else if (state === 'picking') {
      card = `<p class="kicker">판독</p><h2>P파·S파가 처음 도착한 순간을 찍으세요</h2>
        <p><b style="color:var(--p)">작게 떨리기 시작하는 곳이 P파</b>, <b style="color:var(--s)">크게 흔들리기 시작하는 곳이 S파</b>. ×4로 키우면 P파 시작이 잘 보여요.</p>`;
      const ok = S.pick.p != null && S.pick.s != null && S.pick.s > S.pick.p;
      action = `<button class="go" id="st-submit" ${ok ? '' : 'disabled'}>${ok ? `진원 거리 ${num((S.pick.s - S.pick.p) * k, 0)} m로 원 그리기` : 'P와 S를 모두 찍어 주세요'}</button>`;
    } else if (state === 'submitted') {
      const p = myPick(), n = roundPicks().length;
      cls = 'good';
      card = `<p class="kicker">제출 완료</p><h2>진원 거리 ${num(p.d, 0)} m</h2>
        <p>지도에 내 원이 그려졌어요. 지금까지 원 <b>${n}개</b>. 원이 모이면 겹치는 곳이 보입니다. 선생님이 레이스를 시작하면 그곳으로 달려가요!</p>`;
      action = `<button id="st-repick">다시 판독하기</button>`;
    } else if (state === 'race') {
      const g = S.guesses[S.team], mine = g && g.round === m.round;
      cls = 'alert';
      card = `<p class="kicker">🏃 진앙 레이스</p><h2>원들이 만나는 곳으로 가세요!</h2>
        <p>모둠과 함께 진앙이라고 생각하는 곳에 서서 버튼을 누르세요. 다시 누르면 고칠 수 있어요.</p>
        ${mine ? `<p><b>${esc(team(S.team).name)} 제출함</b> — ${esc(g.by)}, ${Math.max(0, Math.round((S.store.now() - g.t) / 1000))}초 전</p>` : ''}`;
      action = `<button class="go" id="st-guess" ${S.fix ? '' : 'disabled'}>📍 여기가 진앙!</button>`;
      if (!myPick() && rec && elapsed > rec.end) action = `<button id="st-gopick">아직 판독 안 함 — 판독하기</button>` + action;
    } else if (state === 'reveal') {
      cls = 'good';
      card = revealCard();
      action = `<button id="st-replay">파면 다시 보기</button>`;
    }
    const sig = cls + card + action;
    if (sig !== lastCard) {
      lastCard = sig;
      const c = $('st-card');
      c.className = 'st-card ' + cls;
      c.innerHTML = card;
      $('st-action').innerHTML = action;
      bindStudentActions();
    }

    // 무엇을 보여 줄지
    const recording = state === 'recording' || state === 'countdown';
    const pickable = rec && elapsed >= rec.end && state !== 'reveal';
    const tabs = $('st-tabs');
    tabs.hidden = !pickable;
    if (!pickable && !recording) S.tab = 'map';
    if (state === 'picking') S.tab = S.tab || 'seis';
    for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
    $('drum-wrap').hidden = !recording;
    $('pick-wrap').hidden = !(pickable && S.tab === 'seis');
    $('st-map-wrap').hidden = recording || (pickable && S.tab === 'seis');
  }

  function revealCard() {
    const m = S.meta, r = S.reveal, sc = M.scaleOf(r.scale), epi = local(r);
    const ranks = M.rankGuesses(entries(S.guesses).filter(([, g]) => g.round === m.round).map(([t, g]) => Object.assign({team: +t, t: g.t}, local(g))), epi);
    const mine = ranks.findIndex(g => g.team === S.team);
    const rec = S.rec && S.rec.round === m.round ? S.rec : null, p = myPick();
    let html = `<p class="kicker">정답 공개</p><h2>진앙은 별표(★) 자리!${r.depth ? ` 진원은 땅속 ${r.depth} m` : ''}</h2><div class="result-grid">`;
    html += mine >= 0
      ? `<div><small>우리 모둠 추정 오차</small><b>${num(ranks[mine].err, 1)} m</b></div><div><small>모둠 순위</small><b>${mine + 1}위 / ${ranks.length}</b></div>`
      : `<div><small>우리 모둠</small><b>제출 안 함</b></div><div><small>제출한 모둠</small><b>${ranks.length}</b></div>`;
    if (rec) {
      const trueR = rec.a.p * sc.vp;
      if (p) {
        html += `<div><small>내 판독 거리 → 실제</small><b>${num(p.d, 0)} → ${num(trueR, 0)} m</b></div>`;
        html += `<div><small>판독 오차 P · S</small><b>${signed(p.p - rec.a.p, 1)} · ${signed(p.s - rec.a.s, 1)} s</b></div>`;
      } else {
        html += `<div><small>실제 진원 거리</small><b>${num(trueR, 0)} m</b></div><div><small>실제 PS시</small><b>${num(rec.a.s - rec.a.p, 1)} s</b></div>`;
      }
      const I = M.intensityClass(rec.I);
      html += `</div><p style="margin-top:10px"><b>내 자리의 진도 ${M.roman(rec.I)}</b> (규모 ${num(r.mag, 1)}) — ${esc(M.INTENSITY_TEXT[I])}</p>`;
    } else html += '</div>';
    return html;
  }

  function bindStudentActions() {
    const on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
    on('st-manual', () => { S.manual = true; S.gpsError = S.gpsError || '지도를 눌러 내 위치를 찍어 주세요.'; toast('지도에서 지금 서 있는 곳을 눌러 주세요.'); dirty(); });
    on('st-sound', () => { Sound.unlock(); Sound.play('p', 0.5); setTimeout(() => Sound.play('s', 0.6), 700); shake('p'); });
    on('st-gps-back', () => { S.manual = false; S.fix = null; S.gpsError = null; toast('GPS 위치를 다시 쓰고 있어요.'); dirty(); });
    on('st-submit', submitPick);
    on('st-repick', () => { S.repick = true; S.tab = 'seis'; const p = myPick(); if (p) S.pick = {p: p.p, s: p.s, active: 'p'}; dirty(); });
    on('st-gopick', () => { S.tab = 'seis'; S.repick = true; dirty(); });
    on('st-guess', submitGuess);
    on('st-replay', () => { S.replayAt = performance.now(); });
  }

  function submitPick() {
    const m = S.meta, a = S.arr, sc = M.scaleOf(m.scale);
    if (S.pick.p == null || S.pick.s == null || !a) return;
    const ps = S.pick.s - S.pick.p;
    S.store.set(S.base + '/picks/' + S.store.uid, {
      round: m.round, p: +S.pick.p.toFixed(2), s: +S.pick.s.toFixed(2), ps: +ps.toFixed(2), d: +M.distanceFromPS(ps, sc).toFixed(1),
      lat: a.lat, lon: a.lon, name: S.name, team: S.team, t: S.store.now()
    });
    S.repick = false;
    S.tab = 'map';
    Sound.play('ding');
    dirty();
  }
  function submitGuess() {
    if (!S.fix) return;
    S.store.set(S.base + '/guesses/' + S.team, {round: S.meta.round, lat: +S.fix.lat.toFixed(7), lon: +S.fix.lon.toFixed(7), by: S.name, t: S.store.now()});
    Sound.play('ding');
    buzz(60);
    lastCard = '';
  }

  function studentScene() {
    const m = S.meta || {}, scene = {players: [], circles: [], chords: [], waves: [], guesses: [], marks: [], fit: [], minSpan: 70};
    const now = S.store.now();
    for (const [id, p] of entries(S.players)) {
      if (id === S.store.uid || p.lat == null) continue;
      const q = local(p);
      scene.players.push(Object.assign(q, {color: team(p.team).color, off: p.on === false || now - (p.t || 0) > 30000}));
      if (fitWorthy(p, now)) scene.fit.push(q);
    }
    const picks = roundPicks();
    const showCircles = ['submitted', 'race', 'reveal'].includes(stState()) || (myPick() && S.tab === 'map');
    if (showCircles) {
      for (const [id, p] of picks) {
        const c = Object.assign(local(p), {r: p.d, color: team(p.team).color, mine: id === S.store.uid});
        scene.circles.push(c);
        scene.marks.push({kind: 'station', x: c.x, y: c.y, color: c.color});
      }
    }
    for (const [t, g] of entries(S.guesses)) {
      if (g.round !== m.round || (m.phase !== 'reveal' && +t !== S.team)) continue;
      scene.guesses.push(Object.assign(local(g), {color: team(+t).color, label: team(+t).name}));
    }
    if (m.phase === 'reveal' && S.reveal && S.reveal.round === m.round) {
      const r = S.reveal, epi = local(r), sc = M.scaleOf(r.scale);
      scene.marks.push(Object.assign({kind: 'epi', label: '진앙'}, epi));
      scene.fit.push(epi);
      // 진앙에서 퍼지는 파면을 3배속으로 다시 보여 준다
      const t = (performance.now() - S.replayAt) / 1000 * 3;
      for (const [kind, v] of [['p', sc.vp], ['s', sc.vs]]) {
        const R = v * t, rr = R > (r.depth || 0) ? Math.sqrt(R * R - (r.depth || 0) ** 2) : 0;
        if (rr > 0 && rr < 600) scene.waves.push({x: epi.x, y: epi.y, r: rr, kind, opacity: clamp(1.2 - rr / 400, 0.25, 0.9)});
      }
    }
    if (S.fix) {
      const me = local(S.fix);
      scene.marks.push(Object.assign({kind: 'me', acc: S.manual ? 0 : (S.rawAcc || S.fix.acc)}, me));
      scene.fit.push(me);
      scene.focus = me;
    }
    return scene;
  }

  // 지진계 드럼: 오른쪽 끝이 지금, 왼쪽으로 지나간 12초
  function drawDrum() {
    const rec = S.rec, cv = $('drum'), {ctx, w, h} = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const el = (S.store.now() - S.meta.startAt) / 1000;
    $('drum-clock').textContent = el < 0 ? `${num(el, 1)} s` : `${num(el, 1)} s`;
    if (!rec) return;
    const win = 12, t1 = Math.max(el, win * 0.85), t0 = t1 - win;
    const box = {x: 0, y: 6, w: w - 14, h: h - 26};
    drawTrace(ctx, rec.data, box, t0, t1 + win * 0.0, 1.1, {until: Math.max(0, el), labels: true});
    // 펜
    const px = box.x + (Math.max(0, el) - t0) / win * box.w, i = clamp(Math.floor(el * M.RATE), 0, rec.data.length - 1);
    const v = el < 0 ? 0 : Math.tanh(rec.data[i] * 1.1 * 0.9);
    ctx.fillStyle = '#e03131';
    ctx.beginPath(); ctx.arc(px, box.y + box.h / 2 - v * (box.h / 2 - 6), 4.5, 0, Math.PI * 2); ctx.fill();
    // 도착 효과 (지난 순간을 다시 열었을 때는 건너뜀)
    for (const k of ['p', 's']) {
      if (rec.played[k] || el < rec.a[k]) continue;
      rec.played[k] = true;
      if (el - rec.a[k] > 2) continue;
      Sound.play(k, rec.amp);
      shake(k);
      buzz(k === 'p' ? [90, 60, 90] : [500, 80, 700, 80, 900]);
    }
  }

  // 판독 화면
  function pickWindow() {
    const rec = S.rec;
    if (S.view.zoom === 'near') {
      const c = S.pick[S.pick.active] != null ? S.pick[S.pick.active] : (S.pick.active === 's' && S.pick.p != null ? S.pick.p + 2 : rec.end / 3);
      const half = 2.5;
      const t0 = clamp(c - half, 0, Math.max(0, rec.end - 2 * half));
      return [t0, t0 + 2 * half];
    }
    return [0, rec.end];
  }
  function seisBox(w, h) { return {x: 10, y: 8, w: w - 20, h: h - 30}; }
  function drawSeis() {
    const rec = S.rec, cv = $('seis'), {ctx, w, h} = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    if (!rec) return;
    const [t0, t1] = pickWindow(), box = seisBox(w, h);
    drawTrace(ctx, rec.data, box, t0, t1, S.view.gain, {labels: true});
    drawPickLine(ctx, box, t0, t1, S.pick.p, '#1f6feb', 'P', S.pick.active === 'p');
    drawPickLine(ctx, box, t0, t1, S.pick.s, '#e03131', 'S', S.pick.active === 's');
    if (S.pick.p != null && S.pick.s != null && S.pick.s > S.pick.p) {
      const xa = box.x + (S.pick.p - t0) / (t1 - t0) * box.w, xb = box.x + (S.pick.s - t0) / (t1 - t0) * box.w, y = box.y + box.h - 14;
      ctx.save();
      ctx.strokeStyle = '#14283a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(Math.max(box.x, xa), y); ctx.lineTo(Math.min(box.x + box.w, xb), y); ctx.stroke();
      ctx.fillStyle = '#14283a'; ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('PS시 ' + num(S.pick.s - S.pick.p, 2) + ' s', clamp((xa + xb) / 2, box.x + 40, box.x + box.w - 40), y - 5);
      ctx.restore();
    }
    // 위 단추와 공식
    $('pick-p-val').textContent = S.pick.p == null ? '—' : num(S.pick.p, 2) + ' s';
    $('pick-s-val').textContent = S.pick.s == null ? '—' : num(S.pick.s, 2) + ' s';
    for (const b of document.querySelectorAll('[data-pick]')) b.setAttribute('aria-pressed', String(b.dataset.pick === S.pick.active));
    const sc = M.scaleOf(S.meta.scale), k = M.omori(sc);
    const f = $('pick-formula');
    let html;
    if (S.pick.p != null && S.pick.s != null) {
      const ps = S.pick.s - S.pick.p;
      html = ps > 0
        ? `<small>PS시 = <span style="color:var(--s)">S</span> − <span style="color:var(--p)">P</span> · 진원 거리 = k × PS시 (k = ${num(k, 1)} m/s)</small>
           <div class="eq"><span class="s">${num(S.pick.s, 2)}</span> − <span class="p">${num(S.pick.p, 2)}</span> = ${num(ps, 2)} s → ${num(k, 1)} × ${num(ps, 2)} = <u>${num(ps * k, 1)} m</u></div>`
        : `<div class="eq" style="color:var(--bad)">S파는 P파보다 늦게 와요. 다시 찍어 보세요.</div>`;
    } else {
      html = `<small>이 축소 지구에서 P파는 ${sc.vp} m/s, S파는 ${sc.vs} m/s로 달려요.</small><div class="eq">k = Vp·Vs / (Vp − Vs) = ${num(k, 1)} m/s</div>`;
    }
    if (f.innerHTML !== html) f.innerHTML = html;
  }
  function bindPickCanvas() {
    const cv = $('seis');
    let dragging = false;
    const setAt = e => {
      const r = cv.getBoundingClientRect(), box = seisBox(r.width, r.height), [t0, t1] = pickWindow();
      const t = clamp(t0 + (e.clientX - r.left - box.x) / box.w * (t1 - t0), 0, S.rec.end);
      S.pick[S.pick.active] = Math.round(t * 100) / 100;
      lastCard = '';
    };
    cv.addEventListener('pointerdown', e => { if (!S.rec) return; dragging = true; cv.setPointerCapture(e.pointerId); setAt(e); });
    cv.addEventListener('pointermove', e => { if (dragging) setAt(e); });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      // P 를 찍고 나면 자연스럽게 S 차례로
      if (S.pick.active === 'p' && S.pick.s == null) S.pick.active = 's';
      lastCard = '';
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    for (const b of document.querySelectorAll('[data-pick]')) b.onclick = () => { S.pick.active = b.dataset.pick; };
    for (const b of document.querySelectorAll('[data-zoom]')) b.onclick = () => { S.view.zoom = b.dataset.zoom; for (const x of document.querySelectorAll('[data-zoom]')) x.setAttribute('aria-pressed', String(x === b)); };
    for (const b of document.querySelectorAll('[data-gain]')) b.onclick = () => { S.view.gain = +b.dataset.gain; for (const x of document.querySelectorAll('[data-gain]')) x.setAttribute('aria-pressed', String(x === b)); };
    for (const b of document.querySelectorAll('[data-nudge]')) b.onclick = () => {
      const k = S.pick.active;
      if (S.pick[k] == null || !S.rec) return;
      S.pick[k] = clamp(Math.round((S.pick[k] + +b.dataset.nudge) * 100) / 100, 0, S.rec.end);
      lastCard = '';
    };
    for (const b of document.querySelectorAll('#st-tabs button')) b.onclick = () => { S.tab = b.dataset.tab; dirty(); };
  }

  let mapFrame = 0;
  function loop() {
    if (document.body.dataset.screen !== 'student') return;
    renderStudent();
    const st = stState();
    if (st === 'recording' || st === 'countdown') { if (S.rec) drawDrum(); }
    if (!$('pick-wrap').hidden) drawSeis();
    const animating = st === 'reveal';
    if (!$('st-map-wrap').hidden && (isDirty || animating || (S.map && (S.map.auto || S.map.follow) && ++mapFrame % 6 === 0))) {
      S.map.draw(studentScene());
      isDirty = false;
    }
    requestAnimationFrame(loop);
  }

  // ════════════════════════════════════════════════════════════
  //  선생님: 관측망 지도와 진행
  // ════════════════════════════════════════════════════════════
  const T = {
    store: null, code: '', base: '', demo: false,
    meta: null, players: {}, picks: {}, guesses: {}, arr: {}, secret: null, reveal: null,
    epiMode: false, showEpi: true, view: 'circles', fix: null, map: null, bots: null, replayAt: 0
  };

  async function openRoom(demo, existing) {
    try {
      T.store = await openStore(demo);
    } catch (e) {
      $('server-note').textContent = e.message;
      $('server-note').classList.add('error');
      return;
    }
    T.demo = demo;
    let code = existing;
    if (code) {
      const meta = await T.store.get(`${ROOT}/${code}/meta`);
      if (!meta || meta.teacher !== T.store.uid) code = null;
    }
    if (!code) {
      for (let i = 0; i < 20 && !code; i++) {
        const c = String(1000 + Math.floor(Math.random() * 9000));
        if (!(await T.store.get(`${ROOT}/${c}/meta`))) code = c;
      }
      await T.store.set(`${ROOT}/${code}/meta`, {teacher: T.store.uid, created: T.store.now(), phase: 'lobby', round: 1, scale: 'one', mag: 5, depth: 0, startAt: 0});
    }
    T.code = code; T.base = `${ROOT}/${code}`;
    if (!demo) history.replaceState(null, '', '?host=' + code + (LOCAL_ONLY ? '&local' : ''));
    showScreen('teacher');
    $('t-code').querySelector('b').textContent = code;
    T.map = new FieldMap($('t-map'), {
      onTap: w => {
        if (T.epiMode) {
          setEpicenter(w);
          setEpiMode(false);
          showHint('진앙을 정했어요. 다시 찍으려면 "지도에서"를 누르세요.', 3000);
          return;
        }
        // 관측소 점을 누르면 그 학생을 목록에서 보여 준다
        const hit = entries(T.players).filter(([, p]) => p.lat != null).map(([id, p]) => [id, M.dist(local(p), w)]).sort((a, b) => a[1] - b[1])[0];
        if (hit && hit[1] * T.map.view.s < 18) focusPlayer(hit[0], false);
      },
      credit: t => { $('t-credit').textContent = t; }
    });
    const on = (p, f) => T.store.on(T.base + p, v => { f(v); tDirty(); });
    on('/meta', v => {
      const prev = T.meta;
      T.meta = v;
      if (!v) return;
      if (prev && prev.phase !== v.phase && v.phase === 'reveal') T.replayAt = performance.now();
      if (T.bots) T.bots.onMeta(prev, v);
    });
    on('/players', v => { T.players = v || {}; });
    on('/picks', v => { T.picks = v || {}; });
    on('/guesses', v => { T.guesses = v || {}; });
    on('/arr', v => { T.arr = v || {}; });
    on('/secret', v => { T.secret = v; });
    on('/reveal', v => { T.reveal = v; });
    T.store.onStatus(ok => { $('t-conn').className = 'conn ' + (ok ? 'on' : 'off'); });
    bindTeacher();
    if (demo) {
      T.bots = new Bots();
      bindDemo();
    } else {
      showQR();
    }
    tLoop();
  }

  const usable = p => p && p.on !== false && p.lat != null && T.store.now() - (p.t || 0) < 60000;
  const tRoundPicks = () => entries(T.picks).filter(([, p]) => T.meta && p.round === T.meta.round);

  function showQR() {
    const url = location.origin + location.pathname + '?room=' + T.code + (LOCAL_ONLY ? '&local' : '');
    $('qr-code').textContent = T.code;
    $('qr-url').textContent = url;
    drawQR($('qr'), url);
    const d = $('qr-dialog');
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }

  function setEpicenter(w) {
    const g = geo(w);
    return guard(T.store.set(T.base + '/secret', {lat: +g.lat.toFixed(7), lon: +g.lon.toFixed(7)}), '진앙 저장');
  }
  // 서버가 거절하면(규칙, 연결 끊김) 조용히 아무 일도 안 일어난 것처럼 보이지 않게 알려 준다
  function guard(promise, what) {
    return Promise.resolve(promise).catch(e => {
      console.warn('[quake]', what, e);
      alert(`${what}에 실패했어요.\n${e && e.message ? e.message : e}\n\n인터넷 연결과 Firebase 규칙을 확인해 주세요.`);
      throw e;
    });
  }
  let hintTimer = 0;
  function showHint(text, ms) {
    const h = $('t-hint');
    h.textContent = text;
    h.hidden = !text;
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(() => { if (!T.epiMode) h.hidden = true; }, ms);
  }
  function setEpiMode(on) {
    T.epiMode = on;
    $('t-epi-tap').setAttribute('aria-pressed', String(on));
    if (on) showHint('지도에서 진앙으로 할 곳을 누르세요');
    else if ($('t-hint').textContent.startsWith('지도에서')) showHint('');
  }

  // 선생님 위치: '📍' 단추나 '내 자리' 진앙을 처음 쓸 때 켠다
  function startTeacherGPS() {
    if (T.gpsWatch != null) return;
    if (!navigator.geolocation) { showHint('이 기기는 위치를 쓸 수 없어요.', 4000); return; }
    showHint('선생님 위치를 찾는 중…', 6000);
    T.gpsWatch = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      T.fix = M.blendFix(T.fix, {lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: Date.now()});
      T.fixAcc = c.accuracy;
      if (T.followWhenFound) { T.followWhenFound = false; T.map.draw(teacherScene()); T.map.followNow(); showHint(''); }
      if (T.epiWhenFound) { T.epiWhenFound = false; setEpicenter(local(T.fix)); showHint(''); }
      tDirty();
    }, err => {
      if (err.code === 1) {
        navigator.geolocation.clearWatch(T.gpsWatch);
        T.gpsWatch = null;
        T.followWhenFound = T.epiWhenFound = false;
        showHint('위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치를 허용해 주세요.', 6000);
      } else if (!T.fix) showHint('위치를 아직 못 찾았어요. 하늘이 트인 곳으로 가 보세요.', 5000);
    }, {enableHighAccuracy: true, maximumAge: 0, timeout: 20000});
  }

  // 학생 상태: 지도에 안 보이는 학생이 왜 안 보이는지 목록에서 바로 알 수 있게
  function playerStatus(p, now) {
    if (p.on === false) return ['bad', '연결 끊김'];
    if (p.lat == null) return ['bad', '위치 없음'];
    const age = (now - (p.t || 0)) / 1000;
    if (age > 20) return ['bad', `${Math.round(age)}초째 소식 없음`];
    if (p.manual) return ['ok', '직접 찍은 위치'];
    const a = Math.round(p.acc || 0);
    return [a > 20 ? 'ok' : 'good', `GPS ±${a} m`];
  }
  function focusPlayer(id, center = true) {
    const p = T.players[id];
    if (!p) return;
    T.focusId = id;
    T.focusUntil = performance.now() + 5000;
    if (center && p.lat != null) T.map.centerOn(local(p), 80);
    const box = $('t-roster-box');
    box.open = true;
    const row = box.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (row) row.scrollIntoView({block: 'nearest'});
    tDirty();
  }
  let rosterAt = 0, rosterSig = '';
  function renderRoster(now) {
    if (performance.now() - rosterAt < 1000) return;
    rosterAt = performance.now();
    const rows = entries(T.players).map(([id, p]) => ({id, p, st: playerStatus(p, now)}));
    const rank = {bad: 0, ok: 1, good: 2};
    rows.sort((a, b) => rank[a.st[0]] - rank[b.st[0]] || (a.p.team - b.p.team) || String(a.p.name).localeCompare(String(b.p.name), 'ko'));
    const bad = rows.filter(r => r.st[0] === 'bad').length;
    const html = rows.map(r => `<button data-id="${esc(r.id)}"${r.id === T.focusId ? ' style="outline:2px solid var(--epi)"' : ''}><i style="background:${team(r.p.team).color}"></i><span>${esc(r.p.name || '?')}</span><span class="st ${r.st[0]}">${esc(r.st[1])}</span></button>`).join('');
    const sum = `학생 목록 · ${rows.length}명` + (bad ? ` · <b style="color:var(--bad)">확인 필요 ${bad}</b>` : '');
    if (html + sum === rosterSig) return;
    rosterSig = html + sum;
    $('t-roster').innerHTML = html || '<p class="micro">아직 들어온 학생이 없어요. 방 번호를 눌러 QR을 보여 주세요.</p>';
    $('t-roster-sum').innerHTML = sum;
  }

  function bindTeacher() {
    $('t-code').onclick = showQR;
    bindMapTools('t', T.map, () => {
      if (T.fix) T.map.followNow();
      else { T.followWhenFound = true; startTeacherGPS(); }
    });
    $('t-eye').onclick = () => {
      T.showEpi = !T.showEpi;
      $('t-eye').setAttribute('aria-pressed', String(T.showEpi));
      $('t-eye').textContent = T.showEpi ? '👁' : '🙈';
    };
    for (const b of document.querySelectorAll('[data-msg]')) b.onclick = () => sendMsg(b.dataset.msg);
    $('t-msg-custom').onclick = () => { const t = prompt('학생들 폰에 띄울 말'); if (t && t.trim()) sendMsg(t.trim().slice(0, 80)); };
    // 축척
    const scaleBox = $('t-scale');
    scaleBox.innerHTML = Object.values(M.SCALES).map(s => `<button data-scale="${s.id}" aria-pressed="false">${esc(s.name)}</button>`).join('');
    for (const b of scaleBox.querySelectorAll('button')) b.onclick = () => T.store.update(T.base + '/meta', {scale: b.dataset.scale});
    $('t-mag').oninput = e => { $('t-mag-val').textContent = num(+e.target.value, 1); };
    $('t-mag').onchange = e => T.store.update(T.base + '/meta', {mag: +e.target.value});
    for (const b of document.querySelectorAll('[data-depth]')) b.onclick = () => T.store.update(T.base + '/meta', {depth: +b.dataset.depth});
    $('t-epi-tap').onclick = () => setEpiMode(!T.epiMode);
    $('t-epi-me').onclick = epicenterHere;
    $('t-epi-rand').onclick = () => {
      const pts = entries(T.players).filter(([, p]) => usable(p)).map(([, p]) => local(p));
      if (pts.length >= 3) { setEpicenter(M.randomEpicenter(pts)); return; }
      // 관측소가 3명보다 적으면(연습할 때) 그 근처 15~40 m 안의 아무 곳
      const c = pts.length ? {x: pts.reduce((a, q) => a + q.x, 0) / pts.length, y: pts.reduce((a, q) => a + q.y, 0) / pts.length} : T.fix ? local(T.fix) : {x: 0, y: 0};
      const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 25;
      setEpicenter({x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a)});
    };
    $('t-roster').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) focusPlayer(b.dataset.id); };
    $('t-quake').onclick = () => triggerQuake().catch(() => {});
    $('t-race').onclick = () => guard(T.store.update(T.base + '/meta', {phase: 'race'}), '레이스 시작');
    $('t-reveal').onclick = revealAnswer;
    $('t-next').onclick = nextRound;
    $('t-csv').onclick = exportCSV;
    $('t-close').onclick = async () => {
      if (!confirm('방을 닫으면 학생들의 위치와 기록이 모두 지워집니다. 닫을까요?')) return;
      if (T.bots) T.bots.stop();
      await T.store.remove(T.base);
      location.href = location.pathname;
    };
    for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => {
      T.view = b.dataset.view;
      if (T.view === 'waves') T.replayAt = performance.now();
      for (const x of document.querySelectorAll('[data-view]')) x.setAttribute('aria-pressed', String(x === b));
      tDirty();
    };
  }

  function sendMsg(text) { T.store.update(T.base + '/meta', {msg: {text, t: T.store.now()}}); if (T.bots) T.bots.onMsg(text); }

  function epicenterHere() {
    if (T.fix && Date.now() - T.fix.t < 15000) { setEpicenter(local(T.fix)); return; }
    T.epiWhenFound = true;
    startTeacherGPS();
  }

  async function triggerQuake() {
    const m = T.meta, sc = M.scaleOf(m.scale);
    if (!T.secret) return;
    const epi = local(T.secret), arr = {}, far = [];
    for (const [id, p] of entries(T.players)) {
      if (!usable(p)) continue;
      const a = M.arrivals(M.dist(local(p), epi), m.depth || 0, sc);
      // 너무 먼 관측소(다른 곳에서 접속했거나 GPS 가 크게 틀린 폰)는 S파가 1분 넘게 안 와서 판이 끝나지 않는다
      if (a.s > 60) { far.push(`${p.name} (${Math.round(a.r)} m)`); continue; }
      arr[id] = {
        round: m.round, lat: p.lat, lon: p.lon, p: +a.p.toFixed(3), s: +a.s.toFixed(3),
        amp: +M.amplitudeAt(a.r, m.mag).toFixed(4), I: +M.intensity(a.r, m.mag).toFixed(2), seed: randInt()
      };
    }
    if (!far.length && !Object.keys(arr).length && !confirm('위치가 잡힌 관측소가 없어요. 그래도 지진을 일으킬까요?')) return;
    if (far.length && !confirm(`진앙에서 너무 멀리 있는 ${far.length}명은 이번 지진에서 빠집니다.\n${far.slice(0, 6).join(', ')}${far.length > 6 ? ' …' : ''}\n\n그대로 진행할까요?`)) return;
    setEpiMode(false);
    await guard(T.store.set(T.base + '/arr', arr), '지진 발생');
    await guard(T.store.update(T.base + '/meta', {phase: 'quake', startAt: T.store.now() + 3500, msg: null}), '지진 발생');
  }

  async function revealAnswer() {
    const m = T.meta;
    if (!T.secret) return;
    await T.store.set(T.base + '/reveal', {round: m.round, lat: T.secret.lat, lon: T.secret.lon, depth: m.depth || 0, scale: m.scale, mag: m.mag, at: T.store.now()});
    await T.store.update(T.base + '/meta', {phase: 'reveal'});
  }

  async function nextRound() {
    const m = T.meta;
    await T.store.update(T.base, {arr: null, picks: null, guesses: null, reveal: null, secret: null});
    await T.store.update(T.base + '/meta', {phase: 'lobby', round: m.round + 1, startAt: 0});
    T.view = 'circles';
    for (const x of document.querySelectorAll('[data-view]')) x.setAttribute('aria-pressed', String(x.dataset.view === 'circles'));
  }

  // 공통현을 그릴 관측소 셋: 서로 멀리 떨어진(삼각형이 큰) 셋을 고른다.
  function spreadTriple(circles) {
    if (circles.length < 3) return null;
    const c = circles.length > 40 ? circles.slice(0, 40) : circles;
    let best = null, area = -1;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) for (let k = j + 1; k < c.length; k++) {
      const a = Math.abs((c[j].x - c[i].x) * (c[k].y - c[i].y) - (c[k].x - c[i].x) * (c[j].y - c[i].y));
      if (a > area) { area = a; best = [c[i], c[j], c[k]]; }
    }
    return best;
  }

  function teacherScene() {
    const m = T.meta || {}, sc = M.scaleOf(m.scale), now = T.store.now();
    const scene = {players: [], circles: [], chords: [], waves: [], guesses: [], marks: [], fills: [], fit: [], minSpan: 80};
    const el = m.startAt ? (now - m.startAt) / 1000 : -1;
    const revealed = m.phase === 'reveal' && T.reveal && T.reveal.round === m.round;
    const intensityView = revealed && T.view === 'intensity';
    for (const [id, p] of entries(T.players)) {
      if (p.lat == null) continue;
      const q = local(p), a = T.arr[id], ok = usable(p);
      const d = Object.assign(q, {color: team(p.team).color, label: p.name, off: !ok, acc: p.acc, showAcc: m.phase === 'lobby' && ok && p.acc > 12});
      if (a && a.round === m.round && m.phase !== 'lobby') {
        const st = local(a);
        d.x = st.x; d.y = st.y;   // 지진 뒤에는 관측소 자리에 고정해서 보여 준다
        if (m.phase === 'quake' && el >= 0) {
          if (el >= a.s && el < a.s + 6) d.ring = {r: 16, color: '#e03131', w: 4};
          else if (el >= a.p && el < a.s) d.ring = {r: 13, color: '#1f6feb', w: 3};
        }
        if (intensityView) {
          const I = M.intensityClass(a.I);
          d.color = INTENSITY_COLORS[I]; d.badge = M.roman(a.I); d.big = true;
        }
      }
      // 목록에서 고른 학생은 잠깐 주황 고리로 표시
      if (id === T.focusId && performance.now() < (T.focusUntil || 0)) d.ring = {r: 17, color: '#e8590c', w: 4, opacity: 0.5 + 0.5 * Math.abs(Math.sin(performance.now() / 250))};
      scene.players.push(d);
      if (fitWorthy(p, now) || (a && a.round === m.round && m.phase !== 'lobby')) scene.fit.push(d);
    }
    if (T.fix) {
      const me = local(T.fix);
      scene.marks.push(Object.assign({kind: 'me', label: '선생님', acc: T.fixAcc}, me));
      scene.focus = me;
      if (!scene.fit.length) scene.fit.push(me);
    }
    const picks = tRoundPicks().map(([, p]) => Object.assign(local(p), {r: p.d, color: team(p.team).color, team: p.team}));
    if (!intensityView) for (const c of picks) scene.circles.push(Object.assign({}, c, {faint: revealed}));
    if (revealed && T.view === 'circles' && picks.length >= 3) {
      const tri = spreadTriple(picks);
      if (tri) {
        for (const c of tri) scene.circles.push(Object.assign({}, c, {mine: true, color: '#14283a'}));
        for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) { const ch = M.chord(tri[a], tri[b]); if (ch) scene.chords.push(ch); }
      }
      const est = M.locate(picks, (m.depth || 0) > 0);
      if (est) scene.marks.push({kind: 'est', x: est.x, y: est.y, label: '반 전체 추정'});
    }
    for (const [t, g] of entries(T.guesses)) {
      if (g.round !== m.round) continue;
      scene.guesses.push(Object.assign(local(g), {color: team(+t).color, label: team(+t).name}));
    }
    if (T.secret && (T.showEpi || revealed)) {
      const epi = local(T.secret);
      scene.marks.push(Object.assign({kind: 'epi', label: revealed ? '진앙' : '진앙 (학생 폰에는 안 보임)'}, epi));
      scene.fit.push(epi);
      let t = -1;
      if (m.phase === 'quake' && el >= 0 && T.showEpi) t = el;
      if (revealed && T.view === 'waves') t = (performance.now() - T.replayAt) / 1000 * 2;
      if (t >= 0) {
        const depth = m.depth || 0;
        for (const [kind, v] of [['p', sc.vp], ['s', sc.vs]]) {
          const R = v * t, rr = R > depth ? Math.sqrt(R * R - depth * depth) : 0;
          if (rr > 0 && rr < 800) scene.waves.push({x: epi.x, y: epi.y, r: rr, kind});
        }
      }
      if (intensityView) {
        for (let I = 2; I <= 9; I++) {  // 넓은(약한) 것부터 깔고 좁은(강한) 것을 위에
          // 그 진도가 되는 거리: intensity(r) = I − 0.5
          const r = 10 ** ((1.5 * m.mag + 2.6 - (I - 0.5)) / 3);
          const rr = r > (m.depth || 0) ? Math.sqrt(r * r - (m.depth || 0) ** 2) : 0;
          if (rr > 0 && rr < 1500) scene.fills.push({x: epi.x, y: epi.y, r: rr, color: INTENSITY_COLORS[I], opacity: 0.22});
        }
      }
    }
    return scene;
  }

  let tIsDirty = true;
  const tDirty = () => { tIsDirty = true; };
  let lastSide = '';
  function renderTeacher() {
    const m = T.meta;
    if (!m) return;
    const sc = M.scaleOf(m.scale), now = T.store.now();
    const all = entries(T.players), live = all.filter(([, p]) => usable(p));
    $('t-count').textContent = all.filter(([, p]) => p.on !== false).length;
    $('t-located').textContent = live.length;
    $('t-gpsok').textContent = live.filter(([, p]) => !p.manual && (p.acc || 99) <= 12).length;
    renderRoster(now);
    $('t-round').textContent = m.round;
    // 모둠별 인원
    const counts = M.TEAMS.map(() => 0);
    for (const [, p] of live) if (counts[p.team] != null) counts[p.team]++;
    const teamsHtml = M.TEAMS.map((t, i) => `<div style="--c:${t.color}" class="${counts[i] ? '' : 'none'}"><b>${counts[i]}</b>${t.name}</div>`).join('');
    // 설정 상태
    const lobby = m.phase === 'lobby';
    const arrN = Object.values(T.arr).filter(a => a.round === m.round).length, pickN = tRoundPicks().length;
    const el = m.startAt ? (now - m.startAt) / 1000 : -1;
    const sideSig = [teamsHtml, m.phase, m.scale, m.mag, m.depth, !!T.secret, arrN, pickN, live.length, T.reveal && T.reveal.round, Object.keys(T.guesses).length, el < 0 ? 'pre' : 'post'].join('|');
    if (sideSig !== lastSide) {
      lastSide = sideSig;
      $('t-teams').innerHTML = teamsHtml;
      for (const b of $('t-scale').querySelectorAll('button')) { b.setAttribute('aria-pressed', String(b.dataset.scale === m.scale)); b.disabled = !lobby; }
      $('t-scale-note').textContent = `${sc.hint} · P파 ${sc.vp} m/s, S파 ${sc.vs} m/s → 진원 거리 = ${num(M.omori(sc), 1)} × PS시`;
      $('t-mag').value = m.mag; $('t-mag').disabled = !lobby; $('t-mag-val').textContent = num(m.mag, 1);
      for (const b of document.querySelectorAll('[data-depth]')) { b.setAttribute('aria-pressed', String(+b.dataset.depth === (m.depth || 0))); b.disabled = !lobby; }
      for (const id of ['t-epi-tap', 't-epi-me', 't-epi-rand']) $(id).disabled = !lobby;
      if (T.secret) {
        const epi = local(T.secret), near = live.map(([, p]) => M.dist(local(p), epi)).sort((a, b) => a - b);
        const limit = 60 * sc.vs;   // S파가 1분 안에 닿는 거리
        const tooFar = near.filter(d => d > limit).length;
        $('t-epi-note').textContent = (near.length ? `진앙 준비 완료 · 가장 가까운 관측소 ${num(near[0], 0)} m, 가장 먼 관측소 ${num(near[near.length - 1], 0)} m` : '진앙 준비 완료')
          + (tooFar ? ` · ⚠ ${tooFar}명은 ${num(limit, 0)} m보다 멀어서 이번 지진에서 빠져요` : '');
      } else $('t-epi-note').textContent = '아직 진앙이 없습니다. 학생들이 흩어진 뒤에 정하세요.';
      $('t-quake').disabled = !lobby || !T.secret;
      $('t-quake').textContent = lobby ? (T.secret ? '지진 발생' : '진앙을 먼저 정하세요') : m.phase === 'quake' && el < 0 ? '곧 지진 발생…' : `${m.round}번째 지진 진행 중`;
      $('t-pick-bar').style.width = arrN ? (100 * pickN / arrN) + '%' : '0';
      $('t-pick-note').textContent = lobby ? '지진이 나면 판독 제출 현황이 여기에 보입니다.' : `판독 제출 ${pickN} / 관측소 ${arrN}` + (pickN >= 3 ? ' · 원이 3개 이상 모였어요' : '');
      $('t-race').disabled = m.phase !== 'quake';
      $('t-reveal').disabled = !(m.phase === 'quake' || m.phase === 'race');
      $('t-result').hidden = m.phase !== 'reveal';
      // 지금 단계에 필요한 칸만 보인다
      const step = n => document.querySelector(`[data-step="${n}"]`);
      step('setup').hidden = !lobby;
      step('live').hidden = lobby || m.phase === 'reveal';
      step('network').hidden = m.phase === 'reveal';
      $('t-quake-sum').textContent = `규모 ${num(m.mag, 1)} · 진원 깊이 ${m.depth || 0} m · ${sc.name} (k = ${num(M.omori(sc), 1)} m/s)`;
      if (T.lastPhase !== m.phase) { T.lastPhase = m.phase; $('t-side').scrollTo(0, 0); }
      if (m.phase === 'reveal') renderResult();
    }
    // 범례
    const legend = $('t-legend');
    let lg = '';
    const lastS = Math.max(0, ...Object.values(T.arr).filter(a => a.round === m.round).map(a => a.s));
    if (m.phase === 'quake' && el >= 0 && el < lastS + 6) lg = '<div class="row"><i style="background:#1f6feb"></i>P파 도착</div><div class="row"><i style="background:#e03131"></i>S파 도착</div>';
    else if (m.phase === 'reveal' && T.view === 'intensity') lg = `<div class="row"><b>진도 분포</b>&nbsp;규모 ${num(m.mag, 1)}</div><div class="scale">${INTENSITY_COLORS.slice(1, 10).map((c, i) => `<i style="background:${c}">${M.roman(i + 1)}</i>`).join('')}</div>`;
    else if (m.phase === 'reveal' && T.view === 'circles') lg = '<div class="row"><i style="background:#14283a"></i>굵은 원 셋과 공통현(점선)</div><div class="row">✚ 반 전체 원으로 구한 진앙</div>';
    if (legend.innerHTML !== lg) legend.innerHTML = lg;
    // 카운트다운
    const cd = $('countdown');
    if (m.phase === 'quake' && el > -3.6 && el < 1.2) {
      cd.hidden = false;
      const txt = el < 0 ? String(Math.ceil(-el)) : '지진 발생!';
      cd.className = 'countdown' + (el >= 0 ? ' go' : '');
      if (cd.textContent !== txt) cd.textContent = txt;
    } else cd.hidden = true;
  }

  function renderResult() {
    const m = T.meta, r = T.reveal, sc = M.scaleOf(m.scale), epi = local(r);
    const ranks = M.rankGuesses(entries(T.guesses).filter(([, g]) => g.round === m.round).map(([t, g]) => Object.assign({team: +t, by: g.by, t: g.t}, local(g))), epi);
    const picks = tRoundPicks();
    const circles = picks.map(([, p]) => Object.assign(local(p), {r: p.d}));
    const est = M.locate(circles, (m.depth || 0) > 0);
    const errsP = [], errsS = [], pairs = [];
    for (const [id, p] of picks) {
      const a = T.arr[id];
      if (!a) continue;
      errsP.push(Math.abs(p.p - a.p)); errsS.push(Math.abs(p.s - a.s));
      pairs.push({ps: p.ps, r: a.p * sc.vp, p: p.p, s: p.s});
    }
    const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
    const fit = M.fitOmori(pairs);
    let html = '<div class="rank">';
    if (!ranks.length) html += '<p class="micro">레이스에서 제출한 모둠이 없어요.</p>';
    ranks.forEach((g, i) => {
      html += `<div class="row"><span class="pos">${i + 1}</span><span class="who"><i style="background:${team(g.team).color}"></i>${esc(team(g.team).name)} <small class="micro">${esc(g.by || '')}</small></span><span class="err">${num(g.err, 1)} m</span></div>`;
    });
    html += '</div><div class="facts">';
    html += `<div>반 전체 원으로 구한 진앙 오차<b>${est ? num(M.dist(est, epi), 1) + ' m' : '원이 3개 미만'}</b></div>`;
    if (est && (m.depth || 0) > 0) html += `<div>구한 진원 깊이 (정답 ${m.depth} m)<b>${num(est.z, 1)} m</b></div>`;
    html += `<div>판독 평균 오차 P · S<b>${errsP.length ? num(mean(errsP), 2) + ' · ' + num(mean(errsS), 2) + ' s' : '—'}</b></div>`;
    html += `<div>우리 반 k (정답 ${num(M.omori(sc), 1)})<b>${fit ? num(fit.k, 2) + ' m/s' : '—'}</b></div>`;
    html += '</div>';
    $('t-ranking').innerHTML = html;
    drawTravelTime(pairs, sc, fit);
  }

  // 주시 곡선: 가로 진원 거리, 세로 도착 시각. 기울기가 1/속도라서 S파 선이 더 가파르다.
  function drawTravelTime(pairs, sc, fit) {
    const svg = $('t-tt');
    clear(svg);
    const W = 360, H = 230, pad = {l: 40, r: 14, t: 14, b: 34};
    const rMax = Math.max(40, ...pairs.map(q => q.r)) * 1.1, tMax = rMax / sc.vs;
    const X = r => pad.l + r / rMax * (W - pad.l - pad.r), Y = t => H - pad.b - t / tMax * (H - pad.t - pad.b);
    const ax = el('g', {class: 'tt-axis'}, svg);
    el('path', {d: `M${pad.l} ${pad.t}V${H - pad.b}H${W - pad.r}`, fill: 'none'}, ax);
    const rs = rMax > 300 ? 100 : rMax > 120 ? 50 : 20, ts = tMax > 60 ? 20 : tMax > 25 ? 10 : 5;
    for (let r = rs; r < rMax; r += rs) { el('line', {x1: X(r), x2: X(r), y1: H - pad.b, y2: H - pad.b + 4}, ax); el('text', {x: X(r), y: H - pad.b + 15, 'text-anchor': 'middle'}, ax, r); }
    for (let t = ts; t < tMax; t += ts) { el('line', {x1: pad.l - 4, x2: pad.l, y1: Y(t), y2: Y(t)}, ax); el('text', {x: pad.l - 7, y: Y(t) + 3, 'text-anchor': 'end'}, ax, t); }
    el('text', {x: W - pad.r, y: H - 4, 'text-anchor': 'end'}, ax, '진원 거리 (m)');
    el('text', {x: 6, y: pad.t + 2}, ax, '시각(s)');
    el('line', {x1: X(0), y1: Y(0), x2: X(rMax), y2: Y(rMax / sc.vp), stroke: '#1f6feb', 'stroke-width': 2}, svg);
    el('line', {x1: X(0), y1: Y(0), x2: X(rMax), y2: Y(rMax / sc.vs), stroke: '#e03131', 'stroke-width': 2}, svg);
    el('text', {x: X(rMax) - 4, y: Y(rMax / sc.vp) - 6, 'text-anchor': 'end', fill: '#1f6feb', style: 'font-size:11px;font-weight:800'}, svg, 'P파');
    el('text', {x: X(rMax * 0.9) - 4, y: Y(rMax * 0.9 / sc.vs) + 2, 'text-anchor': 'end', fill: '#e03131', style: 'font-size:11px;font-weight:800'}, svg, 'S파');
    for (const q of pairs) {
      el('line', {x1: X(q.r), x2: X(q.r), y1: Y(q.p), y2: Y(q.s), stroke: '#14283a', 'stroke-opacity': 0.25}, svg);
      el('circle', {cx: X(q.r), cy: Y(q.p), r: 3.2, fill: '#fff', stroke: '#1f6feb', 'stroke-width': 1.8}, svg);
      el('circle', {cx: X(q.r), cy: Y(q.s), r: 3.2, fill: '#fff', stroke: '#e03131', 'stroke-width': 1.8}, svg);
    }
    $('t-tt-cap').innerHTML = pairs.length
      ? `<b>우리 반 주시 곡선</b> — 동그라미는 학생들이 찍은 도착 시각, 선은 실제 P파·S파입니다. 멀수록 두 선의 간격(PS시)이 벌어지죠. ${fit ? `학생 판독으로 구한 k는 <b>${num(fit.k, 2)} m/s</b>(정답 ${num(M.omori(sc), 1)})입니다.` : ''}`
      : '판독이 모이면 우리 반 주시 곡선이 그려집니다.';
  }

  function exportCSV() {
    const m = T.meta, sc = M.scaleOf(m.scale), epi = T.reveal ? local(T.reveal) : (T.secret ? local(T.secret) : null);
    const rows = [['판', '이름', '모둠', '관측소 x(m)', '관측소 y(m)', '실제 P(s)', '실제 S(s)', '판독 P(s)', '판독 S(s)', '판독 PS시(s)', '판독 거리(m)', '실제 진원 거리(m)', '진도']];
    for (const [id, a] of entries(T.arr)) {
      if (a.round !== m.round) continue;
      const p = T.players[id] || {}, k = T.picks[id], q = local(a);
      rows.push([m.round, p.name || '', team(p.team).name, num(q.x, 1), num(q.y, 1), a.p, a.s, k ? k.p : '', k ? k.s : '', k ? k.ps : '', k ? k.d : '', num(a.p * sc.vp, 1), M.roman(a.I)]);
    }
    if (epi) rows.push([], ['진앙 x(m)', num(epi.x, 1), '진앙 y(m)', num(epi.y, 1), '깊이(m)', m.depth || 0, '규모', m.mag, 'k(m/s)', M.omori(sc)]);
    const csv = '﻿' + rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'}));
    a.download = `캠퍼스지진_${T.code}_${m.round}판.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  let tFrame = 0;
  function tLoop() {
    if (document.body.dataset.screen !== 'teacher') return;
    renderTeacher();
    const m = T.meta || {};
    const animating = (m.phase === 'quake') || (m.phase === 'reveal' && T.view === 'waves') || performance.now() < (T.focusUntil || 0);
    if (tIsDirty || animating || ((T.map.auto || T.map.follow) && ++tFrame % 4 === 0)) {
      T.map.draw(teacherScene());
      tIsDirty = false;
    }
    requestAnimationFrame(tLoop);
  }

  // ════════════════════════════════════════════════════════════
  //  미리 해 보기: 가상 학생 24명 (선생님 기기 안에서만 움직인다)
  // ════════════════════════════════════════════════════════════
  const BOT_NAMES = ['서연', '민지', '하윤', '지우', '수아', '예린', '채원', '지민', '다은', '유나', '서현', '하은', '윤서', '소율', '가은', '나연', '예서', '시아', '아린', '혜원', '수빈', '지아', '연우', '다인'];
  // 가상 학생들이 서 있을 곳. 한 번 옮기면 이 기기에 저장해 두고 다음에도 거기서 시작한다.
  const demoHome = () => { const g = pref('demoCenter', null); return g && isFinite(g.lat) ? local(g) : {x: 0, y: 0}; };
  function bindDemo() {
    $('t-demo').hidden = false;
    const note = () => {
      $('t-demo-note').textContent = pref('demoCenter', null)
        ? '가상 학생들은 지난번에 옮겨 둔 자리(이 기기에 저장됨)에서 걸어 다녀요. 지진을 일으켜 보세요.'
        : '가상 학생들이 학교 기준점 둘레를 걸어 다녀요. 운동장이 아니면 지도를 운동장으로 옮긴 뒤 "지도 가운데로"를 누르세요. 한 번 옮기면 이 기기에 기억해요.';
    };
    note();
    const move = c => { T.bots.moveTo(c); setPref('demoCenter', geo(c)); note(); T.map.fitNow(); };
    $('t-demo-center').onclick = () => move({x: T.map.view.x, y: T.map.view.y});
    $('t-demo-me').onclick = () => {
      if (T.fix && Date.now() - T.fix.t < 15000) { move(local(T.fix)); return; }
      if (!navigator.geolocation) { showHint('이 기기는 위치를 쓸 수 없어요.', 4000); return; }
      showHint('선생님 위치를 찾는 중…', 8000);
      navigator.geolocation.getCurrentPosition(p => { showHint(''); move(local({lat: p.coords.latitude, lon: p.coords.longitude})); },
        () => showHint('위치를 못 찾았어요. 지도를 운동장으로 옮긴 뒤 "지도 가운데로"를 눌러 주세요.', 6000),
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});
    };
  }

  class Bots {
    constructor() {
      const R = M.rng(20261030);
      this.R = R;
      this.c = demoHome();
      this.field = {a: 50, b: 30};   // 운동장 반지름 (가로 100 m × 세로 60 m 타원)
      this.list = BOT_NAMES.map((name, i) => {
        const {x, y} = this.inField();
        return {id: 'bot' + String(i).padStart(2, '0'), name, team: i % 6, x, y, tx: x, ty: y, v: 1.1 + R() * 0.7, acc: 3 + R() * 6, picked: false, pickAt: 0};
      });
      this.scatter();
      this.timer = setInterval(() => this.tick(), 1000);
      this.tick();
    }
    stop() { clearInterval(this.timer); }
    inField() {
      const R = this.R, t = R() * Math.PI * 2, u = Math.sqrt(0.15 + 0.85 * R());
      return {x: this.c.x + this.field.a * u * Math.cos(t), y: this.c.y + this.field.b * u * Math.sin(t)};
    }
    // 대열을 그대로 둔 채 통째로 옮긴다
    moveTo(c) {
      const dx = c.x - this.c.x, dy = c.y - this.c.y;
      this.c = {x: c.x, y: c.y};
      for (const b of this.list) { b.x += dx; b.y += dy; b.tx += dx; b.ty += dy; }
      this.tick();
    }
    scatter() { for (const b of this.list) { const p = this.inField(); b.tx = p.x; b.ty = p.y; } }
    onMsg(text) {
      if (text.includes('흩어')) this.scatter();
      else if (text.includes('모이')) for (const b of this.list) { b.tx = this.c.x - 30 + (this.R() - 0.5) * 8; b.ty = this.c.y + 18 + (this.R() - 0.5) * 6; }
      else if (text.includes('멈추')) for (const b of this.list) { b.tx = b.x; b.ty = b.y; }
    }
    onMeta(prev, m) {
      if (prev && prev.round !== m.round) for (const b of this.list) { b.picked = false; b.pickAt = 0; b.guessTeam = false; }
      if (m.phase === 'race' && (!prev || prev.phase !== 'race')) this.race();
    }
    gauss() { const R = this.R; return Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R()); }
    race() {
      // 모둠마다 지금까지 모인 원으로 진앙을 어림하고(조금씩 틀리게) 그곳으로 걸어간다
      const circles = tRoundPicks().map(([, p]) => Object.assign(local(p), {r: p.d}));
      const est = M.locate(circles, (T.meta.depth || 0) > 0);
      if (!est) return;
      const goal = M.TEAMS.slice(0, 6).map(() => ({x: est.x + this.gauss() * 5, y: est.y + this.gauss() * 5}));
      for (const b of this.list) { const g = goal[b.team]; b.tx = g.x + this.gauss() * 1.5; b.ty = g.y + this.gauss() * 1.5; b.racing = true; b.v = 1.8 + this.R(); }
    }
    tick() {
      if (!T.store || !T.meta) return;
      const m = T.meta, now = T.store.now(), upd = {};
      const frozen = m.phase === 'quake' && T.store.now() < m.startAt + 15000 && !this.list.some(b => b.racing);
      for (const b of this.list) {
        if (!frozen) {
          const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
          if (d > 0.3) { const step = Math.min(d, b.v); b.x += dx / d * step; b.y += dy / d * step; }
          else if (!b.racing && m.phase === 'lobby' && this.R() < 0.04) { b.tx = b.x + (this.R() - 0.5) * 4; b.ty = b.y + (this.R() - 0.5) * 4; }
        }
        // GPS 는 실제 위치에서 조금씩 흔들린다
        const g = geo({x: b.x + this.gauss() * b.acc * 0.3, y: b.y + this.gauss() * b.acc * 0.3});
        upd[b.id] = {name: b.name, team: b.team, on: true, lat: +g.lat.toFixed(7), lon: +g.lon.toFixed(7), acc: Math.round(b.acc), t: now, bot: true};
        // 판독: 기록이 끝나고 몇 초 뒤, 사람처럼 조금 늦거나 이르게 찍는다
        const a = T.arr[b.id];
        if (a && a.round === m.round && !b.picked && (m.phase === 'quake' || m.phase === 'race')) {
          const end = m.startAt + M.recordLength(a) * 1000;
          if (!b.pickAt) b.pickAt = end + (3 + this.R() * 18) * 1000;
          if (now >= b.pickAt) {
            b.picked = true;
            const p = Math.max(0, a.p + 0.08 + this.gauss() * 0.15), s = Math.max(p + 0.2, a.s + 0.05 + this.gauss() * 0.3), ps = s - p;
            T.store.set(T.base + '/picks/' + b.id, {round: m.round, p: +p.toFixed(2), s: +s.toFixed(2), ps: +ps.toFixed(2), d: +M.distanceFromPS(ps, M.scaleOf(m.scale)).toFixed(1), lat: a.lat, lon: a.lon, name: b.name, team: b.team, t: now});
          }
        }
        if (b.racing && m.phase === 'race' && Math.hypot(b.tx - b.x, b.ty - b.y) < 1.5) {
          const gs = T.guesses[b.team];
          if (!gs || gs.round !== m.round) {
            const gg = geo({x: b.x, y: b.y});
            T.store.set(T.base + '/guesses/' + b.team, {round: m.round, lat: +gg.lat.toFixed(7), lon: +gg.lon.toFixed(7), by: b.name, t: now});
          }
        }
        if (m.phase === 'lobby') b.racing = false;
      }
      T.store.update(T.base + '/players', upd);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  처음 화면
  // ════════════════════════════════════════════════════════════
  function showScreen(name) {
    document.body.dataset.screen = name;
    window.scrollTo(0, 0);
  }

  function initEntry() {
    const saved = pref('me', {name: '', team: null});
    let chosen = saved.team;
    const picker = $('team-picker');
    picker.innerHTML = M.TEAMS.map((t, i) => `<button type="button" role="radio" aria-checked="${chosen === i}" style="--c:${t.color}" data-team="${i}">${t.name}</button>`).join('');
    for (const b of picker.querySelectorAll('button')) b.onclick = () => {
      chosen = +b.dataset.team;
      for (const x of picker.querySelectorAll('button')) x.setAttribute('aria-checked', String(x === b));
    };
    $('join-name').value = saved.name || '';
    const room = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
    if (room) $('join-code').value = room;
    $('join-form').onsubmit = e => {
      e.preventDefault();
      const code = $('join-code').value.replace(/\D/g, ''), name = $('join-name').value.trim(), err = $('join-error');
      const fail = t => { err.textContent = t; err.hidden = false; };
      if (code.length !== 4) return fail('방 번호 4자리를 넣어 주세요.');
      if (chosen == null) return fail('모둠을 골라 주세요.');
      if (!name) return fail('이름이나 번호를 넣어 주세요.');
      $('join-btn').disabled = true;
      $('join-btn').textContent = '연결 중…';
      joinRoom(code, name.slice(0, 10), chosen).finally(() => { $('join-btn').disabled = false; $('join-btn').textContent = '관측소 열기'; });
    };
    $('open-room').onclick = () => openRoom(false);
    $('open-demo').onclick = () => openRoom(true);
    if (!DB_URL && !LOCAL_ONLY) {
      $('server-note').textContent = '실시간 서버(Firebase Realtime Database) 주소를 아직 넣지 않아서, 지금은 "미리 해 보기"만 됩니다.';
      $('open-room').disabled = true;
    }
    bindPickCanvas();
    for (const b of document.querySelectorAll('[data-sat]')) b.setAttribute('aria-pressed', String(pref('sat', true)));

    if (params.has('demo')) openRoom(true);
    else if (params.get('host')) openRoom(false, params.get('host'));
    else if (room) $('join-name').focus();
  }

  initEntry();
})();
