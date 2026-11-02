// GET /o/<링크ID>  (vercel.json rewrite → /api/order-page?id=<링크ID>)
// ERP '주문' 화면이 만든 고객 주문 링크를 그린다. 원본은 에어테이블 '[영업] 주문 링크' 한 줄.
// 가격이 들어가는 페이지라 CLAUDE.md 원칙 1의 예외(주문형 제안서와 같은 조건):
//   추측 불가 ID(22자), noindex + robots Disallow /o/, 사이트 어디에서도 링크하지 않음, 캐시 금지.
// 고객이 보낸 주문은 기존 /api/quote → 견적요청 표로 간다.

const { renderSections, renderPage, esc, unitOf } = require('../lib/order-page');
const { GROUPS } = require('../lib/catalog-data');

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_ORDER_LINK_TABLE || 'tbl93mrTsG1IsuFxQ'; // [영업] 주문 링크
const F = {
  id: 'fldQCUWu9EOsbUiYh', title: 'fldYfnhpKeszp9cQz', customer: 'fldL7PcPMwAPfwJGu', phone: 'fldiCkG6ut9h4O1Yv',
  items: 'fldNQStXwVIQUHwwj', min: 'fldhAQfABDEOjzb6Q', date: 'flda0UPGBrXXhMRey', status: 'fldwdqHacxGXwd6RT',
  memo: 'fldt7o3g960vHTY2n',
};
const SITE = 'https://open-garden.co.kr';
const KAKAO = 'https://pf.kakao.com/_lGfxhX/chat';
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

