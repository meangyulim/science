const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../sims/seats/seats-model.js');

const kids=n=>Array.from({length:n},(_,i)=>({key:'s'+String(i+1).padStart(2,'0'),friends:[],wishes:[]}));
const seatOf=(prob,occ,key)=>M.SEATS[M.posOf(prob,occ)[prob.idx.get(key)]];

test('classroom: 6 rows of 5 seats, the hallway row has 7 — 32 seats',()=>{
  assert.equal(M.NSEAT,32);
  const perCol=[0,0,0,0,0,0];
  for(const s of M.SEATS) perCol[s.k]++;
  assert.deepEqual(perCol,[7,5,5,5,5,5]);
  assert.ok(M.SEAT['0-6']);
  assert.equal(M.SEAT['1-5'],undefined);
  assert.equal(M.FILL_ORDER[0].id,'0-0');
  assert.equal(M.FILL_ORDER[6].id,'0-1');
});

test('nearness: side by side beats front-back beats diagonal, symmetric',()=>{
  const n=(a,b)=>M.near(M.SEAT[a],M.SEAT[b]);
  assert.equal(n('2-2','3-2'),1);
  assert.equal(n('2-2','2-3'),0.75);
  assert.equal(n('2-2','3-3'),0.5);
  assert.equal(n('2-2','2-4'),0.25);
  assert.equal(n('0-0','5-4'),0);
  for(const a of M.SEATS)for(const b of M.SEATS)assert.equal(M.near(a,b),M.near(b,a));
  assert.equal(M.relation(1),'옆자리');
  assert.equal(M.relation(0),'멀어요');
  assert.equal(M.seatName('0-2'),'복도 쪽 줄 · 앞에서 3번째');
  assert.equal(M.seatName('5-0'),'창가 쪽 줄 · 앞에서 1번째');
  assert.equal(M.seatName('2-0'),'복도에서 셋째 줄 · 앞에서 1번째');
});

test('roster: numbers, tabs from a spreadsheet, plain names',()=>{
  const r=M.parseRoster('1 김민지\n2.이서연\n3번 박지후\n4\t최유나\n\n  정하은  \n20301 강서준\n12');
  assert.deepEqual(r,[
    {no:1,name:'김민지'},{no:2,name:'이서연'},{no:3,name:'박지후'},{no:4,name:'최유나'},
    {no:null,name:'정하은'},{no:20301,name:'강서준'},{no:null,name:'12'}
  ]);
  // Firebase 열쇠에 못 쓰는 글자는 빼고, 너무 긴 이름은 자른다
  assert.deepEqual(M.parseRoster('5 a.b/c#d$e[f]'),[{no:5,name:'abcdef'}]);
  assert.equal(M.parseRoster('가나다라마바사아자차카타파하').at(0).name.length,12);
});

test('roster keys stay the same when the list is edited',()=>{
  const a=M.assignKeys(M.parseRoster('1 김민지\n2 이서연\n3 박지후'),{});
  assert.deepEqual(Object.keys(a),['s01','s02','s03']);
  const b=M.assignKeys(M.parseRoster('2 이서연\n3 박지후\n4 최유나'),a);
  assert.equal(Object.keys(b).find(k=>b[k].name==='이서연'),'s02');
  assert.equal(Object.keys(b).find(k=>b[k].name==='최유나'),'s04');   // 새 학생은 새 열쇠
  assert.equal(b.s01,undefined);
  // 같은 이름 둘은 번호로 구별
  const c=M.rosterList(M.assignKeys(M.parseRoster('7 김민지\n3 김민지\n5 이서연'),{}));
  assert.deepEqual(c.map(s=>s.label),['김민지(3)','이서연','김민지(7)']);
});

test('every student gets exactly one seat, the rest stay empty',()=>{
  const st=kids(27);
  for(let i=0;i<27;i++)st[i].friends=[st[(i+1)%27].key,st[(i+5)%27].key];
  const prob=M.prepare(st,{});
  const occ=M.optimize(prob,null,{rand:M.rng(1),restarts:3,iters:30000});
  const seated=[...occ].filter(x=>x>=0).sort((a,b)=>a-b);
  assert.deepEqual(seated,Array.from({length:27},(_,i)=>i));
  assert.equal([...occ].filter(x=>x<0).length,5);
  // 빈자리는 뒤쪽에 남는다 (앞자리가 비면 점수가 깎인다)
  const empties=M.SEATS.filter(s=>occ[s.i]<0);
  assert.ok(empties.every(s=>s.r>=3),empties.map(s=>s.id).join());
});

test('mutual friend pairs end up next to each other',()=>{
  const st=kids(30);
  for(let i=0;i<30;i+=2){st[i].friends=[st[i+1].key];st[i+1].friends=[st[i].key];}
  const prob=M.prepare(st,{});
  const occ=M.optimize(prob,null,{rand:M.rng(7),restarts:3,iters:20000});
  const rep=M.report(prob,occ);
  assert.equal(rep.withF,30);
  assert.ok(rep.avg>0.95,rep.avg);
  for(let i=0;i<30;i+=2)assert.equal(M.near(seatOf(prob,occ,st[i].key),seatOf(prob,occ,st[i+1].key)),1);
});

