/* 흑점 헌터스 — 3D 관측소 (Three.js r128).
   눈 덮인 산 위 관측소에 반 전체의 망원경과 캐릭터가 모둠별로 줄지어 선다.
   각 망원경은 그 학생이 지금 겨누는 방향(방위각·고도)을 실시간으로 따라가고,
   경통 앞에서 나오는 빛줄기로 '어디를 보고 있는지'가 보인다(태양을 맞추면 금빛).
   좌표: 북 +z, 서 +x, 위 +y (sunspot-model.js 의 dirVec 와 같다). */
(function(root) {
  'use strict';
  const THREE = root.THREE;
  const M = root.SunspotModel;
  const D2R = Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
  const angDamp = (a, b, k, dt) => { let d = ((b - a + 540) % 360) - 180; return a + d * (1 - Math.exp(-k * dt)); };

  // ── 작은 도구: 색을 입힌 조각들을 한 덩어리로 합치기 (그리기 호출 수를 줄인다) ─────
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  function part(geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  // 두 점을 잇는 막대
  function rod(a, b, radius, color, seg = 6) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(radius, radius, len, seg).toNonIndexed();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    return part(g, color);
  }
  function merge(parts) {
    let n = 0;
    parts.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    parts.forEach(g => {
      pos.set(g.attributes.position.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeVertexNormals();
    return out;
  }
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; };

  // 동그란 빛 무늬(해, 가로등, 별빛 등)
  function glowTexture(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  function roundRect(x, X, Y, W, H, R) {
    x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R);
    x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath();
  }
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  const emojiCache = new Map();
  function emojiTexture(text) {
    if (emojiCache.has(text)) return emojiCache.get(text);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.font = `96px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 64, 70);
    const t = new THREE.CanvasTexture(c);
    emojiCache.set(text, t);
    return t;
  }
  function textTexture(text, color, bg) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.font = `900 76px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (bg) { const w = Math.min(500, x.measureText(text).width + 60); x.fillStyle = bg; roundRect(x, 256 - w / 2, 14, w, 100, 50); x.fill(); }
    x.lineWidth = 12; x.strokeStyle = 'rgba(10,20,40,.75)'; x.strokeText(text, 256, 68);
    x.fillStyle = color; x.fillText(text, 256, 68);
    return new THREE.CanvasTexture(c);
  }

  // ── 하늘 ────────────────────────────────────────────────
  const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const SKY_FS = `
    uniform vec3 sunDir; uniform float night; uniform float aur;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      float h = clamp(d.y, 0.0, 1.0);
      vec3 dayTop = vec3(0.16,0.42,0.86), dayHor = vec3(0.80,0.88,0.97);
      vec3 col = mix(dayHor, dayTop, pow(h, 0.5));
      float sd = max(dot(d, sunDir), 0.0);
      col += vec3(1.0,0.86,0.62) * (pow(sd, 300.0) * 0.7 + pow(sd, 12.0) * 0.16);
      vec3 nTop = vec3(0.006,0.012,0.04), nHor = vec3(0.04,0.07,0.15);
      vec3 ncol = mix(nHor, nTop, pow(h, 0.45));
      ncol += vec3(0.25,0.05,0.12) * aur * smoothstep(0.0,0.5,d.z) * (1.0 - smoothstep(0.0, 0.5, h)) * 0.5;
      ncol += vec3(0.02,0.18,0.10) * aur * smoothstep(0.2,0.8,d.z) * (1.0 - smoothstep(0.0, 0.25, h)) * 0.6;
      col = mix(col, ncol, night);
      if (d.y < 0.0) col = mix(col, mix(vec3(0.78,0.84,0.92), vec3(0.03,0.05,0.10), night), clamp(-d.y * 8.0, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`;

  // 오로라 커튼: 아래는 초록, 위로 갈수록 붉은 보라 (우리나라처럼 위도가 낮은 곳에서는 붉은 빛이 주로 보인다)
  const AUR_VS = `
    uniform float time; uniform float seed;
    varying vec2 vUv;
    void main(){
      vUv = uv;
      vec3 p = position;
      p.z += sin(uv.x * 9.0 + time * 0.35 + seed) * 14.0 + sin(uv.x * 23.0 - time * 0.6 + seed * 2.0) * 5.0;
      p.x += sin(uv.x * 5.0 + time * 0.25 + seed) * 6.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const AUR_FS = `
    uniform float time; uniform float k; uniform float seed;
    varying vec2 vUv;
    void main(){
      float x = vUv.x, y = vUv.y;
      float streak = 0.55 + 0.45 * sin(x * 140.0 + time * 0.9 + sin(x * 17.0 + time * 0.4 + seed) * 4.0);
      streak *= 0.6 + 0.4 * sin(x * 37.0 - time * 0.5 + seed);
      float edge = smoothstep(0.0, 0.07, y) * pow(1.0 - y, 1.3);
      float ends = smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x);
      vec3 green = vec3(0.25, 1.0, 0.55), red = vec3(1.0, 0.22, 0.42), violet = vec3(0.55, 0.25, 1.0);
      vec3 col = mix(green, red, smoothstep(0.12, 0.55, y));
      col = mix(col, violet, smoothstep(0.7, 1.0, y) * 0.6);
      float a = edge * ends * streak * k;
      gl_FragColor = vec4(col * a, a);
    }`;

  const SNOW_VS = `
    uniform float time; uniform float size;
    attribute float phase;
    varying float vA;
    void main(){
      vec3 p = position;
      float fall = 1.2 + fract(phase * 7.13) * 1.4;
      p.y = mod(p.y - time * fall, 34.0) - 2.0;
      p.x += sin(time * 0.7 + phase * 6.28) * 0.8;
      p.z += cos(time * 0.5 + phase * 3.1) * 0.6;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = size * (0.5 + fract(phase * 3.7)) * (120.0 / -mv.z);
      vA = 0.9;
      gl_Position = projectionMatrix * mv;
    }`;
  const SNOW_FS = `
    uniform vec3 color; varying float vA;
    void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(color, vA * smoothstep(0.5, 0.15, d)); }`;

  // ── 세계 ────────────────────────────────────────────────
  class World {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.mode = opts.mode || 'student';
      this.ok = false;
      try {
        this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
      } catch (e) { console.warn('[sunspot] WebGL 없음', e); return; }
      this.ok = true;
      const r = this.renderer;
      r.setPixelRatio(Math.min(root.devicePixelRatio || 1, this.mode === 'host' ? 1.5 : 1.75));
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
      this.camera.position.set(0, 12, 30);
      this.clock = new THREE.Clock();
      this.t = 0;
      this.players = new Map();
      this.meId = null;
      this.myAim = null;
      this.sun = {az: 168, alt: 30};
      this.night = 0; this.nightTarget = 0;
      this.aur = 0; this.aurTarget = 0;
      this.camMode = this.mode === 'host' ? 'overview' : 'me';
      this.camPos = new THREE.Vector3(0, 12, 30); this.camLook = new THREE.Vector3(0, 4, -10);
      this.floaters = [];
      this.gold = false;
      this.podium = null;
      this.onFrame = null;
      this.buildMaterials();
      this.buildSky();
      this.buildGround();
      this.buildScenery();
      this.buildSnow();
      this.buildAurora();
      this.resize();
      if (root.ResizeObserver) { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas.parentElement || canvas); }
      else root.addEventListener('resize', () => this.resize());
      const loop = () => { this.raf = requestAnimationFrame(loop); this.frame(); };
      loop();
    }

    resize() {
      if (!this.ok) return;
      const el = this.canvas.parentElement || this.canvas, w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      if (w === this.w && h === this.h) return;
      this.w = w; this.h = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = this.mode === 'host' ? 66 : (w / h < 0.9 ? 66 : 55);
      this.camera.updateProjectionMatrix();
    }

    buildMaterials() {
      this.mat = {
        solid: new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.04}),
        tube: new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.12}),
        snow: new THREE.MeshStandardMaterial({color: 0xf3f7fc, flatShading: true, roughness: 0.95}),
        blob: new THREE.MeshBasicMaterial({map: glowTexture([[0, 'rgba(40,60,90,.38)'], [0.6, 'rgba(40,60,90,.12)'], [1, 'rgba(40,60,90,0)']]), transparent: true, depthWrite: false}),
        sunGlow: glowTexture([[0, 'rgba(255,255,245,1)'], [0.1, 'rgba(255,250,225,1)'], [0.16, 'rgba(255,225,150,.5)'], [0.4, 'rgba(255,190,110,.13)'], [1, 'rgba(255,170,90,0)']]),
        lamp: glowTexture([[0, 'rgba(255,230,170,1)'], [0.25, 'rgba(255,200,120,.5)'], [1, 'rgba(255,180,90,0)']])
      };
      this.hemi = new THREE.HemisphereLight(0xe8f1ff, 0x9fb0c8, 0.95);
      this.dir = new THREE.DirectionalLight(0xfff0d8, 0.85);
      this.amb = new THREE.AmbientLight(0xffffff, 0.12);
      this.scene.add(this.hemi, this.dir, this.amb);
      this.scene.fog = new THREE.Fog(0xd5e3f2, 70, 340);
    }

    buildSky() {
      this.skyU = {sunDir: {value: new THREE.Vector3(0, 0.5, -0.86)}, night: {value: 0}, aur: {value: 0}};
      const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
        uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false}));
      sky.renderOrder = -10;
      this.scene.add(sky);
      this.sky = sky;
      // 해: 실제보다 크게(겉보기 지름 약 4°) 그려 화면에서 잘 보이게
      this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({map: this.mat.sunGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false}));
      this.sunSprite.scale.set(this.mode === 'host' ? 56 : 66, this.mode === 'host' ? 56 : 66, 1);
      this.scene.add(this.sunSprite);
      // 별
      const n = 1100, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, h = Math.asin(Math.random() * 0.98 + 0.02);
        pos[i * 3] = 460 * Math.cos(h) * Math.cos(a); pos[i * 3 + 1] = 460 * Math.sin(h); pos[i * 3 + 2] = 460 * Math.cos(h) * Math.sin(a);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false}));
      this.scene.add(this.stars);
    }

    buildGround() {
      const g = new THREE.CircleGeometry(420, 64);
      g.rotateX(-Math.PI / 2);
      const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color: 0xeef3f9, roughness: 1}));
      this.scene.add(ground);
      // 관측 데크: 살짝 높은 나무 바닥 (모둠 자리 네 곳)
      const parts = [];
      for (let t = 0; t < 4; t++) {
        const zx = (t - 1.5) * 11.5;
        parts.push(part(new THREE.BoxGeometry(10.4, 0.16, 11.5), '#c9a27a', [zx, 0.08, 4.0]));
        for (let k = 0; k < 6; k++) parts.push(part(new THREE.BoxGeometry(10.2, 0.02, 0.05), '#a8805d', [zx, 0.17, -1.5 + k * 2.2]));
        parts.push(part(new THREE.BoxGeometry(10.6, 0.06, 11.7), '#ffffff', [zx, 0.02, 4.0]));
      }
      this.scene.add(new THREE.Mesh(merge(parts), this.mat.solid));
    }

    buildScenery() {
      const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
      const rock = [], snowy = [];
      // 먼 산 (남쪽은 낮게 해서 해가 가리지 않게)
      for (let i = 0; i < 42; i++) {
        const a = (i / 42) * Math.PI * 2 + rnd() * 0.1, d = 210 + rnd() * 70;
        const southness = Math.max(0, -Math.sin(a));   // z<0 쪽
        const h = (28 + rnd() * 40) * (1 - 0.45 * southness), w = 38 + rnd() * 40;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        rock.push(part(new THREE.ConeGeometry(w, h, 5 + Math.floor(rnd() * 3)), rnd() < 0.5 ? '#8794a8' : '#7a879c', [x, h / 2 - 1, z], [0, rnd() * 3, 0]));
        snowy.push(part(new THREE.ConeGeometry(w * 0.42, h * 0.42, 5 + Math.floor(rnd() * 3)), '#ffffff', [x, h * 0.79 - 1, z], [0, rnd() * 3, 0]));
      }
      // 소나무
      for (let i = 0; i < 70; i++) {
        const a = rnd() * Math.PI * 2, d = 36 + rnd() * 90;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(x) < 30 && z > -16 && z < 30) continue;
        const s = 0.8 + rnd() * 1.4;
        rock.push(part(new THREE.CylinderGeometry(0.25 * s, 0.3 * s, 1.4 * s, 5), '#6b4f3a', [x, 0.7 * s, z]));
        for (let k = 0; k < 3; k++) {
          const yy = (1.4 + k * 1.25) * s, rr = (2.0 - k * 0.5) * s;
          rock.push(part(new THREE.ConeGeometry(rr, 2.1 * s, 7), k % 2 ? '#2f6b55' : '#2a5f4c', [x, yy + 0.9 * s, z], [0, rnd() * 3, 0]));
          snowy.push(part(new THREE.ConeGeometry(rr * 0.62, 0.8 * s, 7), '#fbfdff', [x, yy + 1.62 * s, z], [0, rnd() * 3, 0]));
        }
      }
      // 눈 더미
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, d = 26 + rnd() * 30;
        const x = Math.cos(a) * d, z = Math.sin(a) * d + 6;
        if (Math.abs(x) < 26 && z > -10 && z < 26) continue;
        snowy.push(part(new THREE.IcosahedronGeometry(1.6 + rnd() * 2.4, 0), '#f6f9fd', [x, 0, z], [rnd(), rnd(), 0], [1.6, 0.55, 1.2]));
      }
      // 돔 관측소
      const dx = -38, dz = 4;
      rock.push(part(new THREE.CylinderGeometry(6, 6.2, 6, 20), '#e9edf2', [dx, 3, dz]));
      rock.push(part(new THREE.SphereGeometry(6.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#c7d0db', [dx, 6, dz]));
      rock.push(part(new THREE.BoxGeometry(1.6, 5.2, 0.8), '#1d2836', [dx + 1.2, 8.4, dz - 4.3], [-0.55, 0, 0.2]));
      rock.push(part(new THREE.BoxGeometry(2, 3, 0.3), '#5b6b7e', [dx + 4.6, 1.5, dz - 3.6], [0, -0.9, 0]));
      snowy.push(part(new THREE.SphereGeometry(6.2, 20, 6, 0, Math.PI * 2, 0, 0.5), '#ffffff', [dx, 6.05, dz]));
      // 눈사람
      const sx = 1.5, sz = -5.5;
      snowy.push(part(new THREE.SphereGeometry(0.85, 14, 10), '#ffffff', [sx, 0.75, sz]));
      snowy.push(part(new THREE.SphereGeometry(0.6, 14, 10), '#ffffff', [sx, 1.95, sz]));
      snowy.push(part(new THREE.SphereGeometry(0.42, 14, 10), '#ffffff', [sx, 2.85, sz]));
      rock.push(part(new THREE.ConeGeometry(0.08, 0.5, 6), '#ff7a1a', [sx, 2.85, sz + 0.62], [Math.PI / 2, 0, 0]));
      rock.push(part(new THREE.SphereGeometry(0.05, 6, 4), '#111', [sx - 0.14, 2.97, sz + 0.37]));
      rock.push(part(new THREE.SphereGeometry(0.05, 6, 4), '#111', [sx + 0.14, 2.97, sz + 0.37]));
      rock.push(part(new THREE.TorusGeometry(0.42, 0.1, 6, 14), '#e03131', [sx, 2.47, sz], [Math.PI / 2, 0, 0]));
      rock.push(part(new THREE.CylinderGeometry(0.3, 0.32, 0.45, 12), '#26303b', [sx, 3.35, sz]));
      rock.push(part(new THREE.CylinderGeometry(0.48, 0.48, 0.04, 14), '#26303b', [sx, 3.13, sz]));
      rock.push(rod([sx - 0.5, 2.0, sz], [sx - 1.25, 2.6, sz + 0.2], 0.035, '#6b4f3a'));
      rock.push(rod([sx + 0.5, 2.0, sz], [sx + 1.2, 2.5, sz - 0.1], 0.035, '#6b4f3a'));
      // 가로등 (밤에 켜짐)
      this.lamps = [];
      [[-31, -7], [31, -7], [-31, 16], [31, 16], [-7, 29], [7, 29]].forEach(([x, z]) => {
        rock.push(part(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 6), '#2b3440', [x, 2.1, z]));
        rock.push(part(new THREE.BoxGeometry(0.5, 0.3, 0.5), '#2b3440', [x, 4.3, z]));
        const s = new THREE.Sprite(new THREE.SpriteMaterial({map: this.mat.lamp, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0}));
        s.position.set(x, 4.1, z); s.scale.set(5, 5, 1);
        this.scene.add(s); this.lamps.push(s);
      });
      this.scene.add(new THREE.Mesh(merge(rock), this.mat.solid));
      this.scene.add(new THREE.Mesh(merge(snowy), this.mat.solid));
      // 모둠 깃발
      this.flags = [];
      M.TEAMS.forEach((tm, t) => {
        const zx = (t - 1.5) * 11.5;
        const fx = zx - 5.75, fz = -7.5;
        const pole = new THREE.Mesh(merge([part(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), '#dfe5ec', [fx, 1.6, fz]),
          part(new THREE.SphereGeometry(0.1, 8, 6), '#ffd43b', [fx, 3.22, fz])]), this.mat.solid);
        this.scene.add(pole);
        const c = document.createElement('canvas'); c.width = 256; c.height = 160;
        const x = c.getContext('2d');
        x.fillStyle = tm.color; x.fillRect(0, 0, 256, 160);
        x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, 120, 256, 40);
        x.font = `900 58px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
        x.fillText(tm.icon + ' ' + tm.name, 128, 70);
        const geo = new THREE.PlaneGeometry(1.7, 1.06, 12, 1);
        geo.translate(0.85, 0, 0);
        const flag = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c), side: THREE.DoubleSide}));
        flag.position.set(fx + 0.04, 2.62, fz);
        flag.userData.base = Float32Array.from(geo.attributes.position.array);
        this.scene.add(flag); this.flags.push(flag);
      });
    }

    buildSnow() {
      const n = this.mode === 'host' ? 1800 : 1100, pos = new Float32Array(n * 3), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 110; pos[i * 3 + 1] = Math.random() * 34; pos[i * 3 + 2] = (Math.random() - 0.5) * 90 + 6;
        ph[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
      this.snowU = {time: {value: 0}, size: {value: 2.2 * (this.renderer.getPixelRatio())}, color: {value: new THREE.Color(0xffffff)}};
      this.snow = new THREE.Points(g, new THREE.ShaderMaterial({uniforms: this.snowU, vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false}));
      this.snow.frustumCulled = false;
      this.scene.add(this.snow);
    }

    buildAurora() {
      this.aurora = new THREE.Group();
      this.aurU = [];
      [[0, 260, 1.0, 0], [-60, 300, 0.8, 1.7], [70, 230, 0.7, 3.1]].forEach(([x, z, s, seed]) => {
        const u = {time: {value: 0}, k: {value: 0}, seed: {value: seed}};
        const geo = new THREE.PlaneGeometry(320 * s, 110 * s, 120, 1);
        const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({uniforms: u, vertexShader: AUR_VS, fragmentShader: AUR_FS,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide}));
        m.position.set(x, 55 * s + 42, z);
        m.rotation.y = Math.PI + x * 0.001;
        m.frustumCulled = false;
        this.aurora.add(m); this.aurU.push(u);
      });
      this.aurora.visible = false;
      this.scene.add(this.aurora);
    }

    // ── 망원경 + 캐릭터 하나 ─────────────────────────────────────
    makeRig(team) {
      const tc = M.TEAMS[team] ? M.TEAMS[team].color : '#8a96a3';
      const rig = new THREE.Group();
      // 그림자 얼룩
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), this.mat.blob);
      blob.rotation.x = -Math.PI / 2; blob.position.y = 0.19; rig.add(blob);
      const blob2 = blob.clone(); blob2.scale.set(0.6, 0.6, 0.6); blob2.position.set(-1.0, 0.19, 0.5); rig.add(blob2);
      // 삼각대
      const hub = [0, 1.15, 0], tri = [];
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + Math.PI / 6;
        tri.push(rod(hub, [0.6 * Math.cos(a), 0.17, 0.6 * Math.sin(a)], 0.035, '#3b4048'));
        tri.push(rod([0.27 * Math.cos(a), 0.62, 0.27 * Math.sin(a)], [0, 0.6, 0], 0.015, '#59616b'));
      }
      tri.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), '#59616b', [0, 0.6, 0]));
      tri.push(part(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 10), '#2b2f36', [0, 1.19, 0]));
      rig.add(new THREE.Mesh(merge(tri), this.mat.solid));
      // 방위각 축
      const azG = new THREE.Group(); azG.position.y = 1.25; rig.add(azG);
      azG.add(new THREE.Mesh(merge([
        part(new THREE.BoxGeometry(0.34, 0.07, 0.22), '#e9ecef', [0, 0.03, 0]),
        part(new THREE.BoxGeometry(0.07, 0.4, 0.14), '#e9ecef', [0.19, 0.22, 0]),
        part(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), '#2b2f36', [0.19, 0.32, 0], [0, 0, Math.PI / 2])
      ]), this.mat.solid));
      // 고도 축 + 경통 (경통은 -z 를 향함)
      const altG = new THREE.Group(); altG.position.set(0.07, 0.32, 0); azG.add(altG);
      const RX = [Math.PI / 2, 0, 0];
      altG.add(new THREE.Mesh(merge([
        part(new THREE.CylinderGeometry(0.085, 0.085, 1.1, 14), '#f4f5f7', [0, 0, -0.25], RX),
        part(new THREE.CylinderGeometry(0.102, 0.102, 0.24, 14), tc, [0, 0, -0.78], RX),
        part(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 14), '#2b2f36', [0, 0, 0.3], RX),
        part(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), '#2b2f36', [0, 0, 0.42], RX),
        part(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 8), '#2b2f36', [0, 0.14, -0.15], RX),
        part(new THREE.BoxGeometry(0.03, 0.08, 0.03), '#2b2f36', [0, 0.1, -0.05]),
        part(new THREE.BoxGeometry(0.03, 0.08, 0.03), '#2b2f36', [0, 0.1, -0.25]),
        part(new THREE.BoxGeometry(0.06, 0.06, 0.5), '#9aa3ad', [0.13, 0, 0.62]),
        part(new THREE.BoxGeometry(0.06, 0.06, 0.5), '#9aa3ad', [-0.13, 0, 0.62]),
        part(new THREE.BoxGeometry(0.46, 0.46, 0.012), '#d8dde3', [0, 0, 0.2]),    // 차광판
        part(new THREE.BoxGeometry(0.4, 0.4, 0.02), '#454d57', [0, 0, 0.88])       // 투영판 틀
      ]), this.mat.tube));
      // 투영판 (앞면: 망원경 쪽, 뒷면: 내 화면이면 실제 투영판 그림)
      const plateMat = new THREE.MeshBasicMaterial({color: 0xfffaf0, side: THREE.DoubleSide});
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), plateMat);
      plate.position.set(0, 0, 0.895); altG.add(plate);
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshBasicMaterial({color: 0xffe9a8, side: THREE.DoubleSide}));
      spot.position.set(0, 0, 0.902); spot.visible = false; altG.add(spot);
      // 파인더 뚜껑
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 8), new THREE.MeshStandardMaterial({color: tc}));
      cap.rotation.x = Math.PI / 2; cap.position.set(0, 0.14, -0.31); cap.visible = false; altG.add(cap);
      // 빛줄기
      const beamMat = new THREE.MeshBasicMaterial({color: new THREE.Color(tc), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false});
      const beamGeo = new THREE.CylinderGeometry(0.03, 0.12, 90, 6, 1, true); beamGeo.rotateX(Math.PI / 2); beamGeo.translate(0, 0, -45.9);
      const beam = new THREE.Mesh(beamGeo, beamMat); altG.add(beam);
      // 캐릭터
      const av = new THREE.Group(); av.position.set(-1.0, 0.18, 0.5); rig.add(av);
      const body = new THREE.Group(); av.add(body);
      body.add(new THREE.Mesh(this.avatarBody(tc), this.mat.solid));
      const head = new THREE.Mesh(this.avatarHead(tc), this.mat.solid); head.position.y = 1.1; body.add(head);
      // 이름표
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({transparent: true, depthWrite: false, depthTest: false}));
      const big = this.mode === 'host' ? 1.6 : 1;
      tag.position.set(-0.5, 2.25 + (big - 1) * 0.6, 0.4); tag.scale.set(1.9 * big, 0.475 * big, 1); tag.renderOrder = 5;
      rig.add(tag);
      return {rig, azG, altG, plate, plateMat, spot, cap, beam, beamMat, av, body, head, tag, tc};
    }
    avatarBody(tc) {
      if (!this._bodyGeo) this._bodyGeo = {};
      if (this._bodyGeo[tc]) return this._bodyGeo[tc];
      const g = merge([
        part(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 6), '#2b3440', [-0.1, 0.13, 0]),
        part(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 6), '#2b3440', [0.1, 0.13, 0]),
        part(new THREE.SphereGeometry(0.29, 12, 8), tc, [0, 0.45, 0], [0, 0, 0], [1, 0.9, 0.95]),
        part(new THREE.CylinderGeometry(0.24, 0.29, 0.42, 12), tc, [0, 0.62, 0]),
        part(new THREE.TorusGeometry(0.2, 0.075, 6, 14), '#ffffff', [0, 0.86, 0], [Math.PI / 2, 0, 0]),
        part(new THREE.BoxGeometry(0.11, 0.3, 0.05), '#ffffff', [0.12, 0.7, 0.2], [0.1, 0, 0.1]),
        part(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 6), tc, [-0.3, 0.62, 0.04], [0.2, 0, -0.5]),
        part(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 6), tc, [0.3, 0.62, 0.04], [0.2, 0, 0.5]),
        part(new THREE.SphereGeometry(0.075, 6, 5), '#ffffff', [-0.39, 0.45, 0.08]),
        part(new THREE.SphereGeometry(0.075, 6, 5), '#ffffff', [0.39, 0.45, 0.08])
      ]);
      this._bodyGeo[tc] = g;
      return g;
    }
    avatarHead(tc) {
      if (!this._headGeo) this._headGeo = {};
      if (this._headGeo[tc]) return this._headGeo[tc];
      const dark = '#' + shade(tc, 0.78).getHexString();
      const g = merge([
        part(new THREE.SphereGeometry(0.28, 14, 10), '#ffe1c4', [0, 0, 0]),
        part(new THREE.SphereGeometry(0.035, 6, 5), '#1b1f27', [-0.095, 0.02, 0.255]),
        part(new THREE.SphereGeometry(0.035, 6, 5), '#1b1f27', [0.095, 0.02, 0.255]),
        part(new THREE.SphereGeometry(0.045, 6, 5), '#ff9fae', [-0.16, -0.06, 0.215], [0, 0, 0], [1, 0.6, 0.5]),
        part(new THREE.SphereGeometry(0.045, 6, 5), '#ff9fae', [0.16, -0.06, 0.215], [0, 0, 0], [1, 0.6, 0.5]),
        part(new THREE.SphereGeometry(0.295, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, [0, 0.06, 0], [-0.12, 0, 0], [1, 0.85, 1]),
        part(new THREE.TorusGeometry(0.27, 0.05, 6, 16), '#ffffff', [0, 0.07, 0.01], [Math.PI / 2 - 0.12, 0, 0]),
        part(new THREE.SphereGeometry(0.08, 8, 6), '#ffffff', [0, 0.36, -0.04])
      ]);
      this._headGeo[tc] = g;
      return g;
    }

    tagTexture(p, rec) {
      const key = [p.name, p.team, p.icon || '', p.on === false ? 0 : 1, rec.isMe ? 1 : 0].join('|');
      if (rec.tagKey === key) return;
      rec.tagKey = key;
      const c = document.createElement('canvas'); c.width = 384; c.height = 96;
      const x = c.getContext('2d');
      const tc = M.TEAMS[p.team] ? M.TEAMS[p.team].color : '#8a96a3';
      const label = (p.on === false ? '💤 ' : (p.icon ? p.icon + ' ' : '')) + (p.name || '?');
      x.font = `800 44px ${FONT}`;
      const w = Math.min(376, x.measureText(label).width + 44);
      x.fillStyle = rec.isMe ? tc : 'rgba(255,255,255,.92)';
      roundRect(x, 192 - w / 2, 12, w, 70, 35); x.fill();
      x.lineWidth = 5; x.strokeStyle = tc; x.stroke();
      x.fillStyle = rec.isMe ? '#fff' : '#14283a';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(label, 192, 49, 340);
      if (rec.tag.material.map) rec.tag.material.map.dispose();
      rec.tag.material.map = new THREE.CanvasTexture(c);
      rec.tag.material.needsUpdate = true;
    }

    // 자리: 모둠마다 데크 하나, 들어온 순서대로 3열로 선다
    slotPos(team, i) {
      const zx = (clamp(team, 0, 3) - 1.5) * 11.5, col = i % 3, row = Math.floor(i / 3);
      return new THREE.Vector3(zx + (col - 1) * 3.5 + 0.45, 0, row * 3.6 + (col === 1 ? 0.7 : 0));
    }

    // 실시간으로 받은 플레이어 목록 반영
    setPlayers(players, meId) {
      if (!this.ok) return;
      this.meId = meId;
      const list = Object.entries(players || {}).filter(([, p]) => p && p.name)
        .sort((a, b) => ((a[1].team || 0) - (b[1].team || 0)) || ((a[1].joined || 0) - (b[1].joined || 0)) || (a[0] < b[0] ? -1 : 1));
      const seen = new Set(), count = [0, 0, 0, 0];
      for (const [id, p] of list) {
        seen.add(id);
        const team = clamp(p.team | 0, 0, 3);
        let rec = this.players.get(id);
        if (rec && rec.team !== team) { this.scene.remove(rec.rig); this.players.delete(id); rec = null; }
        if (!rec) {
          rec = Object.assign(this.makeRig(team), {id, team, az: 150, alt: 10, tAz: 150, tAlt: 10, jump: 0, phase: Math.random() * 6, st: p.st, isMe: id === meId, lastEm: 0, lastEv: 0});
          rec.rig.position.copy(this.slotPos(team, count[team]));
          rec.az = rec.tAz = p.az != null ? p.az : 150; rec.alt = rec.tAlt = p.alt != null ? p.alt : 10;
          rec.lastEm = p.em ? p.em.t : 0; rec.lastEv = p.ev ? p.ev.t : 0;
          this.scene.add(rec.rig);
          this.players.set(id, rec);
          if (rec.isMe && this.myPlate) this.attachPlate(rec);
        }
        rec.isMe = id === meId;
        rec.home = this.slotPos(team, count[team]++);
        if (p.az != null) rec.tAz = p.az;
        if (p.alt != null) rec.tAlt = p.alt;
        rec.aligned = !!p.al;
        rec.capOn = !!p.cap;
        rec.off = p.on === false;
        if (p.st !== rec.st) {
          const order = Object.keys(M.STAGES);
          if (order.indexOf(p.st) > order.indexOf(rec.st)) rec.jump = 1;
          rec.st = p.st;
        }
        this.tagTexture(Object.assign({}, p, {icon: this.mode === 'host' && M.STAGES[p.st] && p.st !== 'lobby' ? M.STAGES[p.st].icon : ''}), rec);
        if (p.em && p.em.t !== rec.lastEm) { rec.lastEm = p.em.t; this.float(rec, emojiTexture(p.em.e), 1.0); }
        if (p.ev && p.ev.t !== rec.lastEv) { rec.lastEv = p.ev.t; if (p.ev.pop) this.float(rec, textTexture(p.ev.pop, p.ev.c || '#ffd43b'), 1.6, 0.4); }
      }
      for (const [id, rec] of this.players) if (!seen.has(id)) { this.scene.remove(rec.rig); this.players.delete(id); }
    }
    // 내 망원경은 서버를 거치지 않고 바로 움직인다
    setMyAim(az, alt) { this.myAim = {az, alt}; }
    setMyPlate(canvas) {
      this.myPlate = new THREE.CanvasTexture(canvas);
      this.myPlate.minFilter = THREE.LinearFilter; this.myPlate.generateMipmaps = false;
      const me = this.players.get(this.meId);
      if (me) this.attachPlate(me);
    }
    attachPlate(rec) { rec.plateMat.map = this.myPlate; rec.plateMat.color.set(0xffffff); rec.plateMat.needsUpdate = true; }
    plateDirty() { if (this.myPlate) this.myPlate.needsUpdate = true; }

    float(rec, tex, scale = 1, y0 = 0) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false, depthTest: false}));
      s.renderOrder = 6;
      const base = rec.rig.position.clone().add(new THREE.Vector3(-0.6, 2.8 + y0, 0.4));
      s.position.copy(base);
      this.scene.add(s);
      this.floaters.push({s, base, t: 0, scale, aspect: tex.image ? tex.image.width / tex.image.height : 1});
    }
    emote(id, e) { const r = this.players.get(id); if (r) this.float(r, emojiTexture(e), 1.0); }
    pop(id, text, color) { const r = this.players.get(id); if (r) this.float(r, textTexture(text, color || '#ffd43b'), 1.6, 0.4); }

    setSun(s) { this.sun = s; }
    setNight(v) { this.nightTarget = v; }
    setAurora(v) { this.aurTarget = v; if (v) this.aurora.visible = true; }
    setGold(on) {
      if (on === this.gold) return;
      this.gold = on;
      this.mat.tube.color.set(on ? 0xffd062 : 0xffffff);
      this.mat.tube.emissive.set(on ? 0x3a2500 : 0x000000);
    }
    setCamera(mode) { this.camMode = mode; }

    // 시상대: 1~3등 캐릭터를 올린다 (북쪽 하늘의 오로라를 배경으로)
    showPodium(top) {
      this.hidePodium();
      const g = new THREE.Group(); g.position.set(0, 0.18, 24);
      const H = [1.5, 1.05, 0.75], X = [0, -1.9, 1.9], C = ['#ffd43b', '#ced4da', '#e8a46a'];
      const parts = [];
      top.slice(0, 3).forEach((p, i) => {
        parts.push(part(new THREE.BoxGeometry(1.8, H[i], 1.6), C[i], [X[i], H[i] / 2, 0]));
        parts.push(part(new THREE.BoxGeometry(1.84, 0.08, 1.64), '#ffffff', [X[i], H[i], 0]));
        const tc = M.TEAMS[p.team] ? M.TEAMS[p.team].color : '#8a96a3';
        const av = new THREE.Group(); av.position.set(X[i], H[i] + 0.02, 0); av.rotation.y = Math.PI; av.scale.setScalar(1.35);
        av.add(new THREE.Mesh(this.avatarBody(tc), this.mat.solid));
        const hd = new THREE.Mesh(this.avatarHead(tc), this.mat.solid); hd.position.y = 1.1; av.add(hd);
        av.userData = {i, ph: i * 0.7};
        g.add(av);
        const num = new THREE.Sprite(new THREE.SpriteMaterial({map: textTexture(String(i + 1), '#fff'), transparent: true, depthWrite: false}));
        num.position.set(X[i], H[i] * 0.5, -0.85); num.scale.set(1.6, 0.4, 1); g.add(num);
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({map: textTexture(p.name, '#fff', tc), transparent: true, depthWrite: false, depthTest: false}));
        tag.position.set(X[i], H[i] + 2.55, 0); tag.scale.set(2.6, 0.65, 1); tag.renderOrder = 7; g.add(tag);
      });
      g.add(new THREE.Mesh(merge(parts), this.mat.solid));
      // 꽃가루
      const n = 260, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
      const pal = ['#ff5a4e', '#f2b200', '#14b886', '#3d8bff', '#ffffff', '#c084fc'].map(h => new THREE.Color(h));
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 8; pos[i * 3 + 1] = 4 + Math.random() * 6; pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
        const c = pal[i % pal.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        vel.push([(Math.random() - 0.5) * 2, 1 + Math.random() * 3, (Math.random() - 0.5) * 2]);
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const conf = new THREE.Points(cg, new THREE.PointsMaterial({size: 0.16, vertexColors: true}));
      conf.userData.vel = vel;
      g.add(conf);
      this.scene.add(g);
      this.podium = {g, conf};
    }
    hidePodium() { if (this.podium) { this.scene.remove(this.podium.g); this.podium = null; } }

    // ── 매 장면 ───────────────────────────────────────────────
    frame() {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.t += dt;
      const t = this.t;
      // 밤/오로라 전환
      this.night = damp(this.night, this.nightTarget, 0.9, dt);
      this.aur = damp(this.aur, this.aurTarget, 0.6, dt);
      const n = this.night;
      this.skyU.night.value = n; this.skyU.aur.value = this.aur;
      const sd = M.dirVec(this.sun.az, this.sun.alt);
      this.skyU.sunDir.value.set(sd[0], sd[1], sd[2]);
      this.sunSprite.position.set(sd[0] * 420, sd[1] * 420, sd[2] * 420);
      this.sunSprite.material.opacity = 1 - n;
      this.sunSprite.visible = n < 0.98;
      this.dir.position.set(sd[0] * 50, sd[1] * 50, sd[2] * 50);
      this.dir.intensity = lerp(0.85, 0.08, n);
      this.hemi.intensity = lerp(0.95, 0.42, n);
      this.hemi.color.setRGB(lerp(0.91, 0.42 + 0.2 * this.aur, n), lerp(0.95, 0.5 + 0.25 * this.aur, n), lerp(1, 0.85, n));
      this.hemi.groundColor.setRGB(lerp(0.62, 0.12, n), lerp(0.69, 0.16, n), lerp(0.78, 0.3, n));
      this.scene.fog.color.setRGB(lerp(0.835, 0.04, n), lerp(0.89, 0.07, n), lerp(0.95, 0.15, n));
      this.stars.material.opacity = clamp((n - 0.4) / 0.6, 0, 1);
      this.lamps.forEach(l => { l.material.opacity = clamp((n - 0.3) / 0.5, 0, 1); });
      this.snowU.time.value = t;
      this.aurU.forEach(u => { u.time.value = t; u.k.value = this.aur * 0.9; });
      if (this.aur < 0.01 && this.aurTarget === 0) this.aurora.visible = false;
      // 깃발 펄럭임
      this.flags.forEach((f, i) => {
        const pa = f.geometry.attributes.position, b = f.userData.base;
        for (let k = 0; k < pa.count; k++) {
          const x = b[k * 3];
          pa.array[k * 3 + 2] = Math.sin(t * 3 - x * 2.4 + i) * 0.14 * x;
        }
        pa.needsUpdate = true;
      });
      // 망원경과 캐릭터
      for (const rec of this.players.values()) {
        if (rec.isMe && this.myAim) { rec.az = this.myAim.az; rec.alt = this.myAim.alt; }
        else { rec.az = angDamp(rec.az, rec.tAz, 6, dt); rec.alt = damp(rec.alt, rec.tAlt, 6, dt); }
        rec.azG.rotation.y = Math.PI - rec.az * D2R;
        rec.altG.rotation.x = clamp(rec.alt, -5, 88) * D2R;
        rec.rig.position.lerp(rec.home, 1 - Math.exp(-3 * dt));
        const on = rec.aligned;
        rec.beamMat.color.set(on ? 0xffd75a : rec.tc);
        rec.beamMat.opacity = (on ? 0.55 + 0.15 * Math.sin(t * 6) : 0.2) * (1 - n * 0.6);
        rec.beam.visible = n < 0.7;
        rec.spot.visible = on && n < 0.5 && !rec.isMe;
        rec.cap.visible = rec.capOn;
        // 폴짝 (단계를 하나 끝낼 때마다)
        if (rec.jump > 0) rec.jump = Math.max(0, rec.jump - dt * 1.8);
        const j = rec.jump > 0 ? Math.sin((1 - rec.jump) * Math.PI) : 0;
        rec.body.position.y = 0.03 * Math.sin(t * 2.2 + rec.phase) + j * 0.55;
        rec.body.rotation.y = j * Math.PI * 2 * (1 - rec.jump);
        // 바라보는 쪽: 낮에는 투영판(망원경) 쪽으로 반쯤, 밤에는 북쪽 하늘
        const face = n > 0.5 ? 0 : (rec.st === 'lobby' || rec.st === 'done1' || rec.st === 'done2' ? 0.35 : 1.25);
        rec.av.rotation.y = damp(rec.av.rotation.y, face, 3, dt);
        rec.head.rotation.x = n > 0.5 ? -0.45 : (rec.off ? 0.4 : 0);
        rec.av.scale.setScalar(rec.off ? 0.85 : 1);
      }
      // 떠오르는 이모지·글자
      this.floaters = this.floaters.filter(f => {
        f.t += dt;
        const k = f.t / 2.2;
        if (k >= 1) { this.scene.remove(f.s); f.s.material.dispose(); return false; }
        const pop = k < 0.12 ? k / 0.12 : 1;
        f.s.position.set(f.base.x, f.base.y + k * 1.6, f.base.z);
        const sc = 0.9 * f.scale * (0.6 + 0.4 * pop);
        f.s.scale.set(sc * (f.aspect > 1.5 ? f.aspect * 0.5 : 1), sc * (f.aspect > 1.5 ? 0.5 : 1), 1);
        f.s.material.opacity = k > 0.75 ? (1 - k) / 0.25 : 1;
        return true;
      });
      // 시상대
      if (this.podium) {
        this.podium.g.children.forEach(c => {
          if (c.userData && c.userData.ph != null) c.position.y = (c.userData.i === 0 ? 1.52 : c.userData.i === 1 ? 1.07 : 0.77) + Math.abs(Math.sin(t * 3 + c.userData.ph)) * 0.35;
        });
        const pa = this.podium.conf.geometry.attributes.position, v = this.podium.conf.userData.vel;
        for (let i = 0; i < pa.count; i++) {
          pa.array[i * 3] += v[i][0] * dt * 0.6; pa.array[i * 3 + 2] += v[i][2] * dt * 0.6;
          pa.array[i * 3 + 1] -= v[i][1] * dt * 0.5;
          if (pa.array[i * 3 + 1] < 0.2) { pa.array[i * 3 + 1] = 8 + Math.random() * 3; pa.array[i * 3] = (Math.random() - 0.5) * 8; }
        }
        pa.needsUpdate = true;
      }
      this.updateCamera(dt);
      if (this.onFrame) this.onFrame(dt);
      this.renderer.render(this.scene, this.camera);
    }

    updateCamera(dt) {
      const t = this.t, me = this.players.get(this.meId);
      let pos, look;
      if (this.camMode === 'podium' && this.podium) {
        pos = new THREE.Vector3(Math.sin(t * 0.2) * 1.2, 3.6, 15.5); look = new THREE.Vector3(0, 3.6, 30);
      } else if (this.camMode === 'north') {
        const base = me && this.mode !== 'host' ? me.rig.position : new THREE.Vector3(0, 0, -6);
        pos = base.clone().add(new THREE.Vector3(0.4, 2.2, -3.2)); look = base.clone().add(new THREE.Vector3(0, 13, 40));
      } else if (this.camMode === 'me' && me) {
        const a = (this.myAim ? this.myAim.az : me.az), h = clamp(this.myAim ? this.myAim.alt : me.alt, 4, 40);
        const yaw = (a - 180) * 0.55 + 180;                  // 망원경을 돌리면 시점도 절반쯤 따라 돈다
        const hd = M.dirVec(yaw, 0), right = [-hd[2], 0, hd[0]];
        const P = me.rig.position;
        pos = new THREE.Vector3(P.x - hd[0] * 4.4 - right[0] * 0.35, 2.7, P.z - hd[2] * 4.4 - right[2] * 0.35);
        const dv = M.dirVec(a, h);
        look = new THREE.Vector3(P.x + dv[0] * 9, 1.4 + dv[1] * 9, P.z + dv[2] * 9);
      } else {
        const sway = Math.sin(t * 0.06) * 7;
        pos = new THREE.Vector3(sway, 11.5, 29); look = new THREE.Vector3(sway * 0.3 + 1.5, 13.4, -16);
      }
      this.camPos.lerp(pos, 1 - Math.exp(-2.6 * dt));
      this.camLook.lerp(look, 1 - Math.exp(-3.2 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }
  }

  root.SunspotWorld = World;
})(typeof window !== 'undefined' ? window : this);
