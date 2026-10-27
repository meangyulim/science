const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../quake-model.js');
const close=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);
const SCHOOL={lat:37.4985,lon:126.9962};

test('local plane: round trip and real distances',()=>{
  const p=M.toLatLon(SCHOOL,{x:120,y:-45});
  const q=M.toLocal(SCHOOL,p);
  close(q.x,120,1e-6); close(q.y,-45,1e-6);
  // 위도 0.001° ≈ 111 m, 이 위도에서 경도 0.001° ≈ 88 m
  close(M.geoDist(SCHOOL,{lat:SCHOOL.lat+0.001,lon:SCHOOL.lon}),111.2,0.2);
  close(M.geoDist(SCHOOL,{lat:SCHOOL.lat,lon:SCHOOL.lon+0.001}),88.3,0.2);
});

test('omori constant: 7.5 m/s on one field, 15 m/s on two',()=>{
  close(M.omori(M.SCALES.one),7.5);
  close(M.omori(M.SCALES.two),15);
  assert.equal(M.scaleOf('nope'),M.SCALES.one);
  const a=M.arrivals(60,0,M.SCALES.one);
  close(a.p,12); close(a.s,20); close(a.ps,8);
  close(M.distanceFromPS(a.ps,M.SCALES.one),60);
  // 깊이가 있으면 진원 거리(빗변)를 돌려준다
  const b=M.arrivals(30,40,M.SCALES.one);
  close(b.r,50); close(M.distanceFromPS(b.ps,M.SCALES.one),50);
});

test('intensity: closer is stronger, magnitude raises everything',()=>{
  assert.equal(M.roman(M.intensity(5,5)),'Ⅷ');
  assert.equal(M.roman(M.intensity(50,5)),'Ⅴ');
  assert.equal(M.roman(M.intensity(150,5)),'Ⅳ');
  assert.ok(M.intensity(40,6)>M.intensity(40,5));
  assert.equal(M.intensityClass(M.intensity(0.1,9)),10);
  assert.equal(M.intensityClass(M.intensity(1e6,1)),1);
  for(let i=1;i<=10;i++) assert.ok(M.INTENSITY_TEXT[i].length>5);
});

test('synthetic seismogram: quiet before P, P smaller than S, deterministic',()=>{
  const a=M.arrivals(45,0,M.SCALES.one), amp=M.amplitudeAt(a.r,5);
  const w=M.synthesize(a,amp,1234), w2=M.synthesize(a,amp,1234), w3=M.synthesize(a,amp,99);
  assert.equal(w.length,Math.ceil(M.recordLength(a)*M.RATE)+1);
  assert.deepEqual(Array.from(w.slice(0,200)),Array.from(w2.slice(0,200)));
  assert.notDeepEqual(Array.from(w.slice(0,200)),Array.from(w3.slice(0,200)));
  const peak=(t0,t1)=>{let m=0;for(let i=Math.ceil(t0*M.RATE);i<t1*M.RATE;i++)m=Math.max(m,Math.abs(w[i]));return m;};
  const noise=peak(0,a.p-0.05), pPart=peak(a.p,a.s-0.05), sPart=peak(a.s,a.s+3);
  assert.ok(noise<0.05,`noise ${noise}`);
  assert.ok(pPart>3*noise,`P ${pPart} vs noise ${noise}`);
  assert.ok(sPart>2*pPart,`S ${sPart} vs P ${pPart}`);
  // 가까운 관측소일수록 크게 흔들린다
  assert.ok(M.amplitudeAt(10,5)>M.amplitudeAt(100,5));
});

test('locate: exact circles recover the epicenter, noisy ones land close',()=>{
  const epi={x:23,y:-11}, st=[{x:-50,y:20},{x:40,y:35},{x:10,y:-40},{x:-30,y:-30},{x:60,y:-5}];
  const exact=st.map(s=>({x:s.x,y:s.y,r:M.dist(s,epi)}));
  const e=M.locate(exact);
  close(e.x,23,1e-3); close(e.y,-11,1e-3); assert.ok(e.rms<1e-3);
  const R=M.rng(7);
  const noisy=exact.map(c=>({...c,r:c.r+(R()-0.5)*6}));
  const n=M.locate(noisy);
  assert.ok(M.dist(n,epi)<6,`noisy error ${M.dist(n,epi)}`);
  assert.equal(M.locate(exact.slice(0,2)),null);
});

test('locate with depth and the common-chord method agree',()=>{
  const hypo={x:5,y:8,z:25}, st=[{x:-40,y:10},{x:35,y:30},{x:15,y:-35},{x:-20,y:-30}];
  const circles=st.map(s=>({x:s.x,y:s.y,r:Math.hypot(s.x-hypo.x,s.y-hypo.y,hypo.z)}));
  const h=M.locate(circles,true);
  close(h.x,5,1e-2); close(h.y,8,1e-2); close(h.z,25,1e-2);
  const rc=M.radicalCenter(circles[0],circles[1],circles[2]);
  close(rc.x,5,1e-6); close(rc.y,8,1e-6); close(rc.depth,25,1e-6);
  // 공통현 양 끝은 두 원 위에 있다
  const [p,q]=M.chord(circles[0],circles[1]);
  for(const pt of [p,q]){close(M.dist(pt,circles[0]),circles[0].r,1e-6);close(M.dist(pt,circles[1]),circles[1].r,1e-6);}
  assert.equal(M.chord({x:0,y:0,r:1},{x:10,y:0,r:1}),null);
});

