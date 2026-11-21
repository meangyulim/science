/* 흑점은 동→서, 자전은 서→동? — 3D 화면 (Three.js r128).
   계산은 sun-rotation-model.js. 좌표: 태양 중심 원점, 태양 북극 +y, 지구는 +z 쪽 (모형 파일과 같다).
   큰 화면 + 오른쪽 위 작은 화면(PIP). 작은 화면은 늘 '다른 쪽' 시점(위에서 ↔ 망원경)을 보여 준다. */
(function() {
  'use strict';
  const M = window.SunRotationModel;
  const $ = id => document.getElementById(id);
  const S = M.SCENE, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const R = S.sunR, RE = S.earthR;
  const clamp = M.clamp;
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 흑점 A: 북위 15°. 텍스처(태양에 붙은 좌표)에서는 경도 A_BODY 에 그린다.
  const A_LAT = 15, A_BODY = -100;
  const startLon = sense => sense > 0 ? -100 : 100;   // 늘 '들어오는 쪽' 가장자리 바로 뒤에서 출발

  const state = {
    step: 0, days: 0, playing: true, speed: 1.6, sense: 1, site: 'seoul',
    show: {sky: false, sunDirs: false, rings: true, path: true},
    pip: 'scope', cam: 'top', free: false, trail: [], wasVisible: false
  };

  // ── 단계 ──────────────────────────────────────────────
  const SVG_ANALOGY = `<svg viewBox="0 0 440 182" role="img" aria-label="지구본은 바깥에서 보니 동쪽이 오른쪽, 남쪽 하늘은 안에서 올려다보니 동쪽이 왼쪽">
    <rect x="0" y="0" width="212" height="182" rx="12" fill="#fdf0e6"/>
    <text x="106" y="22" text-anchor="middle" font-size="13" font-weight="800" fill="#9a3f0b">지구본 · 바깥에서 봐요</text>
    <text x="106" y="44" text-anchor="middle" font-size="11" font-weight="800" fill="#2f6f9a">N</text>
    <circle cx="106" cy="94" r="44" fill="#cfe8f7" stroke="#2f6f9a" stroke-width="2"/>
    <path d="M78 74q12-12 26-3q8 9-3 17q-11 6-20-2z" fill="#86bb84"/>
    <path d="M114 98q15-7 23 5q3 12-9 15q-12 2-14-9z" fill="#86bb84"/>
    <path d="M106 50V138" stroke="#2f6f9a" stroke-width="1.4" stroke-dasharray="3 3"/>
    <path d="M70 156H142" stroke="#e0742f" stroke-width="3"/>
    <path d="M142 156l-9-5v10z" fill="#e0742f"/><path d="M70 156l9-5v10z" fill="#e0742f"/>
    <text x="60" y="161" text-anchor="end" font-size="13" font-weight="800" fill="#9a3f0b">서</text>
    <text x="152" y="161" font-size="13" font-weight="800" fill="#9a3f0b">동</text>
    <text x="106" y="177" text-anchor="middle" font-size="11" fill="#9a3f0b">동쪽이 오른쪽 (태양도 이렇게)</text>
    <rect x="228" y="0" width="212" height="182" rx="12" fill="#e3f3f7"/>
    <text x="334" y="22" text-anchor="middle" font-size="13" font-weight="800" fill="#06576a">남쪽 하늘 · 안에서 올려다봐요</text>
    <rect x="238" y="132" width="192" height="22" rx="4" fill="#cfe3d6"/>
    <path d="M238 132H430" stroke="#4f8a6b" stroke-width="2"/>
    <circle cx="334" cy="80" r="21" fill="#ffcf6a" stroke="#e0a03a" stroke-width="1.5"/>
    <circle cx="326" cy="75" r="3.2" fill="#6b3410"/>
    <text x="250" y="148" font-size="13" font-weight="800" fill="#06576a">동 E</text>
    <text x="334" y="148" text-anchor="middle" font-size="12" font-weight="800" fill="#4f6b5c">남 S</text>
    <text x="418" y="148" text-anchor="end" font-size="13" font-weight="800" fill="#06576a">서 W</text>
    <text x="334" y="177" text-anchor="middle" font-size="11" fill="#06576a">동쪽이 왼쪽, 서쪽이 오른쪽</text>
  </svg>`;

  const STEPS = [
    {
      title: '위에서 보면, 태양은 시계 반대 방향으로 돌아요', cam: 'top', pip: 'scope',
      show: {sky: false, sunDirs: false, rings: true, path: true},
      aria: '태양의 북극 위에서 내려다본 태양과 지구. 둘 다 시계 반대 방향으로 돈다.',
      body: `<p>태양의 <b>북극 위에서 내려다본</b> 모습이에요. 태양도 지구도 <b>시계 반대 방향</b>으로 돌아요.</p>
        <p>지구가 이렇게 돌기 때문에 해가 동쪽에서 떠요. 이런 방향의 자전을 <b>‘서에서 동으로 자전한다’</b>고 해요. 태양의 자전 방향은 지구와 같아요.</p>
        <p class="look">👀 하얀 화살표를 따라 <b>흑점 A</b>를 지켜보세요. 위에서 보면 시계 반대 방향으로 돌아요. 그런데 오른쪽 위 작은 화면(서울에서 본 태양)에서는 흑점이 <b>동(왼쪽) → 서(오른쪽)</b>로 가요. 서→동으로 도는데 왜 동→서일까요?</p>`
    },
    {
      title: '서울에서 보면, 흑점은 동쪽에서 서쪽으로 가요', cam: 'shoulder', pip: 'top',
      show: {sky: true, sunDirs: false, rings: false, path: true},
      aria: '서울의 관측자 뒤에서 본 남쪽 하늘의 태양. 왼쪽이 동쪽, 오른쪽이 서쪽이고 흑점은 왼쪽에서 오른쪽으로 간다.',
      body: `<p>한낮의 태양은 <b>남쪽 하늘</b>에 있어요. 남쪽을 바라보고 서면 <span class="c-t">왼손 쪽이 동쪽</span>, <span class="c-t">오른손 쪽이 서쪽</span>이에요.</p>
        <p>매일 같은 시각에 관측하면 흑점은 태양의 <b>동쪽(왼쪽) 가장자리</b>에서 나타나 약 2주 동안 원반을 건너 <b>서쪽(오른쪽) 가장자리</b>로 사라져요. 그래서 ‘흑점은 동에서 서로 이동한다’고 해요.</p>
        <p class="look">👀 작은 화면(북극 위에서 본 모습)과 같이 보세요. 위에서는 시계 반대 방향, 서울에서는 왼쪽 → 오른쪽. <b>같은 움직임</b>이에요.</p>
        <p class="note">※ 해가 하루 동안 동쪽에서 떠서 서쪽으로 지는 것(일주 운동)은 지구의 자전 때문이라 이 흑점의 움직임과는 다른 이야기예요. 여기서는 매일 한낮에 본 태양을 이어 붙였어요.</p>`
    },
    {
      title: '왜? 마주 보는 면은 서로 반대로 움직여요', cam: 'face', pip: 'scope',
      show: {sky: true, sunDirs: false, rings: true, path: true},
      aria: '지구 뒤쪽 위에서 본 태양과 지구. 지구의 앞면은 왼쪽(동쪽)으로, 태양의 앞면은 오른쪽(서쪽)으로 움직인다.',
      body: `<p>지구 뒤쪽 위에서 본 모습이에요. 같은 방향으로 도는 두 공이 마주 보면, <b>마주 보는 면끼리는 서로 반대쪽</b>으로 움직여요.</p>
        <ul><li class="c">🔵 지구의 앞면(서울)은 지구의 자전을 따라 <b>← 쪽</b>으로 가요. 지구가 우리를 데려가는 쪽, 이쪽이 바로 <span class="c-t">동쪽</span>이에요.</li>
        <li class="o">🟠 태양의 앞면(흑점 A)은 태양의 자전을 따라 <b>→ 쪽</b>으로 가요. 우리의 동쪽과 반대이니, 우리에게는 <span class="c-t">서쪽</span>이에요.</li></ul>
        <p>그래서 태양과 지구가 똑같이 서→동으로 자전하는데도, 지구에서 본 흑점은 동→서로 움직여요.</p>`
    },
    {
      title: '‘동쪽’이 두 개라서 헷갈려요', cam: 'scope', pip: 'top',
      show: {sky: true, sunDirs: true, rings: false, path: true},
      aria: '서울에서 망원경으로 본 태양. 왼쪽은 하늘의 동쪽이자 태양의 서쪽, 오른쪽은 하늘의 서쪽이자 태양의 동쪽.',
      body: `<p>서울에서 망원경으로 본 태양이에요. 흑점 A가 가는 <b>오른쪽</b>을 두 가지 이름으로 불러요.</p>
        <ul><li class="o"><span class="o-t">태양의 동서</span>로는 태양의 <b>동쪽</b> → 그래서 “태양은 <b>서→동</b>으로 자전한다”</li>
        <li class="c"><span class="c-t">하늘의 동서</span>로는 하늘의 <b>서쪽</b> → 그래서 “흑점은 <b>동→서</b>로 이동한다”</li></ul>
        ${SVG_ANALOGY}
        <p>지구본을 바깥에서 보면 동쪽이 오른쪽이에요. 태양도 우리가 바깥에서 바라보는 공이라, 북극을 위로 두면 <span class="o-t">태양의 동쪽은 오른쪽</span>이에요. 그런데 남쪽 하늘을 올려다보면 <span class="c-t">하늘의 동쪽은 왼쪽</span>이지요. 같은 오른쪽을 태양 기준으로는 ‘동’, 하늘 기준으로는 ‘서’라고 부르는 거예요.</p>
        <p class="note">※ 별자리판(성도)의 동서가 지도와 반대로 그려진 것도 같은 까닭이에요. 하늘은 안에서 올려다보니까요.</p>`
    },
    {
      title: '직접 해 보기: 만약에…?', cam: 'overview', pip: 'scope',
      show: {sky: true, sunDirs: true, rings: true, path: true},
      aria: '마음대로 돌려 볼 수 있는 태양과 지구, 관측자.',
      body: `<p>화면을 끌어서 돌리고, 휠이나 두 손가락으로 확대해 보세요. 아래에서 조건을 바꾸면 흑점은 어느 쪽으로 갈까요? <b>먼저 예상</b>하고 바꿔 보세요.</p>
        <ul><li>태양이 반대로(동→서) 자전한다면?</li><li>남반구 시드니에서 한낮의 태양(북쪽 하늘)을 본다면?</li></ul>`
    }
  ];

  // ── 확인 문제 (정답은 계산 모형으로 정한다) ─────────────────────
  const crossing = M.crossingDays();
  const zoneIdx = {'east-limb': 0, east: 0, center: 1, west: 2, 'west-limb': 2, far: 2};
  const QUIZ = [
    {q: '태양의 북극 위에서 내려다보면 태양은 어느 쪽으로 자전할까요?', opts: ['시계 방향', '시계 반대 방향'], ans: 1,
      why: '지구와 같은 방향(서→동)이라, 북극 위에서 보면 시계 반대 방향이에요.',
      hint: '지구도 서→동으로 자전해요. 북극 위에서 내려다본 지구는 어느 쪽으로 돌까요?', go: {step: 0}},
    {q: '서울에서 한낮에 태양 필터를 단 망원경으로 보니, 원반의 왼쪽 가장자리에서 흑점이 새로 나타났어요. 이 가장자리는 하늘의 어느 쪽일까요?', opts: ['동쪽', '서쪽'],
      ans: M.observer('seoul').eastOnScreen === 'left' ? 0 : 1,
      why: '한낮의 태양은 남쪽 하늘에 있어요. 남쪽을 바라보면 왼쪽이 동쪽이에요.',
      hint: '한낮의 태양은 어느 쪽 하늘에 있나요? 그쪽을 바라보고 서면 왼손은 어느 쪽을 가리킬까요?', go: {step: 1}},
    {q: '그 흑점은 약 1주일 뒤 어디쯤 있을까요? (지구에서 본 자전 주기 약 27일)', opts: ['아직 동쪽 가장자리 근처', '원반 가운데 근처', '서쪽 가장자리 너머 (안 보임)'],
      ans: zoneIdx[M.diskZone(M.lonNow(-90, 7)).key],
      why: `보이는 반쪽(180°)을 건너는 데 자전 주기의 절반인 약 ${crossing}일(약 2주)이 걸려요. 1주일이면 절반쯤, 원반 가운데예요.`,
      hint: '흑점이 동쪽 가장자리에서 서쪽 가장자리까지 건너는 데는 자전 주기의 절반쯤 걸려요. 1주일은 그중 얼마일까요?', go: {step: 1, restart: true}},
    {q: '만약 태양이 동에서 서로(북극 위에서 보면 시계 방향으로) 자전한다면, 서울에서 본 흑점은 하늘의 어느 쪽으로 움직일까요?', opts: ['동 → 서', '서 → 동'],
      ans: M.skyMotion('seoul', -1).from === '동' ? 0 : 1,
      why: '태양의 앞면이 우리의 동쪽으로 움직이게 되니 흑점은 서→동으로 가요. 실제 흑점은 동→서로 가니, 태양은 서→동으로 자전한다는 것을 알 수 있어요.',
      hint: '실제(서→동 자전)일 때 태양의 앞면은 우리의 서쪽으로 가요. 자전 방향이 반대가 되면 앞면은 어느 쪽으로 갈까요?', go: {step: 4, sense: -1, site: 'seoul'}},
    {q: '남반구 시드니에서는 한낮의 태양이 북쪽 하늘에 떠요. 시드니에서 본 흑점은 하늘의 어느 쪽으로 움직일까요?', opts: ['동 → 서', '서 → 동'],
      ans: M.skyMotion('sydney', 1).from === '동' ? 0 : 1,
      why: '북쪽을 바라보면 오른쪽이 동쪽이라 망원경 화면에서는 오른쪽 → 왼쪽으로 가요. 그래도 하늘의 방향으로는 서울과 똑같이 동 → 서예요.',
      hint: '화면의 왼쪽·오른쪽이 아니라 하늘의 동서를 물었어요. 북쪽을 바라보고 서면 동쪽은 어느 손 쪽일까요?', go: {step: 4, sense: 1, site: 'sydney'}}
  ];

  // ── 화면 준비 ─────────────────────────────────────────────
  const stage = $('stage'), canvas = $('view'), labelsEl = $('labels'), pipFrame = $('pip-frame');
  let ok = !!window.THREE && !!M;
  let renderer = null;
  if (ok) {
    try { renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true}); }
    catch (e) { ok = false; }
  }
  buildUi();
  if (!ok) { $('fallback').hidden = false; applyStep(initialStep(), true); return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(42, 1, 0.02, 3000);
  const pipCam = new THREE.PerspectiveCamera(30, 1, 0.02, 3000);
  const V = a => new THREE.Vector3(a[0], a[1], a[2]);
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // 빛
  scene.add(new THREE.AmbientLight(0xffffff, 0.34));
  const sunLight = new THREE.PointLight(0xfff1dc, 1.25, 0, 1);
  scene.add(sunLight);

  // 별
  (function stars() {
    const r = rng(11), n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos[i * 3] = 700 * s * Math.cos(t); pos[i * 3 + 1] = 700 * u; pos[i * 3 + 2] = 700 * s * Math.sin(t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({color: 0xcfe0ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false})));
  })();

  // ── 태양 ──────────────────────────────────────────────
  const SPOTS = (function() {
    const r = rng(5), list = [
      {lat: A_LAT, lon: A_BODY, r: 4.2}, {lat: A_LAT - 1.6, lon: A_BODY - 9, r: 2.6}, {lat: A_LAT + 0.8, lon: A_BODY - 5, r: 1.4}
    ];
    let tries = 0;
    while (list.length < 26 && tries++ < 400) {
      const lat = (r() < 0.5 ? -1 : 1) * (7 + r() * 22), lon = -180 + r() * 360;
      if (Math.abs(lat - A_LAT) < 14 && Math.abs(M.wrap180(lon - A_BODY)) < 34) continue;
      const big = 1.4 + r() * 1.9;
      list.push({lat, lon, r: big});
      if (r() < 0.7) list.push({lat: lat - Math.sign(lat) * r() * 1.5, lon: lon - 4 - r() * 6, r: big * (0.45 + r() * 0.3)});
    }
    return list;
  })();

  function sunTexture() {
    const W = 2048, H = 1024, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffd47a'; x.fillRect(0, 0, W, H);
    // 쌀알 무늬: 작은 무작위 그림을 늘려 곱하기
    const r = rng(3);
    [[512, 256, 0.32], [1024, 512, 0.22]].forEach(([w, h, a]) => {
      const g = document.createElement('canvas'); g.width = w; g.height = h;
      const gx = g.getContext('2d'), img = gx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = 170 + r() * 85;
        img.data[i * 4] = 255; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.72; img.data[i * 4 + 3] = 255;
      }
      gx.putImageData(img, 0, 0);
      x.globalAlpha = a; x.globalCompositeOperation = 'multiply'; x.imageSmoothingEnabled = true;
      x.drawImage(g, 0, 0, W, H);
    });
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    const blob = (lat, lon, rDeg, stops) => {
      const cx = (((lon + 90) / 360) % 1 + 1) % 1 * W, cy = (90 - lat) / 180 * H;
      const ry = rDeg / 180 * H, rx = rDeg / 360 * W / Math.cos(lat * D2R);
      [-W, 0, W].forEach(dx => {
        if (cx + dx + rx < 0 || cx + dx - rx > W) return;
        x.save(); x.translate(cx + dx, cy); x.scale(rx, ry);
        const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1);
        stops.forEach(([o, col]) => gr.addColorStop(o, col));
        x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 1, 0, Math.PI * 2); x.fill(); x.restore();
      });
    };
    // 백반(흑점 둘레의 밝은 곳)
    SPOTS.forEach(s => blob(s.lat, s.lon, s.r * 3.2, [[0, 'rgba(255,248,215,0.55)'], [1, 'rgba(255,248,215,0)']]));
    SPOTS.forEach(s => {
      blob(s.lat, s.lon, s.r, [[0, '#6e3510'], [0.7, '#86441a'], [0.88, 'rgba(150,80,28,0.85)'], [1, 'rgba(190,110,40,0)']]);
      blob(s.lat, s.lon, s.r * 0.5, [[0, '#170702'], [0.75, '#2a1005'], [1, 'rgba(60,22,6,0)']]);
    });
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    return t;
  }

  const sunSpin = new THREE.Group();
  scene.add(sunSpin);
  const sunMat = new THREE.ShaderMaterial({
    uniforms: {map: {value: sunTexture()}},
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 c = texture2D(map, vUv).rgb;
        float ld = 1.0 - 0.58 * (1.0 - pow(mu, 0.75));
        vec3 tint = mix(vec3(1.0, 0.6, 0.3), vec3(1.0), smoothstep(0.0, 0.65, mu));
        gl_FragColor = vec4(c * ld * tint, 1.0); }`
  });
  sunSpin.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), sunMat));
  // 흑점 A 표시 고리
  const aRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 48), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.9}));
  {
    const n = V(M.surfacePoint(A_LAT, A_BODY, 1));
    aRing.position.copy(n.clone().multiplyScalar(R * 1.004));
    aRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    sunSpin.add(aRing);
  }
  // 빛무리
  (function glow() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,200,110,0.65)'); g.addColorStop(0.42, 'rgba(255,170,70,0.35)'); g.addColorStop(1, 'rgba(255,140,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}));
    s.scale.set(R * 4.4, R * 4.4, 1);
    scene.add(s);
  })();

  // 막대·화살 도구
  const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({color, transparent: opacity < 1, opacity, side: THREE.DoubleSide});
  function rod(a, b, radius, mat, seg = 8) {
    const A = V(a), B = V(b), d = B.clone().sub(A), m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), seg), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  }
  function cone(at, dir, radius, height, mat) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 16), mat), d = V(dir).normalize();
    m.position.copy(V(at)).add(d.clone().multiplyScalar(height / 2));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    return m;
  }
  function arrow(a, b, radius, mat) {
    const A = V(a), B = V(b), d = B.clone().sub(A).normalize(), h = radius * 7;
    const g = new THREE.Group(), neck = B.clone().sub(d.clone().multiplyScalar(h));
    g.add(rod(a, neck.toArray(), radius, mat));
    g.add(cone(neck.toArray(), d.toArray(), radius * 2.8, h, mat));
    return g;
  }
  // 경도 방향의 호(北 +y 축 둘레). lon 은 모형과 같이 +z 에서 +x 쪽으로 잰 각.
  class Arc extends THREE.Curve {
    constructor(r, y, a0, a1) { super(); this.r = r; this.y = y; this.a0 = a0; this.a1 = a1; }
    getPoint(t, target = new THREE.Vector3()) {
      const a = (this.a0 + (this.a1 - this.a0) * t) * D2R;
      return target.set(this.r * Math.sin(a), this.y, this.r * Math.cos(a));
    }
  }
  const arcPoint = (r, y, a) => [r * Math.sin(a * D2R), y, r * Math.cos(a * D2R)];
  const arcTangent = (a, s) => [s * Math.cos(a * D2R), 0, -s * Math.sin(a * D2R)];
  function arcArrow(r, y, a0, a1, tube, mat) {
    const g = new THREE.Group(), s = Math.sign(a1 - a0), h = tube * 8;
    const aNeck = a1 - s * (h / r) * R2D;
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new Arc(r, y, a0, aNeck), 96, tube, 8, false), mat));
    g.add(cone(arcPoint(r, y, aNeck), arcTangent(aNeck, s), tube * 2.8, h, mat));
    return g;
  }

  // 태양의 자전축
  const axisMat = basic(0xdfe9f1, 0.75);
  scene.add(rod([0, -R * 1.42, 0], [0, R * 1.42, 0], 0.035, axisMat));
  scene.add(cone([0, R * 1.42, 0], [0, 1, 0], 0.11, 0.3, axisMat));

  const ORANGE = 0xff9d42, SKY = 0x3fd2f0, WHITE = 0xffffff;
  const sunRingMat = basic(ORANGE, 0.9), skyMat = basic(SKY, 0.95), pathMat = basic(WHITE, 0.62);
  let sunRing = null, pathArc = null;
  function buildSenseObjects() {
    if (sunRing) { scene.remove(sunRing); disposeTree(sunRing); }
    if (pathArc) { scene.remove(pathArc); disposeTree(pathArc); }
    const s = state.sense;
    // 태양의 자전 화살표: 지구 쪽 조금 앞에서 머리가 끝난다
    const head = s > 0 ? -28 : 28;
    sunRing = arcArrow(R * 1.2, 0, head - s * 300, head, 0.06, sunRingMat);
    scene.add(sunRing);
    // 흑점 A가 가는 길 (지구에서 본 보이는 반쪽)
    const rr = R * 1.012 * Math.cos(A_LAT * D2R), yy = R * 1.012 * Math.sin(A_LAT * D2R);
    pathArc = arcArrow(rr, yy, -s * 84, s * 84, 0.032, pathMat);
    scene.add(pathArc);
  }
  function disposeTree(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }

  // 날마다 찍은 자리
  const dotGeo = new THREE.SphereGeometry(0.11, 12, 8), dotMat = new THREE.MeshBasicMaterial({color: 0xffffff});
  const dots = [];
  for (let i = 0; i < 16; i++) { const d = new THREE.Mesh(dotGeo, dotMat); d.visible = false; scene.add(d); dots.push(d); }

  // ── 지구 ──────────────────────────────────────────────
  function earthTexture() {
    const W = 1024, H = 512, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d'), img = x.createImageData(W, H), r = rng(21);
    const grids = [[12, 7], [24, 13], [48, 25]].map(([gw, gh]) => ({gw, gh, v: Array.from({length: gw * gh}, r)}));
    const sm = t => t * t * (3 - 2 * t);
    const vn = (g, u, v) => {
      const X = u * g.gw, Y = v * (g.gh - 1), x0 = Math.floor(X), y0 = Math.min(g.gh - 2, Math.floor(Y));
      const fx = sm(X - x0), fy = sm(Y - y0), a = i => g.v[(y0 + (i >> 1)) * g.gw + ((x0 + (i & 1)) % g.gw)];
      return (a(0) * (1 - fx) + a(1) * fx) * (1 - fy) + (a(2) * (1 - fx) + a(3) * fx) * fy;
    };
    for (let j = 0; j < H; j++) {
      const v = j / (H - 1), lat = 90 - v * 180;
      for (let i = 0; i < W; i++) {
        const u = i / W, n = 0.55 * vn(grids[0], u, v) + 0.3 * vn(grids[1], u, v) + 0.15 * vn(grids[2], u, v);
        let col;
        if (n > 0.57) { const k = clamp((n - 0.57) / 0.18, 0, 1); col = [70 + 90 * k, 135 - 10 * k, 72 + 20 * k]; }
        else { const k = clamp((0.57 - n) / 0.25, 0, 1); col = [30 - 14 * k, 104 - 40 * k, 168 - 30 * k]; }
        const o = (j * W + i) * 4;
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    return t;
  }
  const EC = M.earthCenter(), EAXIS = M.earthAxis();
  const earthTilt = new THREE.Group();
  earthTilt.position.set(EC[0], EC[1], EC[2]);
  earthTilt.rotation.x = S.tilt * D2R;
  scene.add(earthTilt);
  const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(RE, 64, 48), new THREE.MeshLambertMaterial({map: earthTexture()}));
  earthMesh.rotation.y = 2.2;
  earthTilt.add(earthMesh);
  earthTilt.add(rod([0, -RE * 1.45, 0], [0, RE * 1.45, 0], 0.02, axisMat));
  earthTilt.add(cone([0, RE * 1.45, 0], [0, 1, 0], 0.07, 0.18, axisMat));
  const earthRing = arcArrow(RE * 1.42, 0, 245 - 290, 245, 0.035, skyMat);
  earthTilt.add(earthRing);
  const earthLocalToWorld = p => { const v = V(p); earthTilt.localToWorld(v); return v; };
  scene.updateMatrixWorld(true);

  // ── 관측자: 지평면 + 사람 ─────────────────────────────────
  function horizonTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d'), g = x.createRadialGradient(256, 256, 40, 256, 256, 256);
    g.addColorStop(0, '#4f9a6c'); g.addColorStop(1, '#2d6b4a');
    x.fillStyle = g; x.beginPath(); x.arc(256, 256, 250, 0, Math.PI * 2); x.fill();
    x.lineWidth = 8; x.strokeStyle = 'rgba(255,255,255,0.85)'; x.stroke();
    const arrowLine = (x0, y0, x1, y1, col, w) => {
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = w;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0), h = w * 3.4;
      x.beginPath(); x.moveTo(x1 + Math.cos(a) * h * 0.6, y1 + Math.sin(a) * h * 0.6);
      x.lineTo(x1 - Math.cos(a) * h + Math.sin(a) * h * 0.7, y1 - Math.sin(a) * h - Math.cos(a) * h * 0.7);
      x.lineTo(x1 - Math.cos(a) * h - Math.sin(a) * h * 0.7, y1 - Math.sin(a) * h + Math.cos(a) * h * 0.7);
      x.closePath(); x.fill();
    };
    // 캔버스: 오른쪽 = 동, 위 = 북 (위에서 내려다본 지도와 같다)
    arrowLine(256, 256, 256, 46, 'rgba(225,238,245,0.9)', 9);
    arrowLine(256, 256, 256, 466, 'rgba(225,238,245,0.9)', 9);
    arrowLine(256, 256, 470, 256, '#3fd2f0', 14);
    arrowLine(256, 256, 42, 256, '#3fd2f0', 14);
    x.fillStyle = '#e9f2f8'; x.beginPath(); x.arc(256, 256, 14, 0, Math.PI * 2); x.fill();
    return new THREE.CanvasTexture(c);
  }
  const horizon = new THREE.Group();
  scene.add(horizon);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 72), new THREE.MeshBasicMaterial({map: horizonTexture(), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false}));
  disc.renderOrder = 2;
  horizon.add(disc);

  const person = new THREE.Group();
  scene.add(person);
  (function buildPerson() {
    const lam = (c, e) => new THREE.MeshLambertMaterial({color: c, emissive: e});
    const pants = lam(0x2b3d55, 0x0e1622), shirt = lam(0x2a8fb0, 0x0f3644), skin = lam(0xf2c8a0, 0x4a3628), cap = lam(0xf07a2a, 0x4a2008), hand = lam(0x3fd2f0, 0x125566);
    person.add(rod([-0.032, 0, 0], [-0.032, 0.16, 0], 0.022, pants));
    person.add(rod([0.032, 0, 0], [0.032, 0.16, 0], 0.022, pants));
    person.add(rod([0, 0.15, 0], [0, 0.31, 0], 0.058, shirt));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.052, 20, 14), skin); head.position.set(0, 0.365, 0); person.add(head);
    const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap); capTop.position.set(0, 0.372, 0); person.add(capTop);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.06), cap); visor.position.set(0, 0.38, -0.06); person.add(visor);
    person.add(rod([-0.05, 0.29, 0], [-0.2, 0.29, 0], 0.017, shirt));
    person.add(rod([0.05, 0.29, 0], [0.2, 0.29, 0], 0.017, shirt));
    [-0.215, 0.215].forEach(xx => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), hand); h.position.set(xx, 0.29, 0); person.add(h); });
  })();
  // 지구가 관측자를 데려가는 쪽(동쪽) 화살표
  let carryArrow = null;

  let OBS = null;
  function placeObserver() {
    const o = OBS = M.observer(state.site);
    const up = V(o.up), east = V(o.east), north = V(o.north), feet = V(o.feet);
    const mb = new THREE.Matrix4().makeBasis(east, north, up);
    disc.quaternion.setFromRotationMatrix(mb);
    disc.position.copy(feet).add(up.clone().multiplyScalar(0.012));
    const f = V(o.facing), right = f.clone().cross(up).normalize(), back = f.clone().negate();
    person.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
    person.position.copy(feet).add(up.clone().multiplyScalar(0.012));
    if (carryArrow) { scene.remove(carryArrow); disposeTree(carryArrow); }
    const base = feet.clone().add(up.clone().multiplyScalar(0.6));
    carryArrow = arrow(base.clone().add(east.clone().multiplyScalar(-0.42)).toArray(), base.clone().add(east.clone().multiplyScalar(0.58)).toArray(), 0.03, skyMat);
    scene.add(carryArrow);
  }

  // ── 카메라 시점 ─────────────────────────────────────────
  const add = M.add, sub = M.sub, scale = M.scale, dot = M.dot, norm = M.norm;
  const view = {W: 1, H: 1, pip: {x: 0, y: 0, s: 0}, off: {x: 0, y: 0}};
  function fitDist(radius, fov, aspect, shrinkW = 1, shrinkH = 1) {
    const v = Math.atan(Math.tan(fov * D2R / 2) * shrinkH), h = Math.atan(Math.tan(fov * D2R / 2) * aspect * shrinkW);
    return radius / Math.sin(Math.min(v, h));
  }
  function poseFor(name, aspect, isPip) {
    const o = OBS, shW = isPip ? 1 : 1 - 2 * Math.abs(view.off.x) / view.W, shH = isPip ? 1 : 1 - 2 * Math.abs(view.off.y) / view.H;
    if (name === 'scope') {
      const eye = o.eye, dist = M.len(eye), ang = 2 * Math.asin(R / dist) * R2D, fill = isPip ? (view.pip.s < 190 ? 0.52 : 0.62) : 0.56;
      let fov = ang / fill / shH;
      const hNeed = ang * (isPip ? 1 / fill : 2.75) / shW;   // 큰 화면: 양옆 글자(1.55 R)가 들어갈 자리
      const hfov = 2 * Math.atan(Math.tan(fov * D2R / 2) * aspect) * R2D;
      if (hfov < hNeed) fov = 2 * Math.atan(Math.tan(hNeed * D2R / 2) / aspect) * R2D;
      return {pos: eye, target: [0, 0, 0], up: o.up, fov};
    }
    if (name === 'shoulder') {
      const back = scale(o.facing, -1), eye = add(add(o.feet, scale(o.up, 0.5)), scale(back, 1.45));
      const elev = p => { const d = sub(p, eye); return Math.atan2(dot(d, o.up), dot(d, o.facing)) * R2D; };
      const angR = Math.asin(R / M.len(eye)) * R2D;
      const top = elev([0, 0, 0]) + angR + 3, bottom = elev(o.feet) - 5;
      let fov = (top - bottom) / shH, c = (top + bottom) / 2;
      if (fov > 94) { fov = 94; c = top - 47; }
      fov = Math.max(fov, 2 * Math.atan(Math.tan(37 * D2R) / aspect / shW) * R2D, 52);
      fov = Math.min(fov, 100);
      const dir = add(scale(o.facing, Math.cos(c * D2R)), scale(o.up, Math.sin(c * D2R)));
      return {pos: eye, target: add(eye, scale(dir, 10)), up: o.up, fov};
    }
    if (name === 'face') {
      // 지구 뒤쪽 위(x = 0 평면)에서 태양과 지구를 한꺼번에 담는다: 가까운 지구가 크게 보인다
      const pos = [0, 7.6, S.dist + 4.6], spheres = [[[0, 0, 0], R * 1.22], [EC, RE * 1.5]];
      const el = c => Math.atan2(c[1] - pos[1], pos[2] - c[2]);
      let lo = Infinity, hi = -Infinity, hh = 0;
      spheres.forEach(([c, r]) => { const d = M.len(sub(c, pos)), a = el(c), w = Math.asin(r / d); lo = Math.min(lo, a - w); hi = Math.max(hi, a + w); hh = Math.max(hh, w); });
      const mid = (lo + hi) / 2;
      let vf = 2 * Math.atan(Math.tan((hi - lo) * 0.56) / shH);
      const hNeed = 2 * Math.atan(Math.tan(hh * 1.5) / shW);
      if (2 * Math.atan(Math.tan(vf / 2) * aspect) < hNeed) vf = 2 * Math.atan(Math.tan(hNeed / 2) / aspect);
      return {pos, target: add(pos, [0, 10 * Math.sin(mid), -10 * Math.cos(mid)]), up: [0, 1, 0], fov: vf * R2D};
    }
    const P = {
      top: {target: [0, 0, 7.8], dir: [0, 1, 0.12], radius: isPip ? 12.0 : 12.9, up: [0, 0, -1], fov: 40},
      overview: {target: [0, 0, 8.8], dir: [0.62, 0.62, 0.8], radius: 12.2, up: [0, 1, 0], fov: 42}
    }[name] || null;
    if (!P) return null;
    const d = fitDist(P.radius, P.fov, aspect, shW, shH);
    return {pos: add(P.target, scale(norm(P.dir), d)), target: P.target, up: P.up, fov: P.fov};
  }

  const camCur = {pos: [0, 40, 12], target: [0, 0, 7.6], up: [0, 0, -1], fov: 40};
  let camAnim = null;   // {from, t}
  const orbit = {target: [0, 0, 8], r: 30, yaw: 0, pitch: 0.5};
  function startCamAnim() {
    camAnim = reduceMotion ? null : {from: JSON.parse(JSON.stringify(camCur)), t: 0};
  }
  function updateCamera(dt) {
    const aspect = view.W / view.H;
    let goal;
    if (state.free) {
      const cp = Math.cos(orbit.pitch);
      goal = {pos: add(orbit.target, scale([cp * Math.sin(orbit.yaw), Math.sin(orbit.pitch), cp * Math.cos(orbit.yaw)], orbit.r)), target: orbit.target, up: [0, 1, 0], fov: camCur.fov};
    } else goal = poseFor(state.cam, aspect, false);
    if (camAnim && !state.free) {
      camAnim.t = Math.min(1, camAnim.t + dt / 1.5);
      const k = ease(camAnim.t), f = camAnim.from, L = (a, b) => a.map((v, i) => v + (b[i] - v) * k);
      camCur.pos = L(f.pos, goal.pos); camCur.target = L(f.target, goal.target); camCur.up = norm(L(f.up, goal.up)); camCur.fov = f.fov + (goal.fov - f.fov) * k;
      if (camAnim.t >= 1) camAnim = null;
    } else Object.assign(camCur, goal);
    cam.position.set(...camCur.pos); cam.up.set(...camCur.up); cam.fov = camCur.fov;
    cam.lookAt(...camCur.target);
    cam.updateProjectionMatrix();
  }
  function enterFree() {
    if (state.free) return;
    camAnim = null;
    const off = sub(camCur.pos, camCur.target), r = M.len(off);
    orbit.target = camCur.target.slice(); orbit.r = r;
    orbit.pitch = clamp(Math.asin(clamp(off[1] / r, -1, 1)), -1.45, 1.45);
    orbit.yaw = Math.atan2(off[0], off[2]);
    // 관측자 시점처럼 과녁이 멀리 있으면 태양과 지구 사이를 중심으로 돈다
    if (state.cam === 'scope' || state.cam === 'shoulder') {
      orbit.target = [0, 0, 9]; const o2 = sub(camCur.pos, orbit.target); orbit.r = clamp(M.len(o2), 6, 60);
      orbit.pitch = clamp(Math.asin(clamp(o2[1] / M.len(o2), -1, 1)), -1.45, 1.45); orbit.yaw = Math.atan2(o2[0], o2[2]);
      camCur.fov = 45;
    }
    state.free = true;
    stage.classList.add('free');
    layout(); refreshLabelText(); syncRecenter(); syncWhatif();
  }
  function leaveFree() {
    if (!state.free) return;
    state.free = false;
    stage.classList.toggle('free', state.step === 4);
    startCamAnim();
    layout(); refreshLabelText(); syncRecenter(); syncWhatif();
  }

  // ── 글자표 ───────────────────────────────────────────────
  const labels = [];
  function addLabel(cls, html, camName, pos, on) {
    const el = document.createElement('div');
    el.className = 'lbl ' + cls; el.innerHTML = html; el.style.opacity = '0';
    labelsEl.appendChild(el);
    const l = {el, cam: camName, pos, on, shown: false, html};
    labels.push(l);
    return l;
  }
  const setHtml = (l, h) => { if (l.html !== h) { l.html = h; l.el.innerHTML = h; } };
  const mainMode = () => state.free ? 'free' : state.cam;
  const pipMode = () => {
    if (state.pip === 'off') return 'off';
    const m = mainMode();
    if (state.pip === m) return m === 'scope' ? 'top' : 'scope';
    return state.pip;
  };
  const far = () => ['top', 'face', 'overview', 'free'].includes(mainMode());
  const spotWorld = (r = R) => M.spotPosition(A_LAT, startLon(state.sense), state.days, state.sense, r);
  const eastSide = () => scale(OBS.east, R * 1.55), westSide = () => scale(OBS.west, R * 1.55);

  let L_sunRing, L_earthRing, L_carry, L_path, L_east, L_west, L_dirs = [], L_hands = [], L_obs, L_facing;
  let personPx = 0;   // 큰 화면에서 관측자의 키(픽셀) — 작게 보이면 둘레 글자를 줄인다
  const carryOn = () => state.show.rings && ['face', 'overview', 'free'].includes(mainMode()) && personPx > 12;
  function buildLabels() {
    addLabel('plain', '태양의 북극 N', 'main', () => [0, R * 1.6, 0], () => true);
    addLabel('plain big', '태양', 'main', () => [R * 1.05, 0, -R * 1.3], () => mainMode() === 'top');
    addLabel('plain big', '지구', 'main', () => add(EC, [0, 0, RE * 2.1]), () => mainMode() === 'top');
    L_sunRing = addLabel('orange', '', 'main', () => arcPoint(R * 1.2, 0, state.sense > 0 ? -150 : 150), () => state.show.rings && far());
    L_earthRing = addLabel('cyan', '지구도 서 → 동', 'main', () => earthLocalToWorld(arcPoint(RE * 1.42, 0, 95)).toArray(), () => state.show.rings && far());
    L_carry = addLabel('cyan', '지구가 우리를 데려가는 쪽<small>= 우리의 동쪽</small>', 'main',
      () => add(add(OBS.feet, scale(OBS.up, 0.74)), scale(OBS.east, 0.95)), carryOn);
    L_path = addLabel('white', '', 'main', () => {
      const a = state.sense * 58, rr = R * 1.2 * Math.cos(A_LAT * D2R);
      return arcPoint(rr, R * 1.2 * Math.sin(A_LAT * D2R) + 0.55, a);
    }, () => state.show.path);
    addLabel('white tiny', 'A', 'main', () => add(spotWorld(R * 1.0), scale(norm(spotWorld()), 0.95)), () => true);
    // 3단계(마주 보는 면)에서는 '태양의 앞면이 가는 쪽 = 우리의 서쪽' 글자와 겹치므로 태양 양옆 글자를 숨긴다
    const sidesOn = () => (state.show.sky || state.show.sunDirs) && !(state.step === 2 && !state.free);
    L_east = addLabel('', '', 'main', () => eastSide(), sidesOn);
    L_west = addLabel('', '', 'main', () => westSide(), sidesOn);
    const dirs = [['east', '동 E', 'cyan'], ['west', '서 W', 'cyan'], ['south', '남 S', 'white'], ['north', '북 N', 'white']];
    L_dirs = dirs.map(([k, t, c], i) => addLabel(c + ' tiny', t, 'main', () => add(add(OBS.feet, scale(OBS[k], i < 2 ? 0.8 : 1.1)), scale(OBS.up, i < 2 ? 0.09 : 0.05)),
      () => state.show.sky && mainMode() !== 'scope' && (i < 2 ? personPx > 18 : personPx > 45 && mainMode() !== 'shoulder')));
    L_obs = addLabel('plain tiny', '', 'main', () => add(OBS.feet, scale(OBS.up, 0.72)), () => mainMode() === 'top' || (['face', 'overview', 'free'].includes(mainMode()) && !carryOn()));
    L_facing = addLabel('white', '', 'main', () => add(OBS.feet, scale(OBS.up, 0.6)), () => mainMode() === 'shoulder');
    L_hands = [-1, 1].map(sx => addLabel('cyan', '', 'main', () => {
      const f = OBS.facing, right = M.cross(f, OBS.up);
      return add(add(OBS.feet, scale(OBS.up, 0.4)), scale(right, sx * 0.27));
    }, () => mainMode() === 'shoulder'));
    // 작은 화면
    addLabel('white tiny', 'A', 'pip', () => add(spotWorld(R * 1.0), scale(norm(spotWorld()), 0.95)), () => true);
    addLabel('plain tiny', '태양', 'pip', () => [-R * 1.15, 0, -R * 1.2], () => pipMode() === 'top');
    addLabel('plain tiny', '지구', 'pip', () => add(EC, [0, 0, RE * 2.2]), () => pipMode() === 'top');
  }
  function sideHtml(isEast) {
    const sky = isEast ? '하늘의 동쪽 E' : '하늘의 서쪽 W', sun = isEast ? '태양의 서쪽 W☉' : '태양의 동쪽 E☉';
    return (state.show.sky ? `<span class="c-line">${sky}</span>` : '') + (state.show.sky && state.show.sunDirs ? '<br>' : '') + (state.show.sunDirs ? `<span class="o-line">${sun}</span>` : '');
  }
  function refreshLabelText() {
    setHtml(L_sunRing, state.sense > 0 ? '태양도 서 → 동<small>북극 위에서 보면 시계 반대 방향</small>' : '만약에: 동 → 서<small>북극 위에서 보면 시계 방향</small>');
    const s3 = state.step === 2 && !state.free;
    setHtml(L_path, s3 ? '태양의 앞면이 가는 쪽<small>= 우리의 서쪽</small>' : '흑점 A가 가는 길');
    setHtml(L_east, sideHtml(true)); setHtml(L_west, sideHtml(false));
    L_east.el.className = L_west.el.className = 'lbl two';
    const f = OBS.facing, right = M.cross(f, OBS.up), rightName = dot(right, OBS.east) > 0 ? '동' : '서';
    const leftName = rightName === '동' ? '서' : '동';
    setHtml(L_hands[0], `왼손 = ${leftName}쪽`); setHtml(L_hands[1], `오른손 = ${rightName}쪽`);
    setHtml(L_obs, `${OBS.name}의 관측자`);
    setHtml(L_facing, `${OBS.facingName}쪽을 바라봐요`);
    // 작은 화면의 둘레 글자
    const pm = pipMode();
    const small = view.pip.s < 190;
    pipFrame.classList.toggle('small', small);
    if (pm === 'scope') {
      const eastLeft = OBS.eastOnScreen === 'left';
      const side = isEast => `<b class="c">${isEast ? (small ? '동' : '동 E') : (small ? '서' : '서 W')}</b>` +
        (state.show.sunDirs ? `<b class="o">${isEast ? (small ? 'W☉' : '태양의 서') : (small ? 'E☉' : '태양의 동')}</b>` : '');
      $('pip-l').innerHTML = side(eastLeft); $('pip-r').innerHTML = side(!eastLeft);
      const nUp = OBS.sunNorthOnScreen === 'up', nText = small ? '북극' : '태양의 북극';
      $('pip-t').textContent = nUp ? '↑ ' + nText : ''; $('pip-b').textContent = nUp ? '' : '↓ ' + nText;
      $('pip-title').textContent = small ? `${OBS.name}에서 본 태양` : `${OBS.name}에서 망원경으로 본 태양 (한낮, ${OBS.facingName}쪽 하늘)`;
    } else if (pm === 'top') {
      $('pip-l').innerHTML = $('pip-r').innerHTML = ''; $('pip-t').textContent = ''; $('pip-b').textContent = '';
      $('pip-title').textContent = small ? '위에서 본 모습' : '북극 위에서 내려다본 모습';
    }
    pipFrame.hidden = pm === 'off';
  }

  const camOf = c => c === 'pip' ? pipCam : cam;
  const tmp = new THREE.Vector3();
  function occluded(camPos, p) {
    const spheres = [[[0, 0, 0], R * 0.995], [EC, RE * 0.985]];
    const d = sub(p, camPos), Ld = M.len(d), u = scale(d, 1 / Ld);
    for (const [c, r] of spheres) {
      const oc = sub(camPos, c), b = dot(oc, u), cc = dot(oc, oc) - r * r, disc2 = b * b - cc;
      if (disc2 < 0) continue;
      const t1 = -b - Math.sqrt(disc2);
      if (t1 > 0.01 && t1 < Ld - 0.03) return true;
    }
    return false;
  }
  function updateLabels() {
    const pm = pipMode();
    {
      const a = V(OBS.feet).project(cam), b = V(add(OBS.feet, scale(OBS.up, 0.4))).project(cam);
      personPx = a.z > 1 || b.z > 1 ? 0 : Math.hypot((a.x - b.x) * view.W / 2, (a.y - b.y) * view.H / 2);
    }
    labels.forEach(l => {
      let show = l.on();
      let x = 0, y = 0;
      if (show && l.cam === 'pip' && pm === 'off') show = false;
      if (show) {
        const c = camOf(l.cam), p = l.pos();
        tmp.set(p[0], p[1], p[2]).project(c);
        if (tmp.z > 1 || tmp.z < -1) show = false;
        else if (occluded(c.position.toArray(), p)) show = false;
        else if (l.cam === 'pip') {
          const P = view.pip;
          x = P.x + (tmp.x + 1) / 2 * P.s; y = P.y + (1 - tmp.y) / 2 * P.s;
          if (tmp.x < -0.92 || tmp.x > 0.92 || tmp.y < -0.92 || tmp.y > 0.92) show = false;
        } else {
          x = (tmp.x + 1) / 2 * view.W; y = (1 - tmp.y) / 2 * view.H;
          if (x < 8 || x > view.W - 8 || y < 14 || y > view.H - 8) show = false;
          // 작은 화면 밑에 깔리면 숨긴다
          const P = view.pip;
          if (pm !== 'off' && x > P.x - 8 && y < P.y + P.s + 8 && y > P.y - 26) show = false;
        }
      }
      if (show) {
        l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
        if (!l.shown) { l.el.style.opacity = '1'; l.shown = true; }
      } else if (l.shown) { l.el.style.opacity = '0'; l.shown = false; }
    });
  }

  // ── 시간 ──────────────────────────────────────────────
  function lonA(days) { return M.lonNow(startLon(state.sense), days, state.sense); }
  function recordDay(k) {
    const vis = Math.abs(lonA(k)) < 90;
    if (vis) {
      if (!state.wasVisible) state.trail = [];
      state.trail.push(k);
      if (state.trail.length > dots.length) state.trail.shift();
    }
    state.wasVisible = vis;
  }
  function advance(dd) {
    const prev = state.days;
    state.days += dd;
    for (let k = Math.floor(prev) + 1; k <= Math.floor(state.days); k++) recordDay(k);
  }
  function restart() {
    state.days = 0; state.trail = []; state.wasVisible = false;
  }

  // ── 그리기 ─────────────────────────────────────────────
  function updateScene() {
    sunSpin.rotation.y = (startLon(state.sense) - A_BODY + M.spinDeg(state.days, state.sense)) * D2R;
    sunRing.visible = state.show.rings;
    earthRing.visible = state.show.rings;
    if (carryArrow) carryArrow.visible = state.show.rings;
    pathArc.visible = state.show.path;
    dots.forEach((d, i) => {
      const k = state.trail[i];
      d.visible = state.show.path && k !== undefined;
      if (d.visible) d.position.set(...M.spotPosition(A_LAT, startLon(state.sense), k, state.sense, R * 1.02));
    });
  }
  function render() {
    const W = view.W, H = view.H, pm = pipMode();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    const nearEye = M.len(sub(camCur.pos, OBS.eye)) < 0.3;
    person.visible = !nearEye;
    renderer.render(scene, cam);
    if (pm !== 'off') {
      const P = view.pip, pose = poseFor(pm, 1, true);
      pipCam.position.set(...pose.pos); pipCam.up.set(...pose.up); pipCam.fov = pose.fov; pipCam.aspect = 1;
      pipCam.lookAt(...pose.target); pipCam.updateProjectionMatrix();
      const yb = H - P.y - P.s;
      renderer.setScissorTest(true);
      renderer.setScissor(P.x, yb, P.s, P.s); renderer.setViewport(P.x, yb, P.s, P.s);
      renderer.setClearColor(0x06101c, 1);
      renderer.clear();
      person.visible = pm !== 'scope';
      // 망원경 화면에는 자전 화살표를 그리지 않는다 (태양의 동서 색과 헷갈리지 않게)
      const keep = [sunRing.visible, earthRing.visible, carryArrow.visible];
      if (pm === 'scope') sunRing.visible = earthRing.visible = carryArrow.visible = false;
      renderer.render(scene, pipCam);
      [sunRing.visible, earthRing.visible, carryArrow.visible] = keep;
      renderer.setScissorTest(false);
    }
  }
  function updateHud() {
    $('hud-day').textContent = `${state.days.toFixed(1)}일째`;
    const z = M.diskZone(lonA(state.days));
    let t = `흑점 A: ${z.text}`;
    if (z.key === 'far') t += state.sense > 0 ? ' · 곧 동쪽 가장자리에서 나와요' : ' · 곧 서쪽 가장자리에서 나와요';
    if ($('hud-zone').textContent !== t) $('hud-zone').textContent = t;
  }

  function layout() {
    const r = stage.getBoundingClientRect(), W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    view.W = W; view.H = H;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    const s = Math.round(W < 560 ? Math.min(W * 0.37, H * 0.34) : clamp(Math.min(W * 0.3, H * 0.42), 140, 300));
    view.pip = {x: W - s - 10, y: 28, s};
    Object.assign(pipFrame.style, {left: view.pip.x + 'px', top: view.pip.y + 'px', width: s + 'px', height: s + 'px'});
    // 작은 화면을 피해 장면을 왼쪽(가로 화면) 또는 아래쪽(세로 화면)으로 조금 민다
    const pm = pipMode(), mm = mainMode();
    if (pm === 'off') view.off = {x: 0, y: 0};
    else if (W / H > 1.2) view.off = {x: Math.round(s * (mm === 'scope' ? 0.42 : mm === 'top' ? 0.22 : 0.36)), y: 0};
    else view.off = {x: 0, y: mm === 'shoulder' ? 0 : -Math.round(s * 0.42)};
    if (view.off.x || view.off.y) cam.setViewOffset(W, H, view.off.x, view.off.y, W, H);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    if (L_east) refreshLabelText();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (state.playing) advance(dt * state.speed);
    updateCamera(dt);
    updateScene();
    render();
    updateLabels();
    updateHud();
    requestAnimationFrame(frame);
  }

  // ── 끌어서 돌리기 ─────────────────────────────────────────
  const pointers = new Map();
  let pinch0 = 0, r0 = 0;
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); r0 = orbit.r; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1];
    if (!state.free && Math.hypot(dx, dy) < 4) return;
    enterFree();
    canvas.classList.add('dragging');
    $('drag-hint').classList.add('gone');
    if (pointers.size === 1) {
      orbit.yaw -= dx * 0.0065;
      orbit.pitch = clamp(orbit.pitch + dy * 0.0055, -1.45, 1.45);
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch0 > 0) orbit.r = clamp(r0 * pinch0 / d, 4, 90);
      return;
    }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const endPointer = e => { pointers.delete(e.pointerId); if (!pointers.size) canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e => {
    if (!state.free && state.step !== 4) return;   // 단계 화면에서는 페이지 스크롤을 막지 않는다
    e.preventDefault();
    enterFree();
    orbit.r = clamp(orbit.r * Math.exp(e.deltaY * 0.0012), 4, 90);
  }, {passive: false});

  // ── 시작 ──────────────────────────────────────────────
  placeObserver();
  buildSenseObjects();
  buildLabels();
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(stage);
  else window.addEventListener('resize', layout);
  layout();
  applyStep(initialStep(), true);
  requestAnimationFrame(t => { last = t; frame(t); });

  // ── 바깥(단추 등)과 잇기 ─────────────────────────────────
  function setSense(s) {
    if (state.sense === s) return;
    state.sense = s; restart();
    buildSenseObjects();
  }
  function setSite(site) {
    if (state.site === site) return;
    state.site = site;
    placeObserver();
  }
  function syncRecenter() {
    $('recenter').hidden = !state.free;
  }

  // ── 화면 단추들 (3D가 없어도 글은 보이도록 맨 위에서 부른다) ─────────
  function initialStep() {
    const m = /^#s([1-5])$/.exec(location.hash);
    return m ? +m[1] - 1 : 0;
  }
  function applyStep(i, first) {
    i = clamp(i, 0, STEPS.length - 1);
    const st = STEPS[i];
    state.step = i;
    document.querySelectorAll('#steps button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.step === i)));
    $('step-eyebrow').textContent = `STEP ${i + 1} / ${STEPS.length}`;
    $('step-title').textContent = st.title;
    $('step-body').innerHTML = st.body;
    $('whatif').hidden = i !== 4;
    $('prev').disabled = i === 0;
    $('next').textContent = i === STEPS.length - 1 ? '확인 문제로 ▼' : '다음 ▶';
    canvas.setAttribute('aria-label', st.aria);
    if (!first && history.replaceState) history.replaceState(null, '', '#s' + (i + 1));
    Object.assign(state.show, st.show);
    state.pip = st.pip;
    syncToggles(); syncWhatif();
    if (!ok) return;
    if (i < 4) { setSense(1); setSite('seoul'); }
    state.free = false;
    stage.classList.toggle('free', i === 4);
    state.cam = st.cam;
    if (first) { camAnim = null; } else startCamAnim();
    // 흑점 A가 뒤쪽이나 서쪽 끝에 있으면 처음부터 (기다리지 않게)
    const z = M.diskZone(lonA(state.days)).key;
    if (i < 4 && (z === 'far' || z === 'west-limb')) restart();
    layout();
    refreshLabelText(); syncRecenter(); syncWhatif();
  }

  function syncToggles() {
    document.querySelectorAll('.toggles [data-show]').forEach(b => b.setAttribute('aria-pressed', String(!!state.show[b.dataset.show])));
    if (ok && OBS) refreshLabelText();
  }
  function syncWhatif() {
    document.querySelectorAll('#w-sense button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.sense === state.sense)));
    document.querySelectorAll('#w-site button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.site === state.site)));
    document.querySelectorAll('#w-pip button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pip === state.pip)));
    document.querySelectorAll('#w-cam button').forEach(b => b.setAttribute('aria-pressed', String(!state.free && state.step === 4 && b.dataset.cam === state.cam)));
    const sm = M.skyMotion(state.site, state.sense), o = M.observer(state.site);
    const scr = sm.screen === 'left-to-right' ? '왼쪽 → 오른쪽' : '오른쪽 → 왼쪽';
    let t = `${o.name}에서 한낮에 <b>${o.facingName}쪽 하늘</b>의 태양을 보면, 망원경 화면에서 흑점은 <b>${scr}</b>, 하늘의 방향으로는 <b>${sm.from} → ${sm.to}</b>로 움직여요.`;
    if (state.site === 'seoul' && state.sense > 0) t += ' 실제 모습이에요.';
    else if (state.site === 'seoul') t += ' 실제 관측(동 → 서)과 반대예요. 그러니 실제 태양은 서 → 동으로 자전한다는 것을 알 수 있어요.';
    else if (state.sense > 0) t += ' 북쪽을 바라보니 동쪽이 <b>오른쪽</b>이고 태양의 북극이 아래로 보여요. 화면에서는 반대로 가도, 하늘의 방향으로는 서울과 똑같이 동 → 서예요.';
    else t += ' 태양이 반대로 돈다면 남반구에서도 서 → 동이에요. 하늘의 방향은 관측 장소가 아니라 태양의 자전 방향으로 정해져요.';
    $('w-result').innerHTML = t;
    $('w-result').classList.toggle('flip', state.sense < 0);
  }

  function buildUi() {
    document.querySelectorAll('#steps button').forEach(b => b.addEventListener('click', () => applyStep(+b.dataset.step)));
    $('prev').addEventListener('click', () => applyStep(state.step - 1));
    $('next').addEventListener('click', () => {
      if (state.step < STEPS.length - 1) applyStep(state.step + 1);
      else $('quiz').scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'start'});
    });
    document.querySelectorAll('.toggles [data-show]').forEach(b => b.addEventListener('click', () => {
      state.show[b.dataset.show] = !state.show[b.dataset.show];
      syncToggles();
    }));
    $('play').addEventListener('click', () => {
      state.playing = !state.playing;
      $('play').textContent = state.playing ? '❚❚' : '▶';
      $('play').setAttribute('aria-label', state.playing ? '멈춤' : '재생');
    });
    $('plus-day').addEventListener('click', () => { if (ok) advance(1); });
    $('restart').addEventListener('click', () => { if (ok) restart(); });
    document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => {
      state.speed = +b.dataset.speed;
      document.querySelectorAll('#speed button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('recenter').addEventListener('click', () => { if (ok) leaveFree(); });
    document.querySelectorAll('#w-sense button').forEach(b => b.addEventListener('click', () => { if (!ok) return; setSense(+b.dataset.sense); refreshLabelText(); syncWhatif(); }));
    document.querySelectorAll('#w-site button').forEach(b => b.addEventListener('click', () => { if (!ok) return; setSite(b.dataset.site); refreshLabelText(); syncWhatif(); }));
    document.querySelectorAll('#w-pip button').forEach(b => b.addEventListener('click', () => { if (!ok) return; state.pip = b.dataset.pip; layout(); refreshLabelText(); syncWhatif(); }));
    document.querySelectorAll('#w-cam button').forEach(b => b.addEventListener('click', () => {
      if (!ok) return;
      state.free = false; state.cam = b.dataset.cam; startCamAnim(); layout(); refreshLabelText(); syncRecenter(); syncWhatif();
    }));
    document.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') applyStep(state.step + 1);
      else if (e.key === 'ArrowLeft') applyStep(state.step - 1);
    });
    buildQuiz();
  }

  function buildQuiz() {
    const list = $('q-list'), done = new Array(QUIZ.length).fill(null);
    const score = () => {
      const n = done.filter(v => v === true).length;
      $('quiz-score').textContent = done.some(v => v !== null) ? `${n} / ${QUIZ.length}` : '';
    };
    QUIZ.forEach((q, qi) => {
      const li = document.createElement('li'); li.className = 'q';
      li.innerHTML = `<p class="q-n">문제 ${qi + 1}</p><p class="q-t">${q.q}</p><div class="opts"></div><div class="fb" hidden></div>`;
      const opts = li.querySelector('.opts'), fb = li.querySelector('.fb');
      q.opts.forEach((t, oi) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = t;
        b.addEventListener('click', () => {
          const right = oi === q.ans;
          opts.querySelectorAll('button').forEach(x => x.classList.remove('right', 'wrong'));
          b.classList.add(right ? 'right' : 'wrong');
          if (done[qi] === null) done[qi] = right;
          else if (right && done[qi] === false) done[qi] = 'late';
          fb.hidden = false;
          fb.innerHTML = (right ? '<span class="ok">맞아요!</span> ' : '<span class="no">다시 생각해 봐요.</span> ') + (right ? q.why : q.hint) +
            '<br><button type="button">3D로 확인하기 ↑</button>';
          fb.querySelector('button').addEventListener('click', () => go(q.go));
          score();
        });
        opts.appendChild(b);
      });
      list.appendChild(li);
    });
  }
  function go(g) {
    applyStep(g.step);
    if (ok) {
      if (g.sense !== undefined) setSense(g.sense);
      if (g.site) setSite(g.site);
      if (g.restart) restart();
      refreshLabelText(); syncWhatif();
    }
    $('stage').scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'center'});
  }
})();
