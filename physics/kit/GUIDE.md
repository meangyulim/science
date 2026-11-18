# 개념 실험 페이지 만드는 법

물리 실험실(`physics/`)의 개념 실험은 개념서 「그림 물리」의 개념 158개(`physics/data/physics_concepts.json`)를 **개념 하나 = 페이지 하나**로 만든다. 대단원 Ⅲ(III1·III2, 21개)이 첫 묶음이고, 앞으로 만드는 페이지도 이 기준을 따른다.

배치는 **관찰 노트**(사용자가 고른 A안)다. 왼쪽 실험대(무대 + 조작)는 화면에 붙어 있고, 오른쪽 노트를 ①부터 차례로 읽으며 무대를 그 장면으로 바꿔 본다. 기준 페이지는 `physics/III1/04/`(굴절과 스넬 법칙)다.

## 사용자가 정한 기준
- 그림물리 웹사이트의 예전 시뮬(작은 캔버스 + 슬라이더)처럼 만들지 않는다. **그 개념을 눈으로 이해하게 하는** 실험이어야 한다. 원리가 움직임으로 보여야 한다.
- 공식의 변수는 슬라이더로 바꾼다. **예제 수치는 기본값**으로 넣고, **예제의 답은 검증값**으로 쓴다(화면에 그 답이 나오고, 테스트로도 확인).
- 정성 개념은 원리가 보이는 애니메이션으로 만든다.
- 폰과 아이패드(가로·세로)에서 잘 보여야 하고, 가로 스크롤이 없어야 한다.
- 배경은 흰색이나 옅은 회색(민트빛 X). 본문은 Noto Sans KR, 맨 위 제목은 Black Han Sans. **숫자도 Noto Sans KR**(코드 글꼴 X).
- **굵기는 아껴 쓴다.** 본문 400, 강조 600, 제목·카드 제목 700. 굵은 글씨(`<b>`)는 한 문단에 하나 정도, 정말 중요한 곳에만.
- 순서와 연결: 무엇부터 볼지 안내하고(관찰 ①②③…), 공식에는 지금 값을 넣어 보여 주고(「지금 값」 카드), 단원 속 위치(맨 위 개념 점)와 이전·다음 개념이 늘 보여야 한다.

## 파일
- `physics/<단원>/<번호>/index.html` — 예: `physics/III1/04/index.html`
- `physics/<단원>/<번호>/<ID>-model.js`
  - 순수 함수로 만든 계산 모형이다.
  - 끝은 `if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.<단원>_<번호> = api;` 로 한다.
- `tests/<ID>-model.test.cjs`
  - `node:test` 로 예제 값 → 예제 답을 그대로 검증한다.
  - 개념의 핵심 성질도 2~4개 검증한다.
  - 정성 개념도 판정·분류 함수를 만들어 테스트한다.
- `physics/data/short_names.json`: 맨 위 막대와 끝의 이전·다음에 쓰는 짧은 이름(예: `"III1-04": "굴절과 스넬 법칙"`). 새 개념을 만들면 한 줄 더한다.
- 새 페이지를 만든 뒤에는 두 가지를 돌린다.
  1. `python3 physics/tools/build_index.py`
     - 첫 화면 개념 지도(`data/built.json`)와 단원 목록(`<단원>/index.html`)을 갱신한다.
     - 개념 페이지마다 `<!-- topbar -->…<!-- /topbar -->` 사이에 맨 위 막대(실험실로 · 단원 이름과 개념 점 · 이전/다음)를, `<!-- nextprev -->…<!-- /nextprev -->` 사이에 쪽 끝 이전·다음 카드를 채운다. **이 두 곳은 손으로 쓰지 않는다**(표시만 두면 된다).
  2. `node physics/tools/thumbs.cjs <ID>`: 그 페이지의 무대(`.stage`)를 밝은·어두운 테마로 찍어 카드 그림 `data/thumbs/<ID>.webp`, `<ID>-dark.webp`(폭 560px)을 만든다. 첫 화면과 단원 목록 카드가 이 그림을 쓴다. 무대 모양을 크게 바꿨을 때도 다시 찍는다. ID 없이 돌리면 전부 다시 찍는다.
