const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../sims/sun/sun-model.js');
const D = require('../sims/sun/sun-data.js');
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('교과서 60쪽 표: 흑점 A·B의 자전 주기', () => {
  const A = M.BOOK.textbookRows.A, B = M.BOOK.textbookRows.B;
  const a = M.rotationRow(A.dt, A.Rp, A.x, A.y);
  close(a.sx, A.sx, 0.005); close(a.sy, A.sy, 0.005);          // 0.20, 0.47
  close(a.aRad, A.aRad, 0.005); close(a.bRad, A.bRad, 0.005);  // 0.20 rad, 0.49 rad
  close(a.alpha, A.alpha, 0.02); close(a.beta, A.beta, 0.02);  // 11.33°, 28.20° (표의 값은 반올림 전 측정값으로 계산)
  close(a.theta, A.theta, 0.03); close(a.P, A.P, 0.03);        // 39.53°, 27.32일
  close(a.theta, a.alpha + a.beta);
  const b = M.rotationRow(B.dt, B.Rp, B.x, B.y);
  close(b.sx, B.sx, 0.005); close(b.sy, B.sy, 0.005);
  close(b.alpha, B.alpha, 0.02); close(b.beta, B.beta, 0.02);  // 20.51°, 34.70°
  close(b.theta, B.theta, 0.03); close(b.P, B.P, 0.03);        // 55.21°, 26.08일
  // 표에 인쇄된 시간 간격 '96'은 시간 단위: 96시간 = 4일일 때만 26.08일이 나온다
  close(B.printedDt / 24, B.dt);
  assert.ok(M.periodFromAngle(B.theta, B.printedDt) > 600);
  close(M.periodFromAngle(B.theta, B.dt), B.P, 0.01);
});

test('63쪽 확인 문제 3과 활동지: 비례식 θ : Δt = 360° : P', () => {
  const q = M.BOOK.checkQ3;
  close(M.periodFromAngle(q.theta, q.dt), q.P);                 // 50° : 4일 = 360° : P → 28.8일
  // 같은 기간 동안 이동각이 클수록 자전 주기가 짧다 (수업 슬라이드: 흑점 A 60°, 흑점 B 45°)
  assert.ok(M.periodFromAngle(60, 4) < M.periodFromAngle(45, 4));
  close(M.periodFromAngle(360, 25), 25);
});

test('차등 자전: 적도 약 25일, 고위도 30일 이상, 위도가 높을수록 길다', () => {
  const eq = M.rotationPeriod(0);
  assert.ok(eq > 24 && eq < 25.5, `적도 ${eq}`);
  assert.ok(M.rotationPeriod(60) > M.BOOK.highLatPeriod);
  assert.ok(M.rotationPeriod(40) < M.BOOK.highLatPeriod);
  for (let l = 0; l < 90; l += 5) assert.ok(M.rotationPeriod(l + 5) > M.rotationPeriod(l));
  close(M.rotationPeriod(-30), M.rotationPeriod(30));            // 남북 대칭
  close(M.latitudeForPeriod(M.rotationPeriod(33)), 33, 1e-6);
  close(M.omegaDeg(0), 14.71);
});

test('원반 투영과 투명 용지 측정: 표시한 두 위치에서 이동각이 정확히 나온다', () => {
  const R = 10;
  const cases = [[12, -30, 4], [-25, -10, 5], [30, -60, 3], [5, 10, 3], [-35, -65, 3]];
  for (const [lat, lon0, dt] of cases) {
    const lon1 = M.lonAfter(lat, lon0, dt);
    const p = M.project(lat, lon0), q = M.project(lat, lon1);
    const m = M.measureMarks({x: p.x * R, y: p.y * R}, {x: q.x * R, y: q.y * R}, R);
    close(m.Rp, R * Math.cos(lat * M.D2R), 1e-9);                // R′ = R cos(위도)
    close(m.latDeg, lat, 1e-9);
    const row = M.rotationRow(dt, m.Rp, m.x, m.y, m.sameSide);
    close(row.theta, lon1 - lon0, 1e-9);                          // θ = 실제로 돈 경도 차
    close(row.P, M.rotationPeriod(lat), 1e-9);
    assert.equal(m.sameSide, (lon0 < 0) === (lon1 < 0));
    assert.equal(m.backwards, false);
  }
  // 원반 위의 겉보기 이동 거리는 이동각에 비례하지 않는다: 같은 10°라도 가장자리에서는 짧게 보인다
  const mid = M.project(0, 5).x - M.project(0, -5).x, edge = M.project(0, 75).x - M.project(0, 65).x;
  assert.ok(edge < 0.4 * mid);
  const u = M.unproject(0.3, -0.4);
  const back = M.project(u.lat, u.lon);
  close(back.x, 0.3, 1e-12); close(back.y, -0.4, 1e-12);
  assert.equal(M.unproject(0.9, 0.9), null);
});

