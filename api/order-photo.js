// GET /api/order-photo?id=<식물 등록 마스터 레코드ID>&w=800|1600[&a=<첨부ID>]
// 공동수입 주문서(lib/hg-pool.js) 카드 사진. 마스터의 '대표사진'·'사진'을 주문서 순서(gallery)로 읽어
// a가 있으면 그 사진, 없으면 첫 장을 돌려준다. 우리 사진에는 로고 워터마크를 넣고,
// 외부 저작물(파일명 cc_… — 위키미디어 공용 CC 사진)은 워터마크 없이 크기만 줄인다(저작자 표기는 주문서 상세 화면).
// 원본 첨부 URL·다른 필드는 브라우저에 보내지 않는다. 가격 필드는 읽지 않는다.

const { allowedImage, readImage, watermark, resize } = require('./plant-image');
const { listAll, gallery } = require('../lib/hg-pool');

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = 'tbln0zg9JdWCJKoFU'; // 식물 등록 마스터
const PHOTO = 'fldkieDK6VuDl3bkW'; // 사진 (공급사·매대 실사)
const HERO = 'fldMICze7bTZ6zAMa'; // 대표사진 (다 자란 모습)

const toList = (fields) => gallery((fields || {})[HERO], (fields || {})[PHOTO])
  .map((a) => ({ id: a.id, filename: a.filename || '', url: a.url || (a.thumbnails && a.thumbnails.large && a.thumbnails.large.url) || null }));

// 주문서 품종 사진 주소를 한 번에 읽어 30분 재사용 — 사진마다 에어테이블을 부르면 초당 5회 제한에 걸려 뒤쪽 사진이 안 뜬다
let bulk = null;
function bulkLists() {
  if (bulk && bulk.until > Date.now()) return bulk.promise;
  const promise = listAll(TABLE, '{공동주문 규격수}>0', [PHOTO, HERO]).then((recs) => new Map(recs.map((r) => [r.id, toList(r.fields)])));
  bulk = { until: Date.now() + 30 * 60000, promise };
  promise.catch(() => { if (bulk && bulk.promise === promise) bulk = null; });
  return promise;
}
const one = new Map(); // 레코드ID → { until, promise } (주문서 밖 레코드용 개별 조회)
function recordList(id) {
  let e = one.get(id);
  if (!e || e.until <= Date.now()) {
    const promise = (async () => {
      const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}/${id}`);
      url.searchParams.set('returnFieldsByFieldId', 'true');
      const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error('photo source unavailable');
      return toList((await r.json()).fields);
    })();
    e = { until: Date.now() + 120000, promise };
    one.set(id, e);
    promise.catch(() => { if (one.get(id) === e) one.delete(id); });
    if (one.size > 600) one.delete(one.keys().next().value);
  }
  return e.promise;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const att = typeof req.query.a === 'string' && /^att[A-Za-z0-9]{14}$/.test(req.query.a) ? req.query.a : '';
  const ver = typeof req.query.v === 'string' && /^att[A-Za-z0-9]{14}$/.test(req.query.v) ? req.query.v : ''; // 카드 첫 사진의 첨부ID
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).end();
  if (!BASE || !TOKEN) return res.status(503).end();
  try {
    const map = await bulkLists().catch(() => null);
    let list = map && map.has(id) ? map.get(id) : await recordList(id);
    let pick = att ? list.find((x) => x.id === att) : list[0];
    // 30분 묶음 목록이 낡았으면(방금 붙이거나 바꾼 사진 — 첨부ID가 다르거나 없음) 그 품종만 새로 읽는다
    const stale = att ? !pick : !pick || (ver && pick.id !== ver);
    if (stale && map && map.has(id)) { list = await recordList(id); pick = att ? list.find((x) => x.id === att) : list[0]; }
    if (!pick || !pick.url) return res.status(404).end();
    if (!allowedImage(pick.url)) throw new Error('Untrusted attachment');
    const r = await fetch(pick.url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const size = ({ 520: 520, 800: 800 })[req.query.w] || 1600;
    const input = await readImage(r);
    const out = /^cc_/i.test(pick.filename) ? await resize(input, size) : await watermark(input, size);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', req.query.v ? 'public, max-age=86400, s-maxage=604800, immutable' : 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).end(out);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end();
  }
};
