const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/05/III2-05-model.js');

test('III2-05 예제: 빨강·파랑 화소에만 전자 → 입사광은 빨강과 파랑, 세기 2배 → 빨강·파랑 화소 2배, 초록 0', () => {
  const light = {R: 1, G: 0, B: 0.5}, T = 2;            // 무대 기본값 (예제 상황)
  const c1 = M.counts(light, T);
  assert.deepEqual(c1, {R: 8, G: 0, B: 4});
  assert.deepEqual(M.detect(c1), ['R', 'B']);
  assert.equal(M.detect(c1).map((k) => M.NAME[k]).join(', '), '빨강, 파랑');
  const c2 = M.counts({R: 2, G: 0, B: 1}, T);          // 세기 2배
  assert.deepEqual(c2, {R: 16, G: 0, B: 8});
  assert.equal(c2.R, 2 * c1.R);
  assert.equal(c2.B, 2 * c1.B);
  assert.equal(c2.G, 0);
});

test('III2-05 필터가 막는 색은 아무리 세도 전자를 만들지 못하고, 전자 수는 세기와 노출 시간에 비례한다', () => {
  // 초록 필터 화소에 빨간빛만 아주 세게
  assert.equal(M.electrons({R: 2, G: 0, B: 0}, 2, 'G'), 0);
  assert.equal(M.electrons({R: 100, G: 0, B: 0}, 2, 'G'), 0);
  // 세기 2배 → 2배, 노출 시간 2배 → 2배
  assert.equal(M.electrons({R: 1}, 1, 'R') * 2, M.electrons({R: 2}, 1, 'R'));
  assert.equal(M.electrons({R: 1}, 0.5, 'R') * 2, M.electrons({R: 1}, 1, 'R'));
  // 광자가 일정한 간격으로 올 때 [t0, t0 + T) 동안 도착하는 수 = K·I·T (어느 순간에 셔터를 열어도)
  for (const I of [0.5, 1, 1.5, 2]) for (const T of [0.5, 1, 1.5, 2]) for (const ph of [0.05, 0.5, 0.95]) for (const t0 of [0, 0.37, 3.1]) {
    assert.equal(M.arrivals(M.K * I, t0, T, ph), M.K * I * T);
  }
});

test('III2-05 필터를 없애면 전자 수가 늘지만 모든 화소가 같은 값 → 색을 구별하지 못한다(흑백)', () => {
  const light = {R: 1, G: 0, B: 0.5};
  const on = M.counts(light, 2), off = M.counts(light, 2, false);
  assert.ok(off.R >= on.R && off.G >= on.G && off.B >= on.B);
  assert.ok(off.G > on.G);
  assert.equal(off.R, off.G);
  assert.equal(off.G, off.B);
  const rc = M.reconstruct(off);
  assert.equal(rc.r, rc.g);
  assert.equal(rc.g, rc.b);
  // 필터가 있으면 재구성한 색이 입사광의 비율을 따른다
  const col = M.reconstruct(on);
  assert.deepEqual(col, {r: 128, g: 0, b: 64});
  // 필터 배열: 어느 줄에나 세 색이 다 있다
  for (let r = 0; r < 4; r++) assert.deepEqual(new Set([0, 1, 2].map((k) => M.filterAt(r, k))), new Set(['R', 'G', 'B']));
});

test('III2-05 전하 결합: 전압을 6단계 바꾸면 전자 묶음이 한 화소(전극 3칸) 옮겨지고, 묶음은 늘 (+) 전극 아래에 갇혀 섞이지 않는다', () => {
  for (let s = 0; s <= 12; s++) {
    const [a, b] = M.span(0, s);
    for (let e = a; e <= b; e++) assert.equal(M.volt(e, s), 1, `단계 ${s}: 전극 ${e}`);
    assert.equal(M.volt(a - 1, s), 0);                  // 양옆은 0 V → 이웃 묶음과 섞이지 않음
    assert.equal(M.volt(b + 1, s), 0);
  }
  assert.deepEqual(M.span(0, 0), [0, 0]);                // ① 첫 전극 아래
  assert.deepEqual(M.span(0, 1), [0, 1]);                // ② 두 전극 아래로 고르게 퍼짐
  assert.deepEqual(M.span(0, 2), [1, 1]);                // ③ 둘째 전극 아래로 이동
  assert.deepEqual(M.span(0, 6), [3, 3]);                // 6단계 → 다음 화소의 첫 전극
  assert.deepEqual(M.PHASES[6 % 6], M.PHASES[0]);
  // 6화소 줄: 출력에 가까운 화소부터 6단계마다 하나씩 읽힌다
  assert.deepEqual(M.readOrder(6), [5, 4, 3, 2, 1, 0]);
  assert.equal(M.readStep(5, 6), 6);
  assert.equal(M.readStep(0, 6), 36);
  assert.equal(M.span(3 * 2, M.readStep(2, 6))[0], 3 * 6);
});
