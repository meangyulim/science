const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../sims/dust/dust-model.js');
const D = require('../sims/dust/dust-data.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('distance modulus and magnitudes (3차시 복습)', () => {
  close(M.modulus(10), 0);
  close(M.distanceFromModulus(10), 1000);
  close(M.distanceFromModulus(5), 100);
  close(M.brightnessRatio(5), 0.01);                 // 5등급 = 100분의 1
  close(M.brightnessRatio(30), 1e-12, 1e-20);        // 수업 사이드바: 은하 중심 방향 30등급 = 1조분의 1
  close(M.overestimate(5), 10);                       // 소광 5등급 → 거리 10배로 착각
  close(M.extinctionForRatio(10), 5);
});

test('lesson Q2: extinction-corrected distance', () => {
  const {m, M: Mabs, A} = M.EXAMPLES.q2;
  const d = M.distances(m, Mabs, A);
  close(d.muObs, 10);
  close(d.rNaive, 1000, 1e-6);    // (1) 소광 무시 1000 pc
  close(d.rTrue, 100, 1e-6);      // (2) 소광 5등급 → 100 pc
  close(d.factor, 10);            // (3) 10배
  close(d.rNaive / d.rTrue, d.factor);
  close(d.m0, 7);                 // m₀ = m − A
});

test('lesson Q3: colour excess → A_V → distance', () => {
  const q = M.EXAMPLES.q3;
  const E = M.colorExcess(q.B - q.V, q.bv0);
  close(E, 0.5, 1e-9);
  const Av = M.avFromE(E);
  close(Av, 1.5, 1e-9);
  const d = M.distances(q.V, q.M, Av);
  close(d.mu0, 10, 1e-9);                     // 12.1 − 1.5 − 0.6 = 10
  close(d.rTrue, 1000, 1e-6);
  assert.ok(Math.abs(d.rNaive - 1995.26) < 0.1);  // 소광을 무시하면 약 2000 pc
});

test('lesson Q4: disk star vs off-disk star at the same distance', () => {
  const {a, b} = M.EXAMPLES.q4;
  const Ea = M.colorExcess(a.bvObs, a.bv0), Eb = M.colorExcess(b.bvObs, b.bv0);
  close(Ea, 0.2, 1e-9); close(Eb, 1.0, 1e-9);
  close(Eb / Ea, 5, 1e-9);                          // ㄱ. 5배
  const db = M.distances(b.V, b.M, M.avFromE(Eb));
  close(db.mu0, 10, 1e-9); close(db.rTrue, 1000, 1e-6);
  const mA = a.M + M.modulus(db.rTrue) + M.avFromE(Ea);
  close(mA, 11.6, 1e-9);                            // ㄴ. ㉠ = 11.6
  const r = M.redden({V0: b.V - M.avFromE(Eb), bv0: b.bv0}, M.avFromE(Eb));
  close(r.AB, 4.0, 1e-9);                           // ㄷ. B 등급 변화는 3.0이 아니라 4.0
  close(r.B - r.V, b.bvObs, 1e-9);
});

test('reddening: B grows more than V, colour index grows by E (교과서 106쪽)', () => {
  const s = {V0: 10, bv0: 0.65};
  for (const Av of [0, 0.3, 1.5, 3]) {
    const r = M.redden(s, Av);
    close(r.V - r.V0, Av, 1e-12);
    close(r.B - r.B0, r.AB, 1e-12);
    close(r.AB, Av + r.E, 1e-12);
    close(r.bv - r.bv0, r.E, 1e-12);
    close(M.colorExcess(r.bv, r.bv0), r.E, 1e-12);
    close(M.avFromE(r.E), Av, 1e-12);             // A_V = 3E
    if (Av > 0) assert.ok(r.AB > r.Av);
  }
  close(M.AV_PER_E, 3);
});

