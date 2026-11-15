const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

test('new hero version refreshes stale bulk photos; explicit farm selection wins', async () => {
  const oldFetch = global.fetch;
  const oldBase = process.env.AIRTABLE_BASE_ID;
  const oldToken = process.env.AIRTABLE_TOKEN;
  process.env.AIRTABLE_BASE_ID = 'appTEST0000000000';
  process.env.AIRTABLE_TOKEN = 'test-only';
  const id = 'rec00000000000001';
  const hero = { id: 'attHHHHHHHHHHHHH1', filename: 'cc_hero.jpg', url: 'https://v5.airtableusercontent.com/hero' };
  const farm = { id: 'attFFFFFFFFFFFFF1', filename: 'cc_farm.jpg', url: 'https://v5.airtableusercontent.com/farm' };
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00ff00' } }).png().toBuffer();
  const requested = [];
  let recordReads = 0;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('https://api.airtable.com/')) {
      if (new URL(url).pathname.endsWith('/' + id)) {
        recordReads++;
        return Response.json({ fields: { fldMICze7bTZ6zAMa: [hero], fldkieDK6VuDl3bkW: [farm] } });
      }
      return Response.json({ records: [{ id, fields: { fldkieDK6VuDl3bkW: [farm] } }] });
    }
    requested.push(url);
    return new Response(image, { headers: { 'content-type': 'image/png' } });
  };
  const call = async (query) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, end(body) { this.body = body; return this; } };
    await require('../api/order-photo')({ method: 'GET', query: { id, w: '520', ...query } }, res);
    return res;
  };
  try {
    const result = await call({ v: hero.id });
    assert.equal(result.statusCode, 200);
    assert.equal(requested.at(-1), hero.url);
    assert.equal(recordReads, 1);
    assert.equal(result.headers['Content-Type'], 'image/webp');
    await call({ v: hero.id, a: farm.id });
    assert.equal(requested.at(-1), farm.url);
    const missing = await call({ v: 'attMMMMMMMMMMMMM1' });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.headers['Cache-Control'], undefined);
  } finally {
    global.fetch = oldFetch;
    if (oldBase === undefined) delete process.env.AIRTABLE_BASE_ID; else process.env.AIRTABLE_BASE_ID = oldBase;
    if (oldToken === undefined) delete process.env.AIRTABLE_TOKEN; else process.env.AIRTABLE_TOKEN = oldToken;
  }
});
