/* 흑점 헌터스 — 다 같이 태양 관측 (학생 화면 · 관측소 전광판 · 가상 학생).
   계산은 sunspot-model.js, 3D 관측소는 sunspot-world.js, 태양 투영판은 sunspot-board.js.

   온라인 게임처럼: 방 번호 없이 주소로 들어오면 모두가 '오늘의 관측소' 하나에 같이 접속한다.
   날짜(한국 시각)마다 관측소가 하나씩 생기고, 그날 태양은 모두에게 같다(같은 seed).
   각자 자기 속도로 1일째 관측 → 며칠 뒤 관측 → 플레어 → 오로라 밤까지 진행하고,
   같은 3D 관측소에서 서로의 망원경·빛줄기·이모지·순위를 실시간으로 본다.

   실시간 공유는 캠퍼스 지진(sims/quake)과 같은 Firebase Realtime Database 를 쓴다.
   규칙은 sims/quake/database.rules.json 의 "sunspot" 부분 (콘솔에는 그 파일 전체를 붙여 넣는다).
   서로 주고받는 것은 망원경 방향·단계·점수·찍은 자리·이모지뿐이다.

   주소 뒤에 붙이는 것
     ?board       관측소 전광판 (TV·프로젝터용, 3D 전체 보기와 순위·반 전체 자료)
     ?demo        전광판 미리 보기: 가상 학생 20명 (서버 없이 이 기기 안에서만)
     ?offline     학생 혼자 연습: 가상 친구들과 (서버 없이)
     ?local       서버 대신 같은 브라우저의 탭끼리만 연결 (개발·연습용) */
