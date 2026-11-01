const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../sims/cluster-cmd/cluster-cmd-model.js');
const D = require('../sims/cluster-cmd/cluster-cmd-data.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('real data: counts, ranges and named Pleiades stars', () => {
  assert.equal(M.M45.length, 406);                      // Stauffer et al. 2007 회원 별
  assert.equal(M.M3.length, 2356);                      // Rey et al. 2001
  const v45 = M.M45.map(s => s.V), bv45 = M.M45.map(s => s.bv);
  close(Math.min(...v45), 2.87);                        // 알키오네 V = 2.87 (수업 28번 노트)
  close(Math.min(...bv45), -0.12, 1e-9);                // 가장 푸른 별 = 교과서 M45 전향점 색지수 −0.12
  const alcyone = M.M45.find(s => s.name === '알키오네');
  close(alcyone.V, 2.87); close(alcyone.bv, -0.09, 1e-9);
  assert.equal(M.M45.filter(s => s.name).length, 9);
  const v3 = M.M3.map(s => s.V);
  assert.ok(Math.min(...v3) > 11 && Math.max(...v3) < 23);  // 수업 그림의 세로축 11~23등급
  // 표준 주계열은 색지수가 커질수록 어두워진다(단조)
  for (let i = 1; i < M.MS.length; i++) assert.ok(M.MS[i].bv > M.MS[i - 1].bv && M.MS[i].mv > M.MS[i - 1].mv);
  assert.equal(D.ms[0][0], 'B0V');
});

test('colour index: B − V, textbook star values and B = V + (B − V)', () => {
  const n = D.named;
  close(M.colourIndex(n.betelgeuse.B, n.betelgeuse.V), 1.85, 1e-9);   // 베텔게우스 2.27 − 0.42
  close(M.colourIndex(n.rigel.B, n.rigel.V), -0.03, 1e-9);            // 리겔 0.10 − 0.13
  close(M.colourIndex(n.vega.B, n.vega.V), 0, 1e-9);                  // 직녀성 = 기준 0
  close(M.bFromV(9.5, 0.5), 10.0);                                     // Q2 ㄷ: 9.0이 아니라 10.0
  close(M.SUN.bv, 0.65); close(M.SUN.V, -26.7);                        // 태양 +0.65 (지도서), −26.7 (교과서)
  close(M.bFromV(M.SUN.V, M.SUN.bv), -26.05, 1e-9);
  close(M.bOverV(0), 1);                                               // 색지수 0: B 빛 = V 빛
  assert.ok(M.bOverV(-0.2) > 1 && M.bOverV(0.65) < 1);                 // 청색 별은 B로 더 밝다
  assert.equal(M.tempWord(-0.03), '10000 K보다 뜨겁다');
  assert.equal(M.tempWord(0), '약 10000 K');
  assert.equal(M.tempWord(0.65), '10000 K보다 차갑다');
  assert.equal(M.colourName(-0.03), '청백색'); assert.equal(M.colourName(0.65), '황색'); assert.equal(M.colourName(1.85), '적색');
  // 그림용 별빛 모양: 뜨거운 별일수록 짧은 파장(B) 쪽이 상대적으로 세다
  const ratio = T => M.spectrum(440, T) / M.spectrum(548, T);
  assert.ok(ratio(20000) > ratio(10000) && ratio(10000) > ratio(4000));
});

test('magnitudes and distance: lesson and textbook numbers', () => {
  close(M.lumRatio(5), 100);                       // 5등급 = 100배
  close(M.lumRatio(10), 10000);                    // 10등급 = 1만 배 (오늘의 질문 답)
  close(M.distanceFromModulus(0), 10);
  close(M.distanceFromModulus(5), 100);            // 슬라이드 21 예, Q4 ㄱ
  close(M.distanceFromModulus(10), 1000);          // Q4 ㄴ
  close(M.distanceFromModulus(15), 10000);
  close(M.logDistance(5.5), 2.1); close(M.logDistance(16.2), 4.24);
  assert.equal((10 ** 0.1).toFixed(2), '1.26'); assert.equal((10 ** 0.24).toFixed(2), '1.74');   // 학습지 「계산 도움」
  assert.equal(M.formatPc(M.distanceFromModulus(5.5)), '126 pc');  // 교과서 탐구하기 2: M45
  assert.equal(M.formatPc(M.distanceFromModulus(16.2)), '17400 pc'); // M3
  close(M.modulus(136), 5.67, 0.005); close(M.modulus(10400), 15.09, 0.005); // 실제 거리
  assert.equal(M.formatPc(M.TEXTBOOK.m3.actual), '10400 pc');
  assert.equal(M.Q4.a - M.Q4.std, 5); assert.equal(M.Q4.b - M.Q4.std, 10);
  assert.equal(M.formatPc(M.distanceFromModulus(M.Q4.b - M.Q4.std)), '1000 pc');
  close(M.msMag(0.5), 3.8, 1e-9);                  // 표준 주계열: 색지수 0.5 → 약 +4 (Q4 표)
});

