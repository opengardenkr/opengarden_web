// 에어테이블 '[영업] 주문 링크' 한 줄 읽기 — 주문 페이지(/o/)와 견적 접수(/api/quote)가 함께 쓴다.

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_ORDER_LINK_TABLE || 'tbl93mrTsG1IsuFxQ'; // [영업] 주문 링크
const F = {
  id: 'fldQCUWu9EOsbUiYh', title: 'fldYfnhpKeszp9cQz', customer: 'fldL7PcPMwAPfwJGu', phone: 'fldiCkG6ut9h4O1Yv',
  items: 'fldNQStXwVIQUHwwj', min: 'fldhAQfABDEOjzb6Q', date: 'flda0UPGBrXXhMRey', status: 'fldwdqHacxGXwd6RT',
  memo: 'fldt7o3g960vHTY2n',
};
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** 주문 링크 한 줄(필드ID → 값). 없으면 null. fields를 주면 그 칸만 읽는다. */
async function readLink(id, fields = Object.values(F)) {
  if (!ID_RE.test(id)) return null;
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
  url.searchParams.set('returnFieldsByFieldId', 'true');
  url.searchParams.set('maxRecords', '1');
  url.searchParams.set('filterByFormula', `{링크ID}="${id}"`); // id는 ID_RE로 [A-Za-z0-9_-]만 허용
  [...new Set([F.id, ...fields])].forEach((f) => url.searchParams.append('fields[]', f));
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!r.ok) throw new Error(`Airtable ${r.status}`);
  const rec = ((await r.json()).records || [])[0];
  const f = rec ? rec.fields || {} : null;
  return f && f[F.id] === id ? f : null;
}
const statusOf = (f) => (f[F.status] && typeof f[F.status] === 'object' ? f[F.status].name : f[F.status]);

module.exports = { F, ID_RE, readLink, statusOf };
