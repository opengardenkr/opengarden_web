const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.AIRTABLE_BASE_ID = 'appTEST';
process.env.AIRTABLE_TOKEN = 'test-token';
const doc = require('../lib/quote-doc');
const { Q, R } = doc;
const issue = require('../api/quote-issue');
const view = require('../api/quote-view');
const reply = require('../api/quote-reply');

const SNAP = {
  taxType: '과세', client: { company: '금성농원', name: '김희준' },
  supplier: { company: '오픈가든', name: '이시형', businessNo: '495-28-01860', address: '어딘가 주소', phone: '01000000000' },
  bank: { bank: '농협', account: '301-0000-0000-00', holder: '오픈가든' },
  remarks: '요청번호: Q-20261111-ABC', footerNotes: '· 본 견적의 유효기간은 발행일로부터 14일입니다.',
  items: [{ name: '목수국 라임라이트', spec: 'P9', qty: 200, price: 5000 }, { name: '<script>x</script>', spec: '', qty: 10, price: 100 }],
  validUntil: '2099-12-31', issuedDateLabel: '2026. 11. 11.', unit: '주',
};
const rec = (id, fields, createdTime = new Date().toISOString()) => ({ id, createdTime, fields });
const quoteFields = (over = {}) => ({
  [Q.number]: 'OG-20261111-001', [Q.status]: { name: '작성' }, [Q.revision]: 1, [Q.supply]: 1001000, [Q.vat]: 100100, [Q.total]: 1101100,
  [Q.tax]: { name: '과세' }, [Q.valid]: '2099-12-31', [Q.snap]: JSON.stringify(SNAP), [Q.company]: '금성농원', [Q.person]: '김희준',
  [Q.memo]: '2026-11-11 23:00 · 자동 · 자동초안 · 웹 견적요청 Q-20261111-ABC에서 작성', ...over,
});

function mockRes() {
  const r = { headers: {}, statusCode: 0, body: undefined };
  r.status = (n) => { r.statusCode = n; return r; };
  r.json = (d) => { r.body = d; return r; };
  r.send = (d) => { r.body = d; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  return r;
}
async function withFetch(route, fn) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ url: u, method: opts.method || 'GET', body });
    const out = await route(u, opts.method || 'GET', body);
    return { ok: out.status ? out.status < 400 : true, status: out.status || 200, json: async () => out.json || {}, text: async () => JSON.stringify(out.json || {}) };
  };
  try { return await fn(calls); } finally { global.fetch = original; }
}

test('pickShown shows the newest revision the customer has been sent', () => {
  const recs = [
    rec('rec1', { [Q.number]: 'OG-1-001', [Q.revision]: 1, [Q.status]: { name: '수정됨' } }),
    rec('rec2', { [Q.number]: 'OG-1-001-R2', [Q.revision]: 2, [Q.status]: { name: '발송' } }),
    rec('rec3', { [Q.number]: 'OG-1-001-R3', [Q.revision]: 3, [Q.status]: { name: '작성' } }),
    rec('rec4', { [Q.number]: 'OG-1-001-R4', [Q.revision]: 4, [Q.status]: { name: '발송' }, [Q.deleted]: true }),
  ];
  assert.equal(doc.pickShown(recs, 'rec1').id, 'rec2'); // 아직 안 보낸 R3·삭제한 R4는 숨긴다
  assert.equal(doc.pickShown([recs[2]], 'rec3').id, 'rec3'); // 키가 붙은 견적은 상태와 상관없이 후보
  assert.equal(doc.chainBase('OG-20261111-001-R12'), 'OG-20261111-001');
});

