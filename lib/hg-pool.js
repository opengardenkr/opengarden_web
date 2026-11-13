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
  pool: 'fldW2cCNYHhidZotO', hero: 'fldGZP78cEp1kTUbR', credit: 'flduYpEcrBf0Xk7qT',
  bundle: 'fldOlMm4DSGjV5PqD', sortKey: 'fldG9sd9r1SqHPOUf', // 주문서 묶음(PBR = 라이선스 품종) · 주문서 정렬(국명 대신 쓸 정렬 글자)
  minQty: 'fldDJnLKpyhoej8RX', // 최소주문(주) — 이 품종만의 최소 수량(카드 태그 '최소 1,000주')
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
// DM '주문서 묶음'이 PBR(육종사 라이선스 품종)이면 따로 탭에 모으지 않고 카드에 '증식 금지' 태그만 단다
// (2026-11-13 사용자 결정: 'PBR 품종' 묶음은 없앤다 — 국내 품종보호 등록 여부로 시비가 붙지 않게).
const LICENSED = 'PBR';
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
const SIZE_ORDER = ['P8', 'P9','P12', 'P12 (컬러팟)', 'P13', 'P14', 'P14 H', 'P14 H (접목묘)', 'C2', 'C2 40cm', 'C2 60cm'];
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(s); return i < 0 ? 99 : i; };
// 공급사 표기(PBR·NEW24 등 꼬리표)를 화면용 학명으로 정리 — 상표 기호(®·™)는 남긴다
const cleanLatin = (s) => String(s || '').replace(/\(?\bpbr\b\)?/gi, ' ').replace(/(?<=[a-z])PBR\b/g, ' ').replace(/\bNEW\d{0,2}\b/g, ' ').replace(/\s{2,}/g, ' ').replace(/\s+'/g, " '").trim();

// 룩업 첨부(배열 또는 {valuesByLinkedRecordId}) → 첨부 배열
const attList = (v) => (Array.isArray(v) ? v : v && v.valuesByLinkedRecordId ? Object.values(v.valuesByLinkedRecordId).flat() : [])
  .filter((a) => a && typeof a === 'object' && (a.id || a.url));
const ATT = /^att[A-Za-z0-9]{14}$/;
const isFarm = (a) => /^HG\d{2}_/.test(String(a.filename || '')); // 현지 농장 매대 실사 (호게나르드 사진앨범)
/**
 * 사진 순서: 대표사진(다 자란 모습) → 현지 매대 실사 → 공급사 사진.
 * 대표사진이 없으면 공급사 첫 장 → 매대 실사 → 나머지 (매대 실사는 늘 두 번째 이내).
 * 반환: [{ id, url, filename, kind: 'hero'|'farm'|'sup' }] 최대 4장
 */
function gallery(hero, photos) {
  const h = attList(hero).slice(0, 1).map((a) => ({ ...a, kind: 'hero' }));
  const ps = attList(photos);
  const farm = ps.filter(isFarm).map((a) => ({ ...a, kind: 'farm' }));
  const sup = ps.filter((a) => !isFarm(a)).map((a) => ({ ...a, kind: 'sup' }));
  return (h.length ? [...h, ...farm, ...sup] : [...sup.slice(0, 1), ...farm, ...sup.slice(1)]).slice(0, 4);
}

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
      const gal = key.startsWith('rec') ? gallery(f[F.hero], f[F.photo]) : [];
      const v = gal[0] && ATT.test(gal[0].id || '') ? `&v=${gal[0].id}` : ''; // 사진을 바꾸면 주소가 바뀌어 캐시가 새로 잡힌다
      it = {
        key, latin: cleanLatin(latin), name: String(f[F.kname] || '').trim() || cleanLatin(latin), grp: catOf(latin),
        feat, h: h && h[0] && h[1] ? (h[0] <= h[1] ? h : [h[1], h[0]]) : null,
        img: gal.length ? `/api/order-photo?id=${key}&w=520${v}` : '', // 카드(폰 두 칸) 크기 — 800의 절반 용량
        imgBig: gal.length ? `/api/order-photo?id=${key}&w=1600${v}` : '',
        // 상세 화면 넘겨보기: 종류(h 대표·f 매대 실사·s 공급사).첨부ID
        gal: gal.filter((a) => ATT.test(a.id || '')).map((a) => a.kind[0] + '.' + a.id),
        credit: gal[0] && gal[0].kind === 'hero' ? lookupText(f[F.credit]).slice(0, 160) : '',
        genus: genusKey(latin),
        unit: '주', step: 10, rows: [],
        sort: String(f[F.sortKey] || '').trim().slice(0, 80),
        ...(gal.length ? {} : { wait: 1 }), // 사진 없음 → 카드에 '사진 준비 중' 칸
      };
      byKey.set(key, it);
    }
    if (it.rows.some((x) => x[0] === size)) continue; // 같은 규격 중복 행은 첫 행만
    if (sizeName(f[F.bundle]) === LICENSED) it.lic = 1; // 규격 하나라도 라이선스면 품종 전체가 라이선스
    if (!it.sort && f[F.sortKey]) it.sort = String(f[F.sortKey]).trim().slice(0, 80);
    const mq = Number(f[F.minQty]);
    if (Number.isInteger(mq) && mq > 0 && mq <= 1000000) it.min = Math.max(it.min || 0, mq);
    const st = Number(f[F.stock]);
    it.rows.push([size, Number.isInteger(st) && st > 0 ? st : null, Math.round(price), 0]);
  }
  const items = [...byKey.values()].map(({ sort, ...it }) => ({ ...it, sort: sort || it.name }));
  const labels = genusLabels(items, info);
  items.forEach((it) => { it.glabel = labels.get(it.genus); });
  items.forEach((it) => it.rows.sort((a, b) => sizeRank(a[0]) - sizeRank(b[0])));
  // 묶음(탭) → 수종(품종 많은 순) → 이름 순. 같은 수종이 2품종 이상이면 맨 앞에 수종 안내 카드
  const order = new Map(GROUPS.map(([g], i) => [g, i]));
  const cnt = new Map();
  items.forEach((it) => cnt.set(it.grp + '|' + it.genus, (cnt.get(it.grp + '|' + it.genus) || 0) + 1));
  items.sort((a, b) => (order.get(a.grp) - order.get(b.grp)) || (cnt.get(b.grp + '|' + b.genus) - cnt.get(a.grp + '|' + a.genus))
    || a.genus.localeCompare(b.genus) || a.sort.localeCompare(b.sort, 'ko'));
  const out = [];
  items.forEach((it, i) => {
    const gk = it.grp + '|' + it.genus;
    if (cnt.get(gk) >= 2 && (i === 0 || items[i - 1].grp + '|' + items[i - 1].genus !== gk)) {
      const its = items.filter((x) => x.grp + '|' + x.genus === gk);
      const hs = its.filter((x) => x.h);
      const ps = its.flatMap((x) => x.rows.map((r) => r[2]));
      const inf = info.get(it.genus);
      out.push({ kind: 'info', k: 'g' + out.length.toString(36), grp: it.grp, genus: it.genus, glabel: it.glabel,
        name: (inf && inf.title) || (it.name.split("'")[0].trim() || it.genus),
        lines: inf ? inf.lines : [],
        stats: { n: its.length, h: hs.length ? [Math.min(...hs.map((x) => x.h[0])), Math.max(...hs.map((x) => x.h[1]))] : null, p: [Math.min(...ps), Math.max(...ps)] } });
    }
    const { sort, ...card } = it; // 정렬 글자는 화면에 내보내지 않는다
    out.push({ ...card, k: 'h' + (i + 1).toString(36) });
  });
  return out;
}

