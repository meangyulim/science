const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/B2/14/B2-14-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const L = 10e-3, C = 1e-6, R = 20, V0 = 10;      // 개념서 예제 (R·V₀ 는 페이지 기본값)

test('B2-14 예제: L = 10 mH, C = 1 μF → √(LC) = 10⁻⁴ s, f₀ = 1/(2π × 10⁻⁴) ≈ 1.6 kHz, C = 4 μF 면 약 0.8 kHz', () => {
  close(Math.sqrt(L * C), 1e-4, 1e-15);
  const fa = M.f0(L, C), fb = M.f0(L, 4e-6);
  close(fa, 1 / (2 * Math.PI * 1e-4), 1e-9);
  assert.equal((fa / 1e3).toFixed(1), '1.6');          // 약 1.6 × 10³ Hz
  assert.equal((fb / 1e2).toFixed(1), '8.0');          // 약 8.0 × 10² Hz
  close(fb, fa / 2, 1e-9);                             // C 4배 → f₀ ½배
});

test('B2-14 공명 진동수에서 X_L = X_C 이고 전체 방해가 R 로 가장 작아 전류가 최대(V₀/R), 전압과 전류가 같은 박자', () => {
  const f = M.f0(L, C);
  close(M.XL(f, L), M.XC(f, C), 1e-9);
  close(M.XL(f, L), 100, 1e-9);                        // √(L/C) = 100 Ω
  close(M.impedance('RLC', f, R, L, C), R, 1e-9);
  close(M.current('RLC', f, V0, R, L, C), 0.5, 1e-12);
  close(M.phase('RLC', f, R, L, C), 0, 1e-9);
  for (let g = 100; g <= 4000; g += 37) {               // 다른 진동수에서는 방해가 더 크고 전류가 더 작다
    assert.ok(M.impedance('RLC', g, R, L, C) >= R - 1e-9);
    assert.ok(M.current('RLC', g, V0, R, L, C) <= 0.5 + 1e-12);
  }
  // f₀ 보다 낮으면 X_C > X_L (전류가 앞섬), 높으면 X_L > X_C (전압이 앞섬)
  assert.ok(M.phase('RLC', f / 2, R, L, C) < 0 && M.phase('RLC', f * 2, R, L, C) > 0);
});

test('B2-14 공명에서 코일·축전기 전압은 크기가 같고 위상이 반대라 서로 지운다 — 각각은 0이 아니고 전원 전압보다 클 수 있다', () => {
  const s = M.state('RLC', M.f0(L, C), V0, R, L, C);
  close(s.VL, s.VC, 1e-9);
  close(s.VL, 50, 1e-9);                               // 0.5 A × 100 Ω = 50 V > 전원 10 V
  assert.ok(s.VL > s.V0);
  for (let th = 0; th < 2 * Math.PI; th += 0.3) {
    const x = M.instant(s, th);
    close(x.vL + x.vC, 0, 1e-9);
    close(x.v, x.vR, 1e-9);                            // 전원 전압 = 저항 전압 → 전류와 같은 박자
  }
});

test('B2-14 키르히호프: 어느 순간에나 전원 전압 = v_R + v_L + v_C, 그 최댓값은 V₀ (Z 와 맞는다)', () => {
  for (const f of [300, 800, 1000, 1591.55, 2500, 4000]) {
    const s = M.state('RLC', f, V0, R, L, C);
    let vmax = 0;
    for (let th = 0; th < 2 * Math.PI; th += 0.01) {
      const x = M.instant(s, th);
      close(x.v, M.sourceV(s, th), 1e-9);
      vmax = Math.max(vmax, Math.abs(x.v));
      close(x.vC, x.q / C, 1e-9);                      // 축전기 전압 = 쌓인 전하 ÷ C
    }
    close(vmax, V0, 1e-3);
  }
});

