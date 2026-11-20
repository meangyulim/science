// 공식 지도 「분야별」 보기: 분야 데이터, 분야별 배치(formulas-graph.js fieldLayout)의 약속
//  · 모든 공식은 분야 하나에 들고, 분야는 묶음 하나에 든다
//  · 카드끼리 겹치지 않고, 카드는 제 분야 레인 안, 레인은 제 묶음 안
//  · 모든 선이 위(부모)에서 아래(자식)로만 내려간다
//  · 레인마다 위에서 아래로 출발점 → 유도 → 응용, 출발점 띠는 모든 레인이 같은 높이
//  · 레인 순서는 분야 사이 선 길이(+ 거꾸로 가는 선)의 값이 가장 작다(동적 계획법 = 전부 따져 본 답)
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../physics/data/formulas.json');
const FG = require('../physics/formulas/formulas-graph.js');

// 화면에서 재는 카드 크기 대신 글자 수로 어림한 크기(formulas-graph.test.cjs 와 같은 방식)
const size = id => {
  const n = D.nodes.find(x => x.id === id);
  return {w: Math.min(400, Math.max(190, n.tex.length * 6 + 40)), h: 80 + (n.name.length > 14 ? 20 : 0)};
};
const F = FG.fieldLayout(D, size);
const byId = new Map(D.nodes.map(n => [n.id, n]));
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, b) => a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.x + a.w <= b.x + b.w + 0.01 && a.y + a.h <= b.y + b.h + 0.01;

test('분야 데이터: 묶음·분야 id 가 겹치지 않고, 모든 공식이 있는 분야 하나에 든다', () => {
  const gIds = new Set(D.fieldGroups.map(g => g.id)), fIds = new Set(D.fields.map(f => f.id));
  assert.equal(gIds.size, D.fieldGroups.length, '묶음 id 중복');
  assert.equal(fIds.size, D.fields.length, '분야 id 중복');
  for (const g of D.fieldGroups) {
    assert.ok(g.name && g.name.trim(), `${g.id}: 이름`);
    assert.ok([1, 2, 3].includes(g.color), `${g.id}: 색은 1~3`);
    assert.ok(D.fields.some(f => f.group === g.id), `${g.id}: 분야가 없는 묶음`);
  }
  for (const f of D.fields) {
    assert.match(f.id, /^[a-z]+$/, f.id);
    assert.ok(gIds.has(f.group), `${f.id}: 없는 묶음 ${f.group}`);
    assert.ok(f.name && f.name.trim() && f.about && f.about.trim(), `${f.id}: 이름·설명`);
    assert.ok(D.nodes.some(n => n.field === f.id), `${f.id}: 공식이 없는 분야`);
  }
  for (const n of D.nodes) assert.ok(fIds.has(n.field), `${n.id}: 분야(field) ${n.field} 없음`);
});

test('분야별 배치: 카드끼리 겹치지 않고, 카드는 제 레인 안, 레인은 제 묶음 안에 있다', () => {
  const ps = D.nodes.map(n => [n, F.nodes[n.id]]);
  for (const [n, p] of ps) {
    assert.ok(p && isFinite(p.x) && isFinite(p.y), `${n.id}: 자리 없음`);
    assert.ok(inside(p, F.lanes[n.field]), `${n.id}: 레인 ${n.field} 밖`);
  }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
    assert.ok(!overlap(ps[i][1], ps[j][1]), `${ps[i][0].id} 와 ${ps[j][0].id} 가 겹친다`);
  const ls = D.fields.map(f => [f, F.lanes[f.id]]);
  for (const [f, L] of ls) assert.ok(inside(L, F.groups[f.group]), `${f.id}: 묶음 밖`);
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++)
    assert.ok(!overlap(ls[i][1], ls[j][1]), `레인 ${ls[i][0].id}·${ls[j][0].id} 겹침`);
  const gs = D.fieldGroups.map(g => F.groups[g.id]);
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) assert.ok(!overlap(gs[i], gs[j]), '묶음 겹침');
  for (const g of gs) assert.ok(inside(g, F.bounds), '묶음이 지도 밖');
});

