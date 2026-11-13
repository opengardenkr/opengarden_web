// 주문 페이지 그리기 — 주문형 제안서(/p/, 빌드 시 암호화)와 주문 링크(/o/, 서버가 바로 그림)가 함께 쓴다.
// 품목 데이터(spec)는 사내에서 만든 것이지만, 문자열은 모두 이스케이프한다.
//
// spec.items[] = { k, grp, name, latin, rows: [[규격, 재고|null|"10,000+", 단가, 미리채울수량?]],
//                  mark?, alt?, note?, size?, head?, h?: [min,max], feat?: [], unit?, step?, img? }

const fs = require('fs');
const path = require('path');

const TEMPLATE = path.join(__dirname, '..', 'tools', 'order-proposal', 'template.html');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));
const won = (n) => '₩' + Number(n).toLocaleString('en-US');
const stockTxt = (st, unit) => (st == null || st === '' ? '' : typeof st === 'string' ? st.replace('+', '') + unit + ' 이상' : Number(st).toLocaleString('en-US') + unit);

// 수종 안내 카드 (공동수입 주문서) — 같은 속 품종들 앞에 한 장. 수량 입력 없음.
function infoCard(it) {
  const lines = (it.lines || []).map((t) => `<li>${esc(t)}</li>`).join('');
  const st = it.stats || {};
  const stat = [st.n ? `${st.n}품종` : '', st.h ? `키 ${st.h[0]}~${st.h[1]}cm` : '', st.p ? `${won(st.p[0])}${st.p[1] > st.p[0] ? '~' + won(st.p[1]) : ''}` : ''].filter(Boolean).join(' · ');
  return `
    <article class="card info" data-genus="${esc(it.genus)}" data-ik="${esc(it.genus)}" data-il="${esc(it.glabel || it.name)}" tabindex="0" role="button" aria-label="${esc(it.name)} 품종 비교 보기">
      <div class="c-body">
        <div class="c-top"><span class="c-grp">수종 안내</span></div>
        <h3 class="c-name">${esc(it.name)}</h3>
        <p class="c-latin">${esc(it.genus)}</p>
        ${lines ? `<ul class="feat">${lines}</ul>` : ''}
        ${stat ? `<p class="i-stat">${esc(stat)}</p>` : ''}
        <p class="i-more">품종 비교 보기 ›</p>
      </div>
    </article>`;
}

