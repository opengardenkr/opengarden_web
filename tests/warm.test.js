const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.AIRTABLE_BASE_ID = 'test-base'; process.env.AIRTABLE_TOKEN = 'test-token';
const { cardPhotos, allowed } = require('../api/warm');

test('warm keeps only card-size photos, unescaped, deduped, in page order', () => {
  const html = `<img src="/api/order-photo?id=recA&amp;w=480&amp;v=att1">
    <a data-big="/api/order-photo?id=recA&amp;w=1600&amp;v=att1"></a>
    <img src="/api/order-photo?id=recB&w=480&a=att2&v=att2"><img src="/api/order-photo?id=recA&amp;w=480&amp;v=att1">
    <img src="/api/plant-image?group=immediate&amp;id=recC&amp;index=0&amp;w=520">`;
  assert.deepEqual(cardPhotos(html), [
    '/api/order-photo?id=recA&w=480&v=att1',
    '/api/order-photo?id=recB&w=480&a=att2&v=att2',
    '/api/plant-image?group=immediate&id=recC&index=0&w=520',
  ]);
});

test('warm accepts only Vercel cron, or the secret when one is set', () => {
  delete process.env.CRON_SECRET;
  assert.equal(allowed({ headers: { 'user-agent': 'vercel-cron/1.0' } }), true);
  assert.equal(allowed({ headers: { 'user-agent': 'curl/8' } }), false);
  process.env.CRON_SECRET = 's3cret';
  assert.equal(allowed({ headers: { 'user-agent': 'vercel-cron/1.0' } }), false);
  assert.equal(allowed({ headers: { authorization: 'Bearer s3cret' } }), true);
  delete process.env.CRON_SECRET;
});
