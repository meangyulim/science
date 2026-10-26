/* 세화여고 체육대회 우천 레이더 — 메인 화면 맨 위에 뜨는 실시간 '오전 7시 비 올 확률' 위젯.
 *
 * 규칙: 체육대회 당일 오전 7시에 비가 오면 우천으로 취소된다.
 * 그래서 하루 전체 강수확률이 아니라 '그날 7시' 한 칸의 확률만 따로 뽑아 보여 준다.
 *
 * 날짜·시각·위치는 아래 EVENT 만 고치면 된다. 행사 날이 지나면 위젯은 저절로 사라진다.
 * 예보 자료: Open-Meteo (키 없이 브라우저에서 바로 부를 수 있는 무료 API).
 *   - 확률:  api.open-meteo.com          hourly precipitation_probability
 *   - 투표:  ensemble-api.open-meteo.com 앙상블 예보의 각 시나리오가 7시에 비(0.1mm 이상)를 내리는지
 * Node 에서도 불러 쓸 수 있게 계산 함수는 DOM 과 분리해 두었다 (tests/sportsday-rain.test.cjs).
 */
(function(root) {
  'use strict';

  const EVENT = {
    title: '세화여고 체육대회',
    date: '2026-10-30',          // 행사 날짜 (한국 시간)
    hour: 7,                     // 이 시각에 비가 오면 취소
    lat: 37.4985, lon: 126.9962  // 서울 서초구 신반포로 56-7
  };

  const TZ = 'Asia/Seoul';
  const REFRESH_MS = 10 * 60 * 1000;
  const WET_MM = 0.1;            // 이 이상 내리면 '비 온다'로 친다 (기상청 강수 기준과 같음)
  const STORE_KEY = 'sportsday-rain:' + EVENT.date;
  const ENSEMBLES = [            // 시나리오 투표에 쓸 앙상블 모델 (하나가 실패해도 나머지로 계산)
    {id: 'ecmwf_ifs025', name: '유럽'},
    {id: 'gfs025', name: '미국'},
    {id: 'icon_seamless', name: '독일'}
  ];

  const pad = n => String(n).padStart(2, '0');
  // Open-Meteo 에 timezone=Asia/Seoul 을 주면 시각이 '2026-10-30T07:00' 꼴로 온다.
  const slot = (date, hour) => `${date}T${pad(hour)}:00`;
  const eventTime = ev => new Date(`${ev.date}T${pad(ev.hour)}:00:00+09:00`);
  const dayEnd = ev => new Date(new Date(`${ev.date}T00:00:00+09:00`).getTime() + 864e5);

  // before: 아직 판정 전 / judged: 7시가 지난 당일 / over: 행사 날이 끝남 (위젯 숨김)
  function phase(now, ev) {
    if (now < eventTime(ev)) return 'before';
    if (now < dayEnd(ev)) return 'judged';
    return 'over';
  }

  function valueAt(hourly, key, iso) {
    if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly[key])) return null;
    const i = hourly.time.indexOf(iso);
    const v = i < 0 ? null : hourly[key][i];
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  // 앙상블 응답의 hourly 에는 precipitation(대조 실행)과 precipitation_member01, 02 … 가 들어 있다.
  // 이름 규칙이 모델마다 조금씩 달라도 되도록 precipitation 으로 시작하는 열은 (확률 열만 빼고) 모두 한 표로 센다.
  function ensembleVote(hourly, iso, wet = WET_MM) {
    const vote = {rain: 0, total: 0};
    if (!hourly || !Array.isArray(hourly.time)) return vote;
    const i = hourly.time.indexOf(iso);
    if (i < 0) return vote;
    for (const key of Object.keys(hourly)) {
      if (!key.startsWith('precipitation') || key.startsWith('precipitation_probability')) continue;
      if (!Array.isArray(hourly[key])) continue;
      const v = hourly[key][i];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      vote.total++;
      if (v >= wet) vote.rain++;
    }
    return vote;
  }

  function verdict(p) {
    if (p == null) return {level: 'unknown', emoji: '❔', text: '예보를 불러오는 중…'};
    if (p < 20) return {level: 'clear', emoji: '🏃‍♀️', text: '체육대회 한다! 체육복 챙기자'};
    if (p < 40) return {level: 'likely', emoji: '🤞', text: '아직은 하는 쪽… 방심은 금물'};
    if (p < 60) return {level: 'coin', emoji: '🙏', text: '반반 승부, 지금부터 기도 메타'};
    if (p < 80) return {level: 'risky', emoji: '🌧️', text: '우천 취소 냄새가 솔솔…'};
    return {level: 'cancel', emoji: '☔', text: '이건 거의 우천 취소 각'};
  }

  function countdown(ms) {
    if (ms <= 0) return '0초';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
    const m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d > 0) return `${d}일 ${h}시간 ${m}분`;
    if (h > 0) return `${h}시간 ${pad(m)}분 ${pad(sec)}초`;
    return `${m}분 ${pad(sec)}초`;
  }

  // 지난 확인값 기록: 값이 바뀔 때만 한 줄씩 쌓는다 (같은 값이 반복되면 시각만 갱신).
  function pushHistory(history, p, at, max = 30) {
    const list = Array.isArray(history) ? history.slice() : [];
    const last = list[list.length - 1];
    if (last && last.p === p) list[list.length - 1] = {p, at};
    else list.push({p, at});
    return list.slice(-max);
  }

  function forecastUrl(ev) {
    const q = new URLSearchParams({
      latitude: ev.lat, longitude: ev.lon, timezone: TZ,
      hourly: 'precipitation_probability,precipitation',
      daily: 'precipitation_probability_max',
      start_date: ev.date, end_date: ev.date
    });
    return 'https://api.open-meteo.com/v1/forecast?' + q;
  }

  function ensembleUrl(ev, model) {
    const q = new URLSearchParams({
      latitude: ev.lat, longitude: ev.lon, timezone: TZ,
      hourly: 'precipitation', models: model,
      start_date: ev.date, end_date: ev.date
    });
    return 'https://ensemble-api.open-meteo.com/v1/ensemble?' + q;
  }

  const api = {EVENT, slot, eventTime, phase, valueAt, ensembleVote, verdict, countdown, pushHistory, forecastUrl, ensembleUrl};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsdayRain = api;

  if (typeof document === 'undefined') return;

  // ───────────────────────────── 화면 ─────────────────────────────

  const STYLE = {
    unknown: {ring: '#94a3b8', bg: 'from-slate-50 to-slate-100', text: 'text-slate-600'},
    clear:   {ring: '#10b981', bg: 'from-emerald-50 to-sky-50',  text: 'text-emerald-600'},
    likely:  {ring: '#0ea5e9', bg: 'from-sky-50 to-indigo-50',   text: 'text-sky-600'},
    coin:    {ring: '#f59e0b', bg: 'from-amber-50 to-sky-50',    text: 'text-amber-600'},
    risky:   {ring: '#6366f1', bg: 'from-indigo-50 to-slate-100', text: 'text-indigo-600'},
    cancel:  {ring: '#334155', bg: 'from-slate-100 to-indigo-100', text: 'text-slate-700'}
  };

  const fmtTime = d => d.toLocaleTimeString('ko-KR', {timeZone: TZ, hour: 'numeric', minute: '2-digit'});
  const fmtDay = ev => {
    const d = eventTime(ev);
    const w = d.toLocaleDateString('ko-KR', {timeZone: TZ, weekday: 'short'});
    const [, mo, da] = ev.date.split('-').map(Number);
    return `${mo}월 ${da}일(${w})`;
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 사생활 보호 모드 등 */ }
  }

  function mount(container) {
    const el = document.createElement('section');
    el.id = 'rain-radar';
    el.className = 'mb-2 mt-4 rounded-3xl border-2 border-sky-200 bg-gradient-to-br p-4 md:p-5 shadow-sm transition-colors duration-700';
    el.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 text-xs font-bold text-slate-500">
          <span class="relative flex h-2.5 w-2.5">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500"></span>
          </span>
          LIVE · ${EVENT.title} 우천 레이더
        </div>
        <button data-r="refresh" class="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm active:scale-95 transition">새로고침 ↻</button>
      </div>

      <div class="mt-3 flex items-center gap-4 md:gap-6">
        <div class="relative h-28 w-28 md:h-32 md:w-32 shrink-0">
          <svg viewBox="0 0 120 120" class="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="12"/>
            <circle data-r="arc" cx="60" cy="60" r="52" fill="none" stroke-width="12" stroke-linecap="round"
                    stroke-dasharray="326.7" stroke-dashoffset="326.7" style="transition: stroke-dashoffset 1.2s ease, stroke .7s"/>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <div data-r="emoji" class="text-xl leading-none">❔</div>
            <div class="mt-0.5 text-3xl md:text-4xl font-bold text-slate-800 tabular-nums"><span data-r="pct">--</span><span class="text-lg">%</span></div>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-slate-500">${fmtDay(EVENT)} 오전 ${EVENT.hour}시에 비가 오면 우천 취소!</p>
          <h2 class="mt-0.5 text-base md:text-lg font-bold text-slate-800 break-keep">오전 ${EVENT.hour}시 비 올 확률</h2>
          <p data-r="verdict" class="mt-1 text-sm font-bold break-keep">예보를 불러오는 중…</p>
          <p data-r="delta" class="mt-1 text-xs text-slate-500"></p>
          <p data-r="day" class="mt-0.5 text-xs text-slate-500"></p>
        </div>
      </div>

      <div data-r="hours" class="mt-4 grid grid-cols-5 gap-1.5"></div>

      <div data-r="votebox" class="mt-4 hidden rounded-2xl bg-white/70 p-3">
        <p class="text-xs font-bold text-slate-600">🗳️ 세계 날씨 모델 시나리오 투표</p>
        <p data-r="votetext" class="mt-0.5 text-xs text-slate-500"></p>
        <div data-r="dots" class="mt-2 flex flex-wrap gap-[3px]"></div>
      </div>

      <div data-r="histbox" class="mt-3 hidden">
        <p class="text-xs font-bold text-slate-600">📈 내가 확인할 때마다 바뀐 확률</p>
        <svg data-r="spark" viewBox="0 0 300 48" preserveAspectRatio="none" class="mt-1 h-12 w-full"></svg>
      </div>

      <div class="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span data-r="countdown"></span>
        <span><span data-r="updated"></span> · 자료 Open-Meteo (기상청 발표와 다를 수 있어요)</span>
      </div>`;
    container.prepend(el);
    const $ = name => el.querySelector(`[data-r="${name}"]`);
    return {el, $};
  }

  function animateNumber(node, from, to) {
    if (from == null || from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = to;
      return;
    }
    const start = performance.now(), dur = 900;
    const step = t => {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderHours(ui, hourly) {
    const hours = [-2, -1, 0, 1, 2].map(d => EVENT.hour + d).filter(h => h >= 0 && h <= 23);
    ui.$('hours').innerHTML = hours.map(h => {
      const p = valueAt(hourly, 'precipitation_probability', slot(EVENT.date, h));
      const on = h === EVENT.hour;
      const height = p == null ? 0 : Math.max(4, p);
      return `
        <div class="flex flex-col items-center rounded-xl ${on ? 'bg-white shadow-sm ring-2 ring-sky-300' : 'bg-white/50'} px-1 py-2">
          <div class="text-[11px] font-bold ${on ? 'text-sky-700' : 'text-slate-500'} tabular-nums">${p == null ? '-' : p + '%'}</div>
          <div class="mt-1 flex h-10 w-3 items-end overflow-hidden rounded-full bg-slate-200/70">
            <div class="w-full rounded-full ${on ? 'bg-sky-500' : 'bg-sky-300'}" style="height:${height}%;transition:height 1s"></div>
          </div>
          <div class="mt-1 text-[11px] ${on ? 'font-bold text-sky-700' : 'text-slate-500'}">${h}시</div>
        </div>`;
    }).join('');
  }

  function renderVote(ui, votes) {
    const total = votes.reduce((s, v) => s + v.total, 0);
    if (!total) { ui.$('votebox').classList.add('hidden'); return; }
    const rain = votes.reduce((s, v) => s + v.rain, 0);
    const parts = votes.filter(v => v.total).map(v => `${v.name} ${v.rain}/${v.total}`).join(' · ');
    ui.$('votetext').textContent = `시나리오 ${total}개 중 ${rain}개(${Math.round(rain / total * 100)}%)가 ${EVENT.hour}시에 비를 내려요 (${parts})`;
    ui.$('dots').innerHTML = votes.flatMap(v =>
      Array.from({length: v.total}, (_, i) =>
        `<span title="${v.name}" class="h-2 w-2 rounded-full ${i < v.rain ? 'bg-sky-500' : 'bg-slate-200'}"></span>`)
    ).join('');
    ui.$('votebox').classList.remove('hidden');
  }

  function renderHistory(ui, history) {
    if (!history || history.length < 2) { ui.$('histbox').classList.add('hidden'); return; }
    const n = history.length, W = 300, H = 48;
    const pts = history.map((h, i) => [i / (n - 1) * W, H - 4 - h.p / 100 * (H - 8)]);
    const line = pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
    ui.$('spark').innerHTML = `
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#cbd5e1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>
      <polyline points="${line}" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    ui.$('histbox').classList.remove('hidden');
  }

  function renderMain(ui, state, prevShown) {
    const p = state.p;
    const v = verdict(p);
    const s = STYLE[v.level];
    STYLE_CLASSES.forEach(c => ui.el.classList.remove(c));
    s.bg.split(' ').forEach(c => ui.el.classList.add(c));
    const arc = ui.$('arc');
    arc.style.stroke = s.ring;
    arc.style.strokeDashoffset = String(326.7 * (1 - (p || 0) / 100));
    ui.$('emoji').textContent = v.emoji;
    animateNumber(ui.$('pct'), prevShown, p == null ? '--' : p);
    const vEl = ui.$('verdict');
    vEl.className = `mt-1 text-sm font-bold break-keep ${s.text}`;
    vEl.textContent = v.text;

    const hist = state.history || [];
    const before = hist.length >= 2 ? hist[hist.length - 2] : null;
    if (before && p != null) {
      const d = p - before.p;
      const arrow = d > 0 ? `<b class="whitespace-nowrap text-indigo-600">▲ ${d}%p</b>` : `<b class="whitespace-nowrap text-emerald-600">▼ ${-d}%p</b>`;
      ui.$('delta').innerHTML = `${fmtTime(new Date(before.at))} 확인 때(${before.p}%)보다 ${arrow}`;
    } else {
      ui.$('delta').textContent = '';
    }
    ui.$('day').textContent = state.dayMax == null ? '' : `참고: 그날 하루 중 비 올 확률은 최고 ${state.dayMax}%`;
    ui.$('updated').textContent = state.at ? `${fmtTime(new Date(state.at))} 갱신` : '';
  }
  const STYLE_CLASSES = [...new Set(Object.values(STYLE).flatMap(s => s.bg.split(' ')))];

  async function getJson(url) {
    const res = await fetch(url, {cache: 'no-store'});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function start() {
    if (phase(new Date(), EVENT) === 'over') return;
    const container = document.querySelector('#home-view > div');
    if (!container) return;
    const ui = mount(container);
    let state = load();
    let shown = null;
    let busy = false;
    let timer = null;

    const draw = () => {
      renderMain(ui, state, shown);
      shown = state.p == null ? null : state.p;
      renderHours(ui, state.hourly);
      renderVote(ui, state.votes || []);
      renderHistory(ui, state.history);
    };

    const tick = () => {
      const now = new Date();
      const ph = phase(now, EVENT);
      if (ph === 'over') { ui.el.remove(); clearInterval(timer); return; }
      ui.$('countdown').textContent = ph === 'before'
        ? `⏱️ 판정까지 ${countdown(eventTime(EVENT) - now)}`
        : `⏰ 판정 시각(${EVENT.hour}시)이 지났어요 — 진행 여부는 학교 공지를 확인하세요`;
    };

    async function refresh() {
      if (busy) return;
      busy = true;
      ui.$('refresh').textContent = '불러오는 중…';
      const iso = slot(EVENT.date, EVENT.hour);
      try {
        const [fc, ...ens] = await Promise.allSettled([
          getJson(forecastUrl(EVENT)),
          ...ENSEMBLES.map(m => getJson(ensembleUrl(EVENT, m.id)))
        ]);
        if (fc.status !== 'fulfilled') throw fc.reason;
        const p = valueAt(fc.value.hourly, 'precipitation_probability', iso);
        const dayMax = fc.value.daily && Array.isArray(fc.value.daily.precipitation_probability_max)
          ? fc.value.daily.precipitation_probability_max[0] : null;
        const at = Date.now();
        const votes = ens.map((r, i) => r.status === 'fulfilled'
          ? {name: ENSEMBLES[i].name, ...ensembleVote(r.value.hourly, iso)}
          : {name: ENSEMBLES[i].name, rain: 0, total: 0});
        state = {
          p, dayMax: typeof dayMax === 'number' ? dayMax : null, at,
          hourly: {time: fc.value.hourly.time, precipitation_probability: fc.value.hourly.precipitation_probability},
          votes,
          history: p == null ? state.history : pushHistory(state.history, p, at)
        };
        save(state);
        draw();
      } catch (e) {
        ui.$('updated').textContent = '예보를 못 불러왔어요 — 잠시 뒤 다시 시도합니다';
      } finally {
        busy = false;
        ui.$('refresh').textContent = '새로고침 ↻';
      }
    }

    ui.$('refresh').addEventListener('click', refresh);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (!state.at || Date.now() - state.at > 60 * 1000)) refresh();
    });
    draw();       // 지난번 값을 먼저 보여 주고
    tick();
    timer = setInterval(tick, 1000);
    refresh();    // 최신 예보로 갈아 끼운다
    setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof globalThis !== 'undefined' ? globalThis : this);
