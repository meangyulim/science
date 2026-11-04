# 민규쌤의 과학 실험실

지구과학 수업용 시뮬레이션과 학습지를 모아 둔 사이트입니다. 첫 화면은 `index.html`입니다.

## 폴더

| 폴더 | 들어 있는 것 |
|---|---|
| `index.html` | 첫 화면. 맨 위에 '시험 범위' 묶음(`currentClass`), 그 아래 분류(활동 수업·지질·대기해양·천체우주·그 밖의 것)별 목록. 검색창과 분류 탭이 있습니다. 목록은 `simulations` 배열. |
| `worksheets/` | 학습지 페이지(`index.html`), 학습지 목록 `worksheets-data.js`, 공지 `notices.txt`, PDF 파일 |
| `sims/` | 시뮬레이션. 파일 하나짜리는 `sims/이름.html`, 여러 파일짜리는 `sims/이름/` 폴더 |
| `sims/quake/` | 야외수업 「캠퍼스 지진」. Firebase 규칙은 `database.rules.json` (자리 배치와 같이 쓰는 파일 — 콘솔에는 이 파일 전체를 붙여 넣습니다) |
| `sims/seats/` | 자리 배치 시뮬레이션: 학생이 폰으로 같이 앉고 싶은 친구(최대 3명)·앉고 싶은 자리(최대 3곳)를 내면 선생님 화면이 실시간으로 자리를 맞춥니다. 교실은 두 줄씩 붙은 분단 셋: 복도 쪽 1분단은 2줄 × 6자리 뒤에 피라미드처럼 반 칸씩 엇갈린 세 칸(15자리), 2·3분단은 2줄 × 5자리(모두 35자리). 분단 사이에 통로가 있어서, 통로 건너 옆자리는 짝보다 멀게 계산합니다. 교실 모양은 `seats-model.js`의 `LAYOUTS`에 있어요 — 보통 교실(35자리)과 종합강의실(양끝 2줄·가운데 3줄 × 6자리, 42자리 — 자리가 넉넉해서 서로 고르지 않은 학생끼리는 붙이지 않고 띄엄띄엄, 너무 뒤로는 안 가게). 명단 창에서 엑셀 명렬표를 바로 불러올 수 있고(시트마다 분반), 명단에 없는 학생은 폰에서 이름을 보내면 저절로 더해집니다. 계산은 `seats-model.js` |
| `sims/geologic-game/` | 지질시대 온라인 게임 |
| `sims/phone-sextant/` | 폰 육분의: 카메라·기울기 센서로 해·달·별의 고도를 재서 위치 찾기. 계산은 `phone-sextant-model.js` |
| `sims/sun/` 외 7개 | 행성우주과학 Ⅱ·Ⅲ단원 실험실: `sun`(태양 관측소), `star-distance`(별까지의 거리), `star-motion`(별의 공간 운동), `cluster-cmd`(성단 C-M도), `milky-way`(우리은하 지도), `dust`(성간 티끌), `redshift-survey`(은하 적색 편이 탐사), `cosmic-web`(우주거대구조 모의실험). 변광성 실험실(`sims/variables/`)과 같은 틀이고 계산은 폴더마다 `*-model.js`. 주소 끝에 `#s2`처럼 붙이면 그 실험부터 열립니다(QR 코드용) |
| `widgets/` | 첫 화면에 붙는 작은 기능 (체육대회 우천 레이더) |
| `tests/` | 계산 모형 테스트: `node --test tests/*.test.cjs` |
| `archive/` | 지금은 쓰지 않는 예전 파일 |
| `404.html` | 옛 주소로 들어오면 새 주소로 보내 줍니다 (2026-10 폴더 정리 전 링크·QR 코드용) |

## 자주 하는 일

- **공지 올리기**: `worksheets/notices.txt`에 `날짜 | 내용` 한 줄
- **학습지 올리기**: PDF를 `worksheets/`에 올리고 `worksheets/worksheets-data.js`에 한 항목 추가
- **시험 범위 바꾸기**: `index.html`의 `currentClass` 블록에서 제목과 `items`(시뮬레이션 id, 단원 순서)를 바꿉니다. 시험 범위가 바뀌면 여기만 고치면 됩니다.
- **새 시뮬레이션**: `sims/`에 넣고 `index.html`의 `simulations` 배열 맨 아래에 추가. `category`(분류)와 `desc`(한 줄 설명)를 적고, 폰 센서·야외 활동이면 `phone: true`. 맨 아래 `NEW_COUNT`개(지금 9개)에는 NEW 표시가 자동으로 붙습니다.
