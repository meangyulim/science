const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../sims/star-distance/star-distance-model.js');
const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
const near=(a,b,rel=0.005)=>assert.ok(Math.abs(a/b-1)<rel,`${a} ≉ ${b}`);

test('parallax: r = 1/p, textbook and lesson examples',()=>{
  close(M.distanceFromParallax(1),1);                       // 연주 시차 1″ = 1 pc
  close(M.distanceFromParallax(0.01),100);                  // 0.01″ = 100 pc (지상 한계)
  near(M.distanceFromParallax(0.77),1.30);                  // 프록시마 센타우리 1.30 pc
  near(M.pcToLy(M.distanceFromParallax(0.77)),4.2,0.02);    // 약 4.2광년
  close(M.distanceFromParallax(M.Q1.A),10);                 // Q1 별 A: 10 pc
  close(M.distanceFromParallax(M.Q1.B),2.5);                // Q1 별 B: 2.5 pc
  close(M.parallaxFromShift(0.10),0.05);                    // 시차의 1/2
  close(M.review5Parallax(),0.05);                          // 단원 마무리 5번: 0.07″ + 0.03″ → p = 0.05″
  close(M.distanceFromParallax(M.review5Parallax()),20);    // → 20 pc
  near(M.pcToLy(M.distanceFromParallax(0.314)),10.4,0.01);  // 베셀(1838) 백조자리 61: 약 10광년
  near(M.coinDistanceKm(1),2.06,0.01);                      // 1″ ≈ 2 km 떨어진 곳에서 본 1 cm
  near(M.coinDistanceKm(0.314),6.6,0.01);                   // 0.314″ ≈ 6.6 km
  close(M.AU_PER_PC*M.KM_PER_PC/M.KM_PER_PC,206265);
  near(M.KM_PER_PC/M.KM_PER_LY,M.LY_PER_PC,0.002);          // 1 pc ≈ 3.26 광년
  assert.ok(M.measurable(0.0101,'ground')&&!M.measurable(0.009,'ground'));
  assert.ok(M.measurable(0.001,'gaia')&&!M.measurable(0.0001,'gaia'));
  close(1/M.LIMITS.gaia.p,5000);                            // Gaia(밝은 별) 수천 pc
});

test('annual motion: S1 at E1, S2 six months later, half the shift is p',()=>{
  const p=0.37;
  close(M.apparentOffset(p,0),p);       // E₁ → S₁ (오른쪽)
  close(M.apparentOffset(p,6),-p);      // E₂ → S₂ (왼쪽)
  close(M.apparentOffset(p,3),0,1e-12);
  close(M.apparentOffset(p,9),0,1e-12);
  close(M.apparentOffset(p,12),p);
  close((M.apparentOffset(p,0)-M.apparentOffset(p,6))/2,p); // 시차의 1/2 = 연주 시차
  const e1=M.earthPosition(0), e2=M.earthPosition(6), e9=M.earthPosition(9);
  close(e1.x,-1); close(e1.y,0,1e-12); close(e2.x,1); close(e9.y,1);
  // 과장한 그림의 시선: E₁에서 별을 지나면 배경의 오른쪽(S₁), E₂에서는 왼쪽(S₂)
  const D=2, Y=5;
  assert.ok(M.sightLineX(e1,D,Y)>0&&M.sightLineX(e2,D,Y)<0);
  close(M.sightLineX(e1,D,Y),-M.sightLineX(e2,D,Y));
  // 별이 가까울수록 S₁과 S₂가 멀리 벌어진다
  assert.ok(M.sightLineX(e1,1.5,Y)>M.sightLineX(e1,3,Y));
});

test('magnitude and brightness: Pogson formula',()=>{
  close(M.brightnessRatio(5),100);                          // 5등급 차 = 100배
  close(M.ONE_MAG,2.5118864,1e-6);                          // 1등급 차 ≈ 2.512배
  close(M.ONE_MAG**5,100,1e-9);
  close(M.brightnessRatio(2.5),10);                         // 2.5등급 = 10배
  close(M.pogson(1,100),-5);                                // 100배 밝은 별은 5등급 작다
  close(M.pogson(100,1),5);
  assert.equal(Math.round(M.brightnessRatio(1.98-(-1.44))),23); // 시리우스(−1.44)는 북극성(1.98)보다 약 23배 밝다
  near(M.coinDistanceKm(0.01),206,0.01);                    // 0.01″ = 약 206 km 떨어진 1 cm
  close(M.magDiffFromRatio(M.brightnessRatio(3.3)),3.3);
  near(M.brightnessRatio(1.1),2.8,0.02);                    // 베텔게우스 대감광 0.5 → 1.6등급: 약 2.8배
  near(M.brightnessRatio(1.41-(-6.70)),1750,0.005);        // 시리우스와 리겔 절대 등급 차 8.11: 약 1750배
  // 활동지 어림표: 등급 차 → 밝기 비
  const rough={1:2.5,2:6.3,2.5:10,3:16,4:40,5:100,10:1e4};
  for(const [dm,r] of Object.entries(rough)) near(M.brightnessRatio(+dm),r,0.04);
  assert.equal(M.ROUGH_MAG.length,7);
});

