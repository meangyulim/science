/* lab.js — 물리 실험실 개념 페이지 공통 도구 (lab.css 와 짝). 의존성 없음.
 *
 * 쓰는 법: 페이지 끝에서 <script src="../../kit/lab.js"></script> 다음에 개념 모형(<ID>-model.js)과 페이지 스크립트.
 *
 *  색      Lab.C            CSS 토큰을 읽은 색 묶음 (Lab.C.ink, .muted, .grid, .paper, .copper, .vel, .acc, .force, .neg, .energy, .violet, ...)
 *                           테마(밝게/어둡게)가 바뀌면 자동으로 다시 읽고, Lab.canvas 로 만든 그림을 모두 다시 그린다.
 *  캔버스  Lab.canvas(id, draw) → v {el, ctx, W, H}   크기가 바뀌면 HiDPI 로 맞춘 뒤 draw(v) 를 부른다. W·H 는 CSS 픽셀.
 *  글자    Lab.text(ctx, s, x, y, {size=13, w=500, color, align='center', base='middle', mono, halo})
 *             size 는 px, 13 미만은 13 으로 올린다(폰에서 읽히게). 굵기 w: 500 보통(기본), 600 이름표·값, 700 정말 중요한 것 하나.
 *             숫자도 본문 글꼴(Noto Sans KR)로 쓴다(mono 는 예전 페이지와 맞추려고 남긴 옵션, 글꼴은 같다). halo: true 면 바탕색 테두리.
 *          Lab.font(size, w, mono) → ctx.font 문자열
 *  그리기  Lab.arrow(ctx, x0, y0, x1, y1, color, width=2.5, head=10)
 *          Lab.bracket(ctx, x0, x1, y, color, label, up=true)      가로 치수선 |←label→|
 *          Lab.vbracket(ctx, x, y0, y1, color, label, right=true)  세로 치수선
 *          Lab.line(ctx, pts, color, width=2, dash)   Lab.circle(ctx, x, y, r, {fill, stroke, width})
 *          Lab.rrect(ctx, x, y, w, h, r)  (경로만)     Lab.paper(ctx, W, H, step)  무대 모눈
 *          Lab.axes(ctx, r, {xmin, xmax, ymin, ymax, xlabel, ylabel, xticks, yticks, fmtX, fmtY, grid})
 *             → {X(v), Y(v), y0}  값 → 픽셀. r = {x, y, w, h} 는 그래프 영역.
 *  움직임  Lab.loop(fn)  화면에 보일 때 매 프레임 fn(dt 초, 최대 0.05)
 *  조작    Lab.play(id, on, onChange) → {set(on), get()}   재생/멈춤 버튼 (구리색 .play)
 *          Lab.slider(id, {out, fmt, onInput}) → {get(), set(v, quiet)}   range + <output id=out>
 *          Lab.group(sel, key, onPick, initial)   data-<key> 버튼 묶음 (aria-pressed 관리) → {set(v, quiet)}
 *          Lab.toggle(id, onChange) → {get(), set(b, quiet)}   체크 상자
 *          Lab.check(id, ok, okText, idleText)    예제 확인 줄 (.check / .check.ok)
 *          Lab.tries(map, after)   [data-try] 버튼 → map[key]() 실행, after(). 무대가 반도 안 보이면 무대로 스크롤
 *          Lab.ans(big, lines, {tone, ctx, f, html})   「지금 값」 카드: #ansBig 에 큰 결과, #ansLines 에 식 줄(HTML 배열),
 *             tone = 'neg'|'vel'|'cu'|'ink'|'small' (기본 초록), ctx → #ansCtx (오른쪽 위 상황), f → #ansF (식 안내 줄),
 *             html: true 면 큰 결과도 HTML (λ<sub>A</sub> 처럼 아래첨자)
 *          Lab.pointer(el, {down(x,y), move(x,y), up()})   마우스·터치 끌기 (세로 스크롤은 페이지가 가짐)
 *  색 섞기 Lab.alpha(color, a) → 'rgba(…)'  토큰 색(#hex·rgb)에 투명도를 입힌다 (그라디언트 멈춤점 등)
 *          Lab.rgb(color) → [r, g, b]   (ImageData 로 픽셀을 칠할 때)      Lab.isDark() → 지금 어두운 테마인가
 *          Lab.wavelengthRGB(nm) → [r, g, b] | null (380~780 nm 가시광선 실제 색)
 *          Lab.wlColor(nm, a=1) → 색 문자열 (가시광선은 실제 색, 자외선은 violet, 적외선은 force 토큰)
 *  글자 더 Lab.tag(ctx, s, x, y, {size, color, bg, border, align, pad})   바탕 상자가 있는 이름표 (복잡한 그림 위)
 *          Lab.rich(ctx, 'E_{k,max} = hf - W', x, y, {size, color, align, w, mono})   아래첨자 _x, _{..}, 위첨자 ^x, ^{..} → 너비
 *          Lab.angle(ctx, cx, cy, r, a0, a1, color, label)   두 방향(라디안, 화면 좌표) 사이 짧은 쪽 호와 각 이름
 *  숫자 더 Lab.sci(v, d, {force: true}) 늘 ×10ⁿ 꼴   Lab.pow10(k) '10²¹'   Lab.fmtLen(m) 'fm~km' 단위 자동 (예: 6e-7 → '600 nm')
 *  축 옵션 Lab.axes(..., {yAt: 'left'}) 세로축을 늘 왼쪽에, {xlabelBelow: true} x 축 이름을 눈금 글자 아래 가운데에
 *  숫자    Lab.fmt(v, d=2)  끝 0 자름, 음수는 −   Lab.sg(v, d) 부호 붙임   Lab.sci(v, d) 1.7 × 10⁸   Lab.frac(v) 5/3
 *  기타    Lab.reduceMotion (움직임 줄이기 설정이면 처음에 멈춘 상태로)
 *  배치    (자동) 관찰 노트 배치를 움직인다 — 페이지 스크립트가 다 돈 뒤(DOMContentLoaded)
 *          · 조작 시트: #sheetBtn 으로 열고 #sheetClose·Esc 로 닫는다 (좁은 화면). 범례(.stage .legend)는 좁은 화면에서 시트 안으로 옮긴다
 *          · 지금 읽는 단계: .steps > .step 중 읽는 줄에 걸린 것에 .on, 무대의 #nowstep 에 그 단계의 data-step 글
 *          · 실험대 높이: .dock 높이를 .bench 의 --dock-h 로 (넓은 화면에서 무대가 조작 줄까지 화면에 들어오게)
 *          · [data-do] 버튼: "click:#step; check:#cHuy; uncheck:#cX; set:#th=45" (세미콜론으로 여러 개)
 */
