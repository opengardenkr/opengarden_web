// 종이 주문서 — 공동수입 주문서(/o/<ID>)를 A4로 뽑는 화면. GET /o/<ID>/print
// 2026-11-19 사용자 요청: 주 고객(50~60대)은 휴대폰 주문서를 못 본다 → 종이로 뽑아 수량을 손으로 적고 사진 찍어 카톡.
//  - 한 장에 12품종(사진 크게), 표지 포함 10장 안 → 최대 108품종.
//  - 싣는 품종 = 우리가 정한 추천 묶음(호게나르드 DM '종이 추천' 체크). 리빙 시리즈는 넣지 않는다(체크하지 않음).
//  - 재고는 간단히 규격 줄마다 '재고 1,183주'. 품절은 싣지 않는다.
//  - 첫 장에 P9 농장 실사 3장(DM '종이 표지' — 수국·매자·그라스처럼 하나씩)으로 실제 나가는 묘목을 보인다.
// 순수 함수(테스트 대상). 가격은 주문서 화면과 같은 판매가만 쓴다.

const { esc, LOW_STOCK } = require('./order-page');

const PER_PAGE = 12;
const MAX_PAGES = 9; // 표지 1장 + 9장 = 10장
const MAX_ITEMS = PER_PAGE * MAX_PAGES;
const KAKAO = 'https://pf.kakao.com/_lGfxhX/chat';