test('viewOf reads totals, hides request number and flags expiry', () => {
  const v = doc.viewOf(rec('recA', quoteFields()), '2026-11-11');
  assert.equal(v.total, 1101100); assert.equal(v.items.length, 2); assert.equal(v.taxType, '과세');
  assert.ok(!v.notes.some((n) => n.includes('요청번호')));
  assert.equal(v.canConfirm, true);
  const old = doc.viewOf(rec('recA', quoteFields({ [Q.valid]: '2026-11-01' })), '2026-11-11');
  assert.equal(old.expired, true); assert.equal(old.canConfirm, false); assert.equal(old.canChange, true);
  const sold = doc.viewOf(rec('recA', quoteFields({ [Q.status]: { name: '수주확정' } })), '2026-11-11');
  assert.equal(sold.canChange, false);
});

test('issueVars fills every template variable and keeps the item list short', () => {
  const v = doc.viewOf(rec('recA', quoteFields()));
  const vars = doc.issueVars(v, { name: '금성농원', key: 'k'.repeat(22) });
  assert.deepEqual(Object.keys(vars).sort(), ['#{견적번호}', '#{고객명}', '#{링크}', '#{유효기간}', '#{품목요약}', '#{합계}'].sort());
  assert.equal(vars['#{합계}'], '₩1,101,100 (부가세 포함)');
  assert.match(vars['#{품목요약}'], /^1\. 목수국 라임라이트 \(P9\) 200주/);
  const many = { ...v, items: Array.from({ length: 80 }, (_, i) => ({ name: `품종 이름이 긴 편인 식물 ${i}`, spec: 'P9', qty: 200, price: 1 })) };
  const long = doc.issueVars(many, { name: 'x', key: 'k' })['#{품목요약}'];
  assert.ok(long.length <= 600); assert.match(long, /외 \d+품목$/);
});

test('eligible only accepts fresh, fully priced automatic drafts', () => {
  assert.equal(issue.eligible(rec('r', quoteFields())).reqNo, 'Q-20261111-ABC');
  assert.ok(issue.eligible(rec('r', quoteFields({ [Q.memo]: '손으로 만든 견적' }))).skip);
  assert.ok(issue.eligible(rec('r', quoteFields({ [Q.memo]: quoteFields()[Q.memo] + ' (단가 미정 1개)' }))).skip);
  assert.ok(issue.eligible(rec('r', quoteFields({ [Q.status]: { name: '발송' } }))).skip);
  assert.ok(issue.eligible(rec('r', quoteFields({ [Q.key]: 'already' }))).skip);
  assert.ok(issue.eligible(rec('r', quoteFields(), '2026-01-01T00:00:00Z')).skip);
});

test('quote-issue sends the quote alimtalk with the customer link and marks it sent', async () => {
  process.env.SOLAPI_API_KEY = 'k'; process.env.SOLAPI_API_SECRET = 's'; process.env.SOLAPI_PFID = 'pf'; process.env.SOLAPI_TEMPLATE_ID = 'receipt';
  try {
    await withFetch(async (u, method, body) => {
      if (u.hostname === 'api.solapi.com') return { json: { ok: 1 } };
      if (u.pathname.endsWith('/tblj74vsSha7drqmj/recQUOTE000000001')) return { json: rec('recQUOTE000000001', quoteFields()) };
      if (u.pathname.endsWith('/tbllSGZWApKiMTNOK')) {
        assert.equal(u.searchParams.get('filterByFormula'), "{요청번호}='Q-20261111-ABC'");
        return { json: { records: [rec('recREQ', { [R.memo]: '[주문 링크 h5IMKFPxIbES6Ci6KzPgeP] 공동수입', [R.phone]: '010-1234-5678', [R.who]: '금성농원' })] } };
      }
      if (method === 'PATCH') return { json: { records: body.records } };
      throw new Error('unexpected ' + u);
    }, async (calls) => {
      const res = mockRes();
      await issue({ method: 'POST', headers: {}, body: { id: 'recQUOTE000000001' } }, res);
      assert.equal(res.statusCode, 200, JSON.stringify(res.body)); assert.equal(res.body.issued, true);
      const sms = calls.find((c) => c.url.hostname === 'api.solapi.com').body.message;
      assert.equal(sms.to, '01012345678'); assert.equal(sms.kakaoOptions.templateId, 'KA01TP2611111406219602fDBDCJiYei');
      const key = sms.kakaoOptions.variables['#{링크}'];
      assert.match(key, doc.KEY_RE);
      const patches = calls.filter((c) => c.method === 'PATCH').map((c) => c.body.records[0].fields);
      assert.equal(patches[0][Q.key], key);
      assert.equal(patches[1][Q.status], '발송'); assert.ok(patches[1][Q.sentAt]);
      assert.match(patches[1][Q.memo], new RegExp(`고객발송 · 알림톡 견적서발행 · 성공 · 고객 링크 https://open-garden.co.kr/q/${key}`));
    });
  } finally { delete process.env.SOLAPI_API_KEY; delete process.env.SOLAPI_API_SECRET; delete process.env.SOLAPI_PFID; delete process.env.SOLAPI_TEMPLATE_ID; }
});

