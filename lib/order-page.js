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

function card(it) {
  const k = it.k;
  const unit = it.unit || '구';
  const step = Number.isInteger(it.step) && it.step > 0 ? it.step : 100;
  let badge = '';
  if (it.mark === 'req') badge = '<span class="badge req">★ 요청 품종</span>';
  else if (it.mark === 'alt') badge = `<span class="badge alt">◇ ${esc(it.alt)}</span>`;
  const rows = it.rows.map(([sp, st, price, qty]) => {
    const few = it.note === '소량' ? ' <em class="few">소량</em>' : '';
    const max = Number.isInteger(st) && st > 0 ? st : '';
    const stock = stockTxt(st, unit);
    return `
        <div class="opt" data-id="${esc(k + '|' + sp)}" data-grp="${esc(it.grp)}" data-name="${esc(it.name)}" data-spec="${esc(sp)}" data-price="${Number(price) || 0}" data-max="${max}" data-step="${step}" data-unit="${esc(unit)}" data-qty="${Number.isInteger(qty) && qty > 0 ? qty : 0}">
          <div class="opt-info">
            <span class="o-spec">${esc(sp)}</span>
            ${stock ? `<span class="o-stock">재고 ${esc(stock)}${few}</span>` : ''}
            <span class="o-price">${won(price)}<small>/${esc(unit)}</small></span>
          </div>
          <div class="qty">${max ? `<button type="button" class="all" aria-label="${esc(it.name)} ${esc(sp)} 전량 ${max}${esc(unit)}">전량</button>` : ''}<div class="stepper">
            <button type="button" class="st-btn minus" aria-label="${esc(it.name)} ${esc(sp)} ${step}${esc(unit)} 빼기">−</button>
            <input type="number" inputmode="numeric" min="0" step="${step}" value="0" aria-label="${esc(it.name)} ${esc(sp)} 수량(${esc(unit)})">
            <button type="button" class="st-btn plus" aria-label="${esc(it.name)} ${esc(sp)} ${step}${esc(unit)} 더하기">+</button>
          </div></div>
          <div class="o-warn" hidden></div>
        </div>`;
  }).join('');
  const note = it.note && it.note !== '소량' ? `<p class="c-note">${esc(it.note)}</p>` : '';
  const chips = [it.size ? `<span class="chip size">${esc(it.size)}</span>` : '', it.head ? `<span class="chip">${esc(it.head)}</span>` : '',
    Array.isArray(it.h) && it.h.length === 2 ? `<span class="chip">키 ${Number(it.h[0])}~${Number(it.h[1])}cm</span>` : ''].join('');
  const feats = (it.feat || []).map((f) => `<li>${esc(f)}</li>`).join('');
  const photo = it.img ? `<div class="c-photo"><img src="${esc(it.img)}" alt="${esc(it.name)}" loading="lazy" decoding="async"></div>` : '';
  return `
    <article class="card" id="i-${esc(k)}">
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
  for (const [g, latin] of groups) {
    const its = spec.items.filter((it) => it.grp === g);
    if (!its.length) continue;
    const id = 'g-' + String(latin).toLowerCase().replace(/[^a-z0-9-]/g, '');
    nav += `<a href="#" data-to="${id}">${esc(g)} <span>${its.length}</span></a>`;
    sections += `
  <section class="grp" id="${id}">
    <h2><span>${esc(g)}</span><small>${/^g\d+$/.test(latin) ? '' : esc(latin) + ' · '}${its.length}품종</small></h2>
    <div class="cards">${its.map(card).join('')}</div>
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
  const units = [...new Set(items.map((it) => it.unit || '구'))];
  return units.length === 1 ? units[0] : '';
}

module.exports = { esc, won, card, renderSections, renderPage, unitOf };
