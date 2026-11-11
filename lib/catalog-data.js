// Public catalog source adapters: immediate/domestic, preorder/bulbs, hoogenraad, hbm.
// Source-specific fields are allowlisted. Prices, costs, raw attachments and internal notes never leave the server.
// 가격 필드(도매가, 단가_EUR, 정가·할증반영가·관급가·크레이트가 등)는 아래 필드ID
// 화이트리스트에 없으므로 서버 밖으로 절대 나가지 않습니다.
// (예전 Master DB 기준 코드는 git 이력 6e3b205 참고)

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;

// 테이블·필드를 이름이 아닌 ID로 지정 — 에어테이블에서 이름을 바꿔도 안 깨짐 (2026-07-18 실스키마 대조)
const SOURCES = {
  immediate: {
    table: process.env.AIRTABLE_TABLE_DOMESTIC || 'tblDMLlaBwkW1NfhU', // 국내 라인업
    fields: {
      kname: 'fldxfOsqC0b41oxmt', // 국명
      sname: 'fld92Co6Q7JYeyAPe', // 학명
      size: 'fldBy0z3isyaVqCmC',  // Size (규격) — 예: 7치
      cat: 'fldD4hy9yFpeiSN2K',   // 카테고리
      moq: 'fldOntZJg6Qjn1fAd',   // 최소주문수량
      desc: 'fldbfuW3P3N5QYxNE',
      zone: 'fldeuZpFcXYhFyZ0D',
      flowering: 'fldoYQKcShn7V511g',
      visibility: 'flda4BMnsROcUcBVF',
      image: 'fldwpaj4TS0bW9E0x', // image 첨부
    },
  },
  preorder: {
    table: process.env.AIRTABLE_TABLE_IMPORT || 'tblylbZq6PLfzH1Ol', // 판매 라인업 (유럽 수입)
    fields: {
      sku: 'fldbSwnIpkkGqKkpC',   // SKU (실제 필드명 앞에 보이지 않는 BOM 문자가 있어 ID 지정이 특히 중요)
      kname: 'fldM4cqde0Qn5qiIy', // 국명
      sname: 'fldh1PgjsPs6zAwwS', // 학명
      cat: 'fldin9Roj1xTXYYHY',   // 속 (튤립·크로커스 등) → 카테고리로 사용
      size: 'fldrQ830PgqMwsmiL',  // Size (규격) — 예: 11/12 규격
      zone: 'fldvnaxRNwATuI8JK',  // 내한성 — 예: -20℃
      desc: 'fldLgt242IX3HfZje',  // 특징 (상세 모달용)
      use: 'fldZuyylSbD2YBfXn',   // 쓰임새 추천
      flowering: 'fldyYM14ysO2JDRrv',
      visibility: 'fld4vgoFCtt03oOmM',
      image: 'fldPSrlViJFjaUerf', // image 첨부
    },
  },
  hoogenraad: {
    table: 'tblVVRTKfyViCI1aW', // 호게나르드 DM: 414 rows; 노출제외 marked 99 rows
    formula: 'AND(OR({국명}!="",{학명}!=""),NOT({노출제외}))',
    fields: {
      sku: 'fldYExrwAE5gPA5lz',
      kname: 'fld3XAFUiRqL9I5xM',
      sname: 'fldHpENoNezkg0YrO',
      size: 'fldqrGhf56NzhOusv',
      cat: 'fldFMn3AIHfab5jFR',
      flowering: 'fld783KZbCUv8tn0F',
      visibility: 'fldci5Va4ESSmWZ2E',
      excluded: 'fldkXhOo3KTpUhuZ6',
      image: 'fldDj5Udu4O5dk5Cq',
      // 식물 등록 마스터(품종 1건 = 마스터 1건) 조회 필드. P9·P12 행이 같은 사진·특징을 공유합니다.
      // 사진은 마스터 → 이 행 image 순서. 특징·키는 마스터 '정보 검토상태'가 '확인 필요'면 내보내지 않습니다.
      masterImage: 'fldxeO3MrMcRUta3a',
      masterDesc: 'fld8223BNWfWUzT2I',
      heightMin: 'fldbgRQbZ0pa8hweV',
      heightMax: 'fld67AfCVuIfBxg5N',
      width: 'fldSusx4BQEJKZIMD',
      series: 'fldEs8ji4nccUvbsd',
      award: 'fldnHsr8ktyxYbDoX',
      credit: 'fld2hK0dg4h2rUnGR',
      review: 'fldzZ5GxLNVUBCfyG',
    },
  },
  hbm: {
    table: 'tblm8bjSeDCflcIzk', // Master DB; only HBM confirmed 202 records
    formula: 'AND({Status}="공급확정(260713 HBM 회신)",OR({국명}!="",{학명}!=""))',
    fields: {
      sku: 'fldjphACuKQeBvzIM',
      kname: 'fldkflZdfkITtotyr',
      sname: 'fldyr29odRIrUr5Vn',
      size: 'fld5QxbbKSmNgm8i3',
      cat: 'fldODzAWv5D3ZX5be',
      desc: 'fldERso87TPrDm9F1',
      image: 'fld5pAgmi6gvjMRkb',
      status: 'flddsP902hzblFS47',
    },
  },
};
const GROUPS = Object.freeze(Object.keys(SOURCES));