test('분야별 배치: 모든 선이 부모 아래 → 자식 위로, 위에서 아래로만 내려간다', () => {
  for (const e of D.edges) {
    const a = F.nodes[e.from], b = F.nodes[e.to];
    assert.ok(a.y + a.h < b.y, `${e.from} → ${e.to}: 자식이 부모보다 아래에 있지 않다`);
    assert.ok(F.line[e.from] < F.line[e.to], `${e.from} → ${e.to}: 줄 번호`);
  }
});

test('분야별 배치: 레인마다 위에서 아래로 출발점 → 유도 → 응용, 출발점 띠는 모든 레인이 같은 줄', () => {
  for (const n of D.nodes) {
    if (n.role === 'basis') assert.ok(F.line[n.id] < F.B, `${n.id}: 출발점이 띠 밖`);
    else assert.ok(F.line[n.id] >= F.B, `${n.id}: 출발점 띠 안에 든 유도·응용`);
  }
  for (const f of D.fields) {
    const ns = D.nodes.filter(n => n.field === f.id);
    const top = r => Math.min(...ns.filter(n => n.role === r).map(n => F.nodes[n.id].y));
    const bot = r => Math.max(...ns.filter(n => n.role === r).map(n => F.nodes[n.id].y + F.nodes[n.id].h));
    const has = r => ns.some(n => n.role === r);
    if (has('basis') && has('derived')) assert.ok(bot('basis') < top('derived'), `${f.id}: 출발점 → 유도`);
    if (has('derived') && has('applied')) assert.ok(bot('derived') < top('applied'), `${f.id}: 유도 → 응용`);
    if (has('basis') && has('applied')) assert.ok(bot('basis') < top('applied'), `${f.id}: 출발점 → 응용`);
    const L = F.lanes[f.id];
    for (const n of ns) {   // 카드는 제 칸(출발점 띠 / 유도 칸 / 응용 칸) 안에 있다
      const s = L[n.role], p = F.nodes[n.id];
      assert.ok(s && p.y >= s.y - 0.01 && p.y + p.h <= s.y + s.h + 0.01, `${n.id}: ${n.role} 칸 밖`);
    }
  }
});

test('분야별 배치: 같은 묶음의 분야는 붙어 있고, 레인 순서는 묶음 안에서 왼쪽 → 오른쪽으로 놓인다', () => {
  assert.deepEqual([...F.order].sort(), D.fields.map(f => f.id).sort(), '모든 분야가 한 번씩');
  const grp = F.order.map(id => D.fields.find(f => f.id === id).group);
  const seen = new Set();
  grp.forEach((g, i) => { if (i && g !== grp[i - 1]) { assert.ok(!seen.has(g), `묶음 ${g} 가 떨어져 있다`); } seen.add(g); });
  for (let i = 1; i < F.order.length; i++) assert.ok(F.lanes[F.order[i - 1]].x < F.lanes[F.order[i]].x, '레인 순서와 x 가 다르다');
});

// 레인 순서의 값(테스트에서 같은 방식으로 다시 잰다)
const o = FG.GF, W = FG.fieldWeights(D);
const widths = D.fields.map(f => F.lanes[f.id].w);
const grpOf = D.fields.map(f => f.group);
const gapAt = (a, b) => grpOf[a] === grpOf[b] ? o.laneGap : o.groupGap + 2 * o.groupPadX;
const costOf = ord => FG.orderCost(ord, widths, W, gapAt, o.flow);
const chosen = F.order.map(id => D.fields.findIndex(f => f.id === id));

test('레인 순서: 고른 순서의 값이 데이터 순서·뒤집은 순서·무작위 순서 400개보다 작거나 같다', () => {
  const best = costOf(chosen);
  assert.ok(best <= costOf(D.fields.map((f, i) => i)) + 1e-6, '데이터 순서보다 나쁘다');
  assert.ok(best <= costOf(chosen.slice().reverse()) + 1e-6, '뒤집은 순서보다 나쁘다');
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const groups = D.fieldGroups.map(g => D.fields.map((f, i) => [f, i]).filter(([f]) => f.group === g.id).map(([, i]) => i));
  for (let t = 0; t < 400; t++) {
    const ord = shuffle(groups).flatMap(shuffle);
    assert.ok(best <= costOf(ord) + 1e-6, `무작위 순서 ${ord.join(',')} 가 더 좋다`);
  }
});

