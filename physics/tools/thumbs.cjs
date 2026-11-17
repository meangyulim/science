/* 물리 실험실 카드 그림 만들기: node physics/tools/thumbs.cjs [ID ...]

   physics/data/built.json 에 있는 개념 실험마다 무대(.stage)를 헤드리스 Chromium(Playwright)으로 찍어
   physics/data/thumbs/<ID>.webp (밝은 테마), <ID>-dark.webp (어두운 테마) 로 저장한다. 폭 560px.
   물리 실험실 첫 화면(physics/index.html)과 단원 목록(physics/<단원>/index.html) 카드가 이 그림을 쓴다.
   ID 를 주면 그것만 다시 찍는다. 새 개념 실험을 만들면 build_index.py 다음에 한 번 돌리면 된다. */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const {chromium} = require('playwright');

const PHYS = path.resolve(__dirname, '..');
const ROOT = path.resolve(PHYS, '..');
const OUT = path.join(PHYS, 'data', 'thumbs');
const WIDTH = 560;
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const concepts = JSON.parse(fs.readFileSync(path.join(PHYS, 'data', 'physics_concepts.json'), 'utf8')).concepts;
  const built = JSON.parse(fs.readFileSync(path.join(PHYS, 'data', 'built.json'), 'utf8')).built;
  const want = process.argv.slice(2);
  const ids = want.length ? built.filter(id => want.includes(id)) : built;
  fs.mkdirSync(OUT, {recursive: true});
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const shrinker = await browser.newPage();
  for (const id of ids) {
    const c = concepts.find(x => x.id === id);
    const url = `${base}/physics/${c.unit_code}/${String(c.no).padStart(2, '0')}/`;
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage({viewport: {width: 1180, height: 820}, colorScheme: scheme});
      await page.goto(url, {waitUntil: 'networkidle'});
      await page.waitForTimeout(1500);
      const stage = await page.$('.stage');
      if (!stage) { console.log(id, '무대(.stage)가 없어 건너뜀'); await page.close(); break; }
      const png = await stage.screenshot({type: 'png', animations: 'allow'});
      await page.close();
      const data = await shrinker.evaluate(async ({b64, w}) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const h = Math.round(img.height * w / img.width);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const g = cv.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, w, h);
        return cv.toDataURL('image/webp', 0.8);
      }, {b64: png.toString('base64'), w: WIDTH});
      const file = path.join(OUT, `${id}${scheme === 'dark' ? '-dark' : ''}.webp`);
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log(path.relative(ROOT, file), Math.round(fs.statSync(file).size / 1024) + ' KB');
    }
  }
  await browser.close();
  server.close();
})();
