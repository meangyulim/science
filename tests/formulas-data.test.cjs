// 공식 지도 데이터(physics/data/formulas.json) 검사: 간선·순환·출발점·유도 단계·개념 ID
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../physics/data/formulas.json');
const C = require('../physics/data/physics_concepts.json');
const FG = require('../physics/formulas/formulas-graph.js');

const ids = new Set(D.nodes.map(n => n.id));
const ROLES = new Set(['basis', 'derived', 'applied']);
const BASIS_TYPES = new Set(['정의', '법칙', '실험 법칙', '원리', '모형', '측정값']);

test('과목 · 대단원 · 단원이 개념 목록(physics_concepts.json)과 맞는다', () => {
  const subj = new Set(D.subjects.map(s => s.id)), big = new Map(D.bigUnits.map(b => [b.id, b]));
  for (const b of D.bigUnits) assert.ok(subj.has(b.subject), `${b.id}: 없는 과목 ${b.subject}`);
  const fromConcepts = new Map();
  for (const c of C.concepts) fromConcepts.set(c.unit_code, c);
  assert.equal(D.units.length, fromConcepts.size, '단원 수');
  for (const u of D.units) {
    const c = fromConcepts.get(u.code);
    assert.ok(c, `${u.code}: 개념 목록에 없는 단원`);
    assert.equal(u.name, c.unit, `${u.code} 단원 이름`);
    const b = big.get(u.big);
    assert.ok(b, `${u.code}: 없는 대단원 ${u.big}`);
    assert.equal(`${b.roman}. ${b.name}`, c.big_unit, `${u.code} 대단원 이름`);
    assert.equal(D.subjects.find(s => s.id === b.subject).name.replace(' ', ''), c.subject, `${u.code} 과목`);
  }
});

test('노드: id 가 겹치지 않고, id 앞부분이 단원 코드이며, 꼭 있어야 할 칸이 있다', () => {
  assert.equal(ids.size, D.nodes.length, 'id 중복');
  const units = new Set(D.units.map(u => u.code));
  for (const n of D.nodes) {
    assert.match(n.id, /^[A-Z0-9]+\.[A-Za-z0-9]+$/, n.id);
    assert.equal(n.id.split('.')[0], n.unit, `${n.id}: id 와 unit 이 다르다`);
    assert.ok(units.has(n.unit), `${n.id}: 없는 단원`);
    assert.ok(ROLES.has(n.role), `${n.id}: role`);
    assert.ok(n.name && n.name.trim(), `${n.id}: 이름`);
    assert.ok(n.tex && n.tex.trim(), `${n.id}: 수식`);
    assert.ok(Array.isArray(n.concepts), `${n.id}: concepts`);
  }
});

test('간선: 있는 노드끼리만 잇고, 종류가 kinds 에 있고, 겹치거나 제자리로 돌지 않는다', () => {
  const seen = new Set();
  for (const e of D.edges) {
    assert.ok(ids.has(e.from), `없는 노드에서 출발: ${e.from} → ${e.to}`);
    assert.ok(ids.has(e.to), `없는 노드를 가리킴: ${e.from} → ${e.to}`);
    assert.ok(e.kind in D.kinds, `${e.from} → ${e.to}: 종류 ${e.kind}`);
    assert.notEqual(e.from, e.to, `제자리 간선 ${e.from}`);
    const k = e.from + '>' + e.to;
    assert.ok(!seen.has(k), `겹친 간선 ${k}`);
    seen.add(k);
  }
});

test('유도 관계에 순환이 없다', () => {
  assert.equal(FG.findCycle(D), null);
});

test('출발점: 들어오는 간선이 없고, 무엇을 정했는지·무엇으로 확인하는지를 적었다', () => {
  const ix = FG.index(D);
  for (const n of D.nodes.filter(n => n.role === 'basis')) {
    assert.equal(ix.inE.get(n.id).length, 0, `${n.id}: 출발점인데 유도 간선이 들어온다`);
    assert.ok(n.basis && BASIS_TYPES.has(n.basis.type), `${n.id}: basis.type`);
    assert.ok(n.basis.what && n.basis.what.length > 10, `${n.id}: basis.what`);
    assert.ok(n.basis.check && n.basis.check.length > 10, `${n.id}: basis.check`);
    assert.ok(!n.steps, `${n.id}: 출발점에는 유도 단계를 두지 않는다`);
  }
});

test('유도·응용: 단계가 비어 있지 않고, 단계에 쓴 앞 공식(uses)과 들어오는 간선이 정확히 같다', () => {
  const ix = FG.index(D);
  for (const n of D.nodes.filter(n => n.role !== 'basis')) {
    assert.ok(Array.isArray(n.steps) && n.steps.length > 0, `${n.id}: 유도 단계가 비어 있다`);
    for (const [i, s] of n.steps.entries()) {
      assert.ok(s.say && s.say.trim().length > 3, `${n.id} 단계 ${i + 1}: 설명`);
      for (const u of s.uses || []) assert.ok(ids.has(u), `${n.id} 단계 ${i + 1}: 없는 공식 ${u}`);
    }
    const used = new Set(n.steps.flatMap(s => s.uses || []));
    const inc = new Set(ix.inE.get(n.id).map(e => e.from));
    assert.ok(inc.size > 0, `${n.id}: 유도인데 들어오는 간선이 없다`);
    assert.deepEqual([...used].sort(), [...inc].sort(), `${n.id}: uses ≠ 들어오는 간선`);
  }
});

test('모든 유도는 거슬러 올라가면 출발점(정의·법칙)에 닿는다', () => {
  const ix = FG.index(D);
  for (const n of D.nodes.filter(n => n.role !== 'basis')) {
    const roots = [...FG.ancestors(ix, n.id)].filter(a => ix.byId.get(a).role === 'basis');
    assert.ok(roots.length > 0, `${n.id}: 출발점에 닿지 않는다`);
  }
  const d = FG.depths(D);
  for (const n of D.nodes) assert.equal(d.get(n.id) === 0, n.role === 'basis', `${n.id}: 깊이 0 ↔ 출발점`);
});

test('관련 개념 ID 가 physics_concepts.json 에 있다', () => {
  const cids = new Set(C.concepts.map(c => c.id));
  for (const n of D.nodes) for (const c of n.concepts) assert.ok(cids.has(c), `${n.id}: 없는 개념 ${c}`);
});

test('「참고」(미적분)와 다른 꼴도 제대로 적었다', () => {
  for (const n of D.nodes) {
    for (const s of n.calc || []) assert.ok(s.tex && s.say, `${n.id}: calc`);
    for (const f of n.forms || []) assert.ok(typeof f === 'string' && f.trim(), `${n.id}: forms`);
  }
});