function card(it, opt = {}) {
  if (it.kind === 'info') return infoCard(it);
  const k = it.k;
  const unit = it.unit || '구';
  const step = Number.isInteger(it.step) && it.step > 0 ? it.step : 100;
  let badge = '';
  if (it.mark === 'req') badge = '<span class="badge req">★ 요청 품종</span>';
  else if (it.mark === 'alt') badge = `<span class="badge alt">◇ ${esc(it.alt)}</span>`;
  // 행 = [규격, 재고(구), 단가(원/구), 미리 채울 수량, 크레이트당 구수?]
  // 크레이트당 구수가 있으면 그 행은 크레이트 단위로 받는다: 입력·전량·합계 모두 크레이트, 접수는 구로 환산
  const rows = it.rows.map(([sp, st, price, qty, pack]) => {
    const few = it.note === '소량' ? ' <em class="few">소량</em>' : '';
    const crate = Number.isInteger(pack) && pack > 0;
    const u = crate ? '크레이트' : unit;
    const stp = crate ? 1 : step;
    const max = crate ? (Number.isInteger(st) && st >= pack ? Math.floor(st / pack) : '') : (Number.isInteger(st) && st > 0 ? st : '');
    let stock = stockTxt(st, unit);
    if (crate && stock) {
      const n = typeof st === 'string' ? Math.floor(Number(st.replace(/[^\d]/g, '')) / pack) : Math.floor(st / pack);
      stock = typeof st === 'string' ? n.toLocaleString('en-US') + '크레이트 이상' : n.toLocaleString('en-US') + '크레이트';
    }
    const unitPrice = crate ? Number(price) * pack : Number(price) || 0;
    const priceTxt = crate
      ? `${won(unitPrice)}<small>/크레이트</small></span><span class="o-sub">크레이트당 ${Number(pack).toLocaleString('en-US')}${esc(unit)} · ${won(price)}/${esc(unit)}`
      : `${won(price)}<small>/${esc(unit)}</small>`;
    return `
        <div class="opt${crate ? ' crate' : ''}" data-id="${esc(k + '|' + sp)}" data-grp="${esc(it.grp)}" data-name="${esc(it.name)}" data-spec="${esc(sp)}" data-price="${unitPrice}" data-bp="${Number(price) || 0}" data-pack="${crate ? pack : ''}" data-max="${max}" data-step="${stp}" data-unit="${esc(u)}" data-qty="${Number.isInteger(qty) && qty > 0 ? qty : 0}">
          <div class="opt-info">
            <span class="o-spec">${esc(sp)}</span>
            ${stock ? `<span class="o-stock">재고 ${esc(stock)}${few}</span>` : ''}
            <span class="o-price">${priceTxt}</span>
          </div>
          <div class="qty">${max ? `<button type="button" class="all" aria-label="${esc(it.name)} ${esc(sp)} 전량 ${max}${esc(u)}">전량</button>` : ''}<div class="stepper">
            <button type="button" class="st-btn minus" aria-label="${esc(it.name)} ${esc(sp)} ${stp}${esc(u)} 빼기">−</button>
            <input type="number" inputmode="numeric" min="0" step="${stp}" value="0" aria-label="${esc(it.name)} ${esc(sp)} 수량(${esc(u)})">
            <button type="button" class="st-btn plus" aria-label="${esc(it.name)} ${esc(sp)} ${stp}${esc(u)} 더하기">+</button>
          </div></div>
          <div class="o-warn" hidden></div>
        </div>`;
  }).join('');
  const note = it.note && it.note !== '소량' ? `<p class="c-note">${esc(it.note)}</p>` : '';
  const chips = [it.size ? `<span class="chip size">${esc(it.size)}</span>` : '', it.head ? `<span class="chip">${esc(it.head)}</span>` : '',
    Array.isArray(it.h) && it.h.length === 2 ? `<span class="chip">키 ${Number(it.h[0])}~${Number(it.h[1])}cm</span>` : ''].join('');
  const feats = (it.feat || []).map((f) => `<li>${esc(f)}</li>`).join('');
  const big = (it.imgBig ? ` data-big="${esc(it.imgBig)}"` : '')
    + (Array.isArray(it.gal) && it.gal.length ? ` data-g="${esc(it.gal.join(' '))}"` : '')
    + (it.credit ? ` data-cr="${esc(it.credit)}"` : '');
  // 대표사진(다 자란 모습)이 첫 장이면 카드에도 '참고 사진'임을 표시한다 — 출하 묘는 포트 묘.
  // 대표사진 + 농장 실사가 둘 다 있으면 카드 사진을 옆으로 넘겨(또는 [농장 실사 ›] 버튼) 실사를 바로 본다.
  // 실사 사진은 넘기거나 누를 때 처음 받는다(data-src) — 첫 화면 무게는 그대로.
  const gal = Array.isArray(it.gal) ? it.gal : [];
  const first = (gal[0] || '')[0];
  const farmAtt = first === 'h' ? (gal.find((x) => /^f\./.test(x)) || '').slice(2) : '';
  const farmSrc = farmAtt && it.img ? `${it.img.replace(/&v=[^&]*/, '')}&a=${farmAtt}&v=${farmAtt}` : '';
  const ref = first === 'h' ? '<span class="c-ref">다 자란 모습</span>' : first === 'f' ? '<span class="c-ref">농장 실사</span>' : '';
  // 맨 위 몇 장은 바로 받는다(첫 화면) — 나머지는 스크롤해서 보일 때
  const load = opt.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const main = it.img ? `<img src="${esc(it.img)}"${big} alt="${esc(it.name)}" ${load} decoding="async">` : '';
  const photo = !it.img ? ''
    : farmSrc ? `<div class="c-photo c-swipe"><div class="c-track">${main}<img class="c-alt" data-src="${esc(farmSrc)}" alt="${esc(it.name)} 농장 실사" decoding="async"></div>${ref}<button type="button" class="c-flip" aria-label="농장 실사 보기">농장 실사 ›</button></div>`
      : `<div class="c-photo">${main}${ref}</div>`;
  return `
    <article class="card" id="i-${esc(k)}" data-k="${esc(k)}"${it.genus ? ` data-genus="${esc(it.genus)}"` : ''} data-ik="${esc(it.genus || it.grp)}" data-il="${esc(it.glabel || it.grp)}">
      ${photo}
      <div class="c-body">
        <div class="c-top"><span class="c-grp">${esc(it.grp)}</span>${badge}</div>
        <h3 class="c-name">${esc(it.name)}</h3>
        ${it.latin ? `<p class="c-latin">${esc(it.latin)}</p>` : ''}
        ${chips ? `<div class="chips">${chips}</div>` : ''}
        ${feats ? `<ul class="feat">${feats}</ul>` : ''}
        ${note}
        <div class="opts">${rows}
        </div>
        <p class="c-warn" hidden></p>
      </div>
    </article>`;
}

