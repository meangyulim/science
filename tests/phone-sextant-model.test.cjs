const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../sims/phone-sextant/phone-sextant-model.js');
const close=(a,b,eps=1e-6,msg='')=>assert.ok(Math.abs(a-b)<eps,`${msg} ${a} ≠ ${b} (±${eps})`);
// Meeus 예제는 역학시(TD)로 주어진다. 모형은 UT 를 받아 ΔT 를 더하므로 그만큼 뺀다.
const msTD=jde=>M.msFromJd(jde)-M.DELTA_T*1000;

test('sidereal time: Meeus examples 12.a and 12.b',()=>{
  close(M.gmst(M.msFromJd(2446895.5)),197.693195,1e-5);
  close(M.gmst(Date.UTC(1987,3,10,19,21,0)),128.7378734,1e-5);
});

test('sun: Meeus example 25.a (1992 Oct 13, 0h TD)',()=>{
  const s=M.sunAt(msTD(2448908.5));
  close(s.ra,198.38083,0.003,'RA');
  close(s.dec,-7.78507,0.003,'dec');
});

test('moon: Meeus example 47.a (1992 Apr 12, 0h TD) with the truncated series',()=>{
  const m=M.moonAt(msTD(2448724.5));
  close(m.lon,133.162655+0.004610,0.02,'apparent longitude');   // 예제의 λ 에 장동 Δψ 를 더한 값
  close(m.lat,-3.229126,0.02,'latitude');
  close(m.distKm,368409.7,60,'distance');
  close(m.hp,0.991990,0.0005,'parallax');
  close(m.ra,134.688470,0.03,'RA');
  close(m.dec,13.768368,0.03,'dec');
});

test('precession: Meeus example 21.b (θ Persei to 2028)',()=>{
  const T=(2462088.69-2451545)/36525;
  const p=M.precess(41.054063,49.227750,T);   // 예제에서 고유 운동을 이미 더한 J2000 좌표
  close(p.ra,41.547214,2e-4,'RA');
  close(p.dec,49.348483,2e-4,'dec');
});

test('equinox and solstice sanity: sun declination',()=>{
  close(M.bodyAt('sun',Date.UTC(2026,2,20,14,46)).dec,0,0.02);            // 2026 춘분
  close(M.bodyAt('sun',Date.UTC(2026,5,21,8,24)).dec,23.436,0.02);        // 2026 하지
  close(M.bodyAt('sun',Date.UTC(2026,11,21,20,50)).dec,-23.436,0.02);     // 2026 동지
});

test('Polaris altitude ≈ latitude (within its 0.7° circle)',()=>{
  for(const lat of [33.5,37.5,38.5]) for(let h=0;h<24;h+=3){
    const p=M.bodyAt('polaris',Date.UTC(2026,9,28,h));
    assert.ok(Math.abs(M.altAz(p.gha,p.dec,lat,127).h-lat)<0.8);
  }
});

test('noon sun: altitude = 90 − latitude + declination',()=>{
  // 서울(126.98°E)에서 태양이 남중하는 시각을 찾아 확인
  const lat=37.57,lon=126.98;
  let best=null;
  for(let m=0;m<240;m++){
    const ms=Date.UTC(2026,9,28,2,0)+m*60000,s=M.bodyAt('sun',ms),aa=M.altAz(s.gha,s.dec,lat,lon);
    if(!best||aa.h>best.h) best={h:aa.h,az:aa.az,dec:s.dec};
  }
  close(best.h,90-lat+best.dec,0.01);
  close(best.az,180,1);
});

test('refraction and parallax corrections',()=>{
  close(M.refractionArcmin(0),34.5,0.6);
  close(M.refractionArcmin(45),1.0,0.05);
  assert.ok(M.refractionArcmin(90)<0.05);
  const o=M.observedAltitude(30,0.5,0.95);      // 달: 시차가 대기차보다 훨씬 크다
  close(o.ha,29.5);
  assert.ok(o.parallax>0.8&&o.parallax<0.85);
  close(o.ho,o.ha-o.refraction+o.parallax);
  for(const h of [5,20,60]) close(M.observedAltitude(M.apparentFromTrue(h,0.95),0,0.95).ho,h,1e-9);
});

test('phone orientation → camera and top-edge elevation',()=>{
  close(M.cameraElevation(0,0),-90);           // 책상에 화면이 위로: 카메라는 땅을 본다
  close(M.cameraElevation(90,0),0);            // 세로로 세움: 수평
  close(M.cameraElevation(120,0),30);          // 뒤로 30° 젖힘: 고도 30°
  close(M.cameraElevation(-60,180),30);        // 같은 자세를 다른 오일러 각으로
  // 가로로 들고 위로 30° 겨눔: 오일러 각은 달라도 같은 고도
  close(M.cameraElevation(180,60),30,1e-9);
  close(M.cameraElevation(0,120),30,1e-9);
  close(M.edgeElevation(30),30);
  close(M.edgeElevation(150),30);
});

