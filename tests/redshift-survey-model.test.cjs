const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../sims/redshift-survey/redshift-survey-model.js');
const RAW=require('../sims/redshift-survey/redshift-survey-data.js');
const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
const SDSS=M.decodeSurvey(RAW.sdss), TWODF=M.decodeSurvey(RAW.twodf);

test('적색 편이 → 후퇴 속도 → 거리: 학습지 Q2 (500 nm → 514 nm, 542 nm)',()=>{
  assert.equal(M.C,3e5); assert.equal(M.H,70);
  const a=M.measureSteps(500,514,0), b=M.measureSteps(500,542,0);
  close(a.z,0.028); assert.equal(a.v,8400); close(a.d,120); close(a.dl,14);
  close(b.z,0.084); assert.equal(b.v,25200); close(b.d,360);
  close(b.z/a.z,3); close(b.d/a.d,3);                        // 파장이 밀린 양 3배 → 거리도 3배
  close(M.redshift(514,500),0.028);
  close(M.observedWavelength(500,0.028),514);
});

test('교과서·학습지의 다른 예와 해 보기 값',()=>{
  close(M.distanceFromVelocity(10000),142.857142857,1e-6);  // 교과서 121쪽 확인 문제 3: ≒ 143 Mpc
  assert.equal(Math.round(M.distanceFromVelocity(10000)),143);
  close(M.velocityFromZ(0.14),42000); close(M.distanceFromZ(0.14),600);   // 학습지 02 예
  close(M.velocityFromZ(0.002),600);                         // 해 보기 ②: Δz 0.002 → 600 km/s
  assert.equal(Math.round(M.distanceFromVelocity(600)),9);   // → 약 9 Mpc
  close(M.zFromDistance(10),0.0023333,1e-6);                // 은하단 10 Mpc ↔ Δz ≈ 0.002 (지도서 0.0023)
  close(M.velocityFromZ(0.07),21000); close(M.distanceFromZ(0.07),300,1e-9); // 해 보기 ④: 슬론 장성 약 300 Mpc
  assert.equal(M.lyText(300),'약 9.8억 광년');                // 약 10억 광년
  assert.equal(M.lyText(600),'약 20억 광년');
  assert.equal(M.lyText(160),'약 5.2억 광년');                // 라니아케아 (약 5억 광년)
  assert.equal(M.lyText(0.77),'약 250만 광년');               // 우리은하–안드로메다
  close(M.lightYears(1),3.26e6);                             // 1 Mpc ≈ 326만 광년
  assert.equal(M.num(-0.001,3),'−0.001'); assert.equal(M.num(-0.0001,2),'0.00');
});

test('안드로메다은하: 시선 속도 −300 km/s → 청색 편이 (다가온다)',()=>{
  const lam=M.observedWavelength(656.3,M.zFromVelocity(-300));
  close(lam,655.6437,1e-4);
  const s=M.measureSteps(656.3,lam,2);
  assert.ok(s.dl<0); close(s.z,-0.001); assert.equal(s.v,-300); assert.ok(s.approaching);
});

test('스펙트럼: 모든 선이 같은 비율 z 로 밀리고, 표시는 선에 붙는다',()=>{
  const z=0.05424;
  for(const l of M.LINES){
    const lam=M.observedWavelength(l.rest,z);
    close(M.redshift(lam,l.rest),z,1e-12);
  }
  // 파장이 긴 선일수록 많이 밀린다(Δλ), 비율은 같다
  const dK=M.observedWavelength(393.4,z)-393.4, dHa=M.observedWavelength(656.3,z)-656.3;
  assert.ok(dHa>dK*1.6);
  for(const kind of ['red','blue']){
    const spec=M.SPECTRA[kind];
    for(const id of spec.marked){
      const at=M.observedWavelength(M.lineById(id).rest,z);
      const f0=M.observedFlux(at,z,spec), f1=M.observedFlux(at-2,z,spec), f2=M.observedFlux(at+2,z,spec);
      if(kind==='red') assert.ok(f0<f1&&f0<f2,`${id} 흡수선은 골짜기`);
      else assert.ok(f0>f1&&f0>f2,`${id} 방출선은 봉우리`);
      const snap=M.snapToLine(at+1.5,z,spec,3);
      assert.equal(snap.id,id); close(snap.lambda,at);
    }
    assert.equal(M.snapToLine(450,z,spec,1),null);
  }
  const q2=M.singleLineSpectrum(500);
  assert.ok(M.observedFlux(514,0.028,q2)<M.observedFlux(510,0.028,q2));
  close(M.snapToLine(513,0.028,q2,3).lambda,514);
});

