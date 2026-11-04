/* 자리 배치 시뮬레이션 — 화면과 분리한 계산 모형.
   브라우저에서는 window.SeatsModel, Node 에서는 require 로 쓴다 (tests/seats-model.test.cjs).

   교실 모양은 LAYOUTS 에 있다. 두 가지:
     room  보통 교실 — 두 줄씩 붙은 분단 셋. 복도 쪽 1분단은 두 줄 × 6자리 뒤에
           피라미드처럼 반 칸씩 엇갈린 세 칸(15자리), 2·3분단은 5자리씩 → 35자리
     hall  종합강의실 — 양끝 분단은 두 줄, 가운데 분단은 세 줄, 줄마다 6자리 → 42자리
   분단 사이에는 통로가 있다. 자리 이름은 '줄-번째' — 줄 k 는 복도 쪽이 0, 번째 r 은 칠판 쪽(맨 앞)이 0.
   보통 교실 1분단 맨 뒷줄 세 칸은 복도 벽 쪽부터 'e-6', '0-6', '1-6'.
   복도가 칠판 기준 왼쪽인지 오른쪽인지는 화면에서만 뒤집는다. 그래서 복도 위치를 바꿔도
   학생들이 골라 둔 자리('복도 쪽 둘째 줄 맨 앞' 같은)는 그대로 맞는다.

   한 학생의 만족도(0~1) = 친구 점수와 자리 점수를 선생님이 정한 비율로 섞은 값.
     친구 점수: 고른 친구(1·2·3순위 = 1, 0.8, 0.6)가 얼마나 가까운지. 짝 1, 앞뒤 0.75, 대각선 0.5, 통로 건너 옆 0.4 …
     자리 점수: 고른 자리(최대 3곳) 가운데 가장 가까운 곳까지의 거리로 정한다. 그 자리면 1.
   배치 전체의 점수 = 학생마다 √(만족도)를 더한 값. 제곱근이라 이미 만족한 학생을 더 만족시키기보다
   아무도 못 얻은 학생을 끌어올리는 쪽이 점수가 더 오른다 — 한두 명만 손해 보는 배치를 피한다.
   여기에 '떨어뜨리기' 짝이 가까우면 크게 깎고, 앞자리가 비면 조금 깎는다.
   이 점수가 가장 높은 배치를 담금질(simulated annealing)로 찾는다. */
