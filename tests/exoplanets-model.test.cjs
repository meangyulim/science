const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../exoplanets-model.js');
const close=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} ≠ ${b}`);

test('radial velocity: mass, inclination, period and recession sign',()=>{
  const p=M.defaults.rv;
  close(M.rv(0,{...p,inclination:90}).value,0);
  close(M.rv(0,{...p,inclination:60}).k,M.rv(0,p).k/2);
  const ratio=M.rv(0,{...p,mass:2}).k/M.rv(0,p).k;
  assert.ok(ratio>1.99&&ratio<2);
  close(M.rv(0,p).value,M.rv(p.period,p).value);
  close(M.rv(p.period/4,p).value,0);
  assert.ok(M.rv(p.period/2,p).value<0);
  // Observer lies on +z; star is opposite the planet about the barycenter.
  const dt=.0001,starZ=t=>-M.orbit(t,p.period,p.inclination).z;
  assert.ok((starZ(dt)-starZ(0))/dt<0); // star moving away at t = 0
  assert.ok(M.rv(0,p).value>0);
});
test('transit: exact circle overlap, radius squared, front/back and missing transit',()=>{
  const p=M.defaults.transit;
  close(M.overlap(0,.1),Math.PI*.01);
  close(M.overlap(1.2,.1),0);
  close(M.transit(p.period/4,p).value,99);
  close(M.transit(p.period/4,{...p,radius:.2}).value,96);
  close(M.transit(3*p.period/4,p).value,100);
  close(M.transit(p.period/4,{...p,inclination:15}).value,100);
  assert.equal(M.transit(0,{...p,inclination:90}).canTransit,false);
  const a=M.transit(.71,p).a;
  close(M.transit(0,{...p,period:6}).a/a,2**(2/3));
});
test('microlensing: base symmetry, timed planetary deviation and misalignment',()=>{
  const p=M.defaults.lens;
  close(M.lens(-15,p).base,M.lens(15,p).base);
  close(M.lens(9,{...p,planet:false}).value,M.lens(9,p).base);
  assert.ok(M.lens(9,p).anomaly>.8);
  assert.ok(M.lens(9,{...p,impact:1.5}).anomaly<1e-10);
  assert.ok(M.lens(-10,{...p,offset:-1}).anomaly>.8);
  close(M.lens(9,{...p,mass:.25}).sigma,M.lens(9,p).sigma/2);
  assert.deepEqual(M.domain('lens',p),[-40,40]);
});
test('direct imaging: projected angular separation, glare, distance and brightness',()=>{
  const p=M.defaults.direct,P=p.orbit**1.5;
  close(M.direct(0,p).separation,.4);
  close(M.direct(P/4,{...p,inclination:0}).separation,0);
  close(M.direct(P/4,{...p,inclination:90}).separation,.4);
  close(M.direct(0,{...p,distance:40}).separation,.2);
  close(M.direct(0,{...p,orbit:4}).separation,.2);
  assert.equal(M.direct(0,p).detectable,true);
  for(const change of [{mask:false},{distance:100},{brightness:.1}])assert.equal(M.direct(0,{...p,...change}).detectable,false);
});
test('all methods stay finite across their full timelines and extreme parameters',()=>{
  const extremes={rv:[{mass:.2,period:1,inclination:0},{mass:3,period:12,inclination:90}],transit:[{radius:.03,period:1,inclination:0},{radius:.2,period:12,inclination:90}],lens:[{impact:.1,mass:.1,offset:-1.5,planet:true},{impact:1.5,mass:3,offset:1.5,planet:false}],direct:[{orbit:2,distance:100,inclination:90,brightness:.1,mask:false},{orbit:12,distance:10,inclination:0,brightness:3,mask:true}]};
  for(const [method,params] of Object.entries(extremes))for(const p of params){const [a,b]=M.domain(method,p);for(let i=0;i<=1000;i++){const s=M[method](a+(b-a)*i/1000,p);assert.ok(Number.isFinite(s.value),method);if(method==='transit')assert.ok(s.value>=96-1e-8&&s.value<=100);}}
});

test('plane-to-sight angle: maximum at 0°, decreases monotonically, zero at 90° at every phase',()=>{
  const p=M.defaults.rv,k0=M.rv(0,{...p,inclination:0}).k;
  assert.ok(k0>0);
  for(let angle=0;angle<=90;angle++){
    const k=M.rv(0,{...p,inclination:angle}).k;
    close(k,k0*Math.cos(M.rad(angle)));
    if(angle>0)assert.ok(k<=M.rv(0,{...p,inclination:angle-1}).k);
  }
  for(let n=0;n<=100;n++){
    const t=n*p.period/100,face=M.orbit(t,p.period,90),edge=M.orbit(t,p.period,0);
    assert.equal(Math.abs(M.rv(t,{...p,inclination:90}).value),0);
    assert.equal(Math.abs(face.z),0);close(Math.hypot(face.x,face.y),1);
    assert.equal(Math.abs(edge.y),0);
  }
});