test('쐐기 지도: 꼭짓점 = 우리은하, 적경이 클수록 왼쪽, 멀수록 위',()=>{
  const p=M.wedgeXY(180,0.1,180); close(p.x,0,1e-12); close(p.y,0.1);
  assert.ok(M.wedgeXY(200,0.1,180).x<0&&M.wedgeXY(160,0.1,180).x>0);
  const q=M.wedgePolar(M.wedgeXY(213.4,0.083,180).x,M.wedgeXY(213.4,0.083,180).y,180);
  close(q.ra,213.4,1e-9); close(q.r,0.083,1e-12);
  close(M.separationMpc(180,0.05,180,0.06),M.distanceFromZ(0.01),1e-9);
});

test('실제 자료: SDSS DR16 15,656개, 2dFGRS 20,437개, 수업 지도와 같은 범위',()=>{
  assert.equal(SDSS.n,15656); assert.equal(TWODF.n,20437);
  for(const s of [SDSS,TWODF]){
    let lo=Infinity,hi=-Infinity,zlo=Infinity,zhi=-Infinity,dlo=Infinity,dhi=-Infinity;
    for(let i=0;i<s.n;i++){lo=Math.min(lo,s.ra[i]);hi=Math.max(hi,s.ra[i]);zlo=Math.min(zlo,s.z[i]);zhi=Math.max(zhi,s.z[i]);dlo=Math.min(dlo,s.dec[i]);dhi=Math.max(dhi,s.dec[i]);}
    assert.ok(lo>=s.raMin-0.01&&hi<=s.raMax+0.01&&zlo>0&&zhi<0.15&&dlo>=-1.25&&dhi<=1.25);
  }
  // 적경 순 정렬 + 차이 저장이 제대로 풀렸는가 (변환할 때 찍어 둔 첫 은하)
  close(SDSS.ra[0],140.009,1e-9); close(SDSS.z[0],0.01703,1e-9);
  // 02의 실제 은하 다섯 (convert.py 에서 고른 것)
  assert.deepEqual(SDSS.featured.map(i=>SDSS.z[i]),[0.01812,0.04902,0.05424,0.11175,0.13893]);
  // 해 보기 ④를 미리 알려 주지 않도록 은하 장성(0.065~0.09) 밖에서 골랐다
  assert.ok(SDSS.featured.every(i=>SDSS.z[i]<0.065||SDSS.z[i]>0.09));
  // 은하 장성: 적색 편이 분포의 가장 높은 봉우리가 0.07~0.085 (수업 설계 확인 사실)
  for(const s of [SDSS,TWODF]){
    const h=M.zHistogram(s,0,0.15,30), peak=h.indexOf(Math.max(...h))*0.005;
    assert.ok(peak>=0.07&&peak<0.085,`peak ${peak}`);
  }
  let red=0; for(let i=0;i<SDSS.n;i++) if(M.isRed(SDSS.gr[i],SDSS.z[i])) red++;
  assert.ok(red/SDSS.n>0.3&&red/SDSS.n<0.6);
  const o=M.measurementOrder(SDSS.n,20261101);
  assert.equal(new Set(o).size,SDSS.n);
  assert.deepEqual(Array.from(o.slice(0,5)),Array.from(M.measurementOrder(SDSS.n,20261101).slice(0,5)));
  const rank=M.ranksOf(o); assert.equal(rank[o[123]],123);
});

test('수업 결과 표시: 은하단은 평균보다 빽빽, 보이드는 텅 빔 — 두 탐사 모두',()=>{
  for(const s of [SDSS,TWODF]){
    const perZ2=M.meanSurfaceDensity(s,0.005,0.1)*(M.C/M.H)**2;
    for(const [ra,z] of M.LESSON_MARKS.clusters){
      const st=M.circleStats(s,ra,z,M.LESSON_MARKS.clusterRadius);
      assert.ok(st.n/(perZ2*Math.PI*M.LESSON_MARKS.clusterRadius**2)>1.5,`cluster ${ra}`);
    }
    for(const [ra,z,r] of M.LESSON_MARKS.voids){
      const st=M.circleStats(s,ra,z,r);
      assert.ok(st.n/(perZ2*Math.PI*r*r)<0.6,`void ${ra}`);
    }
  }
  const all=M.circleStats(SDSS,170.5,0.073,M.LESSON_MARKS.clusterRadius);
  assert.equal(M.circleStats(SDSS,170.5,0.073,M.LESSON_MARKS.clusterRadius,()=>false).n,0);   // 아직 잰 은하가 없으면 0
  const half=M.circleStats(SDSS,170.5,0.073,M.LESSON_MARKS.clusterRadius,i=>i%2===0).n;
  assert.ok(half>0.3*all.n&&half<0.7*all.n);
  const red=M.circleStats(SDSS,153.5,0.046,M.LESSON_MARKS.clusterRadius);
  assert.ok(red.red/red.n>0.4);                              // 은하단: 붉은 은하가 많다
  close(M.wallCenterZ(209),0.087); close(M.wallCenterZ(185),0.081); close(M.wallCenterZ(150),0.074);
});

