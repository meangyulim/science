/* 폰 육분의: 카메라로 천체를 겨누고 기울기 센서로 고도를 잰 뒤,
   고도가 같은 원(위치선)들이 만나는 곳으로 내 위치를 찾는다. 계산은 phone-sextant-model.js. */
(function () {
  'use strict';
  const M = window.SextantModel;
  const $ = id => document.getElementById(id);
  const STORE = 'phone-sextant-v1';
  const COLORS = ['#e8590c', '#0b7f9a', '#7048e8', '#2b8a3e', '#d6336c', '#1971c2', '#f08c00', '#495057'];
  const ICON = {sun: '☀️', moon: '🌙', star: '⭐'};
  const AP_PRESETS = [
    {id: 'kr', name: '대한민국 가운데', lat: 36.5, lon: 127.8},
    {id: 'seoul', name: '서울 부근', lat: 37.55, lon: 126.99},
    {id: 'busan', name: '부산 부근', lat: 35.18, lon: 129.08},
    {id: 'jeju', name: '제주 부근', lat: 33.4, lon: 126.55},
    {id: 'tokyo', name: '일본 도쿄 부근', lat: 35.68, lon: 139.7},
    {id: 'beijing', name: '중국 베이징 부근', lat: 39.9, lon: 116.4}
  ];
  // 결과를 ‘○○에서 남동쪽으로 40 km’처럼 읽어 주는 데 쓰는 곳들. practice: 연습 문제 정답 후보.
  const PLACES = [
    ['서울', 37.5665, 126.978, 1], ['인천', 37.4563, 126.7052], ['수원', 37.2636, 127.0286], ['춘천', 37.8813, 127.7298],
    ['강릉', 37.7519, 128.8761, 1], ['원주', 37.3422, 127.9202], ['청주', 36.6424, 127.489], ['대전', 36.3504, 127.3845, 1],
    ['천안', 36.8151, 127.1139], ['전주', 35.8242, 127.148], ['광주', 35.1595, 126.8526, 1], ['목포', 34.8118, 126.3922, 1],
    ['여수', 34.7604, 127.6622], ['대구', 35.8714, 128.6014, 1], ['포항', 36.019, 129.3435], ['울산', 35.5384, 129.3114],
    ['부산', 35.1796, 129.0756, 1], ['창원', 35.2281, 128.6811], ['안동', 36.5684, 128.7294], ['제주', 33.4996, 126.5312, 1],
    ['서귀포', 33.2541, 126.56], ['울릉도', 37.4844, 130.9057, 1], ['독도', 37.2417, 131.8647, 1], ['백령도', 37.9667, 124.6667, 1],
    ['평양', 39.0392, 125.7625], ['신의주', 40.1006, 124.3981], ['원산', 39.1528, 127.4436], ['청진', 41.7956, 129.7758],
    ['후쿠오카', 33.5904, 130.4017], ['오사카', 34.6937, 135.5023], ['도쿄', 35.6762, 139.6503], ['상하이', 31.2304, 121.4737],
    ['베이징', 39.9042, 116.4074], ['칭다오', 36.0671, 120.3826], ['다롄', 38.914, 121.6147], ['블라디보스토크', 43.1155, 131.8855],
    ['타이베이', 25.033, 121.5654]
  ].map(([name, lat, lon, practice]) => ({name, lat, lon, practice: !!practice}));

  // ── 저장 ────────────────────────────────────────────────
  const state = Object.assign({sights: [], ie: 0, ap: 'kr', body: 'sun', aim: 'camera', practice: null, truth: null}, load());
  function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({sights: state.sights, ie: state.ie, ap: state.ap, body: state.body, aim: state.aim, practice: state.practice})); } catch (e) { /* 사생활 보호 모드 등 */ }
  }
  const ap = () => AP_PRESETS.find(p => p.id === state.ap) || AP_PRESETS[0];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
  const fmt = (v, d = 2) => (v >= 0 ? '' : '−') + Math.abs(v).toFixed(d);
  const signed = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const bodyLabel = id => { const b = M.bodyInfo(id); return `${ICON[b.kind]} ${b.name}`; };

  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.innerHTML = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms || 3200);
  }
  let audio = null;
  function beep(freq, dur, vol) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; g.gain.value = vol === undefined ? 0.15 : vol;
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (dur || 0.15));
    } catch (e) { /* 소리 없이 진행 */ }
  }
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* 진동 없음 */ } };

  // ── 기울기 센서 ──────────────────────────────────────────
  // 최근 4초의 값을 모아 둔다. 측정 버튼을 누르기 직전 1초를 평균한다(누르는 순간의 흔들림은 뺀다).
  const buf = [];
  let sensor = 'off';                     // off | waiting | live | denied | none
  function onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    const t = performance.now();
    buf.push({t, cam: M.cameraElevation(e.beta, e.gamma), edge: M.edgeElevation(e.beta)});
    while (buf.length && buf[0].t < t - 4000) buf.shift();
    if (sensor !== 'live') { sensor = 'live'; updateReadout(); }
  }
  // 값이 하나라도 들어오면 live. 권한 거부는 값이 끝내 안 들어올 때만 알린다.
  function requestOrientation() {
    const D = window.DeviceOrientationEvent;
    if (!D) { sensor = 'none'; return Promise.resolve(); }
    window.addEventListener('deviceorientation', onOrient);
    if (sensor !== 'live') sensor = 'waiting';
    let denied = false;
    setTimeout(() => { if (sensor === 'waiting') { sensor = denied ? 'denied' : 'none'; updateReadout(); } }, 2500);
    if (typeof D.requestPermission === 'function') {          // iOS: 버튼을 누른 그 순간에 물어야 한다
      return D.requestPermission().then(r => { denied = r !== 'granted'; }).catch(() => { denied = true; });
    }
    return Promise.resolve();
  }
  const key = () => (state.aim === 'edge' ? 'edge' : 'cam');
  const ieNow = () => (state.aim === 'edge' ? 0 : state.ie);
  function samples(from, to) { return buf.filter(s => s.t >= from && s.t <= to); }

  // ── 카메라 ──────────────────────────────────────────────
  const cam = $('cam');
  let stream = null, camBusy = false, started = false;
  function camOff(text) { $('cam-off-text').textContent = text; $('cam-off').hidden = false; }
  function wantCamera() { return started && state.aim === 'camera' && document.body.dataset.tab === 'observe' && !document.hidden; }
  async function startCamera() {
    if (stream || camBusy || !wantCamera()) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camOff('이 브라우저에서는 카메라를 쓸 수 없어요. 「윗모서리」로 겨누거나, 주소를 사파리·크롬에서 열어 보세요.');
      return;
    }
    camBusy = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}});
      if (!wantCamera()) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s; cam.srcObject = s;
      $('cam-off').hidden = true;
      cam.play().catch(() => {});
      tuneExposure();
    } catch (e) {
      camOff(e && e.name === 'NotAllowedError'
        ? '카메라 권한이 꺼져 있어요. 브라우저 설정에서 카메라를 허용해 주세요. 카메라 없이 「윗모서리」로 겨눌 수도 있어요.'
        : '카메라를 켜지 못했어요. 다른 앱이 카메라를 쓰고 있지 않은지 확인해 주세요.');
    } finally { camBusy = false; }
  }
  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; cam.srcObject = null; }
  }
  // 태양을 겨눌 땐 노출을 낮춰 하얗게 번지는 것을 줄인다(지원하는 폰만).
  function tuneExposure() {
    const track = stream && stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    const ec = track.getCapabilities().exposureCompensation;
    if (!ec) return;
    const v = state.body === 'sun' ? ec.min : Math.min(Math.max(0, ec.min), ec.max);
    track.applyConstraints({advanced: [{exposureCompensation: v}]}).catch(() => {});
  }
  function syncCamera() { if (wantCamera()) startCamera(); else stopCamera(); }

  let wakeLock = null;
  async function keepAwake() {
    try { if (navigator.wakeLock && !wakeLock && document.body.dataset.tab === 'observe') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { /* 지원 안 함 */ }
  }

  async function startAll() {
    $('start').hidden = true;
    started = true;
    const p = requestOrientation();                // iOS 권한 창은 같은 터치 안에서 열어야 하므로 먼저 부른다
    startCamera();
    keepAwake();
    beep(440, 0.01, 0);                             // 소리 장치를 터치로 깨워 둔다(보정 때 삐 소리)
    await p;
    updateReadout();
    setTimeout(() => {
      if (sensor === 'denied') toast('기울기 센서 권한이 거부됐어요. 앱을 닫았다가 다시 열고 「허용」을 눌러 주세요. (아이폰: 설정 → Safari → 동작 및 방향 접근)', 7000);
    }, 2700);
  }

  // ── 천체 고르기 ──────────────────────────────────────────
  function skyNow() {
    const now = Date.now(), p = ap();
    const sunPos = M.bodyAt('sun', now), sunH = M.altAz(sunPos.gha, sunPos.dec, p.lat, p.lon).h;
    return M.BODIES.map(b => {
      const pos = M.bodyAt(b.id, now), aa = M.altAz(pos.gha, pos.dec, p.lat, p.lon);
      const up = aa.h > (b.kind === 'star' ? 5 : 1);
      const dark = b.kind !== 'star' || sunH < -6 || (b.mag < 0 && sunH < -3);
      return {b, h: aa.h, az: aa.az, up, seen: up && dark};
    });
  }
  function bodyOrder() {
    const sky = skyNow(), rank = s => (s.b.kind !== 'star' ? 0 : s.seen ? 1 : 2);
    return sky.sort((x, y) => rank(x) - rank(y) || (x.b.kind === 'moon') - (y.b.kind === 'moon') || (x.b.mag || 0) - (y.b.mag || 0));
  }
  function buildBodies() {
    const box = $('bodies');
    box.innerHTML = '';
    for (const s of bodyOrder()) {
      const btn = document.createElement('button');
      btn.className = 'chip'; btn.dataset.body = s.b.id;
      btn.setAttribute('role', 'radio');
      btn.innerHTML = `<b>${ICON[s.b.kind]} ${esc(s.b.name)}</b><small></small>`;
      btn.onclick = () => selectBody(s.b.id);
      box.appendChild(btn);
    }
    refreshBodies();
  }
  function refreshBodies() {
    const sky = skyNow();
    for (const s of sky) {
      const btn = document.querySelector(`.chip[data-body="${s.b.id}"]`);
      if (!btn) continue;
      btn.setAttribute('aria-checked', String(s.b.id === state.body));
      btn.classList.toggle('below', !s.seen);
      btn.querySelector('small').textContent = s.seen ? `${M.compassName(s.az)} · ${Math.round(s.h)}°` : s.up ? '밝아서 안 보임' : '지평선 아래';
    }
    const s = sky.find(x => x.b.id === state.body);
    $('hint').textContent = !s ? '' : s.up
      ? `${bodyLabel(s.b.id)} — ${M.compassName(s.az)}쪽 하늘, 고도 약 ${Math.round(s.h)}°${s.seen ? '' : ' (지금은 밝아서 안 보일 거예요)'}`
      : `${bodyLabel(s.b.id)}은(는) 지금 지평선 아래에 있어요`;
  }
  function selectBody(id) {
    state.body = id;
    if (id === 'sun' && state.aim === 'edge') setAim('camera', true);
    $('sun-warn').hidden = id !== 'sun';
    save(); refreshBodies(); tuneExposure();
    const chip = document.querySelector(`.chip[data-body="${id}"]`);
    if (chip && chip.scrollIntoView) chip.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }
  function setAim(a, quiet) {
    if (a === 'edge' && state.body === 'sun') { toast('⚠️ 태양은 맨눈으로 겨누면 안 돼요. 카메라 화면으로만 재세요.'); return; }
    state.aim = a;
    document.body.dataset.aim = a;
    for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-checked', String(b.dataset.aim === a));
    $('readout-label').textContent = a === 'edge' ? '윗모서리가 향한 고도' : '카메라 중심의 고도';
    save(); syncCamera(); updateReadout();
    if (!quiet && a === 'edge') toast('밤하늘 모드: 화면을 어둡고 붉게 바꿨어요. 눈이 어둠에 익숙해지도록.');
  }

  // ── 실시간 고도 표시 ─────────────────────────────────────
  function updateReadout() {
    const alt = $('alt'), st = $('steady');
    if (sensor !== 'live') {
      alt.textContent = '--.--°';
      st.dataset.level = '0';
      st.textContent = {off: '센서 꺼짐 — 측정을 누르면 켜져요', waiting: '센서 기다리는 중…', denied: '센서 권한 거부됨', none: '기울기 센서를 찾지 못했어요 (컴퓨터?)'}[sensor] || '';
      return;
    }
    const now = performance.now(), k = key();
    const recent = samples(now - 250, now);
    if (!recent.length) { st.textContent = '센서 값이 멈췄어요'; st.dataset.level = '3'; return; }
    alt.textContent = fmt(mean(recent.map(s => s[k])) - ieNow()) + '°';
    const sd = std(samples(now - 1000, now).map(s => s[k]));
    const level = sd < 0.12 ? 1 : sd < 0.35 ? 2 : 3;
    st.dataset.level = String(level);
    st.textContent = (level === 1 ? '안정 ' : level === 2 ? '조금 흔들림 ' : '흔들림 ') + '±' + sd.toFixed(2) + '°';
  }

  function tickClock() {
    const d = new Date();
    const local = d.toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
    const utc = d.toISOString().slice(11, 16);
    $('clock').textContent = `${local} · UTC ${utc}`;
  }

  // ── 측정 ────────────────────────────────────────────────
  function leavePractice() {
    if (!state.practice) return true;
    if (!confirm('지금 기록은 연습 문제예요. 지우고 진짜 관측을 시작할까요?')) return false;
    state.practice = null; state.sights = []; state.truth = null;
    return true;
  }
  function shoot() {
    if (!started) { startAll(); return; }
    if (sensor !== 'live') { toast(sensor === 'waiting' ? '센서를 켜는 중이에요. 잠깐만요.' : '기울기 센서가 없어요. 「위치」 탭에서 직접 입력하거나 연습 문제를 해 보세요.', 4500); return; }
    const now = performance.now(), k = key();
    const win = samples(now - 1300, now - 150);
    if (win.length < 4) { toast('센서 값이 모자라요. 1초쯤 가만히 겨눈 뒤 다시 눌러 주세요.'); return; }
    if (!leavePractice()) return;
    const vals = win.map(s => s[k]), hs = mean(vals), sd = std(vals);
    const t = Math.round(Date.now() - (now - (win[0].t + win[win.length - 1].t) / 2));
    const sight = {id: uid(), body: state.body, t, hs: +hs.toFixed(3), ie: ieNow(), sd: +sd.toFixed(3), aim: state.aim};
    state.sights.push(sight);
    save(); updateCount();
    const fl = $('flash'); fl.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => fl.classList.remove('on')));
    buzz(40); beep(1320, 0.06);
    let msg = `${bodyLabel(sight.body)} 고도 <b>${fmt(hs - sight.ie)}°</b> 기록 (${state.sights.length}번째)`;
    if (sd > 0.35) msg += '<br>손이 흔들렸어요(±' + sd.toFixed(2) + '°). 한 번 더 재 보세요.';
    const exp = skyNow().find(x => x.b.id === sight.body), off = exp && Math.abs(exp.h - (hs - sight.ie)) > 12;
    if (off) msg += `<br>⚠️ 이 시각 ${M.bodyInfo(sight.body).name}의 고도는 대략 ${Math.round(exp.h)}°예요. 천체를 맞게 골랐나요?`;
    toast(msg, sd > 0.35 || off ? 5500 : 3000);
  }
  function updateCount() { $('count').textContent = state.sights.length; }

  // ── 계산 ────────────────────────────────────────────────
  function reduce(s, i) {
    const pos = M.bodyAt(s.body, s.t), o = M.observedAltitude(s.hs, s.ie || 0, pos.hp);
    return {s, i, color: COLORS[i % COLORS.length], pos, o, gha: pos.gha, dec: pos.dec, ho: o.ho, gp: M.groundPoint(pos), use: o.ho > 0 && o.ho < 89.9};
  }
  function describePlace(p) {
    let best = null;
    for (const c of PLACES) { const d = M.distanceKm(c, p); if (!best || d < best.d) best = {c, d}; }
    if (!best || best.d > 700) return '';
    if (best.d < 12) return `${best.c.name} 부근`;
    return `${best.c.name}에서 ${M.compassName(M.bearing(best.c, p))}쪽으로 약 ${Math.round(best.d)} km`;
  }
  let last = {R: [], fix: {kind: 'none'}, errKm: 0};
  function compute() {
    const R = state.sights.map(reduce), used = R.filter(r => r.use);
    const fix = M.solveFix(used.map(r => ({gha: r.gha, dec: r.dec, ho: r.ho})), ap());
    let errKm = 0;
    if (fix.kind === 'fix') {
      const n = used.length;
      const sigma = Math.max(0.25, n > 2 ? fix.rms * Math.sqrt(n / (n - 2)) : 0);
      errKm = sigma * fix.gdop * M.KM_PER_DEG;
      used.forEach((r, j) => { r.res = fix.residuals[j]; });
    } else if (fix.kind === 'latitude') {
      const r = used[0]; r.res = r.ho - M.altAz(r.gha, r.dec, fix.lat, fix.lon).h;
      errKm = 0.25 * M.KM_PER_DEG;
    }
    last = {R, fix, errKm};
    return last;
  }

  function renderFix(fit) {
    const {R, fix, errKm} = compute();
    const el = $('result');
    const extra = `<div class="row-actions">
        <button id="gps-check">📡 GPS 실제 위치와 비교</button>
        ${state.practice ? '<button id="reveal">🎲 정답 공개</button>' : ''}
      </div><div class="compare" id="compare" hidden></div>`;
    if (fix.kind === 'fix') {
      const where = describePlace(fix);
      el.innerHTML = `<h2>내 위치 · 위치선 ${R.filter(r => r.use).length}개</h2>
        <div class="big-pos num">${M.formatLat(fix.lat)}<br>${M.formatLon(fix.lon)}</div>
        ${where ? `<p><b>${esc(where)}</b></p>` : ''}
        <p class="note">예상 오차 약 ±${Math.round(errKm)} km · 위치선이 만나는 각 ${Math.round(fix.crossing)}°</p>
        ${fix.crossing < 30 ? '<p class="warn-line">위치선이 거의 나란해서 오차가 커요. 방향이 많이 다른 천체를 하나 더 재 보세요.</p>' : ''}
        ${extra}`;
    } else if (fix.kind === 'latitude') {
      el.innerHTML = `<h2>북극성으로 구한 위도</h2>
        <div class="big-pos num">${M.formatLat(fix.lat)}</div>
        <p class="note">북극성의 고도 ≈ 위도. 북극성 바로 아래(GP)는 북극점 근처라 위치선이 위도선과 거의 같아요. 경도는 다른 천체를 하나 더 재면 알 수 있어요.</p>
        ${extra}`;
    } else if (fix.kind === 'line') {
      el.innerHTML = `<h2>위치선 ${R.filter(r => r.use).length}개</h2>
        <p>지도 위의 원 어딘가에 내가 있어요. ${fix.reason === 'parallel' ? '위치선들이 나란해서 한 점으로 모이지 않아요.' : ''}</p>
        <p class="note">방향이 다른 천체를 하나 더 재세요. 해만 보인다면 1~2시간 뒤에 해를 한 번 더 재면 돼요.</p>`;
    } else {
      el.innerHTML = `<h2>아직 기록이 없어요</h2>
        <p>「관측」 탭에서 천체를 화면 가운데에 맞추고 <b>측정</b>을 누르세요.</p>
        <p class="note">밖에 나가기 어렵다면 <b>🎲 연습 문제</b>로 먼저 해 보세요. 숨겨진 도시에서 잰 고도가 주어져요.</p>`;
    }
    const gps = $('gps-check'); if (gps) gps.onclick = checkGps;
    const rv = $('reveal'); if (rv) rv.onclick = reveal;
    renderSights(R);
    drawMap(fit);
    if (state.truth) showCompare(state.truth);
  }

  function renderSights(R) {
    const ol = $('sights');
    $('sight-note').textContent = state.practice ? '🎲 연습 문제 — 어느 도시에서 쟀을까요?' : state.sights.length ? '고친 값으로 바로 다시 계산해요' : '';
    if (!R.length) { ol.innerHTML = '<li class="empty">기록이 없어요.</li>'; return; }
    const today = new Date().toDateString();
    ol.innerHTML = R.map(r => {
      const d = new Date(r.s.t);
      const time = (d.toDateString() === today ? '' : d.toLocaleDateString('ko-KR', {month: 'numeric', day: 'numeric'}) + ' ') +
        d.toLocaleTimeString('ko-KR', {hour: 'numeric', minute: '2-digit', second: '2-digit'});
      const how = r.s.aim === 'practice' ? '연습' : r.s.aim === 'manual' ? '직접 입력' : r.s.aim === 'edge' ? '윗모서리' : '카메라';
      const res = r.res === undefined ? (r.use ? '' : ' · <span class="res" style="color:var(--bad)">계산에서 뺌</span>')
        : ` · <span class="res" style="color:${Math.abs(r.res) < 0.25 ? 'var(--good)' : Math.abs(r.res) < 0.75 ? 'var(--warn)' : 'var(--bad)'}">잔차 ${signed(Math.round(r.res * 60), 0)}′</span>`;
      return `<li class="sight">
        <span class="sw" style="background:${r.color}"></span>
        <div class="what"><b>${bodyLabel(r.s.body)}</b> <small>${time} · ${how}${r.s.sd > 0.35 ? ' · 흔들림' : ''}</small>
          <div class="vals num">Hs ${fmt(r.s.hs)}° → Ho ${fmt(r.ho)}°${res}</div></div>
        <div class="btns"><button data-edit="${r.s.id}" aria-label="고치기">✎</button><button data-del="${r.s.id}" aria-label="지우기">✕</button></div>
      </li>`;
    }).join('');
    for (const b of ol.querySelectorAll('[data-edit]')) b.onclick = () => openSightDialog(b.dataset.edit);
    for (const b of ol.querySelectorAll('[data-del]')) b.onclick = () => {
      state.sights = state.sights.filter(s => s.id !== b.dataset.del);
      if (!state.sights.length) state.practice = null;
      save(); updateCount(); renderFix(true);
    };
  }

  // ── 지도 ────────────────────────────────────────────────
  let map = null, layer = null, allBounds = null;
  function ensureMap() {
    if (map) return map;
    if (typeof L === 'undefined') { $('map-off').hidden = false; return null; }
    map = L.map('map', {zoomControl: true, minZoom: 1, maxZoom: 12, worldCopyJump: false}).setView([ap().lat, ap().lon], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 12, attribution: '&copy; OpenStreetMap'}).addTo(map);
    layer = L.layerGroup().addTo(map);
    return map;
  }
  function near(lon, ref) { return lon + Math.round((ref - lon) / 360) * 360; }
  function drawMap(fit) {
    if (!ensureMap()) return;
    layer.clearLayers();
    const {R, fix, errKm} = last, p = ap();
    const ref = fix.lon !== undefined ? fix.lon : p.lon;
    allBounds = L.latLngBounds([[p.lat, p.lon]]);
    for (const r of R) {
      if (!r.use) continue;
      const pts = M.circlePoints(r.gp, 90 - r.ho, 360, ref);
      const line = L.polyline(pts, {color: r.color, weight: 3, opacity: 0.9}).addTo(layer);
      line.bindTooltip(`${bodyLabel(r.s.body)} 위치선 · Ho ${fmt(r.ho)}°`, {sticky: true});
      allBounds.extend(line.getBounds());
      const gp = [r.gp.lat, near(r.gp.lon, ref)];
      L.circleMarker(gp, {radius: 7, color: '#fff', weight: 2, fillColor: r.color, fillOpacity: 1}).addTo(layer)
        .bindTooltip(`${bodyLabel(r.s.body)} 바로 아래 (GP)`, {className: 'gp-tip'});
    }
    L.circleMarker([p.lat, near(p.lon, ref)], {radius: 5, color: '#5f7282', weight: 2, fillColor: '#fff', fillOpacity: 1}).addTo(layer)
      .bindTooltip('추정 위치 (출발점)');
    if (fix.kind === 'fix' || fix.kind === 'latitude') {
      if (fix.kind === 'fix') L.circle([fix.lat, fix.lon], {radius: errKm * 1000, color: '#b42318', weight: 1.5, fillOpacity: 0.08, dashArray: '5 5'}).addTo(layer);
      const icon = L.divIcon({className: 'fix-icon', html: '<svg viewBox="-15 -15 30 30"><circle r="9" fill="none" stroke="#fff" stroke-width="5"/><circle r="9" fill="none" stroke="#b42318" stroke-width="2.5"/><path d="M-15 0H-5M5 0H15M0 -15V-5M0 5V15" stroke="#b42318" stroke-width="2.5"/></svg>'});
      L.marker([fix.lat, fix.lon], {icon}).addTo(layer).bindTooltip(fix.kind === 'fix' ? '육분의로 찾은 내 위치' : '위도 (경도는 모름)');
    }
    if (state.truth) {
      const t = state.truth;
      L.circleMarker([t.lat, t.lon], {radius: 8, color: '#fff', weight: 2, fillColor: t.kind === 'gps' ? '#1971c2' : '#e6a93c', fillOpacity: 1}).addTo(layer)
        .bindTooltip(t.kind === 'gps' ? 'GPS가 알려 준 실제 위치' : `정답: ${t.name}`, {permanent: true, direction: 'right'});
      if (fix.kind === 'fix') L.polyline([[t.lat, t.lon], [fix.lat, fix.lon]], {color: '#14283a', weight: 2, dashArray: '4 6'}).addTo(layer);
    }
    if (fit) viewFix();
  }
  function viewFix() {
    if (!map) return;
    const {fix, errKm} = last;
    if (fix.kind === 'fix' || fix.kind === 'latitude') {
      let b = L.latLng(fix.lat, fix.lon).toBounds(Math.max(errKm * 2.6, 200) * 1000);
      if (state.truth) b = b.extend([state.truth.lat, state.truth.lon]);
      map.fitBounds(b, {maxZoom: 9, padding: [20, 20]});
    } else if (last.R.length) map.setView([ap().lat, ap().lon], 3);
    else map.setView([ap().lat, ap().lon], 5);
  }
  function viewAll() { if (map && allBounds) map.fitBounds(allBounds, {padding: [20, 20]}); }

  // ── 실제 위치와 비교 ─────────────────────────────────────
  function showCompare(t) {
    const box = $('compare'), fix = last.fix;
    if (!box || (fix.kind !== 'fix' && fix.kind !== 'latitude')) return;
    const who = t.kind === 'gps' ? 'GPS가 알려 준 실제 위치와' : `정답은 <b>${esc(t.name)}</b>! 찾은 위치와`;
    if (fix.kind === 'latitude') {
      const dlat = fix.lat - t.lat;
      box.innerHTML = `${who} 위도가 <b>${signed(Math.round(dlat * 60), 0)}′</b> 달라요 (남북으로 약 ${Math.round(Math.abs(dlat) * M.KM_PER_DEG)} km)`;
    } else {
      const d = M.distanceKm(t, fix);
      box.innerHTML = `${who} <b>${Math.round(d)} km</b> 차이` +
        (d > 5 ? ` (찾은 위치가 ${M.compassName(M.bearing(t, fix))}쪽으로 어긋남)` : '') +
        `<br><span class="micro">고도 1° 오차 ≈ 111 km. ${d < last.errKm ? '예상 오차 안에 들어왔어요 👍' : '예상 오차보다 커요. 기기 오차 보정을 하거나, 천체를 다시 재 보세요.'}</span>`;
    }
    box.hidden = false;
  }
  function checkGps() {
    if (!navigator.geolocation) { toast('이 기기에서는 GPS를 쓸 수 없어요.'); return; }
    toast('GPS 위치를 받는 중…', 8000);
    navigator.geolocation.getCurrentPosition(pos => {
      state.truth = {kind: 'gps', lat: pos.coords.latitude, lon: pos.coords.longitude};
      $('toast').classList.remove('on');
      drawMap(true); showCompare(state.truth);
    }, err => {
      toast(err.code === 1 ? '위치 권한이 거부됐어요.' : 'GPS 위치를 받지 못했어요. 밖에서 다시 해 보세요.');
    }, {enableHighAccuracy: true, timeout: 20000, maximumAge: 60000});
  }
  function reveal() {
    if (!state.practice) return;
    state.truth = Object.assign({kind: 'practice'}, state.practice);
    $('toast').classList.remove('on');
    drawMap(true); showCompare(state.truth);
  }

  // ── 연습 문제: 숨겨진 도시에서 잰 고도 만들기 ─────────────
  function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function makePractice() {
    const pool = PLACES.filter(p => p.practice), city = pool[Math.floor(Math.random() * pool.length)];
    const now = Math.floor(Date.now() / 1000) * 1000;
    const cands = [];
    for (let k = 0; k <= 12; k++) {                // 지금부터 8시간 전까지 40분 간격
      const t = now - k * 40 * 60000;
      const sp = M.bodyAt('sun', t), sunH = M.altAz(sp.gha, sp.dec, city.lat, city.lon).h;
      for (const b of M.BODIES) {
        const pos = M.bodyAt(b.id, t), aa = M.altAz(pos.gha, pos.dec, city.lat, city.lon);
        const ok = b.kind === 'star' ? sunH < -10 && aa.h > 20 && aa.h < 70 : aa.h > 12 && aa.h < 75;
        if (ok) cands.push({id: b.id, t, k, h: aa.h, az: aa.az, hp: pos.hp, star: b.kind === 'star', mag: b.mag || -5});
      }
    }
    const cross = (a, b) => { const d = Math.abs(M.norm180(a.az - b.az)); return Math.min(d, 180 - d); };
    let pick = [];
    for (const W of [0, 2, 3, 5, 8, 12]) {          // 되도록 최근 관측으로, 위치선이 크게 엇갈리게
      const c = cands.filter(x => x.k <= W && !(x.star && x.mag > 1.3));
      if (c.length < 2) continue;
      pick = [c.slice().sort((a, b) => a.k - b.k || a.mag - b.mag)[0]];
      while (pick.length < 3) {
        let best = null, score = -1;
        for (const x of c) {
          if (pick.some(p => p.id === x.id && p.k === x.k)) continue;
          const s = Math.min(...pick.map(p => cross(p, x)));
          if (s > score) { score = s; best = x; }
        }
        if (!best || score < 15) break;
        pick.push(best);
      }
      if (pick.length >= 2 && M.bestCrossingAngle(pick.map(p => p.az)) >= 40) break;
    }
    if (pick.length < 2) return null;
    return {city, sights: pick.sort((a, b) => a.t - b.t).map(p => ({
      id: uid(), body: p.id, t: p.t, ie: 0, sd: 0, aim: 'practice',
      hs: +M.apparentFromTrue(p.h + gauss() * 0.2, p.hp).toFixed(2)
    }))};
  }
  function loadPractice() {
    if (state.sights.length && !state.practice && !confirm('지금까지 잰 기록을 지우고 연습 문제를 불러올까요?')) return;
    const pr = makePractice();
    if (!pr) { toast('연습 문제를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.'); return; }
    state.sights = pr.sights;
    state.practice = {name: pr.city.name, lat: pr.city.lat, lon: pr.city.lon};
    state.truth = null;
    save(); updateCount(); renderFix(true);
    toast('🎲 어느 도시에서 잰 고도일까요? 위치를 확인하고 「정답 공개」를 눌러 보세요.', 4500);
  }

  // ── 직접 입력 / 고치기 ───────────────────────────────────
  let editing = null;
  const pad = n => String(n).padStart(2, '0');
  function localInput(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function openSightDialog(id) {
    editing = id ? state.sights.find(s => s.id === id) : null;
    $('sight-dlg-title').textContent = editing ? '관측 고치기' : '관측 직접 입력';
    $('f-body').value = editing ? editing.body : state.body;
    $('f-time').value = localInput(editing ? editing.t : Date.now());
    $('f-hs').value = editing ? editing.hs : '';
    $('sight-dlg').showModal();
  }
  function saveSightDialog() {
    const t = new Date($('f-time').value).getTime(), hs = parseFloat($('f-hs').value);
    if (!isFinite(t) || !isFinite(hs)) return;
    if (editing) Object.assign(editing, {body: $('f-body').value, t, hs});
    else {
      if (!leavePractice()) return;
      state.sights.push({id: uid(), body: $('f-body').value, t, hs, ie: 0, sd: 0, aim: 'manual'});
    }
    save(); updateCount(); renderFix(true);
  }

  // ── 기기 오차 보정 ───────────────────────────────────────
  // 벽에 뒷면을 대고 한 번(카메라가 벽 쪽), 화면을 대고 한 번(카메라가 반대쪽) 잰다.
  // 벽이 θ 만큼 기울어 있으면 두 값은 θ+e, −θ+e 가 되므로 평균하면 벽의 기울기는 지워지고 센서 오차 e 만 남는다.
  let calib = null;
  function renderCalib() {
    const box = document.querySelector('.calib'), go = $('calib-go'), txt = $('calib-text');
    box.classList.toggle('flip', calib.step >= 2);
    $('calib-count').textContent = calib.count || '';
    go.disabled = !!calib.count;
    if (calib.step === 1) {
      txt.innerHTML = '① 폰을 세로로 세워 <b>뒷면(카메라)</b>을 벽·문·칠판에 딱 붙이세요. 붙인 채로 버튼을 누르고, 숫자가 사라질 때까지 움직이지 마세요.' + (calib.err ? `<br><b style="color:var(--bad)">${calib.err}</b>` : '');
      go.textContent = '1단계 측정';
    } else if (calib.step === 2) {
      txt.innerHTML = `1단계: ${fmt(calib.e1)}°<br>② 이번엔 폰을 뒤집어 <b>화면</b>을 같은 벽에 붙입니다. 버튼을 누르고 5초 안에 붙이세요. <b>삐</b> 소리가 나면 끝.` + (calib.err ? `<br><b style="color:var(--bad)">${calib.err}</b>` : '');
      go.textContent = '2단계 측정';
    } else {
      const ie = (calib.e1 + calib.e2) / 2;
      txt.innerHTML = `1단계 ${fmt(calib.e1)}°, 2단계 ${fmt(calib.e2)}°<br>기기 오차 = (1단계 + 2단계) ÷ 2 = <b>${signed(ie)}°</b><br><span class="micro">벽이 기울어 있어도 앞뒤로 재서 평균하면 벽의 기울기는 지워지고 센서의 오차만 남아요. 앞으로 측정값에서 이만큼 빼요.</span>`;
      go.textContent = '저장';
    }
  }
  function calibStep() {
    if (calib.step === 3) {
      state.ie = +((calib.e1 + calib.e2) / 2).toFixed(3);
      save(); renderSettings(); $('calib-dlg').close();
      toast(`기기 오차 ${signed(state.ie)}° 저장`);
      return;
    }
    const wait = calib.step === 1 ? 2 : 5;
    calib.err = '';
    let n = wait;
    calib.count = n; renderCalib();
    const timer = setInterval(() => {
      n--;
      if (n > 0) { calib.count = n; renderCalib(); return; }
      clearInterval(timer);
      calib.count = '…'; renderCalib();
      const from = performance.now();
      setTimeout(() => {
        const vals = samples(from, performance.now()).map(s => s.cam);
        calib.count = '';
        if (vals.length < 4) calib.err = '센서 값이 없어요. 다시 해 주세요.';
        else if (std(vals) > 0.3) calib.err = '폰이 움직였어요. 벽에 딱 붙인 채로 다시 해 주세요.';
        else {
          const e = mean(vals);
          if (Math.abs(e) > 15) calib.err = `기울기가 ${fmt(e, 1)}°예요. 폰을 세로로 세워 수직인 벽에 붙여 주세요.`;
          else if (calib.step === 1) { calib.e1 = e; calib.step = 2; }
          else { calib.e2 = e; calib.step = 3; }
        }
        beep(calib.err ? 330 : 990, 0.25); buzz(200);
        renderCalib();
      }, 1500);
    }, 1000);
  }
  function openCalib() {
    if (sensor !== 'live') { toast('기울기 센서가 켜져 있어야 해요. 「관측」 탭에서 센서를 먼저 켜 주세요.', 4000); return; }
    calib = {step: 1};
    renderCalib();
    $('calib-dlg').showModal();
  }

  // ── 설정 ────────────────────────────────────────────────
  function renderSettings() {
    $('ie-val').textContent = signed(state.ie) + '°';
    const sel = $('ap-select');
    if (!sel.options.length) {
      sel.innerHTML = AP_PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      sel.onchange = () => { state.ap = sel.value; save(); renderFix(true); refreshBodies(); };
    }
    sel.value = state.ap;
  }

  // ── 탭 ─────────────────────────────────────────────────
  function setTab(t) {
    document.body.dataset.tab = t;
    $('toast').classList.remove('on');
    for (const b of document.querySelectorAll('.tabbar button')) b.setAttribute('aria-pressed', String(b.dataset.tab === t));
    syncCamera();
    if (t === 'observe') keepAwake();
    if (t === 'fix') {
      ensureMap();
      requestAnimationFrame(() => { if (map) map.invalidateSize(); renderFix(true); });
    }
  }

  // ── 시작 ────────────────────────────────────────────────
  function init() {
    if (!M) return;
    $('f-body').innerHTML = M.BODIES.map(b => `<option value="${b.id}">${ICON[b.kind]} ${esc(b.name)}</option>`).join('');
    buildBodies();
    selectBody(state.body);
    setAim(state.aim === 'edge' && state.body !== 'sun' ? 'edge' : 'camera', true);
    updateCount(); renderSettings(); tickClock();
    if (window.self !== window.top) { const a = $('popout'); a.href = location.href; a.hidden = false; }

    $('start-btn').onclick = startAll;
    $('skip-btn').onclick = () => { $('start').hidden = true; };
    $('shoot').onclick = shoot;
    $('to-fix').onclick = () => setTab('fix');
    for (const b of document.querySelectorAll('.seg button')) b.onclick = () => setAim(b.dataset.aim);
    for (const b of document.querySelectorAll('.tabbar button')) b.onclick = () => setTab(b.dataset.tab);
    $('map-fix').onclick = viewFix;
    $('map-all').onclick = viewAll;
    $('add-manual').onclick = () => openSightDialog(null);
    $('practice').onclick = loadPractice;
    $('clear').onclick = () => {
      if (!state.sights.length || !confirm('기록을 모두 지울까요?')) return;
      state.sights = []; state.practice = null; state.truth = null;
      save(); updateCount(); renderFix(true);
    };
    $('sight-form').addEventListener('submit', e => { if (e.submitter && e.submitter.value === 'ok') saveSightDialog(); });
    $('calib').onclick = openCalib;
    $('calib-go').onclick = calibStep;
    $('calib-cancel').onclick = () => $('calib-dlg').close();

    document.addEventListener('visibilitychange', () => { syncCamera(); if (!document.hidden) keepAwake(); });
    setInterval(updateReadout, 120);
    setInterval(tickClock, 500);
    setInterval(refreshBodies, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