(function () {
  'use strict';
  const doc = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const MI = '−';

  // 과학 실험실 첫 화면 안(iframe)에서 열렸으면 '← 물리 실험실' 링크를 감춘다
  try { if (window.self !== window.top) document.querySelectorAll('.back, .topbar .home').forEach((b) => { b.hidden = true; }); } catch (e) { /* 다른 출처 */ }

  // ── 색 ─────────────────────────────────────────────────
  const TOKENS = ['bg', 'paper', 'ink', 'muted', 'line', 'line-soft', 'grid', 'glass', 'copper', 'copper-soft', 'on-copper',
    'vel', 'vel-soft', 'acc', 'acc-soft', 'force', 'neg', 'neg-soft', 'energy', 'violet', 'stage-top', 'stage-bot'];
  const C = {};
  function readColors() {
    const cs = getComputedStyle(doc);
    for (const k of TOKENS) C[k] = cs.getPropertyValue('--' + k).trim();
  }
  readColors();
  const views = [];
  const redrawAll = () => { readColors(); views.forEach((v) => v.redraw()); };
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(redrawAll);
  }
  new MutationObserver(redrawAll).observe(doc, {attributes: true, attributeFilter: ['data-theme']});

  // ── 캔버스 ──────────────────────────────────────────────
  function canvas(id, draw) {
    const el = typeof id === 'string' ? $(id) : id;
    const ctx = el.getContext('2d');
    const v = {el, ctx, W: 0, H: 0, redraw: () => { if (v.W) draw(v); }};
    const fit = () => {
      const r = el.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
      if (!r.width) return;
      v.W = r.width; v.H = r.height;
      el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(v);
    };
    // ResizeObserver 는 처음에도 한 번 알려 준다(비동기) → 페이지 스크립트의 변수가 다 만들어진 뒤 그려진다
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el);
    else { window.addEventListener('resize', fit); setTimeout(fit, 0); }
    views.push(v);
    return v;
  }

  // ── 글자·그리기 ─────────────────────────────────────────
  const FAM_UI = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';
  const FAM_NUM = FAM_UI;   // 숫자도 본문 글꼴로 (관찰 노트 배치)
  const weight = (w) => (w >= 700 ? 700 : w >= 600 ? 600 : w <= 400 ? 400 : 500);
  const font = (size = 13, w = 500, mono = false) => `${weight(w)} ${Math.max(13, size)}px ${mono ? FAM_NUM : FAM_UI}`;
  function text(ctx, s, x, y, o = {}) {
    ctx.save();
    ctx.font = font(o.size || 13, o.w == null ? 500 : o.w, o.mono);
    ctx.fillStyle = o.color || C.ink; ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    if (o.halo) { ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = o.halo === true ? C.paper : o.halo; ctx.strokeText(s, x, y); }
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  const measure = (ctx, s, o = {}) => { ctx.save(); ctx.font = font(o.size || 13, o.w == null ? 500 : o.w, o.mono); const w = ctx.measureText(s).width; ctx.restore(); return w; };
  function arrow(ctx, x0, y0, x1, y1, col, w = 2.5, h = 10) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 1) return;
    const ux = dx / L, uy = dy / L, hh = Math.min(h, L * 0.6);
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hh * 0.8, y1 - uy * hh * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * hh - uy * hh * 0.5, y1 - uy * hh + ux * hh * 0.5);
    ctx.lineTo(x1 - ux * hh + uy * hh * 0.5, y1 - uy * hh - ux * hh * 0.5);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function bracket(ctx, x0, x1, y, col, label, up = true) {
    const t = 5;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x0, y - t); ctx.lineTo(x0, y + t); ctx.moveTo(x1, y - t); ctx.lineTo(x1, y + t); ctx.stroke();
    ctx.restore();
    const m = (x0 + x1) / 2;
    arrow(ctx, m, y, x0 + 1, y, col, 1.6, 7); arrow(ctx, m, y, x1 - 1, y, col, 1.6, 7);
    if (label) text(ctx, label, m, y + (up ? -13 : 14), {size: 13, color: col, w: 600, mono: true, halo: true});
  }
  function vbracket(ctx, x, y0, y1, col, label, right = true) {
    const t = 5;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - t, y0); ctx.lineTo(x + t, y0); ctx.moveTo(x - t, y1); ctx.lineTo(x + t, y1); ctx.stroke();
    ctx.restore();
    const m = (y0 + y1) / 2;
    arrow(ctx, x, m, x, y0 + 1, col, 1.6, 7); arrow(ctx, x, m, x, y1 - 1, col, 1.6, 7);
    if (label) text(ctx, label, x + (right ? 9 : -9), m, {size: 13, color: col, w: 600, mono: true, align: right ? 'left' : 'right', halo: true});
  }
  function line(ctx, pts, col, w = 2, dash) {
    if (!pts.length) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.restore();
  }
  function circle(ctx, x, y, r, o = {}) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.width || 1.6; ctx.stroke(); }
    ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function paper(ctx, W, H, step = 24) {
    ctx.save(); ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    for (let x = step / 2; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = step / 2; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
  }
  function axes(ctx, r, o = {}) {
    const xmin = o.xmin ?? 0, xmax = o.xmax ?? 1, ymin = o.ymin ?? 0, ymax = o.ymax ?? 1;
    const X = (v) => r.x + (v - xmin) / (xmax - xmin) * r.w;
    const Y = (v) => r.y + r.h - (v - ymin) / (ymax - ymin) * r.h;
    const y0 = (ymin < 0 && ymax > 0) ? Y(0) : (ymin >= 0 ? r.y + r.h : r.y);
    const x0 = (o.yAt !== 'left' && xmin < 0 && xmax > 0) ? X(0) : r.x;
    ctx.save();
    if (o.grid) {
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      (o.xticks || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(X(v), r.y); ctx.lineTo(X(v), r.y + r.h); ctx.stroke(); });
      (o.yticks || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(r.x, Y(v)); ctx.lineTo(r.x + r.w, Y(v)); ctx.stroke(); });
    }
    ctx.restore();
    arrow(ctx, r.x, y0, r.x + r.w + 9, y0, C.muted, 1.3, 7);
    arrow(ctx, x0, r.y + r.h, x0, r.y - 9, C.muted, 1.3, 7);
    const fx = o.fmtX || ((v) => fmt(v)), fy = o.fmtY || ((v) => fmt(v));
    ctx.save(); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    (o.xticks || []).forEach((v) => {
      ctx.beginPath(); ctx.moveTo(X(v), y0 - 3); ctx.lineTo(X(v), y0 + 3); ctx.stroke();
      text(ctx, fx(v), X(v), y0 + 13, {size: 13, w: 500, color: C.muted, mono: true});
    });
    (o.yticks || []).forEach((v) => {
      ctx.beginPath(); ctx.moveTo(x0 - 3, Y(v)); ctx.lineTo(x0 + 3, Y(v)); ctx.stroke();
      text(ctx, fy(v), x0 - 7, Y(v), {size: 13, w: 500, color: C.muted, mono: true, align: 'right'});
    });
    ctx.restore();
    if (o.xlabel) {
      if (o.xlabelBelow) text(ctx, o.xlabel, r.x + r.w / 2, y0 + ((o.xticks || []).length ? 31 : 15), {size: 13, w: 600, color: C.muted});
      else text(ctx, o.xlabel, r.x + r.w + 4, y0 - 12, {size: 13, w: 600, color: C.muted, align: 'right'});
    }
    if (o.ylabel) text(ctx, o.ylabel, x0 + 8, r.y - 4, {size: 13, w: 600, color: C.muted, align: 'left'});
    return {X, Y, y0, x0};
  }

  // ── 움직임 ──────────────────────────────────────────────
  function loop(fn) {
    let last = 0, alive = true;
    const step = (ts) => {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      if (!document.hidden) fn(dt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return {stop: () => { alive = false; }};
  }

  // ── 조작 ────────────────────────────────────────────────
  const ICON_PAUSE = '<rect x="2" y="1.5" width="3.6" height="11" rx="1"/><rect x="8.4" y="1.5" width="3.6" height="11" rx="1"/>';
  const ICON_PLAY = '<path d="M3 1.5v11l9-5.5z"/>';
  function play(id, on, onChange) {
    const b = $(id);
    if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 14 14" aria-hidden="true"></svg>');
    if (!b.querySelector('span')) b.insertAdjacentHTML('beforeend', '<span></span>');
    const svg = b.querySelector('svg'), sp = b.querySelector('span');
    let state = !!on;
    const set = (v, quiet) => {
      state = !!v; b.setAttribute('aria-pressed', String(state));
      svg.innerHTML = state ? ICON_PAUSE : ICON_PLAY; sp.textContent = state ? '멈추기' : '움직이기';
      if (!quiet && onChange) onChange(state);
    };
    b.addEventListener('click', () => set(!state));
    set(state, true);
    return {set, get: () => state};
  }
  function slider(id, o = {}) {
    const el = $(id), out = o.out ? $(o.out) : null;
    const show = () => { if (out) out.textContent = o.fmt ? o.fmt(+el.value) : el.value; };
    el.addEventListener('input', () => { show(); o.onInput && o.onInput(+el.value); });
    show();
    return {el, get: () => +el.value, set: (v, quiet) => { el.value = v; show(); if (!quiet && o.onInput) o.onInput(+el.value); }};
  }
  function group(sel, key, onPick, initial) {
    const btns = [...document.querySelectorAll(sel)];
    const mark = (v) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === String(v))));
    btns.forEach((b) => b.addEventListener('click', () => { mark(b.dataset[key]); onPick && onPick(b.dataset[key]); }));
    if (initial !== undefined) mark(initial);
    return {set: (v, quiet) => { mark(v); if (!quiet && onPick) onPick(String(v)); }};
  }
  function toggle(id, onChange) {
    const el = $(id);
    el.addEventListener('change', () => onChange && onChange(el.checked));
    return {el, get: () => el.checked, set: (b, quiet) => { el.checked = !!b; if (!quiet && onChange) onChange(el.checked); }};
  }
  function check(id, ok, okText, idleText) {
    const el = $(id);
    el.className = 'check' + (ok ? ' ok' : '');
    el.textContent = ok ? '✓ ' + okText : idleText;
  }
  function tries(map, after) {
    document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => {
      const f = map[b.dataset.try]; if (!f) return;
      f(); after && after(b.dataset.try);
      const st = document.querySelector('.stage');
      if (st) {   // 무대가 이미 반 넘게 보이면 그대로 둔다 (실험대가 화면에 붙어 있는 배치)
        const r = st.getBoundingClientRect(), vis = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
        if (vis < r.height * 0.5) st.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block: 'center'});
      }
    }));
  }
  function pointer(el, o) {
    const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let down = false, pending = null;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { pending = pos(e); return; }
      down = true; try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      o.down && o.down(...pos(e));
    });
    el.addEventListener('pointermove', (e) => {
      if (pending) {
        const [x0, y0] = pending, [x, y] = pos(e);
        if (Math.hypot(x - x0, y - y0) < 4) return;
        pending = null; down = true; try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        o.down && o.down(x0, y0);
      }
      if (down) o.move && o.move(...pos(e));
    });
    el.addEventListener('pointerup', () => {
      if (pending) { const p = pending; pending = null; o.down && o.down(...p); o.up && o.up(); return; }
      if (down) { down = false; o.up && o.up(); }
    });
    el.addEventListener('pointercancel', () => { pending = null; if (down) { down = false; o.up && o.up(); } });
  }

  // ── 색 섞기 ─────────────────────────────────────────────
  function alpha(col, a) {
    col = (col || '').trim();
    let r = 0, g = 0, bl = 0;
    if (col[0] === '#') {
      const h = col.length === 4 ? col.slice(1).split('').map((c) => c + c).join('') : col.slice(1, 7);
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); bl = parseInt(h.slice(4, 6), 16);
    } else {
      const m = col.match(/[\d.]+/g) || [0, 0, 0];
      [r, g, bl] = m.map(Number);
    }
    return `rgba(${r},${g},${bl},${a})`;
  }

  const rgb = (col) => alpha(col, 1).match(/[\d.]+/g).slice(0, 3).map(Number);
  const isDark = () => { const [r, g, bl] = rgb(C.bg || '#fff'); return 0.299 * r + 0.587 * g + 0.114 * bl < 128; };
  // 가시광선 파장 → 색 (380~780 nm). 양 끝은 어둡게 줄인다. 범위 밖이면 null
  function wavelengthRGB(nm) {
    if (!(nm >= 380 && nm <= 780)) return null;
    let r = 0, g = 0, bl = 0;
    if (nm < 440) { r = (440 - nm) / 60; bl = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; bl = 1; }
    else if (nm < 510) { g = 1; bl = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
    else r = 1;
    const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
    return [r, g, bl].map((v) => Math.round(255 * Math.pow(v * f, 0.8)));
  }
  function wlColor(nm, a = 1) {
    const c = wavelengthRGB(nm);
    if (c) return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    return alpha(nm < 380 ? C.violet : C.force, a);
  }
  // 바탕 상자가 있는 이름표
  function tag(ctx, s, x, y, o = {}) {
    const size = Math.max(13, o.size || 13), pad = o.pad == null ? 5 : o.pad;
    const w = measure(ctx, s, {size, w: o.w == null ? 600 : o.w, mono: o.mono}) + pad * 2, h = size + pad * 1.6;
    const al = o.align || 'center';
    const x0 = al === 'left' ? x : al === 'right' ? x - w : x - w / 2;
    ctx.save();
    rrect(ctx, x0, y - h / 2, w, h, Math.min(8, h / 2));
    ctx.fillStyle = o.bg || C.paper; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = o.border || C.line; ctx.stroke();
    ctx.restore();
    text(ctx, s, x0 + w / 2, y + 0.5, {size, w: o.w == null ? 600 : o.w, color: o.color || C.ink, mono: o.mono});
    return w;
  }
  // 아래첨자·위첨자가 있는 글자: 'E_{k,max}', 'v_1', '10^{-34}', 'x^2'
  function richParts(s) {
    const out = []; let i = 0, buf = '';
    const push = (t, k) => { if (t) out.push([t, k]); };
    while (i < s.length) {
      const ch = s[i];
      if ((ch === '_' || ch === '^') && i + 1 < s.length) {
        push(buf, 0); buf = '';
        const k = ch === '_' ? -1 : 1;
        if (s[i + 1] === '{') { const j = s.indexOf('}', i + 2); push(s.slice(i + 2, j < 0 ? s.length : j), k); i = j < 0 ? s.length : j + 1; }
        else { push(s[i + 1], k); i += 2; }
      } else { buf += ch; i++; }
    }
    push(buf, 0);
    return out;
  }
  function rich(ctx, s, x, y, o = {}) {
    const size = Math.max(13, o.size || 13), small = Math.max(11, Math.round(size * 0.72));
    const parts = richParts(s), w0 = o.w == null ? 500 : o.w;
    const fontOf = (k) => (k ? font(small, w0, o.mono).replace(/\d+px/, small + 'px') : font(size, w0, o.mono));
    ctx.save();
    let total = 0;
    for (const [t, k] of parts) { ctx.font = fontOf(k); total += ctx.measureText(t).width; }
    const al = o.align || 'center';
    let cx = al === 'left' ? x : al === 'right' ? x - total : x - total / 2;
    ctx.fillStyle = o.color || C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const [t, k] of parts) {
      ctx.font = fontOf(k);
      const dy = k < 0 ? size * 0.32 : k > 0 ? -size * 0.38 : 0;
      if (o.halo) { ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = o.halo === true ? C.paper : o.halo; ctx.strokeText(t, cx, y + dy); }
      ctx.fillText(t, cx, y + dy);
      cx += ctx.measureText(t).width;
    }
    ctx.restore();
    return total;
  }
  // 두 방향 사이의 각 (라디안, 캔버스 좌표: 오른쪽 0, 아래쪽 +π/2). 짧은 쪽으로 그린다
  function angle(ctx, cx, cy, r, a0, a1, col, label) {
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + d, d < 0); ctx.stroke(); ctx.restore();
    if (label) {
      const m = a0 + d / 2;
      text(ctx, label, cx + Math.cos(m) * (r + 13), cy + Math.sin(m) * (r + 13), {size: 13, w: 600, color: col, halo: true});
    }
    return a0 + d / 2;
  }

  // ── 숫자 ────────────────────────────────────────────────
  function fmt(v, d = 2) {
    if (!isFinite(v)) return '–';
    const s = String(+Math.abs(v).toFixed(d));
    return (v < 0 && +s !== 0 ? MI : '') + s;
  }
  const sg = (v, d = 2) => (+Math.abs(v).toFixed(d) === 0 ? '0' : (v > 0 ? '+' : MI) + fmt(Math.abs(v), d));
  const SUP = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
  function sci(v, d = 2, o = {}) {
    if (!isFinite(v)) return '–';
    if (v === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(v)));
    if (!o.force && e >= -2 && e <= 3) return fmt(v, d);
    let m = v / Math.pow(10, e);
    if (+Math.abs(m).toFixed(d) >= 10) { m /= 10; e += 1; }
    return `${fmt(m, d)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
  }
  const pow10 = (k) => '10' + String(k).split('').map((c) => SUP[c]).join('');
  function fmtLen(m, d = 3) {
    if (!isFinite(m)) return '–';
    if (m === 0) return '0 m';
    const U = [[1e3, 'km'], [1, 'm'], [1e-2, 'cm'], [1e-3, 'mm'], [1e-6, 'μm'], [1e-9, 'nm'], [1e-12, 'pm'], [1e-15, 'fm']];
    const a = Math.abs(m);
    const [u, name] = U.find(([u]) => a >= u * 0.9999) || U[U.length - 1];
    const v = m / u;
    const digits = Math.max(0, d - 1 - Math.floor(Math.log10(Math.abs(v) || 1)));
    return fmt(v, digits) + ' ' + name;
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function frac(v, d = 2) {        // 1/3, 5/3, 2/7 처럼 끝나지 않는 소수만 분수로
    for (const q of [3, 6, 7, 9]) {
      const n = Math.round(v * q);
      if (Math.abs(v * q - n) > 1e-6) continue;
      const g = gcd(Math.abs(n), q), den = q / g;
      if (den === 1 || den === 2) break;
      return (n < 0 ? MI : '') + Math.abs(n) / g + '/' + den;
    }
    return fmt(v, d);
  }

  // ── 「지금 값」 카드 ─────────────────────────────────────
  // Lab.ans('θ₂ = 30°', ['1 × sin <em>60°</em> = √3 × sin θ₂', 'sin θ₂ = 0.5 → <em>θ₂ = 30°</em>'], {ctx: '공기 → 유리'})
  function ans(big, lines, o = {}) {
    const b = $('ansBig');
    if (b) { if (o.html) b.innerHTML = big; else b.textContent = big; b.className = 'big' + (o.tone ? ' ' + o.tone : ''); }
    if (o.ctx != null && $('ansCtx')) $('ansCtx').textContent = o.ctx;
    if (o.f != null && $('ansF')) $('ansF').innerHTML = o.f;
    const L = $('ansLines');
    if (L && lines) L.innerHTML = lines.map((h) => '<span class="v">' + h + '</span>').join('');
  }

  // ── 관찰 노트 배치: 붙어 다니는 실험대 · 조작 시트 · 지금 읽는 단계 · [data-do] ──
  function layout() {
    const bench = document.querySelector('.bench'), dock = bench && bench.querySelector('.dock');
    const sheet = $('sheet'), sb = $('sheetBtn'), chip = $('nowstep');
    const narrow = window.matchMedia ? matchMedia('(max-width: 999px)') : {matches: false};
    // 넓은 화면: 실험대(무대 + 조작)가 화면보다 크면 붙어 다니지 않게
    const fit = () => {
      if (!bench) return;
      bench.classList.remove('free');
      if (narrow.matches) return;
      const top = parseFloat(getComputedStyle(bench).top) || 0;
      if (getComputedStyle(bench).position === 'sticky' && bench.offsetHeight + top > innerHeight - 8) bench.classList.add('free');
    };
    if (dock && 'ResizeObserver' in window) {
      new ResizeObserver(() => { bench.style.setProperty('--dock-h', dock.offsetHeight + 'px'); fit(); }).observe(dock);
    }
    // 조작 시트 (좁은 화면)
    const open = (on) => { if (!dock) return; dock.classList.toggle('open', on); if (sb) sb.setAttribute('aria-expanded', String(on)); };
    if (sb) sb.addEventListener('click', () => open(!dock.classList.contains('open')));
    if ($('sheetClose')) $('sheetClose').addEventListener('click', () => open(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
    // 범례: 좁은 화면에서는 무대를 가리지 않게 시트 안으로
    const legend = bench && bench.querySelector('.stage .legend'), home = legend && legend.parentNode;
    const placeLegend = () => {
      if (!legend || !sheet) return;
      if (narrow.matches) {
        if (legend.parentNode !== sheet) { const h = sheet.querySelector('.sheet-head'); if (h) h.after(legend); else sheet.prepend(legend); }
      } else if (legend.parentNode !== home) home.appendChild(legend);
    };
    // 지금 읽는 단계: 읽는 줄(보이는 글 영역의 35% 높이)에 걸린 단계
    const steps = [...document.querySelectorAll('.steps > .step')];
    let ticking = false;
    const pick = () => {
      ticking = false;
      if (!steps.length) return;
      const tb = document.querySelector('.topbar');
      let top = tb ? tb.getBoundingClientRect().bottom : 0;
      if (bench && narrow.matches && getComputedStyle(bench).position === 'sticky') top = Math.max(top, bench.getBoundingClientRect().bottom);
      const lineY = top + (innerHeight - top) * 0.35;
      let cur = null;
      for (const st of steps) { if (st.getBoundingClientRect().top <= lineY) cur = st; else break; }
      if (cur && cur.getBoundingClientRect().bottom < top) cur = null;
      if (window.scrollY < 40) cur = null;
      steps.forEach((st) => st.classList.toggle('on', st === cur));
      if (chip) { chip.hidden = !cur; if (cur) chip.textContent = cur.dataset.step || ''; }
    };
    const later = () => { if (!ticking) { ticking = true; requestAnimationFrame(pick); } };
    addEventListener('scroll', later, {passive: true});
    addEventListener('resize', () => { placeLegend(); fit(); later(); });
    if (narrow.addEventListener) narrow.addEventListener('change', () => { open(false); placeLegend(); fit(); });
    // [data-do]: 단계 카드의 버튼이 조작판을 대신 눌러 준다
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-do]');
      if (!b) return;
      b.dataset.do.split(';').forEach((cmd) => {
        const m = cmd.trim().match(/^(click|check|uncheck|set)\s*:\s*(.+)$/);
        if (!m) return;
        let sel = m[2].trim(), val = null;
        if (m[1] === 'set') { const k = sel.lastIndexOf('='); val = sel.slice(k + 1).trim(); sel = sel.slice(0, k).trim(); }
        const el = document.querySelector(sel);
        if (!el) return;
        if (m[1] === 'click') el.click();
        else if (m[1] === 'set') { el.value = val; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
        else if (el.checked !== (m[1] === 'check')) el.click();
      });
    });
    placeLegend(); fit(); pick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', layout); else setTimeout(layout, 0);

  window.Lab = {C, $, reduceMotion, canvas, font, text, measure, arrow, bracket, vbracket, line, circle, rrect, paper, axes,
    loop, play, slider, group, toggle, check, tries, pointer, alpha, rgb, isDark, wavelengthRGB, wlColor, tag, rich, angle,
    fmt, sg, sci, pow10, fmtLen, frac, MI, redrawAll, ans};
})();
