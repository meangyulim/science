const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/16/A1-16-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A1-16 예제(개념 체크): ㄱ 틀림 · ㄴ 옳음 · ㄷ 옳음 → 답 ㄴ, ㄷ', () => {
  // ㄱ 위로 가속하는 우주선 안에서 수평으로 쏜 빛은 위쪽으로 휘어 보인다? → 가속도 반대쪽(아래)으로 휜다
  const a = M.bendDir(M.SHIPS.rocket.aShip) === 'up';
  // ㄴ 광원이 은하단 바로 뒤에 있으면 상이 고리 → 중력 렌즈
  const b = M.lensKind(0, M.einsteinR(1), 0.15) === 'ring';
  // ㄷ 중력 효과만 보면 지표의 시계가 높은 탑 꼭대기의 시계보다 느리다
  const R = M.EARTH.R, cc = M.earthRate(R) < M.earthRate(R + 500);
  assert.deepEqual([a, b, cc], [false, true, true]);
  const answer = ['ㄱ', 'ㄴ', 'ㄷ'].filter((_, i) => [a, b, cc][i]).join(', ');
  assert.equal(answer, 'ㄴ, ㄷ');
});

test('A1-16 등가 원리: 지표에 정지 ≡ 빈 우주에서 g 가속, 자유 낙하 ≡ 떠 있음 — 공·빛의 길이 똑같다', () => {
  const S = M.SHIPS;
  assert.ok(M.indistinguishable(S.ground, S.rocket));
  assert.ok(M.indistinguishable(S.fall, S.float));
  assert.ok(!M.indistinguishable(S.ground, S.float));
  close(M.gEff(S.fall.gField, S.fall.aShip), 0);                         // 자유 낙하 = 무중력
  for (const t of [0.1, 0.3, 0.45]) {
    assert.deepEqual(M.ballAt(4, 1.25, M.gEff(S.ground.gField, S.ground.aShip), t), M.ballAt(4, 1.25, M.gEff(S.rocket.gField, S.rocket.aShip), t));
  }
  close(M.lightDrop(4.3, 8, M.gEff(10, 0)), M.lightDrop(4.3, 8, M.gEff(0, 10)));
  // 관성 질량 = 중력 질량 → 공의 길은 질량과 상관없다 (식에 질량이 없다)
  assert.equal(M.ballAt.length, 4);
  // 다른 가속도면 구별된다
  assert.ok(!M.indistinguishable(S.ground, {gField: 0, aShip: 15}));
});

test('A1-16 빛의 휨: 가속도 반대쪽으로, 가속도가 클수록 많이 휜다 (밖에서 보면 곧게 가고 우주선이 ½at² 올라간다)', () => {
  assert.equal(M.bendDir(10), 'down');
  assert.equal(M.bendDir(0), 'none');
  assert.ok(M.lightDrop(4.3, 8, 20) > M.lightDrop(4.3, 8, 10));
  close(M.lightDrop(4.3, 8, 20) / M.lightDrop(4.3, 8, 10), 2, 1e-12);     // 낙차 ∝ a
  const t = 4.3 / 8;
  close(M.shipRise(10, t), M.lightDrop(4.3, 8, 10), 1e-12);              // 안에서 본 낙차 = 밖에서 본 우주선의 상승
  // 실제 빛 (c = 3 × 10⁸ m/s): 4.3 m 를 건너는 동안 낙차는 약 10⁻¹⁵ m → 그림은 크게 과장
  const real = M.lightDrop(4.3, M.c, 10);
  assert.ok(real > 1e-16 && real < 1e-14, String(real));
});

