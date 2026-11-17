const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/04/III2-04-model.js');

test('III2-04 개념 체크: 경보가 울리는 순간 = 빛이 가려져 광전류가 끊기고 전자석이 힘을 잃는다 (정답 ④, 0부터 3번)', () => {
  const before = M.burglar({blocked: false}), after = M.burglar({blocked: true});
  // 평소: 빛이 닿아 광전류 → 전자석이 막대를 끌어당겨 스위치 열림 → 조용
  assert.equal(before.I, 1);
  assert.equal(before.magnet, true);
  assert.equal(before.closed, false);
  assert.equal(before.alarm, false);
  // 침입자가 빛을 가린 뒤: 광전류 0 → 전자석 힘 잃음 → 용수철이 스위치를 닫음 → 경보
  assert.equal(after.light, 0);
  assert.equal(after.I, 0);
  assert.equal(after.magnet, false);
  assert.equal(after.closed, true);
  assert.equal(after.alarm, true);
  const tf = M.judge(before, after);
  assert.deepEqual(tf, [false, false, false, true, false]);
  assert.equal(tf.indexOf(true), 3);
  assert.equal(M.CHOICES[3], '빛이 가려져 광전류가 끊기고 전자석이 힘을 잃는다');
});

test('III2-04 화재 경보기는 반대: 연기가 없으면 광전류 0(조용), 산란광이 닿으면 광전류 → 경보, 연기가 많을수록 광전류가 크다', () => {
  const clear = M.fire({smoke: 0});
  assert.equal(clear.I, 0);
  assert.equal(clear.alarm, false);
  const thin = M.fire({smoke: 0.3}), thick = M.fire({smoke: 0.8});
  assert.ok(thin.I > 0 && thin.alarm);
  assert.ok(thick.I > thin.I);
  assert.equal(M.TRIGGER.fire, 'flow');
  assert.equal(M.TRIGGER.burglar, 'cut');
});

test('III2-04 문턱 진동수보다 작은 빛은 세기와 관계없이 광전류를 만들지 못한다 → 침입자가 없어도 경보가 울린다', () => {
  const fRed = M.freq(M.LIGHT.red), fViolet = M.freq(M.LIGHT.violet);
  assert.ok(fRed < M.F0 && fViolet > M.F0);
  assert.equal(M.photoCurrent(1, fRed), 0);
  assert.equal(M.photoCurrent(100, fRed), 0);
  assert.equal(M.photoCurrent(1, fViolet), 1);
  const red = M.burglar({blocked: false, nm: M.LIGHT.red});
  assert.equal(red.light, 1);                 // 빛은 닿지만
  assert.equal(red.I, 0);                     // 광전자가 나오지 않아
  assert.equal(red.alarm, true);              // 늘 울린다
  // 광자 에너지 hf 와 일함수 W = hf₀ 비교 (h = 6.6 × 10⁻³⁴ J·s)
  assert.ok(M.h * fViolet > M.W0 && M.h * fRed < M.W0);
});

test('III2-04 같은 계전기 구조의 가로등은 어두워지면(광전류가 작아지면) 켜지고, 태양 전지 전류는 빛의 세기에 비례한다', () => {
  assert.equal(M.streetlight({hour: 12}).lamp, false);
  assert.equal(M.streetlight({hour: 0}).lamp, true);
  for (let h = 0; h <= 24; h += 0.25) {
    const s = M.streetlight({hour: h});
    assert.equal(s.lamp, s.I < M.HOLD);
    assert.equal(s.lamp, M.works('street', s.I));
  }
  // 해 질 녘: 광전류가 붙잡는 기준 아래로 내려가는 순간 켜진다
  const dusk = 18 - 12 / Math.PI * Math.asin(M.HOLD);
  assert.equal(M.streetlight({hour: dusk - 0.05}).lamp, false);
  assert.equal(M.streetlight({hour: dusk + 0.05}).lamp, true);
  // 태양 전지: 세기 2배 → 전류 2배
  assert.ok(Math.abs(M.solar({light: 1}).I - 2 * M.solar({light: 0.5}).I) < 1e-12);
  assert.equal(M.solar({light: 0}).I, 0);
});

test('III2-04 빛줄기 가림 판정: 몸이 빛줄기 중심을 덮을 때만 가린다', () => {
  assert.equal(M.blocks(100, 15, 108), true);
  assert.equal(M.blocks(100, 15, 120), false);
  assert.equal(M.blocks(100, 15, 85.5), true);
});