/** spec.groups = [[표시명, 영문(앵커용)]] — 없으면 품목의 grp 순서대로 묶는다 */
function renderSections(spec) {
  const given = spec.groups && spec.groups.length ? spec.groups : [];
  const named = new Set(given.map((g) => g[0]));
  // 지정한 묶음 뒤에, 지정하지 않은 묶음도 빠뜨리지 않고 품목 순서대로 붙인다
  const groups = given.concat([...new Set(spec.items.map((it) => it.grp))].filter((g) => !named.has(g)).map((g, i) => [g, 'g' + i]));
  let nav = '';
  let sections = '';
  let shown = 0; // 첫 화면 카드 수(사진 바로 받기)
  for (const [g, latin] of groups) {
    const its = spec.items.filter((it) => it.grp === g);
    const n = its.filter((it) => it.kind !== 'info').length;
    if (!n) continue;
    const id = 'g-' + String(latin).toLowerCase().replace(/[^a-z0-9-]/g, '');
    nav += `<a href="#" data-to="${id}">${esc(g)} <span>${n}</span></a>`;
    sections += `
  <section class="grp" id="${id}">
    <h2><span>${esc(g)}</span><small>${/^g\d+$/.test(latin) ? '' : esc(latin) + ' · '}${n}품종</small></h2>
    <div class="cards">${its.map((it) => card(it, { eager: it.kind !== 'info' && it.img && shown++ < 4 })).join('')}</div>
  </section>`;
  }
  return { nav, sections };
}

/**
 * 완성된 HTML. opts:
 *   word 견적|주문, unit 표시 단위, pageUrl, ogImage, ogDim(1200×630이면 true),
 *   secure(#secure 안에 넣을 HTML), cfg(브라우저 설정 객체), terms/notice(굵게<b>만 쓰는 신뢰 문구 배열)
 */
function renderPage(spec, opts) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const terms = (opts.terms || []).map((t) => `<li>${t}</li>`).join('');
  const notice = (opts.notice || []).map((t) => `<li>${t}</li>`).join('\n  ');
  const cfg = JSON.stringify({ ...opts.cfg, word: opts.word, unit: opts.unit }).replace(/</g, '\\u003c');
  const html = tpl
    .split('%%TITLE%%').join(esc(spec.title))
    .split('%%DATE%%').join(esc(spec.date))
    .split('%%BASIS%%').join(esc(spec.basis))
    .split('%%WORD%%').join(esc(opts.word))
    .replace('%%PRICEUNIT%%', opts.unit ? '원/' + esc(opts.unit) : '단위별 표시')
    .replace('%%QTYLABEL%%', opts.unit ? '수량(' + esc(opts.unit) + ')' : '수량')
    .replace('%%NOTICE%%', notice)
    .replace('%%NAV%%', opts.nav)
    .replace('%%PAGEURL%%', esc(opts.pageUrl))
    .replace('%%OGIMAGE%%', esc(opts.ogImage))
    .replace('%%OGDIM%%', opts.ogDim ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' : '')
    .replace('%%SECURE%%', () => opts.secure)
    .replace('%%TERMSHIDDEN%%', terms ? '' : ' hidden')
    .replace('%%TERMS%%', terms)
    .replace('%%CFG%%', () => cfg);
  if (/%%[A-Z]+%%/.test(html.replace(opts.secure, ''))) throw new Error('채워지지 않은 자리표시자가 남아 있습니다');
  return html;
}

/** 모든 품목 단위가 같으면 그 단위, 섞여 있으면 빈 문자열(품목마다 따로 표시) */
function unitOf(items) {
  const units = [...new Set(items.flatMap((it) => (it.rows && it.rows.length ? it.rows : [[]]).map((r) => (Number.isInteger(r[4]) && r[4] > 0 ? '크레이트' : it.unit || '구'))))];
  return units.length === 1 ? units[0] : '';
}

module.exports = { esc, won, card, renderSections, renderPage, unitOf };
