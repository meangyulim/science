const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/B2/13/B2-13-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('B2-13 예제: 2 Ω 송전선으로 11 kW 를 보낼 때 220 V 이면 손실 5000 W, 22000 V 이면 0.5 W (전압 100배 → 손실 1/10000)', () => {
  const a = M.transmission(11000, 220, 2), b = M.transmission(11000, 22000, 2);
  close(a.I, 50); close(a.loss, 5000);
  close(b.I, 0.5); close(b.loss, 0.5);
  close(b.loss / a.loss, 1e-4, 1e-15);
  close(M.lossRatio(220, 22000), 1e-4, 1e-15);
});

test('B2-13 송전: 손실 ∝ 1/V² (전압 2배 → 1/4, 10배 → 1/100), 전류 ∝ 1/V, V²/R 에 송전 전압을 넣으면 보내는 전력보다 커진다', () => {
  for (const V of [220, 440, 1100, 2200]) {
    const a = M.transmission(11000, V, 2), b = M.transmission(11000, 2 * V, 2), c = M.transmission(11000, 10 * V, 2);
    close(b.loss / a.loss, 0.25, 1e-12); close(c.loss / a.loss, 0.01, 1e-12);
    close(b.I / a.I, 0.5, 1e-12);
    close(a.loss, (11000 / V) ** 2 * 2, 1e-6);
  }
  const a = M.transmission(11000, 220, 2);
  close(a.wrong, 24200); assert.ok(a.wrong > 11000);        // 틀린 계산은 불가능한 값
  close(a.drop, 100); close(a.drop ** 2 / 2, a.loss);      // 송전선 양 끝 전압은 IR = 100 V → (IR)²/R = I²R
  close(a.delivered, 6000); close(a.frac, 5000 / 11000);
});

test('B2-13 개념 체크: 1000회 : 50회 변압기, 1차 220 V, 2차 11 Ω → V₂ = 11 V, I₂ = 1 A, I₁ = 0.05 A (20 A 는 오답)', () => {
  const t = M.transformer(220, 1000, 50, 11);
  close(t.V2, 11); close(t.I2, 1); close(t.I1, 0.05);
  close(t.P1, 11); close(t.P2, 11);
  close(M.wrongI1(t.I2, 1000, 50), 20);
  close(t.perTurn, 0.22); close(t.perTurn2, 0.22);        // 한 바퀴마다 같은 ΔΦ/Δt
});

test('B2-13 변압기: V₁/V₂ = N₁/N₂ = I₂/I₁, V₁I₁ = V₂I₂ 는 부하와 무관, V₂ 는 부하 저항을 바꿔도 그대로, 직류는 변압 안 됨', () => {
  for (const [N1, N2] of [[1000, 50], [500, 1000], [200, 600]]) {
    const ts = [5, 11, 47, 220].map((R) => M.transformer(220, N1, N2, R));
    for (const t of ts) {
      close(220 / t.V2, N1 / N2, 1e-12);
      close(t.I2 / t.I1, N1 / N2, 1e-12);
      close(t.P1, t.P2, 1e-9);
      close(t.V2, ts[0].V2, 1e-12);
    }
    assert.ok(ts[0].I2 > ts[1].I2 && ts[0].I1 > ts[1].I1);   // 부하 저항이 작을수록 두 전류가 같이 크다
  }
  const up = M.transformer(220, 500, 1000, 220);              // 2차 감은 수가 2배 → 2차 전류는 1/2배 (OX)
  close(up.I2 / up.I1, 0.5, 1e-12);
  assert.equal(M.dcV2(), 0);
});

