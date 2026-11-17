/* III1-05 생활 속 굴절 현상 — 계산 모형. 브라우저(window.III1_05)와 Node 테스트(tests/III1-05-model.test.cjs)에서 같이 쓴다.
   한 원칙: 파면의 느린 쪽 끝이 뒤처지므로 파동은 속력이 느린 쪽으로 휜다.
   좌표: x 오른쪽 +, y 위 + (지면·수면 y = 0). 진행 방향 각 ψ 는 +x 축에서 시계 반대 방향(라디안).
   층을 이룬 매질의 경로는 dψ/ds = −(v′/v)·cosψ 로 조금씩 꺾어 가며 구한다(교과 밖 식이라 화면에는 쓰지 않고 그림 계산에만 쓴다). */
(function (root) {
  'use strict';
  const DEG = Math.PI / 180;
  const N_WATER = 1.33;                       // 물의 굴절률 (공기 1)

  /* 소리의 속력: 기온이 높을수록 빠르다 (m/s, T 는 °C) */
  const soundSpeed = (T) => 331 + 0.6 * T;

  /* 느린 쪽 = 휘는 쪽. 아래(지면·수면 쪽) 속력 vBelow, 위쪽 속력 vAbove → 'down' | 'up' | 'none' */
  function slowSide(vBelow, vAbove) {
    const d = vAbove - vBelow;
    if (Math.abs(d) <= 1e-9 * Math.max(Math.abs(vBelow), Math.abs(vAbove), 1)) return 'none';
    return d > 0 ? 'down' : 'up';
  }
  const bendDir = slowSide;                   // 파동은 느린 쪽으로 휜다

  /* 층을 이룬 공기 (그림용 — 휘는 정도를 과장하려고 속력 차이에 K 를 곱한다)
     shape 'lin': 0~H 에서 기온이 고르게 변하고 그 위는 일정.  'exp': 지면 근처 두께 δ 의 층만 기온이 다름.
     v(y) = V0·(1 + K·(T(y) − Tref)) : 따뜻할수록 빠르다(소리도, 빛도). */
  function layered(Tg, Tt, o = {}) {
    const shape = o.shape || 'lin', H = o.H ?? 0.5, delta = o.delta ?? 0.08, K = o.K ?? 0.02, V0 = o.V0 ?? 1;
    const Tref = o.Tref ?? Tg;
    const T = shape === 'lin'
      ? (y) => Tg + (Tt - Tg) * Math.min(Math.max(y / H, 0), 1)
      : (y) => Tt + (Tg - Tt) * Math.exp(-Math.max(y, 0) / delta);
    const dT = shape === 'lin'
      ? (y) => (y > 0 && y < H ? (Tt - Tg) / H : 0)
      : (y) => (Tt - Tg) / delta * Math.exp(-Math.max(y, 0) / delta);
    const rel = (y) => Math.max(0.35, 1 + K * (T(y) - Tref));
    const v = (y) => V0 * rel(y);
    const dv = (y) => (1 + K * (T(y) - Tref) > 0.35 ? V0 * K * dT(y) : 0);
    return {T, v, dv, rel, Tg, Tt, shape, H, delta, K, V0};
  }

  /* 경로 따라가기 (중점법). 지면(y = 0)에서 ground = 'reflect' 면 반사, 'stop' 이면 멈춤.
     → {xs, ys, ts, ps, end}  ts = 걸린 시간, ps = 진행 방향 각 */
  function trace(prof, x0, y0, psi, o = {}) {
    const ds = o.ds ?? 0.004, ground = o.ground || 'reflect';
    const xmin = o.xmin ?? -Infinity, xmax = o.xmax ?? Infinity, ymax = o.ymax ?? Infinity, tmax = o.tmax ?? Infinity;
    const xs = [x0], ys = [y0], ts = [0], ps = [psi];
    const turn = (y, p) => -prof.dv(y) / prof.v(y) * Math.cos(p);
    let x = x0, y = y0, p = psi, t = 0, end = 'steps';
    for (let i = 0, n = o.maxSteps ?? 8000; i < n; i++) {
      const pm = p + 0.5 * ds * turn(y, p), ym = y + 0.5 * ds * Math.sin(p);
      let nx = x + ds * Math.cos(pm), ny = y + ds * Math.sin(pm), np = p + ds * turn(ym, pm);
      let dt = ds / prof.v(Math.max(ym, 0));
      if (ny < 0) {
        if (ground === 'reflect') { ny = -ny; np = -np; }
        else {
          const f = y / (y - ny);
          nx = x + f * (nx - x); ny = 0; dt *= f;
          xs.push(nx); ys.push(0); ts.push(t + dt); ps.push(p + f * (np - p));
          end = 'ground'; break;
        }
      }
      x = nx; y = ny; p = np; t += dt;
      xs.push(x); ys.push(y); ts.push(t); ps.push(p);
      if (x < xmin || x > xmax || y > ymax || t > tmax) { end = 'out'; break; }
    }
    return {xs, ys, ts, ps, end};
  }

  /* 경로 위에서 시각 τ 의 점 (없으면 null) */
  function at(ray, tau) {
    const ts = ray.ts, n = ts.length;
    if (!(tau >= 0) || tau > ts[n - 1]) return null;
    let a = 0, b = n - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (ts[m] <= tau) a = m; else b = m; }
    const f = ts[b] > ts[a] ? (tau - ts[a]) / (ts[b] - ts[a]) : 0;
    return {x: ray.xs[a] + f * (ray.xs[b] - ray.xs[a]), y: ray.ys[a] + f * (ray.ys[b] - ray.ys[a]), p: ray.ps[a] + f * (ray.ps[b] - ray.ps[a])};
  }

  /* 경로가 세로선 x = X 를 지나는 점 (층 매질에서 x 는 한 방향으로만 변한다) */
  function crossX(ray, X) {
    const xs = ray.xs, n = xs.length;
    for (let i = 1; i < n; i++) {
      if ((xs[i - 1] - X) * (xs[i] - X) <= 0 && xs[i] !== xs[i - 1]) {
        const f = (X - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return {y: ray.ys[i - 1] + f * (ray.ys[i] - ray.ys[i - 1]), p: ray.ps[i - 1] + f * (ray.ps[i] - ray.ps[i - 1]),
          t: ray.ts[i - 1] + f * (ray.ts[i] - ray.ts[i - 1]), i};
      }
    }
    return null;
  }

  /* 듣는 사람에게 닿는 소리의 상대 세기: 음원에서 위쪽으로 고르게 낸 경로 가운데 듣는 사람 둘레(높이 0~zone)를
     지나는 개수 ÷ 기온이 고를 때(직진)의 개수. 1보다 크면 더 잘 들리고, 0이면 소리가 닿지 않는다(소리 그늘). */
  function listenerLevel(prof, src, L, o = {}) {
    const N = o.N ?? 360, a1 = (o.maxDeg ?? 85) * DEG;
    let n = 0, n0 = 0;
    for (let k = 0; k < N; k++) {
      const psi = a1 * (k + 0.5) / N;
      const r = trace(prof, src.x, src.y, psi, {ds: o.ds ?? 0.004, xmax: L.x + 0.01, ymax: o.ymax ?? 3, ground: 'reflect'});
      const c = crossX(r, L.x);
      if (c && c.y >= 0 && c.y <= L.zone) n++;
      const y0 = src.y + (L.x - src.x) * Math.tan(psi);
      if (y0 <= L.zone) n0++;
    }
    return n / Math.max(1, n0);
  }

  /* 물체에서 나와 눈에 닿는 경로 찾기: 출발 각(수평에서 위 +)을 훑고 이분법으로 다듬는다.
     → [{el, psi, ray, arrive:{y,p}, image:{x,y}}]  image = 눈이 '직진했다고 여기고' 거꾸로 연장한 점 */
  function aim(prof, obj, eye, o = {}) {
    const dir = eye.x < obj.x ? -1 : 1;
    const lo = (o.lo ?? -60) * DEG, hi = (o.hi ?? 60) * DEG, Mn = o.M ?? 240;
    const box = {ds: o.ds ?? 0.003, ground: 'stop', xmin: Math.min(obj.x, eye.x) - 0.02, xmax: Math.max(obj.x, eye.x) + 0.02, ymax: o.ymax ?? 3};
    const psiOf = (el) => (dir > 0 ? el : Math.PI - el);
    const miss = (el) => {
      const r = trace(prof, obj.x, obj.y, psiOf(el), box);
      const c = crossX(r, eye.x);
      return c ? {d: c.y - eye.y, r, c} : null;
    };
    const out = [];
    let prev = null, prevEl = 0;
    for (let k = 0; k <= Mn; k++) {
      const el = lo + (hi - lo) * k / Mn, m = miss(el);
      if (m && prev && (m.d === 0 || m.d * prev.d < 0)) {
        let a = prevEl, b = el, fa = prev.d;
        for (let it = 0; it < 40; it++) {
          const c = (a + b) / 2, mc = miss(c);
          if (!mc) { b = c; continue; }
          if (mc.d * fa <= 0) b = c; else { a = c; fa = mc.d; }
        }
        const el0 = (a + b) / 2, m0 = miss(el0);
        if (m0) {
          const p = m0.c.p;
          out.push({el: el0, psi: psiOf(el0), ray: m0.r, arrive: {y: m0.c.y, p}, image: image(eye, p, obj.x)});
        }
      }
      prev = m; prevEl = el;
    }
    return out;
  }
  /* 눈 E 에 진행 방향 p 로 들어온 빛을 거꾸로 곧게 연장해 x = X 에 닿는 점 */
  function image(E, p, X) {
    const c = Math.cos(p);
    if (Math.abs(c) < 1e-9) return {x: X, y: NaN};
    const s = (E.x - X) / c;
    return {x: X, y: E.y - s * Math.sin(p)};
  }
  /* 신기루 경로: 눈에 닿는 경로 가운데 상이 실제 위치에서 가장 멀리 옮겨 보이는 것 */
  function mirage(prof, obj, eye, o) {
    const sols = aim(prof, obj, eye, o);
    let best = null;
    for (const s of sols) if (isFinite(s.image.y) && (!best || Math.abs(s.image.y - obj.y) > Math.abs(best.image.y - obj.y))) best = s;
    return {best, all: sols};
  }

  /* 한 경계(수면 y = 0)에서의 굴절: n1 sinθ1 = n2 sinθ2 (θ 는 법선과의 각, 도) */
  function snell(n1, n2, deg) {
    const s = n1 * Math.sin(deg * DEG) / n2;
    return Math.abs(s) > 1 ? NaN : Math.asin(s) / DEG;
  }
  /* 물체 O(굴절률 nO 쪽)에서 눈 E(nE 쪽)로 가는 빛이 수면에서 꺾이는 점의 x (스넬 조건을 이분법으로) */
  function crossPoint(O, E, nO, nE) {
    let a = Math.min(O.x, E.x), b = Math.max(O.x, E.x);
    if (b - a < 1e-12) return a;
    const f = (x) => nO * (x - O.x) / Math.hypot(x - O.x, O.y) - nE * (E.x - x) / Math.hypot(E.x - x, E.y);
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (f(m) > 0) b = m; else a = m; }
    return (a + b) / 2;
  }
  /* 보이는 위치: 눈의 두 점 E1, E2 로 들어온 두 광선을 눈 쪽에서 거꾸로 곧게 연장한 두 직선의 교점 */
  function apparent(O, E1, E2, nO, nE) {
    const x1 = crossPoint(O, E1, nO, nE), x2 = crossPoint(O, E2, nO, nE);
    const d1x = x1 - E1.x, d1y = -E1.y, d2x = x2 - E2.x, d2y = -E2.y;
    const det = -d1x * d2y + d1y * d2x;
    if (Math.abs(det) < 1e-14) return null;
    const rx = E2.x - E1.x, ry = E2.y - E1.y;
    const s = (-rx * d2y + ry * d2x) / det;
    return {x: E1.x + s * d1x, y: E1.y + s * d1y, x1, x2};
  }
  /* 거의 수직으로 볼 때 보이는 거리 = 실제 거리 × nE / nO (물 밖에서 보면 3/4 쯤, 물속에서 보면 1.33배) */
  const apparentNormal = (d, nO, nE) => d * nE / nO;
  /* 눈을 '보는 각' α(눈 쪽 매질에서 법선과의 각)와 꺾이는 점에서의 거리 L 로 놓기. dir = +1 이면 눈이 물체 오른쪽 */
  function placeEye(O, nO, nE, alphaDeg, L, dir = 1) {
    const phi = snell(nE, nO, alphaDeg);                  // 물체 쪽 각
    const xs = O.x + dir * Math.abs(O.y) * Math.tan(phi * DEG);
    const up = O.y < 0 ? 1 : -1;                          // 눈은 물체 반대편
    return {x: xs + dir * L * Math.sin(alphaDeg * DEG), y: up * L * Math.cos(alphaDeg * DEG), xs, phi};
  }

  const api = {DEG, N_WATER, soundSpeed, slowSide, bendDir, layered, trace, at, crossX, listenerLevel, aim, image, mirage,
    snell, crossPoint, apparent, apparentNormal, placeEye};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III1_05 = api;
})(typeof window !== 'undefined' ? window : globalThis);