function message(title, body) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)} · 오픈가든</title>
<style>body{margin:0;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;background:#F4F6F3;color:#111814;word-break:keep-all}
header{background:#1F4D33;color:#fff;padding:22px 16px}header b{font-size:12px;letter-spacing:.28em;opacity:.85}
main{max-width:520px;margin:28px auto;padding:0 16px}.box{background:#fff;border:1px solid #E4E8E3;border-radius:14px;padding:22px 16px;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{color:#6b746e;font-size:14px;margin:0}
a{display:flex;align-items:center;justify-content:center;height:50px;border-radius:12px;background:#FEE500;color:#191600;font-weight:800;text-decoration:none;margin-top:16px}</style></head>
<body><header><b>OPEN GARDEN</b></header><main><div class="box"><h1>${esc(title)}</h1><p>${esc(body)}</p>
<a href="${KAKAO}" target="_blank" rel="noopener">카카오톡 채널 열기</a></div></main></body></html>`;
}

function send(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(status).send(html);
}

const minLabel = (n) => (n % 10000 === 0 ? (n / 10000).toLocaleString('en-US') + '만원' : '₩' + n.toLocaleString('en-US'));
const dotDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 4)}. ${+iso.slice(5, 7)}. ${+iso.slice(8, 10)}` : '');
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
// 재고: 정수(입력 상한·전량 버튼) 또는 '9,600+' 같은 하한 표시(상한 없음)
const stockOf = (v) => (typeof v === 'string' && /^\d{1,3}(,\d{3})*\+$/.test(v) ? v : int(v));
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// 사진: 카탈로그 레코드(group+rec) 또는 이 사이트의 주문형 제안서 사진(/p/<ID>/img/<키>.jpg)만
const IMG_RE = /^\/p\/[a-z0-9-]{8,64}\/img\/[a-z0-9]{1,6}\.jpg$/;

/** 품목JSON(ERP가 씀, 손으로 꾸민 제안 링크는 특징·사진도) → 렌더러 spec.items. 모양이 틀린 줄은 버린다. */
function toItems(raw) {
  const data = JSON.parse(raw || '{}');
  if (!data || data.v !== 1 || !Array.isArray(data.items)) throw new Error('품목JSON 형식');
  return data.items.slice(0, 200).map((it, i) => {
    const rows = (Array.isArray(it.rows) ? it.rows : []).slice(0, 10)
      .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && r[0].trim() && Number(r[2]) > 0)
      .map((r) => [r[0].slice(0, 20), stockOf(r[1]), Math.round(Number(r[2])), int(r[3]) || 0, Number.isInteger(r[4]) && r[4] > 0 && r[4] <= 100000 ? r[4] : 0]);
    const group = GROUPS.includes(it.group) ? it.group : '';
    const rec = /^rec[A-Za-z0-9]{14}$/.test(it.rec || '') ? it.rec : '';
    return {
      k: /^[a-z0-9]{1,6}$/.test(it.k || '') ? it.k : 'i' + i,
      grp: String(it.grp || '기타').slice(0, 30),
      name: String(it.name || '').slice(0, 80),
      latin: String(it.latin || '').slice(0, 120),
      unit: ['구', '주', '개', '본'].includes(it.unit) ? it.unit : '구',
      step: [1, 5, 10, 50, 100].includes(it.step) ? it.step : 10,
      img: typeof it.img === 'string' && IMG_RE.test(it.img) ? it.img : it.photo && group && rec ? `/api/plant-image?group=${group}&id=${rec}&index=0&w=520` : '',
      size: text(it.size, 12),
      head: text(it.head, 20),
      h: Array.isArray(it.h) && it.h.length === 2 && it.h.every((n) => Number.isInteger(n) && n > 0 && n < 1000) ? it.h : null,
      feat: (Array.isArray(it.feat) ? it.feat : []).map((f) => text(f, 60)).filter(Boolean).slice(0, 3),
      note: text(it.note, 40),
      rows,
    };
  }).filter((it) => it.name && it.rows.length);
}

/** 품목JSON의 groups(선택) = [[표시명, 영문]] — 묶음 순서·영문 소제목 */
function toGroups(raw) {
  const data = JSON.parse(raw || '{}');
  return (Array.isArray(data.groups) ? data.groups : []).slice(0, 20)
    .filter((g) => Array.isArray(g) && typeof g[0] === 'string' && g[0].trim() && /^[A-Za-z]{2,30}$/.test(g[1] || ''))
    .map((g) => [g[0].trim().slice(0, 30), g[1]]);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!ID_RE.test(id)) return send(res, 404, message('주문서를 찾을 수 없습니다', '받으신 링크를 다시 확인해 주세요.'));
  if (!BASE || !TOKEN) return send(res, 503, message('잠시 후 다시 열어 주세요', '주문서를 불러오지 못했습니다.'));
  try {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('maxRecords', '1');
    url.searchParams.set('filterByFormula', `{링크ID}="${id}"`); // id는 위에서 [A-Za-z0-9_-]만 허용
    Object.values(F).forEach((f) => url.searchParams.append('fields[]', f));
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const rec = ((await r.json()).records || [])[0];
    const f = rec ? rec.fields || {} : null;
    if (!f || f[F.id] !== id) return send(res, 404, message('주문서를 찾을 수 없습니다', '받으신 링크를 다시 확인해 주세요.'));
    const status = f[F.status] && typeof f[F.status] === 'object' ? f[F.status].name : f[F.status];
    if (status === '마감') return send(res, 410, message('마감된 주문서입니다', '새 주문서가 필요하시면 카카오톡 채널로 알려주세요.'));

    const items = toItems(f[F.items]);
    if (!items.length) return send(res, 404, message('주문서를 찾을 수 없습니다', '담긴 품목이 없습니다.'));
    const iso = typeof f[F.date] === 'string' ? f[F.date] : '';
    const min = Number.isInteger(f[F.min]) && f[F.min] > 0 ? f[F.min] : 0;
    const customer = f[F.customer] ? { name: String(f[F.customer]).slice(0, 60), phone: String(f[F.phone] || '').slice(0, 30) } : null;
    const spec = {
      title: String(f[F.title] || '오픈가든 주문서').slice(0, 60),
      date: dotDate(iso),
      basis: iso ? `${iso} 재고 기준` : '오픈가든 주문서',
      groups: toGroups(f[F.items]),
      items,
    };
    const { nav, sections } = renderSections(spec);
    const bold = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const terms = String(f[F.memo] || '').split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 12).map(bold);
    const pageUrl = `${SITE}/o/${id}`;
    const html = renderPage(spec, {
      word: '주문', unit: unitOf(items), nav, pageUrl,
      ogImage: `${SITE}/assets/og-order.jpg`, ogDim: true,
      secure: sections, terms,
      notice: min ? [`최소 주문 <b>${esc(minLabel(min))}</b>`] : [],
      cfg: { pid: id, title: spec.title, date: spec.date, min, minLabel: min ? minLabel(min) : '', customer },
    });
    if (req.method === 'HEAD') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.status(200).end(); }
    return send(res, 200, html);
  } catch (e) {
    console.error('order-page failed:', e.message);
    return send(res, 503, message('잠시 후 다시 열어 주세요', '주문서를 불러오지 못했습니다.'));
  }
};

module.exports.toItems = toItems;
module.exports.toGroups = toGroups;
