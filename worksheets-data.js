// ─────────────────────────────────────────────────────────────
//  학습지 목록  —  학습지를 올리거나 고칠 때는 이 파일만 고치면 됩니다.
// ─────────────────────────────────────────────────────────────
//
//  이 목록을 worksheets.html 에서 떼어 둔 이유:
//  휴대폰은 한 번 연 페이지를 오래 붙들고 있어서, 목록이 페이지 안에 있으면
//  새 학습지를 올려도 학생 화면에 한참 안 뜬다. 이 파일은 페이지를 열 때마다,
//  그리고 다른 앱에 갔다가 돌아올 때마다 새로 받아 오므로 곧바로 반영된다.
//
//  쉼표 하나, 따옴표 하나가 어긋나면 목록 전체를 못 읽는다.
//  그때는 학생 화면에 '목록을 불러오지 못했습니다' 가 뜨니, 고친 곳을 다시 확인한다.

// 지금 진도의 시험 범위. 이 이름과 exam 이 같은 학습지만 펼쳐 보이고,
// 나머지는 맨 아래 '지난 학습지' 에 시험별로 접어 둔다.
// 다음 시험 범위로 넘어가면 이 한 줄을 바꾸고, 새 학습지의 exam 에 같은 이름을 적는다.
var CURRENT_EXAM = '기말고사';