const n = (v) => Number(v).toLocaleString('ko-KR');
const plainName = (s) => String(s || '').replace(/['‘’"“”]/g, '').replace(/\s{2,}/g, ' ').trim();
const photo = (it, w) => (it.img ? it.img.replace(/([?&])w=\d+/, `$1w=${w}`) + '&f=jpg' : ''); // JPEG: 인쇄 PDF가 가볍다(api/order-photo.js)
const farmAtt = (it) => (Array.isArray(it.gal) ? (it.gal.find((g) => /^f\./.test(g)) || '').slice(2) : '');

/** 인쇄에 실을 품종: 추천 체크 · 품절 아님 · 규격 줄 있음 · 안내 카드 아님. 주문서 화면 순서 그대로, 108개까지. */
function pickPrint(items, all) {
  const ok = items.filter((it) => it.kind !== 'info' && !it.soldout && Array.isArray(it.rows) && it.rows.length && (all || it.paper));
  return { list: ok.slice(0, MAX_ITEMS), over: Math.max(0, ok.length - MAX_ITEMS) };
}

/** 표지 '현물 예시': '종이 표지' 체크 + 농장 실사가 있는 품종, 3개까지 */
function pickCover(items) {
  return items.filter((it) => it.cover && !it.soldout && farmAtt(it) && it.img).slice(0, 3);
}

function ruleLine(cfg) {
  const u = cfg.unit || '주';
  const a = [cfg.minEach ? `품종당 ${n(cfg.minEach)}${u}부터` : '', cfg.step ? `${n(cfg.step)}${u} 단위` : ''].filter(Boolean).join(', ');
  return [a, cfg.minTotal ? `전체 ${n(cfg.minTotal)}${u}부터` : ''].filter(Boolean).join(' · ');
}

function card(it, no, unit) {
  const rows = it.rows;
  const cap = rows.every((r) => Number.isInteger(r[1]) && r[1] > 0) ? rows.reduce((a, r) => a + r[1], 0) : 0;
  const low = cap > 0 && cap <= LOW_STOCK;
  const alert = typeof it.alert === 'string' && it.alert.trim() ? it.alert.split(' · ')[0].trim().slice(0, 12) : '';
  const tags = [alert ? `<i class="t tox">⚠ ${esc(alert)}</i>` : '', low ? '<i class="t low">품절임박</i>' : '', it.lic ? '<i class="t lic">증식 금지</i>' : ''].join('');
  const src = photo(it, 800);
  const ph = src ? `<img src="${esc(src)}" alt="" decoding="async">` : '<span class="none">사진 준비 중</span>';
  const lines = rows.slice(0, 3).map((r) => {
    const st = Number.isInteger(r[1]) ? `<small>재고 ${n(r[1])}${esc(unit)}</small>` : '';
    return `<div class="row"><div class="l"><b><span class="sz">${esc(r[0])}</span> ${n(r[2])}원</b>${st}</div><span class="box"></span><span class="u">${esc(unit)}</span></div>`;
  }).join('');
  return `<div class="card"><div class="ph">${ph}<b class="no">${no}</b>${tags ? `<span class="tags">${tags}</span>` : ''}</div>`
    + `<div class="nm">${esc(plainName(it.name))}</div>${lines}</div>`;
}

/**
 * spec: { title, basis, items } · cfg: { unit, minEach, minTotal, step } · opts: { all, pageUrl }
 * 반환: { html, count, pages, over }
 */
function renderPrint(spec, cfg = {}, opts = {}) {
  const unit = cfg.unit || '주';
  const { list, over } = pickPrint(spec.items || [], opts.all);
  const pages = [];
  for (let i = 0; i < list.length; i += PER_PAGE) pages.push(list.slice(i, i + PER_PAGE));
  // 쪽별 차례(표지가 1쪽): '2쪽 목수국 · 등수국 · 수국' — 수종이 60개 넘어 수종별 목록은 표지에 안 들어간다
  const genera = (p) => [...new Set(p.map((it) => it.glabel || it.grp).filter(Boolean))];
  const index = pages.map((p, pi) => `<div><b>${pi + 2}쪽</b><span>${esc(genera(p).join(' · '))}</span></div>`).join('');
  const cover = pickCover(spec.items || []);
  const farm = cover.map((it) => {
    const a = farmAtt(it);
    const src = `${photo(it, 800).replace(/&v=[^&]*/, '').replace(/&pv=\d+/, '')}&a=${a}&v=${a}`;
    const p9 = (it.rows.find((r) => /^P9\b/.test(r[0])) || it.rows[0])[0];
    return `<figure><img src="${esc(src)}" alt="" decoding="async"><figcaption><b>${esc(plainName(it.name))}</b> · ${esc(p9)}</figcaption></figure>`;
  }).join('');
  const rule = ruleLine({ ...cfg, unit });
  const total = pages.length + 1;
  const body = pages.map((p, pi) => {
    const gs = genera(p);
    const head = gs.length > 3 ? gs.slice(0, 3).join(' · ') + ' 외' : gs.join(' · ');
    const start = pi * PER_PAGE;
    return `<section class="page"><div class="hd"><h2>${esc(head)}</h2><span class="r">${esc(spec.basis || '')} · ${pi + 2}/${total}쪽</span></div>`
      + `<div class="grid">${p.map((it, i) => card(it, start + i + 1, unit)).join('')}</div>`
      + `<div class="ft"><span>가격은 1${esc(unit)} 기준 · P9 = 9cm 화분</span><span>수량을 적은 장은 사진 찍어 카톡으로</span></div></section>`;
  }).join('');

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(spec.title || '오픈가든 주문서')} · 종이 주문서</title>
<link rel="icon" href="/assets/logo_green_notext.png">
<style>
@page{size:A4;margin:9mm 10mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1d2b1f;background:#8a918a;-webkit-print-color-adjust:exact;print-color-adjust:exact;word-break:keep-all}
.bar{position:sticky;top:0;z-index:5;background:#1F4D33;color:#fff;display:flex;align-items:center;gap:12px;padding:10px 14px;font-size:14px}
.bar button{margin-left:auto;height:44px;padding:0 18px;border:0;border-radius:10px;background:#fff;color:#1F4D33;font-size:16px;font-weight:800}
.bar button:disabled{opacity:.6}
.sheets{zoom:var(--z,1);padding:12px 0}
.page{width:190mm;height:279mm;margin:0 auto 12px;background:#fff;display:flex;flex-direction:column;overflow:hidden;padding:0}
@media screen{.page{box-sizing:content-box;padding:9mm 10mm;box-shadow:0 2px 10px rgba(0,0,0,.25)}}
@media print{body{background:#fff}.bar{display:none}.sheets{zoom:1;padding:0}.page{margin:0;page-break-after:always;break-after:page}.page{height:277mm}.page:last-child{page-break-after:auto;break-after:auto}}
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
.idx{margin-top:4mm;font-size:10.5pt;display:grid;grid-template-columns:1fr 1fr;gap:1mm 6mm}
.idx div{display:flex;gap:2.5mm;border-bottom:.3mm dotted #999;padding-bottom:.4mm;white-space:nowrap;overflow:hidden}
.idx b{flex:none;color:#1F4D33}.idx span{overflow:hidden;text-overflow:ellipsis}
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
<div class="bar"><span id="st">사진을 불러오는 중…</span><button type="button" id="pr" disabled>인쇄하기</button></div>
<div class="sheets">
<section class="page">
  <img class="logo" src="/assets/logo.png" alt="오픈가든">
  <div class="t1">${esc(spec.title || '오픈가든 주문서')}</div>
  <div class="t2">${esc(spec.basis || '')} · 사진 목록 ${list.length}품종</div>
  <div class="how"><h3>주문 방법</h3><ol>
    <li><b>1</b><span>원하는 품종의 수량 칸에 숫자를 적습니다</span></li>
    <li><b>2</b><span>이 장 아래에 상호와 연락처를 적습니다</span></li>
    <li><b>3</b><span>적은 장과 이 장을 사진 찍어 카카오톡으로 보냅니다</span></li>
  </ol></div>
  ${rule ? `<div class="rule">${esc(rule)}</div>` : ''}
  ${farm ? `<div class="farm"><h3>실제로 나가는 묘목 (농장 사진)</h3><div class="fs">${farm}</div></div>` : ''}
  ${index ? `<div class="idx">${index}</div>` : ''}
  <div class="who">
    <div class="f"><div class="ln"><span>상호 / 성함</span></div><div class="ln"><span>연락처</span></div><div class="ln"><span>납품지</span></div></div>
    <div class="qr"><img src="/assets/kakao-qr.svg" alt="">카톡으로 보내기</div>
  </div>
</section>
${body}
</div>
<script>
(function(){
  var fit = function(){ var w = Math.min(1, (window.innerWidth - 16) / 794); document.documentElement.style.setProperty('--z', String(Math.max(.3, w))); };
  fit(); window.addEventListener('resize', fit);
  var imgs = [].slice.call(document.querySelectorAll('.sheets img')), st = document.getElementById('st'), pr = document.getElementById('pr');
  var left = imgs.filter(function(i){ return !i.complete; }).length;
  var done = function(){ st.textContent = '${list.length}품종 · A4 ${total}장'; pr.disabled = false; };
  var tick = function(){ left--; if (left <= 0) done(); else st.textContent = '사진을 불러오는 중… ' + (imgs.length - left) + '/' + imgs.length; };
  if (!left) done(); else imgs.forEach(function(i){ if (!i.complete) { i.addEventListener('load', tick); i.addEventListener('error', tick); } });
  pr.addEventListener('click', function(){ window.print(); });
})();
</script>
</body></html>`;
  return { html, count: list.length, pages: total, over };
}

module.exports = { renderPrint, pickPrint, pickCover, ruleLine, PER_PAGE, MAX_ITEMS };
