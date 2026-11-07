// 공동수입 주문서 품목 — 호게나르드 DM 표에서 '공동주문' 체크 행을 읽어 주문 페이지 품목으로 만든다.
// 주문 링크([영업] 주문 링크) 품목JSON이 {"v":1,"src":"hg-pool",...}이면 api/order-page.js가 이 모듈을 쓴다.
// 가격은 /o/ 페이지(원칙 1 예외, noindex·추측 불가 ID)에만 나간다. 카탈로그 API 화이트리스트와는 무관.
//
// 한 카드 = 한 품종(식물 등록 마스터 1건). 같은 마스터를 가리키는 DM 행(P9·P12 등)은 한 카드의 규격 줄이 된다.
// 특징·키·사진은 마스터에서(룩업), 가격·재고는 DM 행에서 읽는다.

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = 'tblVVRTKfyViCI1aW'; // 호게나르드 DM
const F = {
  sname: 'fldHpENoNezkg0YrO', kname: 'fld3XAFUiRqL9I5xM', size: 'fldqrGhf56NzhOusv', price: 'flddWryT0w8bnvmis',
  stock: 'fldXhGrdwcxMMFQhF', master: 'fldIuMwaETRZYljic', feat: 'fld8223BNWfWUzT2I', hmin: 'fldbgRQbZ0pa8hweV',
  hmax: 'fld67AfCVuIfBxg5N', photo: 'fldxeO3MrMcRUta3a', review: 'fldzZ5GxLNVUBCfyG', excluded: 'fldkXhOo3KTpUhuZ6',
  pool: 'fldW2cCNYHhidZotO',
};
// 화면 묶음(탭) — 속 이름으로 정한다. 위에서부터 먼저 맞는 묶음.
const CATS = [
  ['수국', 'Hydrangea', /^Hydrangea\b/],
  ['매자나무', 'Berberis', /^Berberis\b/],
  ['물싸리', 'Potentilla', /^Potentilla\b/],
  ['침엽수', 'Conifers', /^(Thuja|Juniperus|Picea|Pinus|Chamaecyparis|Cupressocyparis|Cupressus|Taxus|Tsuga|Abies|Cryptomeria|Microbiota|Platycladus|Sequoiadendron|Metasequoia|Larix|Cedrus)\b/],
  ['꽃관목', 'Shrubs', /^(Philadelphus|Deutzia|Spiraea|Weigela|Forsythia|Syringa|Hibiscus|Buddleja|Cytisus|Genista|Diervilla|Hypericum|Abelia|Kolkwitzia|Exochorda|Caryopteris|Rosa|Cercis|Magnolia|Itea|Clethra|Laburnum|Hamamelis|Cephalanthus|Lagerstroemia)\b/],
  ['잎·열매 관목', 'Foliage', /^(Ilex|Ligustrum|Euonymus|Lonicera|Salix|Physocarpus|Sambucus|Cornus|Acer|Nandina|Sarcococca|Cotinus|Callicarpa|Sorbaria|Symphoricarpos|Elaeagnus|Buxus|Stephanandra|Aucuba)\b/],
  ['지피식물', 'Groundcover', /^(Vinca|Pachysandra|Hedera|Lamium|Ajuga)\b/],
  ['그라스', 'Grasses', /^(Panicum|Pennisetum|Miscanthus|Calamagrostis|Carex|Deschampsia|Imperata|Hakonechloa|Festuca|Molinia|Sesleria|Sorghastrum|Stipa)\b/],
  ['초화', 'Perennials', /./],
];
const GROUPS = CATS.map(([g, en]) => [g, en]);
const INFO_TABLE = 'tblBieuBuvFfhC3Cu'; // [영업] 수종 카드
const IF = { key: 'fld6cAL6rmpBWqqo1', title: 'fldqxG01xXK01wM1N', lines: 'fldIAfaAFaqWaU3xr', on: 'fldjDQEbr2iHFLnpD' };
// 수종키: 학명 첫 단어. 수국은 종까지(목수국·수국·미국수국·떡갈잎수국이 성격이 달라서)
const HYD = { pan: 'pan', paniculata: 'pan', m: 'm', macr: 'm', macrophylla: 'm', arb: 'arb', arborescens: 'arb', querc: 'querc', quercifolia: 'querc', serr: 'serr', serrata: 'serr', anomala: 'anomala' };
function genusKey(latin) {
  const w = String(latin || '').replace(/[^A-Za-z .]/g, ' ').trim().split(/[\s.]+/);
  const g = (w[0] || '').charAt(0).toUpperCase() + (w[0] || '').slice(1).toLowerCase();
  if (g === 'Hydrangea' && HYD[(w[1] || '').toLowerCase()]) return 'Hydrangea ' + HYD[w[1].toLowerCase()];
  return g;
}
const catOf = (latin) => (CATS.find(([, , re]) => re.test(latin)) || CATS[CATS.length - 1])[0];

