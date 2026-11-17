const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../physics/III1/09/III1-09-model.js');
const rel = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.abs(b), `${a} ≠ ${b}`);

test('III1-09 예제(개념 체크): 바르게 짝지은 것은 ② 공항 수하물 검색 – X선', () => {
  const choices = [['전자레인지', 'ir'], ['공항 수하물 검색', 'xray'], ['열화상 카메라', 'uv'], ['살균 소독기', 'mw'], ['라디오 방송', 'gamma']];
  assert.deepEqual(M.correctChoices(choices), [1]);
  assert.equal(M.checkPair('공항 수하물 검색', 'xray'), true);
  assert.equal(M.checkPair('전자레인지', 'ir'), false);
  assert.equal(M.checkPair('라디오 방송', 'gamma'), false);
});

test('III1-09 용도 → 영역 분류 (와이파이·블루투스는 EBS 기준 마이크로파, 초음파는 전자기파 아님)', () => {
  const want = {
    '암 치료': 'gamma', '공항 수하물 검색': 'xray', '뼈 사진·CT': 'xray', '살균 소독기': 'uv', '위조지폐 감별': 'uv',
    '조명·광학 기기': 'vis', '열화상 카메라': 'ir', '적외선 체온계': 'ir', '리모컨': 'ir', '전자레인지': 'mw',
    '와이파이·블루투스': 'mw', '레이더': 'mw', '라디오·TV 방송': 'radio', '라디오 방송': 'radio', '초음파 검사': 'none',
  };
  for (const [use, id] of Object.entries(want)) assert.equal(M.regionOf(use), id, use);
  // 각 영역의 대표 이용이 그 영역으로 분류된다
  for (const u of M.USES) if (u.region !== 'none') assert.ok(M.byId(u.region), u.use);
  assert.ok(M.isRadioWave('mw') && M.isRadioWave('radio') && !M.isRadioWave('ir'));
});

test('III1-09 진동수 순서는 감마 > X > 자외 > 가시 > 적외 > 마이크로 > 라디오, 파장은 역순', () => {
  assert.deepEqual(M.orderByFrequency(['radio', 'ir', 'gamma', 'mw', 'vis', 'uv', 'xray']), ['gamma', 'xray', 'uv', 'vis', 'ir', 'mw', 'radio']);
  const f = M.REGIONS.map((r) => M.freq(r.rep));
  for (let i = 1; i < f.length; i++) assert.ok(f[i] < f[i - 1]);
  for (const r of M.REGIONS) assert.ok(r.rep >= r.lam[0] && r.rep < r.lam[1], r.name);
  // 광자 에너지도 같은 순서 (감마선이 가장 크다)
  assert.ok(M.photonEnergy(M.byId('gamma').rep) > M.photonEnergy(M.byId('uv').rep));
  assert.ok(M.photonEnergy(M.byId('uv').rep) > M.photonEnergy(M.byId('ir').rep));
});

test('III1-09 성질 → 용도: 투과, 집중, 살균, 형광, 열, 전자레인지, 레이더, 회절', () => {
  // X선: 금속·뼈는 많이 흡수(적게 통과), 옷·살은 잘 통과
  assert.ok(M.transmit('metal', 1) < M.transmit('bone', 1) && M.transmit('bone', 1) < M.transmit('tissue', 1));
  assert.ok(M.transmit('cloth', 3) > 0.7 && M.transmit('metal', 0.5) < 0.1);
  // 감마선 빔 7개가 모이는 곳은 7배
  assert.equal(M.focusDoseRatio(7), 7);
  // 자외선을 오래 쪼일수록 살아남는 세균이 줄어든다
  assert.ok(M.survival(2) < M.survival(1) && M.survival(0) === 1);
  // 형광: 자외선을 흡수하고 더 긴 파장(가시광선)을 낸다
  const fl = M.fluorescence(365);
  assert.ok(fl.emit > fl.absorb && fl.emit >= 400 && fl.emit <= 700);
  // 온도가 높을수록 적외선을 많이 낸다
  assert.ok(M.irPower(80) > M.irPower(36) && M.irPower(36) > M.irPower(0));
  // 전자레인지 2.45 GHz → 파장 약 12 cm
  rel(M.wavelength(M.OVEN_F), 0.12244897959183673);
  assert.equal(M.byId('mw').lam[0] < M.wavelength(M.OVEN_F) && M.wavelength(M.OVEN_F) < M.byId('mw').lam[1], true);
  // 물 분자는 전기장을 따라 돈다: 전기장이 최대일 때 최대 각
  rel(M.dipoleAngle(Math.PI / 2, 1.1), 1.1);
  // 레이더: 2 × 10⁻⁴ s 만에 되돌아오면 30 km
  rel(M.radarDistance(2e-4), 3e4);
  // 회절: 파장이 긴 라디오파(300 m)는 산(1 km) 뒤로 잘 퍼지고, 빛은 거의 퍼지지 않는다
  assert.ok(M.spread(300, 1000) > 0.25 && M.spread(5e-7, 1000) < 1e-8);
  // 초음파는 진공에서 전달되지 않는다
  assert.equal(M.ultrasoundSpeed('vacuum'), 0);
});
