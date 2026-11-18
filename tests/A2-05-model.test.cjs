const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/05/A2-05-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A2-05 예제: 0.2 kg, 30°, 10 m/s → 최고점 운동 에너지 7.5 J, 최고 높이 1.25 m', () => {
  close(M.K0(0.2, 10), 10);                        // 처음 운동 에너지 ½ × 0.2 × 10² = 10 J
  close(M.Kx(0.2, 10, 30), 7.5);                   // vₓ = 5√3 → Kₓ = ½ × 0.2 × 75 = 7.5 J
  close(M.topK(0.2, 10, 30), 7.5);                 // 최고점 운동 에너지 = Kₓ
  close(M.Ky0(0.2, 10, 30), 2.5);                  // K_y = 10 − 7.5 = 2.5 J
  close(M.heightFromKy(0.2, 2.5), 1.25);           // mgH = 2.5 → H = 1.25 m
  close(M.maxHeight(10, 30), 1.25);                // 운동학으로 구한 값과 같다
  const top = M.state(0.2, 10, 30, M.topTime(10, 30));
  close(top.vy, 0); close(top.K, 7.5); close(top.U, 2.5); close(top.y, 1.25);
});

test('A2-05 역학적 에너지 보존: 어느 순간이든 K + U = ½mv₀², Kₓ 는 그대로, K_y + U 도 일정', () => {
  for (const [m, v0, th] of [[0.2, 10, 30], [0.5, 10, 53.13], [1, 15, 70], [2, 6, 12]]) {
    const T = M.flightTime(v0, th), E = M.K0(m, v0), kx = M.Kx(m, v0, th), ky0 = M.Ky0(m, v0, th);
    for (let i = 0; i <= 40; i++) {
      const s = M.state(m, v0, th, T * i / 40);
      close(s.E, E, 1e-9);
      close(s.Kx, kx, 1e-9);                       // 수평 몫은 한 번도 변하지 않는다
      close(s.Ky + s.U, ky0, 1e-9);                // 주고받는 것은 연직 몫과 퍼텐셜 에너지뿐
      close(s.K, 0.5 * m * s.v * s.v, 1e-9);       // v² = vₓ² + v_y² → K = Kₓ + K_y
    }
    close(M.state(m, v0, th, T).K, E, 1e-9);       // 같은 높이로 돌아오면 운동 에너지도 처음과 같다
  }
});

test('A2-05 최고점의 운동 에너지는 0 이 아니라 K 의 최솟값 Kₓ = ½m(v₀cosθ)², 최고점은 수평 거리의 가운데', () => {
  const m = 0.2, v0 = 10, th = 30, T = M.flightTime(v0, th);
  let kmin = Infinity, tmin = 0;
  for (let i = 0; i <= 1000; i++) { const s = M.state(m, v0, th, T * i / 1000); if (s.K < kmin) { kmin = s.K; tmin = s.t; } }
  close(kmin, M.Kx(m, v0, th), 1e-9);
  close(tmin, T / 2, 1e-9);
  assert.ok(kmin > 0);
  close(M.state(m, v0, th, T / 2).x, M.range(v0, th) / 2, 1e-9);
  close(M.K0(m, v0), M.Kx(m, v0, th) + m * M.G * M.maxHeight(v0, th), 1e-9);   // E = mgH + ½mv₀ₓ²
});

test('A2-05 운동 방향이 수평과 φ 이면 K_y/Kₓ = tan²φ (던지는 순간 tan²30° = 1/3, 45° 이면 같다)', () => {
  close(M.Ky0(0.2, 10, 30) / M.Kx(0.2, 10, 30), M.ratioKyKx(30), 1e-12);
  close(M.ratioKyKx(30), 1 / 3, 1e-12);
  for (const t of [0.1, 0.4, 0.7, 1.2, 1.6]) {
    const s = M.state(0.2, 10, 60, t);
    close(s.Ky / s.Kx, M.ratioKyKx(s.phi), 1e-9);
  }
  const t45 = M.tAtPhi(10, 60, 45), s = M.state(0.2, 10, 60, t45);
  close(s.phi, 45, 1e-9); close(s.Ky, s.Kx, 1e-9);
  close(s.Kx, 2.5, 1e-9); close(s.U, 5, 1e-9); close(s.y, 2.5, 1e-9);   // 0.2 kg, 60°, 10 m/s: Kₓ = K_y = 2.5 J, U = 5 J
});

test('A2-05 개념 체크: 0.5 kg, 최고점 K 9 J, 최고 높이 3.2 m → 던질 때 25 J (16 J 는 최고점 K 를 0 으로 놓은 실수)', () => {
  close(M.launchK(0.5, 9, 3.2), 25, 1e-12);
  assert.notEqual(M.launchK(0.5, 0, 3.2), 25);
  const th = Math.atan2(4, 3) / M.RAD;                // v₀ = 10 m/s, tanθ = 4/3 이면 vₓ = 6, v_y = 8
  close(M.Kx(0.5, 10, th), 9, 1e-9); close(M.maxHeight(10, th), 3.2, 1e-9); close(M.K0(0.5, 10), 25, 1e-12);
});

test('A2-05 같은 속력이면 각이 나눔을 정한다: Kₓ = K₀cos²θ, K_y = K₀sin²θ — 30° 와 60° 는 맞바꾼다', () => {
  const a = M.split(10, 30), b = M.split(10, 60);
  close(a.Kx, 7.5, 1e-9); close(a.Ky, 2.5, 1e-9); close(b.Kx, 2.5, 1e-9); close(b.Ky, 7.5, 1e-9);
  close(M.topK(0.2, 10, 30) / M.topK(0.2, 10, 60), 3, 1e-9);          // 최고점 K 비 3 : 1
  close(M.maxHeight(10, 30) / M.maxHeight(10, 60), 1 / 3, 1e-9);       // 최고 높이 비 1 : 3
  const h = M.atHeight(0.2, 10, 60, 2.5);                               // 높이로 나눔: K_y = K_y0 − mgy
  close(h.Ky, 2.5, 1e-9); close(h.Kx + h.Ky + h.U, 10, 1e-9);
});
