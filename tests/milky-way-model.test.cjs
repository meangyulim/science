const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../sims/milky-way/milky-way-model.js');
const D=require('../sims/milky-way/milky-way-data.js');
const V=require('../sims/variables/variables-model.js');
const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test('textbook p.99 table: 30 values transcribed exactly, 52.6-day typo kept and flagged',()=>{
  assert.deepEqual(D.omega.table,[
    [0.8,11.34],[2.8,11.44],[4.5,11.38],[5.6,11.21],[6.3,11.03],[7.2,10.83],[8.1,10.61],[9.5,10.43],[12.0,10.47],[14.3,10.52],
    [16.6,10.59],[19.7,10.73],[22.1,10.83],[24.8,10.96],[26.8,11.10],[29.1,11.23],[30.5,11.38],[32.5,11.46],[34.4,11.33],[35.3,11.13],
    [36.0,10.95],[36.7,10.77],[37.6,10.61],[38.4,10.44],[40.5,10.46],[45.1,10.55],[48.8,10.73],[52.6,11.88],[55.6,11.06],[58.2,11.23]]);
  assert.deepEqual(D.omega.typo,{t:52.6,printed:11.88,corrected:10.88});
  const printed=M.omegaPoints(D.omega,false), fixed=M.omegaPoints(D.omega,true);
  assert.equal(printed.find(p=>p.typo).m,11.88);
  assert.equal(fixed.find(p=>p.typo).m,10.88);
  assert.equal(fixed.filter(p=>p.typo).length,1);
  // 인쇄된 11.88은 이 변광성의 가장 어두운 값(11.46)보다도 어둡다 → 튀는 값
  assert.ok(11.88>Math.max(...fixed.map(p=>p.m)));
  // 가장 밝은 값과 가장 어두운 값(교사용 교과서: 10.43, 11.46)
  close(Math.min(...fixed.map(p=>p.m)),10.43); close(Math.max(...fixed.map(p=>p.m)),11.46);
});

test('teacher-edition answer: P 29 d, m 10.95, M −2.35, about 4600 pc',()=>{
  const G=M.OMEGA_GUIDE;
  assert.equal(M.meanMag(10.43,11.46),10.95);               // (10.43 + 11.46) ÷ 2 = 10.945 → 10.95
  assert.equal(M.meanMag(G.mBright,G.mFaint),G.mMean);
  close(Math.log10(29),1.46,0.005);                         // log 29 = 1.46
  close(G.tB-G.tA,29);
  const s=M.omegaSolve(G.P,G.mMean,'pop2',G.M);
  close(s.mu,13.3,1e-9);
  close(s.r,10**3.66,1e-6);                                 // 10^((10.95 + 2.35 + 5) / 5)
  assert.equal(Number(s.r.toPrecision(2)),4600);            // ≒ 4600 pc
  assert.ok(M.checkOmega({P:G.P,m:G.mMean,pop:'pop2',M:G.M,r:s.r}).ok);
});

test('period-luminosity constants mirror variables-model.js (class graph)',()=>{
  assert.deepEqual(M.PL,V.PL);
  for(const P of [1,3,10,29,30,100]) for(const k of ['pop1','pop2','rr']) close(M.absMag(k,P),V.absMag(k,P));
  close(M.absMag('pop1',10),-4); close(M.absMag('pop2',10),-2); close(M.absMag('rr',0.5),0.5);
});

