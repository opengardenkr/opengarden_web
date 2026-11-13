// 고객용 견적서 (/q/<키>) — 읽기·고르기·그리기. 원본은 에어테이블 '견적서 발송 내역'(ERP 견적서 생성기와 같은 표).
// 가격이 들어가는 페이지라 CLAUDE.md 원칙 1의 예외(/p/·/o/와 같은 조건):
//   추측 불가 키(22자), noindex + robots Disallow /q/, 사이트 어디에서도 링크하지 않음, 캐시 금지.
// 한 링크는 같은 견적 묶음(기준 번호 + 수정본 -R2…)에서 '보낸' 최신 수정본을 보여 준다.

const crypto = require('crypto');

const TABLE = 'tblj74vsSha7drqmj'; // 견적서 발송 내역
const REQ_TABLE = 'tbllSGZWApKiMTNOK'; // 견적요청
const Q = {
  number: 'fldarqONAT0cvnlBc', issued: 'fldtUJengZES1OG7a', revision: 'fldBCiQRajD0cGraA', status: 'fldMMWnoJNwVCeKvp',
  supply: 'fld70Zouk4tTQiew5', vat: 'flddcbJgp1GHtYhDF', total: 'fldskak7i2iuJOY8r', tax: 'fldPash3mrMiuiIzq',
  valid: 'fld9Bb4HCympMYbsE', snap: 'fldqTH5ObhUM1Hbei', company: 'fldMruU9RhDA44EyD', person: 'fldtinVuZGVJRmSPB',
  memo: 'fldLHric3VonWTZNI', deleted: 'fldUDwBfzwcnftVsa',
  key: 'fldmjGIwKtzjZMOQe', sentAt: 'fld2NScAjXSDig9E6', sentResult: 'fld0cS0S332zyYDga',
  reply: 'fld6cLeAPgdDtathq', replyAt: 'fldlpiJM79fAx7MxU', replyText: 'fldMLf4ReAkGgH9Ap',
};
const R = { no: 'fldNOX7urTPifKrQf', who: 'fldB2XhLjxxE5tHwx', phone: 'fldxTgnEjQoJe02px', memo: 'fldNfM5HhjGT7Cdn7', summary: 'fldxxk1XNpWGP7p3K', draft: 'fldieREm87JD71wdA' };

const SITE = 'https://open-garden.co.kr';
const KAKAO = 'https://pf.kakao.com/_lGfxhX/chat';
const KEY_RE = /^[A-Za-z0-9_-]{22}$/;
// 주문서 템플릿(tools/order-proposal/template.html)이 요청사항 첫머리에 붙이는 표시: '[주문 링크 <ID>] ' 또는 '[제안서 <ID>] '
const ORDER_MEMO = /^\[(?:주문 링크|제안서) [A-Za-z0-9_-]{6,64}\] /;
// 고객에게 보인 적이 있는 상태 — 이 중 최신 수정본을 보여 준다('작성'·'수정됨'·'취소'·'발송보류'는 고객 몫이 아니다)
const SHOWN = ['발송', '수락', '거절', '보류', '수주확정', '입고대기', '출고대기', '출하완료', '완료', '만료'];
const SOLD = ['수주확정', '입고대기', '출고대기', '출하완료', '완료'];

