const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/B1/04/B1-04-model.js');
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const Q = (q, x, y = 0) => ({q, x, y});

test('B1-04 예제: x = 0 에 +9q, x = 4d 에 +q → E = 0 인 점은 x = 3d (사이, r₁/r₂ = √9 = 3)', () => {
  close(M.zeroOnAxis(9, 0, 1, 4), 3);
  const z = M.zeroInfo(9, 0, 1, 4);
  assert.equal(z.where, 'between');
  close(z.ratio, 3); close(z.r1, 3); close(z.r2, 1);
  assert.equal(z.smaller, 2);                                   // 작은 전하(+q) 가까이
  const e = M.field([Q(9, 0), Q(1, 4)], 3, 0);
  close(e[0], 0, 1e-12); close(e[1], 0, 1e-12);
});

test('B1-04 예제: 오른쪽 전하를 x = 2d 의 −q 로 바꾸면 → 작은 전하 바깥 x/(x − 2d) = 3 → x = 3d', () => {
  close(M.zeroOnAxis(9, 0, -1, 2), 3);
  const z = M.zeroInfo(9, 0, -1, 2);
  assert.equal(z.where, 'outside');
  close(z.r1, 3); close(z.r2, 1); close(z.r1 / z.r2, 3);
  close(M.exOnAxis([Q(9, 0), Q(-1, 2)], 3), 0, 1e-12);
});

test('B1-04 개념 체크: +4q (x = 0), −q (x = 3d) → x = 6d. 사이에서 찾은 x = 2d 는 두 기여가 같은 방향이라 0 이 아니다', () => {
  close(M.zeroOnAxis(4, 0, -1, 3), 6);
  const cs = [Q(4, 0), Q(-1, 3)];
  close(M.exOnAxis(cs, 6), 0, 1e-12);
  const p = M.parts(cs, 2, 0);
  assert.ok(p[0][0] > 0 && p[1][0] > 0);                         // x = 2d: 둘 다 +x 방향
  close(Math.abs(p[0][0]), Math.abs(p[1][0]), 1e-12);            // 크기는 같지만 더해진다
  assert.ok(M.exOnAxis(cs, 2) > 0);
});

test('B1-04 그림 ②: 같은 종류 +4q, +q 는 사이(2d : d), 다른 종류 +4q, −q 는 작은 전하 바깥(2d, d)', () => {
  const a = M.zeroInfo(4, 0, 1, 3);
  assert.equal(a.where, 'between'); close(a.x, 2); close(a.r1, 2); close(a.r2, 1);
  const b = M.zeroInfo(4, 0, -1, 1);
  assert.equal(b.where, 'outside'); close(b.x, 2); close(b.r1, 2); close(b.r2, 1);
  // 작은 전하가 왼쪽에 있으면 왼쪽 바깥
  close(M.zeroOnAxis(-1, 0, 4, 1), -1);
});

test('B1-04 표: 크기가 같은 다른 부호는 E = 0 인 점이 없고(무한대 제외), 같은 부호는 가운데', () => {
  assert.equal(M.zeroOnAxis(1, 0, -1, 4), null);
  assert.equal(M.zeroInfo(1, 0, -1, 4).where, 'none');
  close(M.zeroOnAxis(1, 0, 1, 4), 2);
  close(M.zeroOnAxis(-2, 0, -2, 4), 2);
  // 바깥 어디서나 가까운 전하의 기여가 더 크다 → Eₓ 가 0 이 되지 않는다
  for (const x of [-6, -3, -1, -0.2, 4.2, 5, 7, 10]) assert.ok(Math.abs(M.exOnAxis([Q(1, 0), Q(-1, 4)], x)) > 0);
  assert.equal(M.zeroOnAxis(3, 0, 0, 4), null);                   // 전하가 하나뿐
});

test('B1-04 세 구역 판정: 같은 방향이면 0 이 될 수 없고, 반대 방향이어도 큰 전하에 가까우면 0 이 아니다', () => {
  const [L, Mi, R] = M.zones(4, 0, -1, 3);
  assert.ok(L.opposite && L.zero === null && L.bigger === 1);    // 왼쪽 바깥: 반대 방향, 늘 +4q 가 큼
  assert.ok(!Mi.opposite && Mi.zero === null);                    // 사이: 같은 방향
  assert.ok(R.opposite); close(R.zero, 6);                         // 오른쪽 바깥: x = 6d
  const s = M.zones(9, 0, 1, 4);
  assert.ok(!s[0].opposite && s[1].opposite && !s[2].opposite);  // 같은 부호: 사이에서만 반대 방향
  close(s[1].zero, 3);
});