const first = (v) => (Array.isArray(v) ? v[0] : v);
const lookupText = (v) => {
  // 룩업은 배열(또는 {valuesByLinkedRecordId}) — 첫 값만 쓴다
  if (v && typeof v === 'object' && !Array.isArray(v) && v.valuesByLinkedRecordId) v = Object.values(v.valuesByLinkedRecordId).flat();
  const x = first(v);
  return typeof x === 'string' ? x : x == null ? '' : String(x);
};
const lookupNum = (v) => { const n = Number(lookupText(v)); return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n) : null; };
const sizeName = (v) => (v && typeof v === 'object' ? v.name : v) || '';
const SIZE_ORDER = ['P9', 'P12', 'P12 (컬러팟)', 'P13', 'P14', 'P14 H', 'P14 H (접목묘)', 'C2', 'C2 40cm', 'C2 60cm'];
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(s); return i < 0 ? 99 : i; };
// 공급사 표기(PBR·NEW24 등 꼬리표)를 화면용 학명으로 정리 — 상표 기호(®·™)는 남긴다
const cleanLatin = (s) => String(s || '').replace(/\(?\bpbr\b\)?/gi, ' ').replace(/\bNEW\d{0,2}\b/g, ' ').replace(/\s{2,}/g, ' ').replace(/\s+'/g, " '").trim();

/** DM 레코드 배열 → 주문 페이지 품목(spec.items). 순수 함수(테스트 대상). */
function poolItems(records, infoRecords) {
  const info = infoMap(infoRecords);
  const byKey = new Map();
  for (const r of records) {
    const f = r.fields || {};
    if (!f[F.pool] || f[F.excluded]) continue;
    const price = Number(f[F.price]);
    const size = sizeName(f[F.size]);
    const latin = String(f[F.sname] || '').trim();
    if (!(price > 0) || !size || !latin) continue;
    const m = Array.isArray(f[F.master]) ? first(f[F.master]) : null;
    const mid = typeof m === 'string' ? m : m && m.id;
    const key = /^rec[A-Za-z0-9]{14}$/.test(mid || '') ? mid : 'n:' + cleanLatin(latin).toLowerCase();
    let it = byKey.get(key);
    if (!it) {
      const hidden = lookupText(f[F.review]) === '확인 필요';
      const feat = hidden ? [] : lookupText(f[F.feat]).split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 3);
      const h = hidden ? null : [lookupNum(f[F.hmin]), lookupNum(f[F.hmax])];
      const ph = Array.isArray(f[F.photo]) ? f[F.photo] : (f[F.photo] && f[F.photo].valuesByLinkedRecordId ? Object.values(f[F.photo].valuesByLinkedRecordId).flat() : []);
      const hasPhoto = ph.length > 0;
      const v = ph[0] && /^att[A-Za-z0-9]{14}$/.test(ph[0].id || '') ? `&v=${ph[0].id}` : ''; // 사진을 바꾸면 주소가 바뀌어 캐시가 새로 잡힌다
      it = {
        key, latin: cleanLatin(latin), name: String(f[F.kname] || '').trim() || cleanLatin(latin), grp: catOf(latin),
        feat, h: h && h[0] && h[1] ? (h[0] <= h[1] ? h : [h[1], h[0]]) : null,
        img: hasPhoto && key.startsWith('rec') ? `/api/order-photo?id=${key}&w=800${v}` : '',
        imgBig: hasPhoto && key.startsWith('rec') ? `/api/order-photo?id=${key}&w=1600${v}` : '',
        genus: genusKey(latin),
        unit: '주', step: 10, rows: [],
      };
      byKey.set(key, it);
    }
    if (it.rows.some((x) => x[0] === size)) continue; // 같은 규격 중복 행은 첫 행만
    const st = Number(f[F.stock]);
    it.rows.push([size, Number.isInteger(st) && st > 0 ? st : null, Math.round(price), 0]);
  }
  const items = [...byKey.values()];
  items.forEach((it) => it.rows.sort((a, b) => sizeRank(a[0]) - sizeRank(b[0])));
  // 묶음(탭) → 수종(품종 많은 순) → 이름 순. 같은 수종이 2품종 이상이면 맨 앞에 수종 안내 카드
  const order = new Map(GROUPS.map(([g], i) => [g, i]));
  const cnt = new Map();
  items.forEach((it) => cnt.set(it.grp + '|' + it.genus, (cnt.get(it.grp + '|' + it.genus) || 0) + 1));
  items.sort((a, b) => (order.get(a.grp) - order.get(b.grp)) || (cnt.get(b.grp + '|' + b.genus) - cnt.get(a.grp + '|' + a.genus))
    || a.genus.localeCompare(b.genus) || a.name.localeCompare(b.name, 'ko'));
  const out = [];
  items.forEach((it, i) => {
    const gk = it.grp + '|' + it.genus;
    if (cnt.get(gk) >= 2 && (i === 0 || items[i - 1].grp + '|' + items[i - 1].genus !== gk)) {
      const its = items.filter((x) => x.grp + '|' + x.genus === gk);
      const hs = its.filter((x) => x.h);
      const ps = its.flatMap((x) => x.rows.map((r) => r[2]));
      const inf = info.get(it.genus);
      out.push({ kind: 'info', k: 'g' + out.length.toString(36), grp: it.grp, genus: it.genus,
        name: (inf && inf.title) || (it.name.split("'")[0].trim() || it.genus),
        lines: inf ? inf.lines : [],
        stats: { n: its.length, h: hs.length ? [Math.min(...hs.map((x) => x.h[0])), Math.max(...hs.map((x) => x.h[1]))] : null, p: [Math.min(...ps), Math.max(...ps)] } });
    }
    out.push({ ...it, k: 'h' + (i + 1).toString(36) });
  });
  return out;
}

