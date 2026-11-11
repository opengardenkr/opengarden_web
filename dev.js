// 로컬 미리보기 서버 — `npm run dev` 또는 `node dev.js`
// public/ 정적 파일과 api/*.js 서버리스 핸들러를 Vercel과 같은 방식으로 제공합니다.
// 외부 의존성 0. .env 파일이 있으면 읽어서 환경변수로 씁니다 (없으면 카탈로그는 샘플 데이터 표시).

const http = require('http');
const fs = require('fs');
const path = require('path');

// .env 로드 (KEY=VALUE 한 줄씩, # 주석 허용)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const HANDLERS = {
  '/api/plant-image': require('./api/plant-image.js'),
  '/api/plant': require('./api/plant.js'),
  '/api/plant-sitemap': require('./api/plant-sitemap.js'),
  '/api/catalog': require('./api/catalog.js'),
  '/api/quote': require('./api/quote.js'),
  '/api/order-page': require('./api/order-page.js'),
  '/api/quote-view': require('./api/quote-view.js'),
  '/api/quote-issue': require('./api/quote-issue.js'),
  '/api/quote-reply': require('./api/quote-reply.js'),
  '/api/stock': require('./api/stock.js'),
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.json': 'application/json',
};

const PUB = path.join(__dirname, 'dist'); // build.js 산출물
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const plant=url.pathname.match(/^\/plants\/(immediate|preorder)\/(rec[A-Za-z0-9]{14})$/);
  if(plant){url.pathname='/api/plant';url.searchParams.set('group',plant[1]);url.searchParams.set('id',plant[2]);}
  if(url.pathname==='/sitemap-plants.xml')url.pathname='/api/plant-sitemap';
  const order=url.pathname.match(/^\/o\/([A-Za-z0-9_-]{22})$/);
  if(order){url.pathname='/api/order-page';url.searchParams.set('id',order[1]);}
  const qk=url.pathname.match(/^\/q\/([A-Za-z0-9_-]{22})$/);
  if(qk){url.pathname='/api/quote-view';url.searchParams.set('key',qk[1]);}

  // API 라우팅 — Vercel의 (req, res) 형식에 맞춰 query/body/status/json 보강
  if (HANDLERS[url.pathname]) {
    req.query = Object.fromEntries(url.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
    res.send = (b) => res.end(b);
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      try { req.body = JSON.parse(body || '{}'); } catch (e) { req.body = {}; }
    }
    try { await HANDLERS[url.pathname](req, res); }
    catch (e) { console.error(e); res.status(500).json({ error: 'dev server error' }); }
    return;
  }

  // 정적 파일 (public/ 밖으로 나가는 경로는 차단)
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB)) { res.statusCode = 403; return res.end('Forbidden'); }

  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUB, '404.html'), (e2, d2) => {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(e2 ? 'Not Found' : d2);
      });
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => {
  const hasEnv = !!process.env.AIRTABLE_TOKEN;
  console.log(`▶ 오픈가든 미리보기: http://localhost:${PORT}`);
  console.log(hasEnv
    ? '  .env 감지 — 에어테이블 실데이터로 동작합니다.'
    : '  .env 없음 — 카탈로그는 샘플 데이터로 표시됩니다. (.env.example 참고)');
});