test('main-sequence fitting with the real data recovers the textbook distance moduli', () => {
  const m45 = M.bestModulus(M.M45, M.FIT_SELECT.m45), m3 = M.bestModulus(M.M3, M.FIT_SELECT.m3);
  assert.ok(Math.abs(m45 - M.TEXTBOOK.m45.mu) < 0.3, `M45 ${m45}`);   // 교과서 5.5
  assert.ok(Math.abs(m3 - M.TEXTBOOK.m3.mu) < 0.15, `M3 ${m3}`);      // 교과서 16.2
  close(M.bestModulus(M.PRACTICE, M.FIT_SELECT.practice), 5, 0.08);   // 연습 성단: 거리 지수 5
  // 선을 너무 위에 두면 주계열성이 대부분 선 아래(어두운 쪽)에 있다
  const hi = M.fitStats(M.M3, 14.5, M.FIT_SELECT.m3), mid = M.fitStats(M.M3, m3, M.FIT_SELECT.m3);
  assert.ok(hi.below > 0.9 && Math.abs(mid.median) < 1e-9 && Math.abs(mid.above - 0.5) < 0.02);
  // 구상 성단 M3: 표준(종족 Ⅰ) 주계열로 구한 거리는 실제보다 멀다
  assert.ok(M.distanceFromModulus(m3) > 1.5 * M.TEXTBOOK.m3.actual);
  assert.ok(Math.abs(M.distanceFromModulus(m45) / M.TEXTBOOK.m45.actual - 1) < 0.15);
});

test('age scale: textbook 탐구하기 1 values and the turnoff moves to the lower right', () => {
  close(M.ageAtMv(0), 1.6e8, 1); close(M.ageAtMv(4), 7.1e9, 1);       // 교과서 그림의 눈금 그대로
  const tM45 = M.ageForTurnoffColour(M.TEXTBOOK.m45.turnoff);
  assert.equal(M.formatAge(tM45), '1억 3천만 년');                     // 교과서: M45 1억 3천만 년
  close(M.turnoff(tM45).bv, -0.12, 1e-6);
  const tM67 = M.ageForTurnoffColour(M.TEXTBOOK.m67.turnoff);
  assert.ok(tM67 > 3e9 && tM67 < 5e9, `M67 ${tM67}`);                  // 실제 나이 30억~50억 년 안
  assert.ok(tM67 < M.TEXTBOOK.m67.ageRead);                            // 교과서 그림에서 읽은 71억 년은 크게 나온 값
  // 늙을수록 전향점의 색지수는 커지고(표면 온도 ↓) 등급도 커진다(광도 ↓)
  let prev = M.turnoff(1e7);
  for (const t of [3e7, 1e8, 1e9, 5e9, 1.2e10]) {
    const now = M.turnoff(t);
    assert.ok(now.bv > prev.bv && now.mv > prev.mv);
    prev = now;
  }
  close(M.mvAtAge(M.ageAtMv(2.5)), 2.5, 1e-9);
  assert.equal(M.formatAge(7.1e9), '71억 년');
  assert.equal(M.formatAge(2e6), '200만 년');
  assert.equal(M.formatAge(1.2e10), '120억 년');
});