test('B2-14 박자: 저항 전압은 전류와 같이, 코일 전압은 ¼주기 앞서, 축전기 전압은 ¼주기 뒤져 최대가 된다', () => {
  close(M.peakShift(M.phase('R', 1000, R, L, C)), 0, 1e-12);
  close(M.peakShift(M.phase('L', 1000, R, L, C)), -0.25, 1e-12);
  close(M.peakShift(M.phase('C', 1000, R, L, C)), 0.25, 1e-12);
  // 코일 전압 = L × (전류의 변화율), 축전기 전압 = (지나간 전하) ÷ C 를 수치로 확인
  const s = M.state('RLC', 1000, V0, R, L, C), dt = 1e-9;
  for (const t of [0, 1e-4, 3.3e-4, 7e-4]) {
    const a = M.instant(s, s.w * t), b = M.instant(s, s.w * (t + dt));
    close(a.vL, L * (b.i - a.i) / dt, 1e-3 * s.VL);
    close(b.q - a.q, (a.i + b.i) / 2 * dt, 1e-9 * s.q0 * s.w * dt);    // 짧은 시간에 지나간 전하 = 전류 × 시간
  }
});

test('B2-14 진동수–전류 그래프 모양: 수평 = 저항, 줄어듦 = 코일(I ∝ 1/f), 원점 지나는 직선 = 축전기(I = 2πfCV₀), 봉우리 = RLC', () => {
  const fs = [200, 400, 800, 1200, 1600, 2400, 3200, 4000];
  const I = (kind) => fs.map((f) => M.current(kind, f, V0, R, L, C));
  assert.deepEqual([M.classify(fs, I('R')).element, M.classify(fs, I('L')).element, M.classify(fs, I('C')).element, M.classify(fs, I('RLC')).element],
    ['저항', '코일', '축전기', 'RLC 직렬']);
  assert.ok(M.classify(fs, I('C')).linear);
  fs.forEach((f) => close(M.current('C', f, V0, R, L, C), 2 * Math.PI * f * C * V0, 1e-12));
  close(M.current('L', 2000, V0, R, L, C) / M.current('L', 1000, V0, R, L, C), 0.5, 1e-12);   // 진동수 2배 → 코일 전류 ½배
  close(M.current('C', 2000, V0, R, L, C) / M.current('C', 1000, V0, R, L, C), 2, 1e-12);     // 진동수 2배 → 축전기 전류 2배
  close(M.current('R', 2000, V0, R, L, C), M.current('R', 200, V0, R, L, C), 1e-15);
});

test('B2-14 개념 체크: 전류가 진동수에 비례하면 축전기, L 2배·C 8배면 f₀/4 (제곱근을 빠뜨리면 f₀/16)', () => {
  const fs = [500, 1000, 2000, 3000];
  assert.equal(M.classify(fs, fs.map((f) => M.current('C', f, V0, R, L, C))).element, '축전기');
  close(M.f0Ratio(2, 8), 0.25, 1e-15);
  close(M.f0(2 * L, 8 * C), M.f0(L, C) / 4, 1e-9);
  close(M.f0Ratio(1, 4), 0.5, 1e-15);
});

test('B2-14 R 은 봉우리 높이만 바꾼다: R 2배 → f₀ 그대로, 최대 전류 ½배. 실효값 = 최댓값/√2', () => {
  const f = M.f0(L, C);
  const top = (r) => { let best = 0, fb = 0; for (let g = 1000; g <= 2500; g += 0.5) { const i = M.current('RLC', g, V0, r, L, C); if (i > best) { best = i; fb = g; } } return [fb, best]; };
  const [fa, ia] = top(R), [fb, ib] = top(2 * R);
  close(fa, f, 0.5); close(fb, f, 0.5);
  close(ib / ia, 0.5, 1e-6);
  close(M.rms(V0), V0 / Math.SQRT2, 1e-12);
  assert.equal(Math.round(M.peak(220)), 311);
});
