/* 자리 배치 시뮬레이션 — 학생은 폰으로 바람(친구·자리)을 내고, 선생님 화면은 실시간으로 자리를 맞춘다.
   계산(만족도, 담금질)은 seats-model.js 에 있다.

   실시간 공유는 캠퍼스 지진(sims/quake)과 같은 Firebase Realtime Database 를 쓴다.
   규칙은 sims/quake/database.rules.json 의 "seats" 부분 — 학생은 자기 바람만 쓰고 읽을 수 있고,
   모두의 바람을 읽는 것은 방을 연 선생님 기기뿐이다. 그래서 누가 누구를 골랐는지 학생끼리는 볼 수 없다.

   서버에 두는 것 (seats/rooms/1234/…)
     meta     {teacher, phase: open|closed|published, hall: left|right, cls}   모두 읽기
     roster   {s01: {no, name}}                                              모두 읽기, 선생님만 쓰기
     claims   {s01: uid}   이 이름을 고른 폰                                   모두 읽기, 자기 것만 쓰기
     prefs    {uid: {who: s01, f: 's03,s07', w: '0-1,2-3', t}}              자기 것만, 선생님은 모두
     result   {occ: {'0-1': s01}, t}   공개한 자리                             모두 읽기
     tconf    선생님 화면 상태 (지금 자리, 고정, 떨어뜨리기, 보기 설정)           선생님만

   주소 뒤에 붙이는 것
     ?room=1234   학생: 그 방 번호를 미리 채운다 (QR 코드가 이 주소다)
     ?host=1234   선생님: 새로고침해도 열어 둔 방으로 돌아온다
     ?local       서버 대신 같은 브라우저의 탭끼리만 연결 (개발·연습용) */
