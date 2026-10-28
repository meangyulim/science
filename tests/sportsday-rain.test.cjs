const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../widgets/sportsday-rain.js');

const ev={...R.EVENT,date:'2026-10-30',hour:7};
const hourly={
  time:['2026-10-30T06:00','2026-10-30T07:00','2026-10-30T08:00'],
  precipitation_probability:[40,65,null],
  precipitation:[0,0.3,0],
  precipitation_member01:[0,0.1,0],
  precipitation_member02:[0,0.05,0],
  precipitation_member03:[0,null,0]
};

test('phase: before 7am KST, judged later that day, over from midnight',()=>{
  assert.equal(R.phase(new Date('2026-10-29T21:59:59Z'),ev),'before'); // 06:59:59 KST
  assert.equal(R.phase(new Date('2026-10-29T22:00:00Z'),ev),'judged'); // 07:00 KST
  assert.equal(R.phase(new Date('2026-10-30T14:59:59Z'),ev),'judged'); // 23:59:59 KST
  assert.equal(R.phase(new Date('2026-10-30T15:00:00Z'),ev),'over');
});
test('valueAt picks the 07:00 slot and ignores missing values',()=>{
  assert.equal(R.slot('2026-10-30',7),'2026-10-30T07:00');
  assert.equal(R.valueAt(hourly,'precipitation_probability','2026-10-30T07:00'),65);
  assert.equal(R.valueAt(hourly,'precipitation_probability','2026-10-30T08:00'),null);
  assert.equal(R.valueAt(hourly,'precipitation_probability','2026-10-31T07:00'),null);
  assert.equal(R.valueAt(undefined,'x','y'),null);
});
test('ensemble vote counts every precipitation column with a value, wet from 0.1 mm',()=>{
  assert.deepEqual(R.ensembleVote(hourly,'2026-10-30T07:00'),{rain:2,total:3});
  assert.deepEqual(R.ensembleVote(hourly,'2026-10-30T06:00'),{rain:0,total:4});
  assert.deepEqual(R.ensembleVote(hourly,'2026-11-01T07:00'),{rain:0,total:0});
});
test('verdict thresholds',()=>{
  assert.equal(R.verdict(null).level,'unknown');
  assert.equal(R.verdict(0).level,'clear');
  assert.equal(R.verdict(39).level,'likely');
  assert.equal(R.verdict(50).level,'coin');
  assert.equal(R.verdict(65).level,'risky');
  assert.equal(R.verdict(100).level,'cancel');
});
test('countdown and history',()=>{
  assert.equal(R.countdown(((3*24+4)*3600+5*60+9)*1000),'3일 4시간 5분');
  assert.equal(R.countdown((2*3600+5*60+9)*1000),'2시간 05분 09초');
  assert.equal(R.countdown(-1),'0초');
  let h=R.pushHistory([],40,1);
  h=R.pushHistory(h,40,2);
  h=R.pushHistory(h,55,3);
  assert.deepEqual(h,[{p:40,at:2},{p:55,at:3}]);
  assert.equal(R.pushHistory(Array.from({length:30},(_,i)=>({p:i,at:i})),99,99).length,30);
});
test('request urls use KST and only the event day',()=>{
  const u=new URL(R.forecastUrl(ev));
  assert.equal(u.searchParams.get('timezone'),'Asia/Seoul');
  assert.equal(u.searchParams.get('start_date'),'2026-10-30');
  assert.match(u.searchParams.get('hourly'),/precipitation_probability/);
  assert.equal(new URL(R.ensembleUrl(ev,'gfs025')).searchParams.get('models'),'gfs025');
});