/** [영업] 수종 카드 레코드 → Map(수종키 → {title, lines}) */
function infoMap(records) {
  const m = new Map();
  for (const r of records || []) {
    const f = r.fields || {};
    if (!f[IF.on]) continue;
    const key = String(f[IF.key] || '').trim();
    if (!key) continue;
    m.set(key, { title: String(f[IF.title] || '').trim(), lines: String(f[IF.lines] || '').split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 3) });
  }
  return m;
}

async function listAll(table, formula, fields) {
  const out = [];
  let offset = '';
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${table}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    if (formula) url.searchParams.set('filterByFormula', formula);
    fields.forEach((f) => url.searchParams.append('fields[]', f));
    if (offset) url.searchParams.set('offset', offset);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const j = await r.json();
    out.push(...(j.records || []));
    if (!j.offset) break;
    offset = j.offset;
  }
  return out;
}

let cache = null; // { until, promise } — 같은 인스턴스에서 1분 재사용 (페이지 자체는 캐시하지 않음)
async function loadPool() {
  if (cache && cache.until > Date.now()) return cache.promise;
  const promise = (async () => {
    if (!BASE || !TOKEN) throw new Error('Pool unavailable');
    const [rows, infos] = await Promise.all([
      listAll(TABLE, 'AND({공동주문},NOT({노출제외}))', Object.values(F)),
      listAll(INFO_TABLE, '{사용}', Object.values(IF)).catch(() => []), // 안내 카드가 없어도 주문서는 뜬다
    ]);
    return poolItems(rows, infos);
  })();
  cache = { until: Date.now() + 60000, promise };
  promise.catch(() => { if (cache && cache.promise === promise) cache = null; });
  return promise;
}

module.exports = { poolItems, loadPool, listAll, catOf, cleanLatin, genusKey, GROUPS, FIELDS: F, INFO_FIELDS: IF };
