// GET /api/order-photo?id=<식물 등록 마스터 레코드ID>&w=520
// 공동수입 주문서(lib/hg-pool.js) 카드 사진. 마스터의 '사진' 첫 장을 읽어 로고 워터마크를 넣어 돌려준다.
// 원본 첨부 URL·다른 필드는 브라우저에 보내지 않는다. 가격 필드는 읽지 않는다.

const { allowedImage, readImage, watermark } = require('./plant-image');

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = 'tbln0zg9JdWCJKoFU'; // 식물 등록 마스터
const PHOTO = 'fldkieDK6VuDl3bkW'; // 사진

const urls = new Map(); // 레코드ID → { until, promise }
async function photoUrl(id) {
  let e = urls.get(id);
  if (!e || e.until <= Date.now()) {
    const promise = (async () => {
      const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}/${id}`);
      url.searchParams.set('returnFieldsByFieldId', 'true');
      const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('photo source unavailable');
      const att = ((await r.json()).fields || {})[PHOTO];
      const a = Array.isArray(att) ? att[0] : null;
      return (a && (a.url || (a.thumbnails && a.thumbnails.large && a.thumbnails.large.url))) || null;
    })();
    e = { until: Date.now() + 120000, promise };
    urls.set(id, e);
    promise.catch(() => { if (urls.get(id) === e) urls.delete(id); });
    if (urls.size > 600) urls.delete(urls.keys().next().value);
  }
  return e.promise;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).end();
  if (!BASE || !TOKEN) return res.status(503).end();
  try {
    const src = await photoUrl(id);
    if (!src) return res.status(404).end();
    if (!allowedImage(src)) throw new Error('Untrusted attachment');
    const r = await fetch(src, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const out = await watermark(await readImage(r), req.query.w === '520' ? 520 : 1600);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).end(out);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end();
  }
};
