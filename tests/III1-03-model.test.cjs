const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/03/III1-03-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('III1-03 예제: 10 Hz 물결파, 깊은 곳 λ 3 cm → 얕은 곳 λ 2 cm 이면 30 cm/s, 20 cm/s', () => {
  close(M.speed(10, 3), 30);
  close(M.speed(10, 2), 20);
  const c = M.cross(10, 30, 20);
  close(c.l1, 3); close(c.l2, 2);
  assert.equal(c.f1, c.f2);
  close(c.ratioV, 1.5); close(c.ratioL, 1.5);               // 속력 비 = 파장 비 = 3 : 2
});

// 화면과 같은 물결파 수조: 0 ~ 30 cm, 경계 15 cm, 측정선 A = 7.5 cm(깊은 곳), B = 22.5 cm(얕은 곳)
const tank = {xb: 15, l1: 3, l2: 2};

test('III1-03 경계 양쪽 측정선에서 1초 동안 지나가는 마루 수는 같다 (= 진동수 10 Hz)', () => {
  for (const t0 of [0, 0.037, 0.5, 2.25]) {
    const a = M.passed(7.5, t0, t0 + 1, 10, tank), b = M.passed(22.5, t0, t0 + 1, 10, tank);
    assert.equal(a, 10); assert.equal(b, 10);
  }
  // 지나간 시각들의 간격은 양쪽 모두 주기 T = 0.1 s
  for (const x of [7.5, 22.5]) {
    const ts = M.passTimes(x, 0.3, 1.3, 10, tank);
    assert.equal(ts.length, 10);
    for (let i = 1; i < ts.length; i++) close(ts[i] - ts[i - 1], 0.1, 1e-9);
  }
});

test('III1-03 매질 안에서 마루 간격 = 그 매질의 파장, 경계에서 파동은 끊기지 않는다', () => {
  const cs = M.crests(3.37, tank, 0, 30);
  const left = cs.filter((x) => x < 15), right = cs.filter((x) => x > 15);
  for (let i = 1; i < left.length; i++) close(left[i] - left[i - 1], 3, 1e-9);
  for (let i = 1; i < right.length; i++) close(right[i] - right[i - 1], 2, 1e-9);
  for (const n of [0, 0.2, 1.7]) close(M.disp(n, 15 - 1e-9, tank), M.disp(n, 15 + 1e-9, tank), 1e-6);
});

test('III1-03 따라가는 마루는 깊은 곳에서 30 cm/s, 얕은 곳에서 20 cm/s — 어느 쪽이든 한 주기에 한 파장', () => {
  const f = 10, h = 1e-4;
  const tb = M.timeToBoundary(f, tank);
  close(tb, 0.5);                                           // 15 cm ÷ 30 cm/s
  close((M.crestAt(0.2 + h, f, tank) - M.crestAt(0.2, f, tank)) / h, 30, 1e-6);
  close((M.crestAt(0.8 + h, f, tank) - M.crestAt(0.8, f, tank)) / h, 20, 1e-6);
  close(M.crestAt(0.2 + 0.1, f, tank) - M.crestAt(0.2, f, tank), 3, 1e-9);     // 깊은 곳: T 동안 λ₁
  close(M.crestAt(0.8 + 0.1, f, tank) - M.crestAt(0.8, f, tank), 2, 1e-9);     // 얕은 곳: T 동안 λ₂
  close(M.timePerWavelength(f, tank, 1), M.timePerWavelength(f, tank, 2), 1e-12);
});

test('III1-03 같은 줄에서 진동수를 2배로 하면 속력 그대로, 파장 1/2배 (개념 체크)', () => {
  const v = 2;                                              // 줄의 속력은 매질이 정한다
  close(M.wavelength(v, 4) / M.wavelength(v, 2), 0.5);
  close(M.speed(4, M.wavelength(v, 4)), M.speed(2, M.wavelength(v, 2)));
  // 같은 줄(경계 없음)에서 1초 동안 지나가는 마루 수는 2배
  const rope = (f) => ({xb: 2, l1: v / f, l2: v / f});
  assert.equal(M.passed(1, 0, 1, 4, rope(4)), 2 * M.passed(1, 0, 1, 2, rope(2)));
});

test('III1-03 소리가 공기에서 물로: 진동수 일정, 속력 증가, 파장 증가 (개념 체크)', () => {
  const air = M.SOUND.find((s) => s.name === '공기 (20 °C)').v, water = M.SOUND.find((s) => s.name === '물').v;
  const c = M.cross(1000, air, water);
  assert.equal(c.f1, c.f2);
  assert.ok(c.v2 > c.v1);
  assert.ok(c.l2 > c.l1);
  close(c.l1, 0.343, 1e-12); close(c.l2, 1.5, 1e-12);
  close(c.l2 / c.l1, water / air, 1e-12);                   // 약 4.4 배
  // 소리: 고체 > 액체 > 기체, 같은 공기라도 따뜻하면 빠르다
  const v = Object.fromEntries(M.SOUND.map((s) => [s.name, s.v]));
  assert.ok(v['철'] > v['물'] && v['물'] > v['공기 (20 °C)'] && v['공기 (20 °C)'] > v['공기 (0 °C)']);
});

test('III1-03 물결파가 얕은 곳 → 깊은 곳으로 가면 파장이 길어진다 (빠른 쪽이 긴 파장)', () => {
  const c = M.cross(10, 20, 30);
  close(c.l1, 2); close(c.l2, 3);
  assert.ok(c.l2 > c.l1);
  const m = {xb: 15, l1: 2, l2: 3};
  assert.equal(M.passed(7.5, 0, 1, 10, m), M.passed(22.5, 0, 1, 10, m));
});
