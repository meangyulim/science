const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../sims/star-motion/star-motion-model.js');
const D = require('../sims/star-motion/star-motion-data.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('tangential velocity: 4.74 built from ″ × pc = AU and 1 AU/년 (교과서 67쪽)', () => {
  close(M.travelAU(1, 1), 1);                              // 1 pc에서 1″ = 1 AU
  close(M.round(M.auPerYear(), 2), 4.74);                  // 1.496 × 10⁸ km ÷ 3.156 × 10⁷ s
  close(M.auPerYear(), M.K, 0.005);
  // 교과서 날개의 2πr / (360 × 60 × 60″) 유도와도 같은 값
  const kWing = 2 * Math.PI * 3.08e13 / (360 * 60 * 60) / (365 * 24 * 3600);
  close(kWing, 4.74, 0.01);
  // 활동지 Q1: 10 pc, 0.5″/년 → 23.7 km/s, 같은 접선 속도로 20 pc → 0.25″/년
  close(M.round(M.tangentialVelocity(0.5, 10), 1), 23.7);
  close(M.properMotion(M.tangentialVelocity(0.5, 10), 20), 0.25);
  // 거리가 2배면 고유 운동은 ½
  close(M.properMotion(90, 3.66) / M.properMotion(90, 1.83), 0.5);
});

test('Barnard photos: real Gaia motion, textbook and worksheet measurements (교과서 69쪽, 활동지)', () => {
  const B = D.barnard;
  close(M.round(M.totalProperMotion(B.pmra, B.pmdec), 2), 10.39);      // 교과서 10.3″/년
  close(M.round(1000 / B.plx, 2), 1.83);                                // 1.83 pc
  close(Math.round(B.rv * 10) / 10, -110.5);                            // −110.5 km/s
  // 교과서 69쪽: 2007.7.→2014.7. (7년) — 북쪽(위)으로, 약간 서쪽(오른쪽)으로 이동
  const a = M.barnardAt(B, M.yearOf(2007)), b = M.barnardAt(B, M.yearOf(2014));
  assert.ok(b.y - a.y > 70 && b.x < a.x);
  const sep7 = M.separation(a, b);
  close(sep7, 72.75, 0.05);
  close(M.round(M.properMotionFromPhotos(sep7, 7), 1), 10.4);
  // 활동지: 1985→2005년 이동 = 축척 막대(120″)의 약 1.73배 → μ ≈ 10.4″/년
  const sep20 = M.separation(M.barnardAt(B, M.yearOf(1985)), M.barnardAt(B, M.yearOf(2005)));
  close(M.round(sep20 / 120, 2), 1.73);
  close(M.round(120 * 1.73 / 20, 1), 10.4);
  // 주변 별은 30년 동안 1″도 움직이지 않는다 (사진에서 제자리)
  const field = D.field.map(M.fieldStar);
  const moved = field.map(s => M.separation(M.positionAt(s, 1985), M.positionAt(s, 2015)));
  assert.ok(moved.filter(d => d < 1).length / moved.length > 0.95);
  assert.ok(Math.max(...field.map(s => Math.hypot(s.pmx, s.pmy))) < 200);
  // 보름달 지름만큼 가는 데 약 175년 (1800″ ÷ 10.3″/년)
  close(Math.round(M.MOON_ARCSEC / 10.3), 175);
  assert.ok(M.dotRadius(8) > M.dotRadius(14) && M.dotRadius(14) > M.dotRadius(18));
});

test('radial velocity: Vr = c(λ − λ₀)/λ₀ and the sign (교과서 68쪽, 활동지 Q2·해 보기)', () => {
  close(M.radialVelocity(500.5, 500.0), 300);              // Q2 별 A: 멀어짐
  close(M.radialVelocity(499.8, 500.0), -120);             // Q2 별 B: 다가옴
  assert.equal(M.shiftOf(300), 'red');
  assert.equal(M.shiftOf(-120), 'blue');
  assert.equal(M.shiftOf(0), 'none');
  // 바너드별 칼슘 흡수선: λ₀ = 612.22 nm, λ ≈ 612.00 nm → ≈ −108 km/s
  close(Math.round(M.radialVelocity(612.00, 612.22)), -108);
  // 교과서 값 −110.5 km/s이면 λ ≈ 611.99 nm
  close(M.round(M.observedWavelength(-110.5, 612.22), 2), 611.99);
  close(M.radialVelocity(M.observedWavelength(-73, 500), 500), -73);
  // 자유 실험: 30 km/s마다 0.05 nm
  close(M.observedWavelength(30, 500) - 500, 0.05);
  close(M.lineProfile(612.0, 612.0), 0.38);
  assert.ok(M.lineProfile(612.3, 612.0) > 0.99);
});

