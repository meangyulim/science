/* III2-04 광전 효과의 이용: 경보기와 센서 — 판정 모형. 브라우저(window.III2_04)와 Node 테스트(tests/III2-04-model.test.cjs)에서 같이 쓴다.
   약속: 빛의 세기·광전류는 상댓값(0~1). 광전류는 문턱 진동수 f₀ 보다 진동수가 큰 빛이 닿을 때만 흐르고, 닿는 빛의 세기(광자 수)에 비례한다.
   계전기(전자석 + 용수철 + 스위치): 광전류가 HOLD 이상이면 전자석이 금속 막대를 끌어당겨 스위치가 열리고, 그보다 작으면 용수철이 막대를 당겨 스위치가 닫힌다. */
(function (root) {
  'use strict';
  const h = 6.6e-34, c = 3e8;
  const F0 = 5.0e14;                          // 광전관·광센서 금속의 문턱 진동수 (Hz) — 그림용 값 (λ₀ = 600 nm)
  const W0 = h * F0;                          // 일함수 W = hf₀ (J)
  const freq = (nm) => c / (nm * 1e-9);       // 파장(nm) → 진동수(Hz)
  const LIGHT = {violet: 400, red: 700};      // 도난 경보기 광원: 보라색 빛(f > f₀), 빨간빛(f < f₀)
  const HOLD = 0.3;                           // 전자석이 막대를 붙잡아 두는 최소 광전류 (상댓값)

  // 빛 → 광전류: 광자 하나의 에너지 hf 가 일함수보다 커야(f > f₀) 광전자가 나온다. 그때 광전류 ∝ 닿는 빛의 세기
  const emits = (f, f0 = F0) => f > f0;
  const photoCurrent = (light, f = freq(LIGHT.violet), f0 = F0) => (emits(f, f0) && light > 0 ? light : 0);
  // 계전기: 자기력 ∝ 광전류. 붙잡는 힘이 모자라면 용수철이 스위치를 닫는다
  const relay = (I, hold = HOLD) => ({magnet: I >= hold, force: I, closed: I < hold});
  // 사람 몸(가로 중심 x, 반폭 halfW)이 빛줄기(중심 beamX)를 가리나
  const blocks = (x, halfW, beamX) => Math.abs(x - beamX) < halfW;

  /* 도난 경보기: 광원 → 광전관 → 전자석. 빛이 가려지면 광전류 0 → 스위치 닫힘 → 경보 (전류가 끊길 때 울림) */
  function burglar({blocked = false, nm = LIGHT.violet} = {}) {
    const f = freq(nm), light = blocked ? 0 : 1, I = photoCurrent(light, f), r = relay(I);
    return {f, f0: F0, light, I, emits: I > 0, magnet: r.magnet, force: r.force, closed: r.closed, alarm: r.closed};
  }
  /* 광전식 화재 경보기: 평소 LED 빛은 직진해 광센서에 닿지 않는다. 연기 입자에 산란된 빛(∝ 연기 양)이 닿으면 광전류 → 경보 (전류가 생길 때 울림) */
  function fire({smoke = 0} = {}) {
    const light = Math.max(0, Math.min(1, smoke)), I = photoCurrent(light);
    return {light, I, alarm: I > 0};
  }
  /* 가로등 자동 점멸 장치: 도난 경보기와 같은 계전기. 햇빛이 약해 광전류가 HOLD 보다 작아지면 스위치가 닫혀 전등이 켜진다 */
  const sunlight = (hour) => Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));   // 6시~18시 해, 정오에 1
  function streetlight({hour = 12} = {}) {
    const light = sunlight(hour), I = photoCurrent(light), r = relay(I);
    return {light, I, magnet: r.magnet, closed: r.closed, lamp: r.closed};
  }
  /* 태양 전지·조도계: 광 다이오드가 만든 전류 ∝ 빛의 세기 (전원 없이 빛 에너지 → 전기 에너지) */
  function solar({light = 1} = {}) {
    const I = photoCurrent(light);
    return {light, I, motor: I};
  }
  // 장치마다 작동 조건: cut = 광전류가 끊길 때, flow = 광전류가 생길 때, amount = 광전류의 크기를 씀
  const TRIGGER = {burglar: 'cut', door: 'cut', street: 'cut', fire: 'flow', solar: 'amount', meter: 'amount', ccd: 'amount'};
  const works = (device, I) => (TRIGGER[device] === 'cut' ? I < HOLD : TRIGGER[device] === 'flow' ? I > 0 : I);

  /* 개념 체크: 경보가 울리는 순간(빛이 가려지기 전 before → 후 after) 보기 다섯 개의 참·거짓 */
  const CHOICES = [
    '광전관에 빛이 닿아 광전류가 가장 크게 흐른다',
    '전자석이 금속 막대를 더 세게 끌어당긴다',
    '광원의 진동수가 문턱 진동수보다 작아진다',
    '빛이 가려져 광전류가 끊기고 전자석이 힘을 잃는다',
    '광전관에서 광전자가 더 많이 방출된다',
  ];
  function judge(before, after) {
    return [
      after.light > 0 && after.I >= 1,
      after.force > before.force,
      emits(before.f, before.f0) && !emits(after.f, after.f0),
      after.light === 0 && after.I === 0 && !after.magnet,
      after.I > before.I,
    ];
  }

  const api = {h, c, F0, W0, freq, LIGHT, HOLD, emits, photoCurrent, relay, blocks, burglar, fire, sunlight, streetlight, solar,
    TRIGGER, works, CHOICES, judge};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.III2_04 = api;
})(typeof window !== 'undefined' ? window : globalThis);
