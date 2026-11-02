const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSections, renderPage, unitOf } = require('../lib/order-page');
const { toItems } = require('../api/order-page');

const items = {
  v: 1,
  items: [
    { k: 'a0', group: 'preorder', rec: 'recAAAAAAAAAAAAAA', photo: true, grp: '알리움', name: '퍼플 <b>', unit: '구', step: 100, rows: [['12/14', 2400, 500, 300]] },
    { k: 'a1', group: 'nope', rec: 'bad', photo: true, grp: '목수국', name: '리빙', unit: '주', step: 7, rows: [['P9', null, 4500, 0], ['', 1, 1, 0], ['P12', 5, 0, 0]] },
    { k: 'a2', name: '', rows: [['X', 1, 1, 0]] },
  ],
};

test('order link items are cleaned before rendering', () => {
  const out = toItems(JSON.stringify(items));
  assert.equal(out.length, 2);
  assert.equal(out[0].img, '/api/plant-image?group=preorder&id=recAAAAAAAAAAAAAA&index=0&w=520');
  assert.equal(out[1].img, '');            // 알 수 없는 공급처·레코드는 사진 없이
  assert.equal(out[1].step, 10);           // 허용 밖 단위 수량은 기본값
  assert.deepEqual(out[1].rows, [['P9', null, 4500, 0]]); // 규격 없거나 가격 0인 줄은 버림
  assert.throws(() => toItems('{"v":2}'));
});

test('cards escape text and carry unit, step, stock cap and prefill', () => {
  const { nav, sections } = renderSections({ items: toItems(JSON.stringify(items)) });
  assert.match(nav, /data-to="g-g0"/);
  assert.ok(!sections.includes('<b>'));
  assert.match(sections, /data-max="2400" data-step="100" data-unit="구" data-qty="300"/);
  assert.match(sections, /data-max="" data-step="10" data-unit="주"/);
  assert.equal((sections.match(/class="all"/g) || []).length, 1); // 재고 없는 규격엔 전량 버튼 없음
  assert.equal(unitOf([{ unit: '구' }, { unit: '주' }]), '');
});

test('page fills every placeholder', () => {
  const spec = { title: '테스트', date: '2026. 10. 30', basis: '기준', items: toItems(JSON.stringify(items)) };
  const { nav, sections } = renderSections(spec);
  const html = renderPage(spec, { word: '주문', unit: '', nav, pageUrl: 'https://x/o/a', ogImage: 'https://x/og.jpg', ogDim: true, secure: sections, terms: [], notice: [], cfg: { pid: 'a' } });
  assert.ok(!/%%[A-Z]+%%/.test(html));
  assert.match(html, /<section class="terms" hidden>/);
  assert.match(html, /"word":"주문"/);
});

test('hand-made links keep proposal photos, features, stock floors and group order', () => {
  const { toGroups } = require('../api/order-page');
  const raw = JSON.stringify({ v: 1, groups: [['알리움', 'Allium'], ['bad', '한글']], items: [
    { k: 'ps', grp: '알리움', name: '퍼플', img: '/p/air-20261028-aff57e25/img/ps.jpg', size: '중형', head: '화구 8~10cm', h: [70, 90], feat: ['a', 'b', 'c', 'd'], rows: [['12/14', 400, 500, 0]] },
    { k: 'dm', grp: '수선화', name: '더치', img: 'https://evil.example/x.jpg', note: '16/18만 보유', rows: [['16/18', '9,600+', 1000, 0], ['14/16', '9600', 900, 0]] },
  ] });
  const items = toItems(raw);
  assert.equal(items[0].img, '/p/air-20261028-aff57e25/img/ps.jpg');
  assert.equal(items[1].img, '');
  assert.deepEqual(items[0].h, [70, 90]);
  assert.equal(items[0].feat.length, 3);
  assert.deepEqual(items[1].rows, [['16/18', '9,600+', 1000, 0], ['14/16', null, 900, 0]]);
  assert.deepEqual(toGroups(raw), [['알리움', 'Allium']]);
  const { nav, sections } = renderSections({ groups: toGroups(raw), items });
  assert.match(nav, /data-to="g-allium"/);
  assert.match(nav, /수선화/); // 지정하지 않은 묶음도 빠지지 않는다
  assert.match(sections, /재고 9,600구 이상/);
  assert.match(sections, /키 70~90cm/);
});