test('space velocity: Barnard worked example and worksheet values (교과서 69쪽 해 보기)', () => {
  const vt = M.tangentialVelocity(10.3, 1.83);
  close(M.round(vt, 1), 89.3);
  const V = M.spaceVelocity(vt, -110.5);
  close(M.round(V, 1), 142.1);
  // tan θ = Vt / Vr — 다가오는 별은 θ > 90°
  const th = M.thetaDeg(vt, -110.5);
  close(Math.tan(th * M.DEG), vt / -110.5, 1e-9);
  assert.ok(th > 90 && th < 180);
  close(Math.round(th), 141);
  // 활동지 측정값: 4.74 × 10.4 × 1.83 ≈ 90, √(90² + 108²) ≈ 141
  close(Math.round(M.tangentialVelocity(10.4, 1.83)), 90);
  close(Math.round(M.spaceVelocity(90, -108)), 141);
  // 가장 가까워질 때: 약 1.15 pc(3.75광년), 약 1만 년 뒤
  const ca = M.closestApproach(1.83, vt, -110.5);
  close(M.round(ca.rMin, 2), 1.15);
  close(M.round(M.pcToLy(ca.rMin), 2), 3.75);
  assert.ok(ca.years > 9500 && ca.years < 10100);
  assert.equal(M.closestApproach(2, 50, 30).years, 0);
});

test('worksheet Q3: equal tangential speeds, the fastest radial star is the slowest in space', () => {
  const A = {r: 10, mu: 1.0, vr: 30}, B = {r: 20, mu: 0.5, vr: -40}, C = {r: 5, mu: 0, vr: 45};
  const vt = s => M.tangentialVelocity(s.mu, s.r), V = s => M.spaceVelocity(vt(s), s.vr);
  close(vt(A), 47.4, 1e-9); close(vt(B), 47.4, 1e-9);       // ㄱ ○
  close(V(C), 45);
  assert.ok(V(C) < V(A) && V(C) < V(B));                      // ㄴ ×
  close(Math.round(V(A)), 56); close(Math.round(V(B)), 62);
  assert.equal(M.shiftOf(B.vr), 'blue');                      // ㄷ ○
});

test('decomposition: same space velocity, different star positions (활동지 화살표 그림)', () => {
  const v = [100, 0];                                         // 네 별 모두 오른쪽으로
  const right = M.decompose(200, 0, ...v), left = M.decompose(-200, 0, ...v);
  const top = M.decompose(0, -160, ...v), low = M.decompose(-120, 120, ...v);
  close(right.vr, 100); close(right.vt, 0); close(right.theta, 0);
  close(left.vr, -100); close(left.vt, 0); close(left.theta, 180);
  close(top.vr, 0); close(top.vt, 100); close(top.theta, 90);
  close(low.vr, -100 / Math.SQRT2); close(low.vt, 100 / Math.SQRT2);
  for (const d of [right, left, top, low]) {
    close(d.v, 100);
    close(Math.hypot(d.vr, d.vt), d.v);                       // V² = Vt² + Vr²
    close(d.rx + d.tx, v[0]); close(d.ry + d.ty, v[1]);         // 시선 + 접선 = 공간 속도 (화살표의 합)
    close(d.tx * d.ux + d.ty * d.uy, 0);                      // 접선 속도는 시선 방향에 수직
  }
});

test('quiz: the right radial arrow = space − tangential and lies on the line of sight', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const q = M.makeQuiz(seed);
    const ans = q.options[q.answer].vec;
    close(ans[0], q.V[0] - q.Vt[0]); close(ans[1], q.V[1] - q.Vt[1]);
    close(ans[0] * q.u[1] - ans[1] * q.u[0], 0);               // 시선 방향과 나란하다
    close(q.Vt[0] * q.u[0] + q.Vt[1] * q.u[1], 0);             // 접선 속도 ⟂ 시선
    assert.equal(new Set(q.options.map(o => o.kind)).size, 4);
    assert.ok(Math.abs(q.vr) >= 45 && q.vt >= 55);
  }
  assert.deepEqual(M.makeQuiz(7), M.makeQuiz(7));
});

