const test = require('node:test');
const assert = require('node:assert/strict');
const { renderPrint, pickPrint, pickCover, ruleLine } = require('../lib/print-page');
const { poolItems, FIELDS: F } = require('../lib/hg-pool');

const item = (i, extra) => ({
  key: 'rec' + String(i).padStart(14, '0'), name: `목수국 '품종${i}'`, grp: '관목', glabel: '목수국', unit: '주',
  img: `/api/order-photo?id=rec${String(i).padStart(14, '0')}&w=480&pv=2&v=attAAAAAAAAAAAAAA`,
  gal: ['h.attAAAAAAAAAAAAAA', 'f.attFFFFFFFFFFFFFF'], rows: [['P9', 1200 + i, 3900, 0]], ...extra,
});

test('print: every in-stock variety except 종이 제외 — no page cap', () => {
  const items = [item(1), item(2, { paperOut: 1 }), item(3, { soldout: 1 }), { kind: 'info', name: '수종 안내', rows: [] }, item(4, { rows: [] })];
  assert.deepEqual(pickPrint(items).map((x) => x.name), ["목수국 '품종1'"]);
  const many = Array.from({ length: 470 }, (_, i) => item(i + 1));
  const out = renderPrint({ title: '공동주문', basis: '2026년 11월 재고 기준', items: many }, { minEach: 200, step: 40, minTotal: 600 });
  assert.equal(out.count, 470);
  assert.equal((out.html.match(/<div class="card" /g) || []).length, 470);
  assert.match(out.html, /data-m="all" aria-pressed="true">전체 <span>470<\/span>/);
  assert.match(out.html, /data-t="관목"/); // 주문서 묶음 단추(수국·매자나무…)로 고르는 열쇠
  assert.match(out.html, /♥ 관심/);
  assert.match(out.html, /og-heart/);
});

test('print: card keeps the heart key, shows name without quotes, price, stock and a box per size', () => {
  const html = renderPrint({ title: 'T', basis: 'B', items: [item(1, { rows: [['P9', 1183, 3900, 0], ['P12 (컬러팟)', null, 7500, 0]], lic: 1 })] }).html;
  assert.match(html, /data-hk="rec00000000000001"/);
  assert.match(html, /목수국 품종1/);
  assert.doesNotMatch(html, /목수국 '품종1'/);
  assert.match(html, /P9<\/span> 3,900원<\/b><small>재고 1,183주<\/small>/);
  assert.match(html, /P12 \(컬러팟\)<\/span> 7,500원<\/b><\/div>/); // 재고 모름이면 재고 글 없음
  assert.equal((html.match(/class="box"/g) || []).length, 2);
  assert.match(html, /data-src="\/api\/order-photo\?id=rec00000000000001&amp;w=480&amp;pv=2&amp;v=attAAAAAAAAAAAAAA&amp;f=jpg"/);
  assert.match(html, /증식 금지/);
  assert.match(html, /noindex/);
});

test('print: low stock tag and escaped names', () => {
  const html = renderPrint({ title: '<x>', basis: 'B', items: [item(1, { name: '<b>a</b>', rows: [['P9', 120, 3900, 0]] })] }).html;
  assert.match(html, /품절임박/);
  assert.doesNotMatch(html, /<b>a<\/b>/);
  assert.match(html, /&lt;x&gt;/);
});

test('print: cover farm photos (종이 표지, 3개까지) use the farm attachment and show the size', () => {
  const items = [1, 2, 3, 4].map((i) => item(i, { cover: 1 }));
  items[0].rows = [['P12', 1851, 4900, 0]];
  items.push(item(5, { cover: 1, gal: ['h.attAAAAAAAAAAAAAA'] })); // 농장 실사 없음 → 빼기
  assert.equal(pickCover(items).length, 3);
  const html = renderPrint({ title: 'T', basis: 'B', items }).html;
  assert.match(html, /w=800&amp;f=jpg&amp;a=attFFFFFFFFFFFFFF&amp;v=attFFFFFFFFFFFFFF/);
  assert.match(html, /<b>목수국 품종1<\/b> · P12/);
  assert.match(html, /실제로 나가는 묘목/);
});

test('print: rule line from the link rule', () => {
  assert.equal(ruleLine({ unit: '주', minEach: 200, step: 40, minTotal: 600 }), '품종당 200주부터, 40주 단위 · 전체 600주부터');
  assert.equal(ruleLine({ unit: '주' }), '');
});

test('pool: 종이 제외 · 종이 표지 checkbox on any size row marks the variety', () => {
  const r = (id, size, extra) => ({ id, fields: { [F.pool]: true, [F.sname]: 'Hydrangea paniculata X', [F.kname]: "목수국 'X'", [F.size]: size, [F.price]: 4900, [F.master]: ['recM0000000000001'], ...extra } });
  const items = poolItems([r('rec00000000000001', 'P9'), r('rec00000000000002', 'P12', { [F.paperOut]: true, [F.paperCover]: true })]).filter((x) => x.kind !== 'info');
  assert.equal(items.length, 1);
  assert.equal(items[0].paperOut, 1);
  assert.equal(items[0].cover, 1);
});
