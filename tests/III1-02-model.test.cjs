const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/02/III1-02-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// 개념서 그림 ②와 같은 순간: 오른쪽 진행, λ = 8 cm, T = 0.5 s, x = 2 cm 에 마루 → Q(4 cm), P(8 cm), R(10 cm, 마루)
const EX = {A: 1, lambda: 8, T: 0.5, dir: 1, xc: 2};

test('III1-02 예제: y-x 에서 λ = 8 cm, y-t 에서 T = 0.5 s → v = 16 cm/s, P 는 다음 순간 아래(−y)', () => {
  close(M.speed(8, 0.5), 16);
  close(M.disp(8, 0, EX), 0, 1e-12);              // P 는 평형 위치
  assert.ok(M.slope(8, 0, EX) > 0);               // y-x 기울기 +
  assert.equal(M.motion(8, 0, EX), -1);           // → 아래로
  assert.equal(M.motion(4, 0, EX), 1);            // Q: 위로
  assert.equal(M.motion(10, 0, EX), 0);           // R(마루): 순간 정지
  close(M.disp(10, 0, EX), 1, 1e-12);
  // 파형을 오른쪽으로 살짝 밀면 P 자리의 변위가 음(−)
  assert.ok(M.pushed(8, 0, EX, 0.5) < 0);
});

test('III1-02 파형을 진행 방향으로 vΔt 만큼 민 모양 = Δt 뒤의 실제 모양, 살짝 밀었을 때의 부호 = 운동 방향', () => {
  for (const dir of [1, -1]) {
    const w = {A: 3, lambda: 6, T: 0.8, dir, xc: 1.3};
    const v = M.speed(w.lambda, w.T);
    for (const dt of [0.01, 0.1, 0.37]) for (const x of [0, 0.7, 2.2, 4.9]) close(M.pushed(x, 0.2, w, v * dt), M.disp(x, 0.2 + dt, w), 1e-9);
    for (let x = 0; x < 12; x += 0.37) {
      const m = M.motion(x, 0.2, w);
      if (m) assert.equal(Math.sign(M.pushed(x, 0.2, w, 1e-4) - M.disp(x, 0.2, w)), m);
    }
  }
});

test('III1-02 y-t 그래프의 기울기 = 그 점의 속도, 그 부호가 운동 방향 (v_y = −v · y-x 기울기)', () => {
  const w = {A: 2, lambda: 8, T: 0.5, dir: -1, xc: 3};
  const h = 1e-6;
  for (const x of [0.5, 3.4, 7.1]) for (const t of [0, 0.13, 0.41]) {
    const num = (M.disp(x, t + h, w) - M.disp(x, t - h, w)) / (2 * h);
    close(num, M.vel(x, t, w), 1e-5);
    close(M.vel(x, t, w), -w.dir * M.speed(w.lambda, w.T) * M.slope(x, t, w), 1e-9);
  }
  // 한 점의 y-t 그래프는 주기 T 로 반복된다
  for (const t of [0, 0.1, 0.33]) close(M.disp(5, t, w), M.disp(5, t + w.T, w), 1e-12);
});

test('III1-02 마루 앞쪽(진행 방향 쪽)은 올라가고 뒤쪽은 내려간다, 마루·골은 순간 정지', () => {
  for (const dir of [1, -1]) {
    const w = {A: 1, lambda: 8, T: 0.5, dir, xc: 10};
    for (let s = -7.75; s < 8; s += 0.5) assert.equal(M.motion(w.xc + dir * s, 0, w), M.sideOfCrest(s, w.lambda), `dir ${dir}, s ${s}`);
    assert.equal(M.motion(10, 0, w), 0);
    assert.equal(M.motion(14, 0, w), 0);              // 골
    assert.equal(M.motion(10 + dir * 2, 0, w), 1);    // 앞쪽 λ/4: 위로
    assert.equal(M.motion(10 - dir * 2, 0, w), -1);   // 뒤쪽 λ/4: 아래로
  }
});