test('Big Dipper: SIMBAD data in 3D, today’s dipper and its change over 10만 년 (그림 11)', () => {
  const S = M.dipperStates(D.dipper), f = M.skyFrame(S.map(s => s.P));
  const ly = S.map(s => Math.round(M.pcToLy(s.r)));
  assert.deepEqual(ly, [123, 84, 83, 81, 83, 86, 104]);
  // 지금 모습: 동쪽이 왼쪽 — 알카이드가 가장 왼쪽(손잡이 끝), 두베·메라크가 오른쪽(국자 머리), 두베는 메라크의 북쪽
  const now = M.dipperSky(S, 0, f);
  const xs = now.map(p => p[0]);
  assert.equal(xs.indexOf(Math.min(...xs)), 6);
  assert.equal(xs.indexOf(Math.max(...xs)), 1);
  assert.ok(now[0][1] > now[1][1] + 4);
  // 고유 운동: 1년에 약 0.1″ (0.08~0.14″), 접선 속도는 초속 10~25 km
  for (const s of D.dipper) { const mu = Math.hypot(s[5], s[6]) / 1000; assert.ok(mu > 0.08 && mu < 0.14); }
  for (const s of S) assert.ok(s.vt > 10 && s.vt < 25);
  // 10만 년 동안: 가운데 다섯 별은 거의 같은 방향, 두베·알카이드는 반대쪽(서쪽)으로
  const mv = M.skyMotion(S, 0, 1e5, f);
  const five = [1, 2, 3, 4, 5], mean = five.reduce((m, i) => [m[0] + mv[i][0] / 5, m[1] + mv[i][1] / 5], [0, 0]);
  for (const i of five) assert.ok(M.angleBetween2D(mv[i], mean) < 12);
  assert.ok(mean[0] < 0);                                     // 다섯 별은 동쪽(왼쪽)으로
  assert.ok(M.angleBetween2D(mv[0], mean) > 150 && M.angleBetween2D(mv[6], mean) > 120);
  // 10만 년 뒤: 두베가 메라크의 오른쪽(서쪽)으로 넘어가 국자 머리가 벌어지고, 알카이드는 미자르보다 오른쪽으로 꺾인다
  const later = M.dipperSky(S, 1e5, f);
  assert.ok(now[0][0] < now[1][0] && later[0][0] > later[1][0] + 3);
  assert.ok(now[6][0] < now[5][0] && later[6][0] > later[5][0]);
  // 시선 속도로 거리도 조금 변한다 (−10 km/s × 10만 년 ≈ 1 pc)
  close(M.norm(M.stateAt(S[3], 1e5)) - S[3].r, -12.39 * 1e5 * M.PC_PER_KMS_YEAR, 0.05);
});

test('textbook p.70 table: distances and the view from Earth', () => {
  const P = D.tb70.map(r => [r[2], r[3], r[4]]);
  const pc = P.map(p => M.distancePc(...p));
  assert.deepEqual(pc.map(v => M.round(v, 1)), [31.9, 25.4, 25.3, 24.7, 25.5, 24.4, 37.7]);
  // 두베와 알카이드가 가장 멀다
  const order = pc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  assert.deepEqual(order.slice(0, 2), [6, 0]);
  // 광년 (1 pc ≈ 3.26광년): 지도서 값(104, 124광년)과 비교
  close(Math.round(M.pcToLy(pc[0])), D.tb70ly['알카이드']);
  assert.ok(Math.abs(M.pcToLy(pc[6]) - D.tb70ly['두베']) < 2);
  // 카메라가 지구에 있으면(yaw = pitch = 0) 표의 별들은 SIMBAD로 그린 지금의 하늘과 같은 모양이다
  const vf = M.viewFrame(P), cam = M.camera(0, 0, vf);
  close(M.norm(cam.pos), 0, 1e-9);
  const view = P.map(p => M.viewProject(p, cam)).map(q => [q.x / M.DEG, q.y / M.DEG]);
  const S = M.dipperStates(D.dipper), sky = M.dipperSky(S, 0);
  const tbIndex = ['알카이드', '미자르', '알리오즈', '메그레즈', '페크다', '메라크', '두베'];
  const skyIndex = D.dipper.map(s => s[0]);
  const rel = (pts, a, b) => [pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]];
  for (const [a, b] of [['알카이드', '두베'], ['메라크', '두베'], ['메그레즈', '페크다'], ['미자르', '알리오즈']]) {
    const v1 = rel(view, tbIndex.indexOf(a), tbIndex.indexOf(b)), v2 = rel(sky, skyIndex.indexOf(a), skyIndex.indexOf(b));
    assert.ok(Math.hypot(v1[0] - v2[0], v1[1] - v2[1]) < 0.6, `${a}→${b}`);
  }
  // 옆에서 보면(yaw 90°) 지구는 화면 왼쪽에 있고, 깊이(거리) 차이가 가로로 펼쳐진다
  const side = M.camera(90 * M.DEG, 0, vf), e = M.viewProject([0, 0, 0], side);
  assert.ok(e.depth > 0 && e.x < -0.1);
  const top = M.camera(0, 89 * M.DEG, vf), et = M.viewProject([0, 0, 0], top);
  assert.ok(et.depth > 0 && et.y < -0.1);                   // 위에서 보면 지구가 아래쪽
  const sx = P.map(p => M.viewProject(p, side).x);
  assert.equal(sx.indexOf(Math.max(...sx)), 6);             // 옆에서 보면 두베가 지구에서 가장 멀다
  // 상자 가운데를 기준점으로 돌아도 지구 자리에서는 카메라가 원점에 있다
  const vf2 = M.viewFrame(P, [-10, -2.5, 17.5]);
  close(M.norm(M.camera(0, 0, vf2).pos), 0, 1e-9);
});