test('omega Cen with the class graph: about 6.5 kpc, accepted; wrong choices rejected',()=>{
  const fit=M.fitLightCurve(M.omegaPoints(D.omega,true));
  const s=M.omegaSolve(fit.P,10.95,'pop2');
  close(s.M,-3.12,0.01);
  assert.ok(s.r>6300&&s.r<6700,`r ${s.r}`);
  const base={P:fit.P,m:10.95,pop:'pop2',M:s.M,r:s.r};
  assert.ok(M.checkOmega(base).ok);
  // 종족 Ⅰ 관계를 쓰면 2등급 밝게 잡혀 거리가 10^0.4 ≈ 2.5배 멀어진다
  const p1=M.omegaSolve(fit.P,10.95,'pop1');
  close(p1.r/s.r,10**0.4,1e-9);
  const w1=M.checkOmega({...base,pop:'pop1',M:p1.M,r:p1.r});
  assert.ok(!w1.ok&&!w1.popOk&&!w1.rOk);
  // RR형 관계(+0.5)를 쓰면 너무 가깝다
  const rr=M.omegaSolve(fit.P,10.95,'rr');
  assert.ok(!M.checkOmega({...base,pop:'rr',M:rr.M,r:rr.r}).ok);
  // 극대와 극소 사이를 주기로 읽으면 틀린다
  assert.ok(!M.checkOmega({...base,P:6.3}).pOk);
  // 인쇄 오타(11.88)를 가장 어두운 값으로 쓰면 평균 등급이 틀린다
  const wrongMean=M.meanMag(10.43,11.88);
  assert.ok(!M.checkOmega({...base,m:wrongMean}).mOk);
});

test('smooth light curve: fitted period ≈ 29 d, minima 29 d apart',()=>{
  const pts=M.omegaPoints(D.omega,true);
  const fit=M.fitLightCurve(pts);
  assert.ok(fit.P>29&&fit.P<29.7,`P ${fit.P}`);
  assert.ok(fit.rms<0.03,`rms ${fit.rms}`);
  const ex=M.curveExtrema(fit.f,0,60);
  assert.equal(ex.faint.length,2); assert.equal(ex.bright.length,2);
  close(ex.faint[1].t-ex.faint[0].t,fit.P,0.05);
  assert.ok(Math.abs(ex.faint[0].t-3.2)<0.6&&Math.abs(ex.faint[1].t-32.5)<0.6);
  assert.ok(Math.abs(ex.faint[0].m-11.46)<0.05&&Math.abs(ex.bright[0].m-10.43)<0.05);
  // 오타를 그대로 두면 곡선이 나빠진다(맞추기 오차가 커진다)
  assert.ok(M.fitLightCurve(M.omegaPoints(D.omega,false)).rms>2*fit.rms);
  close(M.periodBetween(32.5,3.5),29);
});

test('Harris (2010) globular clusters: 157, positions consistent, omega Cen 5.2 kpc',()=>{
  const cs=M.clustersFrom(D);
  assert.equal(cs.length,157);
  assert.equal(D.clusterSource,'Harris 1996 (2010 edition)');
  for(const c of cs){
    const [x,y,z]=M.xyzFromLB(c.l,c.b,c.r);
    assert.ok(Math.abs(x-c.x)<0.11&&Math.abs(y-c.y)<0.11&&Math.abs(z-c.z)<0.11,c.id);
  }
  const om=cs.find(c=>c.id==='NGC 5139');
  assert.equal(om.alt,'omega Cen'); assert.equal(om.r,5.2);
  assert.equal(cs.find(c=>c.id==='NGC 5272').r,10.2);   // M3
  assert.equal(M.OBJECTS.find(o=>o.id==='omega').r,om.r*1000);
  assert.equal(M.OBJECTS.find(o=>o.id==='m3').r,10200);
});