test('B2-13 그림 ①: I₁ 기울기 +2, 0, −1 → I₂ 는 −2(반대), 0, +1(같은 방향, 크기 절반). 1차 전류가 커도 일정하면 0', () => {
  const Mh = 1;
  const at = (t) => M.mutualEmf(Mh, M.ramp(t).dI);
  close(at(0.5), -2); close(at(2), 0); close(at(4), 1); close(at(5.5), 0);
  close(M.ramp(2).I, 2); close(M.ramp(4).I, 1); close(M.ramp(6.5).I, 1);     // 되풀이
  assert.equal(M.direction(M.ramp(0.5).dI), 'opposite');
  assert.equal(M.direction(M.ramp(2).dI), 'none');
  assert.equal(M.direction(M.ramp(4).dI), 'same');
  close(Math.abs(at(0.5)) / Math.abs(at(4)), 2);
  // 1 H 의 정의: 1 A/s 로 변할 때 1 V
  close(M.henry(M.mutualEmf(1, 1), 1), 1);
  close(M.mutualEmf(0.5, 2), -1);
});

test('B2-13 스위치: 닫는 순간과 여는 순간 2차 전류 방향은 반대, 닫아 둔 동안은 0, 1차 전류는 자체 유도로 서서히 증가 (ㄱ, ㄷ 옳음)', () => {
  const I0 = 2, ton = 0.5, toff = 0.2, Mh = 1;
  const close1 = M.rl(0, I0, ton, 0.05), steady = M.rl(0, I0, ton, 20), open1 = M.rl(I0, 0, toff, 0.05);
  assert.ok(M.mutualEmf(Mh, close1.dI) < 0);                 // 닫을 때: 반대 방향
  assert.ok(M.mutualEmf(Mh, open1.dI) > 0);                  // 열 때: 같은 방향 → 서로 반대 (ㄴ 틀림)
  close(M.mutualEmf(Mh, steady.dI), 0, 1e-12);               // 닫아 둔 동안 0 (ㄱ 옳음)
  close(steady.I, I0, 1e-12);
  // 닫은 직후 1차 전류는 0 에서 서서히 커진다 (ㄷ 옳음)
  close(M.rl(0, I0, ton, 0).I, 0);
  let prev = -1;
  for (const t of [0.01, 0.1, 0.3, 0.6, 1, 2]) { const v = M.rl(0, I0, ton, t).I; assert.ok(v > prev && v < I0); prev = v; }
});

test('B2-13 자체 유도: 닫으면 코일 쪽 전구 A 는 0 에서 서서히, 저항 쪽 B 는 바로. 닫는 순간 ε = −E, 열면 코일 전류가 B 를 거꾸로 지나며 줄어든다', () => {
  const E = 6, R = 6, L = 3;
  const c0 = M.branches(E, R, L, true, 0, 0);
  close(c0.IA, 0); close(c0.IB, 1); close(c0.emf, -E);       // 역기전력이 전지 전압과 같아 전류 0 에서 출발
  const c1 = M.branches(E, R, L, true, 0, 0.5);
  assert.ok(c1.IA > 0 && c1.IA < 1);
  close(M.branches(E, R, L, true, 0, 30).IA, 1, 1e-9);
  // L 이 클수록 천천히
  assert.ok(M.branches(E, R, 2 * L, true, 0, 0.5).IA < c1.IA);
  const o = M.branches(E, R, L, false, 1, 0);
  close(o.IA, 1); close(o.IB, -1); close(o.emf, 2 * E);      // 열 때는 전지보다 큰 기전력 (고리 저항 2R)
  assert.ok(M.branches(E, R, L, false, 1, 0.5).IA < 1);
});

test('B2-13 교류: 1차 전류가 가장 클 때 2차 기전력은 0, 0 을 지날 때 가장 크다 (위상 90°)', () => {
  const T = 4, I0 = 2;
  close(M.mutualEmf(1, M.ac(I0, T, T / 4).dI), 0, 1e-12);
  close(M.ac(I0, T, T / 4).I, I0, 1e-12);
  close(Math.abs(M.mutualEmf(1, M.ac(I0, T, 0).dI)), I0 * 2 * Math.PI / T, 1e-12);
});