test('연습용 흑점 사진: 같은 seed는 같은 사진, 측정하기 좋은 위치', () => {
  assert.deepEqual(M.practiceSet(7), M.practiceSet(7));
  for (let seed = 1; seed <= 60; seed++) {
    const s = M.practiceSet(seed);
    assert.ok(s.dt >= 3 && s.dt <= 6);
    assert.ok(s.spots.length >= 4, `seed ${seed}: ${s.spots.length}개`);
    assert.ok(s.spots[0].lon0 < 0 && s.spots[0].lon1 > 0);       // 첫 흑점은 중앙 경선을 지난다(θ = α + β)
    for (const p of s.spots) {
      assert.ok(Math.abs(p.lat) <= 40 && Math.abs(p.lat) >= 3);  // 흑점은 고위도에 거의 없다
      assert.ok(Math.abs(p.lon0) <= M.LIMB_LIMIT && Math.abs(p.lon1) <= M.LIMB_LIMIT);
      close(p.lon1 - p.lon0, M.omegaDeg(p.lat) * s.dt, 0.02);
    }
    const lats = s.spots.map(p => p.lat).sort((a, b) => a - b);
    for (let i = 1; i < lats.length; i++) assert.ok(lats[i] - lats[i - 1] >= 5);
  }
  const ex = M.textbookExample('A');
  const p = M.project(ex.lat, ex.spots[0].lon0), q = M.project(ex.lat, ex.spots[0].lon1);
  const m = M.measureMarks({x: p.x * ex.R, y: p.y * ex.R}, {x: q.x * ex.R, y: q.y * ex.R}, ex.R);
  close(m.Rp, 8.15, 1e-9); close(m.x, 1.60, 1e-9); close(m.y, 3.85, 1e-9);
});

test('주연 감광과 흑점의 어둡기', () => {
  close(M.limbDarkening(0), 1);
  assert.ok(M.limbDarkening(0.5) < 1 && M.limbDarkening(0.9) < M.limbDarkening(0.5));
  close(M.limbDarkening(0.999999), 0.4, 0.01);                   // 가장자리는 가운데의 약 40%
  assert.equal(M.limbDarkening(1.2), 0);
  close(M.relBrightness(5800), 1);
  const umbra = M.relBrightness(M.BOOK.umbraT), pen = M.relBrightness(M.BOOK.penumbraT);
  assert.ok(umbra < pen && pen < 1);
  assert.ok(umbra > 0.1 && umbra < 0.25);                         // 4000 K 흑점도 빛을 낸다(광구의 약 16%)
});

test('SILSO 흑점 수: 13개월 이동 평균과 약 11년 주기', () => {
  const v = D.silso.values;
  assert.equal(v.length, (2026 - 1950) * 12 + 9);                 // 1950년 1월 ~ 2026년 9월
  assert.ok(v.every(x => x >= 0 && x < 400));
  const s = M.smooth13(v);
  const at = (y, m) => s[(y - 1950) * 12 + m - 1];
  // SILSO 공식 13개월 평활값과 같다
  close(at(1958, 3), 285.0, 0.05); close(at(2008, 12), 2.2, 0.05); close(at(2014, 4), 116.4, 0.05);
  close(at(2019, 12), 1.8, 0.05); close(at(2024, 10), 160.9, 0.05);
  assert.equal(s[5], null); assert.equal(s[v.length - 1], null);
  const ex = M.localExtrema(s);
  assert.deepEqual(ex.max.map(i => Math.floor(M.monthToYear(i))), [1958, 1968, 1979, 1989, 2001, 2014, 2024]);
  assert.deepEqual(ex.min.map(i => Math.floor(M.monthToYear(i))), [1954, 1964, 1976, 1986, 1996, 2008, 2019]);
  const gaps = ex.max.slice(1).map((m, i) => (m - ex.max[i]) / 12);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(mean > 10.5 && mean < 11.5, `평균 ${mean}년`);
  close(M.yearToMonth(M.monthToYear(100)), 100, 1e-9);
});

