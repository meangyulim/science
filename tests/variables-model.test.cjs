const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../sims/variables/variables-model.js');
const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test('distance modulus: worksheet examples',()=>{
  close(M.distanceFromModulus(10),1000);          // 세페이드: m−M = 10 → 1 kpc
  close(M.distanceFromModulus(15.5-0.5),1e4);     // RR형 구상 성단: 10 kpc
  close(M.distanceFromModulus(16-(-19)),1e8);     // Ia형 연습 문제: 10⁸ pc
  close(M.modulus(10),0);
  close(M.brightnessRatio(-5),100);
  close(M.brightnessRatio(-2),6.3095734,1e-6);    // 2등급 = 약 6.3배
});

test('period-luminosity: class graph values',()=>{
  close(M.absMag('pop1',10),-4);
  close(M.absMag('pop2',10),-2);
  close(M.absMag('pop1',1),-1.6);
  close(M.absMag('rr',0.3),0.5);
  close(M.absMag('rr',0.8),0.5);
  assert.ok(M.absMag('pop1',30)<M.absMag('pop1',3)); // 주기가 길수록 밝다(등급이 작다)
  // 종족을 잘못 고르면 2등급 → 거리 10^0.4 ≈ 2.5배 차이
  const mu=6-M.absMag('pop1',10), wrong=6-M.absMag('pop2',10);
  close(M.distanceFromModulus(mu)/M.distanceFromModulus(wrong),10**0.4);
});

test('pulsator light curve: extremes, period and asymmetric rise',()=>{
  const s=M.withPhase(M.TYPES.cepheid);
  close(M.pulsatorMag(s.tMax,s),s.mMax);
  close(M.pulsatorMag(s.tMax+s.period,s),s.mMax);
  close(M.pulsatorMag(s.tMax-s.rise*s.period,s),s.mMin);
  const ms=[];
  for(let i=0;i<=1000;i++) ms.push(M.pulsatorMag(s.period*i/100,s));
  close(Math.min(...ms),s.mMax,1e-3); close(Math.max(...ms),s.mMin,1e-3);
  // 밝아지는 데 걸리는 시간 < 어두워지는 데 걸리는 시간
  assert.ok(s.rise<0.5);
  const peaks=M.maxima(s,0,M.domain(s)[1]);
  assert.ok(peaks.length>=3);
  close(peaks[1]-peaks[0],s.period);
});

test('explosive light curves: nova fades fast, supernova keeps its peak longer',()=>{
  const n=M.TYPES.nova, sn=M.TYPES.sn;
  close(M.novaMag(-1,n),n.quiet); close(M.novaMag(n.rise,n),n.peak);
  assert.ok(n.quiet-n.peak>=7&&n.quiet-n.peak<=16);     // 신성: 7~16등급 밝아짐
  close(M.supernovaMag(sn.rise,sn),sn.peak);
  assert.ok(sn.quiet-sn.peak>=20);                      // 초신성: 20등급 이상
  assert.ok(M.supernovaMag(0.5,sn)>sn.limit);           // 폭발 직후는 아직 검출 한계 아래
  const novaDrop=M.novaMag(n.rise+5,n)-n.peak, snDrop=M.supernovaMag(sn.rise+5,sn)-sn.peak;
  assert.ok(novaDrop>3*snDrop);
  // 슬라이드 26쪽: 초신성은 약 60일에 3등급, 220일에 약 6등급 어두워짐
  assert.ok(Math.abs(M.supernovaMag(60,sn)-sn.peak-3)<0.4);
  assert.ok(Math.abs(M.supernovaMag(220,sn)-sn.peak-5.6)<0.5);
});

test('observations: reproducible, inside the window, supernova hidden before explosion',()=>{
  const a=M.observe(M.TYPES.mira,7), b=M.observe(M.TYPES.mira,7);
  assert.deepEqual(a,b);
  const [lo,hi]=M.domain(M.withPhase(M.TYPES.mira));
  assert.ok(a.every(p=>p.t>=lo&&p.t<=hi));
  const sn=M.observe(M.TYPES.sn,3);
  assert.ok(sn.filter(p=>p.t<0).every(p=>p.hidden));
  assert.ok(sn.some(p=>!p.hidden));
  for(const kind of ['rr','cepheid','mira']){
    const s=M.randomStar(kind,11);
    assert.ok(s.mMin>s.mMax);
  }
  const rr=M.randomStar('rr',5), cep=M.randomStar('cepheid',5), mira=M.randomStar('mira',5);
  assert.ok(rr.period<1&&cep.period>=2&&cep.period<=100&&mira.period>100);
});

