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
  return {
    id: rec.id, number: str(f[Q.number]), revision: revOf(rec), status, items, supply, vat, total, taxType, validUntil,
    issued: String(snap.issuedDateLabel || str(f[Q.issued]) || ''), unit: String(snap.unit || '주').slice(0, 4),
    company: str(f[Q.company]) || String(client.company || ''), person: str(f[Q.person]) || String(client.name || ''),
    supplier: snap.supplier || {}, bank: snap.bank || {},
    notes: [snap.remarks, snap.footerNotes].map((s) => String(s || '')).join('\n').split('\n').map((s) => s.trim())
      .filter((s) => s && !/^요청번호\s*:/.test(s)).slice(0, 12),
    reply: str(f[Q.reply]), replyAt: str(f[Q.replyAt]),
    expired, sold, closed,
    canConfirm: !expired && !sold && !closed && status !== '수락',
    canChange: !sold && !closed,
  };
}

/** 알림톡 '견적서발행' 변수. */
function issueVars(v, { name, key }) {
  const lines = v.items.map((it, i) => `${i + 1}. ${it.name}${it.spec ? ` (${it.spec})` : ''} ${it.qty.toLocaleString('en-US')}${v.unit}`);
  let list = lines.join('\n');
  if (list.length > 600) {
    const kept = [];
    for (const l of lines) { if ([...kept, l].join('\n').length > 560) break; kept.push(l); }
    list = kept.join('\n') + `\n외 ${lines.length - kept.length}품목`;
  }
  return {
    '#{고객명}': (name || v.company || '고객').trim().slice(0, 40),
    '#{견적번호}': v.number,
    '#{품목요약}': list || '-',
    '#{합계}': `${won(v.total)} (${v.taxType === '과세' ? '부가세 포함' : '면세'})`,
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

function renderPage(v, { key }) {
  const s = v.supplier || {};
  const b = v.bank || {};
  const status = v.sold ? '<div class="note ok">주문이 확정된 견적입니다. 출하 일정은 담당자가 안내드립니다.</div>'
    : v.closed ? '<div class="note warn">더 이상 유효하지 않은 견적입니다. 새 견적이 필요하시면 카카오톡으로 알려주세요.</div>'
      : v.status === '수락' || v.reply === '확정' ? '<div class="note ok">확정해 주셨습니다. 담당자가 재고·납기를 확인하고 연락드립니다.</div>'
        : v.expired ? '<div class="note warn">유효기간이 지난 견적입니다. 다시 받아보시려면 [수정 요청]이나 카카오톡으로 알려주세요.</div>'
          : v.reply === '수정요청' ? '<div class="note info">수정 요청을 받았습니다. 담당자가 수정본을 보내드립니다.</div>' : '';
  const items = v.items.map((it) => `<li><div><span class="it-name">${esc(it.name)}</span>${it.spec ? `<span class="it-spec">${esc(it.spec)}</span>` : ''}</div>
<div class="it-calc"><span>${esc(it.qty.toLocaleString('en-US'))}${esc(v.unit)} × ${esc(won(it.price))}</span><b>${esc(won(it.qty * it.price))}</b></div></li>`).join('');
  const supplierRows = [['상호', s.company || '오픈가든'], ['대표', s.name], ['사업자번호', s.businessNo], ['업태·종목', [s.businessType, s.businessItem].filter(Boolean).join(' · ')], ['연락처', fmtPhone(s.phone)]]
    .filter(([, val]) => val).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('');
  const bankLine = [b.bank, b.account].filter(Boolean).join(' ');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>견적서 ${esc(v.number)} · 오픈가든</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<header><div class="wrap"><div class="brand">OPEN GARDEN</div><h1>견적서</h1>
<p class="sub">${esc(v.number)}${v.revision > 1 ? ` · 수정본 ${v.revision}차` : ''}${v.issued ? ` · 발행 ${esc(v.issued)}` : ''}</p></div></header>
<main><div class="wrap">
${status}
<section class="box"><h2>받는 분</h2><p class="to">${esc([v.company, v.person].filter(Boolean).join(' ') || '고객')} 귀하</p></section>
<section class="box"><h2>견적 내역</h2><ul class="items">${items}</ul>
<div class="sum"><div><span>공급가액</span><span>${esc(won(v.supply))}</span></div>
${v.taxType === '과세' ? `<div><span>부가세</span><span>${esc(won(v.vat))}</span></div>` : '<div><span>부가세</span><span>면세</span></div>'}
<div class="grand"><span>합계</span><span>${esc(won(v.total))}</span></div></div></section>
<section class="box"><h2>조건</h2><dl class="kv"><dt>유효기간</dt><dd>${esc(v.validUntil ? v.validUntil + '까지' : '발행일로부터 14일')}</dd></dl>
${v.notes.length ? `<ul class="notes" style="margin-top:8px">${v.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>
${bankLine ? `<section class="box"><h2>입금 계좌</h2><div class="bank"><span>${esc(bankLine)}${b.holder ? `<br><small style="color:var(--gray)">예금주 ${esc(b.holder)}</small>` : ''}</span>
<button type="button" class="copy noprint" data-copy="${esc(b.account || '')}">계좌 복사</button></div></section>` : ''}
<section class="box"><h2>공급자</h2><dl class="kv">${supplierRows}</dl></section>
<div class="acts noprint">
${v.canConfirm ? '<button type="button" class="btn go" id="ok">이대로 확정하기</button>' : ''}
<div class="row2">${v.canChange ? '<button type="button" class="btn ghost" id="chgBtn">수정 요청</button>' : ''}<button type="button" class="btn ghost" id="prt">PDF·인쇄</button></div>
<div id="chg"><textarea id="chgTxt" maxlength="800" placeholder="바꿀 내용을 적어 주세요 (예: 목수국 라임라이트 200주 → 400주, 납품일 3월 둘째 주)"></textarea>
<button type="button" class="btn go" id="chgSend">수정 요청 보내기</button></div>
<p class="err" id="err" role="alert"></p>
<a class="btn kakao" href="${KAKAO}" target="_blank" rel="noopener">카카오톡으로 문의</a>
</div>
<p class="foot">Open Garden · 오픈가든 · open-garden.co.kr</p>
</div></main>
<script>
(function(){
  var KEY=${JSON.stringify(key)};
  function $(id){return document.getElementById(id);}
  function send(action, memo, btn){
    var err=$('err'); err.textContent=''; btn.disabled=true; var label=btn.textContent; btn.textContent='보내는 중…';
    fetch('/api/quote-reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:KEY,action:action,memo:memo||''})})
      .then(function(r){return r.json().then(function(j){if(!r.ok||!j.ok)throw new Error(j.error||'전송 실패');return j;});})
      .then(function(){location.reload();})
      .catch(function(e){err.textContent=e.message||'전송에 실패했습니다. 카카오톡으로 알려주세요.';btn.disabled=false;btn.textContent=label;});
  }
  if($('ok'))$('ok').addEventListener('click',function(){ if(confirm('이 견적대로 확정할까요? 담당자가 재고·납기를 확인하고 연락드립니다.')) send('confirm','',this); });
  if($('chgBtn'))$('chgBtn').addEventListener('click',function(){ $('chg').classList.toggle('on'); $('chgTxt').focus(); });
  if($('chgSend'))$('chgSend').addEventListener('click',function(){ var t=$('chgTxt').value.trim(); if(t.length<2){$('err').textContent='바꿀 내용을 적어 주세요.';return;} send('change',t,this); });
  $('prt').addEventListener('click',function(){window.print();});
  document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){
    var v=b.getAttribute('data-copy'); if(navigator.clipboard)navigator.clipboard.writeText(v).then(function(){b.textContent='복사했습니다';});
  });});
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
  renderPage, messagePage, esc,
};
