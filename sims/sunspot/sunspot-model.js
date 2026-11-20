/* 흑점 헌터스 — 계산 모형 (화면 코드 없음).
   브라우저에서는 window.SunspotModel, Node 시험(tests/sunspot-model.test.cjs)에서는 module.exports.
   차등 자전·원반 위 위치·자전 주기 계산은 태양 관측소(sims/sun/sun-model.js)의 것을 그대로 쓴다.
   교과서: 천재교과서 『행성우주과학』 Ⅱ-01 태양의 광구와 대기 관측 (56~63쪽). */
(function(root) {
  'use strict';
  const SM = (typeof module !== 'undefined' && module.exports) ? require('../sun/sun-model.js') : root.SunModel;
  const {D2R, R2D, clamp, omegaDeg, rotationPeriod, project, rng, angDist} = SM;

  // ── 고정값 ───────────────────────────────────────────────
  const SUN_RADIUS_DEG = 0.2666;   // 하늘에서 본 태양의 겉보기 반지름(°) — 지름 약 0.53°
  const DRIFT = 0.06;              // 추적 모터를 끄면 태양이 서쪽으로 흘러가는 빠르기(°/초). 실제(0.004°/초)보다 15배 빠르게.
  const BOARD_SUN = 0.86;          // 가운데에 맞췄을 때 투영판 반폭(=1)에 대한 태양 상의 반지름
  const ALIGN_TOL = 0.1;           // 조준 완료: 태양 상의 중심이 투영판 가운데에서 태양 반지름의 0.1배 안
  const FOCUS_TOL = 0.04;          // 초점 완료: 초점 나사 값이 맞는 값에서 0.04 안 (0~1 눈금)
  const SKETCH_SEC = 75;           // 흑점 스케치 기본 시간(초)

  const TEAMS = [
    {name: '홍염', color: '#ff5a4e', icon: '🔥'},
    {name: '코로나', color: '#f2b200', icon: '👑'},
    {name: '오로라', color: '#14b886', icon: '🌌'},
    {name: '태양풍', color: '#3d8bff', icon: '💨'}
  ];
  const EMOJIS = ['👋', '🔥', '😂', '😱', '👍', '☀️', '❄️', '🎉'];
  const BOT_NAMES = ['햇살', '흑점이', '쌀알', '광구', '채층', '홍염이', '코로나', '플레어', '자기장', '태양풍',
    '관측왕', '별빛', '은하수', '혜성', '유성', '오로라', '일식', '망원경', '흑점왕', '선스팟',
    '스펙트럼', '적색편이', '성운', '초신성', '중성자', '퀘이사', '감마선', '펄서'];

  // 단계 — 학생 화면이 이 순서로 나아간다. 선생님 화면의 진행 칩도 같은 이름을 쓴다.
  const STAGES = {
    lobby: {label: '대기실', icon: '⏳'},
    prep: {label: '안전 준비', icon: '🧢'},
    aim: {label: '조준', icon: '🎯'},
    focus: {label: '초점', icon: '🔍'},
    dir: {label: '방향', icon: '🧭'},
    sketch: {label: '흑점 스케치', icon: '✏️'},
    done1: {label: '1일째 완료', icon: '✅'},
    aim2: {label: '다시 조준', icon: '🎯'},
    find: {label: '흑점 추적', icon: '⭐'},
    done2: {label: '자전 주기 완료', icon: '✅'},
    flare: {label: '플레어 경보', icon: '⚡'},
    night: {label: '오로라 밤', icon: '🌌'},
    play: {label: '눈밭 놀이터', icon: '⛄'}
  };
  const DAY1_STAGES = ['prep', 'aim', 'focus', 'dir', 'sketch', 'done1'];
  const DAY2_STAGES = ['aim2', 'find', 'done2'];

  // 문자열 → 32비트 정수 (FNV-1a). 학생마다 다른 먼지·초점 위치를 uid 로 정한다.
  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  // ── 태양 하나 만들기 ──────────────────────────────────────────
  // 같은 seed 는 반 전체에서 같은 태양이 된다. 날짜 0 = 1일째, 날짜 dt = 두 번째 관측.
  // 흑점은 무리(그룹)를 지어 나온다: 서쪽(앞)의 큰 선행 흑점, 동쪽(뒤)의 후행 흑점, 작은 흑점(포어).
  // 모든 큰 흑점은 두 관측 모두 경도 ±66° 안에 있어 원반 가장자리에 너무 붙지 않는다.
  // 어떤 두 흑점도 겹쳐 보이지 않는다: 그려지는 반지름(visR)끼리 GAP 이상 떨어뜨린다.
  // (겹치면 눈에는 흑점 하나인데 찍어야 할 흑점은 둘이 되어 버린다)
  const EDGE = 66;
  const VIS_K = 1.14;   // 반암부는 불규칙한 타원 다섯 개로 그려서 바깥 끝이 반지름의 약 1.14배까지 나온다(sunspot-board.js)
  const GAP = 2.2;      // 흑점 가장자리끼리 띄우는 최소 간격(°) — 폰 화면에서도 작은 흑점 둘이 붙어 보이지 않게
  const visR = s => Math.max(VIS_K * s.penumbra, s.umbra);   // 그려지는 반지름(°)
  function makeSun(seed) {
    const r = rng(seed);
    const uni = (a, b) => a + r() * (b - a);
    const dt = r() < 0.5 ? 3 : 4;
    const bands = [[3, 10], [11, 19], [20, 28], [29, 36]];
    for (let i = bands.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bands[i], bands[j]] = [bands[j], bands[i]]; }
    if (r() < 0.6) bands.push([6, 24]);
    const groups = [], spots = [];
    let sid = 0;
    const clash = (lat, lon, min) => groups.some(g => angDist(g.lat, g.lon0, lat, lon) < min ||
      angDist(g.lat, g.lon0 + omegaDeg(g.lat) * dt, lat, lon + omegaDeg(lat) * dt) < min);
    // 새 흑점 c 가 이미 있는 모든 흑점과 두 관측 모두에서 떨어져 보이는지
    const fits = c => spots.every(o => [0, dt].every((day, i) => {
      const live = d => (i === 0 ? d.day1 : d.day2);
      if (!live(o) || !live(c)) return true;
      const k = day ? Math.max(o.grow, c.grow, 1) : 1;
      const d = angDist(o.lat, o.lon0 + omegaDeg(o.lat) * day, c.lat, c.lon0 + omegaDeg(c.lat) * day);
      return d >= (visR(o) + visR(c)) * k + GAP;
    }));
    const make = (g, kind, lat, lon0, umbra, pen, life) => ({id: -1, g, kind, lat: +lat.toFixed(2), lon0: +lon0.toFixed(2),
      umbra: +umbra.toFixed(3), penumbra: +pen.toFixed(3), shape: [r(), r(), r(), r(), r()],
      grow: g >= 0 ? +uni(0.85, 1.15).toFixed(3) : 1, day1: life !== 2, day2: life !== 1});
    const put = (c, grp) => { c.id = sid++; spots.push(c); if (grp) grp.spots.push(c.id); return c; };
    bands.forEach(([a, b]) => {
      for (let k = 0; k < 300; k++) {
        const lat = +((r() < 0.5 ? -1 : 1) * uni(a, b)).toFixed(2);
        const move = omegaDeg(lat) * dt;
        const lon0 = uni(-EDGE + 9, EDGE - move);
        if (clash(lat, lon0, 17)) continue;
        const U = uni(1.4, 2.2);
        const lead = make(groups.length, 'leader', lat, lon0, U, U * uni(1.9, 2.3), 0);
        if (!fits(lead)) continue;
        const g = {id: groups.length, lat: lead.lat, lon0: lead.lon0, move, P: rotationPeriod(lat), spots: []};
        groups.push(g);
        put(lead, g);
        const sgn = lat < 0 ? -1 : 1;
        // 후행 흑점: 동쪽(뒤)으로 떨어져서, 조금 더 높은 위도에
        if (r() < 0.85) {
          const u = uni(0.9, 1.4), pr = u * uni(1.8, 2.2);
          for (let t = 0; t < 30; t++) {
            const c = make(g.id, 'follower', lat + sgn * uni(0.8, 3), lon0 - uni(8.5, 13), u, pr, 0);
            if (fits(c)) { put(c, g); break; }
          }
        }
        // 작은 흑점(포어): 무리 둘레에 흩어져서. 몇 개는 둘째 관측 때 사라지고, 새로 생기기도 한다
        const pore = life => {
          for (let t = 0; t < 40; t++) {
            const c = make(g.id, 'pore', lat + sgn * uni(-3, 5), lon0 - uni(-2, 17), uni(0.6, 0.9), 0, life);
            if (fits(c)) { put(c, g); return; }
          }
        };
        const nPore = Math.floor(uni(0, 2.6));
        for (let p = 0; p < nPore; p++) pore(r() < 0.5 ? 1 : 0);
        if (r() < 0.5) pore(2);   // 둘째 관측 때 새로 생긴 작은 흑점
        break;
      }
    });
    // 무리를 이루지 않은 작은 흑점 하나
    for (let k = 0; k < 300; k++) {
      const lat = (r() < 0.5 ? -1 : 1) * uni(4, 30);
      const move = omegaDeg(lat) * dt, lon0 = uni(-EDGE + 4, EDGE - move);
      if (clash(lat, lon0, 13)) continue;
      const u = uni(0.8, 1.1);
      const c = make(-1, 'single', lat, lon0, u, u * uni(1.7, 2.1), 0);
      if (fits(c)) { put(c, null); break; }
    }
    // 하늘에서 태양의 자리(관측 시각이 달라서 두 날의 자리가 조금 다르다)
    const sky = [{az: uni(163, 171), alt: uni(27, 32)}, null];
    sky[1] = {az: sky[0].az + uni(5, 9), alt: sky[0].alt + uni(-2, 1.5)};
    // 플레어는 가장 큰 흑점 무리에서 (둘째 관측 날)
    const flareGroup = groups.slice().sort((a, b) => leaderOf(spots, b).penumbra - leaderOf(spots, a).penumbra)[0].id;
    return {seed, dt, groups, spots, sky, flareGroup};
  }
  const leaderOf = (spots, g) => spots.find(s => s.g === g.id && s.kind === 'leader');

  // 그날(0 = 1일째, sun.dt = 둘째 관측) 원반 위의 흑점들. x 서쪽(오른쪽) +, y 북쪽(위) +, z 관측자 쪽 + (태양 반지름 = 1)
  function spotsOn(sun, day) {
    const second = day > 0;
    return sun.spots.filter(s => second ? s.day2 : s.day1).map(s => {
      const lon = s.lon0 + omegaDeg(s.lat) * day;
      const p = project(s.lat, lon), k = second ? s.grow : 1;
      return {id: s.id, g: s.g, kind: s.kind, lat: s.lat, lon, x: p.x, y: p.y, z: p.z,
        umbra: s.umbra * k, penumbra: s.penumbra * k, shape: s.shape};
    }).filter(s => s.z > 0.12);
  }
  // 흑점을 찍었다고 인정하는 거리(태양 반지름 단위). minTol: 손가락 크기만큼의 최소 거리
  const hitTol = (s, minTol) => Math.max(Math.max(s.penumbra, s.umbra * 1.3) * D2R * 1.25, minTol);
  // 누른 곳에서 가장 가까운 흑점(인정 거리 안에 있을 때만)
  function hitTest(spots, x, y, minTol) {
    let best = null, bd = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= hitTol(s, minTol) && d < bd) { best = s; bd = d; }
    }
    return best ? {spot: best, dist: bd} : null;
  }

  // ── 학생 한 명에게만 있는 것 (uid 로 정함) ───────────────────────
  // 렌즈 먼지: 투영판에 붙어 있어서 태양 상이 움직여도 제자리에 있다. 투영판 좌표(반폭 = 1, 위 +)
  function personal(uid, sun) {
    const r = rng(hashStr(String(uid)) ^ (sun.seed * 2654435761 >>> 0));
    const uni = (a, b) => a + r() * (b - a);
    const f0 = uni(0.3, 0.7);
    const fStart = clamp(f0 + (r() < 0.5 ? -1 : 1) * uni(0.25, 0.32), 0, 1);
    const both = spotsOn(sun, 0).concat(spotsOn(sun, sun.dt));
    const dust = [];
    for (let k = 0; k < 400 && dust.length < 3; k++) {
      const a = r() * 2 * Math.PI, d = Math.sqrt(r()) * 0.74;
      const bx = Math.cos(a) * d, by = Math.sin(a) * d;
      const near = both.some(s => Math.hypot(s.x * BOARD_SUN - bx, s.y * BOARD_SUN - by) < 0.12) ||
        dust.some(q => Math.hypot(q.x - bx, q.y - by) < 0.25);
      if (!near) dust.push({x: +bx.toFixed(4), y: +by.toFixed(4), r: +uni(0.03, 0.045).toFixed(4), a: r()});
    }
    // 처음 망원경 방향: 태양에서 꽤 떨어진 곳
    const side = r() < 0.5 ? -1 : 1;
    const aim0 = {az: sun.sky[0].az + side * uni(28, 45), alt: uni(8, 16)};
    // 둘째 관측에서 따라갈 흑점: 무리 하나 + 위도가 가장 다른 보너스 무리 하나
    const gs = sun.groups;
    const g1 = gs[hashStr(String(uid) + ':g') % gs.length];
    const g2 = gs.filter(g => g !== g1).sort((a, b) => Math.abs(Math.abs(b.lat) - Math.abs(g1.lat)) - Math.abs(Math.abs(a.lat) - Math.abs(g1.lat)))[0];
    const track = [g1, g2].filter(Boolean).map(g => leaderOf(sun.spots, g).id);
    return {f0, fStart, dust, aim0, track};
  }

  // ── 망원경 조준의 기하 ─────────────────────────────────────────
  // 방위각 az: 북 0°, 동 90°, 남 180°, 서 270°. 3D 좌표: 북 +z, 서 +x, 위 +y
  function dirVec(az, alt) {
    const a = az * D2R, h = alt * D2R;
    return [-Math.sin(a) * Math.cos(h), Math.sin(h), Math.cos(a) * Math.cos(h)];
  }
  // 경통 방향에서 본 태양의 어긋남(°): x 오른쪽(서) +, y 위 +. sep: 둘 사이 각
  function tubeOffset(tel, sun) {
    const f = dirVec(tel.az, tel.alt), s = dirVec(sun.az, sun.alt);
    let rx = -f[2], rz = f[0];                          // f × (0,1,0)
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];   // u = r × f  (r = (rx, 0, rz)): 경통에서 본 '위'
    const sf = s[0] * f[0] + s[1] * f[1] + s[2] * f[2];
    const sr = s[0] * rx + s[2] * rz;
    const su = s[0] * ux + s[1] * uy + s[2] * uz;
    const sep = Math.acos(clamp(sf, -1, 1)) * R2D;
    return {x: Math.atan2(sr, sf) * R2D, y: Math.atan2(su, sf) * R2D, sep};
  }
  // 하늘의 태양: 시간이 지날수록 서쪽(방위각이 커지는 쪽)으로 간다. 고도는 남중(방위각 180°)할 때 가장 높다.
  const SKY_K = 0.012;
  function sunAt(base, sec) {
    const az = base.az + DRIFT * Math.max(0, sec);
    return {az, alt: base.alt + SKY_K * ((base.az - 180) ** 2 - (az - 180) ** 2)};
  }

  // ── 둘째 관측: 두 위치로 자전 주기 구하기 (교과서 60쪽 방법) ─────────────
  // p1, p2: 원반 좌표(태양 반지름 = 1, 서 +, 북 +). 학생이 실제로 찍은 자리로 계산하므로 측정 오차가 생긴다.
  function measureRotation(p1, p2, dt) {
    const m = SM.measureMarks(p1, p2, 1);
    const row = SM.rotationRow(dt, m.Rp, m.x, m.y, m.sameSide);
    return Object.assign({}, m, row, {lat: m.latDeg});
  }

  // ── 점수 ─────────────────────────────────────────────────
  const SCORE = {eye: -150, prep: 100, dirFirst: 150, dirLater: 50, dust: -40, empty: -10, perfect: 300, perSecLeft: 4, find: 100, wrongSpot: -20};
  const SPOT_PTS = {leader: 60, follower: 70, single: 80, pore: 90};
  const aimScore = sec => Math.round(100 + 200 * clamp(1 - (sec - 6) / 40, 0, 1));
  const focusScore = err => Math.round(100 + 100 * clamp(1 - err / FOCUS_TOL, 0, 1));
  const comboBonus = n => Math.min(75, 15 * Math.max(0, n - 1));
  // 잰 자전 주기가 그 위도의 참값에 얼마나 가까운가 (±20%를 넘으면 0)
  const rotScore = (P, Ptrue) => Math.round(400 * clamp(1 - Math.abs(P - Ptrue) / (0.2 * Ptrue), 0, 1));
  const flareScore = sec => Math.round(clamp(300 - 15 * sec, 60, 300));

  // ── 찍은 자리 줄이기 (실시간 서버로 보낼 때) ─────────────────────────
  // "x,y,k;…"  x·y 는 ×1000 정수, k: 흑점 번호(맞음) / d(먼지) / e(빈 곳)
  function encodeMarks(marks) {
    return marks.map(m => `${Math.round(m.x * 1000)},${Math.round(m.y * 1000)},${m.k}`).join(';');
  }
  function decodeMarks(str) {
    if (!str) return [];
    return String(str).split(';').map(t => {
      const [x, y, k] = t.split(',');
      return {x: +x / 1000, y: +y / 1000, k: /^\d+$/.test(k) ? +k : k};
    }).filter(m => isFinite(m.x) && isFinite(m.y));
  }

  // 반 전체의 자전 주기 자료 → 위도 띠별 평균 (선생님 화면 결과)
  function rotationSummary(points) {
    const ok = points.filter(p => isFinite(p.P) && p.P > 5 && p.P < 80);
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    const low = ok.filter(p => Math.abs(p.lat) < 15).map(p => p.P);
    const high = ok.filter(p => Math.abs(p.lat) >= 22).map(p => p.P);
    return {n: ok.length, all: mean(ok.map(p => p.P)), low: mean(low), high: mean(high), nLow: low.length, nHigh: high.length};
  }

  const api = {VIS_K, GAP, visR, SUN_RADIUS_DEG, DRIFT, BOARD_SUN, ALIGN_TOL, FOCUS_TOL, SKETCH_SEC, TEAMS, EMOJIS, BOT_NAMES, STAGES, DAY1_STAGES, DAY2_STAGES,
    hashStr, makeSun, spotsOn, hitTol, hitTest, personal, dirVec, tubeOffset, sunAt, measureRotation,
    SCORE, SPOT_PTS, aimScore, focusScore, comboBonus, rotScore, flareScore, encodeMarks, decodeMarks, rotationSummary,
    omegaDeg, rotationPeriod, leaderOf};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SunspotModel = api;
})(typeof window !== 'undefined' ? window : this);