test('나비 도표: 주기 초반에는 높은 위도, 후반에는 적도 가까이, 50° 이상은 거의 없다', () => {
  const cols = M.decodeButterfly(D.butterfly.cols, D.butterfly.bins);
  assert.equal(cols.length, 513);
  assert.ok(cols.every(c => c.length === 50 && c.every(x => x <= 6)));
  const year = j => M.crToYear(D.butterfly.crStart + D.butterfly.step * (j + 0.5));
  assert.ok(Math.abs(year(0) - 1950.1) < 0.1 && year(cols.length - 1) > 2026.4);
  close(M.binLatitude(0), -M.binLatitude(49), 1e-12);             // 남 → 북
  const mean = (y0, y1) => {
    const st = cols.filter((c, j) => year(j) >= y0 && year(j) < y1).map(M.columnStats).filter(x => x.total);
    return st.reduce((a, x) => a + x.meanAbsLat * x.total, 0) / st.reduce((a, x) => a + x.total, 0);
  };
  // 극소기 직후(새 주기 초반) vs 다음 극소기 직전
  for (const [early, late] of [[[1955, 1956.5], [1962.5, 1964.5]], [[1987, 1988.5], [1994.5, 1996.3]], [[2009.5, 2011], [2017, 2019.9]]]) {
    const e = mean(...early), l = mean(...late);
    assert.ok(e >= 20 && e <= 30, `초반 ${e}`);
    assert.ok(l <= 11, `후반 ${l}`);
  }
  const all = cols.map(M.columnStats);
  const high = all.reduce((a, x) => a + x.highFrac * x.total, 0) / all.reduce((a, x) => a + x.total, 0);
  assert.ok(high < 0.001);
  const band = M.latitudeBand(cols.filter((c, j) => year(j) >= 2007 && year(j) < 2008.9));
  assert.ok(band[1] <= 11);                                        // 극소기: 10° 이내
  assert.equal(M.latitudeBand([new Uint8Array(50)]), null);
});

test('파장과 층: 그림 5의 이름표, 홍염은 코로나보다 훨씬 차갑다', () => {
  assert.deepEqual(M.WAVELENGTHS.map(w => `${w.band}(${w.nm} nm) ${w.shows}`), [
    '가시광선(617.3 nm) 광구, 흑점', '자외선(30.4 nm) 채층, 플레어', '자외선(19.3 nm) 코로나, 플레어', 'X선(9.4 nm) 고에너지 영역']);
  const L = Object.fromEntries(M.LAYERS.map(l => [l.id, l]));
  assert.ok(L.prom.T[1] < L.corona.T[0] && L.prom.T[1] < L.flare.T[0]);
  assert.ok(L.prom.T[0] < L.photo.T[1] + 1000 && L.prom.T[1] > L.chromo.T[0]);
  assert.ok(L.spot.T[1] < L.photo.T[0]);
  // 짧은 파장일수록 더 뜨거운 층을 보여 준다
  const order = M.WAVELENGTHS.map(w => Math.max(...M.LAYERS.filter(l => l.wl === w.id).map(l => l.T[1])));
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1]);
  assert.equal(M.BOOK.chromosphereKm, 10000);
});

test('쌀알 무늬의 일생과 활동 정도', () => {
  assert.equal(M.granuleVigor(0), 0); assert.equal(M.granuleVigor(1), 0);
  close(M.granuleVigor(0.5), 1);
  assert.ok(M.granuleVigor(0.1) > 0 && M.granuleVigor(0.9) > 0);
  close(M.activity(0), 0); close(M.activity(400), 1);
  assert.ok(M.activity(160) > M.activity(20));
  const r1 = M.rng(3), r2 = M.rng(3);
  assert.equal(r1(), r2());
});