// ── 에어테이블 (서버 전용) ──
async function airtable(path, { method = 'GET', params, body } = {}) {
  const base = (process.env.AIRTABLE_BASE_ID || '').trim();
  const token = (process.env.AIRTABLE_TOKEN || '').trim();
  if (!base || !token) throw new Error('환경변수 없음');
  const url = new URL(`https://api.airtable.com/v0/${base}/${path}`);
  for (const [k, v] of Object.entries(params || {})) (Array.isArray(v) ? v : [v]).forEach((x) => url.searchParams.append(k, x));
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Airtable ${r.status}`);
  return r.json();
}
const READ = { returnFieldsByFieldId: 'true', 'fields[]': Object.values(Q) };
const getQuote = (id) => airtable(`${TABLE}/${id}`, { params: { returnFieldsByFieldId: 'true' } });
const patchQuote = (id, fields) => airtable(TABLE, { method: 'PATCH', body: { records: [{ id, fields }] } });
async function listQuotes(formula) {
  const data = await airtable(TABLE, { params: { ...READ, filterByFormula: formula, pageSize: '20' } });
  return data.records || [];
}

// ── 순수 함수 (테스트 대상) ──
const str = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.name === 'string' ? v.name : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmtPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : String(p || ''); };
const won = (n) => '₩' + Math.round(Number(n) || 0).toLocaleString('en-US');
const newKey = () => crypto.randomBytes(18).toString('base64url').slice(0, 22);
const chainBase = (no) => String(no || '').trim().replace(/-R\d+$/, '');
const revOf = (rec) => num(rec.fields[Q.revision]) || Number((str(rec.fields[Q.number]).match(/-R(\d+)$/) || [])[1] || 1);
const parseSnap = (raw) => { try { const s = JSON.parse(raw || '{}'); return s && typeof s === 'object' ? s : {}; } catch { return {}; } };

/** 키로 찾은 견적 + 같은 묶음 → 고객에게 보여 줄 한 장. 키가 붙은 견적은 상태와 상관없이 후보에 든다. */
function pickShown(records, keyedId) {
  const live = records.filter((r) => r.fields[Q.deleted] !== true);
  const cands = live.filter((r) => r.id === keyedId || SHOWN.includes(str(r.fields[Q.status])));
  cands.sort((a, b) => revOf(b) - revOf(a));
  return cands[0] || null;
}

const seoulDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
function stamp(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
// ERP 작업메모와 같은 모양: 'YYYY-MM-DD HH:mm · 누가 · 무엇 · 내용' (최근 줄이 위)
const memoLine = (who, what, detail, d) => `${stamp(d)} · ${who} · ${what} · ${detail}`;
const prepend = (memo, line) => (String(memo || '').trim() ? `${line}\n${memo}` : line);

/** 견적 레코드 → 화면·알림톡이 쓰는 값. */
function viewOf(rec, today = seoulDate()) {
  const f = rec.fields;
  const snap = parseSnap(f[Q.snap]);
  const items = (Array.isArray(snap.items) ? snap.items : []).slice(0, 300).map((it) => ({
    name: String(it && it.name || '').slice(0, 120), spec: String(it && it.spec || '').slice(0, 40),
    qty: Math.max(0, Number(it && it.qty) || 0), price: Math.max(0, Number(it && it.price) || 0),
  })).filter((it) => it.name);
  const t = snap.totals || {};
  const supply = num(f[Q.supply]) ?? num(t.supply) ?? items.reduce((s, i) => s + i.qty * i.price, 0);
  const vat = num(f[Q.vat]) ?? num(t.vat) ?? 0;
  const total = num(f[Q.total]) ?? num(t.total) ?? supply + vat;
  const taxType = str(f[Q.tax]) || snap.taxType || (vat ? '과세' : '면세');
  const validUntil = str(f[Q.valid]) || String(snap.validUntil || '');
  const status = str(f[Q.status]);
  const client = snap.client || {};
  const expired = status === '만료' || (/^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < today);
  const sold = SOLD.includes(status);
  const closed = ['취소', '거절'].includes(status) || f[Q.deleted] === true;
  const lines = (x) => String(x || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    id: rec.id, number: str(f[Q.number]), revision: revOf(rec), status, items, supply, vat, total, taxType, validUntil,
    issued: String(snap.issuedDateLabel || str(f[Q.issued]) || ''), unit: String(snap.unit || '주').slice(0, 4),
    company: str(f[Q.company]) || String(client.company || ''), person: str(f[Q.person]) || String(client.name || ''),
    client, supplier: snap.supplier || {}, bank: snap.bank || {},
    // 비고: 요청번호 줄은 내부용이라 뺀다. 하단 문구: 면세·부가세 기준 문구는 싣지 않는다(식물 = 면세, 표기하지 않음)
    remarks: lines(snap.remarks).filter((l) => !/^요청번호\s*:/.test(l)).slice(0, 6),
    notes: lines(snap.footerNotes).filter((l) => !/(면세|부가세\s*별도)\s*기준/.test(l)).slice(0, 8),
    rowsPerPage: Math.min(30, Math.max(8, Number(snap.rowsPerPage) || 20)),
    reply: str(f[Q.reply]), replyAt: str(f[Q.replyAt]),
    expired, sold, closed,
    canConfirm: !expired && !sold && !closed && status !== '수락',
    canChange: !sold && !closed,
  };
}

/** 알림톡 '견적서발행' 변수. 품목은 세 줄까지, 나머지는 '외 N품목'. 합계에 면세·부가세 표기는 붙이지 않는다. */
const SHOW_ITEMS = 3;
function issueVars(v, { name, key }) {
  const lines = v.items.map((it, i) => `${i + 1}. ${it.name}${it.spec ? ` (${it.spec})` : ''} ${it.qty.toLocaleString('en-US')}${v.unit}`);
  const list = lines.slice(0, SHOW_ITEMS).join('\n').slice(0, 600) + (lines.length > SHOW_ITEMS ? `\n외 ${lines.length - SHOW_ITEMS}품목` : '');
  return {
    '#{고객명}': (name || v.company || '고객').trim().slice(0, 40),
    '#{견적번호}': v.number,
    '#{품목요약}': list || '-',
    '#{합계}': won(v.total),
    '#{유효기간}': v.validUntil ? `${v.validUntil}까지` : '발행일로부터 14일',
    '#{링크}': key,
  };
}

// ── 그리기 ──
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));

const CSS = `:root{--green:#1F4D33;--green-dark:#123023;--leaf:#5C8C48;--ink:#111814;--gray:#6b746e;--soft:#F4F6F3;--line:#E4E8E3;--kakao:#FEE500;--warn:#B4541B}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:'Noto Sans KR',-apple-system,'Apple SD Gothic Neo',sans-serif;color:var(--ink);background:var(--soft);line-height:1.55;font-size:15px;letter-spacing:-.01em;word-break:keep-all}
button,textarea{font-family:inherit}textarea{font-size:16px}
.wrap{max-width:640px;margin:0 auto;padding:0 16px}
header{background:var(--green);color:#fff;padding:22px 0 20px}
.brand{font-size:12px;font-weight:700;letter-spacing:.28em;opacity:.85}
h1{font-size:24px;margin:8px 0 2px;font-weight:800}
.sub{font-size:13px;opacity:.85;margin:0}
main{padding:16px 0 40px}
.note{border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:12px}
.note.ok{background:#E7F1E4;color:var(--green-dark)}.note.warn{background:#FBEDE4;color:var(--warn)}.note.info{background:#fff;border:1px solid var(--line);color:var(--gray)}
.box{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px}
.box h2{font-size:13px;color:var(--gray);font-weight:700;margin:0 0 8px;letter-spacing:.02em}
.to{font-size:18px;font-weight:800;margin:0}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:14px;margin:0}.kv dt{color:var(--gray)}.kv dd{margin:0}
.items{list-style:none;margin:0;padding:0}
.items li{padding:10px 0;border-top:1px solid var(--line)}.items li:first-child{border-top:0;padding-top:0}
.it-name{font-weight:700}.it-spec{color:var(--gray);font-size:13px;margin-left:4px}
.it-calc{display:flex;justify-content:space-between;font-size:14px;color:var(--gray);margin-top:2px}.it-calc b{color:var(--ink)}
.sum{margin:12px 0 0;padding-top:12px;border-top:2px solid var(--ink)}
.sum div{display:flex;justify-content:space-between;font-size:14px;margin:2px 0}
.sum .grand{font-size:20px;font-weight:800;margin-top:6px}.sum .grand span:last-child{color:var(--green)}
.notes{margin:0;padding-left:0;list-style:none;font-size:13px;color:var(--gray)}.notes li{margin:2px 0}
.bank{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:15px}
.copy{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer}
.acts{display:grid;gap:8px;margin-top:4px}
.btn{display:flex;align-items:center;justify-content:center;height:52px;border-radius:12px;font-size:16px;font-weight:800;border:0;cursor:pointer;text-decoration:none}
.btn.go{background:var(--green);color:#fff}.btn.ghost{background:#fff;color:var(--ink);border:1px solid #C9D1C4}
.btn.kakao{background:var(--kakao);color:#191600}.btn:disabled{opacity:.5;cursor:default}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#chg{display:none;margin-top:4px}#chg.on{display:block}
#chg textarea{width:100%;min-height:96px;border:1px solid #C9D1C4;border-radius:12px;padding:12px;margin-bottom:8px}
.err{color:var(--warn);font-size:14px;min-height:1em;margin:6px 0 0}
.foot{text-align:center;color:var(--gray);font-size:12px;margin-top:20px}
@media print{body{background:#fff}header{background:#fff;color:var(--ink);border-bottom:2px solid var(--ink)}.noprint{display:none!important}.box{border:0;padding:8px 0}}`;

// ERP 견적서 생성기(app.open-garden.co.kr/tools/quote.html)의 A4 문서 양식을 그대로 쓴다 — 색·칸·글자 크기 동일.
// 공급자 소재지는 싣지 않는다(영업 문서에 회사 소재 지역을 쓰지 않는다는 원칙) — 그 칸은 홈페이지 주소.
const DOC_CSS = `.qpage{width:198mm;min-height:285mm;box-sizing:border-box;background:#fff;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#20241f;display:flex;flex-direction:column;overflow:hidden;margin:0 auto 16px;box-shadow:0 4px 24px rgba(0,0,0,.12);font-size:11px;line-height:1.4}.qpage *{box-sizing:border-box}.qhead{flex:0 0 auto}.qbody{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}.qsum{margin-top:auto;flex:0 0 auto;padding-bottom:6mm}
.qtop{display:grid;grid-template-columns:43mm 1fr 49mm;align-items:center;gap:4mm;padding:4.5mm 9mm;background:linear-gradient(125deg,#15370f 0%,#27591b 48%,#3f7630 100%);color:#fff}.qbrand{display:flex;align-items:center;gap:3mm}.qbrand img{width:19mm;height:19mm;object-fit:contain;filter:brightness(0) invert(1)}.qbrand b{display:block;font-size:10px;letter-spacing:1.3px}.qbrand span{display:block;font-size:9px;color:rgba(255,255,255,.72);margin-top:1px}.qtitle{text-align:center;font-size:27px;font-weight:800;letter-spacing:10px;white-space:nowrap}.qmeta{width:100%;border-collapse:collapse;font-size:9px}.qmeta th,.qmeta td{border-bottom:1px solid rgba(255,255,255,.42);padding:3px 4px}.qmeta th{width:19mm;text-align:left;color:rgba(255,255,255,.76);font-weight:600}.qmeta td{text-align:right;font-weight:700;white-space:nowrap}
.qparties{display:grid;grid-template-columns:1fr 1fr;margin:4mm 9mm 3mm;border:1.4px solid #333}.qparty{display:grid;grid-template-columns:9mm 1fr;min-width:0}.qparty+.qparty{border-left:1.4px solid #333}.qparty-title{display:flex;align-items:center;justify-content:center;padding:1mm;border-right:1px solid #555;background:#eef0eb;font-size:9.5px;font-weight:800;line-height:1.7;writing-mode:vertical-rl;letter-spacing:1.5px}.qparty-grid{display:grid;grid-template-columns:17mm minmax(0,1fr) 12mm 22mm;min-width:0}.qparty-grid>span,.qparty-grid>b{display:flex;align-items:center;min-height:5.7mm;padding:.8mm 1.5mm;border-bottom:1px solid #777;min-width:0}.qparty-grid>span{justify-content:center;background:#f7f8f5;border-right:1px solid #777;font-size:8px;font-weight:600}.qparty-grid .qsplit{border-left:1px solid #777}.qparty-grid>b{font-size:8.5px;font-weight:600;overflow-wrap:anywhere;border-right:1px solid #777}.qparty-grid>b:nth-child(4n),.qparty-grid>b.qwide{border-right:0}.qparty-grid .qwide{grid-column:2/5}.qparty-grid em{font-style:normal;margin-left:auto;color:#777;font-weight:500;white-space:nowrap}.qparty-grid .qlast{border-bottom:0}.qparty-grid b.qsign{position:relative;z-index:2}.qseal{position:absolute;right:.6mm;top:50%;transform:translateY(-50%);width:12mm;height:12mm;object-fit:contain;opacity:.9;pointer-events:none}
.qitems{width:calc(100% - 18mm);margin:0 9mm;border-collapse:collapse;table-layout:fixed;border:1.4px solid #30352e}.qitems th,.qitems td{border:1px solid #6d726b}.qitems th{height:7mm;padding:1.2mm;background:#315d25;color:#fff;font-size:10px;font-weight:700;text-align:center}.qitems tbody tr{height:5.8mm}.qitems td{padding:.8mm 2mm;font-size:10px;vertical-align:middle}.qno{width:9mm}.qspec{width:27mm}.qqty{width:16mm}.qprice{width:25mm}.qamount{width:31mm}.qcenter{text-align:center}.qnum{text-align:right;font-variant-numeric:tabular-nums}.qmuted{color:#737873}.qstrong{font-weight:700}.qitem-name{font-weight:600}.qitem-spec{white-space:pre-line;line-height:1.35}
.qremarks{display:grid;grid-template-columns:20mm 1fr;margin:3mm 9mm 0;border:1px solid #555;min-height:12mm}.qremarks b{display:flex;align-items:center;justify-content:center;background:#f2f3ef;border-right:1px solid #777;letter-spacing:3px}.qremarks span{padding:2.2mm 3mm;white-space:pre-wrap;line-height:1.5;color:#4f554d}.qtax-summary{display:grid;grid-template-columns:repeat(3,1fr);margin:3mm 9mm 0;border:1px solid #555;border-bottom:0}.qtax-summary div{display:flex;justify-content:space-between;padding:2.2mm 3mm}.qtax-summary div+div{border-left:1px solid #777}.qtax-summary span{color:#62685f}.qtotal-line{display:flex;justify-content:space-between;align-items:center;margin:3mm 9mm 0;padding:3mm 4mm;border-top:2px solid #254b1b;border-bottom:1px solid #254b1b}.qtax-summary+.qtotal-line{margin-top:0}.qtotal-line div{display:flex;align-items:center;gap:4mm}.qtotal-line span{font-size:9px;color:#697066}.qtotal-line b{font-size:13px}.qtotal-line strong{font-size:21px;color:#1f4717;font-variant-numeric:tabular-nums}.qtotal-line small{font-size:11px}.qbank{display:grid;grid-template-columns:23mm 1fr auto;align-items:center;margin:3mm 9mm 0;padding:2.5mm 3mm;border:1px solid #b2b7ae;background:#f5f6f3}.qbank b{color:#254b1b}.qbank span{font-size:11px;font-weight:700}.qbank small{color:#6d726b}.qnotes{margin:3mm 9mm 0;padding:2.5mm 3mm;border-left:3px solid #315d25;background:#f7f8f5;white-space:pre-line;line-height:1.55;color:#555b53}.qcont{margin:2mm 9mm 0;text-align:right;color:#737873;font-size:9px}`;

const PAGE_CSS = `:root{--green:#1F4D33;--ink:#111814;--gray:#6b746e;--line:#E4E8E3;--kakao:#FEE500;--warn:#B4541B}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#e6e9e3;font-family:'Noto Sans KR',-apple-system,'Apple SD Gothic Neo',sans-serif;color:var(--ink);word-break:keep-all;padding-bottom:96px}
button,textarea{font-family:inherit}textarea{font-size:16px}
.top{max-width:760px;margin:0 auto;padding:12px 12px 6px;display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.top .hint{margin-right:auto;font-size:12.5px;color:var(--gray)}
.mini{display:inline-flex;align-items:center;height:34px;padding:0 12px;border-radius:999px;border:1px solid #c9d1c4;background:#fff;color:var(--ink);font-size:13px;font-weight:700;text-decoration:none;cursor:pointer}
.mini.kakao{background:var(--kakao);border-color:var(--kakao);color:#191600}
.note{max-width:760px;margin:0 auto 8px;padding:0 12px}.note p{margin:0;border-radius:12px;padding:11px 14px;font-size:14px}
.note .ok{background:#E7F1E4;color:#123023}.note .warn{background:#FBEDE4;color:var(--warn)}.note .info{background:#fff;color:var(--gray);border:1px solid var(--line)}
#holder{width:100%;max-width:760px;margin:0 auto;padding:0 6px;overflow:hidden}
#sheet{width:198mm;transform-origin:top left}
.bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:10px 12px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 18px rgba(0,0,0,.06)}
.bar-in{max-width:760px;margin:0 auto;display:grid;grid-template-columns:1fr 1.6fr;gap:8px}
.bar-in.one{grid-template-columns:1fr}
.btn{display:flex;align-items:center;justify-content:center;height:50px;border-radius:12px;font-size:16px;font-weight:800;border:0;cursor:pointer}
.btn.go{background:var(--green);color:#fff}.btn.ghost{background:#fff;color:var(--ink);border:1px solid #c9d1c4}.btn:disabled{opacity:.5}
#chg{display:none;max-width:760px;margin:0 auto;padding:12px}#chg.on{display:block}
#chg .box{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
#chg h2{font-size:15px;margin:0 0 6px}#chg p{font-size:13px;color:var(--gray);margin:0 0 10px;line-height:1.5}
#chg textarea{width:100%;min-height:100px;border:1px solid #c9d1c4;border-radius:12px;padding:12px;margin-bottom:8px}
.err{color:var(--warn);font-size:14px;margin:6px 0 0;min-height:1em;text-align:center}
@media print{@page{size:A4;margin:6mm}body{background:#fff;padding:0}.noprint{display:none!important}#holder{max-width:none;padding:0;height:auto!important;overflow:visible}#sheet{transform:none!important;width:auto}
.qpage{width:auto;min-height:auto;height:284mm;margin:0;box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}.qpage+.qpage{break-before:page}}`;

const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const dotDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 4)}. ${+iso.slice(5, 7)}. ${+iso.slice(8, 10)}.` : esc(iso));

/** 생성기와 같은 A4 쪽들(HTML). 품목이 한 쪽 줄 수를 넘으면 쪽을 나누고, 합계·계좌·안내는 마지막 쪽에. */
function sheetHtml(v) {
  const c = v.client || {};
  const s = v.supplier || {};
  const b = v.bank || {};
  const dash = (x) => esc(String(x || '').trim() || '-');
  const head = `<div class="qhead">
<div class="qtop"><div class="qbrand"><img src="/assets/q/logo.png" alt=""><div><b>OPEN GARDEN</b><span>오픈가든</span></div></div>
<div class="qtitle">견 적 서</div>
<table class="qmeta"><tbody><tr><th>견적번호</th><td>${esc(v.number)}</td></tr><tr><th>발행일</th><td>${esc(v.issued)}</td></tr><tr><th>유효기간</th><td>${v.validUntil ? `${dotDate(v.validUntil)}까지` : '발행일로부터 14일'}</td></tr></tbody></table></div>
<div class="qparties">
<section class="qparty"><div class="qparty-title">공급받는 자</div><div class="qparty-grid">
<span>등록번호</span><b class="qwide">${dash(c.businessNo)}</b>
<span>상호</span><b>${dash(v.company)}</b><span class="qsplit">성명</span><b>${dash(v.person)} <em>(인)</em></b>
<span>소재지</span><b class="qwide">${dash(c.address)}</b>
<span>업태</span><b>${dash(c.businessType)}</b><span>종목</span><b>${dash(c.businessItem)}</b>
<span class="qlast">연락처</span><b class="qwide qlast">${dash(c.phone)}</b></div></section>
<section class="qparty"><div class="qparty-title">공 급 자</div><div class="qparty-grid">
<span>등록번호</span><b class="qwide">${dash(s.businessNo)}</b>
<span>상호</span><b>${dash(s.company || '오픈가든')}</b><span class="qsplit">성명</span><b class="qsign">${dash(s.name)} <em>(인)</em><img class="qseal" src="/assets/q/seal.png" alt=""></b>
<span>홈페이지</span><b class="qwide">open-garden.co.kr</b>
<span>업태</span><b>${dash(s.businessType)}</b><span>종목</span><b>${dash(s.businessItem)}</b>
<span class="qlast">연락처</span><b class="qwide qlast">카카오채널 @오픈가든</b></div></section></div></div>`;
  const per = v.rowsPerPage;
  const pages = [];
  for (let i = 0; i < Math.max(1, v.items.length); i += per) pages.push(v.items.slice(i, i + per));
  const sum = `<div class="qsum">
${v.remarks.length ? `<div class="qremarks"><b>비고</b><span>${esc(v.remarks.join('\n'))}</span></div>` : ''}
${v.vat > 0 ? `<div class="qtax-summary"><div><span>공급가액</span><b>${fmtNum(v.supply)}</b></div><div><span>부가세</span><b>${fmtNum(v.vat)}</b></div><div><span>합계</span><b>${fmtNum(v.total)}</b></div></div>` : ''}
<div class="qtotal-line"><div><span>총 ${v.items.length}품종</span><b>견적금액</b></div><strong>${fmtNum(v.total)}<small> 원</small></strong></div>
${b.account ? `<div class="qbank"><b>입금 계좌</b><span>${esc(b.bank || '')}&nbsp;&nbsp; ${esc(b.account)}</span><small>${b.holder ? `예금주 ${esc(b.holder)}` : ''}</small></div>` : ''}
${v.notes.length ? `<div class="qnotes">${esc(v.notes.join('\n'))}</div>` : ''}</div>`;
  return pages.map((rows, pi) => {
    const body = rows.map((it, i) => `<tr><td class="qcenter qmuted">${pi * per + i + 1}</td><td class="qitem-name">${esc(it.name)}</td><td class="qcenter qitem-spec">${esc(it.spec)}</td><td class="qcenter">${fmtNum(it.qty)}</td><td class="qnum">${fmtNum(it.price)}</td><td class="qnum qstrong">${fmtNum(it.qty * it.price)}</td></tr>`).join('')
      + '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(Math.max(0, per - rows.length));
    const last = pi === pages.length - 1;
    return `<div class="qpage">${head}<div class="qbody"><table class="qitems"><thead><tr><th class="qno">No.</th><th>품명</th><th class="qspec">규격</th><th class="qqty">수량</th><th class="qprice">단가</th><th class="qamount">금액</th></tr></thead><tbody>${body}</tbody></table>
${last ? sum : `<p class="qcont">다음 쪽에 이어집니다 (${pi + 1}/${pages.length})</p>`}</div></div>`;
  }).join('');
}

function renderPage(v, { key }) {
  const status = v.sold ? ['ok', '주문이 확정된 견적입니다. 출하 일정은 담당자가 안내드립니다.']
    : v.closed ? ['warn', '더 이상 유효하지 않은 견적입니다. 새 견적이 필요하시면 카카오톡으로 알려주세요.']
      : v.status === '수락' || v.reply === '확정' ? ['ok', '확정해 주셨습니다. 아래 계좌로 입금해 주시면 주문이 확정됩니다.']
        : v.expired ? ['warn', '유효기간이 지난 견적입니다. 다시 받아보시려면 [수정 요청]이나 카카오톡으로 알려주세요.']
          : v.reply === '수정요청' ? ['info', '수정 요청을 받았습니다. 담당자가 수정본을 보내드립니다.'] : null;
  const both = v.canConfirm && v.canChange;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>견적서 ${esc(v.number)} · 오픈가든</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${PAGE_CSS}\n${DOC_CSS}</style></head><body>
<div class="top noprint"><span class="hint">벌려서 확대</span><button type="button" class="mini" id="prt">PDF 저장·인쇄</button><a class="mini kakao" href="${KAKAO}" target="_blank" rel="noopener">카톡 문의</a></div>
${status ? `<div class="note noprint"><p class="${status[0]}">${esc(status[1])}</p></div>` : ''}
<div id="holder"><div id="sheet">${sheetHtml(v)}</div></div>
<div id="chg" class="noprint"><div class="box"><h2>수정 요청</h2>
<p>품목·수량을 어떻게 바꿀지 적어 주세요. 납품 일정은 바꿀 수 없습니다 — 현물 입고 2~3주 전에 안내드리고, 입고 즉시 발송합니다.</p>
<textarea id="chgTxt" maxlength="800" placeholder="예: 목수국 라임라이트 200주 → 400주, 병꽃나무 부케로즈 빼기"></textarea>
<button type="button" class="btn go" id="chgSend" style="width:100%">수정 요청 보내기</button></div></div>
<p class="err noprint" id="err" role="alert"></p>
${v.canConfirm || v.canChange ? `<div class="bar noprint"><div class="bar-in${both ? '' : ' one'}">
${v.canChange ? '<button type="button" class="btn ghost" id="chgBtn">수정 요청</button>' : ''}${v.canConfirm ? '<button type="button" class="btn go" id="ok">이대로 확정하기</button>' : ''}</div></div>` : ''}
<script>
(function(){
  var KEY=${JSON.stringify(key)};
  function $(id){return document.getElementById(id);}
  function fit(){ var h=$('holder'), s=$('sheet'); s.style.transform=''; var k=Math.min(1,(h.clientWidth-12)/s.offsetWidth); s.style.transform='scale('+k+')'; h.style.height=Math.ceil(s.offsetHeight*k)+'px'; }
  window.addEventListener('resize', fit); window.addEventListener('load', fit); fit();
  window.addEventListener('beforeprint', function(){ $('sheet').style.transform='none'; $('holder').style.height='auto'; });
  window.addEventListener('afterprint', fit);
  function send(action, memo, btn){
    var err=$('err'); err.textContent=''; btn.disabled=true; var label=btn.textContent; btn.textContent='보내는 중…';
    fetch('/api/quote-reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:KEY,action:action,memo:memo||''})})
      .then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw new Error(j.error||'전송 실패');return j;});})
      .then(function(){location.reload();})
      .catch(function(e){err.textContent=e.message||'전송에 실패했습니다. 카카오톡으로 알려주세요.';btn.disabled=false;btn.textContent=label;});
  }
  if($('ok'))$('ok').addEventListener('click',function(){ if(confirm('이 견적대로 확정할까요? 입금해 주시면 주문이 확정됩니다.')) send('confirm','',this); });
  if($('chgBtn'))$('chgBtn').addEventListener('click',function(){ var c=$('chg'); c.classList.toggle('on'); if(c.classList.contains('on')){ c.scrollIntoView({behavior:'smooth'}); $('chgTxt').focus(); } });
  if($('chgSend'))$('chgSend').addEventListener('click',function(){ var t=$('chgTxt').value.trim(); if(t.length<2){$('err').textContent='바꿀 내용을 적어 주세요.';return;} send('change',t,this); });
  $('prt').addEventListener('click',function(){window.print();});
})();
</script></body></html>`;
}

function messagePage(title, body) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)} · 오픈가든</title><style>${CSS}</style></head>
<body><header><div class="wrap"><div class="brand">OPEN GARDEN</div><h1>견적서</h1></div></header>
<main><div class="wrap"><div class="box" style="text-align:center"><p class="to" style="font-size:17px">${esc(title)}</p>
<p style="color:var(--gray);font-size:14px">${esc(body)}</p><a class="btn kakao" href="${KAKAO}" target="_blank" rel="noopener">카카오톡으로 문의</a></div></div></main></body></html>`;
}

/** 키 → { shown, keyed } (없으면 null). 키 형식은 호출 전에 KEY_RE로 확인한다. */
async function resolveKey(key) {
  if (!KEY_RE.test(key)) return null;
  const keyed = (await listQuotes(`{고객링크키}='${key}'`)).find((r) => r.fields[Q.key] === key);
  if (!keyed || keyed.fields[Q.deleted] === true) return null;
  const base = chainBase(keyed.fields[Q.number]);
  let chain = [keyed];
  if (/^[A-Z]{1,6}-\d{6,8}-\d{1,6}$/.test(base)) { // 번호 형식을 확인한 뒤에만 수식에 넣는다
    chain = await listQuotes(`AND(NOT({삭제함}),OR({견적번호}='${base}',LEFT({견적번호},${base.length + 2})='${base}-R'))`);
    if (!chain.some((r) => r.id === keyed.id)) chain.push(keyed);
  }
  const shown = pickShown(chain, keyed.id);
  return shown ? { shown, keyed } : null;
}

module.exports = {
  TABLE, REQ_TABLE, Q, R, SITE, KEY_RE, ORDER_MEMO, SHOWN, SOLD,
  airtable, getQuote, patchQuote, listQuotes, resolveKey,
  newKey, chainBase, pickShown, parseSnap, viewOf, issueVars, memoLine, prepend, stamp, seoulDate, won, str,
  renderPage, sheetHtml, messagePage, esc,
};
