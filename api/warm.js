// GET /api/warm — 주문 링크 화면과 카드 사진을 서울 CDN에 미리 채운다(2026-11-16 사용자 요청: "첫 손님도 빠르게").
// Vercel CDN 저장본은 지역마다 따로라서, 이 함수만 서울(icn1)에서 돈다(vercel.json functions.regions).
// 서울에서 우리 주소를 열면 서울 저장소가 채워진다 — 화면은 하루, 사진은 7일 남지만 드물게 열리는 것은 일찍 지워질 수 있어 주기적으로 연다.
// 부르는 쪽: Vercel 크론(vercel.json crons). CRON_SECRET이 있으면 그 값만, 없으면 Vercel 크론 요청만 받는다.

const { F, statusOf } = require('../lib/order-link');

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_ORDER_LINK_TABLE || 'tbl93mrTsG1IsuFxQ'; // [영업] 주문 링크
const SITE = 'https://open-garden.co.kr';
const BUDGET_MS = 240000; // 함수 한도(300초) 안에서 끝낸다
const PARALLEL = 8;
const UA = 'og-warm/1.0 (+https://open-garden.co.kr)';

/** 크론만 받는다. 비밀값이 있으면 비밀값으로, 없으면 Vercel 크론의 User-Agent로. */
function allowed(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.authorization === `Bearer ${secret}`;
  return /^vercel-cron\//.test(String(req.headers['user-agent'] || ''));
}

/** 열려 있는 주문 링크 ID들(마감 제외). */
async function openLinks() {
  const ids = [];
  let offset = '';
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${TABLE}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', F.id);
    url.searchParams.append('fields[]', F.status);
    if (offset) url.searchParams.set('offset', offset);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const j = await r.json();
    for (const rec of j.records || []) {
      const f = rec.fields || {};
      if (/^[A-Za-z0-9_-]{22}$/.test(f[F.id] || '') && statusOf(f) !== '마감') ids.push(f[F.id]);
    }
    offset = j.offset || '';
  } while (offset);
  return ids;
}

/** 화면 HTML에서 카드 크기 사진 주소만(상세 1600px은 누를 때 받는다). 처음 나온 순서 = 화면 위에서부터. */
function cardPhotos(html) {
  const out = [];
  for (const m of String(html).matchAll(/\/api\/(?:order-photo|plant-image)\?[^"'\s)<>\\]+/g)) {
    const u = m[0].replace(/&amp;/g, '&');
    const w = Number((/[?&]w=(\d+)/.exec(u) || [])[1] || 0);
    if (w && w <= 520) out.push(u);
  }
  return [...new Set(out)];
}

async function hit(path) {
  const r = await fetch(SITE + path, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000), redirect: 'manual' });
  await r.arrayBuffer(); // 끝까지 받아야 CDN에 남는다
  return { ok: r.ok, cache: r.headers.get('x-vercel-cache') || '' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!allowed(req)) return res.status(401).json({ error: 'cron only' });
  const t0 = Date.now();
  const sum = { links: 0, photos: 0, hit: 0, miss: 0, fail: 0, skipped: 0 };
  try {
    const photos = [];
    for (const id of await openLinks()) {
      const r = await fetch(`${SITE}/o/${id}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      const html = await r.text();
      if (!r.ok) { sum.fail++; continue; }
      sum.links++;
      photos.push(...cardPhotos(html));
    }
    const list = [...new Set(photos)];
    sum.photos = list.length;
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        if (Date.now() - t0 > BUDGET_MS) { sum.skipped = list.length - i; i = list.length; return; }
        const path = list[i++];
        try {
          const r = await hit(path);
          if (!r.ok) sum.fail++;
          else if (/HIT|STALE/.test(r.cache)) sum.hit++;
          else sum.miss++;
        } catch { sum.fail++; }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    res.status(200).json({ ...sum, ms: Date.now() - t0 });
  } catch (e) {
    res.status(500).json({ ...sum, error: String(e.message || e).slice(0, 200), ms: Date.now() - t0 });
  }
};
module.exports.cardPhotos = cardPhotos;
module.exports.allowed = allowed;