// ── 식물 등록 마스터 조회값 정리 ──
// 조회(lookup) 필드는 항상 배열로 옵니다. 숫자·글자·선택지·첨부가 섞여 와도 안전하게 풉니다.
const flat = (v) => {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  // 일부 API 응답 형식은 조회값을 {linkedRecordIds, valuesByLinkedRecordId}로 줍니다 — 같은 순서로 펼칩니다.
  if (typeof v === 'object' && v.valuesByLinkedRecordId) {
    const by = v.valuesByLinkedRecordId;
    return (v.linkedRecordIds || Object.keys(by)).flatMap((id) => flat(by[id]));
  }
  return [v];
};
const firstText = (v) => {
  const x = flat(v).map((y) => (y && typeof y === 'object' ? y.name : y)).find((y) => y != null && String(y).trim() !== '');
  return x == null ? '' : String(x).trim();
};
const firstNum = (v) => {
  const n = flat(v).map(Number).find((x) => Number.isFinite(x) && x > 0);
  return n == null ? null : n;
};
// 사진: 마스터(품종 공통) → 이 행 첨부 순서, 최대 5장. 이미지 API도 같은 순서를 씁니다.
function attachmentsOf(f, F) {
  return [...(F.masterImage ? flat(f[F.masterImage]) : []), ...flat(f[F.image])]
    .filter((a) => a && typeof a === 'object').slice(0, 5);
}
// 마스터 정보 검토상태가 '확인 필요'면 특징·크기를 웹에 내보내지 않습니다(사진은 별도 출처 확인을 거침).
function masterInfo(f, F) {
  if (!F.masterDesc) return {};
  if (flat(f[F.review]).some((x) => (x && typeof x === 'object' ? x.name : x) === '확인 필요')) return {};
  const lo = firstNum(f[F.heightMin]), hi = firstNum(f[F.heightMax]), w = firstNum(f[F.width]);
  const height = lo && hi && lo !== hi ? `${Math.min(lo, hi)}–${Math.max(lo, hi)} cm` : (lo || hi) ? `${lo || hi} cm` : '';
  return {
    desc: flat(f[F.masterDesc]).map((x) => String(x || '').trim()).filter(Boolean)[0] || '',
    height,
    spread: w ? `${w} cm` : '',
    series: firstText(f[F.series]),
    award: firstText(f[F.award]),
  };
}
const SOURCE_LABELS = Object.freeze({ immediate:'국내 농장', preorder:'HBM', hoogenraad:'호게나르드', hbm:'HBM' });