test('extinction curve: shorter wavelength, more extinction (그림 13)', () => {
  close(M.ccm(0.55), 1, 0.01);
  const B = M.bandRatio('B'), V = M.bandRatio('V'), K = M.bandRatio('K'), J = M.bandRatio('J');
  assert.ok(B > V && V > J && J > K);
  assert.ok(K > 0.08 && K < 0.15);                  // 근적외선 K는 V의 약 10분의 1
  // CCM(R_V = 3.1)에서 A_V / E(B−V)는 약 3 (교과서 "약 3배")
  const ratio = 1 / (B / V - 1);
  assert.ok(ratio > 2.9 && ratio < 3.3, `A_V/E ${ratio}`);
  // 0.3~2.5 μm에서는 파장이 길수록 계속 줄어든다
  let prev = Infinity;
  for (let l = 0.3; l <= 2.5; l += 0.01) { const v = M.ccm(l); assert.ok(v < prev); prev = v; }
  // 0.2175 μm 근처의 혹(그림 13에도 있는 모양)
  assert.ok(M.ccm(0.2175) > M.ccm(0.26) && M.ccm(0.2175) > M.ccm(0.19));
  assert.ok(M.ccm(0.1) > 4.5);
  // 같은 티끌이면 파란빛이 붉은빛보다 적게 통과한다
  assert.ok(M.transmission(0.44, 1) < M.transmission(0.65, 1));
  assert.ok(M.passProbability('blue', 2) < M.passProbability('red', 2));
  close(M.transmission(0.55, 0), 1);
  // 지구 대기(노을 비유)는 파장의 4제곱에 반비례해 파란빛이 훨씬 더 많이 산란된다
  close(M.airExtinction(0.44, 1) / M.airExtinction(0.55, 1), (0.55 / 0.44) ** 4, 1e-9);
});

test('nebula builder: dark, reflection and emission nebulae (교과서 103쪽)', () => {
  // 말머리 성운처럼: 빛나는 방출 성운 앞의 차가운 티끌 구름 → 암흑 성운
  const horse = M.nebulaScene({star: {x: 75, z: 75, hot: true}, gas: {x: 55, z: 78}, dust: {x: 52, z: 40}, background: true});
  assert.equal(horse.gas, 'emission');
  assert.equal(horse.dust, 'dark');
  assert.ok(horse.behind.includes('gas'));
  assert.equal(horse.gasState, 'HII');
  // 가까운 별빛을 티끌이 산란 → 반사 성운
  const refl = M.nebulaScene({star: {x: 45, z: 55, hot: false}, gas: {x: 15, z: 80}, dust: {x: 58, z: 60}, background: true});
  assert.equal(refl.dust, 'reflection');
  assert.equal(refl.gas, 'invisible');
  assert.equal(refl.gasState, 'HI');
  // O·B형 별의 자외선 → 전리수소 → 방출 성운. 자외선이 약한 별이면 방출 성운이 사라진다.
  const emis = {star: {x: 50, z: 60, hot: true}, gas: {x: 50, z: 62}, dust: {x: 88, z: 22}, background: true};
  assert.equal(M.nebulaScene(emis).gas, 'emission');
  assert.equal(M.nebulaScene({...emis, star: {...emis.star, hot: false}}).gas, 'invisible');
  // 별에서 멀면 차가운 중성수소로 남는다
  assert.equal(M.nebulaScene({...emis, gas: {x: 10, z: 90}}).gasState, 'HI');
  // 뒤에서 오는 빛이 없으면 암흑 성운도 보이지 않는다
  const lonely = M.nebulaScene({star: {x: 90, z: 10, hot: true}, gas: {x: 10, z: 10}, dust: {x: 40, z: 60}, background: false});
  assert.equal(lonely.dust, 'invisible');
  assert.equal(M.nebulaScene({star: {x: 90, z: 10, hot: true}, gas: {x: 10, z: 10}, dust: {x: 40, z: 60}, background: true}).dust, 'dark');
  // 티끌 구름 뒤의 별은 가려진다
  assert.ok(M.nebulaScene({star: {x: 50, z: 90, hot: true}, gas: {x: 10, z: 10}, dust: {x: 50, z: 30}, background: true}).starHidden);
  // 화면의 「만들기」 단추 세 개가 저마다 그 성운을 만든다
  const P = M.NEBULA_PRESETS, bg = s => ({...s, background: true});
  const pd = M.nebulaScene(bg(P.dark)), pr = M.nebulaScene(bg(P.refl)), pe = M.nebulaScene(bg(P.emis));
  assert.equal(pd.dust, 'dark'); assert.ok(pd.behind.includes('gas')); assert.equal(pd.gas, 'emission'); assert.ok(!pd.starHidden);
  assert.equal(pr.dust, 'reflection'); assert.equal(pr.gas, 'invisible'); assert.equal(P.refl.star.hot, false);
  assert.equal(pe.gas, 'emission'); assert.notEqual(pe.dust, 'reflection');
  assert.equal(M.ISM_STATES.molecular.T, 10);
  assert.equal(M.ISM_STATES.HI.T, 100);
  assert.equal(M.ISM_STATES.HII.T, 10000);
  assert.equal(M.ISM_MASS.hydrogen + M.ISM_MASS.helium, 98);
});