test('circle intersections lie on both circles',()=>{
  const c1={lat:-13,lon:150},c2={lat:20,lon:60};
  const pts=M.circleIntersections(c1,52,c2,70);
  assert.equal(pts.length,2);
  for(const p of pts){ close(M.angularDistance(c1,p),52,1e-7); close(M.angularDistance(c2,p),70,1e-7); }
  assert.equal(M.circleIntersections(c1,10,c2,10).length,0);    // 멀리 떨어진 작은 원은 안 만난다
});

test('circle points are continuous and sit near the reference longitude',()=>{
  const pts=M.circlePoints({lat:10,lon:170},40,180,127);
  for(let i=1;i<pts.length;i++) assert.ok(Math.abs(pts[i][1]-pts[i-1][1])<20);
  for(const [lat,lon] of pts) close(M.angularDistance({lat:10,lon:170},{lat,lon}),40,1e-7);
  assert.ok(pts.some(p=>Math.abs(p[1]-127)<5));
});

function sightsAt(place,list){
  return list.map(([id,ms])=>{const p=M.bodyAt(id,ms);return {gha:p.gha,dec:p.dec,ho:M.altAz(p.gha,p.dec,place.lat,place.lon).h};});
}

test('fix: sun and moon at the same moment recover the place',()=>{
  const jeju={lat:33.4996,lon:126.5312};
  // 2026-10-17 15:30 KST (상현 무렵): 해는 남서쪽, 달은 남남동쪽
  const t=Date.UTC(2026,9,17,6,30);
  const s=sightsAt(jeju,[['sun',t],['moon',t]]);
  assert.ok(s.every(x=>x.ho>5));
  const f=M.solveFix(s,{lat:36.5,lon:127.8});
  assert.equal(f.kind,'fix');
  assert.ok(M.distanceKm(f,jeju)<0.01,`${M.distanceKm(f,jeju)} km`);
  assert.ok(f.crossing>30);
});

test('fix: three star sights at night, assumed position far off',()=>{
  const dokdo={lat:37.2417,lon:131.8647};
  const t=Date.UTC(2026,9,28,12,0);               // 21:00 KST
  const s=sightsAt(dokdo,[['vega',t],['capella',t],['altair',t]]);
  const f=M.solveFix(s,{lat:35,lon:125});
  assert.ok(M.distanceKm(f,dokdo)<0.01);
  close(f.rms,0,1e-7);
});

test('fix: two sun sights hours apart; noisy sights stay within ~100 km',()=>{
  const seoul={lat:37.5665,lon:126.978};
  const t=Date.UTC(2026,9,28,1,0);
  const s=sightsAt(seoul,[['sun',t],['sun',t+3*3600e3]]);
  const f=M.solveFix(s,{lat:36.5,lon:127.8});
  assert.ok(M.distanceKm(f,seoul)<0.01);
  // 0.3° 오차를 넣으면 대략 0.3 × 111 km × GDOP 안쪽
  const noisy=s.map((x,i)=>Object.assign({},x,{ho:x.ho+(i?0.3:-0.3)}));
  const g=M.solveFix(noisy,{lat:36.5,lon:127.8});
  assert.ok(M.distanceKm(g,seoul)<0.3*M.KM_PER_DEG*g.gdop*1.5);
});

test('fix: single sight gives a line, Polaris alone gives latitude',()=>{
  const t=Date.UTC(2026,9,28,12,0),busan={lat:35.1796,lon:129.0756};
  assert.equal(M.solveFix(sightsAt(busan,[['vega',t]])).kind,'line');
  const f=M.solveFix(sightsAt(busan,[['polaris',t]]),{lat:36.5,lon:127.8});
  assert.equal(f.kind,'latitude');
  close(f.lat,busan.lat,0.02);       // 경도를 1.3° 틀리게 둬도 위도는 거의 정확
});

test('bearing and destination round trip',()=>{
  const seoul={lat:37.5665,lon:126.978},busan={lat:35.1796,lon:129.0756};
  const b=M.bearing(seoul,busan),d=M.angularDistance(seoul,busan);
  assert.ok(b>130&&b<150);                       // 부산은 서울의 남동쪽
  close(M.distanceKm(seoul,busan),325,10);
  const p=M.destination(seoul,b,d);
  close(p.lat,busan.lat,1e-9); close(p.lon,busan.lon,1e-9);
});

test('formatting',()=>{
  assert.equal(M.formatLat(37.5665),'37°34.0′N');
  assert.equal(M.formatLon(-122.5),'122°30.0′W');
  assert.equal(M.formatLat(-0.9999999),'1°00.0′S');
  assert.equal(M.compassName(135),'남동');
  assert.equal(M.compassName(359),'북');
});
