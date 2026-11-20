const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/B2/11/B2-11-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const EX = {B: 0.5, L: 0.4, R: 2};
const base = (o) => Object.assign({B: 0.5, L: 0.4, R: 2, m: 0.002, x0: 0.2}, o);

test('B2-11 예제: B 0.5 T, L 0.4 m, v 5 m/s, R 2 Ω → ε 1 V, I 0.5 A, 자기력 0.1 N(운동 반대), 외력의 일률 0.5 W = I²R', () => {
  const e = M.emf(EX.B, EX.L, 5);
  close(e, 1);
  const I = M.current(e, EX.R);
  close(I, 0.5);
  const F = M.force(EX.B, I, EX.L);
  close(F, 0.1);
  close(F * 5, 0.5);                        // 외력의 일률 Fv
  close(I * I * EX.R, 0.5);                 // 소비 전력 I²R
  close(M.magForce(EX.B, EX.L, EX.R, 5), -0.1);
  // 등속으로 끄는 운동 상태에서도 같은 값
  const s = M.state(base({mode: 'const', v: 5}), 0.1);
  close(s.emf, 1); close(s.I, 0.5); close(s.Fext, 0.1); close(s.Fmag, -0.1); close(s.a, 0);
  close(s.Pext, 0.5); close(s.Pheat, 0.5);
  close(s.x, 0.2 + 5 * 0.1);
});

test('B2-11 ε = ΔΦ/Δt: Δt 동안 넓이가 LvΔt, 자속이 BLvΔt 늘어난다 (운동 방법과 관계없이)', () => {
  const ps = [base({mode: 'const', v: 5}), base({mode: 'const', v: -3}), base({mode: 'force', F: 0.1}),
    base({mode: 'push', v0: 5}), base({mode: 'incline', th: 30})];
  for (const p of ps) {
    for (const t of [0.02, 0.07, 0.15]) {
      const h = 1e-6, s = M.state(p, t);
      const dPhi = M.state(p, t + h).Phi - M.state(p, t - h).Phi;
      close(dPhi / (2 * h), s.emf, 1e-6);                         // 자속의 변화율 = BLv
      close(M.state(p, t + h).x - M.state(p, t - h).x, s.v * 2 * h, 1e-9);
    }
  }
  // 예제: 0.02 s 동안 0.1 m 이동 → 넓이 0.04 m², 자속 0.02 Wb → 0.02 ÷ 0.02 = 1 V
  const p = base({mode: 'const', v: 5}), a = M.state(p, 0), b = M.state(p, 0.02);
  close((b.x - a.x) * EX.L, 0.04);
  close(b.Phi - a.Phi, 0.02);
  close((b.Phi - a.Phi) / 0.02, 1);
});

test('B2-11 렌츠 법칙: 유도 전류는 자속 변화를 방해하고, 막대가 받는 자기력은 늘 운동 반대', () => {
  let r = M.lenz(1, 5);                     // ⊗, 오른쪽: ⊗ 자속 증가 → ⊙ 를 만든다 → 시계 반대, 막대 속 위쪽
  assert.ok(r.ccw && !r.cw && r.rodUp && r.topPlus);
  assert.equal(r.inducedIn, -1); assert.equal(r.forceDir, -1);
  r = M.lenz(1, -5);                        // ⊗, 왼쪽: ⊗ 자속 감소 → ⊗ 를 만든다 → 시계
  assert.ok(r.cw && !r.rodUp); assert.equal(r.inducedIn, 1); assert.equal(r.forceDir, 1);
  r = M.lenz(-1, 5);                        // ⊙, 오른쪽: ⊙ 자속 증가 → ⊗ 를 만든다 → 시계
  assert.ok(r.cw && !r.rodUp); assert.equal(r.inducedIn, 1); assert.equal(r.forceDir, -1);
  r = M.lenz(-1, -5);
  assert.ok(r.ccw && r.rodUp); assert.equal(r.inducedIn, -1); assert.equal(r.forceDir, 1);
  r = M.lenz(1, 0);
  assert.ok(!r.ccw && !r.cw);
  for (const v of [-8, -1, 0.5, 9]) assert.ok(M.magForce(0.5, 0.4, 2, v) * v < 0);
  // 유도 전류가 만든 자기장은 바깥 자기장의 변화와 반대 부호
  for (const f of [1, -1]) for (const v of [-2, 3]) assert.equal(M.lenz(f, v).inducedIn, -Math.sign(f * v));
});