test('finding the centre (p.100): dense centre ≈ 7.4 kpc, textbook 8 kpc, sphere of 54 kpc holds most',()=>{
  const cs=M.clustersFrom(D);
  // 단순 평균은 멀리 떨어진 몇 개 때문에 태양 쪽으로 끌려온다
  const mean=M.meanPos(cs);
  close(Math.hypot(...mean),6.28,0.02);
  const dc=M.denseCentre(cs,20);
  assert.equal(dc.n,135);
  close(dc.centre[0],7.40,0.02); close(dc.centre[1],-0.32,0.02); close(dc.centre[2],-0.10,0.02);
  assert.ok(Math.abs(dc.dist-M.R0.textbook)<1);            // 교과서 답 약 8 kpc
  assert.ok(Math.abs(dc.dist-M.R0.modern)<1);              // 최신 측정 약 8.2 kpc
  // 교과서 답: 중심 (8, 0, 0)에서 반지름 54 kpc 원에 구상 성단 대부분(96%)이 들어간다
  assert.equal(M.countWithin(cs,[8,0,0],54),151);
  assert.ok(M.countWithin(cs,[8,0,0],20)/157<0.9);
  // 하늘에서 은하 중심 쪽 반구에 90%가 몰려 있다(섀플리) — 태양이 중심이라면 반반쯤
  assert.deepEqual(M.hemisphere(cs),{toward:141,away:16});
  const h=M.hemisphere(M.shiftedBy(cs,dc.centre));
  assert.ok(h.toward/157>0.4&&h.toward/157<0.6);
  // 은하 중심 너머(먼 쪽)의 성단은 덜 발견된다(원반의 티끌)
  assert.deepEqual(M.sideCounts(cs,8.2,8),{near:65,far:36});
  // 구상 성단의 1/3만 은하면 가까이(|Z| < 1 kpc)에 있다
  assert.equal(cs.filter(c=>Math.abs(c.z)<1).length,53);
});

test('coordinates: l, b round trip and the all-sky (Hammer) map',()=>{
  for(const [l,b,d] of [[0,0,8],[90,10,3],[200,-45,20],[309.1,14.97,5.2]]){
    const [x,y,z]=M.xyzFromLB(l,b,d), r=M.lbFromXYZ(x,y,z);
    close(r.l,l,1e-9); close(r.b,b,1e-9); close(r.d,d,1e-9);
  }
  const c=M.hammer(0,0); close(c.x,0); close(c.y,0);
  assert.ok(M.hammer(90,0).x<0&&M.hammer(270,0).x>0);      // 은경이 커지면 왼쪽
  assert.ok(M.hammer(0,60).y>0);
  close(Math.abs(M.hammer(180,0).x),2*Math.SQRT2,1e-9);
});

test('3D view: side and top presets match the textbook XZ and XY plots',()=>{
  const side=M.cameraBasis(-Math.PI/2,0), top=M.cameraBasis(-Math.PI/2,Math.PI/2);
  let p=M.project([1,0,0],side); close(p.x,1); close(p.y,0);
  p=M.project([0,0,1],side); close(p.x,0); close(p.y,1);
  p=M.project([1,0,0],top); close(p.x,1); close(p.y,0);
  p=M.project([0,1,0],top); close(p.x,0); close(p.y,1);
  assert.ok(M.project([0,0,1],top).depth>0);               // 위에서 보면 +Z 가 보는 사람 쪽
  p=M.project([9,1,2],side,[8,0,0]); close(p.x,1); close(p.y,2);
});

test('galaxy model: Sun in the Orion-Cygnus arm, between Sagittarius and Perseus arms',()=>{
  const arm=id=>M.ARMS.find(a=>a.id===id);
  const at=id=>M.armCrossings(arm(id))[0].X;               // 태양–은하 중심 선에서 팔의 X(kpc)
  assert.ok(Math.abs(at('ori'))<0.3);
  assert.ok(at('sgr')>0&&at('sgr')<3);                       // 은하 중심 쪽
  assert.ok(at('per')<0&&at('per')>-3);                      // 바깥쪽
  assert.ok(at('sct')>at('sgr'));
  const a=M.generateGalaxy(7,8.2,D.satellites), b=M.generateGalaxy(7,8.2,D.satellites);
  assert.deepEqual(a.slice(0,50),b.slice(0,50));
  const disk=a.filter(p=>p[3]===M.KIND.ARM||p[3]===M.KIND.DISK||p[3]===M.KIND.OPEN);
  assert.ok(disk.every(p=>Math.hypot(p[0]-8.2,p[1])<=16.5));   // 원반 지름 약 30 kpc
  const thin=disk.filter(p=>Math.abs(p[2])<0.5).length/disk.length;
  assert.ok(thin>0.95);                                        // 원반은 얇다
  // 막대의 가까운 끝은 은경 (+) 쪽(Y > 0)
  const end=[8.2+M.BAR.half*Math.cos(M.BAR.angle*M.D2R),M.BAR.half*Math.sin(M.BAR.angle*M.D2R)];
  assert.ok(end[0]<8.2&&end[1]>0);
  // 대마젤란은하는 은하면 아래 약 50 kpc
  const lmc=M.xyzFromLB(280.47,-32.89,49.6);
  assert.ok(lmc[2]<-20&&Math.hypot(...lmc)>49);
});