test('III1-02 거꾸로 쓰기(개념 체크): 마루 바로 왼쪽 평형점 B 가 위로 움직이면 진행 방향은 −x', () => {
  const xc = 10, lambda = 8, xB = xc - lambda / 4;
  const probe = {A: 1, lambda, T: 0.5, dir: 1, xc};
  close(M.disp(xB, 0, probe), 0, 1e-12);
  const sl = M.sign(M.slope(xB, 0, probe));           // 기울기는 진행 방향과 무관 (사진이므로)
  assert.equal(sl, 1);
  assert.equal(M.dirFrom(sl, 1), -1);
  // 모형으로도 확인: −x 진행이면 B 는 위로, +x 진행이면 아래로
  assert.equal(M.motion(xB, 0, {...probe, dir: -1}), 1);
  assert.equal(M.motion(xB, 0, {...probe, dir: 1}), -1);
  assert.equal(M.dirFrom(0, 1), 0);                   // 마루 위의 점으로는 정할 수 없다
});

test('III1-02 y-t 를 다리로(도전 문제 꼴): 마루(왼쪽)와 골(오른쪽) 사이 평형점 P 가 t = 0 직후 내려가면 −x 진행, 3T/4 뒤 P 는 +A', () => {
  const lambda = 8, T = 0.5, xc = 10, xP = 12;           // 마루 10 cm, 골 14 cm, P 12 cm
  const sl = M.sign(M.slope(xP, 0, {A: 1, lambda, T, dir: 1, xc}));
  assert.equal(sl, -1);
  const d = M.dirFrom(sl, -1);
  assert.equal(d, -1);
  const w = {A: 1, lambda, T, dir: d, xc};
  close(M.disp(xP, 0, w), 0, 1e-12);
  assert.ok(M.disp(xP, 0.01, w) < 0);                  // y-t: t = 0 직후 아래로
  close(M.disp(xP, 0.75 * T, w), 1, 1e-12);            // 3T/4 뒤 마루
  close(M.speed(lambda, T), 16);
});

test('III1-02 두 시점 파형(개념 체크): λ = 12 cm, 마루 2 → 5 cm (0.25 s), 0.25 s < T 이면 v = 12 cm/s, T = 1 s', () => {
  const v = M.speedFromShift(3, 0.25, 12, 0);
  close(v, 12);
  close(12 / v, 1);
  // 실제로 그 파동은 0.25 s 뒤 x = 5 cm 에 마루가 있다
  const w = {A: 1, lambda: 12, T: 1, dir: 1, xc: 2};
  assert.ok(M.crests(0.25, w, 0, 24).some((x) => Math.abs(x - 5) < 1e-9));
  // 조건이 없으면 3 + 12n cm 도 가능: n = 1 이면 v = 60 cm/s, T = 0.2 s (< 0.25 s 라서 조건과 모순)
  close(M.speedFromShift(3, 0.25, 12, 1), 60);
  assert.ok(12 / M.speedFromShift(3, 0.25, 12, 1) < 0.25);
  // 한 주기 뒤에는 파형이 처음과 똑같다 (보이는 이동 0, 실제 이동 λ)
  for (const x of [0, 3, 7.5]) close(M.disp(x, 1, w), M.disp(x, 0, w), 1e-12);
});

test('III1-02 같은 매질(같은 속력)이면 λ ∝ T, 한 위치를 지나가는 마루 수 = 시간 ÷ 주기', () => {
  close(M.wavelength(16, 0.5), 8);
  close(M.wavelength(16, 1), 16);
  close(M.crestsPassing(2, 0.5), 4);
  // 모형에서 세어 보기: x = 6 에서 2 s 동안 마루가 지나간 횟수
  const w = {A: 1, lambda: 8, T: 0.5, dir: 1, xc: 2.3};
  let n = 0, prev = M.disp(6, 0, w) - M.disp(6, -1e-3, w);
  for (let k = 1; k <= 20000; k++) {
    const t = 2 * k / 20000, d = M.disp(6, t, w) - M.disp(6, t - 1e-4, w);
    if (prev > 0 && d <= 0) n++;
    prev = d;
  }
  assert.equal(n, 4);
});
