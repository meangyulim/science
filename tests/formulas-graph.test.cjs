// 공식 지도 그래프 계산(physics/formulas/formulas-graph.js): 배치가 겹치지 않는지, 찾기·순환 찾기가 맞는지
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../physics/data/formulas.json');
const FG = require('../physics/formulas/formulas-graph.js');

// 화면에서 재는 카드 크기 대신 글자 수로 어림한 크기
const size = id => {
  const n = D.nodes.find(x => x.id === id);
  return {w: Math.min(400, Math.max(190, n.tex.length * 6 + 40)), h: 80 + (n.name.length > 14 ? 20 : 0)};
};
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, b) => a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.x + a.w <= b.x + b.w + 0.01 && a.y + a.h <= b.y + b.h + 0.01;

test('배치: 카드끼리 겹치지 않고, 카드는 제 단원 상자 안, 단원은 제 대단원 안에 있다', () => {
  const L = FG.layout(D, size);
  const ps = D.nodes.map(n => [n, L.nodes[n.id]]);
  for (const [n, p] of ps) {
    assert.ok(p, `${n.id}: 자리 없음`);
    assert.ok(inside(p, L.units[n.unit]), `${n.id}: 단원 상자 밖`);
  }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
    assert.ok(!overlap(ps[i][1], ps[j][1]), `${ps[i][0].id} 와 ${ps[j][0].id} 가 겹친다`);
  for (const u of D.units) assert.ok(inside(L.units[u.code], L.bigs[u.big]), `${u.code}: 대단원 밖`);
  const us = D.units.map(u => L.units[u.code]);
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) assert.ok(!overlap(us[i], us[j]), `단원 ${D.units[i].code}·${D.units[j].code} 겹침`);
});

test('배치: 같은 단원 안에서는 부모 공식이 자식보다 위 줄에 있다', () => {
  const L = FG.layout(D, size);
  const byId = new Map(D.nodes.map(n => [n.id, n]));
  for (const e of D.edges) {
    if (byId.get(e.from).unit !== byId.get(e.to).unit) continue;
    assert.ok(L.nodes[e.from].y < L.nodes[e.to].y, `${e.from} → ${e.to}`);
  }
});

test('배치: 같은 번호의 대단원(물리학 Ⅰ·Ⅱ)은 같은 높이에서 시작한다', () => {
  const L = FG.layout(D, size);
  for (const r of ['1', '2', '3']) assert.equal(L.bigs['P1-' + r].y, L.bigs['P2-' + r].y);
});

test('순환 찾기: 일부러 고리를 만들면 찾아낸다', () => {
  const d = {nodes: [{id: 'X.a'}, {id: 'X.b'}, {id: 'X.c'}], edges: [{from: 'X.a', to: 'X.b'}, {from: 'X.b', to: 'X.c'}, {from: 'X.c', to: 'X.a'}],
    units: [], bigUnits: [], subjects: []};
  const cyc = FG.findCycle(d);
  assert.ok(cyc && cyc.length === 4 && cyc[0] === cyc[3]);
  d.edges.pop();
  assert.equal(FG.findCycle(d), null);
});

test('찾기: 이름이 딱 맞는 공식이 맨 앞, 찾기 낱말·수식 글자로도 찾는다', () => {
  assert.equal(FG.search(D, '운동량')[0], 'I1.momentum');
  assert.equal(FG.search(D, '열효율')[0], 'I2.eff');
  assert.ok(FG.search(D, 'F=ma').includes('I1.newton2'));
  assert.ok(FG.search(D, '에어백').includes('I1.avgF'));
  assert.deepEqual(FG.search(D, '   '), []);
});

test('조상: 운동 에너지의 뿌리에 일·가속도 법칙·가속도가 있다', () => {
  const ix = FG.index(D);
  const anc = FG.ancestors(ix, 'I2.ek');
  for (const r of ['I2.work', 'I1.newton2', 'I1.accel']) assert.ok(anc.has(r), r);
  assert.ok(FG.descendants(ix, 'I1.newton2').has('I2.mcons'));
});

test('간선 곡선은 SVG 경로 글자다', () => {
  const a = {x: 0, y: 0, w: 100, h: 50}, b = {x: 200, y: 200, w: 100, h: 50};
  assert.match(FG.edgePath(a, b), /^M[\d.]+,[\d.]+ C/);
  assert.match(FG.edgePath(b, a), /^M[\d.]+,[\d.]+ C/);
});