(() => {
  'use strict';
  const M = window.SeatsModel, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  // ── 설정 (캠퍼스 지진과 같은 Firebase 프로젝트) ─────────────────
  const FIREBASE = {
    apiKey: 'AIzaSyDyscbvZ4d9dCKHa4EcKEKEKFJJeJTPets',
    authDomain: 'sehwa-f2f95.firebaseapp.com',
    projectId: 'sehwa-f2f95',
    appId: '1:538221310192:web:c0c949065d362562cad235',
    databaseURL: 'https://sehwa-f2f95-default-rtdb.firebaseio.com'
  };
  const FB = 'https://www.gstatic.com/firebasejs/11.6.1/';
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  const ROOT = 'seats/rooms';
  const params = new URLSearchParams(location.search);
  const DB_URL = params.get('db') || FIREBASE.databaseURL;
  const LOCAL_ONLY = params.has('local');

  // ── 작은 도구들 ─────────────────────────────────────────────
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  }
  function svg(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const entries = o => Object.entries(o || {});
  const randInt = () => Math.floor(Math.random() * 2 ** 31);
  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  const pref = (k, d) => { try { const v = localStorage.getItem('seats:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('seats:' + k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 동작에는 지장 없음 */ } };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toastTimers = {};
  function toast(id, text, ms = 3200) {
    const t = $(id);
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimers[id]);
    toastTimers[id] = setTimeout(() => { t.hidden = true; }, ms);
  }
  function showScreen(name) {
    document.body.dataset.screen = name;
    window.scrollTo(0, 0);
  }
  const isDenied = e => /permission|denied/i.test(String(e && (e.code || e.message || e)));

  // ── 실시간 저장소 ─────────────────────────────────────────────
  // 두 가지가 같은 모양으로 동작한다: Firebase(실제 수업) / 이 브라우저 안(미리 해 보기·연습).
  const parts = p => p.split('/').filter(Boolean);
  const copy = v => v == null ? null : JSON.parse(JSON.stringify(v));
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
      let uid = null;
      try { uid = sessionStorage.getItem('seats-uid'); } catch (e) { /* 사생활 보호 모드 */ }
      if (!uid) {
        uid = 'u' + randInt().toString(36);
        try { sessionStorage.setItem('seats-uid', uid); } catch (e) { /* 그대로 진행 */ }
      }
      this.uid = uid;
      this.ready = new Promise(ok => { this.readyOk = ok; setTimeout(ok, 400); });
      try {
        this.ch = new BroadcastChannel('seat-planner');
        this.ch.onmessage = e => this.receive(e.data);
        this.ch.postMessage({op: 'hello'});
      } catch (e) { this.ch = null; }
    }
    now() { return Date.now(); }
    receive(m) {
      if (m.op === 'hello') {
        if (Object.keys(this.tree).length) this.ch.postMessage({op: 'snap', tree: this.tree});
      } else if (m.op === 'snap') {
        this.tree = merge(copy(m.tree), this.tree);
        this.notify(['']);
        this.readyOk();
      } else if (m.op === 'write') this.apply(m.writes, false);
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
    get(path) { return Promise.resolve(copy(getIn(this.tree, parts(path)))); }
    on(path, cb) {
      const s = {ps: parts(path), cb};
      this.subs.add(s);
      cb(copy(getIn(this.tree, s.ps)));
      return () => this.subs.delete(s);
    }
    onStatus(cb) { cb(true); }
  }
  async function firebaseStore() {
    const [A, Auth, D] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js')
    ]);
    const app = A.getApps().find(a => a.name === 'seats') || A.initializeApp(Object.assign({}, FIREBASE, {databaseURL: DB_URL}), 'seats');
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
      get: p => D.get(ref(p)).then(s => s.val()),
      on: (p, cb) => D.onValue(ref(p), s => cb(s.val()), err => console.warn('[seats]', p, err.message)),
      onStatus: cb => D.onValue(ref('.info/connected'), s => cb(!!s.val()))
    };
  }
  // 미리 해 보기는 늘 이 브라우저 안에서만 돌린다 (서버 규칙을 아직 안 올렸어도 써 볼 수 있게)
  async function openStore(local) {
    if (local || LOCAL_ONLY) {
      const s = new LocalStore();
      await s.ready;
      return s;
    }
    return firebaseStore();
  }

  // ── QR 코드 ─────────────────────────────────────────────────
  let qrReady = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (!qrReady) qrReady = new Promise((ok, no) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return qrReady;
  }
  async function drawQR(box, text) {
    box.textContent = '';
    try {
      await loadQR();
      const q = window.qrcode(0, 'M');
      q.addData(text); q.make();
      const n = q.getModuleCount(), m = 2;
      const s = svg('svg', {viewBox: `0 0 ${n + 2 * m} ${n + 2 * m}`, 'shape-rendering': 'crispEdges'}, box);
      svg('rect', {width: n + 2 * m, height: n + 2 * m, fill: '#fff'}, s);
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
      svg('path', {d, fill: '#14283a'}, s);
    } catch (e) {
      box.textContent = 'QR 코드를 불러오지 못했어요. 방 번호를 칠판에 적어 주세요.';
    }
  }

  // ════════════════════════════════════════════════════════════
  //  교실 그림 (선생님 화면, 학생의 자리 고르기, 결과에서 같이 쓴다)
  // ════════════════════════════════════════════════════════════
  const AISLE_VIEW = 0.5, FLOOR_W = M.COLS + 2 * AISLE_VIEW;   // 바닥 너비 = 책상 6개 + 통로 2개
  class Board {
    constructor(host, o) {
      this.o = o = o || {};
      host.textContent = '';
      this.root = h('div', {class: 'room'});
      this.wall = h('div', {class: 'wall'}, h('span', {class: 'chalk', text: '칠판'}), h('span', {class: 'lectern', text: '교탁'}));
      this.sideL = h('div', {class: 'side'});
      this.sideR = h('div', {class: 'side'});
      this.floor = h('div', {class: 'floor'});
      for (let p = 1; p < M.COLS / 2; p++) {
        const x = (2 * p + AISLE_VIEW * (p - 0.5)) / FLOOR_W * 100;
        this.floor.append(h('div', {class: 'aisle', style: `left:${x}%;width:${AISLE_VIEW / FLOOR_W * 100}%`}));
      }
      this.root.append(this.wall, h('div', {class: 'room-mid'}, this.sideL, this.floor, this.sideR));
      host.append(this.root);
      this.seats = {};
      for (const s of M.SEATS) {
        const b = h(o.onSeat ? 'button' : 'div', {class: 'seat', type: o.onSeat ? 'button' : null, 'aria-label': M.seatName(s.id), title: M.seatName(s.id)}, h('span', {class: 'seat-mark'}));
        if (o.onSeat) b.addEventListener('click', e => { e.stopPropagation(); o.onSeat(s.id); });
        this.floor.append(b);
        this.seats[s.id] = b;
      }
      if (o.onFloor) this.floor.addEventListener('click', () => o.onFloor());
      this.chips = new Map();
      this.at = new Map();
      this.view('left', false);
    }
    xy(id) {
      const s = M.SEAT[id];
      let c = this.hall === 'left' ? s.k : M.COLS - 1 - s.k, r = s.r;
      if (this.flip) { c = M.COLS - 1 - c; r = M.ROWS_MAX - 1 - r; }
      // 두 줄씩 붙은 책상 사이에 통로(책상 너비의 반)를 둔다
      return {x: (c + AISLE_VIEW * Math.floor(c / 2) + 0.5) / FLOOR_W * 100, y: (r + 0.5) / M.ROWS_MAX * 100};
    }
    view(hall, flip) {
      hall = hall === 'right' ? 'right' : 'left';
      if (this.hall === hall && this.flip === !!flip) return;
      this.hall = hall; this.flip = !!flip;
      this.root.classList.toggle('flipped', this.flip);
      const hallLeft = (hall === 'left') !== this.flip;
      const side = (el, isHall) => { el.className = 'side ' + (isHall ? 'hall' : 'window'); el.innerHTML = isHall ? '<span>복도</span>' : '<span>창문</span>'; };
      side(this.sideL, hallLeft);
      side(this.sideR, !hallLeft);
      for (const id in this.seats) this.put(this.seats[id], id);
      for (const [key, c] of this.chips) this.put(c, this.at.get(key));
    }
    put(el, id) {
      if (!id || !M.SEAT[id]) return;
      const p = this.xy(id);
      el.style.left = p.x + '%';
      el.style.top = p.y + '%';
    }
    // 자리 표시: {seatId: {cls, text}}
    marks(map) {
      for (const id in this.seats) {
        const m = map && map[id];
        this.seats[id].className = 'seat' + (m && m.cls ? ' ' + m.cls : '');
        this.seats[id].firstChild.textContent = m && m.text || '';
      }
    }
    // 이름표: [{key, seat, label, cls, badge}]
    setChips(list) {
      const keep = new Set();
      for (const it of list) {
        keep.add(it.key);
        let c = this.chips.get(it.key);
        if (!c) {
          c = h(this.o.onChip ? 'button' : 'div', {class: 'chip', type: this.o.onChip ? 'button' : null}, h('span', {class: 'nm'}), h('i', {class: 'badge'}));
          if (this.o.onChip) c.addEventListener('click', e => { e.stopPropagation(); this.o.onChip(it.key); });
          this.floor.append(c);
          this.chips.set(it.key, c);
        }
        c.className = 'chip ' + (it.cls || '');
        c.firstChild.textContent = it.label;
        c.lastChild.textContent = it.badge || '';
        if (it.title) c.title = it.title;
        this.move(it.key, it.seat);
      }
      for (const [k, c] of this.chips) if (!keep.has(k)) { c.remove(); this.chips.delete(k); this.at.delete(k); }
    }
    move(key, seat) {
      const c = this.chips.get(key);
      if (!c || this.at.get(key) === seat) return;
      this.at.set(key, seat);
      this.put(c, seat);
    }
  }

  // ════════════════════════════════════════════════════════════
  //  선생님
  // ════════════════════════════════════════════════════════════
  const T = {
    store: null, code: '', base: '', demo: false,
    meta: null, roster: {}, claims: {}, prefs: {}, result: null,
    list: [], prob: null, rep: null,
    occ: {}, locks: {}, apart: [], fw: 0.6, live: true, flip: false,
    sel: null, moving: false, run: null, pendingQuick: false, liveTimer: 0, sig: '', board: null, loaded: false
  };

  function tPref(key) {
    const uid = T.claims[key], p = uid && T.prefs[uid];
    return p && p.who === key ? {friends: M.splitList(p.f), wishes: M.splitList(p.w)} : null;
  }
  const tStatus = key => !T.claims[key] ? 'none' : tPref(key) ? 'sent' : 'joined';
  const label = key => { const s = T.list.find(x => x.key === key); return s ? s.label : '?'; };

  function buildProb() {
    T.list = M.rosterList(T.roster);
    for (const k of Object.keys(T.locks)) if (!T.roster[k] || !M.SEAT[T.locks[k]]) delete T.locks[k];
    T.apart = T.apart.filter(([a, b]) => T.roster[a] && T.roster[b]);
    const st = T.list.map(s => { const p = tPref(s.key); return {key: s.key, friends: p ? p.friends : [], wishes: p ? p.wishes : []}; });
    T.prob = M.prepare(st, {fw: T.fw, locks: T.locks, apart: T.apart});
    return T.prob;
  }
  // 바람·조건이 바뀌었는지 알아보는 글자열 (바뀌었을 때만 실시간으로 다시 맞춘다)
  function signature() {
    const out = [];
    for (const s of M.rosterList(T.roster)) { const uid = T.claims[s.key], p = uid && T.prefs[uid]; if (p && p.who === s.key) out.push(s.key + ':' + (p.f || '') + '|' + (p.w || '')); }
    return out.join(';') + '#' + Object.keys(T.roster).length;
  }

  function tRender() {
    drawCounts();
    drawRoster();
    drawPhase();
    if (T.run) return;   // 돌리는 동안에는 자리를 건드리지 않는다 (끝나면 다시 그린다)
    buildProb();
    const occ = M.toOcc(T.prob, T.occ);
    T.occ = M.toMap(T.prob, occ);
    T.rep = M.report(T.prob, occ);
    drawBoard();
    drawStats(T.rep);
    drawSel();
    drawConstraints();
  }

  function drawCounts() {
    const keys = Object.keys(T.roster);
    $('t-total').textContent = keys.length;
    $('t-joined').textContent = keys.filter(k => T.claims[k]).length;
    $('t-sent').textContent = keys.filter(k => tStatus(k) === 'sent').length;
    $('t-cls').textContent = T.meta && T.meta.cls ? '· ' + T.meta.cls : '';
  }

  // 화면(프로젝터)에는 누가 누구를·어디를 골랐는지, 누구 바람이 이루어졌는지 짐작할 만한 것을 아무것도 띄우지 않는다.
  //  - 받는 동안(open)에는 이름을 가린다. 바람이 들어올 때 이름표가 움직이는 것을 보고 짐작할 수 없게.
  //  - 학생별 만족도 색, 친구 선, 고른 친구·자리 목록은 아예 그리지 않는다. 계산에만 쓴다.
  const named = () => !!T.meta && T.meta.phase !== 'open';
  function drawBoard() {
    const b = T.board, rep = T.rep, show = named();
    b.view(T.meta && T.meta.hall, T.flip);
    b.root.classList.toggle('anon', !show);
    b.setChips(T.list.map(s => {
      let cls = '';
      if (show && T.locks[s.key]) cls += ' locked';
      if (show && T.sel === s.key) cls += ' selected';
      if (T.moving) cls += ' target';
      return {key: s.key, seat: rep.byKey[s.key].seat, label: show ? s.label : '', cls, badge: show && T.locks[s.key] ? '📌' : '', title: show ? s.label : ''};
    }));
    const marks = {};
    if (T.moving) for (const s of M.SEATS) marks[s.id] = {cls: 'target'};
    b.marks(marks);
    b.root.classList.toggle('moving', T.moving);
    $('t-hint').textContent = !show ? '받는 동안에는 이름을 가려요 — 자리가 움직이는 것을 보고 누가 누구를 골랐는지 짐작할 수 없게요. 마감하면 처음부터 다시 섞은 뒤 이름이 보여요.'
      : T.moving ? `${label(T.sel)} — 옮길 자리를 누르세요 (빈자리나 다른 학생). 그만두려면 빈 바닥을 누르세요.`
      : '이름을 누르면 그 학생을 옮기거나 고정할 수 있어요.';
  }
  function drawPositions() {
    for (const [seat, key] of entries(T.occ)) T.board.move(key, seat);
  }

  function drawStats(rep) {
    $('st-avg').textContent = pct(rep.avg);
    $('st-fr').textContent = rep.hasF ? `${rep.withF} / ${rep.hasF}명` : '—';
    $('st-wi').textContent = rep.hasW ? `${rep.wishHit} / ${rep.hasW}명` : '—';
    $('st-ap-row').hidden = !T.apart.length;
    $('st-ap').textContent = rep.apartBad;
    $('st-ap-row').classList.toggle('bad', rep.apartBad > 0);
  }

  function drawRoster() {
    const box = $('t-roster');
    box.textContent = '';
    for (const s of M.rosterList(T.roster)) {
      const st = tStatus(s.key);
      box.append(h('button', {type: 'button', class: 'pill st-' + st + (T.sel === s.key ? ' selected' : ''), title: {none: '아직 안 들어옴', joined: '들어왔지만 아직 안 냄', sent: '냈어요'}[st], onclick: () => tChip(s.key)},
        s.no != null ? h('small', {text: s.no}) : null, s.label));
    }
    if (!box.firstChild) box.append(h('p', {class: 'hint', text: '명단을 넣으면 여기에 나와요.'}));
  }

  const occSig = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
  function drawPhase() {
    const ph = T.meta ? T.meta.phase : 'open';
    const changed = ph === 'published' && T.result && occSig(T.result.occ) !== occSig(T.occ);
    $('t-close').textContent = ph === 'open' ? '받기 마감' : '다시 받기';
    const pub = $('t-publish');
    pub.textContent = ph === 'published' ? (changed ? '바뀐 자리로 다시 공개' : '공개됨 ✓ (내리기)') : '학생 폰에 공개';
    pub.classList.toggle('done', ph === 'published' && !changed);
    $('t-phase-note').textContent = ph === 'open' ? '학생들이 바람을 내는 중이에요. 마감 전까지는 고칠 수 있어요.'
      : ph === 'closed' ? '마감했어요. 학생들은 더 고칠 수 없어요.'
      : changed ? '공개한 뒤에 자리를 바꿨어요. 다시 공개해야 학생 폰에 반영돼요.' : '학생 폰에 새 자리가 보이고 있어요.';
  }

  function drawSel() {
    const box = $('t-sel'), key = T.sel;
    if (!key || !T.roster[key] || !T.rep || !named()) { box.hidden = true; return; }
    const r = T.rep.byKey[key], st = tStatus(key);
    box.hidden = false;
    box.textContent = '';
    const tag = {none: ['미접속', 'none'], joined: ['들어옴 · 아직 안 냄', 'joined'], sent: ['냈어요', 'sent']}[st];
    box.append(h('div', {class: 'sel-head'}, h('h3', {text: label(key)}), h('span', {class: 'tag st-' + tag[1], text: tag[0]}),
      h('button', {type: 'button', class: 'x', 'aria-label': '닫기', text: '×', onclick: () => { T.sel = null; T.moving = false; tRender(); }})));
    box.append(h('p', {class: 'sel-seat', text: M.seatName(r.seat) + (T.locks[key] ? ' · 📌 고정' : '')}));
    const row = h('div', {class: 'sel-actions'},
      h('button', {type: 'button', class: T.moving ? 'on' : '', text: T.moving ? '옮기기 그만' : '자리 옮기기', onclick: () => { T.moving = !T.moving; drawBoard(); drawSel(); }}),
      h('button', {type: 'button', text: T.locks[key] ? '고정 풀기' : '📌 고정', onclick: () => {
        if (T.locks[key]) delete T.locks[key]; else T.locks[key] = r.seat;
        afterConstraint();
      }}),
      T.claims[key] ? h('button', {type: 'button', class: 'ghost', text: '접속 풀기', title: '다른 폰으로 다시 들어오게 합니다', onclick: () => releaseClaim(key)}) : null);
    box.append(row);
  }

  function drawConstraints() {
    const opts = sel => {
      const v = sel.value;
      sel.textContent = '';
      sel.append(h('option', {value: '', text: '학생 고르기'}));
      for (const s of T.list) sel.append(h('option', {value: s.key, text: (s.no != null ? s.no + ' ' : '') + s.label}));
      sel.value = T.roster[v] ? v : '';
    };
    opts($('ap-a')); opts($('ap-b'));
    const ap = $('ap-list');
    ap.textContent = '';
    T.apart.forEach(([a, b], i) => {
      const bad = T.rep && T.rep.byKey[a] && T.rep.byKey[b] && M.near(M.SEAT[T.rep.byKey[a].seat], M.SEAT[T.rep.byKey[b].seat]) >= 0.5;
      ap.append(h('li', {class: bad ? 'bad' : ''}, `${label(a)} ↔ ${label(b)}`, h('button', {type: 'button', 'aria-label': '빼기', text: '×', onclick: () => { T.apart.splice(i, 1); afterConstraint(); }})));
    });
    if (!T.apart.length) ap.append(h('li', {class: 'muted', text: '없음'}));
    const lk = $('lock-list');
    lk.textContent = '';
    for (const [k, seat] of entries(T.locks)) lk.append(h('li', {}, `${label(k)} · ${M.seatName(seat)}`, h('button', {type: 'button', 'aria-label': '고정 풀기', text: '×', onclick: () => { delete T.locks[k]; afterConstraint(); }})));
    if (!Object.keys(T.locks).length) lk.append(h('li', {class: 'muted', text: '없음'}));
    for (const b of document.querySelectorAll('#screen-teacher [data-hall]')) b.setAttribute('aria-pressed', String((T.meta && T.meta.hall || 'left') === b.dataset.hall));
  }

  function afterConstraint() {
    tRender();
    saveConf();
    if (T.live) scheduleQuick(0);
  }

  // 이름표·자리를 누르면
  function tChip(key) {
    if (T.run) return;
    if (!named()) { toast('t-toast', '받는 동안에는 이름을 가려 둬요. 마감한 뒤에 옮기거나 고정할 수 있어요.'); return; }
    if (T.moving && T.sel && key !== T.sel) return moveTo(T.rep.byKey[key].seat);
    T.moving = false;
    T.sel = T.sel === key ? null : key;
    tRender();
  }
  function tSeat(id) {
    if (T.run) return;
    if (T.moving && T.sel) return moveTo(id);
    if (!named()) return;
    const key = T.occ[id];
    if (key) return tChip(key);
    if (T.sel) { T.sel = null; tRender(); }
  }
  function tFloor() {
    if (T.sel || T.moving) { T.sel = null; T.moving = false; tRender(); }
  }
  function moveTo(target) {
    const key = T.sel, from = T.rep.byKey[key].seat;
    if (target === from) { T.moving = false; tRender(); return; }
    const other = T.occ[target];
    if (other && T.locks[other]) { toast('t-toast', `${label(other)}은(는) 고정된 자리예요. 먼저 고정을 풀어 주세요.`); return; }
    T.occ[target] = key;
    if (other) T.occ[from] = other; else delete T.occ[from];
    T.locks[key] = target;   // 손으로 옮긴 학생은 실시간 맞추기에 다시 밀려나지 않게 고정
    T.moving = false;
    tRender();
    saveConf();
    toast('t-toast', `${label(key)}을(를) 옮기고 📌 고정했어요.`);
  }

  async function releaseClaim(key) {
    const uid = T.claims[key];
    if (!uid || !confirm(`${label(key)}의 접속을 풀까요?\n다른 폰으로 다시 들어와 이름을 고를 수 있게 됩니다. 이미 낸 바람도 지워져요.`)) return;
    await guard(T.store.update(T.base, {['claims/' + key]: null, ['prefs/' + uid]: null}), '접속 풀기');
  }

  function guard(promise, what) {
    return Promise.resolve(promise).catch(e => {
      console.warn('[seats]', what, e);
      alert(`${what}에 실패했어요.\n${e && e.message ? e.message : e}\n\n인터넷 연결과 Firebase 규칙을 확인해 주세요.`);
      throw e;
    });
  }

  let confTimer = 0;
  function saveConf() {
    clearTimeout(confTimer);
    confTimer = setTimeout(() => {
      if (!T.store) return;
      T.store.set(T.base + '/tconf', {
        occ: T.occ, locks: T.locks, apart: T.apart.length ? T.apart : null,
        fw: T.fw, live: T.live, flip: T.flip
      }).catch(e => console.warn('[seats] tconf', e));
    }, 800);
  }

  // ── 담금질을 화면에 보여 주며 돌리기 ─────────────────────────────
  // quick: 지금 자리에서 조금만 (바람이 들어올 때마다), full: 처음부터 크게 섞어서
  function scheduleQuick(delay = 700) {
    clearTimeout(T.liveTimer);
    T.liveTimer = setTimeout(() => {
      if (T.run) { T.pendingQuick = true; return; }
      runAnneal('quick');
    }, delay);
  }
  function progress(v, text) {
    const p = $('t-progress');
    if (v == null) { p.hidden = true; return; }
    p.hidden = false;
    p.firstChild.style.width = Math.round(v * 100) + '%';
    p.lastChild.textContent = text || '';
  }
  function runAnneal(kind) {
    const full = kind === 'full';
    if (T.run) {
      if (!full) { T.pendingQuick = true; return; }
      T.run.cancel = true;
      T.run = null;
    }
    const prob = buildProb();
    if (!prob.n) { if (full) toast('t-toast', '명단을 먼저 넣어 주세요.'); return; }
    const start = full ? M.randomOcc(prob) : M.toOcc(prob, T.occ);
    const ann = new M.Annealer(prob, start, full ? {iters: 36000, T0: 0.3, T1: 0.002} : {iters: 6000, T0: 0.04, T1: 0.002});
    const frames = full ? 170 : 36, per = Math.ceil(ann.iters / frames);
    const run = T.run = {cancel: false, kind};
    if (full) { T.sel = null; }
    T.moving = false;
    const root = T.board.root;
    root.classList.add('running');
    root.classList.toggle('shake', full);
    $('t-run').disabled = full;
    T.board.marks({});
    if (full) { T.occ = M.toMap(prob, ann.occ); drawPositions(); }
    const finish = occ => {
      if (run.cancel) return;
      T.run = null;
      root.classList.remove('running', 'shake');
      $('t-run').disabled = false;
      progress(null);
      T.occ = M.toMap(prob, occ);
      tRender();
      saveConf();
      if (full) {
        const r = T.rep;
        toast('t-toast', r.avg == null ? '자리를 섞었어요. 바람이 들어오면 그에 맞춰 다시 맞춰요.' : `다 찾았어요 — 평균 만족도 ${pct(r.avg)}`);
      }
      if (T.pendingQuick) { T.pendingQuick = false; scheduleQuick(200); }
    };
    const tick = () => {
      if (run.cancel) return;
      const done = ann.step(per);
      T.occ = M.toMap(prob, ann.occ);
      drawPositions();
      drawStats(M.report(prob, ann.occ));
      const f = ann.it / ann.iters;
      if (full) progress(f * 0.8, f < 0.35 ? '크게 섞는 중… (온도가 높아요)' : f < 0.75 ? '친구끼리 모으는 중…' : '자리를 다듬는 중…');
      else progress(f, '새 바람에 맞추는 중…');
      if (!done) { requestAnimationFrame(tick); return; }
      let best = M.polish(prob, ann.bestOcc), bestScore = M.score(prob, best);
      if (!full) { finish(best); return; }
      // 다른 무작위 배치에서도 몇 번 더 찾아본다 (한 번에 하나씩 — 화면이 멈추지 않게)
      let r = 0;
      const more = () => {
        if (run.cancel) return;
        const o = M.optimize(prob, null, {restarts: 1, iters: 30000});
        const sc = M.score(prob, o);
        if (sc > bestScore + 1e-9) { best = o; bestScore = sc; }
        r++;
        progress(0.8 + 0.2 * r / 4, '더 나은 배치가 있는지 찾아보는 중…');
        if (r < 4) setTimeout(more, 30); else finish(best);
      };
      setTimeout(more, 30);
    };
    requestAnimationFrame(tick);
  }

  // ── 방 열기 ─────────────────────────────────────────────────
  async function openRoom(demo, existing) {
    const note = $('server-note');
    note.classList.remove('error');
    note.textContent = demo ? '' : '서버에 연결하는 중…';
    for (const b of [$('open-room'), $('open-demo')]) b.disabled = true;
    const fail = msg => {
      note.textContent = msg;
      note.classList.add('error');
      for (const b of [$('open-room'), $('open-demo')]) b.disabled = false;
    };
    try {
      T.store = await openStore(demo);
    } catch (e) {
      return fail(e.message || String(e));
    }
    T.demo = demo;
    let code = existing;
    try {
      if (code) {
        const meta = await T.store.get(`${ROOT}/${code}/meta`);
        if (!meta || meta.teacher !== T.store.uid) code = null;
      }
      if (!code) {
        for (let i = 0; i < 20 && !code; i++) {
          const c = String(1000 + Math.floor(Math.random() * 9000));
          if (!(await T.store.get(`${ROOT}/${c}/meta`))) code = c;
        }
        await T.store.set(`${ROOT}/${code}/meta`, {teacher: T.store.uid, created: T.store.now(), phase: 'open', hall: pref('hall', 'left'), cls: '', demo: demo || null});
      }
    } catch (e) {
      console.warn('[seats] open', e);
      return fail(isDenied(e)
        ? '서버가 자리 배치 방을 아직 받아 주지 않아요. Firebase 콘솔 → Realtime Database → 규칙에 sims/quake/database.rules.json 내용을 붙여 넣고 게시해 주세요. 그 전에는 "가상 학생과 미리 해 보기"로 써 볼 수 있어요.'
        : '방을 열지 못했어요: ' + (e.message || e));
    }
    T.code = code;
    T.base = `${ROOT}/${code}`;
    const conf = existing ? await T.store.get(T.base + '/tconf').catch(() => null) : null;
    if (conf) {
      T.occ = conf.occ || {}; T.locks = conf.locks || {}; T.apart = (conf.apart || []).map(p => [p[0], p[1]]);
      T.fw = conf.fw ?? 0.6; T.live = conf.live !== false; T.flip = !!conf.flip;
    }
    history.replaceState(null, '', demo ? location.pathname + (LOCAL_ONLY ? '?local' : '') : '?host=' + code + (LOCAL_ONLY ? '&local' : ''));
    showScreen('teacher');
    $('t-code').querySelector('b').textContent = code;
    $('t-code').classList.toggle('demo', demo);
    if (demo) $('t-code').querySelector('b').textContent = '미리 해 보기';
    T.board = new Board($('t-board'), {onSeat: tSeat, onChip: tChip, onFloor: tFloor});
    bindTeacher();
    const on = (p, f) => T.store.on(T.base + p, v => { f(v); tChanged(); });
    on('/meta', v => { T.meta = v || T.meta; });
    on('/roster', v => { T.roster = v || {}; });
    on('/claims', v => { T.claims = v || {}; });
    on('/prefs', v => { T.prefs = v || {}; });
    on('/result', v => { T.result = v; });
    T.store.onStatus(ok => { $('t-conn').className = 'conn ' + (ok ? 'on' : 'off'); });
    T.loaded = true;
    T.sig = signature();
    tRender();
    const roster = await T.store.get(T.base + '/roster');
    if (!roster) openRosterDialog(true);
  }

  function tChanged() {
    if (!T.loaded) return;
    tRender();
    const s = signature();
    if (s !== T.sig) {
      T.sig = s;
      if (T.live) scheduleQuick();
    }
  }

  let bound = false;
  function bindTeacher() {
    if (bound) return;
    bound = true;
    $('t-run').onclick = () => runAnneal('full');
    const live = $('t-live');
    live.checked = T.live;
    live.onchange = () => { T.live = live.checked; saveConf(); if (T.live) scheduleQuick(0); };
    const fw = $('t-fw');
    const fwText = () => { $('t-fw-f').textContent = Math.round(T.fw * 100); $('t-fw-w').textContent = 100 - Math.round(T.fw * 100); };
    fw.value = Math.round(T.fw * 100);
    fwText();
    fw.oninput = () => { T.fw = fw.value / 100; fwText(); if (!T.run) { buildProb(); T.rep = M.report(T.prob, M.toOcc(T.prob, T.occ)); drawBoard(); drawStats(T.rep); } };
    fw.onchange = () => { saveConf(); scheduleQuick(0); };
    $('t-close').onclick = async () => {
      const ph = T.meta.phase;
      if (ph === 'open') {
        // 이름을 보이기 전에 처음부터 다시 섞는다 — 받는 동안의 움직임과 이어지지 않게
        await guard(T.store.update(T.base, {'meta/phase': 'closed'}), '마감');
        runAnneal('full');
        return;
      }
      if (ph === 'published' && !confirm('학생 폰의 공개를 내리고 다시 바람을 받을까요?')) return;
      await guard(T.store.update(T.base, {'meta/phase': 'open', result: null}), '다시 받기');
    };
    $('t-publish').onclick = async () => {
      const ph = T.meta.phase;
      if (T.run) return toast('t-toast', '자리를 다 찾은 뒤에 공개해 주세요.');
      if (ph === 'published' && T.result && occSig(T.result.occ) === occSig(T.occ)) {
        if (confirm('학생 폰에서 공개를 내릴까요? (받기는 마감된 채로 둡니다)')) await guard(T.store.update(T.base, {'meta/phase': 'closed', result: null}), '공개 내리기');
        return;
      }
      if (!Object.keys(T.roster).length) return toast('t-toast', '명단을 먼저 넣어 주세요.');
      if (ph === 'open') return toast('t-toast', '먼저 받기를 마감해 주세요. 마감하면 자리를 처음부터 다시 찾은 뒤 이름이 보여요.', 5000);
      await guard(T.store.update(T.base, {result: {occ: T.occ, t: T.store.now()}, 'meta/phase': 'published'}), '공개');
      toast('t-toast', '학생 폰에 공개했어요.');
    };
    $('t-code').onclick = () => { if (!T.demo) showQR(); else toast('t-toast', '미리 해 보기는 이 브라우저 안에서만 돌아가요. 학생 폰으로 해 보려면 처음 화면에서 방을 여세요.', 5000); };
    $('t-qr-again').onclick = $('t-code').onclick;
    $('t-roster-btn').onclick = () => openRosterDialog(false);
    $('t-print').onclick = () => {
      const d = new Date();
      $('print-head').textContent = `${T.meta && T.meta.cls ? T.meta.cls + ' ' : ''}자리 배치 · ${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
      window.print();
    };
    for (const b of document.querySelectorAll('#screen-teacher [data-hall]')) b.onclick = () => {
      setPref('hall', b.dataset.hall);
      guard(T.store.update(T.base, {'meta/hall': b.dataset.hall}), '복도 위치');
    };
    const chk = (id, k) => { const c = $(id); c.checked = T[k]; c.onchange = () => { T[k] = c.checked; tRender(); saveConf(); }; };
    chk('t-flip', 'flip');
    $('ap-add').onclick = () => {
      const a = $('ap-a').value, b = $('ap-b').value;
      if (!a || !b || a === b) return toast('t-toast', '서로 다른 두 학생을 골라 주세요.');
      if (T.apart.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
      T.apart.push([a, b]);
      $('ap-a').value = $('ap-b').value = '';
      afterConstraint();
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.dataset.screen === 'teacher' && (T.sel || T.moving)) tFloor(); });
  }

  function showQR() {
    const url = location.origin + location.pathname + '?room=' + T.code + (LOCAL_ONLY ? '&local' : '');
    $('qr-code').textContent = T.code;
    $('qr-url').textContent = url;
    drawQR($('qr'), url);
    const d = $('qr-dialog');
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }

  // ── 명단 ─────────────────────────────────────────────────────
  const DEMO_NAMES = '김민지 이서연 박지후 최유나 정하은 강서준 조예린 윤도현 장수아 임지호 한지민 오승우 서다인 신유준 권나연 황시우 안채원 송민재 류하린 홍준서 전소율 고은우 문서윤 양태윤 손지아 배현우 백가은 허주원 유다은 남건우'.split(' ');
  const rosterText = roster => M.rosterList(roster).map(s => (s.no != null ? s.no + ' ' : '') + s.name).join('\n');
  function openRosterDialog(first) {
    const d = $('roster-dialog');
    const saved = pref('rosters', {});
    let hall = T.meta && T.meta.hall || pref('hall', 'left');
    $('r-cls').value = T.meta && T.meta.cls || '';
    $('r-text').value = rosterText(T.roster) || (T.demo ? DEMO_NAMES.map((n, i) => `${i + 1} ${n}`).join('\n') : '');
    if (T.demo && !$('r-cls').value) $('r-cls').value = '미리 해 보기반';
    const dl = $('r-saved');
    dl.textContent = '';
    for (const k of Object.keys(saved)) dl.append(h('option', {value: k}));
    const count = () => {
      const n = M.parseRoster($('r-text').value).length;
      const over = n > M.NSEAT;
      $('r-count').textContent = n ? `${n}명 · 자리 ${M.NSEAT}개${over ? ` — ${n - M.NSEAT}명이 넘어요` : n < M.NSEAT ? ` (빈자리 ${M.NSEAT - n}개는 뒤쪽에 남겨요)` : ''}` : (Object.keys(saved).length ? '반 이름 칸을 누르면 저장해 둔 명단을 고를 수 있어요.' : '');
      $('r-count').classList.toggle('error', over);
      $('r-ok').disabled = !n || over;
    };
    const segs = () => { for (const b of d.querySelectorAll('[data-hall]')) b.setAttribute('aria-pressed', String(b.dataset.hall === hall)); };
    for (const b of d.querySelectorAll('[data-hall]')) b.onclick = () => { hall = b.dataset.hall; segs(); };
    $('r-cls').oninput = () => { const t = saved[$('r-cls').value]; if (t && !$('r-text').value.trim()) { $('r-text').value = t; count(); } };
    $('r-cls').onchange = () => { const t = saved[$('r-cls').value]; if (t && $('r-text').value.trim() !== t.trim() && (!$('r-text').value.trim() || confirm(`저장해 둔 '${$('r-cls').value}' 명단으로 바꿀까요?`))) { $('r-text').value = t; count(); } };
    $('r-text').oninput = count;
    $('roster-form').onsubmit = e => e.preventDefault();
    $('r-cancel').onclick = e => { e.preventDefault(); d.close(); };
    $('r-ok').textContent = first ? '저장하고 학생 받기' : '저장';
    $('r-ok').onclick = async e => {
      e.preventDefault();
      const ok = await saveRoster($('r-cls').value.trim(), $('r-text').value, hall);
      if (!ok) return;
      d.close();
      if (first) { if (T.demo) startBots(); else showQR(); }
    };
    segs();
    count();
    d.showModal();
  }
  async function saveRoster(cls, text, hall) {
    const list = M.parseRoster(text);
    if (!list.length || list.length > M.NSEAT) return false;
    const roster = M.assignKeys(list, T.roster);
    const upd = {roster, 'meta/cls': cls, 'meta/hall': hall};
    for (const k of Object.keys(T.roster)) {
      if (roster[k]) continue;
      upd['claims/' + k] = null;
      if (T.claims[k]) upd['prefs/' + T.claims[k]] = null;
      delete T.locks[k];
    }
    try { await guard(T.store.update(T.base, upd), '명단 저장'); } catch (e) { return false; }
    setPref('hall', hall);
    if (cls && !T.demo) { const saved = pref('rosters', {}); saved[cls] = text.trim(); setPref('rosters', saved); }
    saveConf();
    return true;
  }

  // ── 미리 해 보기: 가상 학생들이 차례로 들어와 바람을 낸다 ──────────
  function startBots() {
    const store = T.store, base = T.base;
    const order = shuffle(M.rosterList(T.roster).map(s => s.key));
    const groups = [];
    const sizes = [2, 3, 4, 3, 2, 3, 4, 2, 3, 2, 3];
    for (let q = 0; q < order.length;) { const n = sizes[groups.length % sizes.length]; groups.push(order.slice(q, q + n)); q += n; }
    const pickSeat = zone => {
      const pool = M.SEATS.filter(s => ({
        front: s.r <= 1, back: s.r >= 3, window: s.k === M.COLS - 1, hall: s.k === 0, middle: s.k >= 2 && s.k <= 3 && s.r >= 1 && s.r <= 3
      })[zone]);
      return pool[Math.floor(Math.random() * pool.length)].id;
    };
    const zones = ['front', 'back', 'window', 'hall', 'middle', null, 'back', 'front', null];
    const plan = {};
    groups.forEach((g, gi) => {
      const zone = zones[Math.floor(Math.random() * zones.length)];
      for (const k of g) {
        const mates = shuffle(g.filter(x => x !== k));
        const f = mates.slice(0, 1 + Math.floor(Math.random() * Math.min(3, mates.length)));
        if (Math.random() < 0.25) { const other = groups[(gi + 1) % groups.length]; if (other[0] && other[0] !== k && f.length < 3) f.push(other[0]); }
        const w = [];
        if (zone && Math.random() < 0.75) { const n = 1 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) { const s = pickSeat(zone); if (!w.includes(s)) w.push(s); } }
        plan[k] = {f: f.join(','), w: w.join(',')};
      }
    });
    // 두 명은 끝까지 안 들어오고, 두 명은 들어와서 안 낸다 (실제 수업처럼)
    const never = new Set(order.slice(-2)), lurk = new Set(order.slice(-4, -2));
    order.forEach((k, i) => {
      if (never.has(k)) return;
      setTimeout(() => {
        if (T.store !== store) return;
        store.set(`${base}/claims/${k}`, 'bot-' + k);
        if (lurk.has(k)) return;
        setTimeout(() => { if (T.store === store) store.set(`${base}/prefs/bot-${k}`, Object.assign({who: k, t: store.now()}, plan[k])); }, 1500 + Math.random() * 5000);
      }, 600 + i * 450 + Math.random() * 1500);
    });
    toast('t-toast', '가상 학생들이 하나씩 들어와요. 바람이 들어올 때마다 자리가 맞춰지는 것을 보세요.', 6000);
  }

  // ════════════════════════════════════════════════════════════
  //  학생
  // ════════════════════════════════════════════════════════════
  const S = {
    store: null, code: '', base: '', meta: undefined, roster: {}, claims: {}, result: null, mine: undefined,
    key: null, f: [], w: [], dirty: false, editing: false, wishBoard: null, resBoard: null, sending: false
  };
  const sLabel = key => { const s = M.rosterList(S.roster).find(x => x.key === key); return s ? s.label : '?'; };

  async function joinRoom(code) {
    const err = $('join-error');
    err.hidden = true;
    $('join-btn').disabled = true;
    const fail = msg => { err.textContent = msg; err.hidden = false; $('join-btn').disabled = false; };
    try {
      S.store = await openStore(false);
    } catch (e) {
      return fail(e.message || String(e));
    }
    S.code = code;
    S.base = `${ROOT}/${code}`;
    let meta;
    try { meta = await S.store.get(S.base + '/meta'); } catch (e) { return fail(isDenied(e) ? '서버가 아직 자리 배치를 받아 주지 않아요. 선생님께 알려 주세요.' : '연결하지 못했어요: ' + (e.message || e)); }
    if (!meta) return fail(`${code}번 방을 찾을 수 없어요. 방 번호를 다시 확인해 주세요.`);
    setPref('room', code);
    history.replaceState(null, '', '?room=' + code + (LOCAL_ONLY ? '&local' : ''));
    showScreen('student');
    S.wishBoard = new Board($('wish-board'), {onSeat: toggleWish});
    S.resBoard = new Board($('result-board'), {});
    const on = (p, f) => S.store.on(S.base + p, v => { f(v); sRender(); });
    on('/meta', v => { S.meta = v; });
    on('/roster', v => { S.roster = v || {}; });
    on('/claims', v => { S.claims = v || {}; });
    on('/result', v => { S.result = v; });
    on('/prefs/' + S.store.uid, v => {
      S.mine = v;
      if (v && !S.dirty) { S.f = M.splitList(v.f); S.w = M.splitList(v.w); }
    });
    S.store.onStatus(ok => { $('st-conn').className = 'conn ' + (ok ? 'on' : 'off'); });
    $('send-btn').onclick = sendPrefs;
    $('edit-btn').onclick = () => { S.editing = true; sRender(); };
    $('rename-btn').onclick = async () => {
      if (!confirm('내 이름을 다시 고를까요? 지금까지 고른 것은 지워져요.')) return;
      try {
        await S.store.update(S.base, {['claims/' + S.key]: null, ['prefs/' + S.store.uid]: null});
        S.f = []; S.w = []; S.dirty = false; S.editing = false;
      } catch (e) { toast('st-toast', '지우지 못했어요. 마감됐을 수 있어요.'); }
    };
  }

  function sRender() {
    const m = S.meta;
    const steps = ['st-pick', 'st-prefs', 'st-wait', 'st-result'];
    const show = id => { for (const s of steps) $(s).hidden = s !== id; $('st-error').hidden = true; };
    if (m === undefined) return;
    if (m === null) {
      show(null);
      $('st-error').textContent = '방이 닫혔어요. 선생님께 새 방 번호를 물어보세요.';
      $('st-error').hidden = false;
      return;
    }
    const uid = S.store.uid;
    S.key = Object.keys(S.claims).find(k => S.claims[k] === uid && S.roster[k]) || null;
    $('st-title').textContent = m.cls ? `${m.cls} 자리 배치` : '자리 배치';
    $('st-sub').textContent = `방 ${S.code}` + (S.key ? ' · ' + sLabel(S.key) : '');
    if (m.phase === 'published' && S.result && S.result.occ) { show('st-result'); drawResult(); return; }
    if (!S.key) {
      if (m.phase === 'open') { show('st-pick'); drawPick(); }
      else { show('st-wait'); drawWait(); }
      return;
    }
    if (m.phase === 'open' && (S.editing || !S.mine)) { show('st-prefs'); drawPrefs(); return; }
    show('st-wait');
    drawWait();
  }

  function drawPick() {
    const g = $('name-grid');
    g.textContent = '';
    for (const s of M.rosterList(S.roster)) {
      const taken = !!S.claims[s.key];
      g.append(h('button', {type: 'button', class: 'name' + (taken ? ' taken' : ''), disabled: taken, onclick: () => claim(s)},
        s.no != null ? h('small', {text: s.no}) : null, h('span', {text: s.label}), taken ? h('em', {text: '들어옴'}) : null));
    }
    if (!g.firstChild) g.append(h('p', {class: 'hint', text: '선생님이 명단을 넣는 중이에요. 잠시만 기다려 주세요.'}));
  }
  async function claim(s) {
    if (!confirm(`${s.no != null ? s.no + '번 ' : ''}${s.label} 맞나요?`)) return;
    try {
      await S.store.set(`${S.base}/claims/${s.key}`, S.store.uid);
      S.f = []; S.w = []; S.dirty = false; S.editing = true;
    } catch (e) {
      toast('st-toast', '이미 다른 폰에서 고른 이름이에요. 내 이름이 맞다면 선생님께 말해 주세요.', 5000);
    }
  }

  function drawPrefs() {
    const g = $('friend-grid');
    g.textContent = '';
    for (const s of M.rosterList(S.roster)) {
      if (s.key === S.key) continue;
      const at = S.f.indexOf(s.key);
      g.append(h('button', {type: 'button', class: 'name' + (at >= 0 ? ' on' : ''), 'aria-pressed': String(at >= 0), onclick: () => toggleFriend(s.key)},
        at >= 0 ? h('b', {class: 'rank', text: at + 1}) : null, h('span', {text: s.label})));
    }
    $('f-count').textContent = `${S.f.length} / ${M.MAX_FRIENDS}`;
    $('w-count').textContent = `${S.w.length} / ${M.MAX_WISHES}`;
    S.wishBoard.view(S.meta.hall, false);
    const marks = {};
    S.w.forEach((id, i) => { marks[id] = {cls: 'wish', text: '★' + (i + 1)}; });
    S.wishBoard.marks(marks);
    $('send-btn').textContent = S.mine ? '고친 내용 보내기' : '보내기';
    $('send-btn').disabled = S.sending;
    $('send-note').textContent = S.mine && S.dirty ? '고친 내용은 보내기를 눌러야 반영돼요.' : S.mine ? '보낸 내용 그대로예요.' : '';
  }
  function toggleFriend(key) {
    const at = S.f.indexOf(key);
    if (at >= 0) S.f.splice(at, 1);
    else if (S.f.length >= M.MAX_FRIENDS) return toast('st-toast', `친구는 ${M.MAX_FRIENDS}명까지예요. 한 명을 빼고 다시 눌러 주세요.`);
    else S.f.push(key);
    S.dirty = true;
    drawPrefs();
  }
  function toggleWish(id) {
    const at = S.w.indexOf(id);
    if (at >= 0) S.w.splice(at, 1);
    else if (S.w.length >= M.MAX_WISHES) return toast('st-toast', `자리는 ${M.MAX_WISHES}곳까지예요. 하나를 빼고 다시 눌러 주세요.`);
    else S.w.push(id);
    S.dirty = true;
    drawPrefs();
  }
  async function sendPrefs() {
    if (!S.f.length && !S.w.length && !confirm('친구도 자리도 안 골랐어요. 어디든 괜찮다고 보낼까요?')) return;
    S.sending = true;
    drawPrefs();
    try {
      await S.store.set(`${S.base}/prefs/${S.store.uid}`, {who: S.key, f: S.f.join(','), w: S.w.join(','), t: S.store.now()});
      S.dirty = false; S.editing = false;
      toast('st-toast', '보냈어요! 선생님 화면에서 자리가 맞춰지고 있어요.');
    } catch (e) {
      toast('st-toast', S.meta && S.meta.phase !== 'open' ? '이미 마감됐어요.' : '보내지 못했어요. 인터넷 연결을 확인해 주세요.', 5000);
    }
    S.sending = false;
    sRender();
  }

  function drawWait() {
    const m = S.meta, ph = m.phase;
    const sum = $('wait-sum');
    sum.textContent = '';
    $('edit-btn').hidden = true;
    if (!S.key) {
      $('wait-icon').textContent = '⏸';
      $('wait-title').textContent = '받기가 마감됐어요';
      $('wait-text').textContent = '이름을 고르기 전에 마감됐어요. 선생님께 말하면 다시 열어 주실 수 있어요.';
      return;
    }
    if (!S.mine) {
      $('wait-icon').textContent = '⏸';
      $('wait-title').textContent = '마감됐어요';
      $('wait-text').textContent = '바람을 보내기 전에 마감됐어요. 선생님이 자리를 정해 주실 거예요.';
      return;
    }
    $('wait-icon').textContent = '✓';
    $('wait-title').textContent = '보냈어요';
    $('wait-text').textContent = ph === 'open' ? '선생님 화면에서 자리가 맞춰지고 있어요. 마감 전까지는 고칠 수 있어요.' : '마감됐어요. 선생님이 자리를 정하는 중이에요.';
    // 폰을 책상에 올려 두면 옆 친구가 볼 수 있으니, 기다리는 화면에는 누구를 골랐는지 이름을 띄우지 않는다
    const f = M.splitList(S.mine.f), w = M.splitList(S.mine.w);
    sum.append(h('li', {}, h('small', {text: '보낸 것'}), `친구 ${f.length}명 · 자리 ${w.length ? w.length + '곳' : '어디든 괜찮음'}`));
    sum.append(h('li', {class: 'quiet'}, '누구를 골랐는지는 나만 알아요. 친구들 화면에도, 선생님 화면에도 나오지 않아요.'));
    $('edit-btn').hidden = ph !== 'open';
  }

  function drawResult() {
    const occ = S.result.occ || {};
    const where = {};
    for (const [seat, key] of entries(occ)) where[key] = seat;
    const mine = S.key && where[S.key];
    const myF = S.mine ? M.splitList(S.mine.f) : [];
    S.resBoard.view(S.meta.hall, false);
    S.resBoard.setChips(M.rosterList(S.roster).filter(s => where[s.key]).map(s => ({
      key: s.key, seat: where[s.key], label: s.label, cls: s.key === S.key ? 'me' : ''
    })));
    S.resBoard.marks({});
    $('res-title').textContent = mine ? M.seatName(mine) : '새 자리가 나왔어요';
    let text = mine ? '빨간 테두리가 내 자리예요.' : '';
    if (mine && myF.length) {
      const near = myF.filter(k => where[k] && M.near(M.SEAT[mine], M.SEAT[where[k]]) >= 0.75).length;
      text += near ? ` 고른 친구 ${myF.length}명 가운데 ${near}명이 짝이나 앞뒤에 있어요.` : ' 고른 친구와는 조금 떨어졌지만, 모두가 골고루 원하는 것을 얻도록 정한 자리예요.';
    }
    $('res-text').textContent = text;
  }

  // ════════════════════════════════════════════════════════════
  //  처음 화면
  // ════════════════════════════════════════════════════════════
  function initEntry() {
    // 첫 화면 그림: 32자리 교실
    const g = $('entry-art-desks');
    for (const s of M.SEATS) {
      const x = 50 + s.k * 40 + Math.floor(s.k / 2) * 18, y = 16 + s.r * 11;
      svg('rect', {x, y, width: 38, height: 8, rx: 2, class: (s.k * 7 + s.r * 3) % 5 === 0 ? 'hot' : ''}, g);
    }
    const room = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
    $('join-code').value = room || '';
    $('join-form').onsubmit = e => {
      e.preventDefault();
      const code = $('join-code').value.replace(/\D/g, '');
      if (code.length !== 4) { $('join-error').textContent = '방 번호 4자리를 넣어 주세요.'; $('join-error').hidden = false; return; }
      joinRoom(code);
    };
    $('open-room').onclick = () => openRoom(false);
    $('open-demo').onclick = () => openRoom(true);
    if (LOCAL_ONLY) $('server-note').textContent = '연습 모드: 서버 없이 이 브라우저의 탭끼리만 연결돼요.';
    const host = (params.get('host') || '').replace(/\D/g, '').slice(0, 4);
    if (host) openRoom(false, host);
    else if (room) joinRoom(room);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEntry);
  else initEntry();
})();
