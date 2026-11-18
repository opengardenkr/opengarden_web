// 종이 주문서 — 주문서(/o/<ID>)를 A4로 뽑는 화면. GET /o/<ID>/print
// 2026-11-19 사용자 요청: 주 고객(50~60대)은 휴대폰 주문서를 못 본다 → 종이로 뽑아 수량을 손으로 적고 사진 찍어 카톡.
//  - 한 장에 12품종(사진 크게). 품종은 **전부**(재고 있는 것) — 10장으로 줄이지 않는다(같은 날 사용자 결정).
//  - 인쇄 화면 위에서 [전체] / [♥ 관심](주문서에서 ♡ 누른 품종, 기기에 저장된 og-heart)만 골라 뽑는다.
//  - 빼는 품종 = 호게나르드 DM '종이 제외' 체크(리빙 시리즈 — 사용자 지시). 품절은 싣지 않는다.
//  - 재고는 간단히 규격 줄마다 '재고 1,183주'.
//  - 첫 장에 농장 실사 3장(DM '종이 표지' — 목수국 윔스레드·매자 로즈글로우·측백 다니카 아우레아)으로 실제 나가는 묘목을 보인다.
// 서버는 표지 + 카드 묶음만 그리고, 쪽 나누기·차례·번호는 고른 범위에 맞춰 브라우저가 한다.
// 순수 함수(테스트 대상). 가격은 주문서 화면과 같은 판매가만 쓴다.

const { esc, LOW_STOCK } = require('./order-page');

const PER_PAGE = 12;