test('레인 순서: 작은 예에서 동적 계획법의 답이 모든 순서를 다 따져 본 답과 같다', () => {
  // 분야 7개(묶음 3개), 선은 고정된 의사 난수로
  const fields = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({id, group: ['P', 'P', 'P', 'Q', 'Q', 'R', 'R'][i]}));
  const nodes = [], edges = [];
  let s = 7;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
  for (const f of fields) for (let k = 0; k < 3; k++) nodes.push({id: `${f.id}${k}`, field: f.id});
  for (let k = 0; k < 40; k++) {
    const a = nodes[Math.floor(rnd() * nodes.length)], b = nodes[Math.floor(rnd() * nodes.length)];
    if (a !== b) edges.push({from: a.id, to: b.id});
  }
  const d = {fields, fieldGroups: [{id: 'P'}, {id: 'Q'}, {id: 'R'}], nodes, edges};
  const w = [300, 520, 410, 260, 700, 330, 450], gin = 50, gout = 220, flow = 300;
  const Wt = FG.fieldWeights(d), g = fields.map(f => f.group);
  const gap = (a, b) => g[a] === g[b] ? gin : gout;
  const cost = ord => FG.orderCost(ord, w, Wt, gap, flow);
  const perms = a => a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map(p => [x].concat(p)));
  const byG = ['P', 'Q', 'R'].map(G => fields.map((f, i) => [f, i]).filter(([f]) => f.group === G).map(([, i]) => i));
  let best = Infinity;
  for (const go of perms([0, 1, 2])) {
    const lists = go.map(k => perms(byG[k]));
    for (const p0 of lists[0]) for (const p1 of lists[1]) for (const p2 of lists[2]) best = Math.min(best, cost(p0.concat(p1, p2)));
  }
  const dp = FG.laneOrder(d, w, gin, gout, flow);
  assert.ok(Math.abs(cost(dp) - best) < 1e-6, `동적 계획법 ${cost(dp)} ≠ 전부 따진 답 ${best}`);
});

test('한 줄 안 자리(placeRow): 순서를 지키고, 겹치지 않고, 범위 안이며, 될 수 있으면 목표 x 에 맞춘다', () => {
  const ws = {a: 100, b: 120, c: 80};
  const put = (ids, t, x0, x1) => FG.placeRow(ids, id => ws[id], id => t[id], x0, x1, 20);
  // 넉넉하면 목표 가운데에 그대로
  let p = put(['a', 'b', 'c'], {a: 100, b: 400, c: 700}, 0, 1000);
  assert.equal(p.get('a') + 50, 100); assert.equal(p.get('b') + 60, 400); assert.equal(p.get('c') + 40, 700);
  // 목표가 겹치면 밀어내되 순서를 지킨다
  p = put(['a', 'b', 'c'], {a: 300, b: 300, c: 300}, 0, 1000);
  assert.ok(p.get('a') + 100 + 20 <= p.get('b') + 1e-9 && p.get('b') + 120 + 20 <= p.get('c') + 1e-9);
  // 범위를 넘지 않는다
  p = put(['a', 'b', 'c'], {a: -500, b: -400, c: 2000}, 0, 400);
  assert.ok(p.get('a') >= 0 && p.get('c') + 80 <= 400);
});

test('분야별 배치는 같은 데이터면 언제나 같은 자리(새로고침해도 주소 #v 가 맞는다)', () => {
  const G = FG.fieldLayout(D, size);
  assert.deepEqual(G.order, F.order);
  for (const n of D.nodes) assert.deepEqual(G.nodes[n.id], F.nodes[n.id], n.id);
});

test('분야별 배치는 단원별보다 선 길이의 합이 짧다(같은 분야끼리 모은 보람)', () => {
  const U = FG.layout(D, size);
  const len = L => D.edges.reduce((s, e) => {
    const a = L.nodes[e.from], b = L.nodes[e.to];
    return s + Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h - b.y);
  }, 0);
  assert.ok(len(F) < len(U), `분야별 ${Math.round(len(F))} ≥ 단원별 ${Math.round(len(U))}`);
});

test('찾기: 분야 이름으로도 찾는다', () => {
  const hits = FG.search(D, '원운동과 진동', 20);
  assert.ok(hits.length > 0 && hits.every(id => byId.get(id).field === 'circular' || /원운동|진동/.test(byId.get(id).name)), hits.join(','));
  assert.ok(hits.includes('A1.cforce'));
});
