const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { poolItems, catOf, cleanLatin, GROUPS, FIELDS: F, INFO_FIELDS: INFO } = require('../lib/hg-pool');
const { qtyRule } = require('../api/order-page');
const { renderSections, renderPage, card } = require('../lib/order-page');

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
  assert.equal(h.imgBig, `/api/order-photo?id=${M1}&w=1600`);
  assert.equal(h.genus, 'Hydrangea pan');
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
  assert.deepEqual(qtyRule({ minEach: 200, minTotal: 600, step: 40 }), { minEach: 200, minTotal: 600, step: 40 });
  assert.deepEqual(qtyRule({ minEach: 200, step: 0.5 }), { minEach: 200, minTotal: 0 });
});

test('주문서 묶음 PBR tags the card (no PBR tab); 주문서 정렬 places a card; P8 sorts first', () => {
  const r = (id, latin, kname, size, extra) => ({ id, fields: { [F.pool]: true, [F.sname]: latin, [F.kname]: kname, [F.size]: size, [F.price]: 4900, [F.master]: ['recM' + id.slice(4)], ...extra } });
  const recs = [
    r('rec000000000000a1', "Hydrangea pan. Living 'Infinity'® NEW", "목수국 '리빙 인피니티'", 'P9', { [F.bundle]: 'PBR' }),
    r('rec000000000000a2', "Hydrangea pan. 'Diamant Rouge'", "목수국 '디아망 루즈'", 'P9', {}),
    r('rec000000000000a3', "Hydrangea pan. 'Framboisine'", "목수국 '프랑부아진'", 'P8', { [F.sortKey]: "목수국 '디아망 루즈' 2" }),
    r('rec000000000000a4', "Hydrangea pan. 'Bobo'", "목수국 '보보'", 'P9', {}),
    r('rec000000000000a5', "Weigela 'Spirit' PBR", "병꽃나무 '스피릿'", 'P9', { [F.bundle]: { name: 'PBR' } }),
  ];
  // 같은 품종의 두 번째 규격 줄이 묶음이 아니어도 라이선스 품종이다
  recs.push({ id: 'rec000000000000a6', fields: { ...recs[4].fields, [F.size]: 'P12' } });
  recs[5].fields[F.bundle] = undefined;
  recs.push({ id: 'rec000000000000a7', fields: { ...recs[2].fields, [F.size]: 'P9' } });
  const items = poolItems(recs).filter((x) => x.kind !== 'info');
  assert.equal(items.find((x) => /인피니티/.test(x.name)).grp, '수국');
  assert.equal(items.find((x) => /인피니티/.test(x.name)).lic, 1);
  assert.equal(items.find((x) => /스피릿/.test(x.name)).grp, '꽃관목');
  assert.equal(items.find((x) => /스피릿/.test(x.name)).lic, 1);
  assert.equal(items.find((x) => /보보/.test(x.name)).lic, undefined);
  const hyd = items.filter((x) => x.grp === '수국').map((x) => x.name);
  assert.deepEqual(hyd, ["목수국 '디아망 루즈'", "목수국 '프랑부아진'", "목수국 '리빙 인피니티'", "목수국 '보보'"]);
  assert.deepEqual(items.find((x) => /프랑부아진/.test(x.name)).rows.map((x) => x[0]), ['P8', 'P9']);
  assert.ok(items.every((x) => !('sort' in x) && !('bundle' in x)));
  assert.ok(GROUPS.every(([g]) => !/PBR/.test(g)));
  // 카드: 라이선스 태그, 사진 없는 품종은 '사진 준비 중' 칸
  const html = card({ ...items.find((x) => /스피릿/.test(x.name)), k: 'x1' }, {});
  assert.match(html, /tag lic">증식 금지/);
  assert.match(html, /c-photo c-none"><span>사진 준비 중/);
  assert.equal(cleanLatin("Syringa m. 'Flowerfesta'® PinkPBR"), "Syringa m. 'Flowerfesta'® Pink");
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

test('genus info card goes before 2+ varieties of the same genus, with stats and editable lines', () => {
  const r = (id, latin, price, h) => ({ id, fields: { [F.pool]: true, [F.sname]: latin, [F.kname]: latin, [F.size]: 'P9', [F.price]: price, [F.master]: [id.replace('x', 'M')], [F.hmin]: [h[0]], [F.hmax]: [h[1]] } });
  const recs = [r('rec0000000000000x1', "Berberis thunb. 'A'", 3900, [40, 60]), r('rec0000000000000x2', "Berberis thunb. 'B'", 4500, [80, 120]), r('rec0000000000000x3', "Spiraea japonica 'C'", 3900, [30, 50])];
  const info = [{ id: 'recI', fields: { [INFO.key]: 'Berberis', [INFO.title]: '매자나무 (Berberis)', [INFO.lines]: '줄1\n줄2', [INFO.on]: true } }];
  const items = poolItems(recs, info);
  const i0 = items.findIndex((x) => x.kind === 'info');
  assert.equal(items.filter((x) => x.kind === 'info').length, 1); // 1품종짜리 수종은 안내 카드 없음
  assert.equal(items[i0 + 1].genus, 'Berberis');
  assert.deepEqual(items[i0].lines, ['줄1', '줄2']);
  assert.equal(items[i0].name, '매자나무 (Berberis)');
  assert.deepEqual(items[i0].stats, { n: 2, h: [40, 120], p: [3900, 4500] });
  const html = renderSections({ title: 't', groups: GROUPS, items }).sections;
  assert.match(html, /class="card info" data-genus="Berberis"/);
  assert.match(html, /2품종 · 키 40~120cm · ₩3,900~₩4,500/);
  assert.match(html, /꽃관목<\/span><small>Shrubs · 1품종/); // 안내 카드는 품종 수에 안 들어감
});

test('photo order: hero first, farm display photo second, supplier after; credit only with hero', () => {
  const { gallery } = require('../lib/hg-pool');
  const sup1 = { id: 'attSSSSSSSSSSSSS1', filename: 'public' }, sup2 = { id: 'attSSSSSSSSSSSSS2', filename: 'public' };
  const farm = { id: 'attFFFFFFFFFFFFF1', filename: 'HG26_0445_20261007_134924.jpg' };
  const hero = { id: 'attHHHHHHHHHHHHH1', filename: "cc_Hydrangea 'Tovelit'.jpg" };
  assert.deepEqual(gallery([hero], [sup1, farm, sup2]).map((a) => a.kind), ['hero', 'farm', 'sup', 'sup']);
  assert.deepEqual(gallery([], [sup1, sup2, farm]).map((a) => a.id), [sup1.id, farm.id, sup2.id]); // 대표사진 없으면 매대 실사가 2번째
  assert.deepEqual(gallery(null, [farm]).map((a) => a.kind), ['farm']);
  const rec2 = rec('rec00000000000009', { [F.pool]: true, [F.sname]: "Hydrangea m. 'Tovelit'", [F.kname]: "수국 '토벨리트'", [F.size]: 'P9', [F.price]: 4500, [F.master]: [M1],
    [F.hero]: [hero], [F.credit]: ['사진: A / Wikimedia Commons · CC BY-SA 4.0'], [F.photo]: [sup1, farm] });
  const [it] = poolItems([rec2]);
  assert.equal(it.img, `/api/order-photo?id=${M1}&w=520&v=${hero.id}`);
  assert.deepEqual(it.gal, ['h.' + hero.id, 'f.' + farm.id, 's.' + sup1.id]);
  assert.equal(it.credit, '사진: A / Wikimedia Commons · CC BY-SA 4.0');
  const html = renderSections({ title: 't', groups: GROUPS, items: [it] }).sections;
  assert.match(html, /data-g="h\.attHHHHHHHHHHHHH1 f\.attFFFFFFFFFFFFF1 s\.attSSSSSSSSSSSSS1"/);
  assert.match(html, /data-cr="사진: A/);
  assert.match(html, /class="c-ref">참고 사진/);
  const [noHero] = poolItems([rec('rec0000000000000a', { ...rec2.fields, [F.hero]: [] })]);
  assert.equal(noHero.credit, '');
  // 공급사 사진도 '참고 사진'(대표사진과 한 이름) — 농장 실사가 있으면 넘겨 보기
  const noHeroHtml = renderSections({ title: 't', groups: GROUPS, items: [noHero] }).sections;
  assert.match(noHeroHtml, /class="c-ref">참고 사진/);
  assert.match(noHeroHtml, /c-swipe/);
});

test('interest picker: genus label from info card title, else most common Korean first word', () => {
  const { genusLabels } = require('../lib/hg-pool');
  const items = [
    { genus: 'Hydrangea pan', name: "목수국 '라임라이트'" }, { genus: 'Cotinus', name: "안개나무 '로얄퍼플'" },
    { genus: 'Cotinus', name: "안개나무 '골든스피릿'" }, { genus: 'Cotinus', name: '자주안개나무' }, { genus: 'Thuja', name: "Thuja occ. 'Danica'" },
  ];
  const info = new Map([['Hydrangea pan', { title: '목수국 (Hydrangea paniculata)' }]]);
  const m = genusLabels(items, info);
  assert.equal(m.get('Hydrangea pan'), '목수국');
  assert.equal(m.get('Cotinus'), '안개나무');
  assert.equal(m.get('Thuja'), 'Thuja');
  const html = renderSections({ items: poolItems(records), groups: GROUPS }).sections;
  assert.match(html, /data-ik="Hydrangea pan" data-il="목수국"/);
});

test('interest survey input is validated and rate-limited', () => {
  const { surveyInput, limited } = require('../api/order-page');
  assert.deepEqual(surveyInput({ picks: ['목수국', '안개나무', '목수국'], visitor: 'abc123def456' }), { picks: ['목수국', '안개나무'], visitor: 'abc123def456' });
  assert.equal(surveyInput({ picks: [] }), null);
  assert.equal(surveyInput({ picks: ['<script>'] }), null);
  assert.equal(surveyInput({ picks: Array.from({ length: 21 }, (_, i) => '수목' + i) }), null);
  assert.equal(surveyInput({ picks: ['목수국'], visitor: 'BAD!' }).visitor, '');
  let hit = false;
  for (let i = 0; i < 11; i++) hit = limited('1.2.3.4', 1000 + i);
  assert.equal(hit, true);
  assert.equal(limited('5.6.7.8', 1000), false);
});

test('cards show a red low-stock tag and a per-variety minimum tag', () => {
  const recs = [
    rec('rec0000000000000a', { [F.pool]: true, [F.sname]: "Hydrangea m. 'Red Baron'", [F.kname]: "수국 '레드바론'", [F.size]: 'P12', [F.price]: 4900, [F.stock]: 51 }),
    rec('rec0000000000000b', { [F.pool]: true, [F.sname]: "Hydrangea pan. 'Framboisine'", [F.kname]: "목수국 '프랑부아진'", [F.size]: 'P8', [F.price]: 6500, [F.minQty]: 1000 }),
    rec('rec0000000000000c', { [F.pool]: true, [F.sname]: "Hydrangea pan. 'Limelight'", [F.kname]: "목수국 '라임라이트'", [F.size]: 'P9', [F.price]: 4900, [F.stock]: 2000 }),
  ];
  const items = poolItems(recs);
  assert.equal(items.find((i) => /프랑부아진/.test(i.name)).min, 1000);
  const html = renderSections({ items, groups: GROUPS }).sections;
  const cardOf = (name) => html.split('<article').find((x) => x.includes(name));
  assert.match(cardOf('레드바론'), /data-cap="51"/);
  assert.match(cardOf('레드바론'), /class="tag low">품절임박</);
  assert.match(cardOf('레드바론'), /data-low="1"/);
  assert.doesNotMatch(cardOf('프랑부아진'), /data-low/);
  assert.match(cardOf('프랑부아진'), /data-min="1000"/);
  assert.match(cardOf('프랑부아진'), /class="tag min">최소 1,000주</);
  assert.doesNotMatch(cardOf('라임라이트'), /class="tag/);
});

test('confirmed quotes hold stock: latest confirmed revision per chain, group prefix stripped, sold-out rows drop', () => {
  const { confirmedTotals, applyReserved } = require('../lib/hg-pool');
  const totals = confirmedTotals([
    { number: 'OG-20261113-002', status: '수주확정', items: [{ name: "수국 목수국 '다루마'", spec: 'P9', qty: 1000 }] },
    { number: 'OG-20261113-002-R2', status: '수주확정', items: [{ name: "수국 목수국 '다루마'", spec: 'P9', qty: 400 }] }, // 최신 수정본만
    { number: 'OG-20261113-003', status: '수락', items: [{ name: "꽃관목 병꽃나무 '스파클'", spec: 'P9', qty: 99 }] }, // 고객 [확정]만 — 입금 전이라 안 뺀다
    { number: 'OG-20261113-004', status: '완료', items: [{ name: "PBR 품종 병꽃나무 '피코벨라로소'", spec: 'P9', qty: 726 }] }, // 옛 탭 이름
    { number: 'OG-20261113-005', status: '입고대기', items: [{ name: "병꽃나무 '앰버'", spec: 'P9', qty: 24 }] }, // 탭 이름 없이
  ]);
  assert.equal(totals.get("수국 목수국 '다루마'|P9"), 400);
  assert.equal(totals.has("꽃관목 병꽃나무 '스파클'|P9"), false);
  const rec = (id, kname, size, st) => ({ id, fields: { [F.kname]: kname, [F.size]: size, [F.stock]: st } });
  const out = applyReserved([rec('r1', "목수국 '다루마'", 'P9', 1183), rec('r2', "병꽃나무 '피코벨라로소'", 'P9', 726),
    rec('r3', "병꽃나무 '앰버'", { name: 'P9' }, 524), rec('r4', "병꽃나무 '스파클'", 'P9', 377)], totals);
  assert.deepEqual(out.map((r) => [r.id, r.fields[F.stock]]), [['r1', 783], ['r3', 500], ['r4', 377]]);
});
