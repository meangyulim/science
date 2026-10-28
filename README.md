# 민규쌤의 과학 실험실

지구과학 수업용 시뮬레이션과 학습지를 모아 둔 사이트입니다. 첫 화면은 `index.html`입니다.

## 폴더

| 폴더 | 들어 있는 것 |
|---|---|
| `index.html` | 첫 화면. 시뮬레이션을 분류(지질·대기해양·천체우주·그 밖의 것)별로 묶어 보여 주고, 검색창과 분류 탭이 있습니다. 목록은 `simulations` 배열. |
| `worksheets/` | 학습지 페이지(`index.html`), 학습지 목록 `worksheets-data.js`, 공지 `notices.txt`, PDF 파일 |
| `sims/` | 시뮬레이션. 파일 하나짜리는 `sims/이름.html`, 여러 파일짜리는 `sims/이름/` 폴더 |
| `sims/quake/` | 야외수업 「캠퍼스 지진」. Firebase 규칙은 `database.rules.json` |
| `sims/geologic-game/` | 지질시대 온라인 게임 |
| `sims/phone-sextant/` | 폰 육분의: 카메라·기울기 센서로 해·달·별의 고도를 재서 위치 찾기. 계산은 `phone-sextant-model.js` |
| `widgets/` | 첫 화면에 붙는 작은 기능 (체육대회 우천 레이더) |
| `tests/` | 계산 모형 테스트: `node --test tests/*.test.cjs` |
| `archive/` | 지금은 쓰지 않는 예전 파일 |
| `404.html` | 옛 주소로 들어오면 새 주소로 보내 줍니다 (2026-10 폴더 정리 전 링크·QR 코드용) |

## 자주 하는 일

- **공지 올리기**: `worksheets/notices.txt`에 `날짜 | 내용` 한 줄
- **학습지 올리기**: PDF를 `worksheets/`에 올리고 `worksheets/worksheets-data.js`에 한 항목 추가
- **새 시뮬레이션**: `sims/`에 넣고 `index.html`의 `simulations` 배열 맨 아래에 추가. `category`(분류)와 `desc`(한 줄 설명)를 적고, 폰 센서·야외 활동이면 `phone: true`. 맨 아래 3개에는 NEW 표시가 자동으로 붙습니다.