test('quote-issue falls back to the receipt alimtalk while the quote template is not approved', async () => {
  process.env.SOLAPI_API_KEY = 'k'; process.env.SOLAPI_API_SECRET = 's'; process.env.SOLAPI_PFID = 'pf'; process.env.SOLAPI_TEMPLATE_ID = 'receipt';
  try {
    await withFetch(async (u, method, body) => {
      if (u.hostname === 'api.solapi.com') return body.message.kakaoOptions.templateId === 'receipt' ? { json: {} } : { status: 400, json: { errorMessage: '템플릿 미승인' } };
      if (u.pathname.endsWith('/recQUOTE000000001')) return { json: rec('recQUOTE000000001', quoteFields()) };
      if (u.pathname.endsWith('/tbllSGZWApKiMTNOK')) return { json: { records: [rec('recREQ', { [R.memo]: '[제안서 abc-1234-xyz] 항공', [R.phone]: '01012345678', [R.who]: 'x', [R.summary]: '1. 수선화' })] } };
      return { json: { records: body.records } };
    }, async (calls) => {
      const res = mockRes();
      await issue({ method: 'POST', headers: {}, body: { id: 'recQUOTE000000001' } }, res);
      assert.equal(res.body.issued, false);
      const last = calls.filter((c) => c.method === 'PATCH').pop().body.records[0].fields;
      assert.equal(last[Q.status], undefined); // '작성' 그대로
      assert.match(last[Q.sentResult], /접수확인 알림톡으로 대신 보냄/);
      const receipt = calls.filter((c) => c.url.hostname === 'api.solapi.com')[1].body.message.kakaoOptions.variables;
      assert.equal(receipt['#{요청번호}'], 'Q-20261111-ABC');
    });
  } finally { delete process.env.SOLAPI_API_KEY; delete process.env.SOLAPI_API_SECRET; delete process.env.SOLAPI_PFID; delete process.env.SOLAPI_TEMPLATE_ID; }
});

test('quote-issue ignores catalog requests', async () => {
  await withFetch(async (u) => {
    if (u.pathname.endsWith('/recQUOTE000000001')) return { json: rec('recQUOTE000000001', quoteFields()) };
    if (u.pathname.endsWith('/tbllSGZWApKiMTNOK')) return { json: { records: [rec('recREQ', { [R.memo]: '거래 유형: 해외 식물 수입', [R.phone]: '01012345678' })] } };
    throw new Error('must not write');
  }, async () => {
    const res = mockRes();
    await issue({ method: 'POST', headers: {}, body: { id: 'recQUOTE000000001' } }, res);
    assert.equal(res.body.skipped, '주문서 주문 아님');
  });
});