test('random epicenter stays among the stations and away from them',()=>{
  const pts=[{x:-50,y:-30},{x:50,y:-30},{x:50,y:30},{x:-50,y:30},{x:0,y:0}];
  const R=M.rng(42);
  for(let i=0;i<50;i++){
    const e=M.randomEpicenter(pts,R);
    assert.ok(e.x>=-50&&e.x<=50&&e.y>=-30&&e.y<=30);
    assert.ok(Math.min(...pts.map(p=>M.dist(p,e)))>=8);
  }
});

test('class omori fit recovers k from picks',()=>{
  const pairs=[2,4,6,8,10].map(ps=>({ps,r:7.5*ps}));
  const f=M.fitOmori(pairs);
  close(f.k,7.5); close(f.r2,1); assert.equal(f.n,5);
  assert.equal(M.fitOmori([{ps:1,r:7}]),null);
});

test('GPS blending trusts the more accurate fix and lets walkers move',()=>{
  const a={lat:37,lon:127,acc:20,t:0};
  const b=M.blendFix(a,{lat:37.0001,lon:127,acc:4,t:1000});
  assert.ok(b.lat>37.00009,'accurate new fix should dominate');
  assert.ok(b.acc<4);
  const still=M.blendFix({lat:37,lon:127,acc:3,t:0},{lat:37.0001,lon:127,acc:30,t:500});
  assert.ok(still.lat<37.00002,'noisy fix barely moves a good estimate');
  assert.deepEqual(M.blendFix(null,{lat:1,lon:2,acc:5,t:9}),{lat:1,lon:2,acc:5,t:9});
});

test('guess ranking: smaller error first, then earlier',()=>{
  const r=M.rankGuesses([{team:0,x:10,y:0,t:5},{team:1,x:3,y:4,t:9},{team:2,x:0,y:5,t:2}],{x:0,y:0});
  assert.deepEqual(r.map(g=>g.team),[2,1,0]);
  close(r[0].err,5);
});

test('formation: flags clustered, in-line and narrow teams, praises a wide triangle',()=>{
  assert.equal(M.formation([{x:0,y:0},{x:30,y:0}]).level,'few');
  assert.equal(M.formation([{x:0,y:0},{x:4,y:3},{x:40,y:30}]).level,'close');
  const line=M.formation([{x:0,y:0},{x:25,y:1},{x:50,y:-1}]);
  assert.equal(line.level,'line'); assert.ok(line.iso<0.12);
  assert.equal(M.formation([{x:0,y:0},{x:12,y:0},{x:6,y:11}]).level,'narrow');
  const good=M.formation([{x:-30,y:-20},{x:30,y:-20},{x:0,y:30}]);
  assert.equal(good.level,'good'); close(good.minPair.d,Math.hypot(30,50),1e-9); assert.ok(good.iso>0.5);
});

test('error cloud: surrounding the epicenter beats standing in a clump or a line',()=>{
  const epi={x:0,y:0}, R=M.rng(11);
  const wide=M.errorCloud([{x:-40,y:-25},{x:40,y:-25},{x:0,y:45}],epi,2,R);
  const clump=M.errorCloud([{x:50,y:40},{x:58,y:42},{x:54,y:50}],epi,2,R);
  const line=M.errorCloud([{x:-40,y:30},{x:0,y:31},{x:40,y:30}],epi,2,R);
  assert.ok(wide.rms<3,`wide ${wide.rms}`);
  assert.ok(clump.rms>2*wide.rms,`clump ${clump.rms} vs wide ${wide.rms}`);
  assert.ok(line.rms>wide.rms,`line ${line.rms} vs wide ${wide.rms}`);
  assert.equal(M.errorCloud([{x:0,y:0},{x:1,y:1}],epi,2,R),null);
  // 초깃값을 주어도 정확한 원이면 정답을 찾는다
  const st=[{x:-30,y:10},{x:25,y:20},{x:5,y:-35}].map(s=>({...s,r:M.dist(s,{x:3,y:4})}));
  const e=M.locate(st,false,{x:0,y:0}); close(e.x,3,1e-3); close(e.y,4,1e-3);
});

test('error cloud with a fresh search shows the mirror trap of stations in a line',()=>{
  const sig=2.7, R=M.rng(7);
  const wide=M.errorCloud([{x:-32,y:-18},{x:30,y:-20},{x:2,y:24}],{x:2,y:-2},sig,R,50,true);
  const line=M.errorCloud([{x:-40,y:4},{x:0,y:6},{x:40,y:4}],{x:4,y:-12},sig,R,50,true);
  assert.ok(wide.rms<5,`wide ${wide.rms}`);
  assert.ok(line.rms>3*wide.rms,`line ${line.rms} vs wide ${wide.rms}`);
  // 거울상: 줄 반대편(+y)으로 튄 추정이 있다
  assert.ok(line.pts.some(p=>p.y>10));
});

test('hull orders the outside of a team without crossing',()=>{
  const pts=[{x:0,y:0},{x:10,y:10},{x:10,y:0},{x:0,y:10},{x:5,y:5}];
  const h=M.hull(pts);
  assert.equal(h.length,4);
  assert.ok(!h.some(p=>p.x===5&&p.y===5));
  // 넓이가 양수(반시계 방향)이고 정사각형 넓이 100
  let a=0; for(let i=0;i<h.length;i++){const p=h[i],q=h[(i+1)%h.length];a+=p.x*q.y-q.x*p.y;}
  close(a/2,100);
});
