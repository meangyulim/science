const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/12/III1-12-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// 페이지의 이중 슬릿 그림 비율(슬릿 간격 80, 스크린까지 330, 초록빛 파장 25 — 파장을 크게 과장한 그림 단위)
const d = 80, L = 330, lam = 25;

test('III1-12 예제(개념 체크): 두 슬릿까지의 경로차가 λ 인 곳에 밝은 무늬가 생긴다', () => {
  const y1 = M.yOfDiff(lam, d, L);
  close(M.slitDiff(y1, d, L), lam, 1e-6);
  assert.equal(M.judge(M.slitDiff(y1, d, L) / lam), 'con');
  close(M.brightness(1), 1, 1e-12);
  // 다른 보기: 중앙(경로차 0)은 밝고, 경로차 λ/2 인 곳은 어둡다
  assert.equal(M.judge(M.slitDiff(0, d, L) / lam), 'con');
  const yh = M.yOfDiff(lam / 2, d, L);
  assert.equal(M.judge(M.slitDiff(yh, d, L) / lam), 'des');
  close(M.brightness(0.5), 0, 1e-12);
});

test('III1-12 어두운 무늬에도 두 빛이 모두 도달한다: 각각은 진동하지만 합이 늘 0', () => {
  const yh = M.yOfDiff(lam / 2, d, L), [r1, r2] = M.slitR(yh, d, L);
  let each = 0;
  for (let k = 0; k <= 40; k++) {
    const tau = k / 40, a = M.wave(r1, lam, tau), b = M.wave(r2, lam, tau);
    each = Math.max(each, Math.abs(a), Math.abs(b));
    close(a + b, 0, 1e-9);
  }
  assert.ok(each > 0.99);
});

test('III1-12 이중 슬릿: 파장이 긴 빨간빛일수록 무늬 간격이 넓다 (빨강 > 초록 > 파랑)', () => {
  const gap = (nm) => M.yOfDiff(lam * nm / 532, d, L);
  assert.ok(gap(650) > gap(532) && gap(532) > gap(450));
});

test('III1-12 무반사 코팅: 두 반사광이 반대 위상 → 반사 4% → 약 1.4%, 그만큼 투과 증가', () => {
  const t = 550 / (4 * 1.38);                                  // 초록빛 기준 코팅 두께 ≈ 100 nm
  assert.equal(M.phaseJudge(M.filmDelta(t, 550, 1, 1.38, 1.5)), 'des');
  const R0 = M.reflectance(0, 550, 1, 1.38, 1.5), R1 = M.reflectance(t, 550, 1, 1.38, 1.5);
  close(R0, 0.04, 1e-12);
  close(R1, 0.0141, 2e-4);
  assert.ok(1 - R1 > 1 - R0);
});

test('III1-12 비누막: 두께가 곳곳 다르면 보강되는 색이 달라진다 (500 nm 는 초록 보강, 빨강·파랑 상쇄)', () => {
  const at = (t, nm) => M.phaseJudge(M.filmDelta(t, nm, 1, 1.33, 1));
  assert.equal(at(500, 532), 'con'); assert.equal(at(500, 650), 'des'); assert.equal(at(500, 450), 'des');
  const c500 = M.spectrumRGB((l) => M.twoBeam(M.filmDelta(500, l, 1, 1.33, 1)));
  assert.ok(c500[1] > c500[0] && c500[1] > c500[2]);          // 초록빛으로 보인다
  const c400 = M.spectrumRGB((l) => M.twoBeam(M.filmDelta(400, l, 1, 1.33, 1)));
  assert.ok(c400[1] < c400[0] && c400[1] < c400[2]);          // 400 nm 는 초록이 상쇄 → 자줏빛
  // 단색광의 색: 빨강·초록·파랑이 각각 그 성분이 가장 크다
  const [r, g, b] = [M.waveRGB(650), M.waveRGB(532), M.waveRGB(450)];
  assert.ok(r[0] > r[1] && r[0] > r[2] && g[1] > g[0] && g[1] > g[2] && b[2] > b[0] && b[2] > b[1]);
});

test('III1-12 간섭의 이용 분류: 상쇄 = 소음 제거 헤드폰·무반사 코팅, 보강 = 악기·초음파 결석 파쇄·색 변환 잉크', () => {
  assert.deepEqual(M.USES.filter((u) => u.kind === 'des').map((u) => u.name), ['소음 제거 헤드폰', '무반사 코팅']);
  assert.deepEqual(M.USES.filter((u) => u.kind === 'con').map((u) => u.name), ['악기', '초음파 결석 파쇄', '색 변환 잉크']);
  for (let t = 0; t < 2; t += 0.05) close(M.noise(t) + M.antiNoise(t), 0, 1e-12);      // 소음 + 반대 위상 소리 = 0
  // 결석 파쇄: 원호 위 5개 장치의 펄스가 중심(결석)에 동시에 도착해 5배로 보강, 다른 곳은 약하다
  const srcs = []; for (let k = -2; k <= 2; k++) { const a = Math.PI / 2 + k * 0.3; srcs.push([Math.cos(a), Math.sin(a)]); }
  close(M.pulsePeak(srcs, [0, 0]), 5, 1e-9);
  assert.ok(M.pulsePeak(srcs, [0.25, 0.1]) < 2);
});