test('Barnard 68 model: fewer stars in the middle, infrared sees through (해 보기)', () => {
  const f = M.makeField();
  assert.deepEqual(f.slice(0, 5), M.makeField().slice(0, 5));      // 같은 씨앗 → 같은 별
  assert.ok(f.every(s => s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= M.FIELD.h));
  close(M.cloudShape(M.FIELD.cx, M.FIELD.cy), 1, 1e-3);
  assert.ok(M.cloudShape(M.PROBES.outer.x, M.PROBES.outer.y) < 0.01);
  const none = M.countIn(f, 0, 'vis', M.PROBES.inner).visible;
  assert.ok(none > 20);
  let last = Infinity;
  for (const A0 of [0, 2, 5, 10, 20]) {
    const vis = M.countIn(f, A0, 'vis', M.PROBES.inner).visible, ir = M.countIn(f, A0, 'ir', M.PROBES.inner).visible;
    assert.ok(vis <= last); last = vis;
    assert.ok(ir >= vis);
    if (A0 >= 5) assert.ok(ir > vis);
    // 바깥 원은 티끌이 거의 없어 그대로다
    assert.equal(M.countIn(f, A0, 'ir', M.PROBES.outer).visible, M.countIn(f, 0, 'ir', M.PROBES.outer).visible);
  }
  assert.equal(M.countIn(f, 15, 'vis', M.PROBES.inner).visible, 0);  // 가시광선: 가운데는 텅 빈 것처럼
  // 가운데에서 바깥으로 갈수록 별이 많아진다
  const prof = M.radialProfile(f, 15, 'vis'), profIR = M.radialProfile(f, 15, 'ir');
  assert.ok(prof[0].density < prof[prof.length - 1].density);
  assert.ok(profIR[1].n >= prof[1].n && profIR[2].n > prof[2].n);
  assert.ok(M.onlyInIR(f, 15) > 50);
  assert.equal(M.onlyInIR(f, 0), 0);
  // 별 하나: 관측 등급 = 티끌이 없을 때의 등급 + 소광 등급, 적외선 소광은 가시광선의 약 0.11배
  const s = f.find(st => st.shape > 0.9);
  const v = M.seeStar(s, 15, 'vis'), k = M.seeStar(s, 15, 'ir');
  close(v.m, s.m0 + v.A, 1e-12);
  close(k.A / v.A, M.bandRatio('K'), 1e-12);
  close(v.bv - s.bv0, M.eFromAv(v.Av), 1e-12);
});

test('cluster C-M diagram shift: right by E, down by 3E (교과서 124쪽 10번)', () => {
  const pts = [[0, 5], [0.6, 9]];
  assert.deepEqual(M.shiftCMD(pts, 0.5), [[0.5, 6.5], [1.1, 10.5]]);
  assert.deepEqual(M.shiftCMD(pts, 1.0), [[1, 8], [1.6, 12]]);
  // B형이든 M형이든 같은 성단의 별은 같은 양만큼 옮겨진다
  const moved = M.shiftCMD(D.m45, 0.5);
  moved.forEach((p, i) => { close(p[0] - D.m45[i][0], 0.5, 1e-9); close(p[1] - D.m45[i][1], 1.5, 1e-9); });
  assert.equal(D.m45.length, 406);
  assert.ok(D.m45.every(([bv, V]) => bv > -0.2 && bv < 2.3 && V > 2.8 && V <= 18));
  // 색초과를 보정해도 소광 등급 3E를 빼지 않으면 거리 지수가 3E 커진다 → 거리 10^(3E/5)배
  close(M.overestimate(M.avFromE(0.5)), 10 ** 0.3, 1e-12);
});

test('M3 check-back: dust cannot explain the 17400 pc vs 10400 pc gap', () => {
  const m3 = M.EXAMPLES.m3;
  const A = M.extinctionForRatio(m3.fitted / m3.actual);
  assert.ok(Math.abs(A - 1.118) < 0.01, `A ${A}`);           // 필요한 소광 등급 약 1.1
  assert.ok(Math.abs(M.eFromAv(A) - 0.373) < 0.01);         // 필요한 색초과 약 0.37
  const f = M.overestimate(M.avFromE(m3.E));                 // 실제 색초과 0.01
  assert.ok(f > 1.01 && f < 1.02, `factor ${f}`);            // 거리 차이 약 1.4 %
});

test('display colours redden with colour index', () => {
  const blue = M.bvColor(-0.2), white = M.bvColor(0.4), red = M.bvColor(2.0);
  assert.ok(blue[2] > blue[0]);
  assert.ok(red[0] > red[2]);
  assert.ok(M.bvColor(1.5)[2] < M.bvColor(0.5)[2]);
  assert.deepEqual(M.bvColor(-1), M.bvColor(-0.3));
  assert.match(M.rgb(white), /^rgb\(\d+,\d+,\d+\)$/);
});
