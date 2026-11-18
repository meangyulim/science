"""물리 실험실 목록 갱신: python3 physics/tools/build_index.py

- physics/<단원>/<번호>/index.html 이 있는 개념을 찾아 physics/data/built.json 에 적는다
  (물리 실험실 첫 화면 physics/index.html 이 이 파일과 physics_concepts.json 을 읽어 단원별 목록을 그린다).
- 개념 페이지가 하나라도 있는 단원은 단원 목록 페이지 physics/<단원>/index.html 을 새로 만든다.
- 개념 페이지의 맨 위 막대(<!-- topbar --> … <!-- /topbar -->)와 끝의 이전·다음 개념(<!-- nextprev --> … <!-- /nextprev -->)을
  새로 채운다: 단원 이름과 개념 점(만든 개념 = 링크, 지금 개념 = 긴 점), 바로 앞·뒤 개념(같은 과목에서 만든 것만 링크).
  짧은 이름은 physics/data/short_names.json (없으면 concept).
개념 페이지를 새로 만들면 이 스크립트를 한 번 돌리면 된다(그다음 thumbs.cjs)."""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(ROOT, 'data', 'physics_concepts.json'), encoding='utf-8'))
concepts = data['concepts']
SHORT = json.load(open(os.path.join(ROOT, 'data', 'short_names.json'), encoding='utf-8'))
esc = html.escape


def page_of(c):
    return os.path.join(ROOT, c['unit_code'], f"{c['no']:02d}", 'index.html')


def short(c):
    return SHORT.get(c['id']) or c['concept']


