const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/08/III2-08-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('III2-08 개념 체크 예제: ㄱ(데이비슨·거머 보강 간섭)·ㄴ(톰슨 동심원 회절)은 파동성, ㄷ(바람개비 회전)은 입자성 → 답 ㄱ, ㄴ', () => {
  assert.equal(M.natureOf('dg'), 'wave');
  assert.equal(M.natureOf('thomson'), 'wave');
  assert.equal(M.natureOf('slit'), 'wave');
  assert.equal(M.natureOf('wheel'), 'particle');
  const [g, n, d] = M.STATEMENTS.map(M.judge);
  assert.equal(g, true); assert.equal(n, true); assert.equal(d, false);
  assert.equal(M.correctMarks(), 'ㄱ, ㄴ');
});

test('III2-08 데이비슨·거머: 54 V 전자는 검출기 각도 약 50°에서 전자 수가 가장 많다 (보강 간섭)', () => {
  const peak = M.dgPeakAngle(54);
  assert.ok(Math.abs(peak - 50) <= 0.5, `최대 각도 ${peak}°`);
  // 50° 에서 이웃 원자의 경로차 = 한 파장 → 보강, 그보다 작은·큰 각에서는 전자 수가 적다
  close(M.pathRatio(50), 1, 1e-12);
  close(M.dgCount(50), 1, 1e-12);
  for (const a of [20, 30, 40, 60, 70, 85]) assert.ok(M.dgCount(a) < 0.75, `${a}° 에서 ${M.dgCount(a)}`);
  assert.ok(M.dgInterference(30) < 0.01 && M.dgInterference(50) > 0.999);
});

test('III2-08 데이비슨·거머: 보강 조건으로 구한 파장 = 드브로이 파장 h/√(2meV) ≈ 0.17 nm', () => {
  const lamDB = M.lambdaV(54);
  close(lamDB, 6.6e-34 / Math.sqrt(2 * 9.1e-31 * 1.6e-19 * 54), 1e-24);
  assert.ok(lamDB > 1.6e-10 && lamDB < 1.7e-10);
  close(M.pathDiff(50), lamDB, 1e-22);          // 50° 방향 경로차가 정확히 한 파장
  // 니켈 원자 간격 정도(0.2 nm 안팎)로 단순화한 격자
  assert.ok(M.DG_D > 2.1e-10 && M.DG_D < 2.2e-10 && M.DG_C > 2.0e-10 && M.DG_C < 2.1e-10);
});

test('III2-08 전자 이중 슬릿: 파동이면 여러 줄의 간섭무늬, 입자로만 행동하면 두 줄', () => {
  assert.ok(M.countPeaks((u) => M.slitWave(u, 1), -7, 7) >= 7);
  assert.equal(M.countPeaks(M.slitParticle, -7, 7), 2);
  // 가운데(두 슬릿에서 거리가 같은 곳)는 밝고, 반 간격 자리는 어둡다(상쇄)
  close(M.slitWave(0, 1), 1);
  assert.ok(M.slitWave(0.5, 1) < 1e-12);
  // 하나씩 뽑아 쌓아도(표집) 밝은 곳에 많이, 어두운 곳에 거의 없이 쌓인다
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let bright = 0, dark = 0;
  for (let i = 0; i < 5000; i++) {
    const u = M.sample((x) => M.slitWave(x, 1), -7, 7, rnd);
    const f = ((u % 1) + 1) % 1;                  // 무늬 한 칸 안의 자리
    if (f < 0.15 || f > 0.85) bright++; else if (f > 0.35 && f < 0.65) dark++;
  }
  assert.ok(bright > 10 * dark, `밝은 곳 ${bright}, 어두운 곳 ${dark}`);
});

test('III2-08 광전자 이중 슬릿: 가속 전압을 4배로 높이면 물질파 파장 1/2 → 무늬 간격 1/2', () => {
  close(M.lambdaV(4 * 50) / M.lambdaV(50), 0.5, 1e-12);
  close(M.fringeScale(4), 0.5);
  close(M.fringeScale(2), 1 / Math.sqrt(2));
  // 무늬가 줄어든 만큼 첫 어두운 줄도 가운데로 다가온다
  assert.ok(M.slitWave(0.25, 4) < 1e-12 && M.slitWave(0.25, 1) > 0.4);
  // 입자로만 행동한다면 무늬가 전압과 상관없다
  close(M.slitParticle(1.85), 1);
});

test('III2-08 톰슨: 파장이 같으면 X선과 전자선의 고리가 같고, 고리 반지름의 비는 파장과 무관하다', () => {
  const lamX = 1.2e-11, lamE = 1.2e-11;
  assert.deepEqual(M.ringRadii(lamX), M.ringRadii(lamE));
  const r1 = M.ringRadii(1e-11), r2 = M.ringRadii(2e-11);
  r1.forEach((r, i) => close(r2[i] / r, 2, 1e-12));          // 파장 2배 → 고리 2배
  r1.forEach((r, i) => close(r / r1[0], Math.sqrt(M.RING_N[i] / 3), 1e-12));   // 같은 모양
  // 고리 자리에서 밝고, 고리 사이(둘째와 셋째 고리 가운데)는 어둡다
  const rr = M.ringRadii(1, 100);
  assert.ok(M.ringProfile(rr[0], 1, 100) > 10 * M.ringProfile((rr[1] + rr[2]) / 2, 1, 100));
});

test('III2-08 바람개비: 전자선을 맞는 동안 회전이 빨라지고, 위쪽 날개를 밀면 시계 방향(입자성: 운동량 전달)', () => {
  assert.equal(M.wheelOmega(0, 30), 0);
  assert.ok(M.wheelOmega(1, 30) > 0 && M.wheelOmega(3, 30) > M.wheelOmega(1, 30));
  assert.equal(M.wheelOmega(5, 0), 0);
  assert.equal(M.torqueSign(true, 1), 1);
  assert.ok(M.momentum(54) > 0);
});
