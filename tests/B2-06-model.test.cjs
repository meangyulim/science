const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/B2/06/B2-06-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('B2-06 예제: V_CC 12 V, R₁ 40 kΩ, R₂ 10 kΩ, V_BE 0.7 V, R_E 1.7 kΩ, R_C 5 kΩ → V_B = 2.4 V, I_C ≈ 1 mA, V_C = 7 V', () => {
  const d = M.design(M.EX);
  close(d.VB, 2.4, 1e-12);                 // 12 × 10/(40 + 10)
  close(d.VE, 1.7, 1e-12);                 // 2.4 − 0.7
  close(d.IE, 1e-3, 1e-15);                // 1.7 V ÷ 1.7 kΩ
  close(d.IC, 1e-3, 1e-15);                // I_C ≈ I_E
  close(d.VC, 7, 1e-12);                   // 12 − 1 mA × 5 kΩ
  assert.ok(d.ok && d.VC > d.VB && d.VB > d.VE);   // n-p-n 증폭 조건 V_C > V_B > V_E
  close(d.IB, 10e-6, 1e-15);               // β = 100 이면 I_B = 10 μA (I_C 의 1 %)
  close(d.Idiv, 0.24e-3, 1e-15);           // 분압 저항 전류 0.24 mA ≫ I_B → 분압 계산에서 I_B 무시
  close(d.VB, d.VE + M.EX.Vbe, 1e-12);     // V_B = V_E + V_BE
  close(d.VC, d.VE + d.VCE, 1e-12);        // V_C = V_E + V_CE
  close(M.rcFor(12, 7, 1e-3), 5e3, 1e-6);  // R_C = (V_CC − V_C)/I_C
  close(M.reFor(1.7, 1e-3), 1.7e3, 1e-6);  // R_E = V_E/I_E
});

test('B2-06 개념 체크: 9 V를 R₁ 20 kΩ(전원 쪽)·R₂ 10 kΩ(접지 쪽)으로 나누고 V_BE 0.6 V → 이미터 전위 2.4 V (R₁ 양단 6 V로 착각하면 5.4 V)', () => {
  const p = Object.assign({}, M.EX, {Vcc: 9, R1: 20e3, R2: 10e3, Vbe: 0.6, Re: 2.4e3, Rc: 3e3});
  const d = M.design(p);
  close(d.VB, 3, 1e-12);
  close(d.VE, 2.4, 1e-12);
  const wrong = 9 * 20 / 30 - 0.6;         // R₁ 양단 전압을 베이스 전위로 본 값
  close(wrong, 5.4, 1e-12);
  assert.ok(Math.abs(d.VE - wrong) > 1);
});

test('B2-06 도전: 10 V, R₁ 32 kΩ, R₂ 8 kΩ, V_BE 0.7 V, R_E 1.3 kΩ, β 100 → V_C 6 V 에 R_C = 4 kΩ, I_B ±2 μA 이면 V_C 는 5.2 ~ 6.8 V', () => {
  const p = Object.assign({}, M.EX, {Vcc: 10, R1: 32e3, R2: 8e3, Vbe: 0.7, Re: 1.3e3, beta: 100});
  const d = M.design(p);
  close(d.VB, 2, 1e-12); close(d.VE, 1.3, 1e-12); close(d.IC, 1e-3, 1e-15);
  const Rc = M.rcFor(10, 6, d.IC);
  close(Rc, 4e3, 1e-6);
  p.Rc = Rc;
  // 베이스 전류 ±2 μA ↔ 컬렉터 전류 ±0.2 mA (ΔI_C = βΔI_B) ↔ 베이스 전위 ±0.2 mA × 1.3 kΩ = ±0.26 V
  p.amp = 2e-6 * p.beta * p.Re;
  close(p.amp, 0.26, 1e-12);
  const c = M.cycle(2, p, 720);
  close(c.lo.VC, 5.2, 1e-6); close(c.hi.VC, 6.8, 1e-6);
  close((c.hi.IB - c.lo.IB) / 2, 2e-6, 1e-12);
  close((c.hi.IC - c.lo.IC) / 2, p.beta * 2e-6, 1e-12);
  assert.equal(c.fracClip, 0); assert.equal(c.fracOn, 1);
  // 컬렉터 전류가 가장 클 때 컬렉터 전위가 가장 낮다 (출력이 뒤집힌다)
  const top = c.S.reduce((a, s) => (s.IC > a.IC ? s : a));
  close(top.VC, 5.2, 1e-6);
});

test('B2-06 바이어스 없이 신호만: E-B 가 순방향인 반주기에만 전류가 흐르고 나머지 반주기는 잘린다', () => {
  const p = Object.assign({}, M.S1, {bias: 0, amp: 0.1});
  const c = M.cycle(1, p, 720);
  close(c.fracOn, 0.5, 1e-9);              // 흐르는 시간 = 절반
  close(c.fracFwd, 0.5, 1e-9);
  close(c.hi.IC, p.beta * M.K1 * 0.1, 1e-12);   // 최대 0.2 mA
  close(c.lo.IC, 0, 1e-15);
  for (const s of c.S) {
    if (Math.sin(s.ph) < 0) { assert.equal(s.IB, 0); assert.equal(s.IC, 0); assert.equal(s.IE, 0); }   // 역방향 반주기: 베이스 전류도 컬렉터 전류도 0
    else close(s.IC, p.beta * M.K1 * s.v, 1e-12);                                                    // 순방향 반주기: 신호 모양 그대로
  }
  const q = M.cycle(1, Object.assign({}, p, {bias: 0.05}), 720);   // 바이어스가 진폭보다 작으면 일부만 잘린다
  close(q.fracOn, 0.5 + Math.asin(0.5) / Math.PI, 2e-3);
});

