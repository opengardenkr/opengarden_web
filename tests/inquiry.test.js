const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.AIRTABLE_BASE_ID = 'test-base';
process.env.AIRTABLE_TOKEN = 'test-token';
const handler = require('../api/quote');
const { qualifyInquiry } = require('../lib/inquiry');
const valid = { name: '테스트 농장', phone: '01000000000', inquiryType: 'sourcing', budget: '500만원', timing: '일정 협의', referral: 'AI', agree: true, items: [{ sku: 'test', kname: '테스트', qty: 100 }] };
test('personal, missing information cannot create leads', async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('must not contact external services'); };
  try {
    for (const changes of [{ inquiryType: 'personal' }, { inquiryType: '' }, { name: '' }, { budget: '' }, { timing: '' }]) {
      let status, data;
      await handler({ method: 'POST', body: { ...valid, ...changes } }, { status(n) { status = n; return this; }, json(d) { data = d; } });
      assert.equal(status, 400); assert.ok(data.error);
    }
  } finally { global.fetch = original; }
});
test('qualified business inquiry stores qualification in existing Airtable memo field', async () => {
  const original = global.fetch;
  let fields, status, result;
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.airtable.com');
    fields = JSON.parse(options.body).records[0].fields;
    return { ok: true };
  };
  try {
    await handler({ method: 'POST', body: valid }, { status(n) { status = n; return this; }, json(d) { result = d; } });
    assert.equal(status, 200); assert.ok(result.requestNo);
    assert.match(fields.요청사항, /해외 식물 수입/);
    assert.match(fields.요청사항, /예산: 500만원/);
    assert.match(fields.요청사항, /유입 경로: AI/);
    for (const inquiryType of ['domestic', 'scheduled', 'sourcing']) assert.ok(!qualifyInquiry({ ...valid, inquiryType }).error);
    assert.ok(qualifyInquiry({ ...valid, memo: 'x'.repeat(3000) }).memo.length < 1000);
  } finally { global.fetch = original; }
});

test('inquiry without catalog items saves the message and rejects empty requests', async () => {
  const original = global.fetch;
  let fields, status, result;
  global.fetch = async (_url, options) => {
    fields = JSON.parse(options.body).records[0].fields;
    return { ok: true };
  };
  try {
    const response = { status(n) { status = n; return this; }, json(d) { result = d; } };
    await handler({ method: 'POST', body: { ...valid, items: [], memo: '목록에 없는 수국 200주 문의' } }, response);
    assert.equal(status, 200);
    assert.ok(result.requestNo);
    assert.equal(fields.품목JSON, '[]');
    assert.match(fields.품목요약, /목록에 없는 수국 200주/);
    assert.match(fields.요청사항, /목록에 없는 수국 200주/);
    fields = undefined;
    await handler({ method: 'POST', body: { ...valid, items: [], memo: '   ' } }, response);
    assert.equal(status, 400);
    assert.equal(fields, undefined);
  } finally { global.fetch = original; }
});
test('order link and proposal orders are accepted without catalog qualification questions', async () => {
  const original = global.fetch;
  const sent = [];
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'api.airtable.com');
    sent.push(JSON.parse(options.body).records[0].fields);
    return { ok: true };
  };
  try {
    for (const memo of ['[주문 링크 h5IMKFPxIbES6Ci6KzPgeP] 호게나르드 공동수입 (2026. 11. 6)\n합계 ₩1,000,000 (VAT 별도)', '[제안서 abc-1234-xyz] 항공 구근 (2026. 11. 1)\n합계 ₩500 (VAT 별도)']) {
      let status, result;
      const body = { name: '금성농원', phone: '010-1234-5678', memo, agree: true, marketing: false, website: '', items: [{ sku: 'x:1', kname: '목수국 @₩5,000 = ₩1,000,000', size: 'P9', qty: 200 }] };
      await handler({ method: 'POST', body }, { status(n) { status = n; return this; }, json(d) { result = d; } });
      assert.equal(status, 200, JSON.stringify(result)); assert.ok(result.requestNo);
    }
    assert.equal(sent.length, 2);
    assert.match(sent[0].요청사항, /^\[주문 링크 h5IMKFPxIbES6Ci6KzPgeP\]/);
    assert.match(sent[1].요청사항, /^\[제안서 abc-1234-xyz\]/);
  } finally { global.fetch = original; }
});
test('catalog inquiries pretending to be orders without items still need qualification', async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error('must not contact external services'); };
  try {
    let status;
    await handler({ method: 'POST', body: { name: 'x', phone: '01000000000', agree: true, memo: '[주문 링크 h5IMKFPxIbES6Ci6KzPgeP] x', items: [] } }, { status(n) { status = n; return this; }, json() {} });
    assert.equal(status, 400);
  } finally { global.fetch = original; }
});