- 첫 화면(`physics/index.html`)은 개념 목록을 JSON에서 읽으므로 손으로 고칠 일은 거의 없다. 첫 화면도 `kit/lab.css` 의 토큰·`body`·`.page`·`.back`·`h1`·`--font-num` 을 쓰므로, 이것들을 바꿀 때는 첫 화면도 같이 확인한다.
- 직류 전동기는 II2-06 자리(`physics/II2/06/`)에 있다. 이 페이지만 `lab.css`·`lab.js` 를 쓰지 않는 3D 페이지다(three.js). 옛 주소 `physics/dc-motor/` 는 `404.html` 이 새 주소로 보낸다.

## 페이지 골격 (관찰 노트)
```html
<head>
  …<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="../../kit/lab.css">
  <style>/* 이 페이지만의 것: 무대·그래프 비율(#stage{aspect-ratio:16/10.5} …) 정도 */</style>
</head>
<body class="cx">
<!-- topbar -->
<!-- /topbar -->
<div class="page">
  <div class="title">
    <div class="crumb"><span class="id">III1-04</span><span>물리학 Ⅰ · 파동의 성질과 활용</span></div>
    <h1>굴절과 스넬 법칙</h1>
    <p class="question"><i>Q</i>(physics_concepts.json 의 question)</p>
  </div>
  <main class="lay">
    <section class="bench" aria-label="실험대">
      <div class="stage">
        <canvas id="stage" aria-label="…"></canvas>
        <div class="hud">…<span class="pill" id="hud1">…</span></div>
        <div class="legend">…</div>                       <!-- 좁은 화면에서는 lab.js 가 시트 안으로 옮긴다 -->
        <span class="nowstep" id="nowstep" hidden></span>  <!-- 지금 읽는 단계 이름 (lab.js) -->
      </div>
      <div class="dock">
        <div class="row r1">
          <button type="button" class="play" id="play" aria-pressed="true"></button>
          <div class="slider"><label for="th"><span class="lg">입사각 </span>θ₁</label><input id="th" type="range" …><output id="thOut">60°</output></div>
          <button type="button" class="btn sheet-btn" id="sheetBtn" aria-expanded="false" aria-controls="sheet">(아이콘)<span class="lg">매질·보기</span><span class="sm">매질</span></button>
        </div>
        <div class="sheet" id="sheet" role="group" aria-label="매질과 보기">
          <div class="sheet-head"><b>매질 · 보기 바꾸기</b><button type="button" class="btn ghost" id="sheetClose">닫기</button></div>
          <div class="row">…버튼 묶음(.group), 막대(.grow + .ctl-label)…</div>
          <div class="toggles"><label class="chk"><input type="checkbox" id="cX">…</label></div>
        </div>
      </div>
    </section>
    <section class="notes" aria-label="관찰 노트">
      <div class="answer">                                   <!-- 지금 값 -->
        <div class="lab"><span>지금 굴절각</span><span id="ansCtx">공기 1 → 유리 √3</span></div>
        <div class="big" id="ansBig">θ₂ = 30°</div>
        <div class="sub"><span class="f" id="ansF">n₁ sin θ₁ = n₂ sin θ₂ 에 지금 값을 넣으면</span><span id="ansLines">…</span></div>
        <div class="minis"><div class="mini"><span>…</span><b id="rV2">…</b></div>…</div>
        <p class="check" id="exCheck"></p>
      </div>
      <ol class="steps">
        <li class="card step" data-step="① 파면이 도는 까닭"><div class="kind">관찰 1</div><h3>…</h3><p>…</p><canvas class="flat" id="…"></canvas><p class="cap">…</p><div class="acts">…</div></li>
        …관찰 2~4…
        <li class="card step sum" data-step="⑤ 정리"><div class="kind">핵심 정리</div><h3>…</h3><ul><li>…</li></ul></li>
        <li class="card step ex" data-step="⑥ 개념서 예제"><div class="kind">개념서 예제</div><h3>(예제 문제)</h3><div class="acts"><button class="btn go" data-try="ex">예제 상황으로</button></div><details class="ans"><summary>풀이 보기</summary><p>…</p></details></li>
        <li class="card step" data-step="⑦ 스스로 확인"><div class="kind">스스로 확인</div><div class="q"><h3>…</h3><div class="acts">…data-try…</div><details class="ans">…</details></div>…</li>
      </ol>
<!-- nextprev -->
<!-- /nextprev -->
    </section>
  </main>
</div>
<script src="../../kit/lab.js"></script>
<script src="III1-04-model.js"></script>
<script>(function () { 'use strict'; … })();</script>
</body>
```

