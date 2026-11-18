const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A2/09/A2-09-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const path = (proc, o, n = 2000) => Array.from({length: n + 1}, (_, i) => { const s = M.at(proc, o, i / n); return [s.V, s.P]; });

test('A2-09 예제: 500 J 흡수, 1 × 10⁵ Pa 일정, ΔV = 2 × 10⁻³ m³ → W = 200 J, ΔU = +300 J', () => {
  close(M.work(1e5, 2e-3), 200, 1e-9);
  close(M.dU(500, 200), 300);
  const r = M.isobaric(1e5, 2e-3, 500);            // 무대의 기체로도 같은 값
  close(r.dV, 2e-3, 1e-12); close(r.W, 200, 1e-9); close(r.dU, 300, 1e-9);
  assert.equal(M.tempWord(r.dU), '상승');
});

test('A2-09 개념 체크: 300 J 의 일을 받아 압축되며 100 J 방출 → ΔU = +200 J (W = −300 J, +400 J 는 부호 실수)', () => {
  close(M.dU(-100, -300), 200);                     // ΔU = Q − W = −100 − (−300)
  const wrong = 300 + 100;                          // 흔한 실수: 받은 일에 방출한 열까지 더한 +400 J
  assert.notEqual(wrong, M.dU(-100, -300));
  assert.notEqual(M.dU(-100, 300), 200);            // W 부호를 + 로 쓰면 −400 J 이 된다
  const o = {P1: 1e5, V1: 2e-3, W: -300, dU: 200};    // 무대의 ‘압축 + 열 방출’ 경로
  const r = M.polyPath(o.P1, o.V1, o.W, o.dU);
  assert.ok(r.V < 2e-3);
  close(r.Q, -100, 1e-9);
  close(M.area(path('mix', o)), -300, 1e-3);          // 경로 아래 넓이 = W
  let prev = M.at('mix', o, 0);                        // 과정 내내 열을 내보내고(Q 감소), 일을 받고(W 감소), 내부 에너지는 는다
  for (let i = 1; i <= 50; i++) {
    const s = M.at('mix', o, i / 50);
    assert.ok(s.Q < prev.Q && s.W < prev.W && s.dU > prev.dU && s.V < prev.V);
    prev = s;
  }
  close(M.area(path('mix', {P1: 1e5, V1: 2e-3, W: -300, dU: 0})), -300, 1e-3);   // ΔU = 0 이면 등온 압축
});

test('A2-09 과정별 부호: 등압 팽창 (+,+,+), 등적 가열 (+,0,+), 단열 압축 (0,−,+), 단열 팽창 (0,+,−)', () => {
  const a = M.isobaric(1e5, 2e-3, 500), b = M.isochoric(1e5, 2e-3, 500), c = M.adiabatic(1e5, 2e-3, 1e-3), d = M.adiabatic(1e5, 2e-3, 4e-3);
  assert.deepEqual(M.signs(a.Q, a.W, a.dU), {Q: '+', W: '+', dU: '+'});
  assert.deepEqual(M.signs(b.Q, b.W, b.dU), {Q: '+', W: '0', dU: '+'});
  assert.deepEqual(M.signs(c.Q, c.W, c.dU), {Q: '0', W: '−', dU: '+'});
  assert.deepEqual(M.signs(d.Q, d.W, d.dU), {Q: '0', W: '+', dU: '−'});
  close(b.dU, 500);                                  // 등적: 받은 열이 모두 내부 에너지 (같은 열이면 등압보다 온도가 더 오른다)
  assert.ok(b.dU > a.dU);
  assert.equal(M.tempWord(c.dU), '상승'); assert.equal(M.tempWord(d.dU), '하강');
});

test('A2-09 기체가 한 일 = P–V 그래프 아래 넓이 (오른쪽 +, 왼쪽 −, 세로선 0)', () => {
  const o = {P1: 1e5, V1: 2e-3, Q: 500};
  close(M.area(path('iso', o)), 200, 1e-6);          // 직사각형 PΔV
  close(M.area(path('isoV', o)), 0, 1e-12);          // 등적: 넓이 0
  const oc = {P1: 1e5, V1: 2e-3, V2: 1e-3}, oe = {P1: 1e5, V1: 2e-3, V2: 4e-3};
  close(M.area(path('adc', oc)), M.adiabatic(1e5, 2e-3, 1e-3).W, 1e-3);   // 곡선 아래 넓이 = W (음수)
  close(M.area(path('ade', oe)), M.adiabatic(1e5, 2e-3, 4e-3).W, 1e-3);
  assert.ok(M.area(path('adc', oc)) < 0 && M.area(path('ade', oe)) > 0);
});

test('A2-09 모든 과정의 모든 순간에 Q = ΔU + W (열까지 포함한 에너지 보존), 단열이면 ΔU = −W', () => {
  const cases = [['iso', {P1: 1e5, V1: 2e-3, Q: 500}], ['iso', {P1: 2e5, V1: 2e-3, Q: 800}], ['isoV', {P1: 1e5, V1: 2e-3, Q: 500}],
    ['adc', {P1: 1e5, V1: 2e-3, V2: 0.9e-3}], ['ade', {P1: 1e5, V1: 2e-3, V2: 4.5e-3}], ['mix', {P1: 1e5, V1: 2e-3, W: -300, dU: 200}]];
  for (const [proc, o] of cases) for (let i = 0; i <= 20; i++) {
    const s = M.at(proc, o, i / 20);
    close(s.Q, s.dU + s.W, 1e-9);
    if (proc === 'adc' || proc === 'ade') { close(s.Q, 0); close(s.dU, -s.W, 1e-9); }
  }
  // 단열에서 W 로 나중 부피를 정하는 식이 단열 과정과 맞는다
  const V2 = M.adiabaticV2(1e5, 2e-3, -200);
  close(M.adiabatic(1e5, 2e-3, V2).W, -200, 1e-9);
});

test('A2-09 도전: 2 × 10⁵ Pa 에서 2 L → 5 L 등압 팽창, 1500 J 흡수 → W = 600 J, ΔU = +900 J. 등적 냉각으로 처음 온도 → 900 J 방출, 알짜 열 600 J = 알짜 일', () => {
  const W = M.work(2e5, 3e-3), d = M.dU(1500, W);
  close(W, 600, 1e-9); close(d, 900, 1e-9);
  const r = M.isobaric(2e5, 2e-3, 1500);            // 무대의 기체와도 맞는다
  close(r.V2, 5e-3, 1e-12);
  const dBC = -d, QBC = M.heat(dBC, 0);              // 등적: W = 0
  close(QBC, -900, 1e-9);
  close(1500 + QBC, 600, 1e-9);                      // 전체 ΔU = 0 → 알짜 열 = 알짜 일
});
