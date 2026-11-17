const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/08/III1-08-model.js');
const rel = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.abs(b), `${a} ≠ ${b}`);

test('III1-08 예제: 진공에서 λ = 0.6 μm 가시광선 → 5 × 10¹⁴ Hz, λ = 3 m 라디오파 → 1 × 10⁸ Hz', () => {
  rel(M.freq(0.6e-6), 5e14);
  rel(M.freq(3), 1e8);
  assert.equal(M.region(0.6e-6).name, '가시광선');
  assert.equal(M.region(3).name, '라디오파');
  // 파장이 500만 배 길면 진동수는 500만 분의 1
  rel(3 / 0.6e-6, 5e6);
  rel(M.freq(0.6e-6) / M.freq(3), 5e6);
  // 화면 표시 단위
  const u = M.lengthUnit(0.6e-6); assert.equal(u.u, 'μm'); rel(u.v, 0.6);
  assert.equal(M.lengthUnit(3).u, 'm');
  rel(M.snap2(Math.pow(10, -6.22)), 6e-7);
});

test('III1-08 진공에서 모든 전자기파의 속력은 c 로 같다 (c = fλ), 소리·초음파는 진공에서 전달되지 않는다', () => {
  for (const lam of [1e-12, 1e-9, 0.6e-6, 1e-5, 0.12, 3, 300]) rel(M.freq(lam) * lam, M.C);
  assert.equal(M.speed('em'), M.speed('em'));
  assert.equal(M.speed('em', 'vacuum'), 3e8);
  assert.equal(M.speed('sound', 'vacuum'), 0);
  assert.equal(M.speed('ultrasound', 'vacuum'), 0);
  assert.ok(M.speed('sound', 'air') < M.speed('em') / 1e5);
  assert.equal(M.isEM('ultrasound'), false);
});

test('III1-08 진동수 순서: 감마 > X > 자외 > 가시 > 적외 > 마이크로 > 라디오, 파장은 역순', () => {
  const reps = {gamma: 1e-12, xray: 1e-9, uv: 1e-7, vis: 5e-7, ir: 1e-5, mw: 0.12, radio: 3};
  for (const [id, lam] of Object.entries(reps)) assert.equal(M.region(lam).id, id);
  const names = M.byFrequency(Object.values(reps).slice().reverse()).map((l) => M.region(l).name);
  assert.deepEqual(names, ['감마선', 'X선', '자외선', '가시광선', '적외선', '마이크로파', '라디오파']);
  // 개념 체크: X선 > 자외선 > 적외선 > 마이크로파
  assert.deepEqual(M.orderByFrequency(['mw', 'ir', 'uv', 'xray']), ['xray', 'uv', 'ir', 'mw']);
  // 진동수가 클수록 광자 에너지 hf 가 크다
  assert.ok(M.photonEnergy(1e-12) > M.photonEnergy(0.6e-6) && M.photonEnergy(0.6e-6) > M.photonEnergy(3));
  rel(M.photonEnergy(0.6e-6), 3.3e-19);
  // 가시광선: 보라(400 nm)가 빨강(700 nm)보다 진동수가 크다
  assert.ok(M.freq(400e-9) > M.freq(700e-9));
  rel(M.freq(400e-9), 7.5e14);
});

test('III1-08 E ⊥ B ⊥ 진행 방향, E 와 B 는 같은 위상 (횡파)', () => {
  const w = {f: 5e14, lambda: 0.6e-6, E0: 1};
  const ex = [1, 0, 0];
  for (const [x, t] of [[0.1e-6, 0], [0.37e-6, 1e-16], [0.5e-6, 3.3e-15]]) {
    const {E, B} = M.fields(x, t, w);
    assert.equal(M.dot(E, B), 0);
    assert.equal(M.dot(E, ex), 0);
    assert.equal(M.dot(B, ex), 0);
    const s = M.cross(E, B);
    assert.ok(s[0] >= 0 && s[1] === 0 && s[2] === 0);          // E × B 는 진행 방향(+x)
    rel(B[2] * M.C, E[1], 1e-12);                               // 같은 위상: B = E/c
  }
  // 마루는 한 주기 동안 한 파장(λ) 나아간다 → 속력 = λ/T = c
  const T = 1 / w.f, c0 = M.crests(0, w, 0, 3e-6), c1 = M.crests(T / 4, w, 0, 3e-6);
  rel(c1[0] - c0[0] > 0 ? c1[0] - c0[0] : c1[1] - c0[0], w.lambda / 4, 1e-6);
  rel(w.lambda / T, M.C);
});

test('III1-08 가시광선의 색과 크기 비교', () => {
  const v = M.visibleRGB(400), r = M.visibleRGB(700), g = M.visibleRGB(530);
  assert.ok(v[2] > v[1] && v[0] > v[1]);   // 보라: 파랑 + 약간 빨강
  assert.ok(r[0] > 150 && r[1] === 0 && r[2] === 0);
  assert.ok(g[1] > g[0] && g[1] > g[2]);
  assert.equal(M.visibleRGB(300), null);
  assert.equal(M.region(400e-9).name, '가시광선');
  assert.equal(M.region(700e-9).name, '가시광선');
  assert.equal(M.region(750e-9).name, '적외선');
  assert.equal(M.region(380e-9).name, '자외선');
  assert.equal(M.colorName(600), '주황');
  assert.equal(M.nearestObject(0.6e-6).name, '세균');
  assert.equal(M.nearestObject(3).name, '사람');
  assert.equal(M.nearestObject(1e-10).name, '원자');
  assert.equal(M.nearestObject(0.12).name, '스마트폰');
});