test('A1-16 중력 렌즈: 일직선이면 고리, 어긋나면 상 2개(양쪽), 질량이 클수록 많이 휜다, 상은 렌즈에서 더 먼 쪽에 보인다', () => {
  const thE = M.einsteinR(1), im0 = M.lensImages(0, thE);
  close(im0.plus, thE); close(im0.minus, -thE);                          // β = 0 → 반지름 θ_E 인 고리
  assert.equal(M.lensKind(0, thE, 0.15), 'ring');
  assert.equal(M.lensKind(0.6, thE, 0.15), 'two');
  const im = M.lensImages(0.6, thE);
  assert.ok(im.plus > 0.6 && im.minus < 0);                              // 광원 쪽 바깥 + 반대쪽
  for (const beta of [0.3, 0.6, 1.2]) {                                  // 렌즈 방정식 β = θ − θ_E²/θ 를 만족
    const q = M.lensImages(beta, thE);
    close(q.plus - thE * thE / q.plus, beta, 1e-12); close(q.minus - thE * thE / q.minus, beta, 1e-12);
  }
  assert.ok(M.einsteinR(4) > M.einsteinR(1));                           // 질량이 크면 고리가 크다
  close(M.einsteinR(4) / M.einsteinR(1), 2, 1e-12);
  assert.ok(M.deflection(2, 1) > M.deflection(1, 1) && M.deflection(1, 1) > M.deflection(1, 2));
  // 일식(1919): 태양 근처 별의 상은 실제보다 태양에서 먼 쪽, 어두운 상은 태양 원판에 가려 하나만 보인다
  const sun = M.lensImages(1.4, M.einsteinR(0.5));
  assert.ok(sun.plus > 1.4);
  assert.equal(M.lensKind(1.4, M.einsteinR(0.5), 0.1, 1.1), 'one');
  close(M.SUN_LIMB_ARCSEC, 1.75);
  close(M.mercuryExcess(), 43);                                          // 수성 근일점: 574″ − 531″
});

test('A1-16 별의 최후: 중심부 질량 1.4·3 태양 질량이 경계, 사건의 지평선에서 탈출 속력 = c', () => {
  assert.equal(M.remnant(1), 'wd'); assert.equal(M.remnant(1.4), 'wd');
  assert.equal(M.remnant(2), 'ns'); assert.equal(M.remnant(3), 'ns');
  assert.equal(M.remnant(3.5), 'bh'); assert.equal(M.remnant(10), 'bh');
  const Mbh = 10 * M.MSUN, rs = M.horizonR(Mbh);
  close(M.escapeSpeed(Mbh, rs), M.c, 1e-3);                              // 지평선: 탈출 속력 = c
  assert.ok(!M.canLightEscape(Mbh, rs * 0.9) && M.canLightEscape(Mbh, rs * 1.1));
  close(M.horizonR(M.MSUN) / 1000, 2.964, 0.01);                         // 태양 질량이면 약 3 km
  assert.ok(M.canLightEscape(2 * M.MSUN, M.remnantRadius(2)));           // 중성자별 표면에서는 빛이 나온다
  assert.ok(M.escapeSpeed(2 * M.MSUN, M.remnantRadius(2)) / M.c > 0.5);  // …그래도 c 의 절반을 넘는다
  assert.ok(M.escapeSpeed(1 * M.MSUN, M.remnantRadius(1)) / M.c < 0.05); // 백색 왜성은 훨씬 작다
});

test('A1-16 중력 시간 지연: 가까울수록(중력이 강할수록) 느리다, 지평선에서 0 / 지표 < 탑 < GPS 위성', () => {
  const rs = 1, rates = [1.2, 2, 5, 50].map((r) => M.clockRate(r, rs));
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] > rates[i - 1]);
  close(M.clockRate(1, 1), 0);
  const R = M.EARTH.R;
  assert.ok(M.earthRate(R) < M.earthRate(R + 500) && M.earthRate(R + 500) < M.earthRate(R + 2.02e7));
  // GPS 위성 시계는 (중력만으로) 하루에 약 45 μs 빨리 간다
  const dayGain = (M.earthRate(R + 2.02e7) - M.earthRate(R)) * 86400 * 1e6;
  assert.ok(dayGain > 40 && dayGain < 60, String(dayGain));
});
