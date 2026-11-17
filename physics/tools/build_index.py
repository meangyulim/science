"""물리 실험실 목록 갱신: python3 physics/tools/build_index.py

- physics/<단원>/<번호>/index.html 이 있는 개념을 찾아 physics/data/built.json 에 적는다
  (물리 실험실 첫 화면 physics/index.html 이 이 파일과 physics_concepts.json 을 읽어 단원별 목록을 그린다).
- 개념 페이지가 하나라도 있는 단원은 단원 목록 페이지 physics/<단원>/index.html 을 새로 만든다.
개념 페이지를 새로 만들면 이 스크립트를 한 번 돌리면 된다."""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(ROOT, 'data', 'physics_concepts.json'), encoding='utf-8'))
concepts = data['concepts']
esc = html.escape


def page_of(c):
    return os.path.join(ROOT, c['unit_code'], f"{c['no']:02d}", 'index.html')


built = [c['id'] for c in concepts if os.path.exists(page_of(c))]
json.dump({'built': built}, open(os.path.join(ROOT, 'data', 'built.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=IBM+Plex+Mono:wght@500;600&family=Noto+Sans+KR:wght@400;500;700;800&display=swap">')

units = {}
for c in concepts:
    units.setdefault(c['unit_code'], []).append(c)

for code, cs in units.items():
    have = [c for c in cs if c['id'] in built]
    if not have:
        continue
    u = cs[0]
    items = []
    for c in cs:
        title = esc(c['concept'])
        q = esc(c['question'])
        tag = '<span class="u-qual">원리 애니메이션</span>' if c['qualitative'] else ''
        if c['id'] in built:
            items.append(f'''    <li><a class="u-card" href="{c['no']:02d}/">
      <span class="u-thumb"><img class="lt" src="../data/thumbs/{c['id']}.webp" alt="" loading="lazy" onerror="this.parentNode.hidden=true"><img class="dk" src="../data/thumbs/{c['id']}-dark.webp" alt="" loading="lazy"></span>
      <span class="u-head"><span class="u-id">{c['id']}</span>{tag}</span>
      <b>{title}</b>
      <span class="u-q">{q}</span>
    </a></li>''')
        else:
            items.append(f'''    <li><div class="u-card off" aria-disabled="true">
      <span class="u-head"><span class="u-id">{c['id']}</span><span class="u-soon">준비 중</span></span>
      <b>{title}</b>
      <span class="u-q">{q}</span>
    </div></li>''')
    page = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(u['unit'])} — 물리 실험실</title>
{FONTS}
<link rel="stylesheet" href="../kit/lab.css">
<style>
/* 단원 목록: 개념 카드를 원고 순서대로 */
.u-list{{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}}
.u-card{{display:grid;gap:4px;align-content:start;height:100%;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:14px 16px;color:inherit;text-decoration:none;overflow:hidden}}
.u-thumb{{display:block;margin:-14px -16px 8px;aspect-ratio:16/10;overflow:hidden;border-bottom:1px solid var(--line-soft);background:var(--copper-soft)}}
.u-thumb img{{display:block;width:100%;height:100%;object-fit:cover;object-position:center top}}
.u-thumb .dk{{display:none}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]) .u-thumb .lt{{display:none}} :root:not([data-theme="light"]) .u-thumb .dk{{display:block}}}}
:root[data-theme="dark"] .u-thumb .lt{{display:none}} :root[data-theme="dark"] .u-thumb .dk{{display:block}}
a.u-card:hover{{border-color:var(--copper)}}
.u-card b{{font-size:16.5px;line-height:1.45}}
.u-card .u-q{{font-size:14px;color:var(--muted);line-height:1.6}}
.u-id{{font:600 12.5px var(--font-num);color:var(--copper);background:var(--copper-soft);padding:2px 8px;border-radius:999px}}
.u-qual,.u-soon{{font-size:12.5px;font-weight:600;color:var(--muted)}}
.u-card.off{{opacity:.55}}
.u-head{{display:flex;gap:8px;align-items:center}}
</style>
</head>
<body>
<div class="page">
  <header class="top">
    <a class="back" href="../">← 물리 실험실</a>
    <div class="crumbs"><span class="id">{code}</span><span class="kicker">{esc(u['subject'])} · {esc(u['big_unit'])}</span></div>
    <h1>{esc(u['unit'])}</h1>
    <p class="lead">개념 {len(cs)}개 가운데 {len(have)}개를 실험 페이지로 만들었어요. 순서대로 보면 단원의 흐름이 이어져요.</p>
  </header>
  <ol class="u-list">
{chr(10).join(items)}
  </ol>
</div>
<script src="../kit/lab.js"></script>
</body>
</html>
'''
    open(os.path.join(ROOT, code, 'index.html'), 'w', encoding='utf-8').write(page)
    print('단원 목록', code, f'{len(have)}/{len(cs)}')
print('만든 개념', len(built), built)