async function fetchAll(src) {
  // 에어테이블은 100건씩 페이지네이션 → 전부 모아서 반환
  let records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${src.table}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    // 이름(국명·학명)이 둘 다 빈 행은 서버에서 제외
    url.searchParams.set('filterByFormula', src.formula || 'OR({국명}!="",{학명}!="")');
    url.searchParams.set('pageSize', '100');
    Object.values(src.fields).forEach((f) => url.searchParams.append('fields[]', f));
    if (offset) url.searchParams.set('offset', offset);

    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Airtable ${r.status}`);
    const data = await r.json();
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// 대분류 예외 표 (에어테이블 '속 분류' 테이블).
// 평소엔 비어 있고, 카탈로그에 '기타'가 뜨거나 분류를 바꾸고 싶을 때만 한 줄 추가합니다.
// 여기 적힌 값이 프론트의 기본 매핑보다 우선합니다.
// 테이블이 없거나 조회에 실패해도 카탈로그는 정상 동작해야 하므로 조용히 {}를 돌려줍니다.
const GROUP_TABLE = process.env.AIRTABLE_GROUP_TABLE || 'tbl7iGQoFTeGUTXyd';
async function fetchGroupOverrides() {
  try {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${GROUP_TABLE}`);
    url.searchParams.set('pageSize', '100');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return {};
    const { records = [] } = await r.json();
    const map = {};
    for (const rec of records) {
      const f = rec.fields || {};
      const key = String(f['속'] || '').trim();
      const val = f['대분류'];
      const name = typeof val === 'object' && val ? val.name : val;
      if (key && name) map[key] = String(name);
    }
    return map;
  } catch (e) {
    return {};
  }
}

async function loadCatalog(group) {
    if (!BASE || !TOKEN) {
      throw new Error('Catalog unavailable');
    }
    const src = SOURCES[group];
    const F = src.fields;

    const [records, overrides] = await Promise.all([fetchAll(src), group === 'immediate' ? fetchGroupOverrides() : Promise.resolve({})]);
    // 규격이 미확정인 품목은 카탈로그에서 감춥니다.
    // 에어테이블에서 규격을 채우면 별도 배포 없이 자동으로 다시 노출됩니다.
    const BAD_SIZE = ['확인필요', '??', '확인중', '미정'];
    const cleanSize = (v) => {
      if (Array.isArray(v)) return v.filter((s) => s && !BAD_SIZE.includes(String(s).trim()));
      const s = String(v || '').trim();
      return !s || BAD_SIZE.includes(s) ? '' : s;
    };
    const hasSize = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

    // 첨부는 여러 장 등록될 수 있습니다(국내 라인업의 약 절반이 2~4장).
    // 서버 변환에서 최대 1600px로 압축하므로 전체 구도를 보존하는 원본을 우선 씁니다.
    const pickUrl = (a) =>
      (a && (a.url || (a.thumbnails && a.thumbnails.large && a.thumbnails.large.url))) || null;

    // Preserve legacy blank visibility while preventing draft/private records from reaching any public API.
    const publicRecords = records.filter(({fields:f}) => !['비공개','미검토'].includes(f[F.visibility]) && !(F.excluded && f[F.excluded]) && (group !== 'hbm' || f[F.status] === '공급확정(260713 HBM 회신)'));
    const items = publicRecords.map(({ id, fields: f }) => {
      const atts = attachmentsOf(f, F);
      const images = atts.map(pickUrl).filter(Boolean);
      const master = masterInfo(f, F);
      return {
        id,
        sku: (F.sku && f[F.sku]) || '',
        kname: f[F.kname] || '',
        sname: f[F.sname] || '',
        size: cleanSize(f[F.size]),
        cat: (Array.isArray(f[F.cat]) ? f[F.cat] : [f[F.cat]]).filter(Boolean),
        zone: (F.zone && f[F.zone]) || '',
        flowering: (F.flowering && f[F.flowering]) || '',
        desc: (F.desc && f[F.desc]) || master.desc || '',
        use: (F.use && f[F.use]) || '',
        moq: (F.moq && f[F.moq]) || null, // 최소주문수량 (국내 라인업만)
        height: master.height || '',
        spread: master.spread || '',
        series: master.series || '',
        award: master.award || '',
        // 사진 저작자 표기 — 마스터 사진이 실제로 나갈 때만 붙입니다(행 자체 사진에는 붙이지 않음)
        credit: F.credit && flat(f[F.masterImage]).length ? firstText(f[F.credit]) : '',
        // 첨부 URL은 수 시간 뒤 만료되지만 캐시(10분)가 더 짧아 항상 유효한 URL이 나감.
        image: images[0] || null, // 대표 사진 — 기존 소비자 호환용으로 계속 내보냄
        images,                   // 전체 사진 (상세 모달 갤러리용)
        group,
        source: SOURCE_LABELS[group],
      };
    });

    const shown = items.filter((it) => hasSize(it.size));

    // 10분 캐시 → 에어테이블 API 한도(초당 5회) 보호 + 빠른 응답

    return {
      group,
      count: shown.length,
      items: shown,
      hidden: items.length - shown.length, // 규격 미확정으로 감춘 건수
      groupOverrides: overrides,
    };
}

