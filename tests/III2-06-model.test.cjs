const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/06/III2-06-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

test('III2-06 예제: 전자의 운동 에너지 E → 4E 이면 파장은 1/2배, 4E 양성자는 이 전자의 약 1/43배', () => {
  const E = 25 * M.EV;                                   // 화면 기본값: A = 25 eV 전자, B = 100 eV 전자
  close(M.wavelength(M.ME, 4 * E) / M.wavelength(M.ME, E), 0.5);
  close(M.lambdaRatio(M.ME, E, M.ME, 4 * E), 0.5);
  // 다른 E 에서도 같은 비 (같은 입자에서 λ ∝ 1/√E_k)
  for (const e of [0.3, 7, 1500]) close(M.wavelength(M.ME, 4 * e * M.EV) / M.wavelength(M.ME, e * M.EV), 0.5);
  const r = M.wavelength(M.MP, 4 * E) / M.wavelength(M.ME, 4 * E);
  close(r, 1 / Math.sqrt(1840));
  assert.equal(Math.round(1 / r), 43);
});

test('III2-06 같은 운동량이면 질량과 관계없이 파장이 같고, 무거운 쪽의 운동 에너지·속력이 작다', () => {
  const EA = 100 * M.EV;
  const EB = M.matchEk(M.ME, EA, M.MP, 'p');             // 양성자를 전자와 같은 운동량으로
  close(M.momentum(M.MP, EB), M.momentum(M.ME, EA));
  close(M.wavelength(M.MP, EB), M.wavelength(M.ME, EA));
  close(EB / EA, 1 / 1840);
  close(M.speed(M.MP, EB) / M.speed(M.ME, EA), 1 / 1840);
});

test('III2-06 같은 운동 에너지 → λ ∝ 1/√m, 같은 속력 → λ ∝ 1/m', () => {
  const E = 50 * M.EV;
  close(M.lambdaRatio(M.ME, E, M.MA, M.matchEk(M.ME, E, M.MA, 'Ek')), Math.sqrt(M.ME / M.MA));
  const EBv = M.matchEk(M.ME, E, M.MP, 'v');
  close(M.speed(M.MP, EBv), M.speed(M.ME, E));
  close(M.wavelength(M.MP, EBv) / M.wavelength(M.ME, E), 1 / 1840);
});

test('III2-06 속력 3배 → 파장 1/3배, 운동 에너지 9배; 곱이 일정한 관계 mvλ = h, 2mE_kλ² = h²', () => {
  const m = M.ME, v = 2e6;
  close(M.lambdaFromMV(m, 3 * v) / M.lambdaFromMV(m, v), 1 / 3);
  close(M.ekFromV(m, 3 * v) / M.ekFromV(m, v), 9);
  close(M.wavelength(m, M.ekFromV(m, 3 * v)) / M.wavelength(m, M.ekFromV(m, v)), 1 / 3);
  for (const [mm, E] of [[M.ME, 10 * M.EV], [M.MP, 3e3 * M.EV], [0.145, 120]]) {
    const lam = M.wavelength(mm, E), vv = M.speed(mm, E);
    close(mm * vv * lam, M.H);
    close(2 * mm * E * lam * lam, M.H * M.H);
    close(M.lambdaFromP(M.momentum(mm, E)), lam);
    close(M.ekFromP(mm, M.momentum(mm, E)), E);
  }
});

test('III2-06 크기 비교: 100 eV 전자 ≈ 10⁻¹⁰ m(원자 크기), 5 MeV 알파 입자 ≈ 원자핵 크기, 야구공은 관측 불가', () => {
  const le = M.wavelength(M.ME, 100 * M.EV);
  assert.ok(le > 1e-10 && le < 1.3e-10, String(le));      // 1.2 × 10⁻¹⁰ m
  assert.equal(M.scaleOf(le), 'atom');
  const la = M.wavelength(M.MA, 5e6 * M.EV);
  assert.ok(la > 1e-15 && la < 1e-14, String(la));
  assert.equal(M.scaleOf(la), 'nucleus');
  const lb = M.wavelength(M.PARTICLES.ball.m, 120);        // 시속 약 146 km 의 야구공
  assert.ok(lb < 1e-33, String(lb));
  assert.equal(M.scaleOf(lb), 'none');
});
