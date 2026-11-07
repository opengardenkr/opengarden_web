const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { poolItems, catOf, cleanLatin, GROUPS, FIELDS: F } = require('../lib/hg-pool');
const { qtyRule } = require('../api/order-page');
const { renderSections, renderPage } = require('../lib/order-page');

const rec = (id, fields) => ({ id, fields });
const M1 = 'recMMMMMMMMMMMMM1';
const records = [
  rec('rec00000000000001', { [F.pool]: true, [F.sname]: "Hydrangea pan. 'Wim's Red'®", [F.kname]: "목수국 '윔스레드'", [F.size]: 'P12', [F.price]: 4900, [F.stock]: 2006, [F.master]: [M1], [F.feat]: ['흰꽃이 분홍·와인색으로 변함\n컴팩트 수형'], [F.hmin]: [120], [F.hmax]: [150], [F.photo]: [{ url: 'https://v5.airtableusercontent.com/x' }] }),
  rec('rec00000000000002', { [F.pool]: true, [F.sname]: "Hydrangea pan. 'Wim's Red'®", [F.kname]: "목수국 '윔스레드'", [F.size]: 'P9', [F.price]: 4500, [F.stock]: 536, [F.master]: [M1] }),
  rec('rec00000000000003', { [F.pool]: true, [F.sname]: "Berberis thunb. 'Erecta'", [F.kname]: "매자나무 '에렉타'", [F.size]: 'P9', [F.price]: 3900, [F.review]: ['확인 필요'], [F.feat]: ['숨길 특징'] }),
  rec('rec00000000000004', { [F.pool]: true, [F.excluded]: true, [F.sname]: "Hydrangea pan. 'Limelight'®", [F.size]: 'P9', [F.price]: 4900 }),
  rec('rec00000000000005', { [F.sname]: 'Thuja occ. Danica', [F.size]: 'P9', [F.price]: 3900 }), // 공동주문 미체크
  rec('rec00000000000006', { [F.pool]: true, [F.sname]: 'Vinca minor', [F.size]: 'P9', [F.price]: 0 }), // 가격 없음
];

test('pool merges sizes of one variety into one card and drops unchecked, excluded or unpriced rows', () => {
  const items = poolItems(records);
  assert.equal(items.length, 2);
  const h = items.find((i) => i.grp === '수국');
  assert.deepEqual(h.rows.map((r) => r[0]), ['P9', 'P12']);
  assert.deepEqual(h.rows[0], ['P9', 536, 4500, 0]);
  assert.deepEqual(h.feat, ['흰꽃이 분홍·와인색으로 변함', '컴팩트 수형']);
  assert.deepEqual(h.h, [120, 150]);
  assert.equal(h.img, `/api/order-photo?id=${M1}&w=520`);
  assert.equal(h.unit, '주');
  const b = items.find((i) => i.grp === '매자나무');
  assert.deepEqual(b.feat, []); // 검토상태 '확인 필요'면 특징을 내보내지 않는다
  assert.equal(b.img, '');
  assert.ok(items.every((i) => /^h[0-9a-z]+$/.test(i.k)));
});

test('groups and latin clean-up', () => {
  assert.equal(catOf("Potentilla f. 'Bella Sol'"), '물싸리');
  assert.equal(catOf('Juniperus hor. Wiltonii'), '침엽수');
  assert.equal(catOf('Heuchera Northern Exposure'), '초화');
  assert.equal(cleanLatin("Weigela 'Picobella Rosa' PBR"), "Weigela 'Picobella Rosa'");
  assert.equal(cleanLatin("Hydrangea pan. 'Minty Spirit'PBR NEW"), "Hydrangea pan. 'Minty Spirit'");
  assert.ok(GROUPS.every((g) => /^[A-Za-z]{2,30}$/.test(g[1])));
});

test('quantity rule only accepts positive integers', () => {
  assert.deepEqual(qtyRule({ minEach: 200, minTotal: 600 }), { minEach: 200, minTotal: 600 });
  assert.deepEqual(qtyRule({ minEach: '200', minTotal: -1 }), { minEach: 0, minTotal: 0 });
});

// 브라우저 로직: 품종당 200주 · 총 600주 미만이면 요청 버튼이 잠긴다
test('order page blocks requests under the per-variety and total minimums', () => {
  const items = poolItems(records);
  const spec = { title: 't', date: '', basis: '', groups: GROUPS, items };
  const { nav, sections } = renderSections(spec);
  const html = renderPage(spec, { word: '주문', unit: '주', nav, pageUrl: 'https://x/o/a', ogImage: 'https://x/og.jpg', secure: sections, terms: [], notice: [], cfg: { pid: 'a', minEach: 200, minTotal: 600, search: true } });
  assert.match(html, /data-k="h1"/);
  assert.match(html, /class="c-warn" hidden/);
  const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});