## 설계
- 만들기 전에 **“학생이 이 개념에서 눈으로 봐야 할 것” 2~4가지**를 원고 본문, 그림, 핵심 관계, 자주 하는 실수에서 뽑는다. 이것이 그대로 **관찰 ①②③…** 이 된다. 공식만 슬라이더로 바꾸는 계산기는 실패작이다.
- **무대** (`.stage` 의 큰 캔버스)
  - 현상 자체를 움직임으로 보여 준다. 실제 물체를 공들여 그린다.
  - 관찰 대상(점 P, 마루, 광자 하나…)을 구리색으로 강조한다.
  - 시간이 중요한 개념에는 느린 화면과 「한 단계 앞으로」 버튼을 둔다.
- **지금 값** (`.answer`): 이 개념의 핵심 식에 **지금 값을 넣는 과정**을 보여 준다.
  - 큰 결과(`#ansBig`) 하나 + 식 줄 2~3개(`#ansLines`). 바뀌는 값은 `<em>` 으로 구리색. 예: `1 × sin <em>60°</em> = √3 × sin θ₂` → `sin θ₂ = 0.5 → <em>θ₂ = 30°</em>`.
  - 페이지 스크립트의 수치 갱신 함수에서 `Lab.ans(big, lines, {tone, lab, ctx, f})` 로 채운다(큰 결과에 아래첨자가 필요하면 `html: true`). 장면마다 카드 제목이 다르면 제목 칸을 `<span id="ansLab">` 로 두고 `lab` 으로 바꾼다.
  - 무대의 HUD·지금 값 카드에는 ①②③ 같은 동그라미 숫자를 쓰지 않는다(관찰 단계 번호와 헷갈린다). 단계나 조건은 “조건 1”, “1단계”처럼 쓴다. 장면마다 식이 다르면 `f`(식 안내 줄)와 `ctx`(오른쪽 위 상황)도 바꾼다. 매 프레임이 아니라 값이 바뀔 때만 부른다.
  - 결과가 물리적으로 없을 때(전반사, 광전자 없음 …)는 `tone: 'neg'` 로 까닭을 식 줄에 쓴다.
  - 정성 개념은 판정 결과를 크게(예: `보강 간섭`), 판정 근거를 식 줄에(예: `경로차 = <em>1.0λ</em> = 정수 × λ`).
  - 나머지 수치는 `.minis .mini`(이름 + 값) 2~6칸. 예제 확인 줄(`Lab.check('exCheck', …)`)은 카드 맨 아래.
