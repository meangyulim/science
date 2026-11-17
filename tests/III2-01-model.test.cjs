const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III2/01/III2-01-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
// 재현 가능한 난수 (선형 합동)
const rng = (seed = 12345) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test('III2-01 예제(개념 체크): 빛의 입자성만 짝지은 것 → 광전 효과, 콤프턴 산란', () => {
  const i = M.pickParticlePair();
  assert.equal(i, 1);
  assert.equal(M.EX_OPTIONS[i].join(', '), '광전 효과, 콤프턴 산란');
  for (const k of ['간섭', '회절', '굴절', '이중 슬릿 무늬']) assert.equal(M.classify(k), 'wave');
  for (const k of ['광전 효과', '콤프턴 산란', '사진 건판에 상이 기록됨']) assert.ok(M.lightParticle(k));
  // 함정: 전자선 회절은 파동성이지만 빛이 아니라 물질(전자)의 파동성
  assert.equal(M.classify('전자선 회절'), 'wave');
  assert.equal(M.find('edif').of, 'matter');
  assert.equal(M.lightParticle('전자선 회절'), false);
});

test('III2-01 이중 슬릿: 밝은 무늬(Δx = Lλ/d)와 어두운 무늬, 광자를 많이 모으면 무늬가 나타난다', () => {
  const o = {lambda: 532e-9, d: 0.25e-3, a: 0.05e-3, L: 1};
  const gap = M.fringeGap(o);
  close(gap, 532e-9 / 0.25e-3, 1e-12);
  close(M.slitIntensity(0, o), 1);
  assert.ok(M.slitIntensity(gap / 2, o) < 1e-12);                 // 상쇄 (어두운 무늬)
  assert.ok(M.slitIntensity(gap, o) > 0.8);                         // 다음 밝은 무늬
  // 한쪽 슬릿을 막으면 어두운 줄이 사라진다 (간섭은 두 길이 있어야 생긴다)
  assert.ok(M.slitIntensity(gap / 2, {...o, single: true}) > 0.8);
  // 광자 하나씩 2만 개: 밝은 무늬 근처에 몰리고 어두운 무늬 근처는 거의 없다
  const r = rng(7), ymax = 9e-3; let bright = 0, darkN = 0;
  for (let k = 0; k < 20000; k++) {
    const y = M.sampleScreen(r, o, ymax);
    assert.ok(Math.abs(y) <= ymax);
    if (Math.abs(y) < gap / 10) bright++;
    if (Math.abs(Math.abs(y) - gap / 2) < gap / 20) darkN++;
  }
  assert.ok(bright > 15 * Math.max(1, darkN), `bright ${bright}, dark ${darkN}`);
});

test('III2-01 콤프턴 산란: 산란된 X선은 파장이 길어지고(θ가 클수록 더), 에너지·운동량이 보존된다', () => {
  const lam = 10e-12;
  close(M.compton(lam, 0).lam2, lam, 1e-20);
  let prev = lam;
  for (const th of [30, 60, 90, 120, 150, 180]) {
    const s = M.compton(lam, th);
    assert.ok(s.lam2 > prev);                                       // 산란각이 클수록 λ′ 증가
    assert.ok(s.E2 < s.E1);                                         // 광자 에너지 감소 = 전자가 받은 만큼
    close(s.E1, s.E2 + s.Ke, 1e-25);
    // 운동량 보존 (전자는 상대론적 운동량 pc = √(K² + 2Kmc²))
    const mc2 = M.me * M.c * M.c, pe = Math.sqrt(s.Ke ** 2 + 2 * s.Ke * mc2) / M.c;
    const p1 = M.h / lam, p2 = M.h / s.lam2, t = th * Math.PI / 180, ph = s.phiDeg * Math.PI / 180;
    close((p2 * Math.cos(t) + pe * Math.cos(ph)) / p1, 1, 1e-3);    // 입사 방향
    close(p2 * Math.sin(t) / (pe * Math.sin(ph)), 1, 1e-3);          // 수직 방향
    prev = s.lam2;
  }
});

test('III2-01 광전 효과: 방출 여부는 광자 1개의 에너지(색)로 정해진다', () => {
  const W = 2.3;                                                    // 나트륨
  close(M.photonEV(650), 6.6e-34 * 3e8 / 650e-9 / 1.6e-19);
  assert.ok(M.photonEV(650) < W && !M.emits(650, W));               // 빨간빛: 아무리 세도 방출 없음
  assert.ok(M.photonEV(400) > W && M.emits(400, W));                // 보랏빛: 약해도 방출
});
