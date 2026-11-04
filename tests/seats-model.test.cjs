const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../sims/seats/seats-model.js');

const kids=n=>Array.from({length:n},(_,i)=>({key:'s'+String(i+1).padStart(2,'0'),friends:[],wishes:[]}));
const seatOf=(prob,occ,key)=>M.SEATS[M.posOf(prob,occ)[prob.idx.get(key)]];

test('classroom: hallway group 2×5 plus a pyramid back row of 3, other groups 2×5 — 33 seats',()=>{
  assert.equal(M.NSEAT,33);
  const perGroup=[0,0,0];
  for(const s of M.SEATS) perGroup[s.g]++;
  assert.deepEqual(perGroup,[13,10,10]);
  const perCol=[0,0,0,0,0,0];
  for(const s of M.SEATS) if(!s.extra) perCol[s.k]++;
  assert.deepEqual(perCol,[5,5,5,5,5,5]);
  // 맨 뒷줄(6번째)은 1분단에만 있고, 두 칸 바로 뒤에 피라미드처럼 세 칸 (반 칸씩 엇갈림)
  const back=M.SEATS.filter(s=>s.r===5);
  assert.deepEqual(back.map(s=>s.id),['e-5','0-5','1-5']);
  assert.deepEqual(back.map(s=>s.x),[0.5,1.5,2.5]);
  assert.deepEqual(['0-4','1-4'].map(id=>M.SEAT[id].x),[1,2]);
  assert.equal(M.SEAT['2-5'],undefined);
  assert.equal(M.ROWS_MAX,6);
  assert.equal(M.FILL_ORDER[0].id,'0-0');
  assert.equal(M.FILL_ORDER[6].id,'0-1');
  // 양쪽으로 반 칸씩 튀어나오니 바닥이 반 칸 넓어진다
  assert.ok(Math.abs(M.WIDTH-7.7)<1e-9);
});

test('nearness: desk pairs with an aisle between them',()=>{
  const n=(a,b)=>M.near(M.SEAT[a],M.SEAT[b]);
  assert.equal(n('2-2','3-2'),1);      // 같은 분단 짝
  assert.equal(n('2-2','2-3'),0.75);   // 앞뒤
  assert.equal(n('2-2','3-3'),0.5);    // 짝의 대각선
  assert.equal(n('2-2','2-4'),0.25);
  assert.equal(n('1-2','2-2'),0.4);    // 통로 건너 옆 — 짝보다 훨씬 멀다
  assert.equal(n('3-1','4-2'),0.2);
  assert.equal(n('1-2','3-2'),0.1);    // 두 줄 건너
  assert.equal(n('0-0','5-4'),0);
  assert.deepEqual([0,1,2,3,4,5].map(k=>M.SEAT[k+'-0'].g),[0,0,1,1,2,2]);
  // 1분단 맨 뒷줄 세 자리: 가운데와 셋째는 짝, 양 끝은 두 칸 떨어짐
  assert.equal(n('0-5','e-5'),1);      // 맨 뒷줄 세 칸은 서로 짝
  assert.equal(n('1-5','e-5'),0.25);   // 양 끝
  assert.equal(n('0-4','e-5'),0.625);  // 반 칸 엇갈린 바로 뒤
  assert.equal(n('0-4','0-5'),0.625);
  assert.equal(n('e-5','2-2'),0);
  for(const a of M.SEATS)for(const b of M.SEATS)assert.equal(M.near(a,b),M.near(b,a));
  // 원하는 자리: 통로 건너 옆자리는 짝 자리보다 덜 가깝다
  const w=M.SEAT['2-2'];
  assert.ok(M.wishAt(M.SEAT['3-2'],w)>M.wishAt(M.SEAT['1-2'],w));
  assert.equal(M.relation(1),'짝');
  assert.equal(M.relation(0.4),'통로 건너 옆');
  assert.equal(M.relation(0),'멀어요');
  assert.equal(M.seatName('0-2'),'1분단 복도 쪽 줄 · 앞에서 3번째');
  assert.equal(M.seatName('5-0'),'3분단 창가 쪽 줄 · 앞에서 1번째');
  assert.equal(M.seatName('2-0'),'2분단 복도에서 셋째 줄 · 앞에서 1번째');
  assert.equal(M.seatName('e-5'),'1분단 맨 뒤 세 칸 · 복도 벽 쪽');
});