- **관찰 단계** (`ol.steps > li.card.step`): 위에서 아래로 읽는 순서가 곧 이해의 순서다.
  - 관찰 2~4개 → 정리 1개 → 개념서 예제 → 스스로 확인. 단계마다 `data-step="① 짧은 이름"`(무대 오른쪽 아래 표시에 쓰임)과 `.kind`(관찰 1, 핵심 정리, 개념서 예제, 스스로 확인).
  - 관찰 카드: `h3` 에 **관찰한 사실 한 문장**(예: “먼저 닿은 끝부터 느려진다”), `p` 에 무대에서 무엇을 보면 되는지, 필요하면 그 관찰과 짝인 그래프(`canvas.flat`)와 짧은 설명(`.cap`), 그리고 무대를 그 장면으로 바꾸는 버튼(`.acts`).
  - 예전 오른쪽 패널의 그래프는 그것을 설명하는 관찰 카드 안으로 옮긴다. 예전 「개념 정리」 카드 3개와 비교 한 줄(`.compare`)의 내용은 관찰 카드와 정리 카드에 나눠 담는다(내용을 버리지 않는다).
  - 정리 카드(`.step.sum`): 핵심 식과 관계 2~4줄(`ul`). 자주 하는 실수가 있으면 여기 한 줄.
  - 개념서 예제(`.step.ex`): 예제 문제, `data-try="ex"` 버튼(예제 상황 = 기본값), 풀이는 `details.ans`.
  - 스스로 확인: 나머지 문항을 `.q` 로 하나씩(문제 `h3`, 상황 버튼, `details.ans` 답).
- **단계 버튼**
  - 상황 전체를 바꾸는 버튼은 `data-try="키"` 로 하고 페이지 스크립트의 `Lab.tries({키: () => {…}}, after)` 에 넣는다. 같은 키를 여러 버튼이 써도 된다.
  - 조작판의 버튼을 대신 눌러 주기만 하면 되는 것은 `data-do` 로 쓴다: `data-do="click:#step"`, `data-do="check:#cHuy"`, `data-do="click:[data-m2=glass]"`, `data-do="set:#th=45"` (세미콜론으로 여러 개). 숫자로 시작하는 속성 값은 따옴표로 감싼다: `data-do='click:[data-speed="0.5"]'`.
- **조작** (`.dock`)
  - 첫 줄(`.r1`): 재생(`Lab.play`) + **가장 중요한 조작 하나**(대개 핵심 변수 막대 `.slider`, 장면이 여럿이면 장면 버튼 묶음) + 시트 버튼(`#sheetBtn`). 폰에서도 한 줄에 들어가야 한다(폰에서는 `.lg` 글자가 숨고 `.sm` 글자가 보인다).
  - 나머지는 시트(`.sheet`)에 넣는다. 넓은 화면에서는 시트가 첫 줄 아래에 그냥 펼쳐지고, 좁은 화면에서는 시트 버튼으로 아래에서 올라온다. 시트 버튼과 제목은 내용에 맞게 쓴다(매질·보기, 장면·보기 …).
  - 공식의 변수는 막대(`Lab.slider` 또는 `input[type=range]`), 상황 전환은 버튼 묶음(`.group` + `Lab.group`), 켜고 끄기는 `.chk`. 끌면 직관적인 것은 `Lab.pointer` 로 끌게 한다.
  - 막대 이름은 짧게(“입사각 θ₁”). 긴 설명(“무대의 광원을 끌어도 된다” 등)은 관찰 카드 글로 옮긴다.
- **맨 위**: 제목 아래 `.question` 에 이 개념의 질문(JSON 의 question)을 Q 로 한 줄. 예전의 긴 리드 글은 관찰 1에 녹인다.

## 화면 규칙
- 색은 `Lab.C` 토큰만 쓴다. 투명도는 `Lab.alpha`, 픽셀 계산은 `Lab.rgb`, 빛의 실제 색은 `Lab.wlColor` 를 쓴다.
  - 의미 색: vel(파랑) = 진행·물체·광선, acc(초록) = 결과·보강, force(빨강) = 힘·(+), neg(빨강) = 음수·상쇄, energy(주황) = 에너지, violet = 장·진폭, copper = 관찰 대상·치수.
