/* 흑점 헌터스 — 태양 투영판.
   망원경 뒤에 단 흰 판에 태양 상이 비친다(태양 투영법). 판에는 기록 용지(원)가 끼워져 있다.
   - 조준이 어긋나면 망원경(차광판·경통)의 그림자가 길게 늘어지고 상은 판 밖으로 벗어난다.
     그림자가 동그랗게 줄어들수록 경통이 태양을 똑바로 향한다(그림자 맞추기).
   - 초점이 안 맞으면 상이 흐리다. 렌즈 먼지는 판(시야)에 붙어 있어서 상이 움직여도 제자리에 있다.
   좌표: 투영판 반폭 = 1(가운데 0, 오른쪽 +, 위 +). 원반 좌표: 태양 반지름 = 1(서 +, 북 +). */
(function(root) {
  'use strict';
  const M = root.SunspotModel, SM = root.SunModel;
  const D2R = Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const FONT = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';

  // 쌀알 무늬·채층 그물 무늬 (한 번만 만든다)
  function noiseCanvas(n, draw) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    draw(c.getContext('2d'), n);
    return c;
  }
  let GRAN = null, MOTTLE = null;
  // 캔버스 blur 필터가 실제로 그려지는지. 값을 넣고 읽어 보기만 하면 안 된다 — 필터를 모르는
  // 브라우저(아이패드 사파리 등)에서도 그냥 속성이 하나 생겨서 같은 값이 읽히기 때문이다.
  // 그래서 작은 네모를 흐리게 그려 보고, 옆 화소까지 번졌는지로 판단한다.
  const FILTER_OK = (() => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const x = c.getContext('2d');
      x.filter = 'blur(2px)'; x.fillStyle = '#000'; x.fillRect(7, 7, 2, 2);
      return x.getImageData(12, 8, 1, 1).data[3] > 0;
    } catch (e) { return false; }
  })();
  function granulation() {
    if (GRAN) return GRAN;
    GRAN = noiseCanvas(256, (x, n) => {
      for (let i = 0; i < 3200; i++) {
        const px = Math.random() * n, py = Math.random() * n, r = 0.8 + Math.random() * 1.4;
        x.fillStyle = Math.random() < 0.6 ? 'rgba(255,255,245,.6)' : 'rgba(150,90,40,.35)';
        x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      }
    });
    return GRAN;
  }
  function mottle() {
    if (MOTTLE) return MOTTLE;
    MOTTLE = noiseCanvas(256, (x, n) => {
      for (let i = 0; i < 900; i++) {
        const px = Math.random() * n, py = Math.random() * n, r = 2 + Math.random() * 5;
        x.fillStyle = Math.random() < 0.5 ? 'rgba(255,190,150,.35)' : 'rgba(90,10,0,.35)';
        x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
      }
    });
    return MOTTLE;
  }

  class Board {
    constructor(canvas, opts = {}) {
      this.cv = canvas;
      this.fixed = opts.size || 0;      // 화면에 붙이지 않고 그림만 얻을 때(선생님 화면)
      this.ctx = canvas.getContext('2d');
      this.buf = document.createElement('canvas');
      this.bx = this.buf.getContext('2d');
      this.sun = null; this.day = 0; this.mode = 'white';
      this.off = {x: 9, y: 0};        // 태양 상 중심(판 좌표). 멀리 있으면 안 보인다
      this.mis = {x: 30, y: 10};      // 경통과 태양의 어긋남(°) — 그림자 모양
      this.blur = 0;                  // 흐림(px, CSS)
      this.dust = [];
      this.marks = [];
      this.sheet = null;              // 둘째 관측: 투명 용지 {marks, stars:[{x,y,label,done}]}
      this.calc = null;
      this.flare = null;
      this.labels = false;
      this.clouds = false;
      this.loupe = null;
      this.hint = null;               // {x,y,text} 원반 좌표의 안내 표시
      this.latGuide = null;           // 위도선 안내 (원반 y)
      this.reveal = null;             // 결과 공개 때 놓친 흑점
      this.fx = [];                   // 반짝 효과
      this.shadeC = {x: 0, y: 0}; this.cloudK = 0;
      this.imgKey = '';
      this.resize();
    }

    resize() {
      let S, dpr;
      if (this.fixed) { S = this.fixed; dpr = 1; }
      else {
        const r = this.cv.getBoundingClientRect();
        S = Math.max(120, Math.round(Math.min(r.width, r.height || r.width)));
        dpr = Math.min(root.devicePixelRatio || 1, 2);
      }
      if (S === this.S && dpr === this.dpr) return;
      this.S = S; this.dpr = dpr;
      this.cv.width = this.buf.width = Math.round(S * dpr);
      this.cv.height = this.buf.height = Math.round(S * dpr);
      this.imgKey = '';
    }
    get u() { return this.S / 2; }
    get R() { return M.BOARD_SUN * this.u; }
    imgCenter() { return {x: this.u + this.off.x * this.u, y: this.u - this.off.y * this.u}; }
    toDisk(px, py) { const c = this.imgCenter(); return {x: (px - c.x) / this.R, y: -(py - c.y) / this.R}; }
    fromDisk(x, y) { const c = this.imgCenter(); return {x: c.x + x * this.R, y: c.y - y * this.R}; }
    toBoard(px, py) { return {x: px / this.u - 1, y: 1 - py / this.u}; }

    setSun(sun, day, mode = 'white') {
      if (this.sun === sun && this.day === day && this.mode === mode) return;
      this.sun = sun; this.day = day; this.mode = mode; this.imgKey = '';
      this.spots = sun ? M.spotsOn(sun, day) : [];
    }

    // ── 선명한 태양 상을 미리 그려 둔다 ─────────────────────────────
    buildImage() {
      const key = [this.S, this.dpr, this.sun && this.sun.seed, this.day, this.mode].join('|');
      if (key === this.imgKey) return;
      this.imgKey = key;
      this.blurKey = '';
      const R = this.R * this.dpr, pad = Math.ceil(R * 0.08), n = Math.ceil(2 * R + 2 * pad);
      const c = this.img || (this.img = document.createElement('canvas'));
      c.width = c.height = n;
      const x = c.getContext('2d');
      x.clearRect(0, 0, n, n);
      x.save();
      x.translate(n / 2, n / 2);
      if (this.mode === 'ha') this.paintHa(x, R); else this.paintWhite(x, R);
      x.restore();
      this.imgPad = pad;
    }
    paintWhite(x, R) {
      // 주연 감광: 가장자리로 갈수록 어둡고 붉다
      const g = x.createRadialGradient(0, 0, 0, 0, 0, R);
      for (let i = 0; i <= 12; i++) {
        const r = Math.min(0.999, i / 12), I = SM.limbDarkening(r);
        const k = clamp((I - 0.4) / 0.6, 0, 1);
        g.addColorStop(r, `rgb(${Math.round(222 + 33 * k)},${Math.round(140 + 110 * k)},${Math.round(70 + 162 * k)})`);
      }
      x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.fillStyle = g; x.fill();
      x.save(); x.clip();
      // 쌀알 무늬
      x.globalAlpha = 0.09;
      x.fillStyle = x.createPattern(granulation(), 'repeat');
      x.fillRect(-R, -R, 2 * R, 2 * R);
      x.globalAlpha = 1;
      // 백반: 가장자리 가까운 흑점 무리 둘레의 밝은 무늬
      x.globalCompositeOperation = 'screen';
      for (const s of this.spots) {
        if (s.z > 0.75 || s.kind === 'pore') continue;
        const px = s.x * R, py = -s.y * R, rr = (s.penumbra * 3.2) * D2R * R;
        const fg = x.createRadialGradient(px, py, 0, px, py, rr);
        fg.addColorStop(0, `rgba(255,250,215,${0.35 * (1 - s.z)})`); fg.addColorStop(1, 'rgba(255,250,215,0)');
        x.fillStyle = fg; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill();
      }
      // 흑점: 반암부 → 암부. 가장자리 쪽은 납작하게(원근 단축)
      x.globalCompositeOperation = 'multiply';
      for (const s of this.spots) this.paintSpot(x, R, s, [196, 140, 104], [62, 36, 28]);
      x.restore();
      x.globalCompositeOperation = 'source-over';
    }
    paintSpot(x, R, s, penCol, umbCol) {
      const px = s.x * R, py = -s.y * R, phi = Math.atan2(py, px), mu = clamp(s.z, 0.12, 1);
      const pr = s.penumbra * D2R * R, ur = Math.max(s.umbra * D2R * R, 1.3 * this.dpr);
      const sh = s.shape;
      x.save();
      x.translate(px, py); x.rotate(phi); x.scale(mu, 1);
      if (pr > 0) {
        x.fillStyle = `rgb(${penCol})`;
        for (let k = 0; k < 5; k++) {
          const a = sh[k] * Math.PI * 2, d = pr * 0.22 * sh[(k + 1) % 5];
          x.beginPath(); x.ellipse(Math.cos(a) * d, Math.sin(a) * d, pr * (0.72 + 0.2 * sh[(k + 2) % 5]), pr * (0.66 + 0.24 * sh[(k + 3) % 5]), a, 0, 7); x.fill();
        }
      }
      x.fillStyle = `rgb(${umbCol})`;
      const ua = sh[4] * Math.PI;
      x.beginPath(); x.ellipse(pr * 0.06 * (sh[0] - 0.5), pr * 0.06 * (sh[1] - 0.5), ur, ur * (0.78 + 0.22 * sh[2]), ua, 0, 7); x.fill();
      if (s.kind === 'leader' && sh[3] > 0.5) {   // 큰 흑점은 암부가 둘로 갈라지기도
        x.beginPath(); x.ellipse(ur * 1.1, ur * 0.5, ur * 0.55, ur * 0.5, 0, 0, 7); x.fill();
      }
      x.restore();
    }
    paintHa(x, R) {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, '#ff6a3a'); g.addColorStop(0.7, '#e2401f'); g.addColorStop(0.96, '#b42a14'); g.addColorStop(1, '#8d1e0e');
      x.beginPath(); x.arc(0, 0, R, 0, Math.PI * 2); x.fillStyle = g; x.fill();
      x.save(); x.clip();
      x.globalAlpha = 0.4; x.fillStyle = x.createPattern(mottle(), 'repeat'); x.fillRect(-R, -R, 2 * R, 2 * R); x.globalAlpha = 1;
      // 플라주(흑점 무리 둘레의 밝은 곳)
      x.globalCompositeOperation = 'screen';
      for (const gp of this.sun.groups) {
        const ss = this.spots.filter(s => s.g === gp.id);
        if (!ss.length) continue;
        const cx = ss.reduce((a, s) => a + s.x, 0) / ss.length * R, cy = -ss.reduce((a, s) => a + s.y, 0) / ss.length * R;
        const rr = 0.16 * R;
        const pg = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
        pg.addColorStop(0, 'rgba(255,200,170,.75)'); pg.addColorStop(1, 'rgba(255,200,170,0)');
        x.fillStyle = pg; x.beginPath(); x.ellipse(cx, cy, rr * 1.3, rr * 0.8, 0, 0, 7); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
      // 필라멘트(어두운 실 모양) 두 줄
      const rnd = SM.rng(this.sun.seed + 99);
      x.strokeStyle = 'rgba(80,8,4,.55)'; x.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const a = rnd() * 6.28, d = 0.25 + rnd() * 0.45, cx = Math.cos(a) * d * R, cy = Math.sin(a) * d * R;
        x.lineWidth = (2 + rnd() * 2) * this.dpr;
        x.beginPath(); x.moveTo(cx - 0.18 * R, cy); x.bezierCurveTo(cx - 0.06 * R, cy - 0.08 * R, cx + 0.06 * R, cy + 0.08 * R, cx + 0.18 * R, cy - 0.02 * R); x.stroke();
      }
      x.globalCompositeOperation = 'multiply';
      for (const s of this.spots) if (s.kind !== 'pore') this.paintSpot(x, R, Object.assign({}, s, {penumbra: s.penumbra * 0.6}), [200, 110, 90], [110, 30, 20]);
      x.restore();
      x.globalCompositeOperation = 'source-over';
    }
    // 흐린 상. 캔버스 blur 필터가 되는 브라우저는 그것을 쓰고, 안 되면(옛 사파리) 작게 줄였다가
    // 두 배씩 여러 번 나눠 키워서 가장자리가 계단처럼 보이지 않게 한다.
    blurred() {
      const b = Math.round(this.blur * 2) / 2;
      if (b < 0.5) return this.img;
      const key = this.imgKey + '|' + b;
      if (key === this.blurKey) return this.blurImg;
      this.blurKey = key;
      const n = this.img.width, out = this.blurImg || (this.blurImg = document.createElement('canvas'));
      out.width = out.height = n;
      const o = out.getContext('2d');
      o.clearRect(0, 0, n, n);
      if (FILTER_OK) {
        o.filter = `blur(${(b * this.dpr * 0.55).toFixed(1)}px)`;
        o.drawImage(this.img, 0, 0);
        o.filter = 'none';
        return out;
      }
      let m = Math.max(4, Math.round(n / (1 + b * this.dpr * 0.45)));
      let src = this.img, cur = n;
      const steps = [];
      while (cur / 2 > m) { cur = Math.round(cur / 2); steps.push(cur); }
      steps.push(m);
      this._tmp = this._tmp || [];
      steps.forEach((sz, i) => {
        const c = this._tmp[i] || (this._tmp[i] = document.createElement('canvas'));
        c.width = c.height = sz;
        const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.clearRect(0, 0, sz, sz); x.drawImage(src, 0, 0, sz, sz); src = c;
      });
      for (let i = steps.length - 2; i >= 0; i--) {
        const c = this._tmp[i], sz = c.width, x = c.getContext('2d');
        x.clearRect(0, 0, sz, sz); x.drawImage(src, 0, 0, sz, sz); src = c;
      }
      o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
      o.drawImage(src, 0, 0, n, n);
      return out;
    }

    // ── 그리기 ─────────────────────────────────────────────
    draw(now) {
      this.resize();
      if (!this.sun) return;
      this.buildImage();
      const x = this.bx, d = this.dpr, S = this.S, u = this.u, R = this.R;
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, S, S);
      // 투영판 (햇빛을 받은 흰 판)
      if (!this.clouds) this.cloudK = 0;
      this.shadeC = {x: u, y: u};
      x.fillStyle = this.mode === 'ha' ? '#2a0f0b' : '#fbf8ef';
      x.fillRect(0, 0, S, S);
      if (this.mode !== 'ha') this.drawShadow(x, u);
      // 기록 용지의 원과 십자선
      x.strokeStyle = 'rgba(40,60,90,.38)'; x.lineWidth = 1.2; x.setLineDash([5, 5]);
      x.beginPath(); x.arc(u, u, R, 0, Math.PI * 2); x.stroke();
      x.setLineDash([]);
      x.strokeStyle = 'rgba(40,60,90,.16)';
      x.beginPath(); x.moveTo(u, u - R - 10); x.lineTo(u, u + R + 10); x.moveTo(u - R - 10, u); x.lineTo(u + R + 10, u); x.stroke();
      // 태양 상
      const c = this.imgCenter();
      const visible = Math.hypot(c.x - u, c.y - u) < u * 1.45 + R;
      if (visible) {
        const im = this.blurred(), n = im.width / d, grow = 1 + this.blur * 0.006;
        const shadeDist = Math.hypot(c.x - this.shadeC.x, c.y - this.shadeC.y);
        let alpha = this.mode === 'ha' ? 1 : 1 - 0.45 * smooth(u * 0.4, u * 1.2, shadeDist);
        x.save();
        if (this.cloudK) alpha *= 1 - 0.35 * this.cloudK;
        x.globalAlpha = alpha;
        x.drawImage(im, c.x - n / 2 * grow, c.y - n / 2 * grow, n * grow, n * grow);
        x.restore();
        // 렌즈 먼지: 판에 붙어 있다 (상 위에서만 보인다)
        if (this.mode !== 'ha' && this.dust.length) {
          x.save();
          x.beginPath(); x.arc(c.x, c.y, R * grow, 0, Math.PI * 2); x.clip();
          x.globalCompositeOperation = 'multiply';
          for (const q of this.dust) {
            const px = u + q.x * u, py = u - q.y * u, rr = q.r * u;
            const g = x.createRadialGradient(px, py, 0, px, py, rr * 1.6);
            g.addColorStop(0, 'rgba(120,110,112,1)'); g.addColorStop(0.45, 'rgba(105,96,100,1)'); g.addColorStop(0.75, 'rgba(160,150,150,1)'); g.addColorStop(1, 'rgba(255,255,255,1)');
            x.fillStyle = g; x.beginPath(); x.arc(px, py, rr * 1.6, 0, 7); x.fill();
          }
          x.restore();
        }
        if (this.clouds) this.drawCloud(x, now, c, R);
        if (this.flare) this.drawFlare(x, now);
      }
      if (!visible || Math.hypot(c.x - u, c.y - u) > u * 0.9 + R) this.drawEdgeGlow(x, c, u, now);
      if (this.reveal) this.drawReveal(x);
      if (this.sheet) this.drawSheet(x, now);
      if (this.latGuide != null) {
        const y = c.y - this.latGuide * R, half = Math.sqrt(Math.max(0, 1 - this.latGuide * this.latGuide)) * R;
        x.strokeStyle = 'rgba(255,170,0,.85)'; x.lineWidth = 2; x.setLineDash([6, 6]);
        x.beginPath(); x.moveTo(c.x - half, y); x.lineTo(c.x + half, y); x.stroke(); x.setLineDash([]);
      }
      if (this.calc) this.drawCalc(x);
      this.drawMarks(x, now);
      if (this.labels) this.drawLabels(x, u);
      this.drawFx(x, now);
      if (this.hint) {
        const p = this.fromDisk(this.hint.x, this.hint.y), k = 0.5 + 0.5 * Math.sin(now / 160);
        x.strokeStyle = `rgba(255,190,0,${0.5 + 0.5 * k})`; x.lineWidth = 3;
        x.beginPath(); x.arc(p.x, p.y, 16 + 6 * k, 0, 7); x.stroke();
      }
      // 화면으로 옮기고, 누르고 있으면 돋보기
      const out = this.ctx;
      out.setTransform(1, 0, 0, 1, 0, 0);
      out.clearRect(0, 0, this.cv.width, this.cv.height);
      out.drawImage(this.buf, 0, 0);
      if (this.loupe) this.drawLoupe(out);
    }

    drawShadow(x, u) {
      // 차광판 그림자(판에서 가까워 조금만 밀림) + 경통 그림자(멀어서 길게 늘어짐)
      const mx = clamp(this.mis.x, -40, 40), my = clamp(this.mis.y, -40, 40);
      const sx = -mx * 0.14 * u, sy = my * 0.14 * u;
      const cx = u + clamp(sx, -2.2 * u, 2.2 * u), cy = u + clamp(sy, -2.2 * u, 2.2 * u);
      this.shadeC = {x: cx, y: cy};
      const L = Math.min(Math.hypot(mx, my) * 1.1 * u, 5 * u), ang = Math.atan2(my, -mx);
      const ex = cx + Math.cos(ang) * L, ey = cy + Math.sin(ang) * L;
      x.save();
      x.fillStyle = 'rgba(58,74,96,.62)';
      x.beginPath();
      x.arc(cx, cy, u * 0.93, 0, Math.PI * 2);
      x.fill();
      if (L > 2) {
        const w = u * 0.2, nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
        x.beginPath();
        x.moveTo(cx + nx, cy + ny); x.lineTo(ex + nx, ey + ny);
        x.arc(ex, ey, w, ang + Math.PI / 2, ang - Math.PI / 2, true);
        x.lineTo(cx - nx, cy - ny); x.closePath();
        x.fillStyle = 'rgba(58,74,96,.5)';
        x.fill();
      }
      x.restore();
    }

    // 상이 판 밖에 있으면 그쪽 가장자리가 햇빛으로 환하다 → 그 빛을 가운데로 끌어오면 된다
    drawEdgeGlow(x, c, u, now) {
      if (this.mode === 'ha') return;
      const a = Math.atan2(c.y - u, c.x - u), ex = u + Math.cos(a) * u * 0.98, ey = u + Math.sin(a) * u * 0.98;
      const k = 0.55 + 0.25 * Math.sin(now / 250);
      const g = x.createRadialGradient(ex, ey, 0, ex, ey, u * 0.75);
      g.addColorStop(0, `rgba(255,214,120,${k})`); g.addColorStop(1, 'rgba(255,214,120,0)');
      x.fillStyle = g; x.fillRect(0, 0, 2 * u, 2 * u);
      x.save(); x.translate(u + Math.cos(a) * u * 0.78, u + Math.sin(a) * u * 0.78); x.rotate(a);
      x.fillStyle = 'rgba(200,110,0,.85)';
      x.beginPath(); x.moveTo(14, 0); x.lineTo(-6, -10); x.lineTo(-6, 10); x.fill(); x.restore();
    }
    // 결과 공개: 놓친 흑점에 점선 동그라미
    drawReveal(x) {
      x.save(); x.strokeStyle = '#ff8a00'; x.lineWidth = 2; x.setLineDash([4, 3]);
      for (const s of this.reveal) { const p = this.fromDisk(s.x, s.y); x.beginPath(); x.arc(p.x, p.y, 11, 0, 7); x.stroke(); }
      x.restore();
    }
    drawCloud(x, now, c, R) {
      // 겨울 구름이 가끔 지나간다 (약 26초마다 7초 동안)
      const T = (now / 1000) % 26, k = T < 7 ? Math.sin(T / 7 * Math.PI) : 0;
      this.cloudK = k;
      if (k <= 0.01) return;
      const px = c.x - R * 1.6 + (T / 7) * R * 3.2;
      x.save();
      x.beginPath(); x.arc(c.x, c.y, R * 1.02, 0, Math.PI * 2); x.clip();
      for (let i = 0; i < 4; i++) {
        const bx = px + (i - 1.5) * R * 0.35, by = c.y + Math.sin(i * 2.1) * R * 0.25, rr = R * (0.45 + 0.1 * i);
        const g = x.createRadialGradient(bx, by, 0, bx, by, rr);
        g.addColorStop(0, `rgba(232,236,244,${0.5 * k})`); g.addColorStop(1, 'rgba(232,236,244,0)');
        x.fillStyle = g; x.beginPath(); x.arc(bx, by, rr, 0, 7); x.fill();
      }
      x.restore();
    }

    drawFlare(x, now) {
      const f = this.flare, p = this.fromDisk(f.x, f.y), age = (now - f.t0) / 1000;
      if (age < 0) return;
      const k = smooth(0, 1.6, age) * (0.85 + 0.15 * Math.sin(now / 90));
      const R = this.R, len = R * 0.11, sep = R * 0.035;
      x.save();
      x.globalCompositeOperation = 'lighter';
      const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 0.2);
      g.addColorStop(0, `rgba(255,255,230,${0.9 * k})`); g.addColorStop(0.4, `rgba(255,220,160,${0.45 * k})`); g.addColorStop(1, 'rgba(255,180,120,0)');
      x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, R * 0.2, 0, 7); x.fill();
      x.strokeStyle = `rgba(255,255,240,${k})`; x.lineWidth = Math.max(2.5, R * 0.018); x.lineCap = 'round';
      x.beginPath(); x.moveTo(p.x - len, p.y - sep); x.quadraticCurveTo(p.x, p.y - sep * 2.5, p.x + len, p.y - sep * 0.4);
      x.moveTo(p.x - len * 0.9, p.y + sep); x.quadraticCurveTo(p.x, p.y + sep * 2.2, p.x + len * 0.95, p.y + sep * 0.6); x.stroke();
      x.restore();
    }

    drawSheet(x, now) {
      // 투명 용지: 1일째에 찍은 자리가 파란 연필로 남아 있다
      const c = this.imgCenter(), R = this.R;
      x.fillStyle = 'rgba(120,170,255,.10)';
      x.beginPath(); x.arc(c.x, c.y, R * 1.08, 0, 7); x.fill();
      x.strokeStyle = 'rgba(40,110,230,.55)'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(c.x, c.y, R, 0, 7); x.stroke();
      for (const m of this.sheet.marks || []) {
        if (m.k === 'e') continue;
        const p = this.fromDisk(m.x, m.y);
        x.strokeStyle = m.k === 'd' ? 'rgba(40,110,230,.25)' : 'rgba(40,110,230,.7)';
        x.beginPath(); x.arc(p.x, p.y, 5, 0, 7); x.stroke();
      }
      for (const st of this.sheet.stars || []) {
        const p = this.fromDisk(st.x, st.y), k = st.done ? 0 : 0.5 + 0.5 * Math.sin(now / 200);
        this.star(x, p.x, p.y, 10 + 3 * k, st.done ? '#9aa8bb' : '#ffb000');
        x.font = `800 12px ${FONT}`; x.fillStyle = st.done ? '#6b7b90' : '#c47a00'; x.textAlign = 'center';
        x.fillText(st.label, p.x, p.y - 17);
        if (st.to) {
          const q = this.fromDisk(st.to.x, st.to.y);
          x.strokeStyle = '#ff8a00'; x.lineWidth = 2.5; x.setLineDash([]);
          x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke();
          const a = Math.atan2(q.y - p.y, q.x - p.x);
          x.fillStyle = '#ff8a00';
          x.beginPath(); x.moveTo(q.x, q.y); x.lineTo(q.x - 10 * Math.cos(a - 0.4), q.y - 10 * Math.sin(a - 0.4)); x.lineTo(q.x - 10 * Math.cos(a + 0.4), q.y - 10 * Math.sin(a + 0.4)); x.fill();
        }
      }
    }
    star(x, cx, cy, r, color) {
      x.fillStyle = color; x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      x.closePath(); x.fill(); x.stroke();
    }

    // 교과서 60쪽 그림처럼: 중앙 경선, 위도선(R′), x, y
    drawCalc(x) {
      const k = this.calc, c = this.imgCenter(), R = this.R;
      const y = c.y - k.yLat * R, half = k.Rp * R;
      x.save();
      x.lineWidth = 1.5;
      x.strokeStyle = 'rgba(20,40,70,.55)'; x.setLineDash([4, 4]);
      x.beginPath(); x.moveTo(c.x, c.y - R); x.lineTo(c.x, c.y + R); x.stroke();
      x.strokeStyle = 'rgba(230,120,0,.9)';
      x.beginPath(); x.moveTo(c.x - half, y); x.lineTo(c.x + half, y); x.stroke();
      x.setLineDash([]);
      const p1 = this.fromDisk(k.p1.x, k.p1.y), p2 = this.fromDisk(k.p2.x, k.p2.y);
      const seg = (xa, xb, yy, col, lab) => {
        x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 3;
        x.beginPath(); x.moveTo(xa, yy); x.lineTo(xb, yy); x.stroke();
        x.font = `900 14px ${FONT}`; x.textAlign = 'center'; x.fillText(lab, (xa + xb) / 2, yy - 8);
      };
      seg(p1.x, c.x, y + 14, '#1971c2', 'x');
      seg(c.x, p2.x, y + 30, '#e8590c', 'y');
      x.fillStyle = '#d9480f'; x.font = `800 13px ${FONT}`; x.textAlign = 'right';
      x.fillText('R′', c.x - half - 4, y + 4);
      x.restore();
    }

    drawMarks(x, now) {
      this.marks = this.marks.filter(m => !(m.k === 'e' && now - m.t > 1300));
      for (const m of this.marks) {
        const p = this.fromDisk(m.x, m.y), age = (now - m.t) / 1000;
        if (m.k === 'd') {
          x.strokeStyle = '#e03131'; x.lineWidth = 3; x.lineCap = 'round';
          x.beginPath(); x.moveTo(p.x - 6, p.y - 6); x.lineTo(p.x + 6, p.y + 6); x.moveTo(p.x + 6, p.y - 6); x.lineTo(p.x - 6, p.y + 6); x.stroke();
        } else if (m.k === 'e') {
          x.globalAlpha = clamp(1 - age / 1.3, 0, 1);
          x.fillStyle = '#5f7282'; x.font = `900 16px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
          x.fillText('?', p.x, p.y); x.textBaseline = 'alphabetic';
          x.globalAlpha = 1;
        } else {
          x.strokeStyle = m.day2 ? '#e8590c' : '#16202c'; x.lineWidth = 2;
          x.beginPath(); x.arc(p.x, p.y, 8, 0, 7); x.stroke();
          x.fillStyle = m.day2 ? '#e8590c' : '#16202c';
          x.beginPath(); x.arc(p.x, p.y, 1.6, 0, 7); x.fill();
          if (age < 0.6) {
            x.strokeStyle = `rgba(46,204,113,${1 - age / 0.6})`; x.lineWidth = 3;
            x.beginPath(); x.arc(p.x, p.y, 8 + age * 40, 0, 7); x.stroke();
          }
        }
      }
    }
    drawLabels(x, u) {
      const lab = (t, px, py) => {
        x.font = `900 13px ${FONT}`;
        const w = x.measureText(t).width + 14;
        x.fillStyle = 'rgba(20,40,70,.82)';
        x.beginPath(); x.roundRect ? x.roundRect(px - w / 2, py - 11, w, 22, 11) : x.rect(px - w / 2, py - 11, w, 22); x.fill();
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, px, py + 0.5); x.textBaseline = 'alphabetic';
      };
      lab('북 N', u, 14); lab('남 S', u, 2 * u - 14);
      lab('동 E', 26, u); lab('서 W', 2 * u - 26, u);
    }
    // 반짝임·점수 글자
    burst(px, py, text, color) { this.fx.push({x: px, y: py, text, color, t: performance.now()}); }
    drawFx(x, now) {
      this.fx = this.fx.filter(f => now - f.t < 900);
      for (const f of this.fx) {
        const k = (now - f.t) / 900;
        x.globalAlpha = 1 - k;
        x.font = `900 ${16 + 6 * (1 - k)}px ${FONT}`; x.textAlign = 'center';
        x.lineWidth = 4; x.strokeStyle = 'rgba(255,255,255,.9)'; x.strokeText(f.text, f.x, f.y - 14 - k * 26);
        x.fillStyle = f.color; x.fillText(f.text, f.x, f.y - 14 - k * 26);
        x.globalAlpha = 1;
      }
    }
    drawLoupe(out) {
      const d = this.dpr, L = this.loupe, r = this.u * 0.3, z = 2.4;
      let cy = L.y - r - 34;
      if (cy - r < 0) cy = L.y + r + 34;
      const cx = clamp(L.x, r + 2, this.S - r - 2);
      out.save();
      out.setTransform(d, 0, 0, d, 0, 0);
      out.beginPath(); out.arc(cx, cy, r, 0, 7); out.closePath();
      out.save(); out.clip();
      out.fillStyle = '#fff'; out.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      const sw = (2 * r / z) * d;
      out.drawImage(this.buf, L.x * d - sw / 2, L.y * d - sw / 2, sw, sw, cx - r, cy - r, 2 * r, 2 * r);
      out.restore();
      out.lineWidth = 3; out.strokeStyle = '#14283a'; out.stroke();
      out.strokeStyle = 'rgba(230,60,40,.9)'; out.lineWidth = 1.5;
      out.beginPath(); out.moveTo(cx - 9, cy); out.lineTo(cx + 9, cy); out.moveTo(cx, cy - 9); out.lineTo(cx, cy + 9); out.stroke();
      out.restore();
    }
  }

  Board.FILTER_OK = FILTER_OK;
  root.SunspotBoard = Board;
})(typeof window !== 'undefined' ? window : this);
