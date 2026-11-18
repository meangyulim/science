const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/A1/07/A1-07-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('A1-07 예제: 연직 위로 20 m/s → 최고점 2 s, 최고 높이 20 m, 3 s일 때 아래로 10 m/s, 높이 15 m', () => {
  close(M.topTime(20), 2);
  close(M.maxHeight(20), 20);
  close(M.vUp(20, 3), -10);            // − 는 아래 방향
  close(M.yUp(20, 3), 15);
  close(M.yUp(20, M.topTime(20)), M.maxHeight(20));
  // 대칭으로 보면 최고점 뒤 1 s 동안 5 m 내려온 위치
  close(M.maxHeight(20) - M.yUp(20, 3), 5);
});

test('A1-07 올라간 시간 = 내려온 시간: 최고점 기준 대칭 (같은 높이에서 속력 같고 방향 반대)', () => {
  for (const v0 of [5, 10, 15, 20, 25, 30]) {
    const t1 = M.topTime(v0);
    close(M.flightTime(v0), 2 * t1);
    close(M.yUp(v0, M.flightTime(v0)), 0);
    for (const t of [0, 0.3, 0.5, 1, t1 * 0.7, t1]) {
      if (t > t1) continue;
      const tm = M.mirrorTime(v0, t);
      close(M.yUp(v0, t), M.yUp(v0, tm), 1e-9);
      close(M.vUp(v0, t), -M.vUp(v0, tm), 1e-9);
    }
    const [ta, tb] = M.timesAtHeight(v0, M.maxHeight(v0) * 0.6);
    close(ta + tb, 2 * t1, 1e-9);
    close(Math.abs(M.vUp(v0, ta)), M.speedAtHeight(v0, M.maxHeight(v0) * 0.6), 1e-9);
    close(Math.abs(M.vUp(v0, tb)), M.speedAtHeight(v0, M.maxHeight(v0) * 0.6), 1e-9);
  }
  assert.deepEqual(M.timesAtHeight(20, 25), []);      // 최고 높이보다 높은 곳은 지나지 않는다
});

test('A1-07 v–t 넓이: 위쪽 넓이 = +H, 아래쪽 = −H, 2t₁ 에 합 0 → 제자리. 넓이 합 = 지금 높이', () => {
  const a2 = M.areas(20, 2), a3 = M.areas(20, 3), a4 = M.areas(20, 4);
  close(a2.pos, 20); close(a2.neg, 0);
  close(a3.pos, 20); close(a3.neg, -5); close(a3.net, M.yUp(20, 3));
  close(a4.net, 0); close(a4.neg, -a4.pos);
});

test('A1-07 최고점에서 속도는 0 이지만 가속도는 여전히 g, 질량과 무관', () => {
  close(M.vUp(20, M.topTime(20)), 0);
  // 1초마다 속도 변화가 늘 −g (최고점 앞뒤도 같다)
  for (const t of [0, 1, 1.5, 2, 2.5, 3]) close(M.vUp(20, t + 1) - M.vUp(20, t), -M.G);
  for (const m of [0.1, 1, 3, 50]) close(M.accelOf(m), M.G);
  assert.ok(M.weight(3) > M.weight(1));                 // 무거우면 중력은 크지만
  close(M.accelOf(3), M.accelOf(1));                    // 가속도는 같다
});

test('A1-07 자유 낙하: 같은 시간 간격의 낙하 거리 1 : 3 : 5 : 7, 누적 1 : 4 : 9 : 16', () => {
  const d = M.intervals(4, 1);
  assert.deepEqual(d, [5, 15, 25, 35]);
  assert.deepEqual(M.ratios(d), [1, 3, 5, 7]);
  assert.deepEqual([1, 2, 3, 4].map((t) => M.fallDist(0, t) / M.fallDist(0, 1)), [1, 4, 9, 16]);
  close(M.fallTime(80), 4);
  close(M.vDown(0, 3), 30);
  close(M.vFromHeight(45), 30);                         // v² = 2gh
});

test('A1-07 개념 체크: 처음 1 s 에 5 m → 2~3 s 의 1 s 동안 25 m (45 m 는 누적 거리)', () => {
  close(M.intervals(3, 1)[2], 25);
  close(M.fallDist(0, 3), 45);
});

test('A1-07 개념 체크: 6 s 뒤 제자리 → 최고점까지 3 s, v₀ = 30 m/s, 최고 높이 45 m', () => {
  const v0 = M.v0FromFlight(6);
  close(v0, 30);
  close(M.maxHeight(v0), 45);
  close(M.fallDist(0, 3), 45);                          // 최고점에서 3 s 자유 낙하한 거리와 같다
});

test('A1-07 아래로 던지면 홀수비는 깨지지만 이웃 구간의 차는 늘 gT²', () => {
  const d = M.intervals(3, 1, 10);
  assert.deepEqual(d, [15, 25, 35]);
  close(d[1] - d[0], M.stepDiff(1)); close(d[2] - d[1], M.stepDiff(1));
  close(M.fallTime(80, 10), -1 + Math.sqrt(17), 1e-12);
});