const KEY = 'AbCdEfGhIjKlMnOpQrSt_-';
const keyedRoute = (fields) => async (u, method, body) => {
  if (method === 'PATCH') return { json: { records: body.records } };
  const f = u.searchParams.get('filterByFormula') || '';
  if (f === `{고객링크키}='${KEY}'`) return { json: { records: [rec('recKEYED', { ...fields, [Q.key]: KEY })] } };
  if (f.includes("{견적번호}='OG-20261111-001'")) return { json: { records: [rec('recKEYED', { ...fields, [Q.key]: KEY })] } };
  throw new Error('unexpected ' + u);
};

test('quote page renders escaped items, totals and noindex', async () => {
  await withFetch(keyedRoute(quoteFields({ [Q.status]: { name: '발송' } })), async () => {
    const res = mockRes();
    await view({ method: 'GET', query: { key: KEY } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(res.body, /OG-20261111-001/); assert.match(res.body, /₩1,101,100/); assert.match(res.body, /이대로 확정하기/);
    assert.ok(!res.body.includes('<script>x</script>')); assert.ok(!res.body.includes('어딘가 주소')); // 품목 이스케이프 · 공급자 주소 비노출
  });
  const res = mockRes();
  await view({ method: 'GET', query: { key: 'short' } }, res);
  assert.equal(res.statusCode, 404);
});

test('customer confirm marks the quote accepted; change needs a note', async () => {
  await withFetch(keyedRoute(quoteFields({ [Q.status]: { name: '발송' } })), async (calls) => {
    const res = mockRes();
    await reply({ method: 'POST', body: { key: KEY, action: 'confirm' } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const f = calls.find((c) => c.method === 'PATCH').body.records[0].fields;
    assert.equal(f[Q.status], '수락'); assert.equal(f[Q.reply], '확정'); assert.ok(f[Q.replyAt]);
    assert.match(f[Q.memo], /· 고객 · 확정 · /);
  });
  const res = mockRes();
  await reply({ method: 'POST', body: { key: KEY, action: 'change', memo: '' } }, res);
  assert.equal(res.statusCode, 400);
  await withFetch(keyedRoute(quoteFields({ [Q.status]: { name: '발송' } })), async (calls) => {
    const r2 = mockRes();
    await reply({ method: 'POST', body: { key: KEY, action: 'change', memo: '라임라이트 400주로' } }, r2);
    assert.equal(r2.statusCode, 200);
    const f = calls.find((c) => c.method === 'PATCH').body.records[0].fields;
    assert.equal(f[Q.status], undefined); assert.match(f[Q.replyText], /수정요청: 라임라이트 400주로/);
  });
});

test('order-link orders skip the immediate receipt alimtalk (quote-issue sends one message instead)', async () => {
  process.env.SOLAPI_API_KEY = 'k'; process.env.SOLAPI_API_SECRET = 's'; process.env.SOLAPI_PFID = 'pf'; process.env.SOLAPI_TEMPLATE_ID = 'receipt';
  const handler = require('../api/quote');
  try {
    await withFetch(async (u) => (u.hostname === 'api.airtable.com' ? { json: {} } : { json: {} }), async (calls) => {
      const res = mockRes();
      await handler({ method: 'POST', body: { name: 'x', phone: '01012345678', memo: '[주문 링크 h5IMKFPxIbES6Ci6KzPgeP] 공동수입', agree: true, items: [{ sku: 'a:b', kname: 'n @₩1 = ₩1', qty: 1 }] } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(calls.filter((c) => c.url.hostname === 'api.solapi.com').length, 0);
    });
    await withFetch(async () => ({ json: {} }), async (calls) => {
      const res = mockRes();
      await handler({ method: 'POST', body: { name: '농장', phone: '01012345678', inquiryType: 'sourcing', budget: '1', timing: '1', agree: true, items: [{ sku: 'a', kname: 'n', qty: 1 }] } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(calls.filter((c) => c.url.hostname === 'api.solapi.com').length, 1);
    });
  } finally { delete process.env.SOLAPI_API_KEY; delete process.env.SOLAPI_API_SECRET; delete process.env.SOLAPI_PFID; delete process.env.SOLAPI_TEMPLATE_ID; }
});