/**
 * 수종 이름(주문서 '관심 수목' 고르기 칩): 수종 카드 제목의 괄호 앞('목수국 (Hydrangea paniculata)' → 목수국)
 * → 그 수종 품종 국명의 첫 낱말 중 가장 많은 것('안개나무 로얄퍼플' → 안개나무) → 수종키.
 */
function genusLabels(items, info) {
  const words = new Map();
  for (const it of items) {
    const w = (String(it.name).match(/^[가-힣·]+/) || [])[0];
    if (!w) continue;
    const m = words.get(it.genus) || new Map();
    m.set(w, (m.get(w) || 0) + 1);
    words.set(it.genus, m);
  }
  const out = new Map();
  for (const g of new Set(items.map((it) => it.genus))) {
    const inf = info.get(g);
    const title = inf && inf.title ? inf.title.split(/\s*\(/)[0].trim() : '';
    const m = words.get(g);
    const top = m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : '';
    out.set(g, (title || top || g).slice(0, 20));
  }
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
// ── 확정 수량(2026-11-13 사용자 요청: "재고 반영은 견적 확정되면") ──────────────────────────────
// 주문서 재고 = 호게나르드 DM '현지재고' − 공동수입 링크로 들어와 확정된 견적의 수량. DM 숫자는 덮어쓰지 않는다
// (호게나르드 재고표로 갱신해도 꼬이지 않고, 견적을 취소·삭제하면 저절로 돌아온다). 확정 전(요청·발송)은 빼지 않는다.
const CONFIRMED = ['수락', '수주확정', '입고대기', '출고대기', '출하완료', '완료'];
const LINKS = { table: 'tbl93mrTsG1IsuFxQ', id: 'fldQCUWu9EOsbUiYh', items: 'fldNQStXwVIQUHwwj' }; // [영업] 주문 링크
const REQS = { table: 'tbllSGZWApKiMTNOK', draft: 'fldieREm87JD71wdA' }; // 견적요청 (요청사항 첫머리 '[주문 링크 <ID>]')
const QUOTES = { table: 'tblj74vsSha7drqmj', no: 'fldarqONAT0cvnlBc', status: 'fldMMWnoJNwVCeKvp', snap: 'fldqTH5ObhUM1Hbei' };
const GROUP_WORDS = [...CATS.map(([g]) => g), 'PBR 품종']; // 견적 품명 앞의 탭 이름(주문 당시) — 옛 'PBR 품종'도
const baseOf = (no) => String(no || '').trim().replace(/-R\d+$/, '');
const revOf = (no) => { const m = /-R(\d+)$/.exec(String(no || '')); return m ? Number(m[1]) : 1; };
const lineKey = (name, spec) => `${String(name || '').replace(/\s+/g, ' ').trim()}|${String(spec || '').trim()}`;
const stripGroup = (key) => { const g = GROUP_WORDS.find((w) => key.startsWith(w + ' ')); return g ? key.slice(g.length + 1) : key; };

/** 순수: 견적들 → 확정 수량 Map('품명|규격' → 수량). 견적 묶음(-R2…)마다 확정된 것 중 가장 최근 수정본 하나만 센다. */
function confirmedTotals(quotes) {
  const best = new Map();
  for (const q of quotes || []) {
    if (!CONFIRMED.includes(q.status)) continue;
    const b = baseOf(q.number), cur = best.get(b);
    if (!cur || revOf(q.number) > revOf(cur.number)) best.set(b, q);
  }
  const out = new Map();
  for (const q of best.values()) for (const l of q.items || []) {
    const n = Math.round(Number(l.qty));
    if (n > 0) out.set(lineKey(l.name, l.spec), (out.get(lineKey(l.name, l.spec)) || 0) + n);
  }
  return out;
}

/** 순수: DM 행 재고에서 확정 수량을 뺀다. 다 빠진 행은 내린다(품절). 품명은 '탭 품명'이든 '품명'이든 맞춘다. */
function applyReserved(records, totals) {
  if (!totals || !totals.size) return records;
  const keyOf = (f) => lineKey(String(f[F.kname] || '').trim() || cleanLatin(f[F.sname]), sizeName(f[F.size]));
  const known = new Set(records.map((r) => keyOf(r.fields || {})));
  const left = new Map();
  for (const [k, n] of totals) { const hit = known.has(k) ? k : stripGroup(k); if (known.has(hit)) left.set(hit, (left.get(hit) || 0) + n); }
  return records.flatMap((r) => {
    const f = r.fields || {}, k = keyOf(f), need = left.get(k), st = Number(f[F.stock]);
    if (!need || !Number.isInteger(st)) return [r];
    const take = Math.min(need, Math.max(st, 0));
    left.set(k, need - take);
    return st - take > 0 ? [{ ...r, fields: { ...f, [F.stock]: st - take } }] : [];
  });
}

/** 공동수입 링크로 들어와 확정된 견적의 수량. 실패하면 빈 Map — 주문서는 DM 재고 그대로 뜬다. */
async function reservations() {
  const links = await listAll(LINKS.table, '', [LINKS.id, LINKS.items]);
  const ids = links.filter((r) => /"src"\s*:\s*"hg-pool"/.test(String(r.fields[LINKS.items] || '')))
    .map((r) => String(r.fields[LINKS.id] || '')).filter((x) => /^[A-Za-z0-9_-]{22}$/.test(x));
  const bases = new Set();
  for (let i = 0; i < ids.length; i += 20) {
    const f = `OR(${ids.slice(i, i + 20).map((x) => `FIND('[주문 링크 ${x}]',{요청사항})`).join(',')})`;
    (await listAll(REQS.table, f, [REQS.draft])).forEach((r) => { const b = baseOf(r.fields[REQS.draft]); if (/^[A-Z]{2}-[0-9A-Z-]{3,20}$/.test(b)) bases.add(b); });
  }
  const quotes = [], list = [...bases];
  for (let i = 0; i < list.length; i += 15) {
    const f = `AND(NOT({삭제함}),OR(${list.slice(i, i + 15).map((b) => `{견적번호}='${b}',LEFT({견적번호},${b.length + 2})='${b}-R'`).join(',')}))`;
    for (const r of await listAll(QUOTES.table, f, [QUOTES.no, QUOTES.status, QUOTES.snap])) {
      let items = []; try { items = (JSON.parse(r.fields[QUOTES.snap] || '{}').items) || []; } catch { /* 깨진 스냅샷은 건너뛴다 */ }
      const st = r.fields[QUOTES.status];
      quotes.push({ number: String(r.fields[QUOTES.no] || ''), status: typeof st === 'object' && st ? st.name : String(st || ''), items: Array.isArray(items) ? items : [] });
    }
  }
  return confirmedTotals(quotes);
}

async function loadPool() {
  if (cache && cache.until > Date.now()) return cache.promise;
  const promise = (async () => {
    if (!BASE || !TOKEN) throw new Error('Pool unavailable');
    const [rows, infos, held] = await Promise.all([
      listAll(TABLE, 'AND({공동주문},NOT({노출제외}))', Object.values(F)),
      listAll(INFO_TABLE, '{사용}', Object.values(IF)).catch(() => []), // 안내 카드가 없어도 주문서는 뜬다
      reservations().catch((e) => { console.error('pool reservations failed:', e.message); return new Map(); }),
    ]);
    return poolItems(applyReserved(rows, held), infos);
  })();
  cache = { until: Date.now() + 60000, promise };
  promise.catch(() => { if (cache && cache.promise === promise) cache = null; });
  return promise;
}

module.exports = { poolItems, loadPool, listAll, gallery, catOf, cleanLatin, genusKey, genusLabels, confirmedTotals, applyReserved, GROUPS, FIELDS: F, INFO_FIELDS: IF };