test('B2-06 바이어스 1.0 V 위에 ±0.1 V: 베이스 전압 0.9~1.1 V로 늘 순방향, 신호 전체가 β배 컬렉터 전류에 모양 그대로 실린다', () => {
  const p = Object.assign({}, M.S1);
  const c = M.cycle(1, p, 720);
  close(c.lo.vB, 0.9, 1e-9); close(c.hi.vB, 1.1, 1e-9);
  assert.equal(c.fracOn, 1); assert.equal(c.fracClip, 0);
  close(c.lo.IB, 18e-6, 1e-12); close(c.hi.IB, 22e-6, 1e-12);
  close(c.lo.IC, 1.8e-3, 1e-12); close(c.hi.IC, 2.2e-3, 1e-12);
  const IC0 = p.beta * M.K1 * p.bias;
  for (const s of c.S) {
    close(s.IC, p.beta * s.IB, 1e-15);    // I_C = βI_B
    close(s.IE, s.IB + s.IC, 1e-15);      // I_E = I_B + I_C
    close(s.IC - IC0, p.beta * M.K1 * s.v, 1e-12);   // 변하는 부분이 신호에 비례 (모양 그대로)
    assert.ok(s.VC > s.vB && s.vB > s.vE); // V_C > V_B > V_E
  }
  close(c.outAmp, p.beta * M.K1 * p.amp * p.Rc, 1e-9);   // 출력 ±0.4 V > 입력 ±0.1 V
  assert.ok(c.gain > 1);
});

test('B2-06 바이어스 전지를 거꾸로 꽂으면 E-B 가 늘 역방향 → 전류가 흐르지 않는다', () => {
  const c = M.cycle(1, Object.assign({}, M.S1, {flip: true}), 360);
  assert.equal(c.fracOn, 0); assert.equal(c.fracFwd, 0);
  close(c.hi.IC, 0, 1e-15); close(c.hi.IB, 0, 1e-15);
  close(c.lo.VC, 12, 1e-12);              // 전류가 없으니 컬렉터 전위 = V_CC
});

test('B2-06 증폭: 입력은 베이스 쪽, 출력은 컬렉터 쪽 — 예제 회로에서 출력 진폭이 입력보다 크고 위아래가 뒤집힌다', () => {
  const c = M.cycle(2, M.EX, 720);
  assert.equal(c.fracClip, 0); assert.equal(c.fracOn, 1);
  close(c.gain, M.EX.Rc / M.EX.Re, 1e-6);  // 0.1 V → 약 0.29 V
  assert.ok(c.gain > 2.9 && c.gain < 3);
  const qPlus = c.S[180], qMinus = c.S[540];   // sin = +1, −1
  assert.ok(qPlus.out < 0 && qMinus.out > 0); // 입력 최대일 때 출력 최소
  close(c.meanVC, 7, 1e-6);               // 출력 축전기가 막는 직류 성분 = 동작점의 V_C
});

test('B2-06 동작점이 너무 낮거나 높으면 출력이 잘린다', () => {
  const lo = M.cycle(2, Object.assign({}, M.EX, {R2: 2.5e3}), 720);   // V_B ≈ 0.71 V: 0.7 V 아래로 내려가는 동안 전류 0
  assert.ok(lo.fracOn > 0.4 && lo.fracOn < 0.6);
  const hi = M.cycle(2, Object.assign({}, M.EX, {R2: 17e3}), 720);    // V_C 가 V_B 까지 내려가 증폭 조건이 깨진다
  assert.ok(hi.fracClip > 0.4 && hi.fracClip < 0.6);
  assert.ok(!M.design(Object.assign({}, M.EX, {R2: 17e3})).ok);
  for (const s of hi.S) assert.ok(s.VC >= s.vB - 1e-12);
  // 잘리는 동안 I_C 는 더 늘지 못하고 V_C = v_B
  const cl = hi.S.find((s) => s.clip);
  close(cl.VC, cl.vB, 1e-12);
  const mid = M.cycle(2, Object.assign({}, M.EX, {R2: 10e3}), 360);
  assert.equal(mid.fracClip, 0); assert.equal(mid.fracOn, 1);
});

test('B2-06 가변 저항 R₂ 를 키우면 바이어스(V_B)와 컬렉터 전류가 커진다 (I_C = βI_B 로 함께)', () => {
  let prev = null;
  for (const R2 of [6e3, 8e3, 10e3, 12e3]) {
    const d = M.design(Object.assign({}, M.EX, {R2}));
    if (prev) { assert.ok(d.VB > prev.VB && d.IC > prev.IC && d.IB > prev.IB); close(d.IC / d.IB, 100, 1e-9); }
    prev = d;
  }
});