- 캔버스 글자는 `Lab.text` / `Lab.rich`(아래첨자) / `Lab.tag`(바탕 있는 이름표)를 쓴다. 13px 이상이다.
  - 굵기 `w`: **기본 500**(눈금·설명), **600** 이름표·값, **700** 무대에서 정말 중요한 것 하나(예: 매질 이름). 모든 글자를 700 으로 쓰지 않는다.
  - 숫자도 본문 글꼴이다(`mono` 옵션은 남아 있지만 글꼴이 같다).
- 주요 곡선 굵기는 2.6 이상, 점 반지름은 4 이상으로 한다.
- **무대 크기**
  - 넓은 화면: 페이지 CSS 의 `#stage{aspect-ratio:…}` 를 따르되, 조작 줄까지 화면에 들어오게 lab.css 가 높이를 줄일 수 있다(그러면 무대가 조금 납작해진다). 그림은 늘 `W`·`H` 에 맞춰 그린다.
  - 좁은 화면(가로 999px 이하): 무대 높이는 `--stage-h` 로 정해진다. 아이패드 세로 `min(80vw, 42vh)`(약 790 × 500), 폰 `min(100vw − 32px, 42vh)`(약 **358 × 354, 거의 정사각형**). 폰 배치(`W < 520`)는 이 정사각형에 다 들어가게 그린다. 정말 더 높아야 하면 페이지 CSS 에서 `.bench{--stage-h:…}` 로 조금만 늘린다(폰 화면에서 노트를 읽을 자리가 줄어든다).
- 폰 폭(`W < 520`)에서는 배치를 따로 잡는다. HUD(왼쪽 위), 지금 단계 표시(오른쪽 아래), 눈금이 그림과 겹치지 않게 한다. 범례는 좁은 화면에서 시트 안으로 옮겨지므로 무대에서 사라진다.
- `.btn`, `.ctl-label`, `.chk`, `.legend span` 안에 `<sub>` 를 쓰면 글자를 `<span>` 으로 감싼다(flex 라서 따로 떨어진다).
- 좁은 화면인지는 `matchMedia('(max-width: 999px)')` 로 안다(이때 범례는 시트 안에 있다). 무대 오른쪽 아래 약 30px 높이는 지금 단계 표시(`#nowstep`) 자리다.
- `Lab.reduceMotion` 이면 처음에 멈춘 상태로 연다.
- 원고와 같은 기호·상수를 쓴다(c = 3 × 10⁸ m/s, h = 6.6 × 10⁻³⁴ J·s …). 그림을 과장했으면 화면에 밝힌다.

## 확인
1. `node --test tests/<ID>-model.test.cjs` (전체는 `node --test tests/*.test.cjs`)
2. `python3 -m http.server` 로 띄운 뒤 헤드리스 Chromium(Playwright)으로 찍어 직접 본다.
   - 크기·테마: 1366×900 밝게(첫 화면, 관찰 ③쯤 내린 화면), 1180×820 어둡게, 820×1180 밝게(내린 화면), 390×844 밝게(첫 화면, 내린 화면)·어둡게(시트 연 화면)
   - 내린 화면에서 무대와 첫 조작 줄이 위에 붙어 있고, 지금 읽는 단계에 테두리와 무대 표시가 생기는지
   - `data-try` 장면마다 한 번씩, `data-do` 버튼도 한 번씩
   - 가로 넘침 0, 콘솔 오류 0
3. 물리 수치를 따로 계산해 화면 값(특히 「지금 값」 카드의 식)과 맞춰 본다.

## 자료
- 원고(개념 설명·그림·예제·개념 체크)의 원본은 사용자 구글 드라이브 `시험준비/4_그림물리_웹사이트/그림물리_원본_코드.zip` 의 `cx/<단원>.py`, `qz/<단원>.py` 이다.
- 개념서 그림은 공개 사이트 `https://meangyulim.github.io/visual-physics/assets/img/<단원>_s<절>_<a|b|c>.webp` 에 있다.
- `physics_concepts.json` 의 `page` 는 개념서 웹 페이지의 해당 절이다.