(() => {
  'use strict';
  const M = window.SunspotModel, $ = id => document.getElementById(id);

  // ── 설정 (캠퍼스 지진·자리 배치와 같은 Firebase 프로젝트) ─────────────────
  const FIREBASE = {
    apiKey: 'AIzaSyDyscbvZ4d9dCKHa4EcKEKEKFJJeJTPets',
    authDomain: 'sehwa-f2f95.firebaseapp.com',
    projectId: 'sehwa-f2f95',
    appId: '1:538221310192:web:c0c949065d362562cad235',
    databaseURL: 'https://sehwa-f2f95-default-rtdb.firebaseio.com'
  };
  const FB = 'https://www.gstatic.com/firebasejs/11.6.1/';
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  const ROOT = 'sunspot/world';
  const params = new URLSearchParams(location.search);
  const DB_URL = params.get('db') || FIREBASE.databaseURL;
  const LOCAL_ONLY = params.has('local');
  const ONLINE_MS = 90000;          // 이 시간 동안 소식이 없으면 나간 사람으로 본다
  const PAGE_URL = location.origin + location.pathname;

  // ── 작은 도구들 ─────────────────────────────────────────────
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const entries = o => Object.entries(o || {});
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = () => Math.floor(Math.random() * 2 ** 31);
  const team = i => M.TEAMS[i] || {name: '?', color: '#8a96a3', icon: '❔'};
  const fmt = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const pref = (k, d) => { try { const v = localStorage.getItem('sunspot:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('sunspot:' + k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 괜찮다 */ } };
  const sunCache = new Map();
  const sunOf = seed => { if (!sunCache.has(seed)) sunCache.set(seed, M.makeSun(seed)); return sunCache.get(seed); };
  // 오늘(한국 시각)의 관측소 이름과 그날의 태양
  const dayKeyOf = ms => { const d = new Date(ms + 9 * 3600e3); return String(d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()); };
  const seedOf = day => M.hashStr('sunspot-hunters:' + day);
  const pts = p => Math.max(p.sc || 0, p.best || 0);
  const isOnline = (p, now) => !!(p && p.name && p.on !== false && (!p.seen || now - p.seen < ONLINE_MS));
  const onlineList = (players, now, meId) => entries(players).filter(([id, p]) => p && p.name && (id === meId || isOnline(p, now)));
  // 우리 반 목표: 지금 접속한 사람 수 × 오늘 흑점 수의 60%
  function goalOf(list, sun) {
    const n = M.spotsOn(sun, 0).length;
    return {goal: Math.max(10, Math.round(list.length * n * 0.6)), hits: list.reduce((a, [, p]) => a + (p.hits || 0), 0), n};
  }
  // 이름 거르기: 지질시대 게임의 금지어 목록을 같이 쓴다
  let BAD = [];
  import('../geologic-game/data.js?v=5').then(m => { BAD = (m.badWords || []).map(w => String(w).toLowerCase()); }).catch(() => {});
  const cleanName = n => {
    const s = String(n || '').replace(/[<>]/g, '').trim().slice(0, 8);
    const low = s.toLowerCase().replace(/\s/g, '');
    return BAD.some(w => w && low.includes(w)) ? '관측자' + Math.floor(rand(10, 99)) : s;
  };

  // ── 실시간 저장소 (캠퍼스 지진과 같은 모양) ──────────────────────────
  const parts = p => p.split('/').filter(Boolean);
  const copy = v => v == null ? null : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  function getIn(o, ps) {
    for (const k of ps) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
    return o === undefined ? null : o;
  }
  function setIn(rootObj, ps, val) {
    let o = rootObj;
    const trail = [];
    for (let i = 0; i < ps.length - 1; i++) {
      const k = ps[i];
      if (o[k] == null || typeof o[k] !== 'object') { if (val == null) return; o[k] = {}; }
      trail.push([o, k]); o = o[k];
    }
    const last = ps[ps.length - 1];
    if (val == null) delete o[last]; else o[last] = copy(val);
    for (let i = trail.length - 1; i >= 0; i--) {
      const [p, k] = trail[i];
      if (p[k] && typeof p[k] === 'object' && !Object.keys(p[k]).length) delete p[k]; else break;
    }
  }
  function merge(a, b) {
    if (b == null || typeof b !== 'object' || a == null || typeof a !== 'object') return b == null ? a : b;
    for (const k of Object.keys(b)) a[k] = merge(a[k], b[k]);
    return a;
  }
  class LocalStore {
    constructor(shared = true) {
      this.kind = 'local'; this.tree = {}; this.subs = new Set(); this.leave = [];
      let uid = null;
      try { uid = sessionStorage.getItem('sunspot-uid'); } catch (e) { /* 사생활 보호 모드 */ }
      if (!uid) { uid = 'u' + randInt().toString(36); try { sessionStorage.setItem('sunspot-uid', uid); } catch (e) { /* 그대로 */ } }
      this.uid = uid;
      this.ready = new Promise(ok => { this.readyOk = ok; setTimeout(ok, shared ? 400 : 0); });
      this.ch = null;
      if (shared) {
        try { this.ch = new BroadcastChannel('sunspot-hunters'); this.ch.onmessage = e => this.receive(e.data); this.ch.postMessage({op: 'hello'}); } catch (e) { this.ch = null; }
      }
      addEventListener('pagehide', () => this.leave.forEach(([p, o]) => this.update(p, o)));
    }
    now() { return Date.now(); }
    receive(m) {
      if (m.op === 'hello') { if (Object.keys(this.tree).length) this.ch.postMessage({op: 'snap', tree: this.tree}); }
      else if (m.op === 'snap') { this.tree = merge(copy(m.tree), this.tree); this.notify(['']); this.readyOk(); }
      else if (m.op === 'write') this.apply(m.writes, false);
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
    on(path, cb) { const s = {ps: parts(path), cb}; this.subs.add(s); cb(copy(getIn(this.tree, s.ps))); return () => this.subs.delete(s); }
    onLeave(path, obj) { this.leave.push([path, obj]); }
    onStatus(cb) { cb(true); }
  }
  async function firebaseStore() {
    const [A, Auth, D] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-database.js')]);
    const app = A.getApps().find(a => a.name === 'sunspot') || A.initializeApp(Object.assign({}, FIREBASE, {databaseURL: DB_URL}), 'sunspot');
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
      kind: 'firebase', uid: user.uid,
      now: () => Date.now() + offset,
      set: (p, v) => D.set(ref(p), v),
      update: (p, o) => D.update(ref(p), o),
      remove: p => D.remove(ref(p)),
      get: p => D.get(ref(p)).then(s => s.val()),
      on: (p, cb, onErr) => D.onValue(ref(p), s => cb(s.val()), err => { console.warn('[sunspot]', p, err.message); if (onErr) onErr(err); }),
      onLeave: (p, o) => D.onDisconnect(ref(p)).update(o),
      onStatus: cb => D.onValue(ref('.info/connected'), s => cb(!!s.val()))
    };
  }
  // 실제 수업: Firebase. ?local: 같은 브라우저의 탭끼리. 혼자 연습(서버가 안 될 때): 이 기기 안에서만.
  async function openStore(kind) {
    if (kind === 'offline') return new LocalStore(false);
    if (LOCAL_ONLY || kind === 'demo') { const s = new LocalStore(true); await s.ready; return s; }
    return firebaseStore();
  }
  const isDenied = e => e && /permission|denied|PERMISSION/i.test(String(e.message || e.code || e));
  const RULES_HELP = '선생님: Firebase 콘솔 → Realtime Database → 규칙에 sims/quake/database.rules.json 내용 전체를 붙여 넣고 게시해 주세요(흑점 헌터스용 "sunspot" 부분).';

  // ── 소리 (기기에서 바로 만드는 짧은 소리) ────────────────────────────
  const Sound = {
    ctx: null, on: pref('sound', true),
    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.resume) this.ctx.resume();
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    },
    tone(f, dur, type = 'sine', gain = 0.18, delay = 0, slide = 0) {
      if (!this.ctx || !this.on) return;
      const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
    },
    play(kind, n = 0) {
      const P = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
      if (kind === 'tick') this.tone(1800, 0.025, 'square', 0.03);
      else if (kind === 'tap') this.tone(660, 0.06, 'triangle', 0.08);
      else if (kind === 'hit') { const f = P[Math.min(P.length - 1, n)]; this.tone(f, 0.16, 'triangle', 0.2); this.tone(f * 2, 0.1, 'sine', 0.06, 0.03); }
      else if (kind === 'bad') this.tone(180, 0.22, 'sawtooth', 0.08, 0, 0.6);
      else if (kind === 'good') { this.tone(659, 0.12, 'triangle', 0.18); this.tone(988, 0.2, 'triangle', 0.18, 0.09); }
      else if (kind === 'lock') { this.tone(1400, 0.04, 'square', 0.06); this.tone(523, 0.14, 'triangle', 0.2, 0.05); this.tone(784, 0.14, 'triangle', 0.2, 0.13); this.tone(1047, 0.3, 'triangle', 0.2, 0.21); }
      else if (kind === 'fanfare') [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.5 : 0.16, 'triangle', 0.2, i * 0.12));
      else if (kind === 'alarm') for (let i = 0; i < 4; i++) { this.tone(880, 0.22, 'sawtooth', 0.09, i * 0.42); this.tone(587, 0.2, 'sawtooth', 0.09, i * 0.42 + 0.21); }
      else if (kind === 'emoji') this.tone(990, 0.07, 'sine', 0.06);
      else if (kind === 'whoosh') this.tone(300, 0.5, 'sine', 0.08, 0, 3);
    }
  };
  const Wake = {
    lock: null,
    async on() { try { if (navigator.wakeLock) this.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* 지원 안 하는 기기 */ } },
    init() { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.lock) this.on(); }); }
  };
  const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 진동 없는 기기 */ } };

  // ── QR ──────────────────────────────────────────────────
  let qrLoading = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (!qrLoading) qrLoading = new Promise((ok, no) => { const s = document.createElement('script'); s.src = QR_LIB; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return qrLoading;
  }
  async function drawQR(cv, text) {
    try { await loadQR(); } catch (e) { return; }
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), x = cv.getContext('2d'), W = cv.width, cell = W / (n + 2);
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, W); x.fillStyle = '#0b1626';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect(Math.floor((c + 1) * cell), Math.floor((r + 1) * cell), Math.ceil(cell), Math.ceil(cell));
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   학생 화면
  // ╚══════════════════════════════════════════════════════════╝
  const S = {
    store: null, base: '', day: '', name: '', team: 0, players: {}, offline: false, bots: null,
    sun: null, pers: null, stage: '', stageT: 0,
    tel: {az: 140, alt: 12}, motor: true, focus: 0.5, aligned: false, lockAnim: null,
    marks1: [], found: new Set(), dust: 0, combo: 0, lastHit: 0, skT0: 0, perfect: false,
    dirTries: 0, dirArmed: 0, prep: new Set(), eye: false, aimT0: 0,
    find: null, flare: null, score: 0, best: 0, pending: {}, lastFlush: 0, lastAim: null, lastAimT: 0,
    shakeT: -9, drag: null, world: null, board: null, emojiT: 0, overlayFor: null, gold: false, nightT: 0
  };
  const STAGE_TEXT = {
    prep: ['🧢 안전 준비', '태양 관측 전에 꼭 할 일 <b>3가지</b>를 골라 누르세요. 하나는 <b>절대 하면 안 되는 일</b>이에요!'],
    aim: ['🎯 조준: 그림자를 동그랗게', '① 위 3D 화면을 끌어 망원경을 해 쪽으로 돌리고 ② <b>투영판을 끌어</b> 밝은 햇빛을 가운데로 — 그림자가 <b>동그랗게</b> 줄면 성공!'],
    focus: ['🔍 초점 맞추기', '초점 나사를 돌려 <b>태양 가장자리와 흑점이 가장 또렷할 때</b> ‘초점 맞음!’을 누르세요.'],
    dir: ['🧭 동서남북 정하기', '추적 모터를 잠깐 끄면 태양 상이 흘러가요. <b>상이 흘러가는 쪽이 서쪽!</b>'],
    sketch: ['✏️ 흑점 스케치', '흑점을 모두 찾아 찍으세요(꾹 누르면 돋보기). <b>렌즈 먼지</b>는 상이 흔들려도 제자리 — 찍으면 감점!'],
    done1: ['✅ 1일째 관측 끝!', '결과를 보고, 며칠 뒤 같은 태양을 다시 관측하러 가요.'],
    aim2: ['🎯 며칠 뒤, 다시 조준', '망원경을 새로 설치했어요. 다시 그림자를 맞추세요.'],
    find: ['⭐ 내 흑점 추적', '투명 용지의 <b>★</b>은 지난번에 기록한 흑점. 오늘은 어디 있을까요? 흑점은 <b>같은 위도를 따라 서쪽(W)</b>으로 움직여요.'],
    done2: ['✅ 자전 주기 측정 끝!', '반 친구들이 잰 값도 모아서 볼까요?'],
    flare: ['⚡ 플레어 경보!', 'Hα 필터로 바꿨어요. 흑점 무리 근처에서 <b>갑자기 하얗게 밝아지는 곳</b>을 찾아 누르세요!'],
    night: ['🌌 그날 밤…', '플레어 때 뿜어져 나온 물질이 지구에 도착했어요. 북쪽 하늘을 보세요!']
  };

  function toast(text, ms = 1800) {
    const t = $('toast');
    t.textContent = text; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
  }
  function send(obj) { Object.assign(S.pending, obj); }
  function flush(force) {
    if (!S.store) return;
    const now = performance.now();
    if (!force && now - S.lastFlush < 180) return;
    if (!Object.keys(S.pending).length) return;
    S.lastFlush = now;
    const upd = S.pending; S.pending = {};
    S.store.update(S.base + '/players/' + S.store.uid, upd).catch(e => console.warn('[sunspot] 보내기 실패', e && e.message));
  }
  function addScore(n, label, px, py, color) {
    S.score = Math.max(0, S.score + n);
    send({sc: S.score});
    $('st-score').textContent = S.score;
    const box = $('st-score').parentElement; box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    if (label && px != null && S.board) S.board.burst(px, py, label, color || (n >= 0 ? '#16a34a' : '#e03131'));
  }
  function event(pop, color) { send({ev: {pop, c: color || '#ffd43b', t: S.store.now()}}); }

  // ── 관측소 입장 ─────────────────────────────────────────────
  async function joinWorld(name, teamIdx, offline) {
    const err = $('join-error');
    err.hidden = true;
    Sound.unlock(); Wake.on();
    let store;
    try { store = await openStore(offline ? 'offline' : 'world'); }
    catch (e) { showJoinError(e.message || String(e)); return; }
    const day = dayKeyOf(store.now()), base = `${ROOT}/${day}`, me = `${base}/players/${store.uid}`;
    let old = null;
    try { old = await store.get(me); }
    catch (e) { showJoinError(isDenied(e) ? '실시간 관측소가 아직 열리지 않았어요. ' + RULES_HELP : (e.message || String(e))); return; }
    Object.assign(S, {store, day, base, name, team: teamIdx, offline: !!offline});
    S.sun = sunOf(seedOf(day));
    S.pers = M.personal(store.uid, S.sun);
    S.score = old && old.sc ? old.sc : 0;
    S.best = old && old.best ? old.best : 0;
    const now = store.now();
    try { await store.update(me, {name, team: teamIdx, on: true, seen: now, joined: old && old.joined ? old.joined : now}); }
    catch (e) { showJoinError(isDenied(e) ? '서버가 입장을 막았어요. ' + RULES_HELP : e.message); return; }
    if (!offline) setPref('me', {name, team: teamIdx});
    store.onLeave(me, {on: false});
    store.onStatus(on => { $('st-conn').className = 'conn ' + (on ? 'on' : 'off'); if (on) store.update(me, {on: true, seen: store.now()}); });
    setInterval(() => { send({seen: S.store.now(), on: true}); }, 20000);
    document.body.dataset.screen = 'student';
    $('st-name').textContent = `${team(teamIdx).icon} ${name}`;
    $('st-team-dot').style.background = team(teamIdx).color;
    $('st-score').textContent = S.score;
    buildStudentUI();
    store.on(base + '/players', v => { S.players = v || {}; S.playersDirty = true; });
    if (offline) { S.bots = new Bots(store, base, 11, S.sun); S.bots.start(); }
    resume(old);
    studentLoop();
  }
  function showJoinError(msg) {
    const err = $('join-error');
    err.innerHTML = esc(msg) + '<br><button type="button" class="ghost" id="join-offline">그동안 가상 친구들과 혼자 연습하기 →</button>';
    err.hidden = false;
    $('join-offline').onclick = () => { const n = cleanName($('join-name').value) || '나'; joinWorld(n, ENTRY.team == null ? 0 : ENTRY.team, true); };
  }

  // ── 화면 짜기 ────────────────────────────────────────────
  function buildStudentUI() {
    if (window.SunspotWorld && window.THREE) {
      try { S.world = new window.SunspotWorld($('st-3d'), {mode: 'student'}); if (!S.world.ok) S.world = null; } catch (e) { console.warn(e); S.world = null; }
    }
    if (!S.world) $('st-3d-wrap').style.background = 'linear-gradient(180deg,#5b8fd6,#cfe0f3 70%,#eef3f9)';
    S.board = new window.SunspotBoard($('board'));
    S.board.setSun(S.sun, 0);
    if (S.world) S.world.setMyPlate($('board'));
    const bar = $('emoji-bar');
    bar.innerHTML = M.EMOJIS.slice(0, 6).map(e => `<button type="button" data-e="${e}">${e}</button>`).join('');
    bar.onclick = e => {
      const b = e.target.closest('button[data-e]');
      if (!b) return;
      const now = performance.now();
      if (now - S.emojiT < 1400) return;
      S.emojiT = now;
      send({em: {e: b.dataset.e, t: S.store.now()}}); flush(true);
      Sound.play('emoji');
      bar.classList.add('cool'); setTimeout(() => bar.classList.remove('cool'), 1400);
    };
    const snd = $('st-sound');
    const paintSnd = () => { snd.textContent = Sound.on ? '🔊' : '🔈'; snd.setAttribute('aria-pressed', String(Sound.on)); };
    paintSnd();
    snd.onclick = () => { Sound.on = !Sound.on; setPref('sound', Sound.on); paintSnd(); Sound.unlock(); };
    bind3DDrag(); bindBoard(); bindKeys();
    $('dir-arrows').onclick = e => { const b = e.target.closest('button[data-dir]'); if (b) chooseDir(b.dataset.dir); };
    addEventListener('resize', layout);
    layout();
  }
  // 투영판 크기: 세로 화면이면 3D 를 위에 조금 남기고, 가로 화면이면 오른쪽 칸 높이에 맞춘다.
  // 단계마다 크기가 바뀌면 어지러우니 아래 조작 칸 높이는 넉넉히 하나로 잡는다(넘치면 칸이 스크롤된다).
  function layout() {
    const W = innerWidth, H = innerHeight, wide = W >= 760 && W >= H, ctrl = 120;
    const bs = wide ? Math.min(H - 110 - ctrl, 620, W * 0.5) : Math.min(W - 24, H - 140 - 76 - ctrl - 30, 580);
    document.documentElement.style.setProperty('--bs', Math.max(200, Math.floor(bs)) + 'px');
    if (S.board) S.board.resize();
  }

  function setStage(st) {
    S.stage = st; S.stageT = performance.now();
    document.body.dataset.stage = st;
    send({st}); flush(true);
    const [title, text] = STAGE_TEXT[st] || ['', ''];
    $('m-title').textContent = title.replace('며칠', `${S.sun.dt}일`);
    $('m-text').innerHTML = text;
    const seq = M.DAY1_STAGES.includes(st) ? M.DAY1_STAGES.slice(0, 5) : M.DAY2_STAGES.includes(st) ? M.DAY2_STAGES.slice(0, 2) : [];
    const at = seq.indexOf(st), doneAll = st === 'done1' || st === 'done2';
    $('steps').innerHTML = seq.map((s, i) => `<li class="${doneAll || i < at ? 'done' : i === at ? 'now' : ''}"></li>`).join('');
    $('dir-arrows').hidden = true;
    $('sk-timer').hidden = st !== 'sketch';
    $('drag-hint').hidden = !(st === 'aim' || st === 'aim2');
    const b = S.board;
    if (b) { b.loupe = null; b.hint = null; b.clouds = st === 'sketch'; if (st !== 'find') b.latGuide = null; }
    renderControls();
    layout();
  }

  function renderControls() {
    const c = $('controls'), st = S.stage;
    if (st === 'prep') {
      const acts = [
        {k: 'cap', i: '🧢', t: '파인더 뚜껑 닫기'}, {k: 'plate', i: '📋', t: '투영판 달기'},
        {k: 'sheet', i: '📄', t: '기록 용지(원) 끼우기'}, {k: 'eye', i: '👁', t: '접안렌즈로 태양 직접 보기'}
      ];
      const order = acts.map((a, i) => [a, M.hashStr(S.store.uid + a.k + S.day) % 97 + i * 0.01]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
      c.innerHTML = `<div class="prep-grid">${order.filter(a => !(a.k === 'eye' && S.eye)).map(a => `<button type="button" data-k="${a.k}" class="${S.prep.has(a.k) ? 'ok' : ''}"><span>${a.i}</span>${a.t}</button>`).join('')}</div>`;
      c.querySelector('.prep-grid').onclick = e => { const b = e.target.closest('button[data-k]'); if (b) prepAction(b.dataset.k); };
    } else if (st === 'aim' || st === 'aim2') {
      c.innerHTML = `<div class="meter"><span>그림자</span><i><b id="aim-meter"></b></i><span id="aim-deg" class="num">—</span></div>
        <p class="small">밝은 쪽(햇빛)을 가운데로 끌어오세요. 키보드: 방향키(Shift = 크게)</p>`;
    } else if (st === 'focus') {
      c.innerHTML = `<div class="jog" id="jog" role="slider" aria-label="초점 나사" tabindex="0"></div>
        <div class="row"><button type="button" class="btn-go big" id="focus-ok">🔍 초점 맞음!</button></div>`;
      bindJog($('jog'));
      $('focus-ok').onclick = confirmFocus;
    } else if (st === 'dir') {
      c.innerHTML = `<div class="row"><button type="button" class="btn-sun big" id="motor-off">⏸ 추적 모터 잠깐 끄기</button></div>`;
      $('motor-off').onclick = () => {
        if (S.dirArmed) return;
        S.motor = false; S.dirArmed = performance.now();
        $('motor-off').disabled = true; $('motor-off').textContent = '👀 상이 어느 쪽으로 가나요?';
        Sound.play('whoosh');
        setTimeout(() => { if (S.stage === 'dir') { $('dir-arrows').hidden = false; $('m-text').innerHTML = '상이 <b>흘러간 쪽</b>의 화살표를 누르세요. 그쪽이 서쪽(W)이에요.'; } }, 1300);
      };
    } else if (st === 'sketch') {
      c.innerHTML = `<div class="row"><button type="button" id="shake">🫨 살짝 흔들기</button><button type="button" class="btn-go" id="sk-done">✅ 다 찾았어요</button></div>`;
      $('shake').onclick = () => { if (performance.now() - S.shakeT > 1100) { S.shakeT = performance.now(); Sound.play('whoosh'); } };
      $('sk-done').onclick = () => finishSketch(false);
    } else if (st === 'done1') {
      const n = M.spotsOn(S.sun, 0).length;
      c.innerHTML = `<div class="stat-row"><div class="stat"><small>찾은 흑점</small><b>${S.found.size}/${n}</b></div><div class="stat"><small>먼지에 속음</small><b>${S.dust}</b></div><div class="stat"><small>내 점수</small><b>${S.score}</b></div></div>
        <button class="primary big" id="go-day2">⏩ ${S.sun.dt}일 뒤 다시 관측하기</button>`;
      $('go-day2').onclick = goDay2;
    } else if (st === 'done2') {
      const r = ((S.find && S.find.results) || []).filter(Boolean);
      c.innerHTML = `<div class="stat-row">${r.map(x => `<div class="stat"><small>위도 ${fmt(Math.abs(x.lat), 0)}° 흑점</small><b>${fmt(x.P)}일</b></div>`).join('')}<div class="stat"><small>내 점수</small><b>${S.score}</b></div></div>
        <div class="row"><button class="ghost" id="see-r2">📈 반 전체 결과</button><button class="primary big" id="go-flare">⚡ 계속하기</button></div>`;
      $('see-r2').onclick = showR2;
      $('go-flare').onclick = startFlareSeq;
    } else if (st === 'find') renderFindControls();
    else if (st === 'flare') c.innerHTML = `<p class="small" id="flare-msg">밝아지는 곳을 찾아 누르세요!</p>`;
    else c.innerHTML = '';
  }

  // ── 3D 화면 끌기 = 망원경 크게 돌리기 ─────────────────────────────
  const canSlew = () => S.stage === 'aim' || S.stage === 'aim2';
  function bind3DDrag() {
    const wrap = $('st-3d-wrap');
    let last = null;
    wrap.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      last = {x: e.clientX, y: e.clientY, id: e.pointerId};
      try { wrap.setPointerCapture(e.pointerId); } catch (x) { /* 괜찮다 */ }
      Sound.unlock();
    });
    wrap.addEventListener('pointermove', e => {
      if (!last || e.pointerId !== last.id) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last.x = e.clientX; last.y = e.clientY;
      if (!canSlew() || S.lockAnim) return;
      S.tel.az = (S.tel.az + dx * 0.16 + 360) % 360;
      S.tel.alt = clamp(S.tel.alt - dy * 0.16, 0, 85);
      $('drag-hint').hidden = true;
    });
    const up = () => { last = null; };
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
  }
  // ── 투영판 끌기 = 미세 조정 / 누르기 = 흑점 찍기 ──────────────────────
  function bindBoard() {
    const cv = $('board');
    const pos = e => { const r = cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
    cv.addEventListener('pointerdown', e => {
      Sound.unlock();
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* 괜찮다 */ }
      const p = pos(e);
      S.drag = {x: p.x, y: p.y, id: e.pointerId, t: performance.now()};
      if (canMark()) S.board.loupe = p;
    });
    cv.addEventListener('pointermove', e => {
      if (!S.drag || e.pointerId !== S.drag.id) return;
      const p = pos(e), dx = p.x - S.drag.x, dy = p.y - S.drag.y;
      S.drag.x = p.x; S.drag.y = p.y;
      if (canMark()) { S.board.loupe = p; return; }
      if (canSlew() && !S.lockAnim) nudgeImage(dx, dy);
    });
    const up = e => {
      if (!S.drag || e.pointerId !== S.drag.id) return;
      const p = pos(e);
      S.drag = null;
      if (canMark() && S.board.loupe) { S.board.loupe = null; tapBoard(p.x, p.y); }
      S.board.loupe = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { S.drag = null; if (S.board) S.board.loupe = null; });
    cv.addEventListener('wheel', e => {
      if (S.stage !== 'focus') return;
      e.preventDefault();
      turnFocus(-e.deltaY / 4000);
    }, {passive: false});
  }
  const canMark = () => S.stage === 'sketch' || S.stage === 'find' || S.stage === 'flare';
  // 상을 손가락 쪽으로 옮기려면 망원경은 반대로 돈다. 태양에서 멀수록 크게 움직인다.
  function nudgeImage(dx, dy) {
    const b = S.board, sky = S.sun.sky[0];
    const off = M.tubeOffset(S.tel, sky);
    const gain = clamp(1 + Math.max(0, off.sep - 0.4) * 8, 1, 60);   // 상이 보이면 손가락을 그대로 따라오고, 멀면 성큼성큼
    const k = M.SUN_RADIUS_DEG / M.BOARD_SUN / b.u * gain;
    S.tel.az = (S.tel.az - dx * k / Math.max(0.2, Math.cos(S.tel.alt * Math.PI / 180)) + 360) % 360;
    S.tel.alt = clamp(S.tel.alt + dy * k, 0, 85);
  }
  function bindKeys() {
    addEventListener('keydown', e => {
      if (document.body.dataset.screen !== 'student' || e.target.closest('input,select,textarea')) return;
      const big = e.shiftKey ? 10 : 1;
      const k = {ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4]}[e.key];
      if (k && canSlew()) { e.preventDefault(); nudgeImage(k[0] * big, k[1] * big); }
      else if (k && S.stage === 'focus') { e.preventDefault(); turnFocus((k[0] || -k[1]) * 0.0015 * big); }
      else if (e.key === 'Enter' && S.stage === 'focus') confirmFocus();
    });
  }

  // ── 단계별 동작 ─────────────────────────────────────────────
  function prepAction(k) {
    if (k === 'eye') {
      S.eye = true;
      const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
      Sound.play('bad'); buzz([80, 60, 200]);
      addScore(M.SCORE.eye);
      event('🙈 태양 직접 봄!', '#ff6b6b');
      showOverlay(`<h2>🚫 절대 안 돼요!</h2>
        <p>망원경은 햇빛을 한 점에 모아요. 그 빛이 눈에 들어가면 <b>망막이 순식간에 타서 실명</b>할 수 있어요(가상이라 다행!). 태양은 반드시 <b>투영판에 비춰서</b> 보거나 태양 전용 필터로만 봐요.</p>
        <p class="fact">감점 ${M.SCORE.eye}점. 이제 안전한 준비 3가지를 마저 하세요.</p>
        <button class="primary big" data-close>알겠어요</button>`, () => renderControls());
      return;
    }
    if (S.prep.has(k)) return;
    S.prep.add(k);
    Sound.play('good');
    if (k === 'cap') send({cap: true});
    renderControls();
    if (S.prep.size >= 3) {
      addScore(M.SCORE.prep);
      toast(S.eye ? '준비 끝! 이제 안전해요.' : '✅ 안전 수칙 통과! 준비 끝');
      setTimeout(() => { if (S.stage === 'prep') { S.aimT0 = performance.now(); setStage('aim'); } }, 500);
    }
  }
  function lockAim() {
    S.lockAnim = {from: {az: S.tel.az, alt: S.tel.alt}, t0: performance.now()};
    Sound.play('lock'); buzz(40);
  }
  function finishLock() {
    S.lockAnim = null;
    S.motor = true; S.aligned = true;
    send({al: true, az: +S.tel.az.toFixed(2), alt: +S.tel.alt.toFixed(2)});
    const sec = (performance.now() - S.aimT0) / 1000;
    let p = M.aimScore(sec);
    if (S.stage === 'aim2') p = Math.round(p / 2);
    const c = S.board.imgCenter();
    addScore(p, `+${p}`, c.x, c.y - 30, '#16a34a');
    event(`🎯 ${sec.toFixed(1)}초`, '#ffd43b');
    toast(`🎯 조준 완료! ${sec.toFixed(1)}초 · 추적 모터 켜짐`);
    const from = S.stage;
    setTimeout(() => { if (S.stage !== from) return; if (from === 'aim') setStage('focus'); else startFind(); }, 600);
  }
  function bindJog(el) {
    let last = null;
    el.addEventListener('pointerdown', e => { last = e.clientX; try { el.setPointerCapture(e.pointerId); } catch (x) { /* 괜찮다 */ } });
    el.addEventListener('pointermove', e => {
      if (last == null) return;
      const dx = e.clientX - last; last = e.clientX;
      turnFocus(dx / 900);
      el.style.backgroundPosition = `${(S.focus * 3000) % 280}px 0`;
    });
    const up = () => { last = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function turnFocus(d) {
    const before = S.focus;
    S.focus = clamp(S.focus + d, 0, 1);
    if (Math.floor(before * 120) !== Math.floor(S.focus * 120)) Sound.play('tick');
  }
  function confirmFocus() {
    const err = Math.abs(S.focus - S.pers.f0);
    if (err > M.FOCUS_TOL) {
      Sound.play('bad');
      toast(err > 0.1 ? '아직 많이 흐려요. 나사를 더 돌려 보세요.' : '조금만 더! 흑점 가장자리가 또렷해질 때까지');
      return;
    }
    const p = M.focusScore(err);
    addScore(p, `+${p}`, S.board.u, S.board.u, '#16a34a');
    Sound.play('good');
    toast('🔍 초점이 딱 맞았어요! 쌀알 무늬까지 보여요');
    setStage('dir');
  }
  function chooseDir(d) {
    S.dirTries++;
    if (d !== 'W') {
      Sound.play('bad');
      toast('아니에요! 상이 어느 쪽으로 움직이는지 다시 잘 보세요');
      return;
    }
    const p = S.dirTries === 1 ? M.SCORE.dirFirst : M.SCORE.dirLater;
    addScore(p, `+${p}`, S.board.S - 50, S.board.u, '#16a34a');
    Sound.play('good');
    S.board.labels = true;
    $('dir-arrows').hidden = true;
    $('m-text').innerHTML = '정답! 태양(과 모든 천체)은 일주 운동으로 동 → 서로 움직여요. 그래서 <b>상이 흘러가는 쪽 = 서쪽</b>.';
    S.lockAnim = {from: {az: S.tel.az, alt: S.tel.alt}, t0: performance.now(), dir: true};
    setTimeout(() => {
      if (S.stage !== 'dir') return;
      S.skT0 = S.store.now();
      send({skT: S.skT0});
      setStage('sketch');
      $('m-text').innerHTML = '💡 방금 상이 흐를 때 <b>제자리에 있던 얼룩</b>은 렌즈 먼지예요. 헷갈리면 ‘살짝 흔들기’! 꾹 누르면 돋보기.';
    }, 1700);
  }

  // 흑점 찍기 (스케치·추적·플레어)
  function tapBoard(px, py) {
    const b = S.board;
    if (S.stage === 'flare') return tapFlare(px, py);
    const d = b.toDisk(px, py);
    if (Math.hypot(d.x, d.y) > 1.04) { toast('태양 밖이에요'); return; }
    if (S.stage === 'find') return tapFind(px, py, d);
    // 먼지: 판에 붙어 있다
    const bp = b.toBoard(px, py);
    const dustHit = S.pers.dust.find(q => Math.hypot(q.x - bp.x, q.y - bp.y) < q.r * 1.5 + 6 / b.u);
    const spots = b.spots, minTol = 13 / b.R;
    const h = M.hitTest(spots, d.x, d.y, minTol);
    if (dustHit && (!h || Math.hypot(dustHit.x - bp.x, dustHit.y - bp.y) * b.u < h.dist * b.R)) {
      if (S.marks1.some(m => m.k === 'd' && Math.hypot(m.x - d.x, m.y - d.y) < 0.05)) return;
      S.dust++;
      S.marks1.push({x: d.x, y: d.y, k: 'd', t: performance.now()});
      b.marks = S.marks1;
      addScore(M.SCORE.dust, `${M.SCORE.dust} 먼지!`, px, py);
      Sound.play('bad'); buzz(60);
      S.combo = 0; showCombo();
      toast('렌즈 먼지예요! 상을 흔들어도 제자리에 있죠?');
      if (S.dust === 1) event('😵 먼지에 속음', '#ff8a8a');
      sendMarks();
      return;
    }
    if (!h) {
      S.marks1.push({x: d.x, y: d.y, k: 'e', t: performance.now()});
      b.marks = S.marks1;
      addScore(M.SCORE.empty, `${M.SCORE.empty}`, px, py, '#5f7282');
      Sound.play('tap');
      S.combo = 0; showCombo();
      return;
    }
    if (S.found.has(h.spot.id)) { toast('이미 찍은 흑점이에요'); return; }
    S.found.add(h.spot.id);
    const now = performance.now();
    S.combo = now - S.lastHit < 2600 ? S.combo + 1 : 1;
    S.lastHit = now;
    const p = M.SPOT_PTS[h.spot.kind] + M.comboBonus(S.combo);
    S.marks1.push({x: d.x, y: d.y, k: h.spot.id, t: now});
    b.marks = S.marks1;
    addScore(p, `+${p}`, px, py, '#16a34a');
    Sound.play('hit', S.combo - 1); buzz(15);
    showCombo();
    if (S.combo === 5 || S.combo === 8) event(`🔥 ${S.combo}콤보!`, '#ff8a1a');
    sendMarks();
    if (S.found.size >= spots.length) finishSketch(true);
  }
  function showCombo() {
    const el = $('combo');
    if (S.combo >= 2) { el.textContent = `COMBO ×${S.combo}`; el.classList.add('on'); clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove('on'), 1200); }
    else el.classList.remove('on');
  }
  function sendMarks() { send({mk: M.encodeMarks(S.marks1.filter(m => m.k !== 'e')), hits: S.found.size}); }
  function finishSketch(perfect) {
    if (S.stage !== 'sketch') return;
    const total = S.board.spots.length;
    if (perfect) {
      const left = Math.max(0, M.SKETCH_SEC - (S.store.now() - S.skT0) / 1000);
      const bonus = M.SCORE.perfect + Math.round(left * M.SCORE.perSecLeft);
      addScore(bonus, `💯 +${bonus}`, S.board.u, S.board.u, '#f59f00');
      Sound.play('fanfare');
      event('💯 완벽 관측!', '#ffd43b');
      toast(`💯 흑점을 모두 찾았어요! 보너스 +${bonus}`, 2600);
    } else Sound.play('good');
    send({d1: {f: S.found.size, n: total, d: S.dust}});
    sendMarks();
    S.perfect = perfect;
    setStage('done1');
    setTimeout(() => { if (S.stage === 'done1') showR1(); }, perfect ? 1600 : 700);
  }

  // ── 며칠 뒤: 내 흑점 따라가기 ───────────────────────────────────
  function goDay2() {
    hideOverlay();
    S.board.reveal = null; S.board.sheet = null; S.board.marks = []; S.board.calc = null;
    S.board.setSun(S.sun, S.sun.dt);
    // 망원경을 새로 설치했다: 태양에서 조금 벗어난 곳에서 다시 조준
    const sky = S.sun.sky[0], a = rand(0, Math.PI * 2), d = rand(4, 9);
    S.tel = {az: sky.az + Math.cos(a) * d, alt: clamp(sky.alt + Math.sin(a) * d * 0.6, 3, 80)};
    S.motor = true; S.aligned = false; send({al: false});
    S.aimT0 = performance.now();
    setStage('aim2');
  }
  function startFind() {
    const sun = S.sun, d1 = M.spotsOn(sun, 0);
    const targets = S.pers.track.map((id, i) => {
      const mine = S.marks1.find(m => m.k === id), truth = d1.find(s => s.id === id);
      const p1 = mine ? {x: mine.x, y: mine.y} : {x: truth.x, y: truth.y};
      return {id, p1, label: i === 0 ? '★ 내 흑점' : '★ 보너스', lat: truth.lat};
    });
    S.find = {idx: 0, misses: 0, targets, results: [], calc: null};
    S.board.setSun(sun, sun.dt);
    S.board.marks = [];
    S.board.sheet = {marks: S.marks1, stars: [{x: targets[0].p1.x, y: targets[0].p1.y, label: targets[0].label}]};
    S.board.labels = true;
    setStage('find');
  }
  function renderFindControls() {
    const c = $('controls'), f = S.find;
    if (!f) { c.innerHTML = ''; return; }
    if (!f.calc) {
      c.innerHTML = `<div class="row"><button type="button" id="find-hint">💡 위도선 힌트</button></div>`;
      $('find-hint').onclick = () => { const t = f.targets[f.idx]; S.board.latGuide = t.p1.y; $('find-hint').disabled = true; };
      return;
    }
    const m = f.calc, dt = S.sun.dt;
    c.innerHTML = `<div class="calc">
      <div>위도 약 <b>${fmt(Math.abs(m.lat), 0)}°${m.lat >= 0 ? 'N' : 'S'}</b> · Δt = <b>${dt}일</b> · R′ = ${m.Rp.toFixed(2)}R</div>
      <div class="eq">α = sin⁻¹(x/R′) = sin⁻¹(${m.x.toFixed(2)}/${m.Rp.toFixed(2)}) = ${m.alpha.toFixed(1)}°</div>
      <div class="eq">β = sin⁻¹(y/R′) = sin⁻¹(${m.y.toFixed(2)}/${m.Rp.toFixed(2)}) = ${m.beta.toFixed(1)}°</div>
      <div class="eq">θ = ${m.sameSide ? '|β − α|' : 'α + β'} = ${m.theta.toFixed(1)}°   →   θ : Δt = 360° : P</div>
      <div>자전 주기 P = 360° × ${dt}일 ÷ ${m.theta.toFixed(1)}° = <b class="P">${m.P.toFixed(1)}일</b></div>
      <small>그 위도의 실제 값 ≈ ${m.Ptrue.toFixed(1)}일 · 오차 ${fmt(Math.abs(m.P - m.Ptrue) / m.Ptrue * 100, 0)}%</small>
    </div>
    <div class="row">${f.idx === 0 && f.targets[1] ? '<button type="button" class="btn-sun" id="find-more">⭐ 보너스 흑점도 재기</button>' : ''}<button type="button" class="btn-go" id="find-done">완료</button></div>`;
    const more = $('find-more');
    if (more) more.onclick = () => {
      f.idx = 1; f.calc = null; f.misses = 0;
      const t = f.targets[1];
      S.board.calc = null; S.board.latGuide = null;
      S.board.sheet.stars.push({x: t.p1.x, y: t.p1.y, label: t.label});
      $('m-text').innerHTML = '두 번째 ★ 흑점은 위도가 달라요. 같은 방법으로 찾아 보세요 — 자전 주기도 다를까요?';
      renderControls(); layout();
    };
    $('find-done').onclick = () => { S.board.calc = null; S.find.calc = null; setStage('done2'); setTimeout(() => { if (S.stage === 'done2') showR2(); }, 500); };
  }
  function tapFind(px, py, d) {
    const f = S.find;
    if (!f || f.calc) return;
    const t = f.targets[f.idx], b = S.board;
    const h = M.hitTest(b.spots, d.x, d.y, 13 / b.R);
    if (!h) { Sound.play('tap'); toast('거기엔 흑점이 없어요'); return; }
    if (h.spot.id !== t.id) {
      f.misses++;
      addScore(M.SCORE.wrongSpot, `${M.SCORE.wrongSpot}`, px, py);
      Sound.play('bad');
      toast(f.misses >= 2 ? '같은 위도를 따라가 보세요 — 주황 점선!' : '그 흑점이 아니에요. ★과 같은 높이(위도)에서 서쪽으로!');
      if (f.misses >= 2) b.latGuide = t.p1.y;
      return;
    }
    // 손가락으로 찍은 자리는 흑점 중심에서 조금 벗어난다. 원반 가장자리에서는 그 오차가 크게 불어나므로
    // 중심 쪽으로 70% 당긴 자리로 잰다(그래도 사람마다 조금씩 다른 값이 나온다).
    const pull = (p, c) => ({x: c.x + 0.3 * (p.x - c.x), y: c.y + 0.3 * (p.y - c.y)});
    const t1 = M.spotsOn(S.sun, 0).find(s => s.id === t.id);
    const p1 = t1 ? pull(t.p1, t1) : t.p1, p2 = pull(d, h.spot);
    let m = M.measureRotation(p1, p2, S.sun.dt);
    if (!(m.P > 3 && m.P < 120) || m.backwards) m = M.measureRotation(t1 || t.p1, {x: h.spot.x, y: h.spot.y}, S.sun.dt);
    const Ptrue = M.rotationPeriod(t.lat);
    m.Ptrue = Ptrue;
    const p = M.SCORE.find + M.rotScore(m.P, Ptrue);
    addScore(p, `+${p}`, px, py, '#16a34a');
    Sound.play('fanfare');
    event(`⭐ ${m.P.toFixed(1)}일`, '#ffd43b');
    f.calc = m;
    f.results[f.idx] = {lat: +m.lat.toFixed(2), P: +m.P.toFixed(2), x2: +p2.x.toFixed(3), y2: +p2.y.toFixed(3)};
    const rot = {}; f.results.forEach((r, i) => { if (r) rot[i ? 'b' : 'a'] = r; });
    send({rot});
    const star = b.sheet.stars[f.idx];
    star.done = true; star.x = p1.x; star.y = p1.y; star.to = {x: p2.x, y: p2.y};
    b.calc = {yLat: (p1.y + p2.y) / 2, Rp: m.Rp, p1, p2};
    b.latGuide = null;
    $('m-text').innerHTML = '교과서 60쪽처럼 <b>중앙 경선</b>에서 두 위치까지의 거리 x, y 로 흑점이 돈 각도 θ를 구했어요.';
    renderControls(); layout();
  }

  // ── 플레어 ──────────────────────────────────────────────
  function startFlareSeq() {
    hideOverlay();
    S.overlayFor = 'flare';
    showOverlay(`<h2>⚡ 플레어 경보!</h2><p>태양 관측 위성에서 경보가 왔어요. 망원경에 <b>Hα 필터</b>를 끼우고 채층을 보세요. 곧 흑점 무리 근처에서 폭발이 일어나요!</p>`);
    $('ov-card').classList.add('alarm');
    Sound.play('alarm'); buzz([200, 100, 200, 100, 200]);
    document.body.dataset.shake = '1'; setTimeout(() => { delete document.body.dataset.shake; }, 800);
    S.aligned = true; S.motor = true; S.tel = {az: S.sun.sky[0].az, alt: S.sun.sky[0].alt};
    setTimeout(() => { $('ov-card').classList.remove('alarm'); hideOverlay(); startFlare(); }, 2600);
  }
  function startFlare() {
    const sun = S.sun, g = sun.groups.find(x => x.id === sun.flareGroup);
    const sp = M.spotsOn(sun, sun.dt).filter(s => s.g === g.id);
    const fx = sp.reduce((a, s) => a + s.x, 0) / sp.length, fy = sp.reduce((a, s) => a + s.y, 0) / sp.length;
    const delay = rand(1800, 4200);
    S.flare = {x: fx, y: fy, start: S.store.now() + delay, done: false};
    const b = S.board;
    b.setSun(sun, sun.dt, 'ha');
    b.sheet = null; b.calc = null; b.marks = []; b.latGuide = null; b.labels = true; b.reveal = null; b.hint = null;
    b.flare = {x: fx, y: fy, t0: performance.now() + delay};
    setStage('flare');
  }
  function tapFlare(px, py) {
    const f = S.flare;
    if (!f || f.done) return;
    const now = S.store.now();
    if (now < f.start) { toast('아직 조용해요… 잘 지켜보세요!'); return; }
    const d = S.board.toDisk(px, py);
    if (Math.hypot(d.x - f.x, d.y - f.y) > 0.16) { Sound.play('tap'); toast('거기는 아니에요!'); return; }
    f.done = true;
    const sec = (now - f.start) / 1000, p = M.flareScore(sec);
    addScore(p, `⚡ +${p}`, px, py, '#f59f00');
    Sound.play('fanfare'); buzz([30, 40, 30]);
    event(`⚡ ${sec.toFixed(1)}초!`, '#ffd43b');
    send({fl: {ok: 1, s: +sec.toFixed(2)}});
    flareFact(`⚡ ${sec.toFixed(1)}초 만에 찾았어요! +${p}`);
  }
  function flareFact(head) {
    $('controls').innerHTML = `<button class="primary big" id="go-night">🌌 그날 밤으로 ▶</button><p class="fact"><b>${head}</b><br>플레어는 흑점 근처의 강한 자기장 에너지가 갑자기 터지는 폭발이에요. 빛(X선·자외선)은 약 <b>8분 20초</b> 만에 지구에 와서 통신을 방해하고(델린저 현상), 함께 뿜어진 코로나 물질은 <b>1~3일 뒤</b> 도착해 자기 폭풍과 <b>오로라</b>를 일으켜요.</p>`;
    $('go-night').onclick = startNight;
  }

  // ── 오로라 밤 ────────────────────────────────────────────
  function topNow(n = 3) {
    return onlineList(S.players, S.store.now(), S.store.uid).sort((a, b) => pts(b[1]) - pts(a[1])).slice(0, n).map(([id, p]) => ({id, name: p.name, team: p.team, sc: pts(p)}));
  }
  function startNight() {
    setStage('night');
    hideOverlay();
    S.nightT = performance.now();
    if (S.world) {
      S.world.setNight(1); S.world.setAurora(1); S.world.setCamera('north');
      setTimeout(() => {
        if (S.stage !== 'night') return;
        const top = topNow();
        if (top.length) { S.world.showPodium(top); S.world.setCamera('podium'); }
      }, 6500);
    }
    Sound.play('fanfare');
    setTimeout(() => { if (S.stage === 'night') showFinal(); }, 1800);
  }
  function showFinal() {
    S.overlayFor = 'night';
    const list = onlineList(S.players, S.store.now(), S.store.uid).sort((a, b) => pts(b[1]) - pts(a[1]));
    const rank = list.findIndex(([id]) => id === S.store.uid) + 1;
    const teams = M.TEAMS.map((t, i) => {
      const ms = list.filter(([, p]) => p.team === i);
      return {t, n: ms.length, avg: ms.length ? ms.reduce((a, [, p]) => a + pts(p), 0) / ms.length : 0};
    }).filter(x => x.n).sort((a, b) => b.avg - a.avg);
    showOverlay(`<h2>🌌 오늘의 관측 끝!</h2>
      <p>지금 접속한 ${list.length}명 중 <b class="big-num">${rank || '-'}</b>위 · <b>${S.score}</b>점</p>
      <p class="small">모둠 순위: ${teams.map((x, i) => `${i + 1}. ${x.t.icon} ${x.t.name} ${Math.round(x.avg)}`).join(' · ')}</p>
      <p class="fact"><b>오로라</b>는 태양에서 날아온 전기를 띤 입자가 지구 자기장을 따라 극지방 대기로 들어와 빛을 내는 현상이에요. 2024년 5월 강한 태양 폭풍 때는 <b>우리나라에서도 붉은 오로라</b>가 사진에 찍혔어요.</p>
      <button class="primary big" id="again">🔁 한 번 더 관측하기 (최고 점수는 남아요)</button><button class="ghost" data-close>오로라 구경하기</button>`, null, true);
    $('again').onclick = () => { hideOverlay(); restartRun(); };
  }
  function restartRun() {
    S.best = Math.max(S.best, S.score);
    S.score = 0; $('st-score').textContent = '0';
    send({best: S.best, sc: 0, hits: 0, mk: null, d1: null, rot: null, fl: null, al: false, cap: false, skT: null});
    if (S.world) { S.world.setNight(0); S.world.setAurora(0); S.world.hidePodium(); S.world.setCamera('me'); }
    resetLocal();
    setStage('prep');
  }

  // ── 덮개 카드 ────────────────────────────────────────────
  function showOverlay(html, onClose, clear) {
    const ov = $('overlay');
    $('ov-card').innerHTML = html;
    $('ov-card').classList.remove('alarm');
    ov.hidden = false;
    ov.classList.toggle('clear', !!clear);
    $('ov-card').querySelectorAll('[data-close]').forEach(b => b.onclick = () => { ov.hidden = true; S.overlayFor = null; if (onClose) onClose(); });
  }
  const hideOverlay = () => { $('overlay').hidden = true; S.overlayFor = null; };
  function showIntro() {
    const n = onlineList(S.players, S.store.now(), S.store.uid).length;
    S.overlayFor = 'intro';
    showOverlay(`<h2>🔭 오늘의 관측 임무</h2>
      <p>${S.offline ? '가상 친구들과 연습하는 관측소예요.' : `지금 <b>${n}명</b>이 같은 관측소에서 관측하고 있어요. 친구들의 망원경 빛줄기가 보이죠?`}</p>
      <div class="fact">① 🧢 안전 준비 → 🎯 그림자로 조준 → 🔍 초점 → 🧭 동서 정하기 → ✏️ 흑점 스케치<br>② ⏩ ${S.sun.dt}일 뒤 다시 관측해 내 흑점(★)으로 <b>태양의 자전 주기</b> 재기<br>③ ⚡ 플레어 경보 → 🌌 오로라 밤</div>
      <p class="small">모두 같은 태양을 봐요. 반 친구들이 찾은 흑점이 모이면 <b>🏆 황금 망원경</b>이 열려요!</p>
      <button class="primary big" id="start-run">관측 시작!</button>`);
    $('start-run').onclick = () => { hideOverlay(); Sound.unlock(); setStage('prep'); };
  }
  function classStats1() {
    const list = onlineList(S.players, S.store.now(), S.store.uid).map(([, p]) => p).filter(p => p.d1);
    const n = M.spotsOn(S.sun, 0).length;
    const avg = list.length ? list.reduce((a, p) => a + p.d1.f, 0) / list.length : 0;
    return {n, players: list.length, avg, perfect: list.filter(p => p.d1.f >= p.d1.n).length, fooled: list.filter(p => p.d1.d > 0).length};
  }
  function showR1() {
    S.overlayFor = 'r1';
    const cs = classStats1(), groups = S.sun.groups.length, d1 = M.spotsOn(S.sun, 0);
    S.board.setSun(S.sun, 0); S.board.sheet = null; S.board.marks = S.marks1; S.board.labels = true;
    S.board.reveal = d1.filter(s => !S.found.has(s.id));
    showOverlay(`<h2>📊 1일째 관측 결과</h2>
      <div class="stat-row"><div class="stat"><small>내가 찾은 흑점</small><b>${S.found.size}/${cs.n}</b></div><div class="stat"><small>친구들 평균 (${cs.players}명)</small><b>${cs.avg.toFixed(1)}</b></div><div class="stat"><small>완벽 관측</small><b>${cs.perfect}명</b></div></div>
      <p class="fact">오늘 태양에는 흑점 무리가 <b>${groups}개</b>, 흑점이 <b>${cs.n}개</b> 있었어요(놓친 흑점은 투영판에 주황 점선). 흑점은 대부분 이렇게 <b>무리 지어</b> 나타나요.</p>
      <p class="fact">흑점이 검게 보이는 까닭: 주변 광구(약 <b>5800 K</b>)보다 온도가 낮아서(<b>4000~5000 K</b>) 덜 밝기 때문이에요. 가장자리가 어두운 것은 <b>주연 감광</b>!</p>
      <p class="fact">렌즈 먼지에 속은 친구 <b>${cs.fooled}명</b> — 먼지는 상이 움직여도 제자리, 흑점은 태양과 함께 움직여요.</p>
      <button class="primary big" id="ov-day2">⏩ ${S.sun.dt}일 뒤 다시 관측하기</button><button class="ghost" data-close>투영판 다시 보기</button>`);
    $('ov-day2').onclick = goDay2;
  }
  function rotPoints() {
    const out = [];
    onlineList(S.players, S.store.now(), S.store.uid).forEach(([id, p]) => { if (p.rot) ['a', 'b'].forEach(k => { if (p.rot[k]) out.push(Object.assign({team: p.team, me: id === S.store.uid}, p.rot[k])); }); });
    return out;
  }
  function showR2() {
    S.overlayFor = 'r2';
    const list = rotPoints(), sum = M.rotationSummary(list);
    const mine = ((S.find && S.find.results) || []).filter(Boolean);
    showOverlay(`<h2>📈 우리가 잰 태양의 자전 주기</h2>
      <canvas id="ov-scatter" width="640" height="440"></canvas>
      <div class="stat-row"><div class="stat"><small>적도 쪽 (|위도|&lt;15°)</small><b>${sum.low ? sum.low.toFixed(1) + '일' : '—'}</b></div><div class="stat"><small>고위도 (22° 이상)</small><b>${sum.high ? sum.high.toFixed(1) + '일' : '—'}</b></div></div>
      ${mine.length ? `<p class="small">내 측정: ${mine.map(r => `위도 ${fmt(Math.abs(r.lat), 0)}° → <b>${r.P.toFixed(1)}일</b>`).join(' · ')}</p>` : ''}
      <p class="fact"><b>적도 쪽이 고위도보다 빨리 돌아요(차등 자전).</b> 단단한 고체라면 어디나 같은 주기로 돌겠죠? 태양이 <b>기체</b>로 되어 있다는 증거예요. 교과서: 적도 약 25일, 고위도(60° 부근) 30일 이상.</p>
      <button class="primary big" id="ov-flare">⚡ 계속하기</button><button class="ghost" data-close>닫기</button>`);
    drawScatter($('ov-scatter'), list, true);
    $('ov-flare').onclick = startFlareSeq;
  }

  // ── 처음 시작 / 새로고침해서 돌아왔을 때 ──────────────────────────────
  function resetLocal() {
    S.marks1 = []; S.found = new Set(); S.dust = 0; S.combo = 0; S.prep = new Set(); S.eye = false; S.dirTries = 0; S.dirArmed = 0;
    S.find = null; S.flare = null; S.aligned = false; S.motor = true; S.lockAnim = null;
    S.focus = S.pers.fStart; S.tel = {az: S.pers.aim0.az, alt: S.pers.aim0.alt};
    const b = S.board;
    b.setSun(S.sun, 0); b.marks = []; b.sheet = null; b.calc = null; b.labels = false; b.flare = null; b.reveal = null; b.latGuide = null; b.hint = null;
  }
  function snapToSun() { S.tel = {az: S.sun.sky[0].az, alt: S.sun.sky[0].alt}; }
  function resume(old) {
    resetLocal();
    const st = old && old.st;
    if (!st || st === 'lobby' || st === 'prep' || st === 'aim') { showIntro(); return; }
    if (old.mk) {
      S.marks1 = M.decodeMarks(old.mk).map(m => Object.assign(m, {t: 0}));
      S.marks1.forEach(m => { if (typeof m.k === 'number') S.found.add(m.k); else if (m.k === 'd') S.dust++; });
      S.board.marks = S.marks1;
    }
    S.prep = new Set(['cap', 'plate', 'sheet']); S.aligned = true; S.motor = true; snapToSun();
    toast('다시 왔네요! 하던 곳부터 이어서 해요', 2200);
    if (st === 'focus' || st === 'dir' || st === 'sketch') {
      if (st !== 'focus') { S.focus = S.pers.f0; S.board.labels = true; }
      if (st === 'sketch') { S.skT0 = old.skT && S.store.now() - old.skT < M.SKETCH_SEC * 1000 ? old.skT : S.store.now() - (M.SKETCH_SEC - 30) * 1000; }
      setStage(st);
    } else if (st === 'done1') { S.focus = S.pers.f0; setStage('done1'); showR1(); }
    else if (st === 'aim2' || st === 'find') { S.focus = S.pers.f0; goDay2(); }
    else if (st === 'done2') {
      S.focus = S.pers.f0;
      if (old.rot) S.find = {results: [old.rot.a, old.rot.b].filter(Boolean), targets: [], idx: 0};
      S.board.setSun(S.sun, S.sun.dt); setStage('done2');
    } else if (st === 'flare') { S.focus = S.pers.f0; if (old.fl) startNight(); else startFlareSeq(); }
    else if (st === 'night') { S.focus = S.pers.f0; startNight(); }
    else showIntro();
  }

  // ── 매 장면 ───────────────────────────────────────────────
  function studentLoop() {
    let lastPlate = 0, lastPlayers = 0, prevT = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now(), dt = Math.min(0.1, (now - prevT) / 1000);
      prevT = now;
      const sky = S.sun.sky[0];
      // 추적 모터를 끄면(방향 정하기) 망원경은 그대로인데 태양이 서쪽으로 가므로, 상이 서쪽으로 흘러간다
      if (!S.motor) S.tel.az -= M.DRIFT * dt;
      if (S.lockAnim) {
        const k = clamp((now - S.lockAnim.t0) / 380, 0, 1), e = 1 - (1 - k) ** 3;
        S.tel.az = S.lockAnim.from.az + (sky.az - S.lockAnim.from.az) * e;
        S.tel.alt = S.lockAnim.from.alt + (sky.alt - S.lockAnim.from.alt) * e;
        if (k >= 1) {
          const dir = S.lockAnim.dir;
          S.tel = {az: sky.az, alt: sky.alt};
          if (dir) { S.lockAnim = null; S.motor = true; } else finishLock();
        }
      }
      const off = M.tubeOffset(S.tel, sky), b = S.board;
      let shx = 0, shy = 0;
      const sk = (now - S.shakeT) / 1000;
      if (sk < 0.8) { const a = Math.sin(sk * Math.PI * 5) * (1 - sk / 0.8) * 0.09; shx = a; shy = a * 0.4; }
      if (S.stage === 'flare') b.off = {x: 0, y: 0};
      else if (off.sep > 80) b.off = {x: 9, y: 0};
      else b.off = {x: off.x / M.SUN_RADIUS_DEG * M.BOARD_SUN + shx, y: off.y / M.SUN_RADIUS_DEG * M.BOARD_SUN + shy};
      b.mis = off.sep > 80 ? {x: 40 * Math.sign(off.x || 1), y: 0} : {x: off.x, y: off.y};
      b.blur = S.stage === 'flare' ? 0 : 40 * Math.abs(S.focus - S.pers.f0);
      if (b.blur < 0.6 && S.stage !== 'focus') b.blur = 0;
      b.dust = S.stage === 'flare' ? [] : S.pers.dust;
      if ((S.stage === 'aim' || S.stage === 'aim2') && !S.lockAnim && !S.aligned) {
        const r = off.sep / M.SUN_RADIUS_DEG;
        const mt = $('aim-meter');
        if (mt) {
          mt.style.width = (100 * (1 - clamp(Math.log10(Math.max(off.sep, 0.02) / 0.02) / Math.log10(60 / 0.02), 0, 1))) + '%';
          $('aim-deg').textContent = off.sep >= 10 ? `${off.sep.toFixed(0)}°` : `${off.sep.toFixed(2)}°`;
        }
        if (r < (S.drag ? 0.08 : M.ALIGN_TOL * 1.5)) lockAim();
        if (off.sep < 3) $('drag-hint').hidden = true;
      }
      if (S.stage === 'dir' && S.dirArmed && b.off.x > 1.35) S.tel = {az: sky.az, alt: sky.alt};  // 너무 멀리 흘러가면 다시 가운데에서
      if (S.stage === 'sketch') {
        const left = M.SKETCH_SEC - (S.store.now() - S.skT0) / 1000;
        $('sk-time').textContent = Math.max(0, Math.ceil(left));
        $('sk-bar').style.width = clamp(left / M.SKETCH_SEC * 100, 0, 100) + '%';
        $('sk-timer').classList.toggle('low', left < 10);
        if (left <= 0) finishSketch(false);
      }
      if (S.stage === 'flare' && S.flare && !S.flare.done && S.store.now() > S.flare.start + 25000) {
        S.flare.done = true;
        send({fl: {ok: 0}});
        S.board.hint = {x: S.flare.x, y: S.flare.y};
        flareFact('아쉬워요! 노란 동그라미가 플레어가 터진 곳이에요.');
      }
      // 망원경 방향 보내기 (돌릴 때만, 초당 3~4번)
      const moved = !S.lastAim || Math.abs(S.lastAim.az - S.tel.az) > 0.25 || Math.abs(S.lastAim.alt - S.tel.alt) > 0.25;
      if (moved && now - S.lastAimT > 280) { S.lastAim = {az: S.tel.az, alt: S.tel.alt}; S.lastAimT = now; send({az: +S.tel.az.toFixed(2), alt: +S.tel.alt.toFixed(2)}); }
      flush();
      b.draw(now);
      if (S.world) {
        S.world.setSun(sky);
        S.world.setMyAim(S.tel.az, S.tel.alt);
        if (now - lastPlate > 180) { lastPlate = now; S.world.plateDirty(); }
      }
      if (S.playersDirty && now - lastPlayers > 250) {
        lastPlayers = now; S.playersDirty = false;
        const list = onlineList(S.players, S.store.now(), S.store.uid);
        if (S.world) S.world.setPlayers(Object.fromEntries(list), S.store.uid);
        updateHud(list);
      }
    };
    tick();
  }
  function updateHud(list) {
    const sorted = list.slice().sort((a, b) => pts(b[1]) - pts(a[1]));
    const i = sorted.findIndex(([id]) => id === S.store.uid);
    $('st-rank').textContent = i >= 0 ? `${i + 1}/${sorted.length}` : '-';
    $('st-room').textContent = S.offline ? '혼자 연습 (가상 친구들)' : `오늘의 관측소 · ${list.length}명 접속`;
    const g = goalOf(list, S.sun), el = $('st-goal');
    el.hidden = S.stage === 'night';
    $('st-goal-bar').style.width = clamp(g.hits / g.goal * 100, 0, 100) + '%';
    $('st-goal-text').textContent = `흑점 ${g.hits}/${g.goal}`;
    el.classList.toggle('done', g.hits >= g.goal);
    if (!S.gold && g.hits >= g.goal && list.length >= 2) {
      S.gold = true;
      if (S.world) S.world.setGold(true);
      toast('🏆 우리 목표 달성! 모두의 망원경이 황금으로!', 3000); Sound.play('fanfare');
    }
  }

  // ── 자전 주기 산점도 (학생 결과 카드·전광판이 같이 쓴다) ─────────────────
  function drawScatter(cv, list, compact) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    const L = 64, R = 18, T = 26, B = 54, P0 = 22, P1 = 30;
    const X = lat => L + (lat / 40) * (W - L - R), Y = P => T + (1 - (clamp(P, P0, P1) - P0) / (P1 - P0)) * (H - T - B);
    x.fillStyle = '#0b1626'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 1;
    x.font = `700 ${compact ? 15 : 16}px Pretendard, system-ui, sans-serif`; x.fillStyle = '#9fb3c8';
    for (let P = P0; P <= P1; P += 1) { x.beginPath(); x.moveTo(L, Y(P)); x.lineTo(W - R, Y(P)); x.stroke(); x.textAlign = 'right'; x.fillText(P, L - 8, Y(P) + 5); }
    for (let l = 0; l <= 40; l += 10) { x.beginPath(); x.moveTo(X(l), T); x.lineTo(X(l), H - B); x.stroke(); x.textAlign = 'center'; x.fillText(l + '°', X(l), H - B + 22); }
    x.fillStyle = '#c4d3e3'; x.textAlign = 'center'; x.fillText('흑점의 위도 (북·남 상관없이)', (L + W - R) / 2, H - 10);
    x.save(); x.translate(18, (T + H - B) / 2); x.rotate(-Math.PI / 2); x.fillText('자전 주기 (일)', 0, 0); x.restore();
    x.strokeStyle = '#ff8a1a'; x.lineWidth = 3; x.beginPath();
    for (let l = 0; l <= 40; l += 1) { const P = M.rotationPeriod(l); if (l) x.lineTo(X(l), Y(P)); else x.moveTo(X(l), Y(P)); }
    x.stroke();
    x.fillStyle = '#ff8a1a'; x.textAlign = 'left'; x.fillText('실제 태양', X(30) - 20, Y(M.rotationPeriod(30)) - 12);
    list.forEach(p => {
      if (!(p.P > 18 && p.P < 38)) return;
      x.fillStyle = team(p.team).color;
      x.beginPath(); x.arc(X(Math.abs(p.lat)), Y(p.P), p.me ? 9 : 6, 0, 7); x.fill();
      x.strokeStyle = p.me ? '#fff' : 'rgba(0,0,0,.4)'; x.lineWidth = p.me ? 3 : 1; x.stroke();
    });
    if (!list.length) { x.fillStyle = '#9fb3c8'; x.textAlign = 'center'; x.fillText('아직 자료가 없어요', W / 2, H / 2); }
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   관측소 전광판 (TV·프로젝터)
  // ╚══════════════════════════════════════════════════════════╝
  const T = {store: null, base: '', day: '', sun: null, players: {}, world: null, bots: null, lastEv: {}, dirty: false, hostBoard: null, card: 0, cardT: 0, gold: false};

  async function openBoardView(demo) {
    let store;
    try { store = await openStore(demo ? 'demo' : 'world'); }
    catch (e) { $('server-note').textContent = e.message || String(e); $('server-note').classList.add('error'); return; }
    const day = dayKeyOf(store.now());
    Object.assign(T, {store, day, base: `${ROOT}/${day}`, sun: sunOf(seedOf(day))});
    history.replaceState(null, '', '?board' + (demo ? '&demo' : '') + (LOCAL_ONLY ? '&local' : ''));
    document.body.dataset.screen = 'teacher';
    Wake.on();
    $('t-url').textContent = PAGE_URL.replace(/^https?:\/\//, '');
    $('t-url-big').textContent = PAGE_URL.replace(/^https?:\/\//, '');
    drawQR($('t-qr'), PAGE_URL); drawQR($('t-qr-small'), PAGE_URL);
    if (window.SunspotWorld && window.THREE) { try { T.world = new window.SunspotWorld($('t-3d'), {mode: 'host'}); if (!T.world.ok) T.world = null; } catch (e) { console.warn(e); } }
    T.hostBoard = new window.SunspotBoard(document.createElement('canvas'), {size: 600});
    store.on(T.base + '/players', v => { T.players = v || {}; T.dirty = true; }, e => {
      if (isDenied(e)) showBanner('실시간 관측소가 아직 열리지 않았어요', 'Firebase 규칙(sunspot)을 게시해 주세요', true);
    });
    store.onStatus(ok => { $('t-conn').className = 'conn ' + (ok ? 'on' : 'off'); });
    $('t-fullscreen').onclick = () => { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen(); };
    $('t-qr-btn').onclick = () => $('screen-teacher').classList.toggle('qr-big');
    $('t-room').onclick = () => $('screen-teacher').classList.toggle('qr-big');
    if (demo) { T.bots = new Bots(store, T.base, 20, T.sun); T.bots.start(); }
    if (T.world) T.world.setSun(T.sun.sky[0]);
    boardLoop();
  }
  function showBanner(title, sub, alarm) {
    const b = $('t-banner');
    b.innerHTML = `${esc(title)}<small>${esc(sub)}</small>`;
    b.classList.toggle('alarm-text', !!alarm);
    b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(b._h); b._h = setTimeout(() => { b.hidden = true; }, 3200);
  }
  function feed(text, color) {
    const box = $('t-feed'), d = document.createElement('div');
    d.textContent = text; if (color) d.style.borderColor = color;
    box.prepend(d);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => d.remove(), 4100);
  }
  const STAGE_KEYS = ['prep', 'aim', 'focus', 'dir', 'sketch', 'done1', 'aim2', 'find', 'done2', 'flare', 'night'];
  function renderBoardView() {
    const now = T.store.now(), list = onlineList(T.players, now, null);
    $('t-count').textContent = list.length;
    $('t-lobby').hidden = !(list.length === 0 || $('screen-teacher').classList.contains('qr-big'));
    // 순위
    const ranked = list.slice().sort((a, b) => pts(b[1]) - pts(a[1]));
    $('t-board').innerHTML = ranked.slice(0, 10).map(([, p], i) => `<li><span class="rk">${i + 1}</span><span class="dot" style="background:${team(p.team).color}"></span><span class="nm">${esc(p.name)}</span><span class="st">${(M.STAGES[p.st] || {}).icon || ''}</span><span class="sc">${pts(p)}</span></li>`).join('') || '<li><span class="nm">아직 아무도 없어요</span></li>';
    const tavg = M.TEAMS.map((t, i) => { const ms = list.filter(([, p]) => p.team === i); return {t, n: ms.length, avg: ms.length ? ms.reduce((a, [, p]) => a + pts(p), 0) / ms.length : 0}; });
    const maxAvg = Math.max(1, ...tavg.map(x => x.avg));
    $('t-teambars').innerHTML = tavg.map(x => `<div><span>${x.t.icon} ${x.t.name}</span><i><b style="width:${x.avg / maxAvg * 100}%;background:${x.t.color}"></b></i><em>${x.n ? Math.round(x.avg) : '-'}</em></div>`).join('');
    $('t-stage').innerHTML = STAGE_KEYS.filter(k => k !== 'done1' && k !== 'done2').map(k => {
      const n = list.filter(([, p]) => p.st === k || (k === 'sketch' && p.st === 'done1') || (k === 'find' && p.st === 'done2')).length;
      return `<span class="chip${n ? '' : ' zero'}" title="${M.STAGES[k].label}">${M.STAGES[k].icon} <b>${n}</b></span>`;
    }).join('');
    renderBoardLeft(list);
  }
  // 왼쪽 판: 흑점 지도 → 자전 주기 → 플레어 기록을 12초마다 돌아가며 보여 준다
  function renderBoardLeft(list) {
    const box = $('t-left'), now = performance.now();
    box.hidden = list.length === 0;
    if (!list.length) return;
    const rotPts = [];
    list.forEach(([, p]) => { if (p.rot) ['a', 'b'].forEach(k => { if (p.rot[k]) rotPts.push(Object.assign({team: p.team}, p.rot[k])); }); });
    const flares = list.map(([, p]) => p).filter(p => p.fl && p.fl.ok).sort((a, b) => a.fl.s - b.fl.s);
    const cards = ['map'];
    if (rotPts.length) cards.push('rot');
    if (flares.length) cards.push('flare');
    if (now - T.cardT > 12000) { T.cardT = now; T.card = (T.card + 1) % cards.length; }
    const card = cards[T.card % cards.length];
    if (box.dataset.card !== card) {
      box.dataset.card = card;
      box.innerHTML = {
        map: `<h3>✏️ 우리가 함께 그리는 흑점 지도</h3><canvas id="t-map" width="600" height="600"></canvas><div class="goal" id="t-goal"></div>`,
        rot: `<h3>📈 우리가 잰 태양의 자전 주기</h3><canvas id="t-scatter" class="wide" width="640" height="480"></canvas><div id="t-r2"></div>`,
        flare: `<h3>⚡ 플레어 반응 속도</h3><div id="t-fl"></div>`
      }[card] + `<div class="t-dots">${cards.map(c => `<i class="${c === card ? 'on' : ''}"></i>`).join('')}</div>`;
    }
    if (card === 'map') {
      drawClassMap($('t-map'), list);
      const g = goalOf(list, T.sun);
      $('t-goal').innerHTML = `<span>🏆 우리 목표: 흑점 ${g.hits} / ${g.goal}개 ${g.hits >= g.goal ? '— 달성! 황금 망원경 🎉' : ''}</span><i><b style="width:${clamp(g.hits / g.goal * 100, 0, 100)}%"></b></i>`;
    } else if (card === 'rot') {
      drawScatter($('t-scatter'), rotPts);
      const s = M.rotationSummary(rotPts);
      $('t-r2').innerHTML = `<ul class="big"><li>측정 <b>${s.n}개</b> · 적도 쪽(|위도| &lt; 15°) <b>${s.low ? s.low.toFixed(1) + '일' : '—'}</b> · 고위도(22° 이상) <b>${s.high ? s.high.toFixed(1) + '일' : '—'}</b></li>
        <li><b>적도가 더 빨리 돈다 → 차등 자전</b> → 태양은 기체</li><li>방법: θ : Δt = 360° : P (교과서 60쪽)</li></ul>`;
    } else if (card === 'flare') {
      $('t-fl').innerHTML = `<ol class="big">${flares.slice(0, 8).map(p => `<li>${team(p.team).icon} <b>${esc(p.name)}</b> — ${p.fl.s.toFixed(1)}초</li>`).join('')}</ol>
        <p class="hint">플레어의 빛은 약 8분 20초 만에 지구 도착(통신 장애), 코로나 물질 분출(CME)은 1~3일 뒤 도착 → 자기 폭풍·오로라</p>`;
    }
  }
  // 반 전체의 찍은 자리: 점이 겹칠수록 밝게 빛난다 (정답 그림은 보여 주지 않는다 — 아직 관측 중인 친구가 있으니)
  function drawClassMap(cv, list) {
    if (!cv) return;
    const x = cv.getContext('2d'), W = cv.width, R = W * 0.43, c = W / 2;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#0b1626'; x.fillRect(0, 0, W, W);
    const g = x.createRadialGradient(c, c, 0, c, c, R);
    g.addColorStop(0, '#2a3e5c'); g.addColorStop(1, '#17263c');
    x.fillStyle = g; x.beginPath(); x.arc(c, c, R, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,214,120,.5)'; x.lineWidth = 2; x.stroke();
    x.globalCompositeOperation = 'lighter';
    list.forEach(([, p]) => {
      M.decodeMarks(p.mk).forEach(mk => {
        const px = c + mk.x * R, py = c - mk.y * R;
        if (mk.k === 'd') { x.fillStyle = 'rgba(120,130,150,.5)'; x.fillRect(px - 2, py - 2, 4, 4); return; }
        x.fillStyle = 'rgba(255,190,80,.33)';
        x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill();
      });
    });
    x.globalCompositeOperation = 'source-over';
    x.font = '800 18px Pretendard, system-ui, sans-serif'; x.fillStyle = '#c4d3e3'; x.textAlign = 'center';
    x.fillText('북 N', c, 22); x.fillText('남 S', c, W - 10); x.textAlign = 'left'; x.fillText('동 E', 8, c + 6); x.textAlign = 'right'; x.fillText('서 W', W - 8, c + 6);
  }
  function boardLoop() {
    let last = 0;
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now();
      if (now - last < 300) return;
      last = now;
      const t = T.store.now(), list = onlineList(T.players, t, null);
      if (T.dirty) {
        T.dirty = false;
        if (T.world) T.world.setPlayers(Object.fromEntries(list), null);
        list.forEach(([id, p]) => {
          if (p.ev && p.ev.t && p.ev.t !== T.lastEv[id]) {
            const fresh = T.lastEv[id] !== undefined || t - p.ev.t < 5000;
            T.lastEv[id] = p.ev.t;
            if (fresh && t - p.ev.t < 8000) feed(`${team(p.team).icon} ${p.name}  ${p.ev.pop}`, p.ev.c);
          }
        });
        const g = goalOf(list, T.sun);
        if (!T.gold && g.hits >= g.goal && list.length >= 2) {
          T.gold = true;
          if (T.world) T.world.setGold(true);
          showBanner('🏆 우리 목표 달성!', '모두의 망원경이 황금으로', false);
          Sound.play('fanfare');
        }
      }
      renderBoardView();
    };
    tick();
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   가상 학생 (전광판 미리 보기·혼자 연습) — 각자 자기 속도로 끝까지 하고, 끝나면 한 번 더
  // ╚══════════════════════════════════════════════════════════╝
  class Bots {
    constructor(store, base, n, sun) { this.store = store; this.base = base; this.n = n; this.sun = sun; this.list = []; }
    start() {
      const names = M.BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      for (let k = 0; k < this.n; k++) {
        setTimeout(() => {
          const id = 'bot' + k + '_' + randInt().toString(36).slice(0, 4), now = this.store.now();
          const b = {id, name: '🤖' + names[k % names.length], team: k % 4, sc: 0, best: 0, skill: rand(0.55, 1), pers: M.personal(id, this.sun)};
          b.az = b.pers.aim0.az; b.alt = b.pers.aim0.alt;
          this.list.push(b);
          this.store.update(`${this.base}/players/${id}`, {name: b.name, team: b.team, on: true, seen: now, joined: now, az: b.az, alt: b.alt, sc: 0});
          this.go(b, 'prep', rand(1, 8), {});
        }, 400 + k * rand(300, 900));
      }
      this.timer = setInterval(() => this.tick(), 450);
    }
    go(b, st, wait, upd) { b.st = st; b.t0 = this.store.now(); b.next = b.t0 + wait * 1000; upd.st = st; }
    tick() {
      const now = this.store.now(), sun = this.sun, sky = sun.sky[0], n1 = M.spotsOn(sun, 0);
      for (const b of this.list) {
        const upd = {};
        const score = d => { b.sc = Math.max(0, b.sc + d); upd.sc = b.sc; };
        const pop = (text, c) => { upd.ev = {pop: text, c: c || '#ffd43b', t: now}; };
        const k = clamp((now - b.t0) / Math.max(1, b.next - b.t0), 0, 1), due = now >= b.next;
        if (Math.random() < 0.012) upd.em = {e: M.EMOJIS[Math.floor(Math.random() * M.EMOJIS.length)], t: now};
        if (b.st === 'prep' && due) { if (Math.random() < 0.12) { score(M.SCORE.eye); pop('🙈 태양 직접 봄!', '#ff6b6b'); } score(M.SCORE.prep); upd.cap = true; b.from = {az: b.az, alt: b.alt}; this.go(b, 'aim', rand(7, 26) / b.skill, upd); }
        else if (b.st === 'aim' || b.st === 'aim2') {
          const e = 1 - (1 - k) ** 2, wob = (1 - k) * 6;
          b.az = b.from.az + (sky.az - b.from.az) * e + Math.sin(now / 700 + b.skill * 9) * wob;
          b.alt = b.from.alt + (sky.alt - b.from.alt) * e + Math.cos(now / 900) * wob * 0.5;
          upd.az = +b.az.toFixed(2); upd.alt = +b.alt.toFixed(2);
          if (due) {
            const sec = (b.next - b.t0) / 1000;
            score(b.st === 'aim' ? M.aimScore(sec) : Math.round(M.aimScore(sec) / 2)); pop(`🎯 ${sec.toFixed(1)}초`); upd.al = true;
            b.az = sky.az; b.alt = sky.alt; upd.az = +sky.az.toFixed(2); upd.alt = +sky.alt.toFixed(2);
            if (b.st === 'aim') this.go(b, 'focus', rand(3, 10), upd); else this.go(b, 'find', rand(6, 22) / b.skill, upd);
          }
        } else if (b.st === 'focus' && due) { score(Math.round(rand(120, 200))); this.go(b, 'dir', rand(3, 8), upd); }
        else if (b.st === 'dir' && due) {
          score(Math.random() < 0.75 ? M.SCORE.dirFirst : M.SCORE.dirLater);
          this.go(b, 'sketch', rand(25, M.SKETCH_SEC - 3), upd);
          b.marks = []; b.found = 0; b.dust = 0;
          b.goalN = Math.round(n1.length * clamp(rand(0.5, 1.05) * b.skill + 0.15, 0.3, 1));
          b.order = n1.slice().sort(() => Math.random() - 0.5);
        } else if (b.st === 'sketch') {
          const want = Math.floor(k * b.goalN);
          let changed = false;
          while (b.found < want) {
            const s = b.order[b.found++];
            b.marks.push({x: s.x + rand(-0.012, 0.012), y: s.y + rand(-0.012, 0.012), k: s.id});
            score(M.SPOT_PTS[s.kind] + (Math.random() < 0.3 ? 15 : 0)); changed = true;
          }
          if (Math.random() < 0.015 && b.dust < 2) { const q = b.pers.dust[b.dust]; if (q) { b.marks.push({x: q.x / M.BOARD_SUN, y: q.y / M.BOARD_SUN, k: 'd'}); b.dust++; score(M.SCORE.dust); changed = true; } }
          if (changed) { upd.mk = M.encodeMarks(b.marks); upd.hits = b.found; }
          if (b.found >= 5 && b.found === want && Math.random() < 0.02) pop(`🔥 ${b.found}콤보!`, '#ff8a1a');
          if (due) { if (b.found >= n1.length) { score(M.SCORE.perfect); pop('💯 완벽 관측!'); } upd.d1 = {f: b.found, n: n1.length, d: b.dust}; this.go(b, 'done1', rand(4, 10), upd); }
        } else if (b.st === 'done1' && due) {
          const a = rand(0, 6.28), d = rand(4, 9);
          b.from = {az: sky.az + Math.cos(a) * d, alt: sky.alt + Math.sin(a) * d * 0.6}; b.az = b.from.az; b.alt = b.from.alt; upd.al = false;
          this.go(b, 'aim2', rand(5, 15) / b.skill, upd);
        } else if (b.st === 'find' && due) {
          const d2 = M.spotsOn(sun, sun.dt), rot = {};
          b.pers.track.forEach((id, i) => {
            if (i === 1 && Math.random() < 0.3) return;
            const s = d2.find(q => q.id === id); if (!s) return;
            const P = M.rotationPeriod(s.lat) * (1 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.05);
            rot[i ? 'b' : 'a'] = {lat: s.lat, P: +P.toFixed(2), x2: +s.x.toFixed(3), y2: +s.y.toFixed(3)};
            score(M.SCORE.find + M.rotScore(P, M.rotationPeriod(s.lat)));
            if (i === 0) pop(`⭐ ${P.toFixed(1)}일`);
          });
          upd.rot = rot; this.go(b, 'done2', rand(4, 9), upd);
        } else if (b.st === 'done2' && due) this.go(b, 'flare', rand(4, 14) / b.skill, upd);
        else if (b.st === 'flare' && due) {
          if (Math.random() < 0.85) { const s = (b.next - b.t0) / 1000 - 2.5; score(M.flareScore(Math.max(0.8, s))); upd.fl = {ok: 1, s: +Math.max(0.8, s).toFixed(2)}; pop(`⚡ ${Math.max(0.8, s).toFixed(1)}초!`); }
          else upd.fl = {ok: 0};
          this.go(b, 'night', rand(25, 50), upd);
        } else if (b.st === 'night') {
          if (Math.random() < 0.04) upd.em = {e: ['🎉', '😱', '🌌', '👍'][Math.floor(Math.random() * 4)], t: now};
          if (due) {
            b.best = Math.max(b.best, b.sc); b.sc = 0;
            Object.assign(upd, {best: b.best, sc: 0, hits: 0, mk: null, d1: null, rot: null, fl: null, al: false});
            b.from = {az: b.pers.aim0.az, alt: b.pers.aim0.alt}; b.az = b.from.az; b.alt = b.from.alt;
            this.go(b, 'prep', rand(2, 6), upd);
          }
        }
        if (!b.seenT || now - b.seenT > 15000) { b.seenT = now; upd.seen = now; }
        if (Object.keys(upd).length) this.store.update(`${this.base}/players/${b.id}`, upd);
      }
    }
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   처음 화면
  // ╚══════════════════════════════════════════════════════════╝
  const ENTRY = {team: null};
  async function liveCount() {
    // 처음 화면에서도 '지금 몇 명이 관측 중인지' 보여 준다 (온라인 게임처럼)
    const el = $('live-count');
    try {
      const store = await openStore('world');
      const base = `${ROOT}/${dayKeyOf(store.now())}`;
      store.on(base + '/players', v => {
        if (document.body.dataset.screen !== 'entry') return;
        const n = onlineList(v || {}, store.now(), null).length;
        el.innerHTML = `<i class="conn on"></i> 지금 <b>${n}명</b> 관측 중`;
      }, e => { el.innerHTML = isDenied(e) ? '⚠️ 실시간 관측소 준비 중 — 혼자 연습은 할 수 있어요' : ''; if (isDenied(e)) $('server-note').textContent = RULES_HELP; });
    } catch (e) { el.textContent = '⚠️ 서버에 연결하지 못했어요 — 혼자 연습은 할 수 있어요'; }
  }
  function initEntry() {
    Wake.init();
    const saved = pref('me', {name: '', team: null});
    ENTRY.team = saved.team;
    const picker = $('team-picker');
    picker.innerHTML = M.TEAMS.map((t, i) => `<button type="button" role="radio" aria-checked="${ENTRY.team === i}" style="--c:${t.color}" data-team="${i}"><span>${t.icon}</span>${t.name}</button>`).join('');
    picker.onclick = e => {
      const b = e.target.closest('button[data-team]'); if (!b) return;
      ENTRY.team = +b.dataset.team;
      for (const x of picker.querySelectorAll('button')) x.setAttribute('aria-checked', String(x === b));
    };
    $('join-name').value = saved.name || '';
    $('join-form').onsubmit = e => {
      e.preventDefault();
      const name = cleanName($('join-name').value), err = $('join-error');
      const fail = t => { err.textContent = t; err.hidden = false; };
      if (ENTRY.team == null) return fail('모둠을 골라 주세요.');
      if (!name) return fail('이름(별명)을 넣어 주세요.');
      $('join-btn').disabled = true; $('join-btn').textContent = '연결 중…';
      joinWorld(name, ENTRY.team, params.has('offline')).finally(() => { $('join-btn').disabled = false; $('join-btn').textContent = '관측소 입장 🔭'; });
    };
    $('open-board').onclick = () => openBoardView(false);
    $('open-demo').onclick = () => openBoardView(true);
    if (params.has('board')) openBoardView(params.has('demo'));
    else if (params.has('demo')) openBoardView(true);
    else {
      if (params.has('offline')) $('live-count').textContent = '🤖 혼자 연습: 가상 친구들과 함께해요 (서버 없이)';
      else if (LOCAL_ONLY) $('live-count').textContent = '🧪 같은 브라우저의 탭끼리만 연결';
      else liveCount();
      if (saved.name) $('join-btn').focus();
    }
  }

  if (params.has('debug')) window.__sunspot = {S, T, M};
  initEntry();
})();