test('brightness and distance: inverse square (figure 7)',()=>{
  close(M.inverseSquare(1,2),4);                            // 거리 2배 → 밝기 1/4
  close(M.inverseSquare(1,3),9);                            // 거리 3배 → 밝기 1/9
  close(M.inverseSquare(1,10),100);
  close(M.magDiffFromDistance(1,10),5);                     // 거리 10배 → 5등급 어두워짐
  close(M.magDiffFromDistance(10,1),-5);
  // m₂ − m₁ = −2.5 log(l₂/l₁) = −5 log(d₁/d₂)
  for(const d of [1.5,2,3,7]) close(M.pogson(1,1/M.inverseSquare(1,d)),M.magDiffFromDistance(1,d),1e-12);
  const rough={2:1.5,3:2.4,4:3,10:5,100:10};               // 활동지 어림표: 거리 비 → 등급 차
  for(const [k,dm] of Object.entries(rough)) close(M.magDiffFromDistance(1,+k),dm,0.03);
});

test('distance modulus: m − M = 5 log r − 5',()=>{
  close(M.distanceModulus(10),0);
  close(M.distanceModulus(1),-5);
  close(M.distanceModulus(100),5);
  close(M.distanceModulus(1000),10);
  close(M.distanceFromModulus(5),100);
  close(M.distanceFromModulus(M.Q2.m-M.Q2.M),100);          // Q2: m 7, M 2 → 100 pc
  close(M.apparentMag(M.Q2.M,10),M.Q2.M);                  // 10 pc로 옮기면 m = M (2등급)
  close(M.absoluteMag(M.apparentMag(-3.6,83),83),-3.6);
  close(M.moveToward10pc(1000,0),1000); close(M.moveToward10pc(1000,1),10); close(M.moveToward10pc(1000,0.5),100);
  close(M.moveToward10pc(2.5,1),10);
  // 교과서 65쪽 식 −5 log(10/r) = −5 + 5 log r 과 같다
  for(const r of [2,37,1234]) close(-5*Math.log10(10/r),M.distanceModulus(r),1e-12);
});

test('textbook p.66 activity: both methods reproduce the teacher-edition answers',()=>{
  const A=M.EXPLORE_ANSWERS;
  for(const s of M.EXPLORE){
    close(M.distanceFromParallax(s.p),A[s.id].parallax,0.05);
    close(M.distanceFromModulus(s.m-s.M),A[s.id].modulus,0.05);
  }
  close(M.logDistance(-1.44,1.41),0.43);
  close(M.logDistance(0.45,-5.14),2.118);
  close(M.logDistance(0.18,-6.70),2.376);
  // 가까운 시리우스는 두 값이 거의 같고, 100 pc가 넘는 두 별은 크게 벌어진다
  const gap=s=>Math.abs(M.distanceFromParallax(s.p)/M.distanceFromModulus(s.m-s.M)-1);
  assert.ok(gap(M.EXPLORE[0])<0.01);
  assert.ok(gap(M.EXPLORE[1])>0.2&&gap(M.EXPLORE[2])>0.2);
  // 어림표로 계산하면 2.5 · 126 · 251 pc 정도 (활동지 4쪽)
  assert.equal(M.roughPow10(0.43).value,2.5);
  near(M.roughPow10(2.118).exact,126,0.005);                // 10^2.1 ≈ 126
  near(M.roughPow10(2.376).exact,251,0.005);                // 10^2.4 ≈ 251
  close(M.roughPow10(2.118).value,130,1e-9);                // 10ˣ 어림표(10^0.1 ≈ 1.3)로는 130
  close(M.roughPow10(2.4).value,250,1e-9);                  // 10^2.4 = 100 × 10^0.4 ≈ 250
  close(M.roughPow10(0.96).value,10,1e-9);                  // 소수 부분이 1에 가까우면 다음 자리로
});