test('B2-11 일정한 외력 0.1 N → 종단 속력 FR/(B²L²) = 5 m/s 에 다가가고, 그때 자기력 = 외력', () => {
  const p = base({mode: 'force', F: 0.1, x0: 0});
  close(M.terminal(0.1, 0.5, 0.4, 2), 5);
  close(M.tau(0.002, 0.5, 0.4, 2), 0.1);
  let prev = M.state(p, 0);
  close(prev.v, 0); close(prev.a, 0.1 / 0.002);
  for (let t = 0.01; t <= 1; t += 0.01) {
    const s = M.state(p, t);
    assert.ok(s.v > prev.v && s.v < 5, 'v 는 늘지만 5 m/s 를 넘지 않는다');
    assert.ok(s.a < prev.a && s.a > 0, '가속도는 줄어든다');
    assert.ok(-s.Fmag < s.Fext, '자기력 < 외력 (아직 빨라지는 중)');
    prev = s;
  }
  const late = M.state(p, 2);
  close(late.v, 5, 1e-6); close(-late.Fmag, 0.1, 1e-7); close(late.Pext, late.Pheat, 1e-6);
  // 작은 시간 간격으로 적분한 운동 방정식 m dv/dt = F − B²L²v/R 과 같은 운동
  const k = M.dragK(0.5, 0.4, 2), h = 1e-5;
  let v = 0, x = 0;
  for (let i = 0; i < 30000; i++) { const a = (0.1 - k * v) / 0.002; x += v * h + 0.5 * a * h * h; v += a * h; }
  close(M.state(p, 0.3).v, v, 1e-3);
  close(M.state(p, 0.3).x, x, 1e-4);
});

test('B2-11 밀고 놓으면 자기력만 받아 느려지다 멈추고, 처음 운동 에너지가 모두 열이 된다', () => {
  const p = base({mode: 'push', v0: 5});
  let prev = M.state(p, 0);
  close(prev.v, 5); close(prev.Fext, 0); close(prev.Fmag, -0.1);
  for (let t = 0.02; t <= 1; t += 0.02) {
    const s = M.state(p, t);
    assert.ok(s.v < prev.v && s.v > 0 && s.a < 0, '자기력(운동 반대)만 받아 느려진다');
    prev = s;
  }
  const end = M.state(p, 5);
  close(end.v, 0, 1e-9);
  close(end.x, 0.2 + 5 * M.tau(0.002, 0.5, 0.4, 2), 1e-9);      // 0.7 m 에서 멈춘다
  close(end.Q, 0.5 * 0.002 * 25, 1e-9);                          // 열 = ½mv₀² = 0.025 J
  // 왼쪽으로 밀어도 자기력은 운동 반대(오른쪽)
  const q = M.state(base({mode: 'push', v0: -4, x0: 1.4}), 0.05);
  assert.ok(q.v < 0 && q.Fmag > 0 && q.a > 0);
});

test('B2-11 에너지 장부: 외력이 한 일 = 운동 에너지 증가 + 저항의 열 (어느 운동, 어느 순간이든)', () => {
  const ps = [base({mode: 'const', v: 5}), base({mode: 'const', v: -6}), base({mode: 'force', F: 0.1}),
    base({mode: 'force', F: 0.25, m: 0.005}), base({mode: 'push', v0: 7}), base({mode: 'incline', th: 40, m: 0.006})];
  for (const p of ps) {
    for (const t of [0, 0.03, 0.1, 0.4, 1.5]) {
      const s = M.state(p, t);
      close(s.W, (s.K - s.K0) + s.Q, 1e-12);
      // 열은 I²R 을 시간에 대해 더한 값 (작은 간격으로 확인)
      if (t > 0) {
        const n = 4000, h = t / n, f = (i) => M.state(p, i * h).Pheat;   // 심프슨 적분
        let q = f(0) + f(n);
        for (let i = 1; i < n; i++) q += (i % 2 ? 4 : 2) * f(i);
        close(s.Q, q * h / 3, Math.max(1e-12, s.Q * 1e-8));
      }
    }
  }
});

test('B2-11 개념 체크: 속력 2배 → 소비 전력 4배(v² 에 비례), 등속이면 외력의 일률 = 소비 전력', () => {
  close(M.heatPower(0.5, 0.4, 2, 10) / M.heatPower(0.5, 0.4, 2, 5), 4);
  const s = M.state(base({mode: 'const', v: 10}), 0.05);
  close(s.Pext, s.Pheat); close(s.Pheat, 2); close(s.Fext, 0.2);
  close(M.state(base({mode: 'const', v: 5}), 0.05).Pheat, 0.5);
});

