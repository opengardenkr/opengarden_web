// POST /api/quote-issue  { id: <견적서 발송 내역 레코드ID> }
// 에어테이블 자동화 '견적서 자동 발행 → 고객 알림톡'이 견적서 줄이 새로 생길 때마다 부른다.
// 주문 링크(/o/)·주문형 제안서(/p/) 주문에서 자동화가 만든 초안만 골라 고객에게 바로 보낸다:
//   고객링크키(22자) 발급 → 알림톡 '견적서발행'(견적서 보기 버튼 = /q/<키>) → 상태 '발송'.
//   그 템플릿이 아직 심사 중이거나 실패하면 기존 '견적접수확인' 알림톡으로 대신 보내고 상태는 '작성'에 둔다.
// 아무나 불러도 할 수 있는 일은 '방금 만든 자동 초안을 그 주문자에게 한 번 보내는 것'뿐이다(아래 검사).
// QUOTE_ISSUE_SECRET 환경변수를 두면 x-og-key 머리글이 같아야 한다.

const doc = require('../lib/quote-doc');
const { sendAlimtalk } = require('../lib/solapi');
const { receiptVars } = require('./quote');
const { Q, R } = doc;

const QUOTE_TEMPLATE = () => (process.env.SOLAPI_QUOTE_TEMPLATE_ID || 'KA01TP2611111406219602fDBDCJiYei').trim(); // 견적서발행 (2026-11-11 심사 요청)
const RECEIPT_TEMPLATE = () => (process.env.SOLAPI_TEMPLATE_ID || '').trim(); // 견적접수확인
const FRESH_MS = 30 * 60000;
const REQ_NO = /웹 견적요청 (Q-\d{8}-[A-Z0-9]{3})/;

/** 보낼 수 있는 자동 초안인가 → { reqNo } 또는 { skip: 사유 } */
function eligible(rec, now = Date.now()) {
  const f = rec.fields || {};
  const memo = doc.str(f[Q.memo]);
  const m = memo.match(REQ_NO);
  if (!m || !/자동초안/.test(memo)) return { skip: '자동 초안 아님' };
  if (/단가 미정/.test(memo)) return { skip: '단가 미정 품목 있음' };
  if (doc.str(f[Q.status]) !== '작성' || f[Q.deleted] === true) return { skip: '작성 상태 아님' };
  if (doc.str(f[Q.key]) || doc.str(f[Q.sentAt])) return { skip: '이미 발송' };
  const born = Date.parse(rec.createdTime || '');
  if (!Number.isFinite(born) || now - born > FRESH_MS) return { skip: '오래된 견적' };
  if (!(Number(f[Q.total]) > 0)) return { skip: '합계 0원' };
  return { reqNo: m[1] };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const secret = (process.env.QUOTE_ISSUE_SECRET || '').trim();
  if (secret && req.headers['x-og-key'] !== secret) return res.status(403).json({ error: 'forbidden' });
  const id = req.body && typeof req.body.id === 'string' ? req.body.id : '';
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ error: 'id' });
  try {
    const rec = await doc.getQuote(id);
    const ok = eligible(rec);
    if (ok.skip) return res.status(200).json({ ok: true, skipped: ok.skip });

    // 원래 주문(견적요청): 주문 링크·제안서 주문만, 받는 번호는 고객이 직접 적은 번호
    const reqs = await doc.airtable(doc.REQ_TABLE, {
      params: { returnFieldsByFieldId: 'true', filterByFormula: `{요청번호}='${ok.reqNo}'`, maxRecords: '1', 'fields[]': Object.values(R) },
    });
    const order = (reqs.records || [])[0];
    const of = order ? order.fields || {} : {};
    if (!order || !doc.ORDER_MEMO.test(doc.str(of[R.memo]))) return res.status(200).json({ ok: true, skipped: '주문서 주문 아님' });
    const phone = doc.str(of[R.phone]);
    const name = doc.str(of[R.who]);

    const key = doc.newKey();
    await doc.patchQuote(id, { [Q.key]: key }); // 먼저 키를 걸어 두 번 보내지 않게
    const v = doc.viewOf(rec);
    const link = `${doc.SITE}/q/${key}`;

    let result = '';
    let issued = false;
    try {
      const r = await sendAlimtalk({ to: phone, templateId: QUOTE_TEMPLATE(), variables: doc.issueVars(v, { name, key }) });
      if (r.skipped) result = '건너뜀 · 솔라피 설정 없음';
      else { issued = true; result = '알림톡 견적서발행 · 성공'; }
    } catch (e) {
      const why = String(e.message || e).slice(0, 120);
      try {
        const r = await sendAlimtalk({ to: phone, templateId: RECEIPT_TEMPLATE(), variables: receiptVars({ no: ok.reqNo, name, summary: doc.issueVars(v, { name, key })['#{품목요약}'] }) });
        result = r.skipped ? `실패 · ${why}` : `견적서발행 실패 → 접수확인 알림톡으로 대신 보냄 · ${why}`;
      } catch (e2) {
        result = `실패 · ${why} / 접수확인도 실패 · ${String(e2.message || e2).slice(0, 80)}`;
      }
    }

    const now = new Date();
    const fields = {
      [Q.sentResult]: result.slice(0, 250),
      [Q.memo]: doc.prepend(doc.str(rec.fields[Q.memo]), doc.memoLine('자동', '고객발송', `${result} · 고객 링크 ${link}`, now)),
    };
    if (!result.startsWith('실패') && !result.startsWith('건너뜀')) fields[Q.sentAt] = now.toISOString();
    if (issued) fields[Q.status] = '발송';
    await doc.patchQuote(id, fields);
    return res.status(200).json({ ok: true, issued, result });
  } catch (e) {
    console.error('quote-issue failed:', e.message);
    return res.status(500).json({ error: 'issue failed' });
  }
};

module.exports.eligible = eligible;