test('pulsation: L = R²T⁴ and the brightest moment follows temperature',()=>{
  const p={dR:0.08,dT:0.1,lag:0.4};
  const s=M.pulsation(0,p);
  close(s.lum,s.r**2*s.temp**4);
  close(M.pulsation(0,{dR:0,dT:0.1,lag:0}).lum,1.1**4);
  close(M.pulsation(0.3,{dR:0.1,dT:0,lag:0.3}).lum,1.21);
  const e=M.pulsationExtrema(p);
  close(e.rMax,0.4,1e-3); close(e.tMax,0,1e-3);
  assert.ok(Math.abs(M.phaseGap(e.lMax,e.tMax))<0.1);   // 가장 밝은 때 ≈ 가장 뜨거운 때
  assert.ok(Math.abs(M.phaseGap(e.lMax,e.rMax))>0.3);   // 가장 클 때와는 다르다
  assert.ok(e.magRange>0.6&&e.magRange<1.1);             // 세페이드 변광 폭 0.1~2.5등급 안
  const radiusOnly=M.pulsationExtrema({dR:0.08,dT:0,lag:0.4});
  close(radiusOnly.lMax,radiusOnly.rMax,1e-3);
  assert.ok(M.pulsation(0.4+0.05,p).velocity<0&&M.pulsation(0.4-0.05,p).velocity>0);
  close(M.phaseGap(0.95,0.05),-0.1);
});

test('star colour gets bluer with temperature',()=>{
  const rgb=s=>s.match(/\d+/g).map(Number);
  const cool=rgb(M.starColor(4000)), hot=rgb(M.starColor(9000));
  assert.ok(cool[0]>=cool[2]&&hot[2]>=cool[2]);
});

test('cosmology: distances, best model and expansion history',()=>{
  // 저적색 편이에서는 허블 법칙 d ≈ cz/H0
  close(M.lumDistance(0.001,0.3,0.7)/(299792.458*0.001/M.H0),1,2e-3);
  // 텅 빈 등속 우주의 정확한 식
  close(M.lumDistance(1,0,0)/(299792.458/M.H0*1*(1+0.5)),1,1e-5);
  // 감속(Ωm=1) 우주의 정확한 식
  close(M.lumDistance(1,1,0)/(2*299792.458/M.H0*2*(1-1/Math.SQRT2)),1,1e-5);
  // 같은 적색 편이에서 거리 지수: 감속 < 등속, 감속 < 가속 (가속 우주에서는 더 멀다 = 더 어둡다)
  const z=0.7;
  assert.ok(M.distModulus(z,1,0)<M.distModulus(z,0,0));
  assert.ok(M.distModulus(z,1,0)<M.distModulus(z,0.3,0.7));
  // 관측 자료는 가속 팽창 모형과 가장 잘 맞는다
  const fits=Object.values(M.MODELS).map(m=>M.fitStats(m.om,m.ol).rms);
  assert.ok(fits[2]<fits[0]&&fits[2]<fits[1]);
  assert.ok(fits[2]<0.16);
  // 평탄 우주에서 암흑 에너지 비율을 훑으면 0.7 근처가 가장 좋다
  let best=[0,Infinity];
  for(let ol=0;ol<=0.9;ol+=0.05){const r=M.fitStats(1-ol,ol).rms;if(r<best[1])best=[ol,r];}
  assert.ok(best[0]>=0.6&&best[0]<=0.85,`best ΩΛ ${best[0]}`);
  // 우주 나이와 가속이 시작된 때
  close(M.timeAt(1,1,0),2/3*9777.8/M.H0,0.01);            // 감속: 2/(3H0)
  close(M.timeAt(1,0,0),9777.8/M.H0,0.01);                // 텅 빈 우주: 1/H0
  const h=M.expansionHistory(0.3,0.7);
  assert.ok(h.age>130&&h.age<145,`age ${h.age}`);          // 약 138억 년
  assert.ok(h.lookback>55&&h.lookback<70,`lookback ${h.lookback}`); // 약 60억 년 전
  assert.equal(M.expansionHistory(1,0).tAcc,null);
  assert.ok(h.pts.every((p,i,a)=>i===0||p.t>a[i-1].t));
});