built = [c['id'] for c in concepts if os.path.exists(page_of(c))]
json.dump({'built': built}, open(os.path.join(ROOT, 'data', 'built.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;500;600;700&display=swap">')

units = {}
for c in concepts:
    units.setdefault(c['unit_code'], []).append(c)


def href(frm, to):
    """개념 페이지 frm 에서 개념 to 로 가는 상대 주소"""
    if frm['unit_code'] == to['unit_code']:
        return f"../{to['no']:02d}/"
    return f"../../{to['unit_code']}/{to['no']:02d}/"


def dots(cs, cur=None, base='../'):
    out = []
    for c in cs:
        name = esc(f"{c['id']} {short(c)}")
        if cur is not None and c['id'] == cur['id']:
            out.append(f'<a class="cur" href="./" aria-current="page" title="{name}" aria-label="{name} (지금)"></a>')
        elif c['id'] in built:
            out.append(f'<a href="{base}{c["no"]:02d}/" title="{name}" aria-label="{name}"></a>')
        else:
            out.append(f'<span title="{name} (준비 중)"></span>')
    return ''.join(out)


def neighbors(c):
    """바로 앞·뒤 개념 (같은 과목 안에서, 만든 것만)"""
    i = concepts.index(c)
    ok = lambda o: o['id'] in built and o['subject'] == c['subject']
    prev = concepts[i - 1] if i > 0 and ok(concepts[i - 1]) else None
    nxt = concepts[i + 1] if i + 1 < len(concepts) and ok(concepts[i + 1]) else None
    return prev, nxt


def label(frm, to):
    """같은 단원이면 '03 매질이 바뀔 때', 다른 단원이면 'III1-12 빛의 간섭'"""
    return f"{to['no']:02d} {short(to)}" if frm['unit_code'] == to['unit_code'] else f"{to['id']} {short(to)}"


def topbar(c):
    cs = units[c['unit_code']]
    prev, nxt = neighbors(c)
    pn = ''
    if prev:
        pn += f'<a href="{href(c, prev)}" rel="prev" title="이전 개념: {esc(prev["id"] + " " + short(prev))}">‹ <span>{esc(label(c, prev))}</span></a>'
    if nxt:
        pn += f'<a href="{href(c, nxt)}" rel="next" title="다음 개념: {esc(nxt["id"] + " " + short(nxt))}"><span>{esc(label(c, nxt))}</span> ›</a>'
    return (f'<header class="topbar"><div class="tb">\n'
            f'  <a class="home" href="../../">← 물리 실험실</a>\n'
            f'  <nav class="unitnav" aria-label="{esc(c["unit_code"] + " " + c["unit"])}: 개념 {len(cs)}개 가운데 {c["no"]}번째">'
            f'<a class="uname" href="../">{esc(c["unit_code"] + " " + c["unit"])}</a><span class="dots">{dots(cs, c)}</span></nav>\n'
            f'  <div class="pn">{pn}</div>\n'
            f'</div></header>')


def nextprev(c):
    prev, nxt = neighbors(c)
    a = (f'<a href="{href(c, prev)}" rel="prev"><small>← 이전 개념 · {prev["id"]}</small><b>{esc(short(prev))}</b></a>' if prev else '<span></span>')
    b = (f'<a href="{href(c, nxt)}" rel="next"><small>다음 개념 · {nxt["id"]} →</small><b>{esc(short(nxt))}</b></a>' if nxt else '<span></span>')
    return f'<nav class="nextprev" aria-label="이전·다음 개념">{a}{b}</nav>'


def fill(s, name, body):
    return re.sub(rf'(<!-- {name} -->).*?(<!-- /{name} -->)', lambda m: m.group(1) + '\n' + body + '\n' + m.group(2), s, count=1, flags=re.S)


# 개념 페이지: 맨 위 막대와 끝의 이전·다음
for c in concepts:
    if c['id'] not in built:
        continue
    p = page_of(c)
    s = open(p, encoding='utf-8').read()
    if '<!-- topbar -->' not in s:
        continue
    s2 = fill(fill(s, 'topbar', topbar(c)), 'nextprev', nextprev(c))
    if s2 != s:
        open(p, 'w', encoding='utf-8').write(s2)
        print('막대·이전다음', c['id'])

# 단원 목록 페이지
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
.u-lead{{margin:2px 0 0;color:var(--ink-2);font-size:16.5px;max-width:64ch}}
.u-list{{list-style:none;margin:8px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}}
.u-card{{display:grid;gap:4px;align-content:start;height:100%;background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:14px 16px;color:inherit;text-decoration:none;overflow:hidden}}
.u-thumb{{display:block;margin:-14px -16px 8px;aspect-ratio:16/10;overflow:hidden;border-bottom:1px solid var(--line-soft);background:var(--copper-soft)}}
.u-thumb img{{display:block;width:100%;height:100%;object-fit:cover;object-position:center top}}
.u-thumb .dk{{display:none}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]) .u-thumb .lt{{display:none}} :root:not([data-theme="light"]) .u-thumb .dk{{display:block}}}}
:root[data-theme="dark"] .u-thumb .lt{{display:none}} :root[data-theme="dark"] .u-thumb .dk{{display:block}}
a.u-card:hover{{border-color:var(--copper)}}
.u-card b{{font-size:16.5px;font-weight:700;line-height:1.45}}
.u-card .u-q{{font-size:14.5px;color:var(--ink-2);line-height:1.6}}
.u-id{{font-size:12.5px;font-weight:600;color:var(--copper-ink);background:var(--copper-soft);padding:1px 8px;border-radius:999px}}
.u-qual,.u-soon{{font-size:12.5px;font-weight:500;color:var(--muted)}}
.u-card.off{{opacity:.55}}
.u-head{{display:flex;gap:8px;align-items:center}}
</style>
</head>
<body class="cx">
<header class="topbar"><div class="tb">
  <a class="home" href="../">← 물리 실험실</a>
  <nav class="unitnav" aria-label="{esc(code + ' ' + u['unit'])}: 개념 {len(cs)}개"><span class="uname">{esc(code + ' ' + u['unit'])}</span><span class="dots">{dots(cs, None, '')}</span></nav>
  <div class="pn"></div>
</div></header>
<div class="page">
  <div class="title">
    <div class="crumb"><span class="id">{code}</span><span>{esc(u['subject'])} · {esc(u['big_unit'])}</span></div>
    <h1>{esc(u['unit'])}</h1>
    <p class="u-lead">개념 {len(cs)}개 가운데 {len(have)}개를 실험 페이지로 만들었어요. 순서대로 보면 단원의 흐름이 이어져요.</p>
  </div>
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
