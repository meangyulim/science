/* 흑점 헌터스 — 다 같이 태양 관측 (학생 화면 · 선생님 화면 · 가상 학생).
   계산은 sunspot-model.js, 3D 관측소는 sunspot-world.js, 태양 투영판은 sunspot-board.js.

   실시간 공유는 캠퍼스 지진(sims/quake)과 같은 Firebase Realtime Database 를 쓴다.
   규칙은 sims/quake/database.rules.json 의 "sunspot" 부분 (콘솔에는 그 파일 전체를 붙여 넣는다).
   모두가 같은 seed 로 같은 태양을 만들기 때문에, 서버로는 망원경 방향·단계·점수·찍은 자리만 오간다.

   주소 뒤에 붙이는 것
     ?room=1234   학생: 그 방 번호를 미리 채운다 (QR 코드가 이 주소다)
     ?host=1234   선생님: 새로고침해도 열어 둔 방으로 돌아온다
     ?demo        가상 학생 20명과 미리 해 보기
     ?solo        학생 혼자 연습 (가상 친구 11명, 서버 없이)
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
  const ROOT = 'sunspot/rooms';
  const params = new URLSearchParams(location.search);
  const DB_URL = params.get('db') || FIREBASE.databaseURL;
  const LOCAL_ONLY = params.has('local');

  // ── 작은 도구들 ─────────────────────────────────────────────
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const entries = o => Object.entries(o || {});
  const randInt = () => Math.floor(Math.random() * 2 ** 31);
  const rand = (a, b) => a + Math.random() * (b - a);
  const team = i => M.TEAMS[i] || {name: '?', color: '#8a96a3', icon: '❔'};
  const fmt = (v, d = 1) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const pref = (k, d) => { try { const v = localStorage.getItem('sunspot:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('sunspot:' + k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 괜찮다 */ } };
  const sunCache = new Map();
  const sunOf = seed => { if (!sunCache.has(seed)) sunCache.set(seed, M.makeSun(seed)); return sunCache.get(seed); };
  const PHASES = ['lobby', 'd1', 'r1', 'd2', 'r2', 'flare', 'night'];
  const PHASE_NAME = {lobby: '대기실', d1: '1일째 관측', r1: '1일째 결과', d2: '며칠 뒤 관측', r2: '자전 주기 결과', flare: '⚡ 플레어 경보', night: '🌌 오로라 밤'};
  const dayOf = phase => (phase === 'lobby' || phase === 'd1' || phase === 'r1') ? 0 : 1;
  // 모두가 같은 하늘: 관측을 시작한 시각(meta.t0)부터 흐른 서버 시간으로 태양의 자리를 정한다
  function skyNow(meta, now) {
    const sun = sunOf(meta.seed), d = dayOf(meta.phase);
    return M.sunAt(sun.sky[d], meta.t0 ? (now - meta.t0) / 1000 : 0);
  }
  const activePlayers = (players, meta) => entries(players).filter(([, p]) => p && p.name && (!meta || p.r == null || p.r === meta.round));

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
      on: (p, cb) => D.onValue(ref(p), s => cb(s.val()), err => console.warn('[sunspot]', p, err.message)),
      onLeave: (p, o) => D.onDisconnect(ref(p)).update(o),
      onStatus: cb => D.onValue(ref('.info/connected'), s => cb(!!s.val()))
    };
  }
  async function openStore(kind) {
    if (kind === 'solo') return new LocalStore(false);
    if (LOCAL_ONLY) { const s = new LocalStore(true); await s.ready; return s; }
    try { return await firebaseStore(); }
    catch (e) {
      if (kind !== 'demo') throw e;
      const s = new LocalStore(true); await s.ready; return s;
    }
  }
  const isDenied = e => e && /permission|denied|PERMISSION/i.test(String(e.message || e.code || e));
  const RULES_HELP = 'Firebase 콘솔 → Realtime Database → 규칙에 sims/quake/database.rules.json 내용 전체를 붙여 넣고 게시해 주세요(흑점 헌터스용 "sunspot" 부분이 새로 들어 있어요).';

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
  const joinURL = code => location.origin + location.pathname + '?room=' + code;

  // ── 진행 (선생님 화면과 혼자 연습이 같이 쓴다) ──────────────────────────
  function nextLabel(meta) {
    const dt = sunOf(meta.seed).dt;
    return {lobby: '☀️ 1일째 관측 시작', d1: '📊 1일째 결과 공개', r1: `⏩ ${dt}일 뒤 다시 관측`, d2: '📈 자전 주기 결과',
      r2: '⚡ 플레어 경보!', flare: '🌌 그날 밤, 오로라', night: '🔁 새 태양으로 한 판 더'}[meta.phase];
  }
  function advance(store, base, meta, players, step = 1) {
    const i = PHASES.indexOf(meta.phase), now = store.now();
    if (step > 0 && meta.phase === 'night') {
      const round = (meta.round || 1) + 1, upd = {};
      entries(players).forEach(([id]) => {
        ['sc', 'hits', 'mk', 'd1', 'rot', 'fl', 'al', 'cap', 'ev', 'em'].forEach(k => { upd[`${id}/${k}`] = null; });
        upd[`${id}/st`] = 'lobby'; upd[`${id}/r`] = round;
      });
      return store.update(base + '/players', upd).then(() => store.update(base + '/meta', {phase: 'lobby', round, seed: randInt(), t0: now, flareAt: null, gold: null}));
    }
    const next = PHASES[clamp(i + step, 0, PHASES.length - 1)];
    const upd = {phase: next};
    if (next === 'd1' || next === 'd2') upd.t0 = now;
    if (next === 'flare') upd.flareAt = now + 4200;
    return store.update(base + '/meta', upd);
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   학생 화면
  // ╚══════════════════════════════════════════════════════════╝
  const S = {
    store: null, code: '', base: '', name: '', team: 0, meta: null, players: {}, round: null, solo: false,
    sun: null, pers: null, stage: 'lobby', stageT: 0,
    tel: {az: 140, alt: 12}, motor: false, focus: 0.5, aligned: false, lockAnim: null,
    marks1: [], found: new Set(), dust: 0, combo: 0, lastHit: 0, skT0: 0, perfect: false,
    dirTries: 0, dirArmed: 0, prep: new Set(), eye: false, aimT0: 0,
    find: null, flare: null, score: 0, pending: {}, lastFlush: 0, lastAim: null, lastAimT: 0,
    shakeT: -9, drag: null, world: null, board: null, emojiT: 0, joinedOK: false, gone: false, overlayFor: null
  };
  const STAGE_TEXT = {
    lobby: ['⏳ 대기실 — 곧 관측을 시작해요', '위 3D 화면을 끌어서 망원경을 돌려 보고, 오른쪽 이모지로 친구들에게 인사해 보세요!'],
    prep: ['🧢 안전 준비', '태양 관측 전에 꼭 할 일 <b>3가지</b>를 골라 누르세요. 하나는 <b>절대 하면 안 되는 일</b>이에요!'],
    aim: ['🎯 조준: 그림자를 동그랗게', '① 위 3D 화면을 끌어 망원경을 해 쪽으로 돌리고 ② <b>투영판을 끌어</b> 밝은 햇빛을 가운데로 — 그림자가 <b>동그랗게</b> 줄면 성공!'],
    focus: ['🔍 초점 맞추기', '초점 나사를 돌려 <b>태양 가장자리와 흑점이 가장 또렷할 때</b> ‘초점 맞음!’을 누르세요.'],
    dir: ['🧭 동서남북 정하기', '추적 모터를 잠깐 끄면 태양 상이 흘러가요. <b>상이 흘러가는 쪽이 서쪽!</b>'],
    sketch: ['✏️ 흑점 스케치', '흑점을 모두 찾아 찍으세요(꾹 누르면 돋보기). <b>렌즈 먼지</b>는 상이 흔들려도 제자리 — 찍으면 감점!'],
    done1: ['✅ 1일째 관측 끝!', '친구들을 기다리는 중… 이모지로 응원해 주세요. 선생님이 결과를 공개해요.'],
    aim2: ['🎯 며칠 뒤, 다시 조준', '관측 시각이 달라 태양의 자리가 바뀌었어요. 다시 그림자를 맞추세요.'],
    find: ['⭐ 내 흑점 추적', '투명 용지의 <b>★</b>은 지난번에 기록한 흑점. 오늘은 어디 있을까요? 흑점은 <b>같은 위도를 따라 서쪽(W)</b>으로 움직여요.'],
    done2: ['✅ 자전 주기 측정 끝!', '반 전체의 결과를 모으는 중이에요. 선생님 화면을 보세요!'],
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
    if (!S.store || S.gone) return;
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

  async function joinRoom(code, name, teamIdx, opts = {}) {
    const err = $('join-error');
    err.hidden = true;
    Sound.unlock(); Wake.on();
    try { S.store = opts.store || await openStore('student'); }
    catch (e) { err.textContent = e.message; err.hidden = false; return; }
    S.code = code; S.base = `${ROOT}/${code}`; S.name = name; S.team = teamIdx; S.solo = !!opts.solo;
    let meta = null;
    try { meta = await S.store.get(S.base + '/meta'); }
    catch (e) { err.textContent = isDenied(e) ? '서버가 흑점 헌터스 방을 아직 받아 주지 않아요. 선생님께 알려 주세요(Firebase 규칙). 그동안 “혼자 연습”으로 해 볼 수 있어요.' : (e.message || String(e)); err.hidden = false; return; }
    if (!meta) { err.textContent = `${code}번 방을 찾을 수 없어요. 방 번호를 다시 확인해 주세요.`; err.hidden = false; return; }
    if (!S.solo) setPref('me', {name, team: teamIdx});
    const me = S.base + '/players/' + S.store.uid;
    const old = await S.store.get(me).catch(() => null);
    const sameRound = old && old.r === meta.round;
    S.score = sameRound && old.sc ? old.sc : 0;
    const init = {name, team: teamIdx, on: true, joined: old && old.joined ? old.joined : S.store.now(), r: meta.round};
    if (!sameRound) Object.assign(init, {sc: 0, st: 'lobby'});
    try { await S.store.update(me, init); }
    catch (e) { err.textContent = isDenied(e) ? '서버가 입장을 막았어요. 선생님께 Firebase 규칙을 확인해 달라고 해 주세요.' : e.message; err.hidden = false; return; }
    S.round = meta.round;
    S.resume = sameRound ? old : null;
    S.store.onLeave(me, {on: false});
    S.store.onStatus(on => { $('st-conn').className = 'conn ' + (on ? 'on' : 'off'); if (on && S.joinedOK && !S.gone) S.store.update(me, {on: true}); });
    if (!S.solo) history.replaceState(null, '', '?room=' + code + (LOCAL_ONLY ? '&local' : ''));
    document.body.dataset.screen = 'student';
    $('st-name').textContent = `${team(teamIdx).icon} ${name}`;
    $('st-room').textContent = S.solo ? '혼자 연습' : `방 ${code} · ${team(teamIdx).name}`;
    $('st-team-dot').style.background = team(teamIdx).color;
    $('st-score').textContent = S.score;
    buildStudentUI();
    S.store.on(me, v => {
      if (v) { S.joinedOK = true; return; }
      if (S.joinedOK && !S.gone) { S.gone = true; showOverlay(`<h2>👋 관측소에서 나왔어요</h2><p>선생님이 명단에서 내보냈어요. 다시 들어오려면 새로고침해 주세요.</p>`); }
    });
    S.store.on(S.base + '/meta', v => onStudentMeta(v));
    S.store.on(S.base + '/players', v => { S.players = v || {}; S.playersDirty = true; });
    studentLoop();
  }

  // ── 화면 짜기 ────────────────────────────────────────────
  function buildStudentUI() {
    if (window.SunspotWorld && window.THREE) {
      try { S.world = new window.SunspotWorld($('st-3d'), {mode: 'student'}); if (!S.world.ok) S.world = null; } catch (e) { console.warn(e); S.world = null; }
    }
    if (!S.world) $('st-3d-wrap').style.background = 'linear-gradient(180deg,#5b8fd6,#cfe0f3 70%,#eef3f9)';
    S.board = new window.SunspotBoard($('board'));
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
  // 투영판 크기: 세로 화면이면 3D 를 위에 조금 남기고, 가로 화면이면 오른쪽 칸 높이에 맞춘다
  function layout() {
    const W = innerWidth, H = innerHeight, wide = W >= 760 && W >= H;
    // 단계마다 투영판 크기가 바뀌면 어지러우니, 아래 조작 칸 높이는 넉넉히 하나로 잡는다 (넘치면 칸이 스크롤된다)
    const st = S.stage, ctrl = 120;
    let bs;
    if (wide) bs = Math.min(H - 110 - ctrl, 620, W * 0.5);
    else bs = Math.min(W - 24, H - 140 - 76 - ctrl - 30, 580);
    document.documentElement.style.setProperty('--bs', Math.max(200, Math.floor(bs)) + 'px');
    if (S.board) S.board.resize();
  }

  function setStage(st) {
    if (S.stage === st && S.stageT) return;
    S.stage = st; S.stageT = performance.now();
    document.body.dataset.stage = st;
    send({st}); flush(true);
    const [title, text] = STAGE_TEXT[st] || ['', ''];
    $('m-title').textContent = title.replace('며칠', S.sun ? `${S.sun.dt}일` : '며칠');
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
    if (st === 'lobby') c.innerHTML = `<p class="small">👆 3D 화면을 끌어 망원경을 돌려 볼 수 있어요. 오늘 할 일: <b>조준 → 초점 → 방향 → 흑점 스케치</b>, 그리고 며칠 뒤 다시 관측!</p>`;
    else if (st === 'prep') {
      const acts = [
        {k: 'cap', i: '🧢', t: '파인더 뚜껑 닫기'}, {k: 'plate', i: '📋', t: '투영판 달기'},
        {k: 'sheet', i: '📄', t: '기록 용지(원) 끼우기'}, {k: 'eye', i: '👁', t: '접안렌즈로 태양 직접 보기'}
      ];
      const order = acts.map((a, i) => [a, M.hashStr(S.store.uid + a.k + S.round) % 97 + i * 0.01]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
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
    } else if (st === 'done1' || st === 'done2') renderWaiting();
    else if (st === 'find') renderFindControls();
    else if (st === 'flare') c.innerHTML = `<p class="small" id="flare-msg">밝아지는 곳을 찾아 누르세요!</p>`;
    else c.innerHTML = '';
  }

  // ── 3D 화면 끌기 = 망원경 크게 돌리기 ─────────────────────────────
  const canSlew = () => S.stage === 'lobby' || S.stage === 'aim' || S.stage === 'aim2';
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
    const b = S.board, sky = S.sky;
    if (!b || !sky) return;
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
    const sky = S.sky, from = {az: S.tel.az, alt: S.tel.alt};
    S.lockAnim = {from, t0: performance.now()};
    Sound.play('lock'); buzz(40);
  }
  function finishLock() {
    S.lockAnim = null;
    S.motor = true; S.aligned = true;
    send({al: true, az: +S.tel.az.toFixed(2), alt: +S.tel.alt.toFixed(2)});
    const sec = (performance.now() - S.aimT0) / 1000;
    let pts = M.aimScore(sec);
    if (S.stage === 'aim2') pts = Math.round(pts / 2);
    const c = S.board.imgCenter();
    addScore(pts, `+${pts}`, c.x, c.y - 30, '#16a34a');
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
    const pts = M.focusScore(err);
    addScore(pts, `+${pts}`, S.board.u, S.board.u, '#16a34a');
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
    const pts = S.dirTries === 1 ? M.SCORE.dirFirst : M.SCORE.dirLater;
    addScore(pts, `+${pts}`, S.board.S - 50, S.board.u, '#16a34a');
    Sound.play('good');
    S.board.labels = true;
    $('dir-arrows').hidden = true;
    $('m-text').innerHTML = '정답! 태양(과 모든 천체)은 일주 운동으로 동 → 서로 움직여요. 그래서 <b>상이 흘러가는 쪽 = 서쪽</b>.';
    S.lockAnim = {from: {az: S.tel.az, alt: S.tel.alt}, t0: performance.now(), dir: true};
    setTimeout(() => {
      if (S.stage !== 'dir') return;
      S.skT0 = S.store.now();
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
    const pts = M.SPOT_PTS[h.spot.kind] + M.comboBonus(S.combo);
    S.marks1.push({x: d.x, y: d.y, k: h.spot.id, t: now});
    b.marks = S.marks1;
    addScore(pts, `+${pts}`, px, py, '#16a34a');
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
  function sendMarks() {
    send({mk: M.encodeMarks(S.marks1.filter(m => m.k !== 'e')), hits: S.found.size});
  }
  function finishSketch(perfect) {
    if (S.stage !== 'sketch') return;
    const total = S.board.spots.length;
    if (perfect) {
      const left = Math.max(0, (S.meta.sk || M.SKETCH_SEC) - (S.store.now() - S.skT0) / 1000);
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
  }
  function renderWaiting() {
    const c = $('controls'), st = S.stage;
    let stats = '';
    if (st === 'done1') {
      const n = S.board && S.sun ? M.spotsOn(S.sun, 0).length : 0;
      stats = `<div class="stat-row"><div class="stat"><small>찾은 흑점</small><b>${S.found.size}/${n}</b></div><div class="stat"><small>먼지에 속음</small><b>${S.dust}</b></div><div class="stat"><small>내 점수</small><b>${S.score}</b></div></div>`;
    } else {
      const r = (S.find && S.find.results) || [];
      stats = `<div class="stat-row">${r.map(x => `<div class="stat"><small>위도 ${fmt(Math.abs(x.lat), 0)}° 흑점</small><b>${fmt(x.P)}일</b></div>`).join('')}<div class="stat"><small>내 점수</small><b>${S.score}</b></div></div>`;
    }
    c.innerHTML = stats + `<p class="small" id="wait-count"></p>` + (S.solo ? `<button class="primary big" id="solo-next">${esc(nextLabel(S.meta))} ▶</button>` : '');
    if (S.solo) $('solo-next').onclick = soloNext;
    updateWaitCount();
  }
  function updateWaitCount() {
    const el = $('wait-count');
    if (!el || !S.meta) return;
    const list = activePlayers(S.players, S.meta).filter(([, p]) => p.on !== false), goal = S.stage === 'done1' ? 'done1' : 'done2';
    const done = list.filter(([, p]) => p.st === goal).length;
    el.innerHTML = `친구들: <b>${done}/${list.length}명</b> 완료 · 선생님이 다음 단계를 열 때까지 이모지로 응원해요!`;
  }

  // ── 둘째 관측: 내 흑점 따라가기 ─────────────────────────────────
  function startFind() {
    const sun = S.sun, d1 = M.spotsOn(sun, 0);
    const targets = S.pers.track.map((id, i) => {
      const mine = S.marks1.find(m => m.k === id), truth = d1.find(s => s.id === id);
      const p1 = mine ? {x: mine.x, y: mine.y} : {x: truth.x, y: truth.y};
      return {id, p1, label: i === 0 ? '★ 내 흑점' : '★ 보너스', lat: truth.lat};
    });
    S.find = {idx: 0, misses: 0, targets, results: S.find && S.find.results ? S.find.results : [], calc: null};
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
    const same = m.sameSide;
    c.innerHTML = `<div class="calc">
      <div>위도 약 <b>${fmt(Math.abs(m.lat), 0)}°${m.lat >= 0 ? 'N' : 'S'}</b> · Δt = <b>${dt}일</b> · R′ = ${m.Rp.toFixed(2)}R</div>
      <div class="eq">α = sin⁻¹(x/R′) = sin⁻¹(${m.x.toFixed(2)}/${m.Rp.toFixed(2)}) = ${m.alpha.toFixed(1)}°</div>
      <div class="eq">β = sin⁻¹(y/R′) = sin⁻¹(${m.y.toFixed(2)}/${m.Rp.toFixed(2)}) = ${m.beta.toFixed(1)}°</div>
      <div class="eq">θ = ${same ? '|β − α|' : 'α + β'} = ${m.theta.toFixed(1)}°   →   θ : Δt = 360° : P</div>
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
    $('find-done').onclick = () => { S.board.calc = null; S.find.calc = null; setStage('done2'); };
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
    const pts = M.SCORE.find + M.rotScore(m.P, Ptrue);
    addScore(pts, `+${pts}`, px, py, '#16a34a');
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
  function startFlare() {
    const sun = S.sun, g = sun.groups.find(x => x.id === sun.flareGroup);
    const sp = M.spotsOn(sun, sun.dt).filter(s => s.g === g.id);
    const fx = sp.reduce((a, s) => a + s.x, 0) / sp.length, fy = sp.reduce((a, s) => a + s.y, 0) / sp.length;
    S.flare = {x: fx, y: fy, start: S.meta.flareAt + 1200, done: false};
    S.board.setSun(sun, sun.dt, 'ha');
    S.board.sheet = null; S.board.calc = null; S.board.marks = []; S.board.latGuide = null; S.board.labels = true;
    S.board.off = {x: 0, y: 0};
    const perfStart = performance.now() + (S.flare.start - S.store.now());
    S.board.flare = {x: fx, y: fy, t0: perfStart};
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
    const sec = (now - f.start) / 1000, pts = M.flareScore(sec);
    addScore(pts, `⚡ +${pts}`, px, py, '#f59f00');
    Sound.play('fanfare'); buzz([30, 40, 30]);
    event(`⚡ ${sec.toFixed(1)}초!`, '#ffd43b');
    send({fl: {ok: 1, s: +sec.toFixed(2)}});
    flareFact(`⚡ ${sec.toFixed(1)}초 만에 찾았어요! +${pts}`);
  }
  function flareFact(head) {
    $('controls').innerHTML = (S.solo ? `<button class="primary big" id="solo-next">${esc(nextLabel(S.meta))} ▶</button>` : '') + `<p class="fact"><b>${head}</b><br>플레어는 흑점 근처의 강한 자기장 에너지가 갑자기 터지는 폭발이에요. 빛(X선·자외선)은 약 <b>8분 20초</b> 만에 지구에 와서 통신을 방해하고(델린저 현상), 함께 뿜어진 코로나 물질은 <b>1~3일 뒤</b> 도착해 자기 폭풍과 <b>오로라</b>를 일으켜요.</p>`;
    if (S.solo) $('solo-next').onclick = soloNext;
  }

  // ── 덮개 카드 ────────────────────────────────────────────
  function showOverlay(html, onClose, clear) {
    const ov = $('overlay');
    $('ov-card').innerHTML = html;
    ov.hidden = false;
    ov.classList.toggle('clear', !!clear);
    $('ov-card').querySelectorAll('[data-close]').forEach(b => b.onclick = () => { ov.hidden = true; S.overlayFor = null; if (onClose) onClose(); });
    const sn = $('ov-card').querySelector('#solo-next-ov');
    if (sn) sn.onclick = () => { ov.hidden = true; S.overlayFor = null; soloNext(); };
  }
  const hideOverlay = () => { $('overlay').hidden = true; S.overlayFor = null; };
  const soloBtn = () => S.solo && S.meta ? `<button class="primary big" id="solo-next-ov">${esc(nextLabel(S.meta))} ▶</button>` : '';
  function classStats1() {
    const list = activePlayers(S.players, S.meta).map(([, p]) => p).filter(p => p.d1);
    const n = M.spotsOn(S.sun, 0).length;
    const avg = list.length ? list.reduce((a, p) => a + p.d1.f, 0) / list.length : 0;
    return {n, players: list.length, avg, perfect: list.filter(p => p.d1.f >= p.d1.n).length, fooled: list.filter(p => p.d1.d > 0).length};
  }
  function showR1() {
    S.overlayFor = 'r1';
    const cs = classStats1(), groups = S.sun.groups.length;
    const d1 = M.spotsOn(S.sun, 0);
    S.board.setSun(S.sun, 0); S.board.sheet = null; S.board.marks = S.marks1; S.board.labels = true;
    S.board.reveal = d1.filter(s => !S.found.has(s.id));
    showOverlay(`<h2>📊 1일째 관측 결과</h2>
      <div class="stat-row"><div class="stat"><small>내가 찾은 흑점</small><b>${S.found.size}/${cs.n}</b></div><div class="stat"><small>우리 반 평균</small><b>${cs.avg.toFixed(1)}</b></div><div class="stat"><small>완벽 관측</small><b>${cs.perfect}명</b></div></div>
      <p class="fact">오늘 태양에는 흑점 무리가 <b>${groups}개</b>, 흑점이 <b>${cs.n}개</b> 있었어요(놓친 흑점은 투영판에 주황 점선). 흑점은 대부분 이렇게 <b>무리 지어</b> 나타나요.</p>
      <p class="fact">흑점이 검게 보이는 까닭: 주변 광구(약 <b>5800 K</b>)보다 온도가 낮아서(<b>4000~5000 K</b>) 덜 밝기 때문이에요. 가장자리가 어두운 것은 <b>주연 감광</b>!</p>
      <p class="fact">렌즈 먼지에 속은 친구 <b>${cs.fooled}명</b> — 먼지는 상이 움직여도 제자리, 흑점은 태양과 함께 움직여요.</p>
      ${soloBtn()}<button class="ghost" data-close>투영판 다시 보기</button>`);
  }
  function rotPoints() {
    const pts = [];
    activePlayers(S.players, S.meta).forEach(([id, p]) => { if (p.rot) ['a', 'b'].forEach(k => { if (p.rot[k]) pts.push(Object.assign({team: p.team, me: id === S.store.uid}, p.rot[k])); }); });
    return pts;
  }
  function showR2() {
    S.overlayFor = 'r2';
    const pts = rotPoints(), sum = M.rotationSummary(pts);
    const mine = (S.find && S.find.results || []).filter(Boolean);
    showOverlay(`<h2>📈 우리 반이 잰 태양의 자전 주기</h2>
      <canvas id="ov-scatter" width="640" height="440"></canvas>
      <div class="stat-row"><div class="stat"><small>적도 쪽 (|위도|&lt;15°)</small><b>${sum.low ? sum.low.toFixed(1) + '일' : '—'}</b></div><div class="stat"><small>고위도 (22° 이상)</small><b>${sum.high ? sum.high.toFixed(1) + '일' : '—'}</b></div></div>
      ${mine.length ? `<p class="small">내 측정: ${mine.map(r => `위도 ${fmt(Math.abs(r.lat), 0)}° → <b>${r.P.toFixed(1)}일</b>`).join(' · ')}</p>` : ''}
      <p class="fact"><b>적도 쪽이 고위도보다 빨리 돌아요(차등 자전).</b> 단단한 고체라면 어디나 같은 주기로 돌겠죠? 태양이 <b>기체</b>로 되어 있다는 증거예요. 교과서: 적도 약 25일, 고위도 30일 이상.</p>
      ${soloBtn()}<button class="ghost" data-close>닫기</button>`);
    drawScatter($('ov-scatter'), pts, true);
  }

  function onStudentMeta(m) {
    if (!m) { if (S.joinedOK && !S.gone) { S.gone = true; showOverlay('<h2>수업 방이 닫혔어요</h2><p>선생님이 방을 닫았어요. 수고했어요!</p>'); } return; }
    const prev = S.meta;
    S.meta = m;
    if (S.world) S.world.setGold(!!m.gold);
    if (m.gold && prev && !prev.gold) { toast('🏆 우리 반 목표 달성! 모두의 망원경이 황금으로!', 3000); Sound.play('fanfare'); }
    // 새 판: 다시 처음부터
    if (S.round !== m.round || !S.sun || S.sun.seed !== m.seed) {
      const fresh = S.round !== m.round;
      S.round = m.round;
      S.sun = sunOf(m.seed);
      S.pers = M.personal(S.store.uid, S.sun);
      resetLocal(fresh);
    }
    const ph = m.phase, st = S.stage;
    if (ph !== 'night' && S.world) { S.world.setNight(0); S.world.setAurora(0); S.world.hidePodium(); S.world.setCamera('me'); }
    if (S.overlayFor && S.overlayFor !== ph) hideOverlay();
    if (ph === 'lobby') { if (st !== 'lobby' || !S.stageT) setStage('lobby'); }
    else if (ph === 'd1') {
      if (!M.DAY1_STAGES.includes(st)) resumeDay1();
    } else if (ph === 'r1') {
      if (st === 'sketch') finishSketch(false);
      else if (M.DAY1_STAGES.includes(st) && st !== 'done1') { send({d1: {f: S.found.size, n: M.spotsOn(S.sun, 0).length, d: S.dust}}); setStage('done1'); }
      else if (!M.DAY1_STAGES.includes(st)) setStage('done1');
      if (S.overlayFor !== 'r1') { S.overlayFor = 'r1'; setTimeout(() => { if (S.meta && S.meta.phase === 'r1') showR1(); }, 1300); }
    } else if (ph === 'd2') {
      S.board.reveal = null;
      if (!M.DAY2_STAGES.includes(st)) {
        if (S.resume && S.resume.st && M.DAY2_STAGES.includes(S.resume.st) && S.resume.st !== 'aim2') { S.aligned = true; S.motor = true; snapToSun(); startFind(); if (S.resume.st === 'done2') setStage('done2'); }
        else { S.motor = true; S.aligned = false; send({al: false}); S.board.setSun(S.sun, S.sun.dt); S.board.sheet = null; S.board.marks = []; S.board.reveal = null; S.aimT0 = performance.now(); setStage('aim2'); }
        S.resume = null;
      }
    } else if (ph === 'r2') {
      if (st !== 'done2') { if (S.find) { S.board.calc = null; S.find.calc = null; } setStage('done2'); }
      if (S.overlayFor !== 'r2') { S.overlayFor = 'r2'; setTimeout(() => { if (S.meta && S.meta.phase === 'r2') showR2(); }, 1300); }
    } else if (ph === 'flare') {
      if (st !== 'flare') {
        hideOverlay();
        S.overlayFor = 'flare';
        showOverlay(`<div class="alarm-wrap"><h2>⚡ 플레어 경보!</h2><p>태양 관측 위성에서 경보가 왔어요. 망원경에 <b>Hα 필터</b>를 끼우고 채층을 보세요. 곧 흑점 무리 근처에서 폭발이 일어나요!</p></div>`);
        $('ov-card').classList.add('alarm');
        Sound.play('alarm'); buzz([200, 100, 200, 100, 200]);
        document.body.dataset.shake = '1'; setTimeout(() => { delete document.body.dataset.shake; }, 800);
        setTimeout(() => { $('ov-card').classList.remove('alarm'); if (S.meta && S.meta.phase === 'flare') { hideOverlay(); S.overlayFor = 'flare'; } }, 2600);
        S.aligned = true; S.motor = true; snapToSun();
        startFlare();
      }
    } else if (ph === 'night') {
      if (st !== 'night') startNight();
    }
  }
  function resetLocal(fresh) {
    S.marks1 = []; S.found = new Set(); S.dust = 0; S.combo = 0; S.prep = new Set(); S.eye = false; S.dirTries = 0; S.dirArmed = 0;
    S.find = null; S.flare = null; S.aligned = false; S.motor = true; S.lockAnim = null;   // 추적 모터는 처음부터 켜져 있다(방향 정하기에서만 잠깐 끈다)
    S.focus = S.pers.fStart; S.tel = {az: S.pers.aim0.az, alt: S.pers.aim0.alt};
    if (fresh && S.stageT) { S.score = 0; $('st-score').textContent = '0'; send({sc: 0, al: false, cap: false}); }
    if (S.board) { S.board.setSun(S.sun, 0); S.board.marks = []; S.board.sheet = null; S.board.calc = null; S.board.labels = false; S.board.flare = null; S.board.reveal = null; S.board.latGuide = null; }
    S.stageT = 0;
    // 새로고침해서 돌아왔으면 하던 곳부터
    const r = S.resume;
    if (r && r.mk) { S.marks1 = M.decodeMarks(r.mk).map(m => Object.assign(m, {t: 0})); S.marks1.forEach(m => { if (typeof m.k === 'number') S.found.add(m.k); else if (m.k === 'd') S.dust++; }); S.board.marks = S.marks1; }
  }
  function resumeDay1() {
    const r = S.resume;
    S.resume = null;
    const st = r && r.st;
    if (st && ['focus', 'dir', 'sketch', 'done1'].includes(st)) {
      S.prep = new Set(['cap', 'plate', 'sheet']); S.aligned = true; S.motor = true; snapToSun();
      if (st !== 'focus') { S.focus = S.pers.f0; S.board.labels = true; }
      if (st === 'sketch') { S.skT0 = S.store.now() - 20000; setStage('sketch'); }
      else setStage(st);
      return;
    }
    setStage('prep');
  }
  function snapToSun() { if (S.meta) { const sky = skyNow(S.meta, S.store.now()); S.tel = {az: sky.az, alt: sky.alt}; S.sky = sky; S.prevSky = sky; } }
  function startNight() {
    setStage('night');
    hideOverlay();
    if (S.world) {
      S.world.setNight(1); S.world.setAurora(1); S.world.setCamera('north');
      setTimeout(() => {
        if (!S.meta || S.meta.phase !== 'night') return;
        const top = activePlayers(S.players, S.meta).sort((a, b) => (b[1].sc || 0) - (a[1].sc || 0)).slice(0, 3).map(([id, p]) => ({id, name: p.name, team: p.team, sc: p.sc}));
        if (top.length) { S.world.showPodium(top); S.world.setCamera('podium'); }
      }, 6500);
    }
    Sound.play('fanfare');
    setTimeout(() => { if (S.meta && S.meta.phase === 'night') showFinal(); }, 1800);
  }
  function showFinal() {
    S.overlayFor = 'night';
    const list = activePlayers(S.players, S.meta).sort((a, b) => (b[1].sc || 0) - (a[1].sc || 0));
    const rank = list.findIndex(([id]) => id === S.store.uid) + 1;
    const teams = M.TEAMS.map((t, i) => {
      const ms = list.filter(([, p]) => p.team === i);
      return {t, n: ms.length, avg: ms.length ? ms.reduce((a, [, p]) => a + (p.sc || 0), 0) / ms.length : 0};
    }).filter(x => x.n).sort((a, b) => b.avg - a.avg);
    showOverlay(`<h2>🌌 오늘의 관측 끝!</h2>
      <p>내 순위 <b class="big-num">${rank || '-'}</b>위 / ${list.length}명 · <b>${S.score}</b>점</p>
      <p class="small">모둠 순위: ${teams.map((x, i) => `${i + 1}. ${x.t.icon} ${x.t.name} ${Math.round(x.avg)}`).join(' · ')}</p>
      <p class="fact"><b>오로라</b>는 태양에서 날아온 전기를 띤 입자가 지구 자기장을 따라 극지방 대기로 들어와 빛을 내는 현상이에요. 2024년 5월 강한 태양 폭풍 때는 <b>우리나라에서도 붉은 오로라</b>가 사진에 찍혔어요.</p>
      ${soloBtn()}<button class="ghost" data-close>오로라 구경하기</button>`, null, true);
  }

  // ── 매 장면 ───────────────────────────────────────────────
  function studentLoop() {
    let lastPlate = 0, lastWorldPlayers = 0, lastWait = 0, prevT = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now(), dt = Math.min(0.1, (now - prevT) / 1000);
      prevT = now;
      if (!S.meta || !S.sun) return;
      const sky = skyNow(S.meta, S.store.now());
      // 추적 모터: 망원경이 태양을 따라간다
      if (S.motor && S.prevSky) { S.tel.az += sky.az - S.prevSky.az; S.tel.alt += sky.alt - S.prevSky.alt; }
      S.prevSky = sky; S.sky = sky;
      // 조준 완료 애니메이션 (태양 쪽으로 빨려 들어감)
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
      b.mis = {x: off.x, y: off.y};
      if (off.sep > 80) b.mis = {x: 40 * Math.sign(off.x || 1), y: 0};
      b.blur = S.stage === 'flare' ? 0 : 40 * Math.abs(S.focus - S.pers.f0);
      if (b.blur < 0.6 && (S.stage !== 'focus')) b.blur = 0;
      b.dust = S.stage === 'flare' ? [] : S.pers.dust;
      // 단계별 판정
      if ((S.stage === 'aim' || S.stage === 'aim2') && !S.lockAnim && !S.aligned) {
        const r = off.sep / M.SUN_RADIUS_DEG, dragging = !!S.drag;
        const mt = $('aim-meter');
        if (mt) {
          mt.style.width = (100 * (1 - clamp(Math.log10(Math.max(off.sep, 0.02) / 0.02) / Math.log10(60 / 0.02), 0, 1))) + '%';
          $('aim-deg').textContent = off.sep >= 10 ? `${off.sep.toFixed(0)}°` : `${off.sep.toFixed(2)}°`;
        }
        if (r < (dragging ? 0.08 : M.ALIGN_TOL * 1.5)) lockAim();
        if (off.sep < 3) $('drag-hint').hidden = true;
      }
      if (S.stage === 'dir' && S.dirArmed) {
        if (b.off.x > 1.35) { S.tel = {az: sky.az, alt: sky.alt}; }  // 너무 멀리 흘러가면 다시 가운데에서
      }
      if (S.stage === 'sketch') {
        const total = S.meta.sk || M.SKETCH_SEC, left = total - (S.store.now() - S.skT0) / 1000;
        $('sk-time').textContent = Math.max(0, Math.ceil(left));
        $('sk-bar').style.width = clamp(left / total * 100, 0, 100) + '%';
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
        if (S.playersDirty && now - lastWorldPlayers > 200) {
          lastWorldPlayers = now; S.playersDirty = false;
          const show = {};
          entries(S.players).forEach(([id, p]) => { if (p && p.name && (p.on !== false || id === S.store.uid)) show[id] = p; });
          S.world.setPlayers(show, S.store.uid);
          updateRank(); updateGoal();
        }
      } else if (S.playersDirty) { S.playersDirty = false; updateRank(); updateGoal(); }
      if (now - lastWait > 700) { lastWait = now; updateWaitCount(); }
    };
    tick();
  }
  function updateRank() {
    const list = activePlayers(S.players, S.meta).sort((a, b) => (b[1].sc || 0) - (a[1].sc || 0));
    const i = list.findIndex(([id]) => id === S.store.uid);
    $('st-rank').textContent = i >= 0 ? `${i + 1}/${list.length}` : '-';
  }
  function goalOf(players, meta) {
    const list = activePlayers(players, meta), n = M.spotsOn(sunOf(meta.seed), 0).length;
    const goal = Math.max(10, Math.round(list.length * n * 0.6));
    const hits = list.reduce((a, [, p]) => a + (p.hits || 0), 0);
    return {goal, hits, n};
  }
  function updateGoal() {
    if (!S.meta) return;
    const g = goalOf(S.players, S.meta), el = $('st-goal');
    el.hidden = S.meta.phase === 'lobby' || S.meta.phase === 'night';
    $('st-goal-bar').style.width = clamp(g.hits / g.goal * 100, 0, 100) + '%';
    $('st-goal-text').textContent = `흑점 ${g.hits}/${g.goal}`;
    el.classList.toggle('done', g.hits >= g.goal);
  }
  function soloNext() {
    if (!S.solo || !S.meta) return;
    advance(S.store, S.base, S.meta, S.players);
  }

  // ── 자전 주기 산점도 (학생 결과 카드·선생님 화면이 같이 쓴다) ─────────────────
  function drawScatter(cv, pts, compact) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    const L = 64, R = 18, T = 26, B = 54;
    const P0 = 22, P1 = 30;
    const X = lat => L + (lat / 40) * (W - L - R), Y = P => T + (1 - (clamp(P, P0, P1) - P0) / (P1 - P0)) * (H - T - B);
    x.fillStyle = '#0b1626'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.1)'; x.lineWidth = 1;
    x.font = `700 ${compact ? 15 : 16}px Pretendard, system-ui, sans-serif`; x.fillStyle = '#9fb3c8';
    for (let P = P0; P <= P1; P += 1) { x.beginPath(); x.moveTo(L, Y(P)); x.lineTo(W - R, Y(P)); x.stroke(); x.textAlign = 'right'; x.fillText(P, L - 8, Y(P) + 5); }
    for (let l = 0; l <= 40; l += 10) { x.beginPath(); x.moveTo(X(l), T); x.lineTo(X(l), H - B); x.stroke(); x.textAlign = 'center'; x.fillText(l + '°', X(l), H - B + 22); }
    x.fillStyle = '#c4d3e3'; x.textAlign = 'center'; x.fillText('흑점의 위도 (북·남 상관없이)', (L + W - R) / 2, H - 10);
    x.save(); x.translate(18, (T + H - B) / 2); x.rotate(-Math.PI / 2); x.fillText('자전 주기 (일)', 0, 0); x.restore();
    // 실제 태양(차등 자전)
    x.strokeStyle = '#ff8a1a'; x.lineWidth = 3; x.beginPath();
    for (let l = 0; l <= 40; l += 1) { const P = M.rotationPeriod(l); if (l) x.lineTo(X(l), Y(P)); else x.moveTo(X(l), Y(P)); }
    x.stroke();
    x.fillStyle = '#ff8a1a'; x.textAlign = 'left'; x.fillText('실제 태양', X(30) - 20, Y(M.rotationPeriod(30)) - 12);
    pts.forEach(p => {
      if (!(p.P > 18 && p.P < 38)) return;
      x.fillStyle = team(p.team).color;
      x.beginPath(); x.arc(X(Math.abs(p.lat)), Y(p.P), p.me ? 9 : 6, 0, 7); x.fill();
      x.strokeStyle = p.me ? '#fff' : 'rgba(0,0,0,.4)'; x.lineWidth = p.me ? 3 : 1; x.stroke();
    });
    if (!pts.length) { x.fillStyle = '#9fb3c8'; x.textAlign = 'center'; x.fillText('아직 자료가 없어요', W / 2, H / 2); }
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   선생님 화면
  // ╚══════════════════════════════════════════════════════════╝
  const T = {store: null, code: '', base: '', meta: null, players: {}, world: null, bots: null, demo: false, lastEv: {}, lastPhase: null, podiumT: 0, hostBoard: null};

  async function openRoom(demo, existing) {
    const note = $('server-note');
    note.textContent = '연결 중…'; note.classList.remove('error');
    try { T.store = await openStore(demo ? 'demo' : 'teacher'); }
    catch (e) { note.textContent = e.message; note.classList.add('error'); return; }
    T.demo = demo;
    let code = existing;
    try {
      if (code) { const meta = await T.store.get(`${ROOT}/${code}/meta`); if (!meta || meta.teacher !== T.store.uid) code = null; }
      if (!code) {
        for (let i = 0; i < 20 && !code; i++) { const c = String(1000 + Math.floor(Math.random() * 9000)); if (!(await T.store.get(`${ROOT}/${c}/meta`))) code = c; }
        const now = T.store.now();
        await T.store.set(`${ROOT}/${code}/meta`, {teacher: T.store.uid, created: now, phase: 'lobby', round: 1, seed: randInt(), sk: M.SKETCH_SEC, t0: now, demo: demo || null});
      }
    } catch (e) {
      if (isDenied(e) && !demo) { note.innerHTML = '서버가 흑점 헌터스 방을 아직 받아 주지 않아요. ' + esc(RULES_HELP) + ' 그 전에는 “가상 학생과 미리 해 보기”로 써 볼 수 있어요.'; note.classList.add('error'); return; }
      if (isDenied(e) && demo) { T.store = new LocalStore(true); await T.store.ready; return openRoomWith(T.store, demo); }
      note.textContent = e.message || String(e); note.classList.add('error'); return;
    }
    startTeacher(code);
  }
  async function openRoomWith(store, demo) {
    const c = String(1000 + Math.floor(Math.random() * 9000)), now = store.now();
    await store.set(`${ROOT}/${c}/meta`, {teacher: store.uid, created: now, phase: 'lobby', round: 1, seed: randInt(), sk: M.SKETCH_SEC, t0: now, demo: demo || null});
    T.store = store; T.demo = demo;
    startTeacher(c);
  }
  function startTeacher(code) {
    T.code = code; T.base = `${ROOT}/${code}`;
    if (!T.demo) history.replaceState(null, '', '?host=' + code + (LOCAL_ONLY ? '&local' : ''));
    else if (T.store.kind === 'firebase') history.replaceState(null, '', '?demo&host=' + code);
    document.body.dataset.screen = 'teacher';
    Sound.unlock(); Wake.on();
    $('t-code').textContent = code; $('t-code-big').textContent = code;
    const url = joinURL(code);
    $('t-url').textContent = url.replace(/^https?:\/\//, '');
    drawQR($('t-qr'), url); drawQR($('t-qr-small'), url);
    if (T.store.kind === 'local' && !LOCAL_ONLY) $('t-url').textContent = '미리 해 보기: 이 기기 안에서만 돌아가요 (서버 연결 없음)';
    if (window.SunspotWorld && window.THREE) { try { T.world = new window.SunspotWorld($('t-3d'), {mode: 'host'}); if (!T.world.ok) T.world = null; } catch (e) { console.warn(e); } }
    const hb = document.createElement('canvas');
    T.hostBoard = new window.SunspotBoard(hb, {size: 600});
    T.store.on(T.base + '/meta', v => { T.meta = v; T.dirty = true; onTeacherMeta(); });
    T.store.on(T.base + '/players', v => { T.players = v || {}; T.dirty = true; });
    T.store.onStatus(ok => { $('t-conn').className = 'conn ' + (ok ? 'on' : 'off'); });
    bindTeacher();
    if (T.demo) { T.bots = new Bots(T.store, T.base, 20, () => T.meta); T.bots.start(); }
    teacherLoop();
  }
  function guard(p, what) {
    return Promise.resolve(p).catch(e => alert(`${what}에 실패했어요.\n${e && e.message ? e.message : e}\n\n인터넷 연결과 Firebase 규칙을 확인해 주세요.`));
  }
  function bindTeacher() {
    $('t-next').onclick = () => { if (T.meta) guard(advance(T.store, T.base, T.meta, T.players, 1), '다음 단계'); };
    $('t-prev').onclick = () => {
      if (!T.meta || T.meta.phase === 'lobby') return;
      if (confirm(`이전 단계(${PHASE_NAME[PHASES[PHASES.indexOf(T.meta.phase) - 1]]})로 돌아갈까요?`)) guard(advance(T.store, T.base, T.meta, T.players, -1), '이전 단계');
    };
    $('t-sk').onchange = e => guard(T.store.update(T.base + '/meta', {sk: +e.target.value}), '스케치 시간');
    $('t-fullscreen').onclick = () => { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen(); };
    $('t-qr-btn').onclick = () => $('screen-teacher').classList.toggle('qr-big');
    $('t-room').onclick = () => $('screen-teacher').classList.toggle('qr-big');
    $('t-roster-btn').onclick = () => { $('t-roster').hidden = !$('t-roster').hidden; renderRoster(); };
    $('t-roster').onclick = e => {
      const b = e.target.closest('button[data-kick]');
      if (b && confirm(`${b.dataset.name} 학생을 관측소에서 내보낼까요?`)) guard(T.store.remove(T.base + '/players/' + b.dataset.kick), '내보내기').then(renderRoster);
      if (e.target.closest('[data-close-roster]')) $('t-roster').hidden = true;
    };
  }
  function renderRoster() {
    const list = entries(T.players).filter(([, p]) => p && p.name).sort((a, b) => (a[1].team - b[1].team) || String(a[1].name).localeCompare(b[1].name));
    $('t-roster').innerHTML = `<h3>명단 (${list.length}명) <button class="ghost" data-close-roster>닫기</button></h3><ul>${list.map(([id, p]) =>
      `<li><i class="conn ${p.on === false ? 'off' : 'on'}"></i><span style="color:${team(p.team).color}">${team(p.team).icon}</span><span>${esc(p.name)}</span><small>${(M.STAGES[p.st] || {}).icon || ''} ${p.sc || 0}</small><button data-kick="${esc(id)}" data-name="${esc(p.name)}">내보내기</button></li>`).join('')}</ul>`;
  }
  function onTeacherMeta() {
    const m = T.meta;
    if (!m) return;
    $('t-sk').value = String(m.sk || 75);
    if (m.phase !== T.lastPhase) {
      const prev = T.lastPhase;
      T.lastPhase = m.phase;
      if (T.world) {
        if (m.phase === 'night') { T.world.setNight(1); T.world.setAurora(1); T.world.setCamera('north'); T.podiumT = performance.now() + 7000; }
        else { T.world.setNight(0); T.world.setAurora(0); T.world.hidePodium(); T.world.setCamera('overview'); T.podiumT = 0; }
      }
      if (prev) {
        const banner = {d1: ['☀️ 1일째 관측 시작!', '안전 준비 → 조준 → 초점 → 방향 → 스케치'], r1: ['📊 1일째 결과', '우리 반이 함께 그린 흑점 지도'],
          d2: [`⏩ ${sunOf(m.seed).dt}일 뒤…`, '내 흑점은 어디로 갔을까?'], r2: ['📈 자전 주기 결과', '위도에 따라 다를까?'],
          flare: ['⚡ 플레어 경보!', 'Hα 필터로 바꿔 끼우세요'], night: ['🌌 그날 밤…', '북쪽 하늘에 오로라가!'], lobby: ['🔁 새 태양', '다시 한 판!']}[m.phase];
        if (banner) showBanner(banner[0], banner[1], m.phase === 'flare');
        if (m.phase === 'flare') Sound.play('alarm'); else if (m.phase === 'night' || m.phase === 'r2') Sound.play('fanfare'); else Sound.play('whoosh');
      }
      $('screen-teacher').classList.remove('qr-big');
    }
    renderTeacher();
  }
  function showBanner(title, sub, alarm) {
    const b = $('t-banner');
    b.innerHTML = `${esc(title)}<small>${esc(sub)}</small>`;
    b.classList.toggle('alarm-text', !!alarm);
    b.hidden = false; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(b._h); b._h = setTimeout(() => { b.hidden = true; }, 2600);
  }
  function feed(text, color) {
    const box = $('t-feed'), d = document.createElement('div');
    d.textContent = text; if (color) d.style.borderColor = color;
    box.prepend(d);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => d.remove(), 4100);
  }

  function renderTeacher() {
    const m = T.meta;
    if (!m) return;
    const all = activePlayers(T.players, m), online = all.filter(([, p]) => p.on !== false);
    $('t-count').textContent = online.length;
    $('t-phase-name').textContent = PHASE_NAME[m.phase];
    $('t-next').textContent = nextLabel(m);
    const pi = PHASES.indexOf(m.phase);
    $('t-stage').innerHTML = PHASES.map((p, i) => `<span class="${i < pi ? 'done' : i === pi ? 'now' : ''}" title="${PHASE_NAME[p]}"></span>`).join('');
    $('t-lobby').hidden = m.phase !== 'lobby' && !$('screen-teacher').classList.contains('qr-big');
    $('t-teams').innerHTML = M.TEAMS.map((t, i) => `<span style="--c:${t.color}">${t.icon} ${t.name} ${all.filter(([, p]) => p.team === i).length}</span>`).join('');
    // 순위
    const ranked = all.slice().sort((a, b) => (b[1].sc || 0) - (a[1].sc || 0));
    $('t-board').innerHTML = ranked.slice(0, 10).map(([, p], i) => `<li><span class="rk">${i + 1}</span><span class="dot" style="background:${team(p.team).color}"></span><span class="nm">${esc(p.name)}</span><span class="st">${(M.STAGES[p.st] || {}).icon || ''}</span><span class="sc">${p.sc || 0}</span></li>`).join('') || '<li><span class="nm">아직 아무도 없어요</span></li>';
    const tavg = M.TEAMS.map((t, i) => { const ms = all.filter(([, p]) => p.team === i); return {t, n: ms.length, avg: ms.length ? ms.reduce((a, [, p]) => a + (p.sc || 0), 0) / ms.length : 0}; });
    const maxAvg = Math.max(1, ...tavg.map(x => x.avg));
    $('t-teambars').innerHTML = tavg.map(x => `<div><span>${x.t.icon} ${x.t.name}</span><i><b style="width:${x.avg / maxAvg * 100}%;background:${x.t.color}"></b></i><em>${Math.round(x.avg)}</em></div>`).join('');
    renderLeft(m, all);
    if (!$('t-roster').hidden) renderRoster();
  }
  function stageChips(all, keys) {
    return `<div class="chips">${keys.map(k => `<span>${M.STAGES[k].icon} ${M.STAGES[k].label} <b>${all.filter(([, p]) => p.st === k).length}</b></span>`).join('')}</div>`;
  }
  function renderLeft(m, all) {
    const box = $('t-left'), ph = m.phase;
    box.hidden = ph === 'lobby';
    if (ph === 'lobby') return;
    const key = ph + '|' + m.round;
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      const sun = sunOf(m.seed);
      const html = {
        d1: `<h3>✏️ 우리 반이 함께 그리는 흑점 지도</h3><canvas id="t-map" width="600" height="600"></canvas><div id="t-chips"></div><div class="goal" id="t-goal"></div>`,
        r1: `<h3>📊 정답 공개: 1일째 태양</h3><canvas id="t-map" width="600" height="600"></canvas><div id="t-r1"></div>`,
        d2: `<h3>⭐ ${sun.dt}일 뒤: 흑점 추적 중</h3><canvas id="t-map" width="600" height="600"></canvas><div id="t-chips"></div>`,
        r2: `<h3>📈 우리 반이 잰 자전 주기</h3><canvas id="t-scatter" class="wide" width="640" height="480"></canvas><div id="t-r2"></div>`,
        flare: `<h3>⚡ 플레어 경보 (Hα)</h3><canvas id="t-map" width="600" height="600"></canvas><div id="t-fl"></div>`,
        night: `<h3>🌌 오늘의 관측 정리</h3><div id="t-night"></div>`
      }[ph];
      box.innerHTML = html;
    }
    const sun = sunOf(m.seed);
    if (ph === 'd1') {
      drawClassMap($('t-map'), sun, 0, all, false);
      $('t-chips').innerHTML = stageChips(all, ['prep', 'aim', 'focus', 'dir', 'sketch', 'done1']);
      const g = goalOf(T.players, m);
      $('t-goal').innerHTML = `<span>🏆 우리 반 목표: 흑점 ${g.hits} / ${g.goal}개 ${g.hits >= g.goal ? '— 달성! 황금 망원경 🎉' : ''}</span><i><b style="width:${clamp(g.hits / g.goal * 100, 0, 100)}%"></b></i>`;
    } else if (ph === 'r1') {
      drawClassMap($('t-map'), sun, 0, all, true);
      const done = all.map(([, p]) => p).filter(p => p.d1), n = M.spotsOn(sun, 0).length;
      const avg = done.length ? done.reduce((a, p) => a + p.d1.f, 0) / done.length : 0;
      $('t-r1').innerHTML = `<ul class="big"><li>흑점 무리 <b>${sun.groups.length}개</b>, 흑점 <b>${n}개</b> — 반 평균 <b>${avg.toFixed(1)}개</b> 찾음</li>
        <li>완벽 관측 <b>${done.filter(p => p.d1.f >= p.d1.n).length}명</b> · 렌즈 먼지에 속음 <b>${done.filter(p => p.d1.d > 0).length}명</b></li>
        <li>흑점이 어두운 까닭: 주변 광구(약 5800 K)보다 온도가 낮다(4000~5000 K)</li>
        <li>가장자리가 어둡다 = 주연 감광 · 가장자리 흑점은 납작하게 보인다(공 모양)</li></ul>`;
    } else if (ph === 'd2') {
      drawClassMap($('t-map'), sun, sun.dt, all, false);
      $('t-chips').innerHTML = stageChips(all, ['aim2', 'find', 'done2']);
    } else if (ph === 'r2') {
      const pts = [];
      all.forEach(([, p]) => { if (p.rot) ['a', 'b'].forEach(k => { if (p.rot[k]) pts.push(Object.assign({team: p.team}, p.rot[k])); }); });
      drawScatter($('t-scatter'), pts);
      const s = M.rotationSummary(pts);
      $('t-r2').innerHTML = `<ul class="big"><li>측정 <b>${s.n}개</b> · 전체 평균 <b>${s.all ? s.all.toFixed(1) : '—'}일</b></li>
        <li>적도 쪽(|위도| &lt; 15°) <b>${s.low ? s.low.toFixed(1) + '일' : '—'}</b> · 고위도(22° 이상) <b>${s.high ? s.high.toFixed(1) + '일' : '—'}</b></li>
        <li><b>적도가 더 빨리 돈다 → 차등 자전</b> → 태양은 고체가 아니라 기체</li>
        <li>방법: θ : Δt = 360° : P (교과서 60쪽)</li></ul>`;
    } else if (ph === 'flare') {
      drawFlareMap($('t-map'), sun, m);
      const ok = all.map(([, p]) => p).filter(p => p.fl && p.fl.ok).sort((a, b) => a.fl.s - b.fl.s);
      $('t-fl').innerHTML = `<p class="big">찾은 학생 <b>${ok.length}</b> / ${all.length}명</p><ul>${ok.slice(0, 5).map((p, i) => `<li>${['🥇', '🥈', '🥉', '4', '5'][i]} ${esc(p.name)} — ${p.fl.s.toFixed(1)}초</li>`).join('')}</ul>
        <p class="hint">플레어의 빛은 약 8분 20초 만에 지구 도착(통신 장애), 코로나 물질 분출(CME)은 1~3일 뒤 도착 → 자기 폭풍·오로라</p>`;
    } else if (ph === 'night') {
      const ranked = all.slice().sort((a, b) => (b[1].sc || 0) - (a[1].sc || 0));
      $('t-night').innerHTML = `<ol class="big">${ranked.slice(0, 5).map(([, p]) => `<li>${team(p.team).icon} <b>${esc(p.name)}</b> ${p.sc || 0}점</li>`).join('')}</ol>
        <ul><li>안전: 태양은 투영판에 비춰서 본다</li><li>상이 흘러가는 쪽 = 서쪽 (일주 운동)</li><li>흑점은 동 → 서로 이동 = 태양의 자전</li><li>적도 약 25일, 고위도 30일 이상 = 차등 자전</li><li>플레어 → 자기 폭풍·오로라</li></ul>`;
    }
  }
  // 반 전체의 찍은 자리: 점이 겹칠수록 밝게 빛난다
  function drawClassMap(cv, sun, day, all, reveal) {
    if (!cv) return;
    const x = cv.getContext('2d'), W = cv.width, R = W * 0.43, c = W / 2;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#0b1626'; x.fillRect(0, 0, W, W);
    if (reveal) {
      const hb = T.hostBoard;
      hb.setSun(sun, day); hb.buildImage();
      const n = hb.img.width;
      x.drawImage(hb.img, c - n / 2, c - n / 2, n, n);
    } else {
      const g = x.createRadialGradient(c, c, 0, c, c, R);
      g.addColorStop(0, '#2a3e5c'); g.addColorStop(1, '#17263c');
      x.fillStyle = g; x.beginPath(); x.arc(c, c, R, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,214,120,.5)'; x.lineWidth = 2; x.stroke();
    }
    x.globalCompositeOperation = reveal ? 'source-over' : 'lighter';
    all.forEach(([, p]) => {
      if (day === 0) {
        M.decodeMarks(p.mk).forEach(mk => {
          const px = c + mk.x * R, py = c - mk.y * R;
          if (mk.k === 'd') { x.fillStyle = reveal ? 'rgba(80,90,110,.9)' : 'rgba(120,130,150,.5)'; x.fillRect(px - 2, py - 2, 4, 4); return; }
          x.fillStyle = reveal ? team(p.team).color : 'rgba(255,190,80,.33)';
          x.beginPath(); x.arc(px, py, reveal ? 3 : 7, 0, 7); x.fill();
        });
      } else if (p.rot) ['a', 'b'].forEach(k => {
        const r = p.rot[k]; if (!r) return;
        x.fillStyle = 'rgba(255,190,80,.45)';
        x.beginPath(); x.arc(c + r.x2 * R, c - r.y2 * R, 8, 0, 7); x.fill();
      });
    });
    x.globalCompositeOperation = 'source-over';
    x.font = '800 18px Pretendard, system-ui, sans-serif'; x.fillStyle = '#c4d3e3'; x.textAlign = 'center';
    x.fillText('북 N', c, 22); x.fillText('남 S', c, W - 10); x.textAlign = 'left'; x.fillText('동 E', 8, c + 6); x.textAlign = 'right'; x.fillText('서 W', W - 8, c + 6);
  }
  function drawFlareMap(cv, sun, m) {
    const x = cv.getContext('2d'), W = cv.width, c = W / 2, hb = T.hostBoard;
    hb.setSun(sun, sun.dt, 'ha'); hb.buildImage();
    x.fillStyle = '#1a0806'; x.fillRect(0, 0, W, W);
    const n = hb.img.width; x.drawImage(hb.img, c - n / 2, c - n / 2, n, n);
    if (T.store.now() > (m.flareAt || 0) + 1200) {
      const g = sun.groups.find(q => q.id === sun.flareGroup), sp = M.spotsOn(sun, sun.dt).filter(s => s.g === g.id);
      const fx = sp.reduce((a, s) => a + s.x, 0) / sp.length, fy = sp.reduce((a, s) => a + s.y, 0) / sp.length, R = W * 0.43;
      const k = 0.7 + 0.3 * Math.sin(performance.now() / 120);
      const gr = x.createRadialGradient(c + fx * R, c - fy * R, 0, c + fx * R, c - fy * R, 60);
      gr.addColorStop(0, `rgba(255,255,230,${k})`); gr.addColorStop(1, 'rgba(255,200,150,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(c + fx * R, c - fy * R, 60, 0, 7); x.fill();
    }
  }

  function teacherLoop() {
    let last = 0;
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now();
      if (!T.meta) return;
      if (T.world) {
        T.world.setSun(skyNow(T.meta, T.store.now()));
        if (T.podiumT && now > T.podiumT) {
          T.podiumT = 0;
          const top = activePlayers(T.players, T.meta).sort((a, b) => (b[1].sc || 0) - (a[1].sc || 0)).slice(0, 3).map(([id, p]) => ({id, name: p.name, team: p.team}));
          if (top.length) { T.world.showPodium(top); T.world.setCamera('podium'); }
        }
      }
      if (now - last < 250) return;
      last = now;
      if (T.dirty) {
        T.dirty = false;
        if (T.world) {
          const show = {};
          activePlayers(T.players, T.meta).forEach(([id, p]) => { if (p.on !== false) show[id] = p; });
          T.world.setPlayers(show, null);
        }
        // 소식: 학생들의 눈에 띄는 일
        activePlayers(T.players, T.meta).forEach(([id, p]) => {
          if (p.ev && p.ev.t && p.ev.t !== T.lastEv[id]) {
            const fresh = T.lastEv[id] !== undefined || T.store.now() - p.ev.t < 5000;
            T.lastEv[id] = p.ev.t;
            if (fresh && T.store.now() - p.ev.t < 8000) feed(`${team(p.team).icon} ${p.name}  ${p.ev.pop}`, p.ev.c);
          }
        });
        // 우리 반 목표 달성 → 황금 망원경
        const g = goalOf(T.players, T.meta);
        if (!T.meta.gold && g.hits >= g.goal && T.meta.phase !== 'lobby') {
          T.store.update(T.base + '/meta', {gold: true});
          showBanner('🏆 우리 반 목표 달성!', '모두의 망원경이 황금으로', false);
          Sound.play('fanfare');
        }
        if (T.world) T.world.setGold(!!T.meta.gold);
        renderTeacher();
      } else if (T.meta.phase === 'flare') renderLeft(T.meta, activePlayers(T.players, T.meta));
    };
    tick();
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   가상 학생 (미리 해 보기·혼자 연습)
  // ╚══════════════════════════════════════════════════════════╝
  class Bots {
    constructor(store, base, n, getMeta) {
      this.store = store; this.base = base; this.n = n; this.getMeta = getMeta; this.list = [];
    }
    start() {
      const names = M.BOT_NAMES.slice().sort(() => Math.random() - 0.5);
      for (let k = 0; k < this.n; k++) {
        setTimeout(() => {
          const m = this.getMeta(); if (!m) return;
          const id = 'bot' + k + '_' + randInt().toString(36).slice(0, 4);
          const b = {id, name: names[k % names.length], team: k % 4, st: 'lobby', sc: 0, az: rand(120, 230), alt: rand(5, 20), round: m.round, skill: rand(0.55, 1)};
          this.list.push(b);
          this.store.update(`${this.base}/players/${id}`, {name: b.name, team: b.team, on: true, joined: this.store.now(), az: b.az, alt: b.alt, st: 'lobby', sc: 0, r: m.round});
        }, 400 + k * rand(250, 700));
      }
      this.timer = setInterval(() => this.tick(), 450);
    }
    tick() {
      const m = this.getMeta();
      if (!m) return;
      const now = this.store.now(), sun = sunOf(m.seed), sky = skyNow(m, now), n1 = M.spotsOn(sun, 0);
      for (const b of this.list) {
        const upd = {};
        const go = (st, wait) => { b.st = st; b.next = now + wait * 1000; b.t0 = now; upd.st = st; };
        if (b.round !== m.round) { Object.assign(b, {round: m.round, st: 'lobby', sc: 0, marks: null, found: 0, dust: 0, rot: null, fl: null}); upd.r = m.round; }
        const score = d => { b.sc = Math.max(0, b.sc + d); upd.sc = b.sc; };
        const pop = (text, c) => { upd.ev = {pop: text, c: c || '#ffd43b', t: now}; };
        if (Math.random() < 0.012) upd.em = {e: M.EMOJIS[Math.floor(Math.random() * M.EMOJIS.length)], t: now};
        const ph = m.phase;
        if (ph === 'lobby') {
          if (b.st !== 'lobby') { b.st = 'lobby'; upd.st = 'lobby'; upd.al = false; upd.cap = false; }
          if (Math.random() < 0.08) { b.az += rand(-15, 15); b.alt = clamp(b.alt + rand(-6, 6), 2, 60); upd.az = +b.az.toFixed(1); upd.alt = +b.alt.toFixed(1); }
        } else if (ph === 'd1') {
          if (!M.DAY1_STAGES.includes(b.st)) { go('prep', rand(2, 6)); b.pers = M.personal(b.id, sun); b.az = b.pers.aim0.az; b.alt = b.pers.aim0.alt; upd.az = b.az; upd.alt = b.alt; upd.al = false; }
          else if (b.st === 'prep' && now > b.next) { if (Math.random() < 0.12) { score(M.SCORE.eye); pop('🙈 태양 직접 봄!', '#ff6b6b'); } score(M.SCORE.prep); upd.cap = true; go('aim', rand(7, 26) / b.skill); b.from = {az: b.az, alt: b.alt}; }
          else if (b.st === 'aim') {
            const k = clamp((now - b.t0) / (b.next - b.t0), 0, 1), e = 1 - (1 - k) ** 2, wob = (1 - k) * 6;
            b.az = b.from.az + (sky.az - b.from.az) * e + Math.sin(now / 700 + b.alt) * wob;
            b.alt = b.from.alt + (sky.alt - b.from.alt) * e + Math.cos(now / 900) * wob * 0.5;
            upd.az = +b.az.toFixed(2); upd.alt = +b.alt.toFixed(2);
            if (k >= 1) { const sec = (b.next - b.t0) / 1000; score(M.aimScore(sec)); pop(`🎯 ${sec.toFixed(1)}초`); upd.al = true; go('focus', rand(3, 10)); }
          } else if (b.st === 'aim' || b.st === 'focus' || b.st === 'dir' || b.st === 'sketch') { upd.az = +sky.az.toFixed(2); upd.alt = +sky.alt.toFixed(2); }
          if (b.st === 'focus' && now > b.next) { score(Math.round(rand(120, 200))); go('dir', rand(3, 8)); }
          else if (b.st === 'dir' && now > b.next) { score(Math.random() < 0.75 ? M.SCORE.dirFirst : M.SCORE.dirLater); go('sketch', rand(25, (m.sk || 75) - 3)); b.marks = []; b.found = 0; b.dust = 0; b.goalN = Math.round(n1.length * clamp(rand(0.5, 1.05) * b.skill + 0.15, 0.3, 1)); b.order = n1.slice().sort(() => Math.random() - 0.5); }
          else if (b.st === 'sketch') {
            const k = clamp((now - b.t0) / (b.next - b.t0), 0, 1), want = Math.floor(k * b.goalN);
            let changed = false;
            while (b.found < want) {
              const s = b.order[b.found++];
              b.marks.push({x: s.x + rand(-0.012, 0.012), y: s.y + rand(-0.012, 0.012), k: s.id});
              score(M.SPOT_PTS[s.kind] + (Math.random() < 0.3 ? 15 : 0)); changed = true;
            }
            if (Math.random() < 0.015 && b.dust < 2) { const q = b.pers.dust[b.dust]; if (q) { b.marks.push({x: q.x / M.BOARD_SUN, y: q.y / M.BOARD_SUN, k: 'd'}); b.dust++; score(M.SCORE.dust); changed = true; } }
            if (changed) { upd.mk = M.encodeMarks(b.marks); upd.hits = b.found; }
            if (b.found >= 5 && b.found === want && Math.random() < 0.02) pop(`🔥 ${b.found}콤보!`, '#ff8a1a');
            if (k >= 1) { if (b.found >= n1.length) { score(M.SCORE.perfect); pop('💯 완벽 관측!'); } upd.d1 = {f: b.found, n: n1.length, d: b.dust}; go('done1', 0); }
          }
        } else if (ph === 'r1') {
          if (M.DAY1_STAGES.includes(b.st) && b.st !== 'done1') { upd.d1 = {f: b.found || 0, n: n1.length, d: b.dust || 0}; go('done1', 0); }
        } else if (ph === 'd2') {
          if (!b.pers) b.pers = M.personal(b.id, sun);
          if (!M.DAY2_STAGES.includes(b.st)) { go('aim2', rand(5, 15) / b.skill); b.from = {az: sky.az + rand(-8, 8), alt: sky.alt + rand(-4, 4)}; upd.al = false; }
          else if (b.st === 'aim2') {
            const k = clamp((now - b.t0) / (b.next - b.t0), 0, 1);
            b.az = b.from.az + (sky.az - b.from.az) * k; b.alt = b.from.alt + (sky.alt - b.from.alt) * k;
            upd.az = +b.az.toFixed(2); upd.alt = +b.alt.toFixed(2);
            if (k >= 1) { score(Math.round(M.aimScore((b.next - b.t0) / 1000) / 2)); upd.al = true; go('find', rand(6, 22) / b.skill); }
          } else if (b.st === 'find') {
            upd.az = +sky.az.toFixed(2); upd.alt = +sky.alt.toFixed(2);
            if (now > b.next) {
              const d2 = M.spotsOn(sun, sun.dt), rot = {};
              b.pers.track.forEach((id, i) => {
                if (i === 1 && Math.random() < 0.3) return;
                const s = d2.find(q => q.id === id); if (!s) return;
                const P = M.rotationPeriod(s.lat) * (1 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.08);
                rot[i ? 'b' : 'a'] = {lat: s.lat, P: +P.toFixed(2), x2: +s.x.toFixed(3), y2: +s.y.toFixed(3)};
                score(M.SCORE.find + M.rotScore(P, M.rotationPeriod(s.lat)));
                if (i === 0) pop(`⭐ ${P.toFixed(1)}일`);
              });
              upd.rot = rot; go('done2', 0);
            }
          }
        } else if (ph === 'r2') {
          if (b.st !== 'done2') go('done2', 0);
        } else if (ph === 'flare') {
          if (b.st !== 'flare') { go('flare', 0); b.flT = (m.flareAt || now) + 1200 + rand(900, 9000) / b.skill; b.flDone = false; }
          else if (!b.flDone && now > b.flT) {
            b.flDone = true;
            if (Math.random() < 0.85) { const s = (b.flT - (m.flareAt + 1200)) / 1000; score(M.flareScore(s)); upd.fl = {ok: 1, s: +s.toFixed(2)}; pop(`⚡ ${s.toFixed(1)}초!`); }
            else upd.fl = {ok: 0};
          }
        } else if (ph === 'night') {
          if (b.st !== 'night') go('night', 0);
          if (Math.random() < 0.04) upd.em = {e: ['🎉', '😱', '🌌', '👍'][Math.floor(Math.random() * 4)], t: now};
        }
        if (Object.keys(upd).length) this.store.update(`${this.base}/players/${b.id}`, upd);
      }
    }
  }

  // ── 혼자 연습: 이 기기 안에 방을 열고 가상 친구 11명과 함께 ─────────────────
  async function openSolo(name, teamIdx) {
    const store = await openStore('solo');
    const code = '0000', base = `${ROOT}/${code}`, now = store.now();
    await store.set(base + '/meta', {teacher: store.uid, created: now, phase: 'lobby', round: 1, seed: randInt(), sk: M.SKETCH_SEC, t0: now, solo: true});
    const bots = new Bots(store, base, 11, () => S.meta);
    await joinRoom(code, name || '나', teamIdx == null ? 0 : teamIdx, {store, solo: true});
    bots.start();
    setTimeout(() => { if (S.meta && S.meta.phase === 'lobby') toast('혼자 연습: 준비되면 아래 버튼으로 시작!', 2600); }, 600);
    // 대기실에서 시작 버튼
    const c = $('controls');
    const btn = document.createElement('button'); btn.className = 'primary big'; btn.textContent = '☀️ 1일째 관측 시작 ▶';
    btn.onclick = () => soloNext();
    c.appendChild(btn);
  }

  // ╔══════════════════════════════════════════════════════════╗
  //   처음 화면
  // ╚══════════════════════════════════════════════════════════╝
  function initEntry() {
    Wake.init();
    const saved = pref('me', {name: '', team: null});
    let chosen = saved.team;
    const picker = $('team-picker');
    picker.innerHTML = M.TEAMS.map((t, i) => `<button type="button" role="radio" aria-checked="${chosen === i}" style="--c:${t.color}" data-team="${i}"><span>${t.icon}</span>${t.name}</button>`).join('');
    picker.onclick = e => {
      const b = e.target.closest('button[data-team]'); if (!b) return;
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
      $('join-btn').disabled = true; $('join-btn').textContent = '연결 중…';
      joinRoom(code, name.slice(0, 8), chosen).finally(() => { $('join-btn').disabled = false; $('join-btn').textContent = '관측소 입장'; });
    };
    $('open-solo').onclick = () => { Sound.unlock(); openSolo($('join-name').value.trim().slice(0, 8) || '나', chosen == null ? Math.floor(Math.random() * 4) : chosen); };
    $('open-room').onclick = () => openRoom(false);
    $('open-demo').onclick = () => openRoom(true);
    if (params.has('solo')) openSolo(saved.name || '나', saved.team == null ? 0 : saved.team);
    else if (params.has('demo')) openRoom(true, params.get('host'));
    else if (params.get('host')) openRoom(false, params.get('host'));
    else if (room) $('join-name').focus();
  }

  if (params.has('debug')) window.__sunspot = {S, T, M, skyNow};
  initEntry();
})();