test('B2-11 개념 체크: 길이 0.2 m, 0.5 T, 40 rad/s 회전 막대 → ½BωR² = 0.4 V (끝 속력 8 m/s 를 쓰면 0.8 V)', () => {
  close(M.rotEmf(0.5, 40, 0.2), 0.4);
  close(M.speedAt(40, 0.2), 8);
  close(M.avgSpeed(40, 0.2), 4);
  close(M.emf(0.5, 0.2, M.avgSpeed(40, 0.2)), 0.4);             // 평균 속력 Rω/2 를 BLv 에 넣은 것과 같다
  close(M.tipMistake(0.5, 40, 0.2), 0.8);
  // 막대를 잘게 나눈 조각마다 B × Δr × (rω) 를 더하면 ½BωR²
  const n = 2000; let sum = 0;
  for (let i = 0; i < n; i++) { const r = (i + 0.5) * 0.2 / n; sum += 0.5 * (0.2 / n) * M.speedAt(40, r); }
  close(sum, 0.4, 1e-9);
  // Δt 동안 쓴 부채꼴 넓이 ½R²(ωΔt) 에 B 를 곱하면 자속 변화
  const dt = 1e-3;
  close(0.5 * M.sector(0.2, 40 * dt) / dt, 0.4, 1e-12);
  close(M.sweptRate(40, 0.2), 0.8);
  // 띠 영역(r₁ = 0.1 m ~ r₂ = 0.2 m)에만 자기장이 있으면 ½Bω(r₂² − r₁²) = 0.3 V
  close(M.bandEmf(0.5, 40, 0.1, 0.2), 0.3);
  close(M.bandEmf(0.5, 40, 0, 0.2), M.rotEmf(0.5, 40, 0.2));
  // 극성: ⊗ 에서 시계 반대로 돌면 양전하가 축 쪽으로 몰린다 (O 가 +)
  assert.equal(M.rotCenterPlus(1, 1), true);
  assert.equal(M.rotCenterPlus(-1, 1), false);
  assert.equal(M.rotCenterPlus(1, -1), false);
});

test('B2-11 두 막대: 같은 속도로 같이 가면 넓이가 그대로라 ε = 0, 반대로 가면 2BLv, 일반적으로 B × 넓이 변화율', () => {
  let r = M.twoRods(0.5, 0.4, 2, 5, 5);
  close(r.emf, 0); close(r.I, 0); close(r.dAdt, 0);
  assert.equal(r.up1, r.up2);                                     // 두 막대의 BLv 가 같은 쪽(위)을 향함 → 고리에서는 서로 반대
  r = M.twoRods(0.5, 0.4, 2, -5, 5);
  close(r.emf, 2); close(r.I, 1); assert.ok(r.ccw);               // 넓이가 늘어난다 → ⊙ 를 만든다 → 시계 반대
  close(r.e1 + r.e2, r.emf);
  r = M.twoRods(0.5, 0.4, 2, 2, 5);
  close(r.emf, 0.5 * 0.4 * 3); close(r.e2 - r.e1, r.emf);
  for (const [v1, v2] of [[1, 4], [3, -2], [-6, -1]]) {
    const q = M.twoRods(0.5, 0.4, 2, v1, v2);
    close(q.net, 0.5 * q.dAdt);                                   // ε = B × dA/dt
    close(q.F1, -q.F2);                                           // 두 막대의 자기력은 크기가 같고 반대
    assert.ok(q.F2 * (v2 - v1) <= 0 && q.F1 * (v2 - v1) >= 0);   // 서로 멀어지면 끌어당기고, 다가오면 밀어낸다
  }
});

test('B2-11 빗면: 중력 성분 mg sinθ 가 일정한 외력 노릇 → 종단 속력 mg sinθ R/(B²L²)', () => {
  close(M.inclineForce(0.006, 30), 0.03);
  const p = base({mode: 'incline', th: 30, m: 0.006, x0: 0});
  close(M.terminal(M.inclineForce(0.006, 30), 0.5, 0.4, 2), 1.5);
  close(M.state(p, 5).v, 1.5, 1e-6);
  close(-M.state(p, 5).Fmag, 0.03, 1e-7);
});

test('B2-11 레일 끝: 등속 5 m/s 로 0.2 m → 1.4 m 를 가는 데 0.24 s, 밀고 놓으면 끝에 닿기 전에 멈춘다', () => {
  const a = M.runEnd(base({mode: 'const', v: 5}), 0.1, 1.4);
  assert.ok(a.hit); close(a.t, 0.24, 1e-9);
  const b = M.runEnd(base({mode: 'push', v0: 5}), 0.1, 1.4);
  assert.ok(!b.hit); close(b.t, 0.1 * Math.log(100), 1e-12);
  const c = M.runEnd(base({mode: 'force', F: 0.1}), 0.1, 1.4);
  assert.ok(c.hit); close(M.state(base({mode: 'force', F: 0.1}), c.t).x, 1.4, 1e-9);
});
