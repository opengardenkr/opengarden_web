// 정적 사이트 빌드 — partials를 합쳐 dist/에 완전한 HTML을 산출합니다.
// 외부 의존성 0. JS 런타임 삽입이 아니라 빌드 시점 치환이라 SEO 손실이 없습니다.
//
//   src/*.html      페이지 본문 (헤더·푸터는 마커만)
//   partials/*.html 공통 블록 (헤더·모바일메뉴·푸터·플로팅버튼)
//   public/*        정적 자산 (assets, robots.txt, sitemap.xml, 404, stock 등)
//   → dist/         배포 산출물
//
// 사용법:  node build.js        (npm run build)
// 마커:    <!-- @include header active=about -->
//          <!-- @include footer -->
//          <!-- @include fab -->

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const PARTIALS = path.join(ROOT, 'partials');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

const partial = (name) => fs.readFileSync(path.join(PARTIALS, name + '.html'), 'utf8').trimEnd();

// 헤더는 현재 페이지에 따라 활성 표시가 달라집니다.
function renderHeader(active) {
  return partial('header')
    .replace('{{ON_ABOUT}}', active === 'about' ? ' on' : '')
    .replace('{{ON_FAQ}}', active === 'faq' ? ' on' : '')
    .replace('{{ON_GALLERY}}', active === 'gallery' ? ' on' : '')
    .replace('{{CUR_CATALOG}}', active === 'catalog' ? ' aria-current="page"' : '');
}

function render(html, file) {
  return html.replace(/[ \t]*<!--\s*@include\s+(\w+)(?:\s+active=(\w+))?\s*-->/g, (m, name, active) => {
    if (name === 'header') return renderHeader(active);
    if (name === 'footer') return partial('footer');
    if (name === 'fab') return partial('fab');
    throw new Error(`${file}: 알 수 없는 include "${name}"`);
  });
}

// 재귀 복사 — fs.cpSync는 일부 Windows/OneDrive 경로에서 Node를 크래시시켜 직접 구현
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── 실행 ──
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 1) 정적 자산을 그대로 복사
copyDir(PUBLIC, DIST);

// 2) src의 페이지를 렌더링해 dist에 덮어쓰기
const pages = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'));
let total = 0;
for (const p of pages) {
  const raw = fs.readFileSync(path.join(SRC, p), 'utf8');
  const out = render(raw, p);
  if (/@include/.test(out)) throw new Error(`${p}: 치환되지 않은 include 마커가 남아 있습니다`);
  fs.writeFileSync(path.join(DIST, p), out, 'utf8');
  total++;
  console.log(`  ✓ ${p}`);
}

// 3) 헤더가 모든 페이지에서 동일한지 자체 검증 (드리프트 방지의 핵심)
const headers = pages.map((p) => {
  const s = fs.readFileSync(path.join(DIST, p), 'utf8');
  const m = s.match(/<nav>[\s\S]*?<\/nav>/);
  return m ? m[0].replace(/ on"/g, '"').replace(/ aria-current="page"/g, '') : null;
});
const uniq = [...new Set(headers.filter(Boolean))];
if (uniq.length > 1) throw new Error(`헤더가 페이지마다 다릅니다 (${uniq.length}종). partials/header.html을 확인하세요.`);

console.log(`\n빌드 완료: ${total}개 페이지 → dist/  (헤더 일치 확인 ✓)`);