test('seat wishes are honoured, and fairness spreads the front seats',()=>{
  const st=kids(10);
  st[0].wishes=['3-0'];            // 한 명만 원하는 자리 → 그 자리
  st[1].wishes=['0-6'];            // 복도 줄 맨 뒤
  for(let i=2;i<6;i++)st[i].wishes=['2-0'];   // 넷이 같은 자리를 원하면 그 근처로 모인다
  const prob=M.prepare(st,{});
  const occ=M.optimize(prob,null,{rand:M.rng(3),restarts:3,iters:15000});
  assert.equal(seatOf(prob,occ,'s01').id,'3-0');
  assert.equal(seatOf(prob,occ,'s02').id,'0-6');
  for(let i=2;i<6;i++){
    const s=seatOf(prob,occ,st[i].key), w=M.SEAT['2-0'];
    assert.ok(Math.hypot(s.k-w.k,s.r-w.r)<=1.5,s.id);
  }
});

test('friend weight slider: 0 = only seats count, 1 = only friends count',()=>{
  const st=kids(2);
  st[0].friends=['s02'];st[0].wishes=['5-4'];
  st[1].wishes=['0-0'];
  const onlyF=M.prepare(st,{fw:1}), onlyW=M.prepare(st,{fw:0});
  const a=M.optimize(onlyF,null,{rand:M.rng(2),restarts:2,iters:6000});
  const b=M.optimize(onlyW,null,{rand:M.rng(2),restarts:2,iters:6000});
  assert.equal(M.near(seatOf(onlyF,a,'s01'),seatOf(onlyF,a,'s02')),1);
  assert.equal(seatOf(onlyF,a,'s02').id,'0-0');   // 친구를 안 고른 학생은 자리 바람만 있으니 그대로 반영
  assert.equal(seatOf(onlyW,b,'s01').id,'5-4');
  assert.equal(seatOf(onlyW,b,'s02').id,'0-0');
  // 아무것도 안 낸 학생은 만족도가 없다
  assert.equal(M.report(onlyF,a).byKey.s01.s,1);
  assert.equal(M.parts(M.prepare(kids(1),{}),new Int16Array([0]),0).s,null);
});

test('locked students stay put, apart pairs are kept away',()=>{
  const st=kids(12);
  st[0].friends=['s02'];st[1].friends=['s01'];
  st[2].friends=['s04'];st[3].friends=['s03'];
  const prob=M.prepare(st,{locks:{s05:'4-4',s01:'1-1'},apart:[['s03','s04']]});
  const occ=M.optimize(prob,null,{rand:M.rng(5),restarts:3,iters:15000});
  assert.equal(seatOf(prob,occ,'s05').id,'4-4');
  assert.equal(seatOf(prob,occ,'s01').id,'1-1');
  assert.equal(M.near(seatOf(prob,occ,'s01'),seatOf(prob,occ,'s02')),1);   // 고정 학생 옆으로 친구가 온다
  assert.equal(M.near(seatOf(prob,occ,'s03'),seatOf(prob,occ,'s04')),0);   // 서로 원해도 떨어뜨린다
  assert.equal(M.report(prob,occ).apartBad,0);
  assert.equal(prob.fr[prob.idx.get('s03')].length,0);   // 서로 고른 바람은 빼고 계산
  assert.equal(M.report(prob,occ).byKey.s01.s,1);
  // 두 학생을 같은 자리에 고정하면 먼저 적은 학생만
  const p2=M.prepare(kids(3),{locks:{s01:'2-2',s02:'2-2'}});
  assert.equal(p2.lockSeat[0],M.SEAT['2-2'].i);
  assert.equal(p2.lockSeat[1],-1);
});

test('seat maps round-trip; newcomers fill the front, locks win over the map',()=>{
  const st=kids(4);
  const prob=M.prepare(st,{locks:{s03:'0-0'}});
  const occ=M.toOcc(prob,{'0-0':'s01','2-2':'s02','9-9':'s04','3-3':'nobody'});
  const map=M.toMap(prob,occ);
  assert.equal(map['0-0'],'s03');        // 고정이 이긴다
  assert.equal(map['2-2'],'s02');
  assert.equal(Object.values(map).length,4);
  assert.equal(new Set(Object.values(map)).size,4);
  assert.ok(Object.keys(map).every(id=>M.SEAT[id]));
  assert.deepEqual(M.toMap(prob,M.toOcc(prob,map)),map);
});

test('more students than seats is refused',()=>{
  assert.throws(()=>M.prepare(kids(33),{}),/32/);
});

test('annealer runs in small steps and never loses its best',()=>{
  const st=kids(20);
  for(let i=0;i<20;i++)st[i].friends=[st[(i+3)%20].key];
  const prob=M.prepare(st,{});
  const a=new M.Annealer(prob,null,{iters:3000,rand:M.rng(9)});
  const start=a.cur;
  let done=false,steps=0;
  while(!done){done=a.step(250);steps++;}
  assert.equal(steps,12);
  assert.ok(a.best>=start);
  assert.ok(Math.abs(M.score(prob,a.bestOcc)-a.best)<1e-9);
  assert.ok(M.score(prob,M.polish(prob,a.bestOcc))>=a.best-1e-9);
});