// 학습지 목록. 자료를 추가할 때는 이 배열에 한 줄만 더 쓰면 된다.
//   file      : 저장소 안의 실제 경로 (영문 이름 — 서버·브라우저에서 안전하다)
//   saveAs    : 학생이 저장할 때 보이는 파일 이름 (한글로 써도 된다)
//   added     : 올린 날짜 (YYYY-MM-DD). 이 날짜로 위쪽 '공지 및 변경사항' 이
//               자동으로 만들어지고, 최근 항목에는 NEW 표시가 붙는다.
//   updates   : 고쳐 올린 날짜를 하나씩 덧붙이는 목록 (예: ['2026-09-22']).
//               개수가 곧 차수다. 두 번째로 고치면 날짜를 하나 더 적기만 하면
//               '2차 수정' 이 된다. 목록에 '1차 수정' 배지가 붙고, 변경사항에
//               소식이 자동으로 생기며, 내려받기 주소 뒤에 ?v=날짜 가 붙어
//               학생이 캐시된 옛 파일을 받지 않는다.
//               무엇을 고쳤는지는 여기 적지 않고 notices.txt 에 쓴다.
//   videos    : 영상 수업 링크 (없으면 빼도 된다). 카드에 버튼으로 붙는다.
//               예: [{ label: 'Teams 영상', url: 'https://...' }]
//   exam      : 어느 시험 범위인지 (예: '중간고사'). 빼면 지금 범위로 본다.
//   no        : 학습지 번호. 시험 범위마다 1번부터 센다.
//               화면에는 이 번호로 표시하고 이 번호 순으로 줄 세운다.
//               아직 안 올린 번호를 건너뛰어도 되고, 나중에 그 번호를 추가하면
//               배열 어디에 적든 제자리에 끼어 들어간다.
var worksheets = [
  {
    unit:   'Ⅰ. 우주 탐사와 행성계',
    title:  '태양계 탐사와 우주 위험 감시',
    note:   '소단원 내용 정리',
    no:     1,
    exam:   '중간고사',
    file:   'worksheets/01-solar-system-exploration.pdf',
    added:  '2026-09-07',
    saveAs: '행성우주과학_태양계 탐사와 우주 위험 감시.pdf',
    pages:  3,
    bytes:  417231
  },
  {
    unit:   'Ⅰ. 우주 탐사와 행성계',
    title:  '케플러 법칙 — 궤도의 모양과 속도',
    note:   '02. 태양계 천체들의 운동 · 케플러 1·2법칙',
    no:     2,
    exam:   '중간고사',
    file:   'worksheets/02-kepler-laws.pdf',
    added:  '2026-09-08',
    saveAs: '행성우주과학_케플러 법칙 궤도의 모양과 속도.pdf',
    pages:  5,
    bytes:  919738
  },
  {
    unit:   'Ⅰ. 우주 탐사와 행성계',
    title:  '조화 법칙과 태양의 중력',
    note:   '02. 태양계 천체들의 운동 · 케플러 3법칙, 만유인력',
    no:     3,
    exam:   '중간고사',
    file:   'worksheets/03-harmonic-law-gravity.pdf',
    added:  '2026-09-09',
    saveAs: '행성우주과학_조화 법칙과 태양의 중력.pdf',
    pages:  5,
    bytes:  556832
  },
  {
    unit:   'Ⅰ. 우주 탐사와 행성계',
    title:  '외계 행성계 탐사 방법',
    note:   '소단원 내용 정리',
    no:     4,
    exam:   '중간고사',
    file:   'worksheets/04-exoplanet-detection.pdf',
    added:  '2026-09-15',
    updates: ['2026-09-22'],
    saveAs: '행성우주과학_외계 행성계 탐사 방법.pdf',
    pages:  4,
    bytes:  569478
  },
  {
    unit:   'Ⅰ. 우주 탐사와 행성계',
    title:  '생명 가능 지대와 생명체',
    note:   '소단원 내용 정리',
    no:     5,
    exam:   '중간고사',
    file:   'worksheets/05-habitable-zone.pdf',
    added:  '2026-09-18',
    saveAs: '행성우주과학_생명 가능 지대와 생명체.pdf',
    pages:  4,
    bytes:  360901
  },
  {
    unit:   'Ⅰ. 우주 탐사와 행성계',
    title:  '행성과 소천체의 특징과 탐사',
    note:   '소단원 내용 정리',
    no:     6,
    exam:   '중간고사',
    file:   'worksheets/06-planets-small-bodies.pdf',
    videos: [
      { label: 'Teams 영상',   url: 'https://sen1347.sharepoint.com/:v:/s/msteams_c3a52c/IQDc8b8o1iDfQZWISXBoWpbqAVnv2bwmEE7zVowDyiEKFcE' },
      { label: '드라이브 영상', url: 'https://drive.google.com/file/d/1yYMatQ2h9VI41Rha4wC_44QntCJDT1CT/view?usp=drivesdk' }
    ],
    added:  '2026-09-23',
    saveAs: '행성우주과학_행성과 소천체의 특징과 탐사.pdf',
    pages:  4,
    bytes:  190485
  },
  {
    no:     7,
    exam:   '중간고사',
    unit:   'Ⅰ. 우주 탐사와 행성계',
    title:  '1단원 심화 개념 정리',
    note:   '심화 개념 정리',
    file:   'worksheets/07-unit1-advanced-concepts.pdf',
    added:  '2026-09-22',
    saveAs: '행성우주과학_1단원 심화 개념 정리.pdf',
    pages:  2,
    bytes:  652695
  },
  {
    unit:   'Ⅱ. 태양과 별의 관측',
    title:  '태양의 광구와 대기 관측',
    note:   '소단원 내용 정리',
    no:     1,
    exam:   '기말고사',
    file:   'worksheets/final-01-sun-photosphere.pdf',
    added:  '2026-10-18',
    saveAs: '행성우주과학_태양의 광구와 대기 관측.pdf',
    pages:  3,
    bytes:  281868
  },
  {
    unit:   'Ⅱ. 태양과 별의 관측',
    title:  '별까지의 거리 측정',
    note:   '소단원 내용 정리',
    no:     2,
    exam:   '기말고사',
    file:   'worksheets/final-02-star-distance.pdf',
    added:  '2026-10-19',
    saveAs: '행성우주과학_별까지의 거리 측정.pdf',
    pages:  4,
    bytes:  158431
  },
  {
    unit:   'Ⅱ. 태양과 별의 관측',
    title:  '별의 공간 운동',
    note:   '소단원 내용 정리',
    no:     3,
    exam:   '기말고사',
    file:   'worksheets/final-03-stellar-motion.pdf',
    added:  '2026-10-20',
    saveAs: '행성우주과학_별의 공간 운동.pdf',
    pages:  3,
    bytes:  225280
  },
  {
    unit:   'Ⅱ. 태양과 별의 관측',
    title:  '변광성의 광도 곡선 특징',
    note:   '소단원 내용 정리',
    no:     4,
    exam:   '기말고사',
    file:   'worksheets/final-04-variable-stars.pdf',
    added:  '2026-10-27',
    saveAs: '행성우주과학_변광성의 광도 곡선 특징.pdf',
    pages:  5,
    bytes:  660506
  }
];