test('friends who choose each other become desk partners, not neighbours across the aisle',()=>{
  const st=kids(4);
  st[0].friends=['s02'];st[1].friends=['s01'];
  st[2].friends=['s04'];st[3].friends=['s03'];
  const prob=M.prepare(st,{locks:{s01:'1-0',s03:'2-0'}});   // s01·s03 을 통로 양쪽에 고정
  const occ=M.optimize(prob,null,{rand:M.rng(4),restarts:2,iters:6000});
  assert.equal(seatOf(prob,occ,'s02').id,'0-0');   // s01 의 짝 자리
  assert.equal(seatOf(prob,occ,'s04').id,'3-0');   // s03 의 짝 자리
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
  assert.equal([...occ].filter(x=>x<0).length,6);
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
  st[1].wishes=['e-5'];            // 1분단 맨 뒤 세 칸의 복도 벽 쪽
  for(let i=2;i<6;i++)st[i].wishes=['2-0'];   // 넷이 같은 자리를 원하면 그 근처로 모인다
  const prob=M.prepare(st,{});
  const occ=M.optimize(prob,null,{rand:M.rng(3),restarts:3,iters:15000});
  assert.equal(seatOf(prob,occ,'s01').id,'3-0');
  assert.equal(seatOf(prob,occ,'s02').id,'e-5');
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

test('more than 33 students is refused',()=>{
  assert.throws(()=>M.prepare(kids(34),{}),/33/);
  assert.doesNotThrow(()=>M.prepare(kids(33),{}));
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

test('lecture hall: two rows at each end, three in the middle, 6 seats per row — 42 seats',()=>{
  const L=M.LAYOUTS.hall;
  assert.equal(L.NSEAT,42);
  assert.equal(L.ROWS_MAX,6);
  assert.equal(L.COLS,7);
  const perGroup=[0,0,0];
  for(const s of L.SEATS) perGroup[s.g]++;
  assert.deepEqual(perGroup,[12,18,12]);
  const n=(a,b)=>L.near(L.SEAT[a],L.SEAT[b]);
  assert.equal(n('2-0','3-0'),1);     // 가운데 분단: 가운데 줄은 양옆이 다 짝
  assert.equal(n('3-0','4-0'),1);
  assert.equal(n('2-0','4-0'),0.25);  // 가운데 분단 양 끝
  assert.equal(n('1-0','2-0'),0.4);   // 통로 건너
  assert.equal(n('4-3','5-3'),0.4);
  assert.equal(L.seatName('3-0'),'2분단 복도에서 넷째 줄 · 앞에서 1번째');
  // 23명이면 빈자리는 뒤쪽에, 서로 고른 짝은 짝으로
  const st=kids(23);
  for(let i=0;i<22;i+=2){st[i].friends=[st[i+1].key];st[i+1].friends=[st[i].key];}
  const prob=M.prepare(st,{layout:'hall'});
  assert.equal(prob.L,L);
  const occ=M.optimize(prob,null,{rand:M.rng(8),restarts:3,iters:20000});
  assert.equal([...occ].filter(x=>x>=0).length,23);
  assert.ok(L.SEATS.filter(s=>occ[s.i]>=0).every(s=>s.r<=4));
  const pos=M.posOf(prob,occ);
  for(let i=0;i<22;i+=2)assert.equal(L.near(L.SEATS[pos[i]],L.SEATS[pos[i+1]]),1);
  // 보통 교실의 셋째 자리는 강의실에는 없다
  assert.equal(L.SEAT['e-6'],undefined);
  assert.equal(M.layout('nope'),M.LAYOUTS.room);
});

test('roster: whole rows pasted from the class list spreadsheet',()=>{
  const text=[
    '2026학년도 2학기 행성우주과학 명렬표 (A_행성)\t\t\t',
    '분반: A_행성 (2층 종합강의실 1 (213))\t\t담당 교사: 선생님\t\t시간표: 월 7교시\t수강 인원: 총 3명',
    '\t\t\t\t',
    '연번\t학급\t번호\t학번\t성명\t확인\t비고',
    '1\t2반\t15\t20215\t가나다\t\t',
    '2\t3반\t8\t20308\t라마바\t\t',
    '3\t3반\t20\t20320\t사아\t\t전입',
  ].join('\n');
  assert.deepEqual(M.parseRoster(text),[{no:20215,name:'가나다'},{no:20308,name:'라마바'},{no:20320,name:'사아'}]);
  // 엑셀 시트(칸 배열)에서 바로
  assert.deepEqual(M.rosterFromRows([['연번','학급','번호','학번','성명'],[1,'9반',9,'20909','가나다'],[2,'9반',10,20910,'라마바'],[]]),
    [{no:20909,name:'가나다'},{no:20910,name:'라마바'}]);
  // 같은 줄을 두 번 붙여도 한 번만
  assert.equal(M.parseRoster('20215 가나다\n20215 가나다').length,1);
});

test('taking turns: whoever had a popular seat last time yields it this time',()=>{
  const st=kids(4);
  for(const s of st)s.wishes=['2-0'];   // 넷 다 같은 자리를 원한다
  const seatOf2=(prob,occ,key)=>M.SEATS[M.posOf(prob,occ)[prob.idx.get(key)]].id;
  const winners=new Set();
  let history=[];
  for(let round=0;round<4;round++){
    const prob=M.prepare(st,{history});
    const occ=M.optimize(prob,null,{rand:M.rng(round+1),restarts:3,iters:20000});
    const who=st.find(s=>seatOf2(prob,occ,s.key)==='2-0');
    assert.ok(who,'someone sits in the popular seat');
    assert.ok(!winners.has(who.key)||winners.size===4,`round ${round}: ${who.key} again`);
    winners.add(who.key);
    history=[Object.fromEntries(st.map(s=>[s.key,seatOf2(prob,occ,s.key)])),...history];
  }
  // 한 명만 원하던 자리는 양보 대상이 아니다
  const one=kids(2);one[0].wishes=['5-4'];
  const p=M.prepare(one,{history:[{s01:'5-4'}]});
  assert.equal(p.yieldF[0],1);
});

test('each student can choose how much friends vs seat matter to them',()=>{
  // 둘 다 친구(서로)와 자리(멀리 떨어진 두 곳)를 원한다. 셋째 학생 자리도 끼어 있어 둘 다 이룰 수는 없다.
  const st=kids(2);
  st[0].friends=['s02'];st[0].wishes=['0-0'];
  st[1].friends=['s01'];st[1].wishes=['5-4'];
  const seat=(prob,occ,k)=>M.SEATS[M.posOf(prob,occ)[prob.idx.get(k)]].id;
  // 둘 다 자리가 훨씬 중요 → 각자 원한 자리에
  st[0].fw=0.2;st[1].fw=0.2;
  let prob=M.prepare(st,{fw:0.6}),occ=M.optimize(prob,null,{rand:M.rng(1),restarts:2,iters:8000});
  assert.equal(seat(prob,occ,'s01'),'0-0');assert.equal(seat(prob,occ,'s02'),'5-4');
  // 둘 다 친구가 훨씬 중요 → 짝으로
  st[0].fw=0.8;st[1].fw=0.8;
  prob=M.prepare(st,{fw:0.6});occ=M.optimize(prob,null,{rand:M.rng(1),restarts:2,iters:8000});
  assert.equal(M.near(M.SEAT[seat(prob,occ,'s01')],M.SEAT[seat(prob,occ,'s02')]),1);
  // 안 고르면 선생님 기본값
  delete st[0].fw;
  assert.equal(M.prepare(st,{fw:0.3}).fwi[0],0.3);
  assert.equal(M.prepare(st,{fw:0.3}).fwi[1],0.8);
});

test('teacher-made classroom: groups, columns, and missing desks',()=>{
  // 분단 넷: 2줄×6, 3줄×5(가운데 줄 맨 앞 책상 없음), 2줄×6, 1줄×4
  const def={name:'7반 교실',groups:[[6,6],[5,[1,2,3,4],5],[6,6],[4]]};
  assert.ok(M.validDef(def));
  const L=M.layoutOf('c-7',def);
  assert.equal(L.NSEAT,12+14+12+4);
  assert.equal(L.SEAT['3-0'],undefined);          // 빠진 책상
  assert.ok(L.SEAT['3-1']);
  assert.equal(L.COLS,8);
  assert.equal(L.ROWS_MAX,6);
  assert.equal(M.layoutOf('c-7',def),L);           // 같은 모양은 다시 만들지 않는다
  assert.equal(L.near(L.SEAT['2-1'],L.SEAT['3-1']),1);
  assert.equal(L.near(L.SEAT['1-1'],L.SEAT['2-1']),0.4);   // 통로 건너
  // 그 교실에서 자리 찾기
  const st=kids(30);
  for(let i=0;i<30;i+=2){st[i].friends=[st[i+1].key];st[i+1].friends=[st[i].key];}
  const prob=M.prepare(st,{layout:L});
  const occ=M.optimize(prob,null,{rand:M.rng(3),restarts:2,iters:15000});
  assert.equal([...occ].filter(x=>x>=0).length,30);
  assert.ok(M.report(prob,occ).withF>=28);
  // 이상한 모양은 거절하고 보통 교실로
  assert.equal(M.validDef({groups:[]}),false);
  assert.equal(M.validDef({groups:[[1,2,3,4,5]]}),false);
  assert.equal(M.validDef({groups:[[[0,99]]]}),false);
  assert.equal(M.layoutOf('x',{groups:[]}),M.LAYOUTS.room);
});

test('teacher-made classroom: a back row with a different number of desks (pyramid)',()=>{
  // 1분단: 2줄×6 뒤에 반 칸씩 엇갈린 3칸 — 보통 교실의 피라미드와 같은 모양
  const seats=[];
  for(let r=0;r<6;r++)seats.push([0.5,r],[1.5,r]);
  seats.push([0,6],[1,6],[2,6]);
  const def={name:'피라미드',groups:[{w:3,seats,cols:2,rows:6,back:3},[5,5],[5,5]]};
  assert.ok(M.validDef(def));
  const L=M.layoutOf('c-p',def);
  assert.equal(L.NSEAT,15+10+10);
  const back=L.SEATS.filter(s=>s.r===6);
  assert.equal(back.length,3);
  const s05=L.SEATS.find(s=>s.r===5&&s.c===0.5);
  assert.equal(L.near(back[0],back[1]),1);          // 맨 뒷줄 세 칸은 서로 짝
  assert.equal(L.near(s05,back[0]),0.625);          // 반 칸 엇갈린 바로 뒤 (보통 교실과 같다)
  assert.equal(new Set(L.SEATS.map(s=>s.id)).size,L.NSEAT);
  // 잘못된 칸(반 칸 단위가 아님, 겹침, 너비 밖)은 거절
  assert.equal(M.validDef({groups:[{w:2,seats:[[0.3,0]]}]}),false);
  assert.equal(M.validDef({groups:[{w:2,seats:[[0,0],[0,0]]}]}),false);
  assert.equal(M.validDef({groups:[{w:2,seats:[[2,0]]}]}),false);
});