test('parallax error grows with distance (±0.001″)',()=>{
  const [sir,bet,rig]=M.EXPLORE;
  const s=M.parallaxRange(sir.p,0.001), b=M.parallaxRange(bet.p,0.001), r=M.parallaxRange(rig.p,0.001);
  near(s.near,2.6954,1e-4); near(s.far,2.7100,1e-4);
  near(b.near,143.9,0.002); near(b.far,202.0,0.002);
  near(r.near,236.4,0.002); near(r.far,448.4,0.002);
  assert.ok(M.relativeError(sir.p,0.001)<0.003);
  assert.ok(M.relativeError(rig.p,0.001)>0.3);
  assert.equal(M.parallaxRange(0.001,0.002).far,Infinity);
  // 알려진 거리(광년 → pc)
  near(M.lyToPc(860),264,0.002);
  near(M.lyToPc(500),153.4,0.002); near(M.lyToPc(720),220.9,0.002);
});

test('two stars: one formula, three cases (lesson Q4)',()=>{
  const t=M.twoStars({M:0,r:100},{M:5,r:100});            // 거리가 같다 → 겉보기 등급 차 = 절대 등급 차
  close(t.dm,t.dM); close(t.dr,0);
  const u=M.twoStars({M:2,r:10},{M:2,r:100});             // 광도가 같다 → 거리 10배면 5등급
  close(u.dm,-5); close(u.dM,0);
  const r2=M.distanceForSameApparent(100,5,-5);             // 겉보기 등급이 같다 → 광도 10⁴배면 거리 100배
  close(r2,1e4);
  const v=M.twoStars({M:5,r:100},{M:-5,r:r2});
  close(v.dm,0,1e-9); close(v.dM,-v.dr,1e-9);
  close(M.distanceForSameApparent(10,0,-5)/10,10);          // 광도 100배 → 거리 10배
  close(M.luminosityRatio(0,5),100);
  const q=M.solveQ4();
  close(q.rGa,100); close(q.MNa,5); close(q.rDa,1e4);
  assert.deepEqual(q.statements,[true,true,false]);        // 정답 ㄱ, ㄴ
  near(M.luminosityInSuns(1.41),23,0.02);                   // 시리우스 약 23배
  near(M.luminosityInSuns(-6.70),4e4,0.01);                 // 리겔 약 4만 배
  close(M.luminosityInSuns(4.8),1);
});

test('textbook review p.84 no.4: only statement ④ is wrong',()=>{
  const by=Object.fromEntries(M.REVIEW4.map(s=>[s.id,s]));
  const r=s=>M.distanceFromModulus(s.m-s.M);
  close(r(by.deneb),1000,1e-6);                             // ① 데네브 1000 pc (옳음)
  assert.ok(r(by.spica)>r(by.vega));                       // ② 스피카가 베가보다 멀다 (옳음)
  assert.ok(by.vega.m-by.vega.M<0);                        // ③ 베가의 거리 지수 < 0 (옳음)
  const brightest=M.REVIEW4.reduce((a,b)=>b.M<a.M?b:a);
  assert.equal(brightest.id,'deneb');                       // ④ 같은 거리에서 가장 밝은 별은 태양 (틀림)
  const others=M.REVIEW4.filter(s=>s.id!=='sun');
  const closest=others.reduce((a,b)=>r(b)<r(a)?b:a);
  assert.equal(closest.id,'vega');                          // ⑤ 태양 빼고 연주 시차 최대 = 베가 (옳음)
  near(r(by.sun),1/206265,0.05);                            // 태양: 약 1 AU (반올림한 등급이라 약간 다름)
});

test('Orion sky: real J2000 positions and the space between Betelgeuse and Rigel',()=>{
  const by=Object.fromEntries(M.SKY.map(s=>[s.id,s]));
  const ra0=83.75, dec0=-3;
  const b=M.skyOffset(by.betelgeuse,ra0,dec0), g=M.skyOffset(by.rigel,ra0,dec0);
  assert.ok(b.x<g.x&&b.y>g.y);                             // 베텔게우스는 왼쪽 위(동쪽·북쪽), 리겔은 오른쪽 아래
  close(M.decDeg(by.mintaka),-(17/60+57/3600),1e-9);       // −0°17′57″
  const sep=M.angularSeparation(by.betelgeuse,by.rigel);
  assert.ok(sep>18&&sep<19.5,`sep ${sep}`);                 // 하늘에서 약 19° 떨어져 보인다
  const [,bet,rig]=M.EXPLORE;
  const dPar=M.spaceSeparation(1/bet.p,1/rig.p,sep), dMod=M.spaceSeparation(M.distanceFromModulus(bet.m-bet.M),M.distanceFromModulus(rig.m-rig.M),sep);
  assert.ok(dPar>100&&dMod>100);                            // 두 별 사이는 100 pc 이상 (교사용 교과서 답)
  assert.equal(M.ORION_LINES.length,9);
});