const n = (v) => Number(v).toLocaleString('ko-KR');
const plainName = (s) => String(s || '').replace(/['‘’"“”]/g, '').replace(/\s{2,}/g, ' ').trim();
// 카드 사진: 480px JPEG(57mm 칸에 약 210dpi). JPEG는 인쇄·PDF 저장 때 그대로 들어가 PDF가 가볍다(api/order-photo.js f=jpg)
const photo = (it, w) => (it.img ? it.img.replace(/([?&])w=\d+/, `$1w=${w}`) + '&f=jpg' : '');
const farmAtt = (it) => (Array.isArray(it.gal) ? (it.gal.find((g) => /^f\./.test(g)) || '').slice(2) : '');
const heartKey = (it) => String(it.key || 'n:' + it.name).slice(0, 120); // 주문서 카드 data-hk와 같게(lib/order-page.js)

/** 인쇄에 실을 품종: 종이 제외 아님 · 품절 아님 · 규격 줄 있음 · 안내 카드 아님. 주문서 화면 순서 그대로. */
function pickPrint(items) {
  return items.filter((it) => it.kind !== 'info' && !it.soldout && !it.paperOut && Array.isArray(it.rows) && it.rows.length);
}

/** 표지 '실제로 나가는 묘목': '종이 표지' 체크 + 농장 실사가 있는 품종, 3개까지 */
function pickCover(items) {
  return items.filter((it) => it.cover && !it.soldout && farmAtt(it) && it.img).slice(0, 3);
}

function ruleLine(cfg) {
  const u = cfg.unit || '주';
  const a = [cfg.minEach ? `품종당 ${n(cfg.minEach)}${u}부터` : '', cfg.step ? `${n(cfg.step)}${u} 단위` : ''].filter(Boolean).join(', ');
  return [a, cfg.minTotal ? `전체 ${n(cfg.minTotal)}${u}부터` : ''].filter(Boolean).join(' · ');
}

function card(it, unit) {
  const rows = it.rows;
  const cap = rows.every((r) => Number.isInteger(r[1]) && r[1] > 0) ? rows.reduce((a, r) => a + r[1], 0) : 0;
  const low = cap > 0 && cap <= LOW_STOCK;
  const alert = typeof it.alert === 'string' && it.alert.trim() ? it.alert.split(' · ')[0].trim().slice(0, 12) : '';
  const tags = [alert ? `<i class="t tox">⚠ ${esc(alert)}</i>` : '', low ? '<i class="t low">품절임박</i>' : '', it.lic ? '<i class="t lic">증식 금지</i>' : ''].join('');
  const src = photo(it, 480);
  const ph = src ? `<img data-src="${esc(src)}" alt="" decoding="async">` : '<span class="none">사진 준비 중</span>';
  const lines = rows.slice(0, 3).map((r) => {
    const st = Number.isInteger(r[1]) ? `<small>재고 ${n(r[1])}${esc(unit)}</small>` : '';
    return `<div class="row"><div class="l"><b><span class="sz">${esc(r[0])}</span> ${n(r[2])}원</b>${st}</div><span class="box"></span><span class="u">${esc(unit)}</span></div>`;
  }).join('');
  return `<div class="card" data-hk="${esc(heartKey(it))}" data-g="${esc(it.glabel || it.grp || '')}"><div class="ph">${ph}<b class="no"></b>${tags ? `<span class="tags">${tags}</span>` : ''}</div>`
    + `<div class="nm">${esc(plainName(it.name))}</div>${lines}</div>`;
}

/**
 * spec: { title, basis, items } · cfg: { unit, minEach, minTotal, step }
 * 반환: { html, count }
 */
function renderPrint(spec, cfg = {}) {
  const unit = cfg.unit || '주';
  const list = pickPrint(spec.items || []);
  const farm = pickCover(spec.items || []).map((it) => {
    const a = farmAtt(it);
    const src = `${photo(it, 800).replace(/&v=[^&]*/, '').replace(/&pv=\d+/, '')}&a=${a}&v=${a}`;
    const size = (it.rows.find((r) => /^P9\b/.test(r[0])) || it.rows[0])[0];
    return `<figure><img src="${esc(src)}" alt="" decoding="async"><figcaption><b>${esc(plainName(it.name))}</b> · ${esc(size)}</figcaption></figure>`;
  }).join('');
  const rule = ruleLine({ ...cfg, unit });
  const basis = esc(spec.basis || '');

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(spec.title || '오픈가든 주문서')} · 종이 주문서</title>
<link rel="icon" href="/assets/logo_green_notext.png">
<style>
@page{size:A4;margin:9mm 10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1d2b1f;background:#8a918a;-webkit-print-color-adjust:exact;print-color-adjust:exact;word-break:keep-all}
.bar{position:sticky;top:0;z-index:5;background:#1F4D33;color:#fff;padding:8px 12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.bar .seg{display:flex;border:1px solid rgba(255,255,255,.6);border-radius:10px;overflow:hidden}
.bar .seg button{height:40px;padding:0 13px;border:0;background:transparent;color:#fff;font-size:15px;font-weight:700}
.bar .seg button[aria-pressed="true"]{background:#fff;color:#1F4D33}
.bar .seg button:disabled{opacity:.45}
.bar #st{font-size:13px;opacity:.9;flex:1;min-width:120px}
.bar #pr{height:40px;padding:0 16px;border:0;border-radius:10px;background:#fff;color:#1F4D33;font-size:15px;font-weight:800}
.bar #pr:disabled{opacity:.55}
.sheets{zoom:var(--z,1);padding:12px 0}
.page{width:190mm;height:279mm;margin:0 auto 12px;background:#fff;display:flex;flex-direction:column;overflow:hidden}
@media screen{.page{box-sizing:content-box;padding:9mm 10mm;box-shadow:0 2px 10px rgba(0,0,0,.25)}}
@media print{body{background:#fff}.bar{display:none}.sheets{zoom:1;padding:0}.page{margin:0;height:277mm;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}}
#pool{display:none}
/* 표지 */
.logo{height:9mm;width:auto;align-self:flex-start}
.t1{font-size:27pt;font-weight:800;margin-top:6mm;letter-spacing:-.5pt;color:#1F4D33;line-height:1.2}
.t2{font-size:14pt;color:#555;margin-top:1.5mm}
.how{margin-top:6mm;border:.6mm solid #1F4D33;border-radius:4mm;padding:5mm 7mm}
.how h3{font-size:15pt;margin-bottom:2mm;color:#1F4D33}
.how ol{list-style:none}
.how li{font-size:15.5pt;line-height:1.4;margin:1.8mm 0;display:flex;gap:4mm;align-items:flex-start}
.how li b{flex:none;width:9mm;height:9mm;border-radius:50%;background:#1F4D33;color:#fff;font-size:13pt;display:flex;align-items:center;justify-content:center;margin-top:.6mm}
.rule{margin-top:4mm;font-size:14pt;background:#EEF3EC;border-radius:3mm;padding:3mm 6mm}
.farm{margin-top:5mm}
.farm h3{font-size:13.5pt;color:#1F4D33;margin-bottom:2mm}
.farm .fs{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
.farm figure{border:.3mm solid #C9D2C6;border-radius:2mm;overflow:hidden}
.farm img{width:100%;height:38mm;object-fit:cover;display:block;background:#EEF1EC}
.farm figcaption{font-size:11pt;padding:1.4mm 2mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.idx{margin-top:4mm;font-size:10.5pt;display:grid;grid-template-columns:repeat(3,1fr);gap:.8mm 6mm;align-content:start}
.idx div{display:flex;justify-content:space-between;gap:2mm;border-bottom:.3mm dotted #999;white-space:nowrap}
.idx span{overflow:hidden;text-overflow:ellipsis}.idx b{flex:none;font-weight:500;color:#1F4D33}
.idxpage h2{font-size:19pt;color:#1F4D33;border-bottom:.6mm solid #1F4D33;padding-bottom:1.6mm}
.idxpage .idx{grid-template-columns:repeat(3,1fr);font-size:11.5pt;gap:1.6mm 7mm}
.who{margin-top:auto;border-top:.6mm solid #1F4D33;padding-top:3mm;display:flex;gap:8mm;align-items:flex-end}
.who .f{flex:1}
.who .ln{font-size:13pt;display:flex;align-items:flex-end;height:11mm;border-bottom:.4mm solid #333;margin-bottom:1.5mm;color:#444}
.who .ln span{width:26mm;flex:none}
.qr{width:30mm;text-align:center;font-size:10.5pt;color:#333}
.qr img{width:27mm;height:27mm;display:block;margin:0 auto 1.2mm}
/* 품종 쪽 */
.hd{display:flex;align-items:baseline;gap:4mm;border-bottom:.6mm solid #1F4D33;padding-bottom:1.6mm;margin-bottom:2.6mm}
.hd h2{font-size:19pt;font-weight:800;color:#1F4D33;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd .r{margin-left:auto;font-size:10.5pt;color:#666;white-space:nowrap}
.grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:2.4mm}
.card{border:.3mm solid #C9D2C6;border-radius:2mm;padding:1.6mm;display:flex;flex-direction:column;overflow:hidden}
.ph{position:relative;height:33mm;flex:none;border-radius:1.2mm;overflow:hidden;background:#EEF1EC;display:flex;align-items:center;justify-content:center}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.ph .none{font-size:10pt;color:#7a837c}
.no{position:absolute;left:1.2mm;top:1.2mm;background:rgba(255,255,255,.93);font-size:10pt;font-weight:700;padding:.2mm 1.6mm;border-radius:1mm}
.tags{position:absolute;right:1.2mm;top:1.2mm;display:flex;flex-direction:column;align-items:flex-end;gap:.8mm}
.t{font-style:normal;font-size:9pt;font-weight:700;padding:.2mm 1.4mm;border-radius:1mm;color:#fff}
.t.low,.t.tox{background:#D92D20}.t.lic{background:#666}
.nm{font-size:13pt;font-weight:800;line-height:1.25;margin:1.3mm 0 .3mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row{display:flex;align-items:center;gap:1.4mm;margin-top:.8mm;white-space:nowrap}
.row .l{flex:1;min-width:0;line-height:1.15}
.row b{font-size:11.5pt;display:block;overflow:hidden;text-overflow:ellipsis}
.row .sz{font-weight:500;color:#333;font-size:10.5pt}
.row small{font-size:9.5pt;color:#555}
.box{width:15mm;height:8mm;border:.4mm solid #333;border-radius:1mm;flex:none}
.u{font-size:10.5pt;color:#333}
.ft{margin-top:2mm;font-size:10pt;color:#555;display:flex;justify-content:space-between}
</style></head><body>
<div class="bar">
  <div class="seg" role="group" aria-label="인쇄 범위"><button type="button" id="mAll" aria-pressed="true">전체 <span id="nAll">${list.length}</span></button><button type="button" id="mMine" aria-pressed="false">♥ 관심 <span id="nMine">0</span></button></div>
  <span id="st"></span><button type="button" id="pr" disabled>인쇄하기</button>
</div>
<div class="sheets" id="sheets">
<section class="page" id="cover">
  <img class="logo" src="/assets/logo.png" alt="오픈가든">
  <div class="t1">${esc(spec.title || '오픈가든 주문서')}</div>
  <div class="t2">${basis} · 사진 목록 <span id="cCount">${list.length}</span>품종</div>
  <div class="how"><h3>주문 방법</h3><ol>
    <li><b>1</b><span>원하는 품종의 수량 칸에 숫자를 적습니다</span></li>
    <li><b>2</b><span>이 장 아래에 상호와 연락처를 적습니다</span></li>
    <li><b>3</b><span>적은 장과 이 장을 사진 찍어 카카오톡으로 보냅니다</span></li>
  </ol></div>
  ${rule ? `<div class="rule">${esc(rule)}</div>` : ''}
  ${farm ? `<div class="farm"><h3>실제로 나가는 묘목 (농장 사진)</h3><div class="fs">${farm}</div></div>` : ''}
  <div class="idx" id="idxCover"></div>
  <div class="who">
    <div class="f"><div class="ln"><span>상호 / 성함</span></div><div class="ln"><span>연락처</span></div><div class="ln"><span>납품지</span></div></div>
    <div class="qr"><img src="/assets/kakao-qr.svg" alt="">카톡으로 보내기</div>
  </div>
</section>
</div>
<div id="pool">${list.map((it) => card(it, unit)).join('')}</div>
<script>
(function(){
  var PER = ${PER_PAGE}, BASIS = ${JSON.stringify(spec.basis || '').replace(/</g, '\\u003c')}, UNIT = ${JSON.stringify(unit).replace(/</g, '\\u003c')};
  var d = document, $ = function(id){ return d.getElementById(id); };
  var fit = function(){ d.documentElement.style.setProperty('--z', String(Math.max(.3, Math.min(1, (innerWidth - 16) / 794)))); };
  fit(); addEventListener('resize', fit);
  var pool = $('pool'), all = [].slice.call(pool.children), hearts = [];
  try { hearts = JSON.parse(localStorage.getItem('og-heart') || '[]') || []; } catch (e) {}
  var mine = all.filter(function(c){ return hearts.indexOf(c.dataset.hk) >= 0; });
  $('nMine').textContent = mine.length; $('mMine').disabled = !mine.length;
  var el = function(tag, cls, html){ var x = d.createElement(tag); if (cls) x.className = cls; if (html != null) x.innerHTML = html; return x; };
  var txt = function(s){ var x = d.createElement('span'); x.textContent = s; return x.innerHTML; };
  var waiting = 0;
  function build(list){
    [].slice.call(d.querySelectorAll('.sheets .page:not(#cover)')).forEach(function(p){ p.remove(); });
    all.forEach(function(c){ pool.appendChild(c); });
    $('idxCover').innerHTML = ''; $('cCount').textContent = list.length;
    var chunks = []; for (var i = 0; i < list.length; i += PER) chunks.push(list.slice(i, i + PER));
    // 차례: 수종 → 쪽. 많으면(24개 넘게) 표지 다음 한 장에 따로
    var own = 0, gs = [];
    chunks.forEach(function(ch){ ch.forEach(function(c){ var g = c.dataset.g; if (g && gs.indexOf(g) < 0) gs.push(g); }); });
    if (gs.length > 24) own = 1;
    var first = 2 + own, total = chunks.length + 1 + own, map = {};
    chunks.forEach(function(ch, pi){ ch.forEach(function(c){ var g = c.dataset.g; if (!g) return; var e = map[g] || (map[g] = { a: first + pi, b: first + pi }); e.b = first + pi; }); });
    var idx = gs.map(function(g){ var e = map[g]; return '<div><span>' + txt(g) + '</span><b>' + (e.a === e.b ? e.a : e.a + '–' + e.b) + '쪽</b></div>'; }).join('');
    var sheets = $('sheets');
    if (own) { var ip = el('section', 'page idxpage', '<h2>차례</h2><div class="idx">' + idx + '</div>'); sheets.appendChild(ip); }
    else $('idxCover').innerHTML = idx;
    var n = 0, imgs = [];
    chunks.forEach(function(ch, pi){
      var names = []; ch.forEach(function(c){ var g = c.dataset.g; if (g && names.indexOf(g) < 0) names.push(g); });
      var head = names.length > 3 ? names.slice(0, 3).join(' · ') + ' 외' : names.join(' · ');
      var p = el('section', 'page', '<div class="hd"><h2>' + txt(head) + '</h2><span class="r">' + txt(BASIS) + ' · ' + (first + pi) + '/' + total + '쪽</span></div>');
      var grid = el('div', 'grid'); p.appendChild(grid);
      ch.forEach(function(c){ n++; c.querySelector('.no').textContent = n; grid.appendChild(c); var im = c.querySelector('img[data-src]'); if (im) imgs.push(im); });
      p.appendChild(el('div', 'ft', '<span>가격은 1' + txt(UNIT) + ' 기준 · P9 = 9cm 화분</span><span>수량을 적은 장은 사진 찍어 카톡으로</span>'));
      sheets.appendChild(p);
    });
    // 고른 범위의 사진만 받는다 — 다 받아야 [인쇄하기]
    imgs = imgs.concat([].slice.call(d.querySelectorAll('#cover img')));
    waiting = 0;
    imgs.forEach(function(im){ if (im.dataset.src && !im.getAttribute('src')) im.src = im.dataset.src; if (!im.complete) waiting++; });
    $('pr').disabled = waiting > 0; status(list.length, total);
    imgs.forEach(function(im){ if (!im.complete) { var done = function(){ im.removeEventListener('load', done); im.removeEventListener('error', done); waiting--; $('pr').disabled = waiting > 0; status(list.length, total); }; im.addEventListener('load', done); im.addEventListener('error', done); } });
  }
  function status(cnt, total){ $('st').textContent = waiting > 0 ? '사진 불러오는 중… ' + waiting + '장 남음' : cnt + '품종 · A4 ' + total + '장'; }
  function mode(m){ $('mAll').setAttribute('aria-pressed', String(m === 'all')); $('mMine').setAttribute('aria-pressed', String(m === 'mine')); build(m === 'mine' ? mine : all); }
  $('mAll').addEventListener('click', function(){ mode('all'); });
  $('mMine').addEventListener('click', function(){ if (mine.length) mode('mine'); });
  $('pr').addEventListener('click', function(){ print(); });
  mode('all');
})();
</script>
</body></html>`;
  return { html, count: list.length };
}

module.exports = { renderPrint, pickPrint, pickCover, ruleLine, PER_PAGE };