test('model cluster: no turnoff at first, then fewer main-sequence stars and more giants with age', () => {
  const S = M.makeCluster();
  assert.deepEqual(M.makeCluster(), S);                                 // 같은 seed → 같은 성단
  const first = M.census(S, M.SNAPSHOTS[0].age);
  assert.equal(M.hasTurnoff(M.SNAPSHOTS[0].age), false);               // 형성 초기: 전향점이 없다
  assert.equal(first.left, 0); assert.ok(first.pre > 0);               // 아직 수축 중인 별
  assert.ok(M.SNAPSHOTS.slice(1).every(s => M.hasTurnoff(s.age)));
  const fr = M.SNAPSHOTS.slice(1).map(s => M.census(S, s.age).msFraction);
  assert.ok(fr[0] > fr[1] && fr[1] > fr[2]);                            // 젊을수록 주계열성 비율이 크다
  assert.ok(M.SNAPSHOTS.slice(1).every(s => M.census(S, s.age).giant > 3));
  // 질량이 작은 원시별일수록 주계열에 늦게 도착한다
  assert.ok(M.preMSTime(8) > M.preMSTime(2) && M.preMSTime(2) > M.preMSTime(-2));
  assert.ok(M.preMSTime(M.MODEL_MV[1]) < 2.5e7);
  // 무거운 별부터 주계열을 떠난다
  const t = 1e9, left = S.filter(s => M.starAt(s, t).phase !== 'ms'), stay = S.filter(s => M.starAt(s, t).phase === 'ms');
  assert.ok(Math.max(...left.map(s => s.mv0)) < Math.min(...stay.map(s => s.mv0)));
  // 거성은 주계열보다 오른쪽 위(붉고 밝은 쪽)에 있다
  const giants = S.map(s => M.starAt(s, 5e9)).filter(p => p.phase === 'giant');
  assert.ok(giants.length > 0 && giants.every(p => p.bv > M.turnoff(5e9).bv - 0.05 && p.mv < M.msMag(p.bv)));
});

test('Q3: turnoff colour → age, temperature and main-sequence fraction', () => {
  const S = M.makeCluster();
  const [A, B, C] = M.Q3.clusters.map(c => ({...c, age: M.ageForTurnoffColour(c.bv)}));
  assert.ok(C.age > B.age && B.age > A.age);                            // ㄱ ○ 가장 늙은 성단은 C
  assert.ok(M.tempWord(A.bv) === '10000 K보다 뜨겁다' && A.bv < B.bv); // ㄴ × A가 더 뜨겁다
  assert.ok(M.census(S, A.age).msFraction > M.census(S, C.age).msFraction); // ㄷ ○
  assert.deepEqual(M.Q3.items.map(i => i[1]), [true, false, true]);
});

test('Q1·Q2·Q4 answers match the lesson worksheet', () => {
  const q1 = M.q1Lesson();
  assert.deepEqual(q1.items.map(i => i[0]), ['(가)는 구상 성단이다.', '(나)와 같은 성단은 우리은하의 원반에 주로 분포한다.', '(가)를 이루는 별들은 모두 거성이다.']);
  assert.deepEqual(q1.items.map(i => i[1]), [true, true, false]);       // 정답 ㄱ, ㄴ
  for (let seed = 1; seed < 40; seed++) {
    const q = M.q1Random(seed);
    assert.equal(q.items.length, 3);
    assert.notEqual(q.g.glob, q.g.open);
    assert.ok(q.items[0][0].includes('구상 성단이다'));
    assert.equal(new Set(q.items.map(i => i[0])).size, 3);
  }
  // Q2: ㉠ 15등급, ㉡ 20등급 → 같은 성단에서 5등급 차 = 100배, ㉢ B = 10.0
  const {a, b, c} = M.Q2.marks;
  close(M.lumRatio(b.V - a.V), 100);
  close(M.bFromV(c.V, c.bv), 10.0);
  assert.deepEqual(M.Q2.items.map(i => i[1]), [true, true, false]);    // 정답 ㄱ, ㄴ
  assert.deepEqual(M.Q4.items.map(i => i[1]), [true, true, false]);    // 정답 ㄱ, ㄴ
});

test('colours and integrated light: the brightest stars set the cluster colour', () => {
  const blue = M.skyRGB(-0.3), red = M.skyRGB(1.8);
  assert.ok(blue[2] > blue[0] && red[0] > red[2]);
  // 플레이아데스: 별 수로는 (+) 색지수 별이 훨씬 많지만 전체 빛은 푸르다
  const plus = M.M45.filter(s => s.bv > 0).length;
  assert.ok(plus > 0.9 * M.M45.length);
  assert.ok(M.integratedColour(M.M45) < 0);
  // 가장 밝은 푸른 별(약 3등급)과 13등급보다 어두운 붉은 별: 10등급 차 = 1만 배
  const reds = M.M45.filter(s => s.bv > 1.2);
  assert.ok(Math.min(...reds.map(s => s.V)) > 12.5);
  // 구상 성단 M3: 가장 밝은 별이 붉은 거성이라 전체 빛이 붉다
  assert.ok(M.integratedColour(M.M3) > 0.5);
  const top = M.M3.slice().sort((p, q) => p.V - q.V).slice(0, 20);
  assert.ok(top.filter(s => s.bv > 0.8).length >= 15);
});
