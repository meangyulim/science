/* 자리 배치 시뮬레이션 — 학생은 폰으로 바람(친구·자리)을 내고, 선생님 화면은 실시간으로 자리를 맞춘다.
   계산(만족도, 담금질)은 seats-model.js 에 있다.

   실시간 공유는 캠퍼스 지진(sims/quake)과 같은 Firebase Realtime Database 를 쓴다.
   규칙은 sims/quake/database.rules.json 의 "seats" 부분 — 학생은 자기 바람만 쓰고 읽을 수 있고,
   모두의 바람을 읽는 것은 방을 연 선생님 기기뿐이다. 그래서 누가 누구를 골랐는지 학생끼리는 볼 수 없다.

   서버에 두는 것 (seats/rooms/1234/…)
     meta     {teacher, phase: open|closed|published, hall: left|right, cls}   모두 읽기
     roster   {s01: {no, name}}                                              모두 읽기, 선생님만 쓰기
     claims   {s01: uid}   이 이름을 고른 폰                                   모두 읽기, 자기 것만 쓰기
     prefs    {uid: {s01: {who: s01, f: 's03,s07', w: '0-1,2-3', b, t}}}   기기(uid)마다, 그 기기로 낸 학생마다.
                                                                     자기 기기 것만, 선생님은 모두. 태블릿 하나를 돌려 써도 섞이지 않는다
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
  // ── 선생님 코드 ──────────────────────────────────────────────
  // 선생님이 정한 코드로 '선생님 공간'(seats/teachers/<코드의 해시>)을 연다. 반 명단과 자리 기록이 여기에 있어서
  // 어느 기기에서든 코드만 넣으면 불러온다. 코드 자체는 서버에 가지 않는다 (이 기기에만 저장).
  const SPACE = 'seats/teachers';
  const normCode = c => String(c || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  async function spaceId(code) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('seats-teacher-space:' + normCode(code)));
    return Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2, '0')).join('');
  }
  let TID = null;
  async function initCode() { const c = pref('teacherCode', ''); TID = c ? await spaceId(c) : null; return TID; }
  const classId = cls => String(cls || '').replace(/[.#$\[\]\/]/g, '_').trim().slice(0, 40);
  const classPath = c => `${SPACE}/${TID}/classes/${c}`;
  // 선생님 공간의 반 목록 {반 이름: {text, layout, hall, t}}
  async function spaceClasses(store) {
    if (!TID) return {};
    const all = await store.get(`${SPACE}/${TID}/classes`).catch(() => null);
    const out = {};
    for (const v of Object.values(all || {})) if (v && v.info && v.info.cls) out[v.info.cls] = v.info;
    return out;
  }
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
      // 다른 탭에 먼저 알린다 — 알림을 받은 쪽(구독)이 곧바로 또 쓰면 그 쓰기가 앞질러 가지 않게
      if (broadcast && this.ch) this.ch.postMessage({op: 'write', writes});
      this.notify(writes.map(w => w[0]));
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

  // ── 학생에게 보여 주는 설명: 자리가 어떻게 정해지는지 ──────────────────
  // 비율(친구:자리)은 선생님이 정한 값을 그대로 보여 준다.
  function explainHTML(fw, mine) {
    const d = Math.round((fw ?? 0.6) * 100), f = mine ?? d, w = 100 - f;
    return `
      <ol class="explain-list">
        <li><b>내가 내는 것</b> — 같이 앉고 싶은 친구 <b>3명까지</b>, 앉고 싶은 자리 <b>3곳까지</b>. 먼저 누른 것이 1순위예요.
          <br><small>누가 누구를 골랐는지는 친구들 폰에도, 선생님 화면에도 나오지 않아요.</small></li>
        <li><b>친구 점수</b> — 고른 친구가 <b>짝</b>이면 100점, <b>앞뒤</b> 75점, <b>대각선</b> 50점, <b>통로 건너 옆</b> 40점, 멀면 0점.
          1순위 친구가 가장 중요해요 (1순위 : 2순위 : 3순위 = 10 : 8 : 6).</li>
        <li><b>자리 점수</b> — 고른 자리에 앉으면 100점, 바로 옆·뒤면 약 66점, 더 멀어질수록 줄어요.
          1순위 자리가 가장 중요해요 (10 : 8.5 : 7).</li>
        <li><b>내 만족도</b> = 친구 점수 <b>${f}%</b> + 자리 점수 <b>${w}%</b>
          <small>(${mine != null ? '내가 고른 비율' : `선생님 기본 비율 — '나에게 더 중요한 것'에서 내가 바꿀 수 있어요`})</small>.
          친구만 골랐으면 친구 점수가, 자리만 골랐으면 자리 점수가 전부예요. 비율을 바꿔도 더 유리해지지는 않아요 — 내 만족도를 무엇으로 잴지만 정해요.</li>
        <li><b>반 전체</b> — 컴퓨터가 자리를 수만 번 바꿔 보며 <b>모두의 만족도</b>가 가장 높은 배치를 찾아요.
          이때 이미 만족한 친구를 더 챙기기보다 <b>아무것도 못 얻은 친구를 먼저</b> 챙겨요. 그래서 인기 자리는 다른 바람을 덜 이룬 친구에게 갈 수 있어요.</li>
        <li><b>돌아가며 양보</b> — 지난번에 여럿이 원하던 자리에 앉았다면, 이번에는 자리 바람이 조금 덜 반영돼요. 친구 바람은 그대로예요.</li>
      </ol>
      <p class="explain-tip">💡 친구끼리 <b>서로</b> 고르면 짝이 될 가능성이 훨씬 커요. 인기 자리 하나만 고르기보다 2·3순위 자리도 적어 두세요.</p>`;
  }

  // ════════════════════════════════════════════════════════════
  //  교실 그림 (선생님 화면, 학생의 자리 고르기, 결과에서 같이 쓴다)
  // ════════════════════════════════════════════════════════════
  // 교실 모양(M.LAYOUTS)마다 다시 그린다. 자리 위치는 seats-model.js 의 x(통로까지 친 실제 가로 위치)를 그대로 쓴다.
  class Board {
    constructor(host, o) {
      this.o = o = o || {};
      host.textContent = '';
      this.root = h('div', {class: 'room' + (o.onDrop ? ' can-drag' : '')});
      this.wall = h('div', {class: 'wall'}, h('span', {class: 'chalk', text: '칠판'}), h('span', {class: 'lectern', text: '교탁'}));
      this.sideL = h('div', {class: 'side'});
      this.sideR = h('div', {class: 'side'});
      this.floor = h('div', {class: 'floor'});
      this.root.append(this.wall, h('div', {class: 'room-mid'}, this.sideL, this.floor, this.sideR));
      host.append(this.root);
      if (o.onFloor) this.floor.addEventListener('click', () => o.onFloor());
      this.chips = new Map();
      this.at = new Map();
      this.layout(o.layout || M.LAYOUTS.room);
    }
    // 교실 모양을 바꾸면 책상과 이름표를 모두 새로 놓는다
    layout(L) {
      if (this.L === L) return;
      this.L = L;
      this.floor.textContent = '';
      this.chips.clear();
      this.at.clear();
      this.floor.style.aspectRatio = `${L.WIDTH * 1.3} / ${L.ROWS_MAX}`;
      this.floor.style.setProperty('--w', L.WIDTH);
      this.floor.style.setProperty('--rows', L.ROWS_MAX);
      // 방 전체의 가로세로 비 (선생님 화면에서 방이 화면 높이에 맞게 커지도록)
      this.aspect = 1 / (0.86 / (L.WIDTH * 1.3 / L.ROWS_MAX) + 0.09);
      // 분단 사이 통로 (보통 교실 1분단 맨 뒷줄 셋째 자리는 통로 쪽으로 튀어나와 있다)
      this.aisles = L.GROUP_X.slice(1).map(gx => {
        const a = h('div', {class: 'aisle', style: `width:${L.AISLE / L.WIDTH * 100}%`});
        a.dataset.x = gx - L.AISLE / 2;
        this.floor.append(a);
        return a;
      });
      this.seats = {};
      for (const s of L.SEATS) {
        const b = h(this.o.onSeat ? 'button' : 'div', {class: 'seat', type: this.o.onSeat ? 'button' : null, 'aria-label': L.seatName(s.id), title: L.seatName(s.id)}, h('span', {class: 'seat-mark'}));
        if (this.o.onSeat) b.addEventListener('click', e => { e.stopPropagation(); this.o.onSeat(s.id); });
        this.floor.append(b);
        this.seats[s.id] = b;
      }
      const hall = this.hall || 'right', flip = this.flip;
      this.hall = null;
      this.view(hall, flip);
    }
    xy(id) {
      const L = this.L, s = L.SEAT[id];
      let x = this.hall === 'left' ? s.x : L.WIDTH - s.x, r = s.r;
      if (this.flip) { x = L.WIDTH - x; r = L.ROWS_MAX - 1 - r; }
      return {x: x / L.WIDTH * 100, y: (r + 0.5) / L.ROWS_MAX * 100};
    }
    view(hall, flip) {
      hall = hall === 'left' ? 'left' : 'right';
      if (this.hall === hall && this.flip === !!flip) return;
      this.hall = hall; this.flip = !!flip;
      this.root.classList.toggle('flipped', this.flip);
      const hallLeft = (hall === 'left') !== this.flip;
      const side = (el, isHall) => { el.className = 'side ' + (isHall ? 'hall' : 'window'); el.innerHTML = isHall ? '<span>복도</span>' : '<span>창문</span>'; };
      side(this.sideL, hallLeft);
      side(this.sideR, !hallLeft);
      const W = this.L.WIDTH;
      for (const a of this.aisles) { const x = +a.dataset.x; a.style.left = (hallLeft ? x : W - x) / W * 100 + '%'; }
      for (const id in this.seats) this.put(this.seats[id], id);
      for (const [key, c] of this.chips) this.put(c, this.at.get(key));
    }
    put(el, id) {
      if (!id || !this.L.SEAT[id]) return;
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
          if (this.o.onChip) c.addEventListener('click', e => { e.stopPropagation(); if (!this.dragged) this.o.onChip(it.key); });
          if (this.o.onDrop) c.addEventListener('pointerdown', e => this.drag(e, it.key, c));
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
    // 끌어다 놓기: 이름표를 6px 넘게 끌면 손가락(마우스)을 따라오고, 놓은 자리로 onDrop(열쇠, 자리)
    drag(e, key, el) {
      if (e.button > 0 || (this.o.canDrag && !this.o.canDrag(key))) return;
      const sx = e.clientX, sy = e.clientY;
      let moving = false, over = null;
      const mark = id => { if (over === id) return; if (over && this.seats[over]) this.seats[over].classList.remove('drop'); over = id; if (over && this.seats[over]) this.seats[over].classList.add('drop'); };
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moving && Math.hypot(dx, dy) < 6) return;
        if (!moving) { moving = true; el.classList.add('dragging'); this.root.classList.add('dragging'); }
        ev.preventDefault();
        el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        mark(this.seatAt(ev.clientX, ev.clientY));
      };
      const end = ev => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        el.style.transform = '';
        el.classList.remove('dragging');
        this.root.classList.remove('dragging');
        const target = over;
        mark(null);
        if (!moving) return;
        this.dragged = true;                      // 바로 뒤에 오는 click 은 무시
        setTimeout(() => { this.dragged = false; }, 0);
        if (ev.type === 'pointerup' && target) this.o.onDrop(key, target);
      };
      window.addEventListener('pointermove', move, {passive: false});
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    }
    seatAt(x, y) {
      for (const id in this.seats) {
        const r = this.seats[id].getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
      }
      return null;
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
    meta: null, roster: {}, claims: {}, prefs: {}, result: null, joins: {},
    list: [], prob: null, rep: null,
    occ: {}, locks: {}, apart: [], fw: 0.6, live: true, flip: false,
    bid: null, hist: [],
    sel: null, moving: false, run: null, pendingQuick: false, liveTimer: 0, sig: '', board: null, loaded: false
  };

  function tPref(key) {
    const uid = T.claims[key], p = uid && T.prefs[uid] && T.prefs[uid][key];
    return p && p.who === key ? {friends: M.splitList(p.f), wishes: M.splitList(p.w), fw: Number.isFinite(p.b) ? p.b / 100 : undefined} : null;
  }
  const TL = () => M.layoutOf(T.meta && T.meta.layout, T.meta && T.meta.layoutDef);   // 이 방의 교실 모양 (직접 만든 모양이면 meta.layoutDef)
  const tStatus = key => !T.claims[key] ? 'none' : tPref(key) ? 'sent' : 'joined';
  const label = key => { const s = T.list.find(x => x.key === key); return s ? s.label : '?'; };

  function buildProb() {
    T.list = M.rosterList(T.roster);
    for (const k of Object.keys(T.locks)) if (!T.roster[k] || !TL().SEAT[T.locks[k]]) delete T.locks[k];
    T.apart = T.apart.filter(([a, b]) => T.roster[a] && T.roster[b]);
    const st = T.list.map(s => { const p = tPref(s.key); return {key: s.key, friends: p ? p.friends : [], wishes: p ? p.wishes : [], fw: p ? p.fw : undefined}; });
    T.prob = M.prepare(st, {layout: TL(), fw: T.fw, locks: T.locks, apart: T.apart, history: histMaps()});
    return T.prob;
  }
  // 이 반의 지난 배치(다른 방에서 공개한 것, 같은 교실 모양)를 지금 명단의 열쇠로 — 돌아가며 양보에 쓴다
  function histMaps() {
    const byName = new Map(T.list.map(s => [s.name + '|' + (s.no ?? ''), s.key]));
    const byOnly = new Map();
    for (const s of T.list) byOnly.set(s.name, byOnly.has(s.name) ? null : s.key);
    return T.hist.filter(e => e.layout === TL().id).slice(0, 2).map(e => {
      const m = {};
      for (const [seat, p] of entries(e.seats)) {
        const key = byName.get(p.n + '|' + (p.no ?? '')) || byOnly.get(p.n);
        if (key) m[key] = seat;
      }
      return m;
    });
  }
  async function loadHistory() {
    if (!T.bid || !TID || T.demo) { T.hist = []; drawRecordLink(); return; }
    try {
      const h = await T.store.get(`${classPath(T.bid)}/hist`);
      T.hist = Object.values(h || {}).filter(e => e && e.room !== T.code && e.seats).sort((a, b) => b.t - a.t);
    } catch (e) { T.hist = []; }
    drawRecordLink();
    tRender();
  }
  const recordsURL = c => location.pathname + '?records' + (c ? '&c=' + encodeURIComponent(c) : '') + (LOCAL_ONLY ? '&local' : '');
  function drawRecordLink() {
    const box = $('t-board-link');
    if (!box) return;
    box.hidden = T.demo;
    $('t-record-open').href = recordsURL(T.bid);
    $('t-record-open').hidden = !TID;
    $('t-board-count').textContent = !TID ? '처음 화면에서 선생님 코드를 정하면 공개할 때마다 자리 기록이 저장되고, 어느 기기에서든 볼 수 있어요.'
      : !T.bid ? '명단을 반 이름과 함께 저장하면 이 반 기록이 생겨요.'
      : T.hist.length ? `지난 기록 ${T.hist.length}개 — 돌아가며 양보에 쓰여요` : '아직 지난 기록이 없어요. 학생 폰에 공개하면 저장돼요.';
  }

  // 바람·조건이 바뀌었는지 알아보는 글자열 (바뀌었을 때만 실시간으로 다시 맞춘다)
  function signature() {
    const out = [];
    for (const s of M.rosterList(T.roster)) { const uid = T.claims[s.key], p = uid && T.prefs[uid] && T.prefs[uid][s.key]; if (p && p.who === s.key) out.push(s.key + ':' + (p.f || '') + '|' + (p.w || '') + '|' + (p.b ?? '')); }
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
    b.layout(TL());
    $('t-stage').style.setProperty('--ar', b.aspect);
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
    if (T.moving) for (const s of TL().SEATS) marks[s.id] = {cls: 'target'};
    b.marks(marks);
    b.root.classList.toggle('moving', T.moving);
    $('t-hint').textContent = !show ? '받는 동안에는 이름을 가려요 — 자리가 움직이는 것을 보고 누가 누구를 골랐는지 짐작할 수 없게요. 마감하면 처음부터 다시 섞은 뒤 이름이 보여요.'
      : T.moving ? `${label(T.sel)} — 옮길 자리를 누르세요 (빈자리나 다른 학생). 그만두려면 빈 바닥을 누르세요.`
      : '이름표를 끌어다 다른 자리에 놓으면 자리가 바뀌어요 (옮긴 학생은 📌 고정). 이름을 누르면 고정·접속 풀기.';
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
    // 자리가 모자라 아직 못 들어온 학생 ('명단에 내 이름이 없어요'로 보냈지만 자리가 다 찼다)
    for (const [uid, j] of entries(T.joins)) {
      if (!(T.meta && T.meta.joinFull && T.meta.joinFull[uid]) || !j) continue;
      box.append(h('button', {type: 'button', class: 'pill st-full', title: '자리가 모자라 아직 못 들어왔어요', onclick: () => toast('t-toast', `${j.name} 학생은 자리가 모자라 아직 못 들어왔어요. 명단 단추로 안 오는 학생을 빼거나, 교실 모양에 자리를 더하면 바로 들어와요.`, 7000)},
        j.name, h('small', {text: '자리 부족'})));
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
    box.append(h('p', {class: 'sel-seat', text: TL().seatName(r.seat) + (T.locks[key] ? ' · 📌 고정' : '')}));
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
      const bad = T.rep && T.rep.byKey[a] && T.rep.byKey[b] && TL().near(TL().SEAT[T.rep.byKey[a].seat], TL().SEAT[T.rep.byKey[b].seat]) >= 0.5;
      ap.append(h('li', {class: bad ? 'bad' : ''}, `${label(a)} ↔ ${label(b)}`, h('button', {type: 'button', 'aria-label': '빼기', text: '×', onclick: () => { T.apart.splice(i, 1); afterConstraint(); }})));
    });
    if (!T.apart.length) ap.append(h('li', {class: 'muted', text: '없음'}));
    const lk = $('lock-list');
    lk.textContent = '';
    for (const [k, seat] of entries(T.locks)) lk.append(h('li', {}, `${label(k)} · ${TL().seatName(seat)}`, h('button', {type: 'button', 'aria-label': '고정 풀기', text: '×', onclick: () => { delete T.locks[k]; afterConstraint(); }})));
    if (!Object.keys(T.locks).length) lk.append(h('li', {class: 'muted', text: '없음'}));
    for (const b of document.querySelectorAll('#screen-teacher [data-hall]')) b.setAttribute('aria-pressed', String((T.meta && T.meta.hall || 'right') === b.dataset.hall));
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
  // 이름표를 끌어다 다른 자리에 놓으면 (마감한 뒤)
  function tDrop(key, target) {
    if (!named() || T.run) return;
    T.sel = key;
    moveTo(target);
  }
  function moveTo(target) {
    const key = T.sel, from = T.rep.byKey[key].seat;
    if (target === from) { T.moving = false; tRender(); return; }
    const other = T.occ[target];
    T.occ[target] = key;
    if (other) T.occ[from] = other; else delete T.occ[from];
    if (other && T.locks[other]) T.locks[other] = from;   // 고정된 학생과 바꾸면 그 학생은 바뀐 자리에 고정
    T.locks[key] = target;   // 손으로 옮긴 학생은 실시간 맞추기에 다시 밀려나지 않게 고정
    T.moving = false;
    tRender();
    saveConf();
    toast('t-toast', `${label(key)}을(를) 옮기고 📌 고정했어요.`);
  }

  async function releaseClaim(key) {
    const uid = T.claims[key];
    if (!uid || !confirm(`${label(key)}의 접속을 풀까요?\n다른 폰으로 다시 들어와 이름을 고를 수 있게 됩니다. 이미 낸 바람도 지워져요.`)) return;
    await guard(T.store.update(T.base, {['claims/' + key]: null, [`prefs/${uid}/${key}`]: null}), '접속 풀기');
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
        fw: T.fw, live: T.live, flip: T.flip, bid: T.bid
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
  async function openRoom(demo, existing, fromClass) {
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
    await initCode();
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
        await T.store.set(`${ROOT}/${code}/meta`, {teacher: T.store.uid, created: T.store.now(), phase: 'open', hall: pref('hall', 'right'), layout: 'room', cls: '', fw: T.fw, demo: demo || null});
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
      T.bid = conf.bid || null;
    }
    // ?class=… (자리 기록 화면의 '이 반으로 새 방 열기'): 그 반의 명단·교실 모양을 이어받는다
    let classInfo = null;
    if (fromClass && !demo && TID) {
      classInfo = await T.store.get(`${classPath(fromClass)}/info`).catch(() => null);
      if (classInfo) T.bid = fromClass;
    }
    history.replaceState(null, '', demo ? location.pathname + (LOCAL_ONLY ? '?local' : '') : '?host=' + code + (LOCAL_ONLY ? '&local' : ''));
    showScreen('teacher');
    $('t-code').querySelector('b').textContent = code;
    $('t-code').classList.toggle('demo', demo);
    if (demo) $('t-code').querySelector('b').textContent = '미리 해 보기';
    T.board = new Board($('t-board'), {onSeat: tSeat, onChip: tChip, onFloor: tFloor, onDrop: tDrop, canDrag: () => named() && !T.run});
    bindTeacher();
    const on = (p, f) => T.store.on(T.base + p, v => { f(v); tChanged(); });
    on('/meta', v => { T.meta = v || T.meta; });
    on('/roster', v => { T.roster = v || {}; });
    on('/claims', v => { T.claims = v || {}; });
    on('/prefs', v => { T.prefs = v || {}; });
    on('/result', v => { T.result = v; });
    on('/joins', v => { T.joins = v || {}; });
    T.store.onStatus(ok => { $('t-conn').className = 'conn ' + (ok ? 'on' : 'off'); });
    T.loaded = true;
    T.sig = signature();
    tRender();
    loadHistory();
    const roster = await T.store.get(T.base + '/roster');
    if (!roster) openRosterDialog(true, classInfo);
  }

  function tChanged() {
    if (!T.loaded) return;
    processJoins();
    tRender();
    const s = signature();
    if (s !== T.sig) {
      T.sig = s;
      if (T.live) scheduleQuick();
    }
  }

  // 명단에 없던 학생: 폰에서 이름을 보내면(joins/uid) 선생님 기기가 명단에 더하고 그 폰에 이름을 맡긴다.
  // 명단에 같은 이름이 있고 아직 아무도 안 골랐으면 그 이름을 맡긴다.
  // 지금 방의 명단을 이 반의 저장해 둔 명단과 자리 기록(다른 기기용)에 반영한다
  // — '명단에 없어요'로 들어온 학생을 다음 시간에 다시 넣지 않아도 되게
  function rememberRoster() {
    const cls = T.meta && T.meta.cls;
    if (T.demo || !cls) return;
    const text = rosterText(T.roster), lay = TL().id, hall = T.meta.hall || 'right';
    const saved = savedRosters();
    const layoutDef = T.meta.layoutDef || null;
    saved[cls] = Object.assign({}, saved[cls], {text, layout: lay, hall, layoutDef});
    setPref('rosters', saved);
    if (TID) T.store.set(`${classPath(classId(cls))}/info`, {cls, layout: lay, hall, text, layoutDef, t: T.store.now()}).catch(e => console.warn('[seats] class info', e));
  }
  let joining = false;
  async function processJoins() {
    if (joining || !T.store) return;
    const items = entries(T.joins);
    if (!items.length) return;
    joining = true;
    try {
      for (const [uid, j] of items) {
        const upd = {['joins/' + uid]: null};
        const p = M.parseRoster(String(j && j.name || '') + '')[0];
        const no = j && Number.isFinite(j.no) ? j.no : p && p.no;
        if (!p) { await T.store.update(T.base, upd); continue; }   // 한 기기로 여러 명이 낼 수 있어서, 이미 이름을 맡은 기기도 받는다
        const same = M.rosterList(T.roster).find(s => s.name === p.name && !T.claims[s.key] && (no == null || s.no == null || s.no === no));
        let key = same && same.key;
        if (!key) {
          if (Object.keys(T.roster).length >= TL().NSEAT) {
            // 자리가 모자라면 요청은 남겨 두고(자리가 생기면 바로 들어온다) 알림은 한 번만.
            // 학생 폰에도 알린다 — meta/joinFull/<uid> (uid 만 있어서 누군지는 드러나지 않는다)
            if (!T.meta.joinFull || !T.meta.joinFull[uid]) {
              toast('t-toast', `자리가 다 차서 ${p.name} 학생을 더하지 못했어요. 명단에서 안 오는 학생을 빼거나 교실 모양에 자리를 더하면 바로 들어와요.`, 8000);
              await T.store.update(T.base, {['meta/joinFull/' + uid]: true});
            }
            continue;
          }
          // 명단에서 빠진 학생의 열쇠를 다시 쓰지 않도록, 늘 새 열쇠
          key = 'j' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
          upd['roster/' + key] = no != null ? {no, name: p.name} : {name: p.name};
        }
        upd['claims/' + key] = uid;
        if (T.meta.joinFull && T.meta.joinFull[uid]) upd['meta/joinFull/' + uid] = null;
        await T.store.update(T.base, upd);
        T.roster[key] = T.roster[key] || upd['roster/' + key];
        T.claims[key] = uid;
        toast('t-toast', `명단에 없던 ${p.name} 학생이 들어왔어요. 이 반 명단에도 저장했어요.`);
        rememberRoster();
      }
    } catch (e) {
      console.warn('[seats] joins', e);
    } finally {
      joining = false;
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
    fw.onchange = () => { saveConf(); scheduleQuick(0); T.store.update(T.base, {'meta/fw': T.fw}).catch(() => {}); };
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
      const now = T.store.now();
      await guard(T.store.update(T.base, {result: {occ: T.occ, t: now}, 'meta/phase': 'published'}), '공개');
      const saved = await saveHistory(now);
      toast('t-toast', saved ? '학생 폰에 공개하고, 이 반 자리 기록에도 저장했어요.' : '학생 폰에 공개했어요.');
    };
    $('t-code').onclick = () => { if (!T.demo) showQR(); else toast('t-toast', '미리 해 보기는 이 브라우저 안에서만 돌아가요. 학생 폰으로 해 보려면 처음 화면에서 방을 여세요.', 5000); };
    $('t-qr-again').onclick = $('t-code').onclick;
    $('t-explain').onclick = () => { $('explain-body').innerHTML = explainHTML(T.fw); $('explain-dialog').showModal(); };

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

  // 공개한 배치를 이 반 기록에 남긴다. 같은 방에서 같은 날 다시 공개하면 덮어쓴다.
  async function saveHistory(t) {
    if (!T.bid || !TID || T.demo) return false;
    const d = new Date(t), day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const seats = {};
    for (const [seat, key] of entries(T.occ)) { const r = T.roster[key]; if (r) seats[seat] = r.no != null ? {n: r.name, no: r.no} : {n: r.name}; }
    try {
      await T.store.set(`${classPath(T.bid)}/hist/${day}-${T.code}`, {t, room: T.code, cls: T.meta.cls || '', layout: TL().id, layoutDef: T.meta.layoutDef || null, hall: T.meta.hall || 'right', seats});
      return true;
    } catch (e) { console.warn('[seats] history', e); return false; }
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
  // 저장해 둔 명단: {반 이름: {text, layout, hall}} (예전에는 글자만 저장했다)
  const savedRosters = () => {
    const raw = pref('rosters', {}), out = {};
    for (const [k, v] of entries(raw)) out[k] = typeof v === 'string' ? {text: v} : v;
    return out;
  };
  // 엑셀 파일 읽기 (SheetJS). 시트마다 명단을 뽑고, 시트에 '강의실'이 적혀 있으면 종합강의실 모양으로 고른다.
  const XLSX_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  let xlsxReady = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxReady) xlsxReady = new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = XLSX_LIB; sc.onload = ok; sc.onerror = () => { xlsxReady = null; no(new Error('엑셀 읽기 도구를 불러오지 못했어요')); }; document.head.appendChild(sc); });
    return xlsxReady;
  }
  async function readWorkbook(file) {
    await loadXLSX();
    const wb = window.XLSX.read(await file.arrayBuffer(), {type: 'array'});
    const out = [];
    for (const name of wb.SheetNames) {
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, defval: ''});
      const list = M.rosterFromRows(rows);
      if (list.length < 3) continue;   // 요약 시트 같은 것은 건너뛴다
      const flat = rows.slice(0, 4).flat().join(' ');
      out.push({name: name.trim().slice(0, 20), list, layout: /강의실|종강/.test(flat) ? 'hall' : 'room'});
    }
    return out;
  }
  const listText = list => list.map(p => (p.no != null ? p.no + ' ' : '') + p.name).join('\n');

  // ── 직접 만든 교실 모양 ───────────────────────────────────────
  // 이 기기(localStorage)와 선생님 공간(seats/teachers/<코드>/layouts)에 {id: {name, groups, spread}}
  const customLayouts = () => pref('layouts', {});
  const layoutFor = id => M.layoutOf(id, customLayouts()[id]);
  function putCustomLayout(id, def) {
    const all = customLayouts();
    if (def) all[id] = def; else delete all[id];
    setPref('layouts', all);
    if (TID && T.store && !T.demo) T.store.set(`${SPACE}/${TID}/layouts/${id}`, def || null).catch(e => console.warn('[seats] layout', e));
  }
  async function loadSpaceLayouts() {
    if (!TID || !T.store) return false;
    const sp = await T.store.get(`${SPACE}/${TID}/layouts`).catch(() => null);
    if (!sp) return false;
    const all = customLayouts();
    let changed = false;
    for (const [id, def] of entries(sp)) if (M.validDef(def) && JSON.stringify(all[id]) !== JSON.stringify(def)) { all[id] = def; changed = true; }
    if (changed) setPref('layouts', all);
    return changed;
  }
  const describeDef = def => def.groups.map(g => {
    if (!Array.isArray(g)) return `${g.cols}줄×${g.rows}` + (g.back ? `+뒤 ${g.back}칸` : '');
    const rows = Math.max(...g.map(c => Array.isArray(c) ? Math.max(-1, ...c) + 1 : c));
    return `${g.length}줄×${rows}`;
  }).join(' · ') + (def.spread ? ' · 띄엄띄엄' : '');
  // 편집기의 분단 {cols, rows, back} → 책상 칸 목록. 맨 뒷줄 칸 수가 다르면 가운데 맞춤(반 칸 엇갈림)
  function groupSeats(g) {
    const W = Math.max(g.cols, g.back || 0), o = (W - g.cols) / 2, seats = [];
    for (let c = 0; c < g.cols; c++) for (let r = 0; r < g.rows; r++) seats.push([o + c, r]);
    if (g.back) { const ob = (W - g.back) / 2; for (let i = 0; i < g.back; i++) seats.push([ob + i, g.rows]); }
    return {W, seats};
  }

  // 교실 모양 만들기: 분단마다 줄 수·줄마다 자리 수, 그림에서 책상을 눌러 빼고 넣기
  function openLayoutEditor(id, hall, done) {
    const d = $('layout-dialog');
    const old = id ? customLayouts()[id] : null;
    let groups, off = new Set();
    if (old) {
      groups = old.groups.map(g => Array.isArray(g)
        ? {cols: g.length, rows: Math.max(...g.map(c => Array.isArray(c) ? Math.max(-1, ...c) + 1 : c)), back: 0}
        : {cols: g.cols || g.w, rows: g.rows || Math.max(...g.seats.map(p => p[1])) + 1, back: g.back || 0});
      old.groups.forEach((g, gi) => {
        if (Array.isArray(g)) g.forEach((c, ci) => { const has = Array.isArray(c) ? new Set(c) : null; for (let r = 0; r < groups[gi].rows; r++) if (has ? !has.has(r) : r >= c) off.add(`${gi}:${ci}:${r}`); });
        else { const has = new Set(g.seats.map(p => p[0] + ':' + p[1])); for (const [c, r] of groupSeats(groups[gi]).seats) if (!has.has(c + ':' + r)) off.add(`${gi}:${c}:${r}`); }
      });
    } else groups = [{cols: 2, rows: 5, back: 0}, {cols: 2, rows: 5, back: 0}, {cols: 2, rows: 5, back: 0}];
    $('lay-name').value = old ? old.name : '';
    $('lay-spread').checked = !!(old && old.spread);
    $('lay-delete').hidden = !old;
    const board = new Board($('lay-board'), {onSeat: sid => {
      const st = board.L.SEAT[sid], key = `${st.g}:${st.c}:${st.r}`;
      if (off.has(key)) off.delete(key); else off.add(key);
      draw();
    }});
    const finalDef = () => ({
      name: $('lay-name').value.trim().slice(0, 20) || '직접 만든 교실',
      spread: $('lay-spread').checked,
      groups: groups.map((g, gi) => {
        if (g.back) {   // 맨 뒷줄이 따로 있으면 칸 목록으로
          const {W, seats} = groupSeats(g);
          return {w: W, cols: g.cols, rows: g.rows, back: g.back, seats: seats.filter(([c, r]) => !off.has(`${gi}:${c}:${r}`))};
        }
        return Array.from({length: g.cols}, (_, c) => {
          const rows = [];
          for (let r = 0; r < g.rows; r++) if (!off.has(`${gi}:${c}:${r}`)) rows.push(r);
          return rows.length === g.rows ? g.rows : rows;
        });
      })
    });
    const sel = (val, max, on, min = 1, zero) => {
      const s = h('select', {onchange: () => on(+s.value)});
      for (let i = min; i <= max; i++) s.append(h('option', {value: i, text: i === 0 && zero ? zero : i}));
      s.value = val;
      return s;
    };
    const draw = () => {
      const box = $('lay-groups');
      box.textContent = '';
      groups.forEach((g, gi) => box.append(h('div', {class: 'lay-group'},
        h('b', {text: `${gi + 1}분단`}), ' 줄 ', sel(g.cols, 4, v => { g.cols = v; draw(); }), ' · 줄마다 ', sel(g.rows, 10, v => { g.rows = v; draw(); }), '자리',
        h('span', {class: 'lay-back'}, ' · 맨 뒤에 한 줄 더 ', sel(g.back || 0, 4, v => { g.back = v; draw(); }, 0, '없음'), g.back ? '칸' : ''),
        groups.length > 1 ? h('button', {type: 'button', class: 'x', 'aria-label': `${gi + 1}분단 빼기`, text: '×', onclick: () => { groups.splice(gi, 1); off = new Set([...off].filter(k => +k.split(':')[0] !== gi).map(k => { const [a, b, c] = k.split(':').map(Number); return `${a > gi ? a - 1 : a}:${b}:${c}`; })); draw(); }}) : null)));
      $('lay-add-group').disabled = groups.length >= 6;
      const full = M.makeLayout({id: 'edit', groups: groups.map(g => g.back ? (({W, seats}) => ({w: W, seats}))(groupSeats(g)) : Array(g.cols).fill(g.rows))});
      board.layout(full);
      board.view(hall, false);
      const marks = {};
      for (const st of full.SEATS) if (off.has(`${st.g}:${st.c}:${st.r}`)) marks[st.id] = {cls: 'off', text: '✕'};
      board.marks(marks);
      $('lay-stage').style.setProperty('--ar', board.aspect);
      const n = full.NSEAT - Object.keys(marks).length;
      $('lay-count').textContent = `책상 ${n}개` + (n > 60 ? ' — 60개까지 만들 수 있어요' : '');
      $('lay-ok').disabled = n < 1 || n > 60;
    };
    $('lay-add-group').onclick = () => { groups.push({cols: 2, rows: groups[groups.length - 1].rows, back: 0}); draw(); };
    $('lay-form').onsubmit = e => e.preventDefault();
    $('lay-cancel').onclick = e => { e.preventDefault(); d.close(); };
    $('lay-delete').onclick = e => {
      e.preventDefault();
      if (!confirm(`'${old.name}' 교실 모양을 지울까요? 이 모양을 쓰던 반은 보통 교실로 바뀌어요.`)) return;
      putCustomLayout(id, null); d.close(); done(null);
    };
    $('lay-ok').onclick = e => {
      e.preventDefault();
      const def = finalDef();
      if (!M.validDef(def)) return alert('책상이 1개 이상, 60개 이하여야 해요.');
      const nid = id || 'c' + Math.random().toString(36).slice(2, 8);
      putCustomLayout(nid, def);
      d.close();
      done(nid);
    };
    draw();
    d.showModal();
  }

  function openRosterDialog(first, info) {
    const d = $('roster-dialog');
    const saved = savedRosters();
    let hall = T.meta && T.meta.hall || pref('hall', 'right');
    let lay = T.meta && T.meta.layout || 'room';
    $('r-cls').value = T.meta && T.meta.cls || '';
    $('r-text').value = rosterText(T.roster) || (T.demo ? DEMO_NAMES.map((n, i) => `${i + 1} ${n}`).join('\n') : '');
    if (info && !Object.keys(T.roster).length) {
      $('r-cls').value = info.cls || '';
      $('r-text').value = info.text || '';
      if (info.layout) lay = info.layout;
      if (info.layoutDef && M.validDef(info.layoutDef)) putCustomLayout(info.layout, info.layoutDef);
      if (info.hall) hall = info.hall;
    }
    if (T.demo && !$('r-cls').value) $('r-cls').value = '미리 해 보기반';
    const dl = $('r-saved');
    dl.textContent = '';
    for (const k of Object.keys(saved)) dl.append(h('option', {value: k}));
    // 저장해 둔 반: 한 번 누르면 명단·교실 모양·복도 위치가 채워진다.
    // 이 기기에 저장한 반 + 선생님 공간(코드)에 있는 반 (더 최근 것)
    const sb = $('r-saved-btns');
    const drawSaved = () => {
      sb.textContent = '';
      sb.hidden = !Object.keys(saved).length;
      if (Object.keys(saved).length) sb.append(h('span', {class: 'hint', text: '저장해 둔 반'}));
      for (const k of Object.keys(saved).sort()) {
        const n = M.parseRoster(saved[k].text).length;
        sb.append(h('button', {type: 'button', 'data-name': k, onclick: () => {
          $('r-cls').value = k; useSaved(k);
          for (const x of sb.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.name === k));
        }}, h('b', {text: k}), h('small', {text: `${n}명`})));
      }
      dl.textContent = '';
      for (const k of Object.keys(saved)) dl.append(h('option', {value: k}));
    };
    drawSaved();
    if (!T.demo) spaceClasses(T.store).then(sp => {
      let changed = false;
      for (const [k, v] of entries(sp)) if (!saved[k] || (v.t || 0) > (saved[k].t || 0)) { saved[k] = {text: v.text || '', layout: v.layout, hall: v.hall, layoutDef: v.layoutDef || null, t: v.t}; changed = true; }
      if (changed) { setPref('rosters', saved); drawSaved(); if (first && !$('r-text').value.trim()) count(); }
    });
    const count = () => {
      const n = M.parseRoster($('r-text').value).length, N = layoutFor(lay).NSEAT;
      const over = n > N;
      $('r-count').textContent = n ? `${n}명 · 자리 ${N}개${over ? ` — ${n - N}명이 넘어요` : n < N ? ` (빈자리 ${N - n}개는 뒤쪽에 남겨요)` : ''}` : (Object.keys(saved).length ? '반 이름 칸을 누르면 저장해 둔 명단을 고를 수 있어요.' : '');
      $('r-count').classList.toggle('error', over);
      $('r-ok').disabled = !n || over;
    };
    const segs = () => {
      for (const b of d.querySelectorAll('[data-hall]')) b.setAttribute('aria-pressed', String(b.dataset.hall === hall));
      for (const b of d.querySelectorAll('[data-layout]')) b.setAttribute('aria-checked', String(b.dataset.layout === lay));
      count();
    };
    // 교실 모양: 기본 두 가지 + 직접 만든 모양 + 새로 만들기
    const box = $('r-layouts');
    const drawLayouts = () => {
      box.textContent = '';
      const customs = customLayouts();
      for (const L of [...Object.values(M.LAYOUTS), ...Object.keys(customs).map(id => layoutFor(id))]) {
        const custom = !M.LAYOUTS[L.id];
        const b = h('button', {type: 'button', role: 'radio', 'data-layout': L.id, onclick: () => { lay = L.id; segs(); }},
          h('b', {text: `${L.name} · ${L.NSEAT}자리`}), h('small', {text: custom ? describeDef(customs[L.id]) : L.desc}));
        if (custom) b.append(h('span', {class: 'lay-edit', role: 'button', tabindex: 0, title: '고치기', text: '✏️', onclick: e => { e.stopPropagation(); openLayoutEditor(L.id, hall, id => { if (id) lay = id; else if (lay === L.id) lay = 'room'; drawLayouts(); segs(); }); }}));
        box.append(b);
      }
      box.append(h('button', {type: 'button', class: 'lay-new', onclick: () => openLayoutEditor(null, hall, id => { if (id) lay = id; drawLayouts(); segs(); })},
        h('b', {text: '＋ 새 교실 모양 만들기'}), h('small', {text: '분단·줄·자리 수를 정하고, 없는 책상은 빼요'})));
    };
    drawLayouts();
    if (!T.demo) loadSpaceLayouts().then(changed => { if (changed) { drawLayouts(); segs(); } });
    for (const b of d.querySelectorAll('[data-hall]')) b.onclick = () => { hall = b.dataset.hall; segs(); };
    const useSaved = name => {
      const v = saved[name]; if (!v) return;
      $('r-text').value = v.text;
      if (v.layoutDef && M.validDef(v.layoutDef) && !customLayouts()[v.layout]) { putCustomLayout(v.layout, v.layoutDef); drawLayouts(); }
      if (v.layout) lay = v.layout; if (v.hall) hall = v.hall; segs();
    };
    $('r-cls').oninput = () => { if (saved[$('r-cls').value] && !$('r-text').value.trim()) useSaved($('r-cls').value); };
    $('r-cls').onchange = () => { const v = saved[$('r-cls').value]; if (v && $('r-text').value.trim() !== v.text.trim() && (!$('r-text').value.trim() || confirm(`저장해 둔 '${$('r-cls').value}' 명단으로 바꿀까요?`))) useSaved($('r-cls').value); };
    $('r-text').oninput = count;
    // 엑셀: 시트(분반)마다 단추를 보여 주고, 누르면 그 분반 명단·교실 모양을 채운다
    const sheetBox = $('r-sheets');
    sheetBox.hidden = true;
    $('r-file').value = '';
    $('r-file').onchange = async () => {
      const f = $('r-file').files[0];
      if (!f) return;
      sheetBox.hidden = false;
      sheetBox.textContent = '읽는 중…';
      try {
        const sheets = await readWorkbook(f);
        sheetBox.textContent = '';
        if (!sheets.length) { sheetBox.textContent = '이름이 있는 시트를 찾지 못했어요. 표를 복사해 아래 칸에 붙여 넣어 보세요.'; return; }
        const pick = sh => {
          $('r-cls').value = sh.name; $('r-text').value = listText(sh.list); lay = sh.layout; segs();
          for (const b of sheetBox.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.name === sh.name));
        };
        for (const sh of sheets) sheetBox.append(h('button', {type: 'button', 'data-name': sh.name, onclick: () => pick(sh)}, h('b', {text: sh.name}), h('small', {text: `${sh.list.length}명`})));
        if (sheets.length === 1) pick(sheets[0]);
        // 여러 반이면 한꺼번에 등록 — 다음부터는 '저장해 둔 반' 단추로 바로 고른다
        if (sheets.length > 1 && !T.demo) sheetBox.append(h('button', {type: 'button', class: 'reg-all', onclick: async () => {
          const now = T.store.now();
          for (const sh of sheets) {
            const text = listText(sh.list);
            saved[sh.name] = {text, layout: sh.layout, hall: (saved[sh.name] && saved[sh.name].hall) || hall, t: now};
            if (TID) await T.store.set(`${classPath(classId(sh.name))}/info`, {cls: sh.name, layout: sh.layout, hall: saved[sh.name].hall, text, t: now}).catch(e => console.warn('[seats] class info', e));
          }
          setPref('rosters', saved);
          drawSaved();
          toast('t-toast', TID ? `${sheets.length}개 반을 등록했어요. 선생님 코드가 있는 기기라면 어디서든 '저장해 둔 반'에 나와요.`
            : `${sheets.length}개 반을 이 기기에 등록했어요. 처음 화면에서 선생님 코드를 정하면 다른 기기에서도 불러올 수 있어요.`, 6000);
        }}, `📥 ${sheets.length}개 반 모두 등록`));
      } catch (e) {
        sheetBox.textContent = (e.message || '파일을 읽지 못했어요') + ' — 표를 복사해 아래 칸에 붙여 넣어도 돼요.';
      }
    };
    $('roster-form').onsubmit = e => e.preventDefault();
    $('r-cancel').onclick = e => { e.preventDefault(); d.close(); };
    $('r-ok').textContent = first ? '저장하고 학생 받기' : '저장';
    $('r-ok').onclick = async e => {
      e.preventDefault();
      if (!T.demo && !$('r-cls').value.trim() && !confirm('반 이름이 없으면 이 명단을 기억해 두지 못해서 다음에 다시 넣어야 해요.\n반 이름 없이 진행할까요?')) { $('r-cls').focus(); return; }
      const ok = await saveRoster($('r-cls').value.trim(), $('r-text').value, hall, lay);
      if (!ok) return;
      d.close();
      if (first) { if (T.demo) startBots(); else showQR(); }
    };
    segs();
    d.showModal();
  }
  async function saveRoster(cls, text, hall, lay) {
    const savedAll = savedRosters();
    const list = M.parseRoster(text);
    if (!list.length || list.length > layoutFor(lay).NSEAT) return false;
    const roster = M.assignKeys(list, T.roster);
    const layoutDef = M.LAYOUTS[lay] ? null : customLayouts()[lay] || null;   // 직접 만든 모양은 학생 폰도 그릴 수 있게 방에 같이 둔다
    const upd = {roster, 'meta/cls': cls, 'meta/hall': hall, 'meta/layout': lay, 'meta/layoutDef': layoutDef};
    for (const k of Object.keys(T.roster)) {
      if (roster[k]) continue;
      upd['claims/' + k] = null;
      if (T.claims[k]) upd[`prefs/${T.claims[k]}/${k}`] = null;
      delete T.locks[k];
    }
    try { await guard(T.store.update(T.base, upd), '명단 저장'); } catch (e) { return false; }
    setPref('hall', hall);
    if (!T.demo && cls) {
      // 반 이름이 곧 그 반의 자리 기록 이름 (선생님 공간 안)
      T.bid = classId(cls);
      savedAll[cls] = {text: text.trim(), layout: lay, hall, layoutDef};
      setPref('rosters', savedAll);
      if (TID) T.store.set(`${classPath(T.bid)}/info`, {cls, layout: lay, hall, layoutDef, text: text.trim(), t: T.store.now()}).catch(e => console.warn('[seats] class info', e));
      loadHistory();
    }
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
      const L = TL();
      const pool = L.SEATS.filter(s => ({
        front: s.r <= 1, back: s.r >= 3, window: s.k === L.COLS - 1, hall: s.k === 0, middle: s.k >= 2 && s.k <= 3 && s.r >= 1 && s.r <= 3
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
        setTimeout(() => { if (T.store === store) store.set(`${base}/prefs/bot-${k}/${k}`, Object.assign({who: k, t: store.now()}, plan[k])); }, 1500 + Math.random() * 5000);
      }, 600 + i * 450 + Math.random() * 1500);
    });
    toast('t-toast', '가상 학생들이 하나씩 들어와요. 바람이 들어올 때마다 자리가 맞춰지는 것을 보세요.', 6000);
  }

  // ════════════════════════════════════════════════════════════
  //  학생
  // ════════════════════════════════════════════════════════════
  const S = {
    store: null, code: '', base: '', meta: undefined, roster: {}, claims: {}, result: null, mine: undefined,
    key: null, join: null, minePrefs: {}, active: null, done: [], formKey: null, fresh: false, f: [], w: [], b: null, dirty: false, editing: false, wishBoard: null, resBoard: null, sending: false
  };
  const SL = () => M.layoutOf(S.meta && S.meta.layout, S.meta && S.meta.layoutDef);
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
    on('/joins/' + S.store.uid, v => { S.join = v; });
    // 이 기기로 낸 학생들의 바람 {열쇠: 바람}. 지금 학생(S.key) 것만 화면에 쓴다.
    S.done = pref('done-' + code, []);
    try { S.active = sessionStorage.getItem('seats-active-' + code); } catch (e) { S.active = null; }
    on('/prefs/' + S.store.uid, v => { S.minePrefs = v || {}; S.fresh = true; });
    S.store.onStatus(ok => { $('st-conn').className = 'conn ' + (ok ? 'on' : 'off'); });
    $('send-btn').onclick = sendPrefs;
    $('self-open').onclick = () => { $('self-form').hidden = false; $('self-open').hidden = true; $('self-name').focus(); };
    $('self-form').onsubmit = async e => {
      e.preventDefault();
      const p = M.parseRoster($('self-name').value)[0];
      if (!p) return toast('st-toast', '이름을 써 주세요.');
      if (M.rosterList(S.roster).some(s => s.name === p.name && !S.claims[s.key]) && !confirm(`명단에 '${p.name}'이(가) 있어요. 위에서 그 이름을 누르면 돼요.\n그래도 따로 보낼까요?`)) return;
      try {
        await S.store.set(`${S.base}/joins/${S.store.uid}`, Object.assign({name: p.name, t: S.store.now()}, p.no != null ? {no: p.no} : {}));
      } catch (err) { toast('st-toast', '보내지 못했어요. 마감됐을 수 있어요.', 5000); }
    };
    $('edit-btn').onclick = () => { S.editing = true; sRender(); };
    // 태블릿을 빌려 쓰는 친구에게 넘기기: 낸 바람은 서버에 남고, 이 기기에서는 다시 열 수 없게 잠근다
    $('pass-btn').onclick = () => {
      const who = sLabel(S.key);
      if (!confirm(`${who}의 바람은 보냈어요.\n이 기기를 다른 친구에게 넘길까요? 넘기면 이 기기에서는 ${who}의 바람을 다시 볼 수 없어요.`)) return;
      S.done = [...new Set([...S.done, S.key])];
      setPref('done-' + S.code, S.done);
      setActive(null);
      S.f = []; S.w = []; S.b = null; S.dirty = false; S.editing = false; S.formKey = null;
      const ex = $('st-explain'); delete ex.dataset.init;
      sRender();
      toast('st-toast', '다음 친구가 이름을 고르면 돼요.');
    };
    $('rename-btn').onclick = async () => {
      if (!confirm('내 이름을 다시 고를까요? 지금까지 고른 것은 지워져요.')) return;
      try {
        await S.store.update(S.base, {['claims/' + S.key]: null, [`prefs/${S.store.uid}/${S.key}`]: null});
        setActive(null);
        S.f = []; S.w = []; S.b = null; S.dirty = false; S.editing = false;
      } catch (e) { toast('st-toast', '지우지 못했어요. 마감됐을 수 있어요.'); }
    };
  }

  function setActive(key) {
    S.active = key;
    try { if (key) sessionStorage.setItem('seats-active-' + S.code, key); else sessionStorage.removeItem('seats-active-' + S.code); } catch (e) { /* 그대로 */ }
  }
  // 이 기기가 맡은 이름들 (태블릿 하나를 여럿이 쓰면 여러 개)
  const mineKeys = () => Object.keys(S.claims).filter(k => S.claims[k] === S.store.uid && S.roster[k]);
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
    const mk = mineKeys();
    S.key = S.active && mk.includes(S.active) && !S.done.includes(S.active) ? S.active : mk.find(k => !S.done.includes(k)) || null;
    if (S.key && S.key !== S.active) setActive(S.key);
    S.mine = S.key ? S.minePrefs[S.key] || null : null;
    // 고르는 칸 채우기: 학생이 바뀌면 그 학생 것으로, 서버 값이 새로 왔으면 고치는 중이 아닐 때만
    const fill = () => { const v = S.mine; S.f = v ? M.splitList(v.f) : []; S.w = v ? M.splitList(v.w) : []; S.b = v && Number.isFinite(v.b) ? v.b : null; };
    if (S.key !== S.formKey) { fill(); S.formKey = S.key; S.dirty = false; }
    else if (S.fresh && !S.dirty) fill();
    S.fresh = false;
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
      const taken = !!S.claims[s.key], here = taken && S.claims[s.key] === S.store.uid;
      g.append(h('button', {type: 'button', class: 'name' + (taken ? ' taken' : ''), disabled: taken, onclick: () => claim(s)},
        s.no != null ? h('small', {text: s.no}) : null, h('span', {text: s.label}), taken ? h('em', {text: here ? '이 기기에서 냈어요' : '들어옴'}) : null));
    }
    if (!g.firstChild) g.append(h('p', {class: 'hint', text: '선생님이 명단을 넣는 중이에요. 잠시만 기다려 주세요.'}));
    const waiting = !!S.join;
    $('self-note').hidden = !waiting;
    const full = waiting && S.meta && S.meta.joinFull && S.meta.joinFull[S.store.uid];
    $('self-note').classList.toggle('error', !!full);
    if (waiting) { $('self-form').hidden = true; $('self-open').hidden = true; $('self-note').textContent = full ? `'${S.join.name}'(으)로 보냈는데 자리가 다 차서 아직 못 들어갔어요. 선생님께 말해 주세요 — 자리가 생기면 바로 넘어가요.` : `'${S.join.name}'(으)로 보냈어요. 선생님 화면에서 명단에 더해지면 바로 다음으로 넘어가요.`; }
    else if ($('self-form').hidden) $('self-open').hidden = false;
  }
  async function claim(s) {
    if (!confirm(`${s.no != null ? s.no + '번 ' : ''}${s.label} 맞나요?`)) return;
    try {
      await S.store.set(`${S.base}/claims/${s.key}`, S.store.uid);
      setActive(s.key);
      S.f = []; S.w = []; S.b = null; S.dirty = false; S.editing = true; S.formKey = s.key;
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
    S.wishBoard.layout(SL());
    S.wishBoard.view(S.meta.hall, false);
    S.w = S.w.filter(id => SL().SEAT[id]);
    const marks = {};
    S.w.forEach((id, i) => { marks[id] = {cls: 'wish', text: '★' + (i + 1)}; });
    S.wishBoard.marks(marks);
    // 나에게 더 중요한 것: 친구 비중(%) 다섯 단계 + 선생님 기본값
    const def = Math.round((S.meta.fw ?? 0.6) * 100), bal = $('balance');
    bal.textContent = '';
    for (const [b, text] of [[null, '선생님 기본값'], [80, '친구가 훨씬 중요'], [60, '친구가 조금 더'], [50, '반반'], [40, '자리가 조금 더'], [20, '자리가 훨씬 중요']]) {
      const f = b ?? def;
      bal.append(h('button', {type: 'button', role: 'radio', 'aria-checked': String(S.b === b), class: b === null ? 'def' : '', onclick: () => { S.b = b; S.dirty = true; drawPrefs(); }},
        h('span', {text}), h('small', {text: `친구 ${f} : 자리 ${100 - f}`})));
    }
    const ex = $('st-explain');
    $('st-explain-body').innerHTML = explainHTML(S.meta.fw, S.b);
    if (!ex.dataset.init) { ex.dataset.init = '1'; ex.open = !S.mine; }
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
      await S.store.set(`${S.base}/prefs/${S.store.uid}/${S.key}`, Object.assign({who: S.key, f: S.f.join(','), w: S.w.join(','), t: S.store.now()}, S.b != null ? {b: S.b} : {}));
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
    $('pass-btn').hidden = true;
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
    const bb = Number.isFinite(S.mine.b) ? `친구 ${S.mine.b} : 자리 ${100 - S.mine.b}` : '선생님 기본 비율';
    sum.append(h('li', {}, h('small', {text: '보낸 것'}), `친구 ${f.length}명 · 자리 ${w.length ? w.length + '곳' : '어디든 괜찮음'} · ${bb}`));
    sum.append(h('li', {class: 'quiet'}, '누구를 골랐는지는 나만 알아요. 친구들 화면에도, 선생님 화면에도 나오지 않아요.'));
    $('edit-btn').hidden = ph !== 'open';
    $('pass-btn').hidden = ph !== 'open';
  }

  function drawResult() {
    const occ = S.result.occ || {};
    const where = {};
    for (const [seat, key] of entries(occ)) where[key] = seat;
    // 태블릿을 돌려 썼으면 이 기기로 낸 학생이 여럿 — 마지막에 낸 학생(또는 지금 학생)을 강조
    const mk = mineKeys(), me = S.key || S.active || mk[mk.length - 1] || null;
    const mine = me && where[me];
    const myP = me ? S.minePrefs[me] : null;
    const myF = myP ? M.splitList(myP.f) : [];
    S.resBoard.layout(SL());
    S.resBoard.view(S.meta.hall, false);
    S.resBoard.setChips(M.rosterList(S.roster).filter(s => where[s.key]).map(s => ({
      key: s.key, seat: where[s.key], label: s.label, cls: s.key === me ? 'me' : ''
    })));
    S.resBoard.marks({});
    const L = SL();
    $('res-title').textContent = mine ? (mk.length > 1 ? `${sLabel(me)} · ` : '') + L.seatName(mine) : '새 자리가 나왔어요';
    let text = mine ? '빨간 테두리가 내 자리예요.' : '';
    if (mk.length > 1) text = `이 기기로 ${mk.length}명이 냈어요. ${mk.filter(k => where[k]).map(k => `${sLabel(k)}: ${L.seatName(where[k])}`).join(' / ')}. `;
    if (mine && myF.length) {
      const near = myF.filter(k => where[k] && L.near(L.SEAT[mine], L.SEAT[where[k]]) >= 0.75).length;
      text += near ? ` 고른 친구 ${myF.length}명 가운데 ${near}명이 짝이나 앞뒤에 있어요.` : ' 고른 친구와는 조금 떨어졌지만, 모두가 골고루 원하는 것을 얻도록 정한 자리예요.';
    }
    $('res-text').textContent = text;
  }

  // ════════════════════════════════════════════════════════════
  //  처음 화면
  // ════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════
  //  자리 기록 (?records) — 선생님 코드로 반별·날짜별 자리표를 보고, 끌어다 놓아 고친다
  // ════════════════════════════════════════════════════════════
  const fmtDay = t => { const d = new Date(t); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${'일월화수목금토'[d.getDay()]}요일`; };
  async function openRecords(want) {
    showScreen('history');
    const note = $('h-note');
    await initCode();
    if (!TID) {
      note.textContent = '선생님 코드를 넣으면 자리 기록이 보여요.';
      $('h-code').hidden = false;
      $('h-code').onsubmit = async e => {
        e.preventDefault();
        if (await setCode($('h-code-input').value)) location.reload();
      };
      return;
    }
    $('h-code').hidden = true;
    let store;
    try { store = await openStore(false); } catch (e) { note.textContent = '서버에 연결하지 못했어요: ' + (e.message || e); return; }
    let all;
    try { all = await store.get(`${SPACE}/${TID}/classes`); }
    catch (e) { note.textContent = isDenied(e) ? '기록을 볼 수 없어요. Firebase 규칙을 다시 게시했는지 확인해 주세요.' : '기록을 불러오지 못했어요.'; return; }
    const classes = entries(all).filter(([, v]) => v && v.info).sort((a, b) => a[1].info.cls.localeCompare(b[1].info.cls));
    const cbox = $('h-classes');
    cbox.textContent = '';
    if (!classes.length) { note.textContent = '이 선생님 코드로 저장된 반이 아직 없어요. 자리 배치 방에서 명단을 반 이름과 함께 저장하면 생겨요.'; return; }
    const board = new Board($('h-board'), {onDrop: (key, seat) => edit.drop(key, seat), canDrag: () => edit.on});
    const edit = {on: false, entry: null, hkey: null, c: null, dirty: false, drop: () => {}};
    const pickClass = c => {
      const v = all[c];
      edit.c = c;
      for (const b of cbox.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.c === c));
      $('h-title').textContent = `${v.info.cls} 자리 기록`;
      $('h-new').href = '?class=' + encodeURIComponent(c) + (LOCAL_ONLY ? '&local' : '');
      history.replaceState(null, '', recordsURL(c));
      const list = entries(v.hist).filter(([, e]) => e && e.seats).sort((a, b) => b[1].t - a[1].t);
      const box = $('h-list');
      box.textContent = '';
      $('h-edit').hidden = !list.length;
      if (!list.length) {
        note.textContent = '아직 공개한 자리가 없어요. 자리 배치 방에서 \'학생 폰에 공개\'를 누르면 날짜별로 쌓여요.';
        $('h-when').textContent = ''; board.setChips([]); return;
      }
      note.textContent = '날짜를 누르면 그때 자리가 보여요.';
      const show = ([hkey, e]) => {
        stopEdit(false);
        edit.entry = JSON.parse(JSON.stringify(e)); edit.hkey = hkey;
        draw();
        for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.h === hkey));
      };
      for (const it of list) box.append(h('button', {type: 'button', 'data-h': it[0], onclick: () => show(it)}, fmtDay(it[1].t)));
      show(list[0]);
    };
    const draw = () => {
      const e = edit.entry;
      board.layout(M.layoutOf(e.layout, e.layoutDef));
      board.view(e.hall, false);
      const seen = {};
      for (const p of Object.values(e.seats)) seen[p.n] = (seen[p.n] || 0) + 1;
      // 이름표 열쇠는 사람(이름|번호) — 끌어서 옮겨도 같은 이름표가 미끄러져 간다
      board.setChips(entries(e.seats).map(([seat, p]) => ({key: p.n + '|' + (p.no ?? ''), seat, label: seen[p.n] > 1 ? `${p.n}(${p.no ?? ''})` : p.n})));
      board.marks({});
      board.root.classList.toggle('editing', edit.on);
      $('h-when').textContent = `${fmtDay(e.t)} · ${M.layoutOf(e.layout, e.layoutDef).name} · ${Object.keys(e.seats).length}명` + (edit.on ? ' — 이름을 끌어다 다른 자리에 놓으세요' : '');
      $('print-head').textContent = `${all[edit.c].info.cls} 자리 배치 · ${fmtDay(e.t)}`;
      $('h-stage').style.setProperty('--ar', board.aspect);
    };
    // 끌어다 놓기: 빈자리면 옮기고, 사람이 있으면 서로 바꾼다
    edit.drop = (key, target) => {
      const e = edit.entry, from = Object.keys(e.seats).find(s => { const p = e.seats[s]; return p.n + '|' + (p.no ?? '') === key; });
      if (!from || from === target) return;
      const other = e.seats[target];
      e.seats[target] = e.seats[from];
      if (other) e.seats[from] = other; else delete e.seats[from];
      edit.dirty = true;
      $('h-save').disabled = false;
      draw();
    };
    const stopEdit = ask => {
      if (ask && edit.dirty && !confirm('고친 자리를 저장하지 않고 그만둘까요?')) return false;
      edit.on = false; edit.dirty = false;
      $('h-edit').textContent = '✏️ 자리 고치기'; $('h-save').hidden = true;
      return true;
    };
    $('h-edit').onclick = () => {
      if (edit.on) { if (stopEdit(true)) { edit.entry = JSON.parse(JSON.stringify(all[edit.c].hist[edit.hkey])); draw(); } return; }
      edit.on = true; edit.dirty = false;
      $('h-edit').textContent = '그만두기'; $('h-save').hidden = false; $('h-save').disabled = true;
      draw();
    };
    $('h-save').onclick = async () => {
      try {
        await store.set(`${classPath(edit.c)}/hist/${edit.hkey}`, Object.assign({}, edit.entry, {edited: store.now()}));
        all[edit.c].hist[edit.hkey] = JSON.parse(JSON.stringify(edit.entry));
        stopEdit(false); draw();
        toast('h-toast', '고친 자리를 저장했어요. 다음 자리 배치의 \'돌아가며 양보\'에도 이 자리가 쓰여요.');
      } catch (err) { toast('h-toast', '저장하지 못했어요: ' + (err.message || err), 5000); }
    };
    for (const [c, v] of classes) cbox.append(h('button', {type: 'button', 'data-c': c, onclick: () => { if (stopEdit(true)) pickClass(c); }},
      h('b', {text: v.info.cls}), h('small', {text: `${Object.keys(v.hist || {}).length}번`})));
    pickClass(want && all[want] ? want : classes[0][0]);
  }

  // 선생님 코드 정하기 (이 기기에 저장). 너무 짧으면 남이 짐작할 수 있어서 6자 이상.
  async function setCode(raw) {
    const c = normCode(raw);
    if (c.length < 6) { alert('선생님 코드는 6자 이상으로 정해 주세요. 남이 짐작하기 어렵게, 숫자와 글자를 섞으면 좋아요.'); return false; }
    setPref('teacherCode', c);
    await initCode();
    return true;
  }
  function drawCodeBox() {
    const c = pref('teacherCode', '');
    $('code-state').textContent = c ? `선생님 코드가 이 기기에 저장돼 있어요 (${c.slice(0, 2)}${'•'.repeat(Math.max(0, c.length - 2))}).` : '선생님 코드를 정해 두면 반 명단과 자리 기록을 어느 기기에서든 불러와요. 기기마다 처음 한 번만 넣으면 돼요.';
    $('code-form').hidden = !!c;
    $('code-change').hidden = !c;
  }

  function initEntry() {
    // 첫 화면 그림: 33자리 교실
    const g = $('entry-art-desks');
    for (const s of M.SEATS) {
      const x = 34 + (M.WIDTH - s.x - 0.5) * 40, y = 16 + s.r * 11;   // 복도가 오른쪽인 교실
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
    $('records-link').href = recordsURL();
    drawCodeBox();
    $('code-form').onsubmit = async e => { e.preventDefault(); if (await setCode($('code-input').value)) { $('code-input').value = ''; drawCodeBox(); } };
    $('code-change').onclick = () => { if (confirm('이 기기에 저장된 선생님 코드를 지우고 다시 넣을까요?')) { setPref('teacherCode', ''); TID = null; drawCodeBox(); $('code-input').focus(); } };
    if (LOCAL_ONLY) $('server-note').textContent = '연습 모드: 서버 없이 이 브라우저의 탭끼리만 연결돼요.';
    if (params.has('records')) return openRecords(params.get('c') || '');
    const cls = params.get('class') || '';
    if (cls) return openRoom(false, null, classId(cls));
    const host = (params.get('host') || '').replace(/\D/g, '').slice(0, 4);
    if (host) openRoom(false, host);
    else if (room) joinRoom(room);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEntry);
  else initEntry();
})();