test('distance ladder (figure 7): ranges, objects and what limits each method',()=>{
  const ids=M.METHODS.map(m=>m.id);
  assert.deepEqual(ids,['radar','parallax','msfit','cepheid','rr','sn1a','hubble']);
  for(const o of M.OBJECTS) for(const u of o.used) assert.ok(M.reachable(o.r).includes(u),`${o.id} ${u}`);
  assert.deepEqual(M.reachable(1.3),['parallax']);
  assert.deepEqual(M.reachable(M.OBJECTS[0].r),['radar']);
  assert.ok(!M.reachable(770e3).includes('parallax')&&M.reachable(770e3).includes('cepheid'));
  assert.ok(M.reachable(310e6).includes('hubble')&&!M.reachable(310e6).includes('cepheid'));
  // 연주 시차: 100 pc → 0.01″ (지상 망원경의 한계), 1.30 pc → 0.77″ (프록시마 센타우리)
  close(M.parallaxArcsec(100),0.01); close(M.parallaxArcsec(1.3),0.769,0.001);
  assert.equal(M.METHODS.find(m=>m.id==='parallax').groundMax,100);
  // 표준 광원이 어두워지는 정도: 10 pc 에서 m = M, 10배 멀어질 때마다 5등급
  close(M.apparentMag(-4,10),-4); close(M.apparentMag(-4,100)-M.apparentMag(-4,10),5);
  // 세페이드(M ≈ −6)도 약 4000만 pc 에서는 27등급 — 큰 망원경의 한계 근처
  assert.ok(M.apparentMag(-6,4e7)>26&&M.apparentMag(-6,4e7)<28);
  // 방법마다 범위가 겹쳐 사다리처럼 이어진다(레이더 다음은 연주 시차)
  for(let i=2;i<M.METHODS.length;i++) assert.ok(M.METHODS[i].min<M.METHODS[i-1].max||M.METHODS[i].min<M.METHODS[i-2].max);
});

test('units: pc and 광년 wording used in class',()=>{
  close(M.PC_TO_LY,3.26,0.01);
  assert.equal(M.lyText(30000),'약 9.8만 광년');            // 원반 지름 30 kpc ≈ 10만 광년
  assert.equal(M.lyText(8500),'약 2.8만 광년');             // 지도서 8.5 kpc
  assert.equal(M.lyText(8200),'약 2.7만 광년');
  assert.equal(M.lyText(1.30),'약 4.2광년');                // 프록시마 센타우리
  assert.equal(M.lyText(136),'약 440광년');                 // 플레이아데스 (교과서 440광년)
  assert.equal(M.lyText(770e3),'약 250만 광년');
  assert.equal(M.lyText(310e6),'약 10억 광년');
  assert.equal(M.pcText(5200),'5.2 kpc'); assert.equal(M.pcText(16.5e6),'16.5 Mpc'); assert.equal(M.pcText(136),'136 pc');
  assert.equal(M.num(-2.35,2),'−2.35'); assert.equal(M.num(-0.001,2),'0.00');
});