test('B1-04 중첩: E = E₁ + E₂ (벡터 합), 세기 kq/r², 양전하는 밖으로·음전하는 안으로', () => {
  const cs = [Q(9, 0), Q(-1, 4), Q(2, 1, 3)];
  for (const [x, y] of [[2, 2], [-1, 1.5], [5, -2], [1, -1]]) {
    const e = M.field(cs, x, y), p = M.parts(cs, x, y);
    close(e[0], p[0][0] + p[1][0] + p[2][0], 1e-12); close(e[1], p[0][1] + p[1][1] + p[2][1], 1e-12);
  }
  const ep = M.part(Q(9, 0), 3, 0), en = M.part(Q(-1, 4), 3, 0);
  close(ep[0], 1); close(en[0], 1);                               // 9/3² = 1 (밖으로 +x), 1/1² = 1 (−q 쪽으로 +x)
  close(M.strength(9, 3), 1);
  close(M.mag(M.part(Q(2, 0), 0, 2)), 0.5);
});

test('B1-04 E = 0 인 점에서 두 기여는 크기가 같고 방향이 반대 → x 축 위 Eₓ 가 그 점에서 부호를 바꾼다(그래프의 0)', () => {
  for (const [q1, x1, q2, x2] of [[9, 0, 1, 4], [9, 0, -1, 2], [4, 0, -1, 3], [4, 0, 1, 3], [-2, 0, 5, 3]]) {
    const z = M.zeroOnAxis(q1, x1, q2, x2), cs = [Q(q1, x1), Q(q2, x2)], p = M.parts(cs, z, 0);
    close(p[0][0], -p[1][0], 1e-12);
    assert.ok(M.exOnAxis(cs, z - 0.01) * M.exOnAxis(cs, z + 0.01) < 0, `${q1},${q2}: 부호가 바뀌어야 한다`);
    close(M.mag(M.field(cs, z, 0)), 0, 1e-12);
  }
});

test('B1-04 전기력선: 선 수 = 전하량 × n. (다) +2q 는 16개를 내보내 8개는 −q 로, 8개는 멀리 간다', () => {
  const {tally} = M.fieldLines([Q(2, 0), Q(-1, 4)], 8);
  assert.equal(tally[0].out, 16); assert.equal(tally[0].to[1], 8); assert.equal(tally[0].to.inf, 8);
  assert.equal(tally[1].in, 8); assert.equal(tally[1].from[0], 8);
  // (가) +q, −q: 모두 이어진다. (나) +q, +q: 이어지는 선 없이 모두 멀리
  const ga = M.fieldLines([Q(1, 0), Q(-1, 4)], 8).tally, na = M.fieldLines([Q(1, 0), Q(1, 4)], 8).tally;
  assert.equal(ga[0].to[1], 8); assert.equal(ga[1].in, 8);
  assert.equal(na[0].to.inf, 8); assert.equal(na[1].to.inf, 8); assert.equal(na[0].to[1], undefined);
  // 예제 두 경우: +9q 36개 · +q 4개, +9q 36개 중 4개가 −q 로
  const ex = M.fieldLines([Q(9, 0), Q(1, 4)], 4).tally, ex2 = M.fieldLines([Q(9, 0), Q(-1, 2)], 4).tally;
  assert.equal(ex[0].out, 36); assert.equal(ex[1].out, 4);
  assert.equal(ex2[0].to[1], 4); assert.equal(ex2[0].to.inf, 32); assert.equal(ex2[1].in, 4);
  // 음전하가 더 크면 모자란 선은 멀리서 들어온다: −2q 는 +q 에서 4개 + 멀리서 4개
  const ng = M.fieldLines([Q(-2, 0), Q(1, 4)], 4).tally;
  assert.equal(ng[0].in, 8); assert.equal(ng[0].from[1], 4); assert.equal(ng[0].from.inf, 4);
});

test('B1-04 세 전하가 한 직선(x 축) 위에 있어도 선 수는 정확히 전하량 × n (들어오는 선 = 다른 전하에서 + 멀리서)', () => {
  const a = M.fieldLines([Q(9, 0), Q(1, 4), Q(-2, -2)], 4).tally;
  assert.equal(a[0].out, 36); assert.equal(a[1].out, 4); assert.equal(a[2].in, 8);
  const b = M.fieldLines([Q(1, 0), Q(-4, 3), Q(1, 6)], 4).tally;
  assert.equal(b[1].in, 16); assert.equal(b[1].from[0], 4); assert.equal(b[1].from[2], 4); assert.equal(b[1].from.inf, 8);
  const c = M.fieldLines([Q(-3, -2), Q(5, 2), Q(-3, 6)], 4).tally;
  assert.equal(c[1].out, 20); assert.equal(c[0].in, 12); assert.equal(c[2].in, 12);
  assert.equal(c[0].from[1] + c[2].from[1], 20);                    // +5q 의 선은 모두 두 −3q 로
});