const cache = new Map();
async function getCatalog(group) {
  if (!GROUPS.includes(group)) throw new Error('Invalid group');
  const hit = cache.get(group);
  if (hit && hit.until > Date.now()) return hit.promise;
  const entry = { until: Date.now() + 300000, promise: null };
  entry.promise = loadCatalog(group).catch(error => { if (cache.get(group) === entry) cache.delete(group); throw error; });
  cache.set(group, entry);
  return entry.promise;
}
// Image endpoints read ONE record instead of scanning the full supplier table on every photo request.
const photoLookupCache = new Map();
async function getRecordImage(group, id, index = 0) {
  if (!GROUPS.includes(group) || !/^rec[A-Za-z0-9]{14}$/.test(id) || !Number.isInteger(index) || index < 0 || index > 4) return null;
  const cacheKey = group + ':' + id;
  let entry = photoLookupCache.get(cacheKey);
  if (!entry || entry.until <= Date.now()) {
    const promise = (async () => {
      if (!BASE || !TOKEN) throw new Error('Catalog unavailable');
      const source = SOURCES[group], fields = source.fields;
      const url = new URL(`https://api.airtable.com/v0/${BASE}/${source.table}/${id}`);
      url.searchParams.set('returnFieldsByFieldId','true');
      // One GET instead of 1–5 pages of a whole table; no fields are sent to clients.
      const res = await fetch(url,{headers:{Authorization:`Bearer ${TOKEN}`},signal:AbortSignal.timeout(10000),cache:'no-store'});
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Catalog image source unavailable');
      const record = await res.json(), f = record.fields || {};
      const hidden = ['비공개','미검토'].includes(f[fields.visibility]) ||
        (fields.excluded && f[fields.excluded]) ||
        (group === 'hbm' && f[fields.status] !== '공급확정(260713 HBM 회신)');
      const size = f[fields.size];
      const noSize = !size || (Array.isArray(size) ? !size.some(s=>s&&!['??','확인필요','미정','확인중'].includes(s)) : ['??','확인필요','미정','확인중'].includes(String(size)));
      if (hidden || noSize || (!f[fields.kname] && !f[fields.sname])) return [];
      return attachmentsOf(f, fields).map(p=>p?.url || p?.thumbnails?.large?.url || null).filter(Boolean);
    })();
    entry={until:Date.now()+120000,promise};
    photoLookupCache.set(cacheKey,entry);
    promise.catch(()=>{if(photoLookupCache.get(cacheKey)===entry)photoLookupCache.delete(cacheKey)});
    // Bound long-lived warm functions' memory, but avoid evicting entries still being requested.
    if(photoLookupCache.size>300)photoLookupCache.delete(photoLookupCache.keys().next().value);
  }
  const images = await entry.promise;
  return images[index] || null;
}
const imagePath = (group, id, index = 0, width = 1600) => `/api/plant-image?group=${group}&id=${encodeURIComponent(id)}&index=${index}${width===520?'&w=520':''}`;
function publicItem(item) {
  const images = item.images.map((_, i) => imagePath(item.group, item.id, i));
  return { ...item, image: images[0] || null, thumb: images.length ? imagePath(item.group,item.id,0,520) : null, images, page: `/plants/${item.group}/${item.id}` };
}
module.exports = { getCatalog, getRecordImage, publicItem, imagePath, GROUPS, SOURCE_LABELS, attachmentsOf, masterInfo, SOURCES };
