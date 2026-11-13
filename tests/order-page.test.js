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
  assert.deepEqual(out[1].rows, [['P9', null, 4500, 0, 0]]); // 규격 없거나 가격 0인 줄은 버림
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
  assert.deepEqual(items[1].rows, [['16/18', '9,600+', 1000, 0, 0], ['14/16', null, 900, 0, 0]]);
  assert.deepEqual(toGroups(raw), [['알리움', 'Allium']]);
  const { nav, sections } = renderSections({ groups: toGroups(raw), items });
  assert.match(nav, /data-to="g-allium"/);
  assert.match(nav, /수선화/); // 지정하지 않은 묶음도 빠지지 않는다
  assert.match(sections, /재고 9,600구 이상/);
  assert.match(sections, /키 70~90cm/);
});

test('crate rows are ordered in crates and sent in bulbs', () => {
  const items = toItems(JSON.stringify({ v: 1, items: [
    { k: 'rm', grp: '알리움', name: '레드 모히칸', rows: [['10/12', 2300, 1900, 0, 1000], ['10/12 잔량', 300, 1900, 0, 300]] },
    { k: 'dm', grp: '수선화', name: '더치마스터', rows: [['16/18', '9,600+', 1000, 0, 160]] },
    { k: 'st', grp: '알리움', name: '스티피타툼', rows: [['14/+', 200, 400, 0]] },
  ] }));
  assert.equal(items[0].rows[0][4], 1000);
  const { sections } = renderSections({ items });
  assert.match(sections, /data-price="1900000" data-bp="1900" data-pack="1000" data-max="2" data-step="1" data-unit="크레이트"/);
  assert.match(sections, /재고 2크레이트</);
  assert.match(sections, /크레이트당 1,000구 · ₩1,900\/구/);
  assert.match(sections, /₩1,900,000<small>\/크레이트<\/small>/);
  assert.match(sections, /재고 60크레이트 이상</);
  assert.match(sections, /data-pack="" data-max="200" data-step="10" data-unit="구"/);
  assert.equal(unitOf(items), '');
});

test('cards with a hero and a farm photo swipe to the farm photo, loaded on demand', () => {
  const A = (c) => 'att' + c.repeat(14);
  const base = { grp: '목수국', unit: '주', step: 10, rows: [['P9', null, 4500, 0]] };
  const { sections } = renderSections({ items: [
    { ...base, key: 'recHEROFARM000001', name: '라임라이트', img: `/api/order-photo?id=recHEROFARM000001&w=800&v=${A('H')}`, gal: [`h.${A('H')}`, `f.${A('F')}`] },
    { ...base, key: 'recFARMONLY000001', name: '바닐라', img: `/api/order-photo?id=recFARMONLY000001&w=800&v=${A('F')}`, gal: [`f.${A('F')}`] },
    { ...base, key: 'recHEROONLY000001', name: '선데', img: `/api/order-photo?id=recHEROONLY000001&w=800&v=${A('H')}`, gal: [`h.${A('H')}`, `s.${A('S')}`] },
  ] });
  const cards = sections.split('<article').slice(1);
  const swipe = cards.find((c) => c.includes('라임라이트'));
  assert.match(swipe, /class="c-photo c-swipe"/);
  assert.ok(swipe.includes(`data-src="/api/order-photo?id=recHEROFARM000001&amp;w=800&amp;a=${A('F')}&amp;v=${A('F')}"`));
  assert.ok(!/class="c-alt" src=/.test(swipe)); // 실사는 넘길 때 받는다
  assert.match(swipe, /농장 실사 ›/);
  const farmOnly = cards.find((c) => c.includes('바닐라'));
  assert.ok(!farmOnly.includes('c-swipe')); assert.match(farmOnly, /<span class="c-ref">농장 실사<\/span>/);
  const heroOnly = cards.find((c) => c.includes('선데'));
  assert.ok(!heroOnly.includes('c-swipe')); assert.match(heroOnly, /다 자란 모습/);
});
