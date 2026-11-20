// 공식 지도: 모든 LaTeX 가 KaTeX 로 오류 없이 렌더링되는지 (페이지는 CDN 의 katex@0.16.22 를 쓴다)
// katex 는 개발 의존성이다. 처음 한 번 저장소 맨 위에서 `npm install` 을 돌린다.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const D = require('../physics/data/formulas.json');
const FG = require('../physics/formulas/formulas-graph.js');

let katex = null;
try { katex = require('katex'); } catch (e) { /* 아래에서 건너뛴다 */ }

test('모든 수식(공식 · 유도 단계 · 다른 꼴 · 참고)이 KaTeX 로 렌더링된다', {skip: katex ? false : 'katex 가 없다: 저장소 맨 위에서 npm install 을 먼저 돌린다'}, () => {
  const all = FG.allTex(D);
  assert.ok(all.length > D.nodes.length);
  const bad = [];
  for (const [where, tex] of all) {
    try { katex.renderToString(tex, {throwOnError: true, strict: 'error'}); }
    catch (e) { bad.push(`${where}: ${e.message}`); }
  }
  assert.deepEqual(bad, []);
});

test('페이지가 부르는 KaTeX 판과 개발 의존성 판이 같다', {skip: katex ? false : 'katex 가 없다'}, () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '../physics/formulas/index.html'), 'utf8');
  const vs = [...html.matchAll(/katex@([\d.]+)/g)].map(m => m[1]);
  assert.ok(vs.length >= 2);
  for (const v of vs) assert.equal(v, katex.version);
});
