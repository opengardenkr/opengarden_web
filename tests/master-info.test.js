const test = require('node:test');
const assert = require('node:assert/strict');
const { attachmentsOf, masterInfo, SOURCES } = require('../lib/catalog-data');
const { summary } = require('../public/assets/catalog-info');

const F = SOURCES.hoogenraad.fields;
const att = (id) => ({ id, url: `https://v5.airtableusercontent.com/${id}.jpg` });

test('master photos come first and share the five-photo limit with the row photos', () => {
  const f = { [F.masterImage]: [att('m1'), att('m2')], [F.image]: [att('r1'), att('r2'), att('r3'), att('r4')] };
  assert.deepEqual(attachmentsOf(f, F).map((a) => a.id), ['m1', 'm2', 'r1', 'r2', 'r3']);
  assert.deepEqual(attachmentsOf({ [F.image]: [att('r1')] }, F).map((a) => a.id), ['r1']);
  assert.deepEqual(attachmentsOf({}, F), []);
});

test('master facts are formatted without inventing values', () => {
  const info = masterInfo({
    [F.masterDesc]: ['꽃이 흰색에서 분홍으로 변함\n촘촘한 원뿔형 꽃차례'],
    [F.heightMin]: [90], [F.heightMax]: [120], [F.width]: [100],
    [F.series]: ['Living Creations'], [F.award]: [''], [F.review]: ['AI 초안'],
  }, F);
  assert.equal(info.height, '90–120 cm');
  assert.equal(info.spread, '100 cm');
  assert.equal(info.series, 'Living Creations');
  assert.equal(info.award, '');
  assert.match(info.desc, /원뿔형/);
  assert.equal(masterInfo({ [F.heightMin]: [70], [F.heightMax]: [70] }, F).height, '70 cm');
  assert.equal(masterInfo({}, F).height, '');
});

test('records flagged for review keep their master facts off the site', () => {
  const info = masterInfo({ [F.masterDesc]: ['검증 전 문장'], [F.heightMin]: [50], [F.review]: [{ name: '확인 필요' }] }, F);
  assert.deepEqual(info, {});
});

test('summary appends only known master facts and keeps the four base facts', () => {
  const s = summary({ height: '90–120 cm', series: 'Living Creations' });
  assert.equal(s.facts.length, 6);
  assert.deepEqual(s.facts.slice(4).map((f) => f.label), ['성목 높이', '시리즈']);
  assert.ok(Array.from(s.text).length <= 600);
});

test('master lookup fields never include price fields', () => {
  const priceIds = ['flddWryT0w8bnvmis', 'fld7phSyk71vg8cTj', 'fldVWhwSmfG1HBs0H', 'fldh2LU8RdOMgPh8E', 'fldG0nT3AhhIgQwm8'];
  for (const id of Object.values(F)) assert.ok(!priceIds.includes(id));
});
