const { pageContent } = require('./plant-seo-content');
const ORIGIN = 'https://open-garden.co.kr';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderPlant(p) {
  const {brief, sections, faqs} = pageContent(p);
  const sectionsHtml=sections.map(s=>`<section class="plant-article-section"><h2>${esc(s.heading)}</h2><p>${esc(s.content)}</p></section>`).join('');
  const questionsHtml=faqs.length ? `<section class="plant-article-section" aria-label="자주 묻는 질문"><h2>자주 묻는 질문</h2>${faqs.map(q=>`<div class="faq-item"><h3>${esc(q.question)}</h3><p>${esc(q.answer)}</p></div>`).join('')}</section>` : '';
  const url = ORIGIN + p.page, name = String(p.kname || p.sname);
  const description = [name, p.sname, p.size, brief.description].filter(Boolean).join(' · ').slice(0, 200);
  const image = p.image ? ORIGIN + p.image : ORIGIN + '/assets/og.jpg';
  const data = {'@context':'https://schema.org','@graph':[
    {'@type':'Product',name,description,url,image:p.images.map(u=>ORIGIN+u),brand:{'@type':'Brand',name:'오픈가든'}},
    {'@type':'BreadcrumbList',itemListElement:[
      {'@type':'ListItem',position:1,name:'오픈가든',item:ORIGIN},
      {'@type':'ListItem',position:2,name:'식물 카탈로그',item:ORIGIN+'/catalog.html'},
      {'@type':'ListItem',position:3,name,item:url}
    ]}
  ]};
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} | 오픈가든 식물 카탈로그</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}"><meta property="og:url" content="${esc(url)}"><meta property="og:type" content="website">
<meta property="og:title" content="${esc(name)} | 오픈가든"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/site.css"><style>main{max-width:900px;margin:40px auto;padding:20px}img{width:100%;aspect-ratio:1/1;object-fit:contain;padding:4%;box-sizing:border-box;background:#f4f6f1}dl{display:grid;grid-template-columns:1fr 1fr;gap:16px}dt{font-size:12px;color:#626b63}dd{margin:4px 0 0}.summary-tags span{display:inline-block;padding:4px 8px;background:#f4f6f1;margin:4px}h1{margin:24px 0 12px}p{margin:12px 0}.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.plant-article-section{margin:32px 0 0;border-top:1px solid #e4e8e3;padding:20px 0}.plant-article-section h2{font-size:21px}.plant-article-section p{white-space:pre-line;line-height:1.9}.faq-item{padding:12px 0;border-bottom:1px solid #eef0ee}.faq-item h3{font-size:16px}.credit{font-size:12px;color:#626b63;text-align:right;margin:6px 0}.editorial-note{margin:28px 0;color:#536357;background:#f4f6f3;padding:18px}</style>
<script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script></head><body><main>
<a href="/catalog.html">← 식물 카탈로그</a><h1>${esc(name)}</h1><p>${esc(p.sname)}</p>
<div class="photos">${p.images.map((u,i)=>`<img src="${esc(u)}" alt="${esc(name)} 사진 ${i+1}" ${i?'loading="lazy"':''}>`).join('')}</div>${p.credit&&p.images.length?`<p class="credit">사진 ${esc(p.credit)}</p>`:''}
<p>규격: ${esc(p.size)} · ${p.group==='immediate'?'즉시 출하':'사전 예약'}</p>
<section aria-label="품종 요약 (최대 600자)"><h2>품종 요약</h2><dl>${brief.facts.map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl><p>${esc(brief.description)}</p><div class="summary-tags">${brief.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div></section>
${sectionsHtml}${questionsHtml}
<section class="editorial-note" aria-label="정보 확인 안내"><h2>오픈가든 식물 정보 안내</h2><p>품종명·규격·사진·개화와 내한성 정보는 오픈가든 품종 데이터에 등록된 정보를 바탕으로 표시합니다. 실제 식재 환경, 묘목의 생육 상태와 공급 시기에 따라 모습이 달라질 수 있습니다. 등록되지 않은 정보는 추정하여 기재하지 않습니다. 재배 후기와 현장 사진은 출처 및 실제 경험 확인 절차가 갖춰진 뒤 제공할 예정입니다.</p></section>
<a href="/catalog.html?item=${encodeURIComponent(p.sku||p.id)}">이 품종 선택하고 견적 요청하기 →</a>
<p>가격·재고·납기는 상담 후 안내합니다.</p></main></body></html>`;
}
module.exports = { ORIGIN, esc, renderPlant };
