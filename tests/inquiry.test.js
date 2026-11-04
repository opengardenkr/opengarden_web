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