test('B1-04 개념 체크: A 에서 12개가 나와 8개가 B 로 → A 양전하, B 음전하, 전하량 비 12 : 8 = 1.5, A–B 사이에 E = 0 인 점 없음', () => {
  const cs = [Q(3, 0), Q(-2, 4)], {tally, lines} = M.fieldLines(cs, 4);
  assert.equal(tally[0].out, 12); assert.equal(tally[0].to[1], 8); assert.equal(tally[0].to.inf, 4);
  assert.equal(tally[1].in, 8); assert.equal(tally[1].out, 0);
  assert.ok(lines.every((l) => l.from === 0 || l.from === 'inf'));          // 선은 A(양전하)에서 나온다
  close(tally[0].out / tally[1].in, 1.5);
  const z = M.zeroOnAxis(3, 0, -2, 4);
  assert.ok(z > 4);                                                           // 사이가 아니라 B 바깥
});

test('B1-04 전기력선의 접선 = E 방향, 같은 선 위에서 Ψ = Σqcosθ 가 일정 → 선끼리 교차하지 않는다', () => {
  for (const [cs, n] of [[[Q(9, 0), Q(1, 4)], 4], [[Q(2, 0), Q(-1, 4)], 8], [[Q(4, 0), Q(-1, 3)], 4]]) {
    const {lines} = M.fieldLines(cs, n);
    const psis = [];
    for (const l of lines) {
      const pts = l.pts.filter((p) => cs.every((c) => Math.hypot(p[0] - c.x, p[1] - c.y) > 0.2) && Math.hypot(p[0] - 2, p[1]) < 12);
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], L = Math.hypot(dx, dy);
        const e = M.field(cs, (pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2), m = M.mag(e);
        assert.ok((dx * e[0] + dy * e[1]) / (L * m) > 0.999, '접선이 E 방향');
      }
      const v = pts.map((p) => M.psi(cs, p[0], p[1]));
      assert.ok(Math.max(...v) - Math.min(...v) < 2e-3, `Ψ 일정 (${Math.max(...v) - Math.min(...v)})`);
      psis.push(v[0]);
    }
    // 위쪽 반평면의 선은 Ψ 값이 모두 달라 서로 만나지 않는다
    const up = lines.filter((l) => l.pts.some((p) => p[1] > 0.3)).map((l) => M.psi(cs, ...l.pts.find((p) => p[1] > 0.3)));
    const s = [...up].sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) assert.ok(s[i] - s[i - 1] > 1e-3, 'Ψ 가 같은 두 선');
  }
});

test('B1-04 선을 수치로 따라가면 전하 둘레에서 고르게 시작하고, 시작 각이 원뿔(입체각 비 = 전하량 비) 안이면 음전하에 닿는다', () => {
  close(M.coneAngle(0.5), Math.PI / 2, 1e-12);                     // 반을 보내면 90°
  close(Math.cos(M.coneAngle(1 / 9)), 1 - 2 / 9, 1e-12);
  assert.equal(M.lineCount(9, 4), 36); assert.equal(M.lineCount(-2, 8), 16);
  const t = M.trace([Q(1, 0), Q(-1, 4)], 0.06, 0, 1);
  assert.equal(t.end, 'charge'); assert.equal(t.at, 1);
  close(t.len, 4 - 0.06, 0.01);                                       // 축을 따라가면 (시작점 0.06d 에서) −q 까지 3.94d
});

test('B1-04 수치로 찾은 E = 0 인 점이 공식과 같고, 세 전하에서도 E = 0 을 만족한다', () => {
  const box = {x0: -3.5, x1: 8.5, y0: -4, y1: 4};
  const z1 = M.zeros([Q(9, 0), Q(1, 4)], box);
  assert.equal(z1.length, 1); close(z1[0][0], 3, 1e-9); close(z1[0][1], 0, 1e-9);
  const z2 = M.zeros([Q(4, 0), Q(-1, 3)], box);
  assert.equal(z2.length, 1); close(z2[0][0], 6, 1e-9);
  // 정삼각형 꼭짓점의 같은 전하 세 개: 무게중심에서 E = 0
  const h = Math.sqrt(3), tri = [Q(1, 0), Q(1, 2), Q(1, 1, h)], zt = M.zeros(tri, box);
  assert.ok(zt.some((p) => Math.hypot(p[0] - 1, p[1] - h / 3) < 1e-9));
  for (const p of zt) close(M.mag(M.field(tri, p[0], p[1])), 0, 1e-9);
  const three = [Q(2, 0), Q(-1, 4), Q(1, 2, 3)];
  for (const p of M.zeros(three, box)) close(M.mag(M.field(three, p[0], p[1])), 0, 1e-9);
});

test('B1-04 E = 0 인 점 ≠ 전위 0 인 점: 같은 양전하 두 개의 가운데는 E = 0, 전위는 0 보다 크다', () => {
  const cs = [Q(1, 0), Q(1, 4)];
  close(M.mag(M.field(cs, 2, 0)), 0, 1e-12);
  assert.ok(M.potential(cs, 2, 0) > 0);
  // 거꾸로 +q, −q 의 가운데는 전위 0 이지만 E ≠ 0
  const d = [Q(1, 0), Q(-1, 4)];
  close(M.potential(d, 2, 0), 0, 1e-12);
  assert.ok(M.mag(M.field(d, 2, 0)) > 0);
});