(function(root) {
  'use strict';

  const MAX_FRIENDS = 3, MAX_WISHES = 3;
  const FRIEND_W = [1, 0.8, 0.6];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째'];

  // 두 자리가 얼마나 가까운가 — [번째 차이 0, 1, 2]
  const SAME_COL = [0, 0.75, 0.25];      // 같은 줄: 앞뒤, 두 칸 앞뒤
  const DESKMATE = [1, 0.5, 0.15];       // 같은 분단 바로 옆 칸: 짝, 대각선, 한 칸 건너 대각선
  const TWO_OVER = [0.25, 0.15, 0];      // 같은 분단 두 칸 옆 (세 줄 분단의 양 끝)
  const ACROSS = [0.4, 0.2, 0.05];       // 통로 건너 옆 — 짝보다 훨씬 멀다
  const FAR = [0.1, 0.05, 0];            // 통로 하나 건너 한 칸 더
  // 고른 자리에서 얼마나 가까운가 (통로 너비까지 친 실제 거리): 그 자리 1, 짝 자리·앞뒤 0.66, 통로 건너 0.35, 두 칸 0.19
  const WISH_SIGMA = 1.1;
  const WISH_W = [1, 0.85, 0.7];
  const wishAt = (seat, w) => Math.exp(-((seat.x - w.x) ** 2 + (seat.r - w.r) ** 2) / (2 * WISH_SIGMA * WISH_SIGMA));

  // ── 교실 ─────────────────────────────────────────────────────
  // def.groups: 분단마다 [줄마다 자리 수] (복도 쪽 분단부터). def.extra: 따로 붙은 자리.
  // 자리마다 g: 분단, c: 분단 안에서 몇째 줄, k: 복도 쪽부터 몇째 줄, x: 실제 가로 위치(책상 가운데, 책상 너비 1)
  function makeLayout(def) {
    const AISLE = def.aisle ?? 0.6;      // 통로 너비 (책상 너비를 1로 볼 때)
    const GROUP_X = [];
    let w = 0;
    for (const g of def.groups) { GROUP_X.push(w); w += g.length + AISLE; }
    let WIDTH = w - AISLE;               // 교실 바닥의 가로 너비
    const SEATS = [];
    const add = (id, g, c, k, r, extra) => SEATS.push({id, g, c, k, r, x: GROUP_X[g] + c + 0.5, extra: extra || null, i: SEATS.length});
    let k = 0;
    def.groups.forEach((cols, g) => cols.forEach((n, c) => { for (let r = 0; r < n; r++) add(k + '-' + r, g, c, k, r); k++; }));
    const COLS = k;
    for (const e of def.extra || []) add(e.id, e.g, e.c, e.k, e.r, e.name);
    // 따로 붙은 자리가 바깥(복도 벽 쪽)으로 튀어나오면 바닥을 그만큼 넓힌다
    const left = Math.min(0, ...SEATS.map(s => s.x - 0.5));
    if (left < 0) { for (const s of SEATS) s.x -= left; for (let g = 0; g < GROUP_X.length; g++) GROUP_X[g] -= left; }
    WIDTH = Math.max(...SEATS.map(s => s.x + 0.5));
    const NSEAT = SEATS.length;
    const ROWS_MAX = Math.max(...SEATS.map(s => s.r)) + 1;
    const SEAT = Object.fromEntries(SEATS.map(s => [s.id, s]));
    // 빈자리에 새 학생을 앉힐 때의 순서: 앞줄부터, 같은 줄에서는 복도 쪽부터
    const FILL_ORDER = SEATS.slice().sort((a, b) => a.r - b.r || a.x - b.x);
    function near(a, b) {
      const dr = Math.abs(a.r - b.r);
      if (dr > 2 || a === b) return 0;
      if (a.g === b.g) {
        // 칸 차이가 반 칸(피라미드처럼 엇갈린 맨 뒷줄)이면 두 값의 가운데
        const dc = Math.abs(a.c - b.c), T = [SAME_COL, DESKMATE, TWO_OVER];
        if (dc > 2) return 0;
        const lo = Math.floor(dc), f = dc - lo;
        return f ? T[lo][dr] * (1 - f) + T[lo + 1][dr] * f : T[lo][dr];
      }
      const dx = Math.abs(a.x - b.x);
      return dx < 1.7 ? ACROSS[dr] : dx < 2.7 ? FAR[dr] : 0;
    }
    const NM = new Float64Array(NSEAT * NSEAT);
    for (const a of SEATS) for (const b of SEATS) NM[a.i * NSEAT + b.i] = near(a, b);
    // 짝 자리와 앞뒤 자리 — 두 자리를 한 덩어리로 옮길 때 쓴다
    const NBRS = SEATS.map(a => SEATS.filter(b => NM[a.i * NSEAT + b.i] >= 0.75).map(b => b.i));
    // 사람이 읽는 자리 이름. 분단과 줄은 복도 쪽부터 센다.
    function seatName(id) {
      const s = SEAT[id];
      if (!s) return '';
      if (s.extra) return s.extra;
      const col = s.k === 0 ? '복도 쪽 줄' : s.k === COLS - 1 ? '창가 쪽 줄' : `복도에서 ${ORD[s.k]} 줄`;
      return `${s.g + 1}분단 ${col} · 앞에서 ${s.r + 1}번째`;
    }
    // 바로 옆(짝) 자리 쌍 — 넓은 교실에서 서로 모르는 학생끼리 딱 붙어 앉지 않게 할 때 쓴다
    const SIDE = [];
    for (const a of SEATS) for (const b of SEATS) if (a.i < b.i && NM[a.i * NSEAT + b.i] >= 1) SIDE.push([a.i, b.i]);
    // 양옆이 모두 짝 자리인 자리 (세 줄 분단의 가운데) — 양쪽에 다 사람이 앉으면 끼어 앉은 것
    const MIDDLE = [];
    for (const m of SEATS) { const sides = SEATS.filter(b => NM[m.i * NSEAT + b.i] >= 1).map(b => b.i); if (sides.length === 2) MIDDLE.push([m.i, sides[0], sides[1]]); }
    return {id: def.id, name: def.name, desc: def.desc, spread: !!def.spread, COLS, ROWS_MAX, AISLE, GROUP_X, WIDTH, SEATS, SEAT, NSEAT, FILL_ORDER, NM, NBRS, SIDE, MIDDLE, near, seatName};
  }
  const LAYOUTS = {
    room: makeLayout({
      id: 'room', name: '보통 교실', desc: '두 줄씩 분단 셋 · 복도 쪽 분단은 6줄 뒤에 피라미드처럼 3칸 (35자리)',
      // 1분단 맨 뒷줄은 피라미드처럼 두 칸 뒤에 세 칸 — 반 칸씩 엇갈려 양쪽으로 반 칸씩 튀어나온다
      groups: [[6, 6], [5, 5], [5, 5]],
      extra: [
        {id: 'e-6', g: 0, c: -0.5, k: 0, r: 6, name: '1분단 맨 뒤 세 칸 · 복도 벽 쪽'},
        {id: '0-6', g: 0, c: 0.5, k: 0, r: 6, name: '1분단 맨 뒤 세 칸 · 가운데'},
        {id: '1-6', g: 0, c: 1.5, k: 1, r: 6, name: '1분단 맨 뒤 세 칸 · 통로 쪽'}
      ]
    }),
    hall: makeLayout({
      id: 'hall', name: '종합강의실', desc: '양끝 두 줄, 가운데 세 줄 · 줄마다 6자리 (42자리) · 띄엄띄엄 앉혀요',
      groups: [[6, 6], [6, 6, 6], [6, 6]],
      // 자리가 넉넉하다: 서로 고르지 않은 학생끼리는 짝 자리에 붙이지 않고 띄엄띄엄, 그래도 너무 뒤로는 안 가게
      spread: true
    })
  };
  const layout = id => (id && typeof id === 'object' ? id : LAYOUTS[id]) || LAYOUTS.room;
  const ROOM = LAYOUTS.room;

  function relation(v) {
    if (v >= 1) return '짝';
    if (v >= 0.75) return '앞뒤';
    if (v >= 0.5) return '대각선';
    if (v >= 0.4) return '통로 건너 옆';
    if (v > 0) return '조금 떨어짐';
    return '멀어요';
  }
  // ── 명단 ─────────────────────────────────────────────────────
  // 한 줄에 한 명. "12 김민지", "12. 김민지", "12번 김민지", 엑셀에서 복사한 "12<탭>김민지", "김민지" 모두 된다.
  // 엑셀 명렬표 한 줄을 통째로 붙여도 된다 ("1<탭>1반<탭>1<탭>20101<탭>김하늘"): 이름 칸과 학번 칸을 찾아 쓰고,
  // 제목·머리글(연번 학급 번호 학번 성명 …)처럼 이름이 없는 줄은 건너뛴다.
  const HEADER = /^(연번|학급|반|번호|학번|성명|이름|확인|비고|성별)$/;
  const NAME = /^[가-힣]{2,5}$/;
  function fromFields(fields) {
    const name = fields.find(f => NAME.test(f) && !/반$/.test(f) && !HEADER.test(f));
    if (!name) return null;
    const num = fields.find(f => /^\d{5}$/.test(f)) || fields.filter(f => /^\d{1,4}$/.test(f)).pop();
    return {no: num ? +num : null, name};
  }
  const clean = name => name.replace(/[.#$\[\]\/]/g, '').slice(0, 12).trim();
  function parseRoster(text) {
    const out = [], seen = new Set();
    const push = p => { if (!p || !p.name) return; const k = p.no + '|' + p.name; if (!seen.has(k)) { seen.add(k); out.push(p); } };
    for (const raw of String(text || '').split(/\r?\n/)) {
      if (raw.includes('\t')) {
        const fields = raw.split('\t').map(f => f.replace(/[\s\u00a0]+/g, ' ').trim()).filter(Boolean);
        const p = fromFields(fields);
        if (p) { push({no: p.no, name: clean(p.name)}); continue; }
        if (fields.length > 2 || (fields.length === 1 && fields[0].length > 12)) continue;   // 제목·머리글 줄
      }
      const line = raw.replace(/[\s\u00a0]+/g, ' ').trim();
      if (!line) continue;
      let no = null, name = line;
      const m = line.match(/^(\d{1,5})\s*(?:번)?\s*[.):,-]?\s+(.+)$/) || line.match(/^(\d{1,5})(?:번|[.):])\s*(.+)$/);
      if (m) { no = +m[1]; name = m[2].trim(); }
      push({no, name: clean(name)});
    }
    return out;
  }
  // 엑셀 시트(행마다 칸 배열)를 명단으로
  const rosterFromRows = rows => parseRoster((rows || []).map(r => (r || []).map(c => c == null ? '' : String(c)).join('\t')).join('\n'));
  // 명단을 고쳐도 이미 들어온 학생의 열쇠(s01 …)가 바뀌지 않게, 같은 이름·번호면 예전 열쇠를 다시 쓴다.
  function assignKeys(list, old) {
    const prev = Object.entries(old || {});
    const used = new Set();
    let next = 1;
    for (const [k] of prev) { const n = +String(k).slice(1); if (n >= next) next = n + 1; }
    const fresh = () => { let k; do k = 's' + String(next++).padStart(2, '0'); while (used.has(k)); return k; };
    const out = {};
    const take = test => { const hit = prev.find(([k, v]) => !used.has(k) && test(v)); return hit ? hit[0] : null; };
    for (const p of list) {
      const k = take(v => v.name === p.name && (v.no ?? null) === (p.no ?? null)) || take(v => v.name === p.name) || fresh();
      used.add(k);
      out[k] = p.no == null ? {name: p.name} : {no: p.no, name: p.name};
    }
    return out;
  }
  // 번호 순(번호 없으면 뒤로), 같은 이름이 둘이면 번호를 붙여 구별한다
  function rosterList(roster) {
    const list = Object.entries(roster || {}).map(([key, v]) => ({key, no: v.no ?? null, name: v.name}));
    list.sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || a.key.localeCompare(b.key));
    const count = {};
    for (const s of list) count[s.name] = (count[s.name] || 0) + 1;
    for (const s of list) s.label = count[s.name] > 1 ? `${s.name}(${s.no ?? s.key})` : s.name;
    return list;
  }
  // 서버에는 짧은 글자로 보낸다: "s03,s07", "0-1,2-3"
  const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

  // ── 문제 만들기 ───────────────────────────────────────────────
  // students: [{key, friends: [key], wishes: [seatId]}],
  // opts: {layout: 'room'|'hall', fw: 친구 비중 0~1, locks: {key: seatId}, apart: [[key, key]]}
  function prepare(students, opts) {
    opts = opts || {};
    const L = layout(opts.layout), {SEAT, SEATS, NSEAT} = L;
    if (students.length > NSEAT) throw new Error(`자리는 ${NSEAT}개인데 학생이 ${students.length}명이에요.`);
    const keys = students.map(s => s.key);
    const idx = new Map(keys.map((k, i) => [k, i]));
    const fr = students.map((s, i) => {
      const seen = new Set();
      const list = [];
      for (const k of s.friends || []) {
        const j = idx.get(k);
        if (j === undefined || j === i || seen.has(j)) continue;
        seen.add(j);
        list.push(j);
      }
      return list.slice(0, MAX_FRIENDS).map((j, q) => [j, FRIEND_W[q]]);
    });
    const wish = students.map(s => {
      const w = [...new Set(s.wishes || [])].map(id => SEAT[id]).filter(Boolean).slice(0, MAX_WISHES);
      if (!w.length) return null;
      // 먼저 고른 자리일수록 무겁게 (★1 1, ★2 0.85, ★3 0.7)
      return Float64Array.from(SEATS, seat => Math.max(...w.map((x, q) => WISH_W[q] * wishAt(seat, x))));
    });
    const lockSeat = new Int16Array(students.length).fill(-1);
    const taken = new Set();
    students.forEach((s, i) => {
      const seat = opts.locks && SEAT[opts.locks[s.key]];
      if (seat && !taken.has(seat.i)) { lockSeat[i] = seat.i; taken.add(seat.i); }
    });
    // 떨어뜨리기 짝은 서로를 친구로 골랐더라도 그 바람은 빼고 계산한다 (못 이룰 바람이 만족도를 깎지 않게)
    const apart = [];
    for (const [a, b] of opts.apart || []) {
      const i = idx.get(a), j = idx.get(b);
      if (i === undefined || j === undefined || i === j) continue;
      apart.push([i, j]);
      for (const [x, y] of [[i, j], [j, i]]) {
        const q = fr[x].findIndex(([z]) => z === y);
        if (q >= 0) fr[x] = fr[x].filter((_, n) => n !== q).map(([z], n) => [z, FRIEND_W[n]]);
      }
    }
    const movable = SEATS.filter(s => !taken.has(s.i)).map(s => s.i);
    // 서로 한쪽이라도 친구로 고른 사이 (넓은 교실에서 '모르는 사이끼리 붙어 앉기' 감점에 쓴다)
    const n = students.length, likes = new Uint8Array(n * n);
    fr.forEach((list, i) => { for (const [j] of list) { likes[i * n + j] = 1; likes[j * n + i] = 1; } });
    // 넓은 교실에서 쓸 줄 수: 한 줄을 3/4쯤만 채운다고 보고 앞에서부터 (23명·한 줄 7자리 → 앞 5줄)
    const useRows = clamp(Math.ceil(n / (NSEAT / L.ROWS_MAX * 0.75)), 1, L.ROWS_MAX);
    return {L, n, keys, idx, fr, wish, likes, useRows, lockSeat, apart, movable, fw: clamp(opts.fw ?? 0.6, 0, 1)};
  }

  // occ: 자리 → 학생 번호(-1 은 빈자리). pos: 학생 → 자리.
  function posOf(prob, occ) {
    const pos = new Int16Array(prob.n).fill(-1);
    for (let s = 0; s < prob.L.NSEAT; s++) if (occ[s] >= 0) pos[occ[s]] = s;
    return pos;
  }

  // 한 학생의 만족도. 원하는 것을 아무것도 안 냈으면 null.
  function parts(prob, pos, i) {
    const f = prob.fr[i], w = prob.wish[i], {NM, NSEAT} = prob.L;
    let F = null, P = null;
    if (f.length) {
      let sum = 0, sw = 0;
      for (const [j, wt] of f) { sum += wt * NM[pos[i] * NSEAT + pos[j]]; sw += wt; }
      F = sum / sw;
    }
    if (w) P = w[pos[i]];
    const wf = F === null ? 0 : prob.fw, ww = P === null ? 0 : 1 - prob.fw;
    const s = wf + ww > 0 ? ((wf ? wf * F : 0) + (ww ? ww * P : 0)) / (wf + ww) : (F ?? P);
    return {F, P, s: F === null && P === null ? null : s};
  }
  const APART_PENALTY = 10, EMPTY_FRONT = 0.5, FRONT_PULL = 0.03, BEYOND = 0.8, SPREAD = 0.2, CROWD = 0.15;
  function score(prob, occ, pos) {
    pos = pos || posOf(prob, occ);
    const {NM, NSEAT, SEATS, ROWS_MAX} = prob.L;
    let t = 0;
    for (let i = 0; i < prob.n; i++) {
      const s = parts(prob, pos, i).s;
      if (s !== null) t += Math.sqrt(s + 0.01);
    }
    for (const [a, b] of prob.apart) t -= APART_PENALTY * NM[pos[a] * NSEAT + pos[b]];
    if (prob.L.spread) {
      // 넓은 교실: 앞 useRows 줄 안에서 띄엄띄엄 (수업 듣기 좋게 너무 뒤로는 안 가게)
      //  - 쓸 줄 안에서는 뒤로 갈수록 조금씩, 그보다 뒤는 크게 감점
      //  - 서로 고르지 않은 학생끼리 짝 자리에 붙으면 감점, 세 줄 분단 가운데에 양쪽이 다 차서 끼어 앉아도 감점
      const n = prob.n, U = prob.useRows;
      for (let s = 0; s < NSEAT; s++) if (occ[s] >= 0) { const r = SEATS[s].r; t -= FRONT_PULL * r + (r >= U ? BEYOND * (r - U + 1) : 0); }
      for (const [a, b] of prob.L.SIDE) { const x = occ[a], y = occ[b]; if (x >= 0 && y >= 0 && !prob.likes[x * n + y]) t -= SPREAD; }
      for (const [m, a, b] of prob.L.MIDDLE) if (occ[m] >= 0 && occ[a] >= 0 && occ[b] >= 0) t -= CROWD;
    } else {
      for (let s = 0; s < NSEAT; s++) if (occ[s] < 0) t -= EMPTY_FRONT * (1 - SEATS[s].r / ROWS_MAX);
    }
    return t;
  }

  // 고정한 학생을 고정한 자리로 옮긴다 (그 자리에 있던 학생은 고정 학생이 있던 자리로)
  function applyLocks(prob, occ) {
    occ = Int16Array.from(occ);
    const {FILL_ORDER} = prob.L;
    for (let i = 0; i < prob.n; i++) {
      const L = prob.lockSeat[i];
      if (L < 0) continue;
      const from = occ.indexOf(i);
      if (from === L) continue;
      const other = occ[L];
      occ[L] = i;
      if (from >= 0) occ[from] = other;
      else if (other >= 0) { const e = FILL_ORDER.find(s => occ[s.i] < 0 && prob.lockSeat.indexOf(s.i) < 0); if (e) occ[e.i] = other; }
    }
    return occ;
  }

  // 자리 이름 → 열쇠 지도({ '0-1': 's03' })를 occ 로. 자리가 없는 학생은 앞쪽 빈자리부터 앉힌다.
  function toOcc(prob, map) {
    const {SEAT, NSEAT, FILL_ORDER} = prob.L;
    const occ = new Int16Array(NSEAT).fill(-1);
    const placed = new Set();
    for (const [sid, key] of Object.entries(map || {})) {
      const s = SEAT[sid], i = prob.idx.get(key);
      if (s && i !== undefined && occ[s.i] < 0 && !placed.has(i)) { occ[s.i] = i; placed.add(i); }
    }
    for (let i = 0; i < prob.n; i++) {
      if (placed.has(i)) continue;
      const s = FILL_ORDER.find(x => occ[x.i] < 0);
      occ[s.i] = i;
    }
    return applyLocks(prob, occ);
  }
  function toMap(prob, occ) {
    const map = {}, {SEATS, NSEAT} = prob.L;
    for (let s = 0; s < NSEAT; s++) if (occ[s] >= 0) map[SEATS[s].id] = prob.keys[occ[s]];
    return map;
  }

  // ── 찾기 ─────────────────────────────────────────────────────
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randomOcc(prob, rand) {
    rand = rand || Math.random;
    const occ = new Int16Array(prob.L.NSEAT).fill(-1);
    const free = prob.movable.slice();
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    let q = 0;
    for (let i = 0; i < prob.n; i++) {
      if (prob.lockSeat[i] >= 0) occ[prob.lockSeat[i]] = i;
      else occ[free[q++]] = i;
    }
    return occ;
  }

  // 담금질: 두 자리를 바꿔 보고, 점수가 오르면 받아들인다. 내려가도 '온도'가 높을 때는 가끔 받아들여
  // 지금 배치에 갇히지 않게 한다. 온도는 차츰 내려간다. step(n) 으로 조금씩 돌릴 수 있어 화면에 보여 주기 좋다.
  class Annealer {
    constructor(prob, occ, o) {
      o = o || {};
      this.p = prob;
      this.occ = applyLocks(prob, occ || randomOcc(prob, o.rand));
      this.pos = posOf(prob, this.occ);
      this.iters = o.iters || 30000;
      this.T0 = o.T0 ?? 0.3;
      this.T1 = o.T1 ?? 0.002;
      this.rand = o.rand || Math.random;
      this.it = 0;
      this.cur = score(prob, this.occ, this.pos);
      this.best = this.cur;
      this.bestOcc = Int16Array.from(this.occ);
      this.canMove = new Uint8Array(prob.L.NSEAT);
      for (const i of prob.movable) this.canMove[i] = 1;
    }
    get T() { return this.T0 * Math.pow(this.T1 / this.T0, Math.min(1, this.it / this.iters)); }
    swap(a, b) {
      const occ = this.occ, x = occ[a], y = occ[b];
      occ[a] = y; occ[b] = x;
      if (x >= 0) this.pos[x] = b;
      if (y >= 0) this.pos[y] = a;
    }
    step(n) {
      const mv = this.p.movable, m = mv.length, rand = this.rand;
      if (m < 2 || !this.p.n) { this.it = this.iters; return true; }
      const end = Math.min(this.iters, this.it + n);
      while (this.it < end) {
        const T = this.T;
        this.it++;
        const a = mv[Math.floor(rand() * m)];
        let b = mv[Math.floor(rand() * (m - 1))];
        if (b === a) b = mv[m - 1];
        // 열에 셋은 한 자리끼리, 하나는 두 자리 덩어리끼리 바꾼다. 짝·앞뒤로 붙은 두 친구를
        // 한 번에 옮길 수 있어야 '한 명씩 옮기면 둘 다 잠깐 손해'인 자리에서 빠져나온다.
        let a2 = -1, b2 = -1;
        if (rand() < 0.25) {
          const na = this.p.L.NBRS[a], nb = this.p.L.NBRS[b];
          a2 = na[Math.floor(rand() * na.length)];
          b2 = nb[Math.floor(rand() * nb.length)];
          if (a2 === undefined || b2 === undefined || !this.canMove[a2] || !this.canMove[b2] || a2 === b || b2 === a || a2 === b2) a2 = b2 = -1;
        }
        if (this.occ[a] < 0 && this.occ[b] < 0 && (a2 < 0 || (this.occ[a2] < 0 && this.occ[b2] < 0))) continue;
        this.swap(a, b);
        if (a2 >= 0) this.swap(a2, b2);
        const ns = score(this.p, this.occ, this.pos), d = ns - this.cur;
        if (d >= 0 || rand() < Math.exp(d / T)) {
          this.cur = ns;
          if (ns > this.best + 1e-12) { this.best = ns; this.bestOcc = Int16Array.from(this.occ); }
        } else {
          if (a2 >= 0) this.swap(a2, b2);
          this.swap(a, b);
        }
      }
      return this.it >= this.iters;
    }
  }

  // 마무리: 두 자리를 바꿔서 나아지는 것이 하나도 없을 때까지 바꾼다
  function polish(prob, occ) {
    occ = Int16Array.from(occ);
    const pos = posOf(prob, occ), mv = prob.movable;
    let cur = score(prob, occ, pos);
    for (let pass = 0; pass < 30; pass++) {
      let better = false;
      for (let x = 0; x < mv.length; x++) for (let y = x + 1; y < mv.length; y++) {
        const a = mv[x], b = mv[y], p = occ[a], q = occ[b];
        if (p < 0 && q < 0) continue;
        occ[a] = q; occ[b] = p;
        if (p >= 0) pos[p] = b;
        if (q >= 0) pos[q] = a;
        const ns = score(prob, occ, pos);
        if (ns > cur + 1e-9) { cur = ns; better = true; continue; }
        occ[a] = p; occ[b] = q;
        if (p >= 0) pos[p] = a;
        if (q >= 0) pos[q] = b;
      }
      if (!better) break;
    }
    return occ;
  }

  // 한 번에 끝까지: 처음 배치(start)와 무작위 배치 여러 개에서 담금질 → 마무리 → 가장 좋은 것
  function optimize(prob, start, o) {
    o = o || {};
    const rand = o.rand || Math.random;
    let best = null, bestScore = -Infinity;
    const restarts = o.restarts ?? 4;
    for (let r = 0; r < restarts; r++) {
      const a = new Annealer(prob, r === 0 && start ? start : randomOcc(prob, rand), {iters: o.iters || 30000, rand, T0: o.T0, T1: o.T1});
      a.step(a.iters);
      const occ = polish(prob, a.bestOcc), sc = score(prob, occ);
      if (sc > bestScore) { bestScore = sc; best = occ; }
    }
    return best;
  }

  // ── 결과 읽기 ─────────────────────────────────────────────────
  function report(prob, occ) {
    const pos = posOf(prob, occ), {NM, NSEAT, SEATS} = prob.L;
    const people = [];
    let sum = 0, cnt = 0, min = null, withF = 0, hasF = 0, wishHit = 0, hasW = 0;
    for (let i = 0; i < prob.n; i++) {
      const p = parts(prob, pos, i);
      const friends = prob.fr[i].map(([j]) => ({key: prob.keys[j], near: NM[pos[i] * NSEAT + pos[j]]}));
      const nearCount = friends.filter(f => f.near >= 0.75).length;
      people.push({key: prob.keys[i], seat: SEATS[pos[i]].id, s: p.s, F: p.F, P: p.P, friends, nearCount, wishHit: p.P !== null && p.P >= 0.6});
      if (p.s !== null) { sum += p.s; cnt++; min = min === null ? p.s : Math.min(min, p.s); }
      if (friends.length) { hasF++; if (nearCount) withF++; }
      if (p.P !== null) { hasW++; if (p.P >= 0.6) wishHit++; }
    }
    const apartBad = prob.apart.filter(([a, b]) => NM[pos[a] * NSEAT + pos[b]] >= 0.5).length;
    return {people, byKey: Object.fromEntries(people.map(x => [x.key, x])), avg: cnt ? sum / cnt : null, min, count: cnt, withF, hasF, wishHit, hasW, apartBad};
  }

  // 보통 교실(room)의 값은 그대로 꺼내 둔다 (예전 코드·테스트가 M.SEATS 처럼 쓴다)
  const api = {
    LAYOUTS, layout, makeLayout,
    COLS: ROOM.COLS, ROWS_MAX: ROOM.ROWS_MAX, NSEAT: ROOM.NSEAT, SEATS: ROOM.SEATS, SEAT: ROOM.SEAT, FILL_ORDER: ROOM.FILL_ORDER,
    AISLE: ROOM.AISLE, WIDTH: ROOM.WIDTH, GROUP_X: ROOM.GROUP_X, near: ROOM.near, seatName: ROOM.seatName,
    MAX_FRIENDS, MAX_WISHES, FRIEND_W, wishAt, relation, parseRoster, rosterFromRows, assignKeys, rosterList, splitList,
    prepare, posOf, parts, score, applyLocks, toOcc, toMap, rng, randomOcc, Annealer, polish, optimize, report
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SeatsModel = api;
})(typeof self !== 'undefined' ? self : this);
