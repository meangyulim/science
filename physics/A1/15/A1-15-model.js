/* A1-15 가속 좌표계와 관성력 — 계산 모형. 브라우저(window.A1_15)와 Node 테스트(tests/A1-15-model.test.cjs)에서 같이 쓴다.
   g = 10 m/s² (원고 값). 위·앞 방향을 + 로 잡는다.
   관성 좌표계(밖)에서는 실제 힘만으로 F = ma, 가속 좌표계(안)에서는 모든 물체에 관성력 −ma(좌표계 가속도의 반대쪽)를 더해 평형처럼 쓴다. */
(function (root) {
  'use strict';
  const G = 10;
  const RAD = Math.PI / 180;

  // ── 관성력과 두 관찰자 ───────────────────────────────────
  const inertial = (m, a) => -m * a;                       // 관성력 = −ma (가상의 힘, 반작용 없음)
  // 체중계 눈금 = 수직항력 N. 엘리베이터 가속도 ay (위 +). 바닥은 끌어당길 수 없으므로 0 아래로 내려가지 않는다
  const normal = (m, ay, g = G) => Math.max(0, m * (g + ay));
  // 같은 사람을 두 관찰자가 본 식: 밖 N − mg = m·ay (합력 = ma), 안 N − mg + (−m·ay) = 0 (평형)
  function elevatorViews(m, ay, g = G) {
    const N = normal(m, ay, g), W = m * g, Fi = inertial(m, ay);
    return {N, W, Fi, net: N - W, ma: m * ay, sumIn: N - W + Fi};
  }

  // ── 엘리베이터 구간: 운동 방향과 빨라지는지로 가속도 방향을 정한다 ──
  const PHASES = {
    upAcc: {name: '위로 가속', dir: 1, kind: 'acc'},
    upConst: {name: '위로 등속', dir: 1, kind: 'const'},
    upDec: {name: '위로 감속', dir: 1, kind: 'dec'},
    downAcc: {name: '아래로 가속', dir: -1, kind: 'acc'},
    downConst: {name: '아래로 등속', dir: -1, kind: 'const'},
    downDec: {name: '아래로 감속', dir: -1, kind: 'dec'},
    rest: {name: '정지', dir: 0, kind: 'rest'},
    free: {name: '자유 낙하', dir: -1, kind: 'free'},
  };
  // 가속도 방향 (+1 위, −1 아래, 0): 빨라지면 운동 방향, 느려지면 반대 방향
  function accelDir(key) {
    const p = PHASES[key];
    if (p.kind === 'acc') return p.dir;
    if (p.kind === 'dec') return -p.dir;
    if (p.kind === 'free') return -1;
    return 0;
  }
  const accelOf = (key, a, g = G) => (PHASES[key].kind === 'free' ? -g : accelDir(key) * a);   // ay (위 +)
  // 겉보기 무게 판정: 'heavier' (N > mg) · 'lighter' (N < mg) · 'same' · 'weightless' (N = 0)
  function apparent(key, a, g = G) {
    const ay = accelOf(key, a, g);
    if (g + ay <= 1e-9) return 'weightless';
    if (Math.abs(ay) < 1e-9) return 'same';
    return ay > 0 ? 'heavier' : 'lighter';
  }

  // 한 구간을 승강로 높이 D 안에서 되풀이해 보일 때의 운동 {T, ay, y(t), v(t)}. y = 아래 끝에서의 높이, v·ay 는 위 +
  const VC = 2;                                            // 등속 구간 속력 (m/s, 그림용)
  function phaseRun(key, a, D, g = G) {
    const p = PHASES[key], ay = accelOf(key, a, g), A = Math.abs(ay), y0 = p.dir < 0 ? D : 0;
    if (p.kind === 'rest' || ((p.kind === 'acc' || p.kind === 'dec') && A < 1e-9)) return {T: 2, ay: 0, y: () => y0, v: () => 0};
    if (p.kind === 'const') { const v = p.dir * VC; return {T: D / VC, ay: 0, y: (t) => y0 + v * t, v: () => v}; }
    if (p.kind === 'acc' || p.kind === 'free') return {T: Math.sqrt(2 * D / A), ay, y: (t) => y0 + 0.5 * ay * t * t, v: (t) => ay * t};
    const v0 = p.dir * Math.sqrt(2 * A * D);                // 감속: 처음 속도 v0 에서 D 를 가며 멈춘다
    return {T: Math.abs(v0) / A, ay, y: (t) => y0 + v0 * t + 0.5 * ay * t * t, v: (t) => v0 + ay * t};
  }
  // 한 번 운행: 정지 → 위로 가속 → 위로 등속 → 위로 감속 → 정지 → 아래로 가속 → 아래로 등속 → 아래로 감속.
  // 가속·감속 구간 거리 = H/4 (최고 속력 vm = √(aH/2), vmax 를 넘지 않게)
  function trip(a, H, o = {}) {
    const VMAX = o.vmax || 4, REST = o.rest == null ? 0.8 : o.rest, segs = [];
    let t = 0, y = 0;
    const push = (key, dur, v0, ay) => { segs.push({key, t0: t, t1: t + dur, y0: y, v0, ay}); y += v0 * dur + 0.5 * ay * dur * dur; t += dur; };
    if (!(a > 1e-9)) { push('rest', 4, 0, 0); return {segs, T: t, H: 0, vm: 0}; }
    const vm = Math.min(VMAX, Math.sqrt(a * H / 2)), ta = vm / a, tc = (H - vm * vm / a) / vm;
    push('rest', REST, 0, 0);
    push('upAcc', ta, 0, a); push('upConst', tc, vm, 0); push('upDec', ta, vm, -a);
    push('rest', REST, 0, 0);
    push('downAcc', ta, 0, -a); push('downConst', tc, -vm, 0); push('downDec', ta, -vm, a);
    return {segs, T: t, H, vm};
  }
  function tripAt(tr, t) {
    t = ((t % tr.T) + tr.T) % tr.T;
    const s = tr.segs.find((q) => t < q.t1) || tr.segs[tr.segs.length - 1], u = t - s.t0;
    return {key: s.key, seg: s, t, y: s.y0 + s.v0 * u + 0.5 * s.ay * u * u, v: s.v0 + s.ay * u, ay: s.ay};
  }

  // ── 버스 천장의 추(손잡이): 가속도 a (앞 +) ─────────────────
  const tiltDeg = (a, g = G) => Math.atan2(a, g) / RAD;    // 실이 연직선과 이루는 각 θ (tan θ = a/g, 가속도 반대쪽으로 기운다)
  const accelFromTan = (tanTh, g = G) => g * tanTh;
  const tension = (m, a, g = G) => m * Math.hypot(g, a);   // T = m√(g² + a²)
  // 추에 작용하는 힘 (x = 앞 +, y = 위 +). 밖: 장력 + 중력 = ma (합력), 안: 장력 + 중력 + 관성력 = 0
  function bobForces(m, a, g = G) {
    const th = Math.atan2(a, g), T = tension(m, a, g);
    const Tv = [T * Math.sin(th), T * Math.cos(th)], W = [0, -m * g], Fi = [inertial(m, a), 0];
    return {th, T, Tv, W, Fi, net: [Tv[0] + W[0], Tv[1] + W[1]], sumIn: [Tv[0] + W[0] + Fi[0], Tv[1] + W[1] + Fi[1]]};
  }
  // 유효 중력 가속도 g − a (벡터). 좌표계 가속도 (ax, ay) → 성분 [x, y] 와 크기
  function gEff(ax, ay, g = G) { const v = [-ax, -g - ay]; return {v, mag: Math.hypot(v[0], v[1])}; }
  const period = (l, ge) => (ge > 1e-9 ? 2 * Math.PI * Math.sqrt(l / ge) : Infinity);   // 단진자 주기 2π√(l/g_eff)
  // 수평 가속도 a 로 달리는 차 안, 바닥에서 h 인 곳에서 놓은 공: 안에서는 g_eff 방향 등가속도 직선 운동
  function dropInCar(h, a, g = G) { const t = Math.sqrt(2 * h / g); return {t, back: 0.5 * a * t * t, slope: a / g}; }
  // 밖에서 본 같은 공: 놓는 순간의 버스 속도 v0 로 수평 등속 + 연직 자유 낙하 (포물선). 놓은 점 기준 [x, y]
  const dropOutside = (h, v0, t, g = G) => [v0 * t, h - 0.5 * g * t * t];

  // ── 회전 좌표계: 원심력 = 인공 중력 ───────────────────────
  const artificialG = (r, w) => r * w * w;                 // rω²
  const centrifugal = (m, r, w) => m * r * w * w;          // 원심력 (바깥쪽, 회전 좌표계의 관성력)
  const omegaFor = (r, g = G) => Math.sqrt(g / r);         // rω² = g 가 되는 각속도
  const spinPeriod = (w) => (w > 0 ? 2 * Math.PI / w : Infinity);
  // 회전 우주선(반지름 R, 각속도 ω, 시계 반대 방향)에서 중심으로부터 r0 인 곳에서 놓은 공.
  // 관성계에서는 놓는 순간의 속도 ωr0 (접선)로 등속 직선 운동 → 바닥에 닿는 시간 t = √(R² − r0²)/(ωr0).
  // at(s): 놓은 뒤 s 초의 위치 — out = 관성계, rot = 우주선과 함께 도는 좌표계 (놓은 순간 두 좌표계가 겹친다)
  function stationDrop(R, r0, w, phi0 = -Math.PI / 2) {
    const t = Math.sqrt(R * R - r0 * r0) / (w * r0);
    const at = (s) => {
      const p = [r0 * Math.cos(phi0) - w * r0 * Math.sin(phi0) * s, r0 * Math.sin(phi0) + w * r0 * Math.cos(phi0) * s];
      const c = Math.cos(-w * s), sn = Math.sin(-w * s);
      return {out: p, rot: [p[0] * c - p[1] * sn, p[0] * sn + p[1] * c]};
    };
    const land = at(t), lag = phi0 - Math.atan2(land.rot[1], land.rot[0]);   // 발밑보다 뒤쪽(회전 반대쪽)으로 처진 각
    return {t, at, land, lag};
  }

  const api = {G, RAD, inertial, normal, elevatorViews, PHASES, accelDir, accelOf, apparent, VC, phaseRun, trip, tripAt,
    tiltDeg, accelFromTan, tension, bobForces, gEff, period, dropInCar, dropOutside,
    artificialG, centrifugal, omegaFor, spinPeriod, stationDrop};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.A1_15 = api;
})(typeof window !== 'undefined' ? window : globalThis);