test('밀도와 부피: 부피는 성긴 곳이 대부분, 은하는 빽빽한 곳에 (2024 수능 지Ⅱ 6)',()=>{
  const g=M.densityCells(SDSS,10);
  const sparse=M.shareWhere(g,r=>r<1), dense=M.shareWhere(g,r=>r>=2);
  assert.ok(sparse.vol>0.6&&sparse.gal<0.3,`${sparse.vol} ${sparse.gal}`);
  assert.ok(dense.vol<0.2&&dense.gal>0.45,`${dense.vol} ${dense.gal}`);
  const bins=M.densityShares(g);
  close(bins.reduce((s,b)=>s+b.vol,0),1); close(bins.reduce((s,b)=>s+b.gal,0),1);
  // 칸들의 평균 밀도 = 1 (부피 가중)
  const W=g.cells.reduce((s,c)=>s+c.frac,0);
  close(g.cells.reduce((s,c)=>s+c.frac*c.rho,0)/W,1,1e-9);
  assert.ok(g.cells.some(c=>c.n===0));                       // 은하가 하나도 없는 칸(보이드)
});

test('칸을 키울수록 고르게: 약 70 Mpc보다 크면 대부분 평균과 비슷 (교과서 117쪽)',()=>{
  for(const s of [SDSS,TWODF]){
    const sp=M.spreadBySize(s,[10,20,40,70,100]);
    for(let k=1;k<sp.length;k++) assert.ok(sp[k].sd<sp[k-1].sd,`sd ${sp[k].size}`);
    const near=sz=>M.shareWhere(M.densityCells(s,sz),r=>r>=0.5&&r<2).vol;
    assert.ok(near(10)<0.45&&near(70)>0.7&&near(100)>0.8);
    assert.ok(sp[3].max<3.5);                                 // 70 Mpc 칸: 가장 빽빽해도 평균의 몇 배 안
    assert.ok(sp[0].max>8);                                   // 10 Mpc 칸: 은하단은 평균의 8배 넘게
    // 70 Mpc·100 Mpc 칸에서도 가장 빽빽한 칸은 은하 장성(적색 편이 약 0.07~0.09)이 지나는 곳
    for(const size of [70,100]){
      const top=M.densityCells(s,size).cells.reduce((a,c)=>c.rho>a.rho?c:a);
      const zc=M.zFromDistance(Math.hypot(top.x0+size/2,top.y0+size/2));
      assert.ok(zc>0.065&&zc<0.095,`${size} Mpc densest cell z ${zc}`);
    }
  }
});

test('우주 팽창: 은하군·은하단은 크기 그대로, 초은하단은 팽창을 따라 커진다 (Q1 ㄴ·ㄷ)',()=>{
  const sc=M.expansionScene(7);
  const at=(a,t)=>M.scenePositions(sc,a,t);
  for(const sys of sc.systems){
    const e1=M.extent(at(1,0).filter(p=>p.system===sys)), e2=M.extent(at(2,0).filter(p=>p.system===sys));
    close(e1,e2,1e-9);
    assert.ok(e1<=2*sys.radius+1e-9);
  }
  close(M.extent(at(2,0))/M.extent(at(1,0)),2,0.02);
  const F=M.GROUP_FACTS;
  assert.equal(F.localGroup.diameterMpc,3); assert.equal(F.localGroup.smallGalaxies,80);
  assert.equal(F.cluster.sizeMpc,10); assert.equal(F.cluster.virgoCount,2000); assert.equal(F.cluster.virgoDistanceMpc,16);
  assert.equal(F.supercluster.laniakeaMpc,160); assert.equal(F.wall.lengthMpc,400);
});
