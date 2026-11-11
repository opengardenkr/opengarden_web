// POST /api/quote
// body: { name, phone, memo, items: [{ sku, kname, size, qty }], website }
// 구조(2026-07-19 확정): 고객은 품목+연락처만 접수하면 끝, 연락은 오픈가든이 먼저 한다.
// phone(연락처)은 필수 — 이게 없으면 응대 자체가 불가능하므로 서버에서도 검증.
// website 필드는 honeypot(봇 트랩) — 사람에게는 보이지 않는 입력칸.
// 값이 차 있으면 봇이므로 조용히 성공 응답만 하고 기록하지 않습니다.

const { qualifyInquiry } = require('../lib/inquiry');
const { sendAlimtalk, clip } = require('../lib/solapi');

const BASE = process.env.AIRTABLE_BASE_ID;
const QTABLE = process.env.AIRTABLE_QUOTE_TABLE || '견적요청';
const TOKEN = process.env.AIRTABLE_TOKEN;
const { ORDER_MEMO } = require('../lib/quote-doc');

// ── 솔라피 알림톡: 접수 확인 메시지를 고객 폰으로 발송 ──
// 환경변수(SOLAPI_*)가 하나라도 없으면 조용히 건너뜀 → 미설정 상태에서도 접수는 정상 동작.
// 승인 템플릿(견적접수확인, SOLAPI_TEMPLATE_ID) 변수: #{요청번호} #{요청자} #{품목요약}
const receiptVars = ({ no, name, summary }) => ({
  '#{요청번호}': no,
  '#{요청자}': name && name.trim() ? name.trim().slice(0, 40) : '고객',
  '#{품목요약}': clip(summary, 800, '\n…(그 외 품목은 상담 시 확인)'),
});
async function sendReceipt({ phone, no, name, summary }) {
  return sendAlimtalk({ to: phone, templateId: (process.env.SOLAPI_TEMPLATE_ID || '').trim(), variables: receiptVars({ no, name, summary }) });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }
  try {
    if (!BASE || !TOKEN) {
      return res.status(500).json({ error: '환경변수가 설정되지 않았습니다.' });
    }
    const {
      name = '', phone = '', memo = '', items = [],
      agree = false, marketing = false, website = '',
    } = req.body || {};

    if (website) return res.status(200).json({ ok: true }); // 봇 무시
    if (!Array.isArray(items)) return res.status(400).json({ error: '품목 정보를 확인해주세요.' });
    if (items.length === 0 && (typeof memo !== 'string' || !memo.trim())) {
      return res.status(400).json({ error: '찾는 식물이나 문의 내용을 적어주세요.' });
    }
    // 개인정보 수집·이용 동의 없이는 접수 불가 (클라이언트 우회 방지)
    if (agree !== true) {
      return res.status(400).json({ error: '개인정보 수집·이용 동의가 필요합니다.' });
    }
    const cleanPhone = String(phone).replace(/[^\d\-+() ]/g, '').slice(0, 30);
    if (cleanPhone.replace(/\D/g, '').length < 9) {
      return res.status(400).json({ error: '연락처를 확인해주세요.' });
    }

    // 주문 링크(/o/)·주문형 제안서(/p/)의 주문은 품목·단가가 정해진 고객 전용 주문서라 사업자 확인 문항(거래 유형·예산·시기)이 없다.
    // 그 문항은 웹 카탈로그 문의에만 묻는다. (2026-11-04 도입 때 주문서 접수까지 막혀 2026-11-11 고침)
    const fromOrder = typeof memo === 'string' && ORDER_MEMO.test(memo) && items.length > 0;
    const qualification = fromOrder ? { memo: memo.trim().slice(0, 1000) } : qualifyInquiry(req.body);
    if (qualification.error) return res.status(400).json({ error: qualification.error });

    // 입력값 정리 (길이 제한 + 수량 범위 강제)
    const clean = items.slice(0, 100).map((i) => ({
      sku: String(i.sku || '').slice(0, 50),
      kname: String(i.kname || '').slice(0, 100),
      size: String(i.size || '').slice(0, 30),
      qty: Math.max(1, Math.min(100000, parseInt(i.qty, 10) || 1)),
    }));

    // 요청번호: Q-YYYYMMDD-XXX
    const no =
      'Q-' +
      new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      '-' +
      Math.random().toString(36).slice(2, 5).toUpperCase();

    const summary = clean
      .map((i, n) => `${n + 1}. ${i.kname} · ${i.size} · ${i.qty}개`)
      .join('\n') || `직접 문의: ${String(memo).trim().slice(0, 500)}`;

    const r = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(QTABLE)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                요청번호: no,
                요청자: String(name).slice(0, 100),
                연락처: cleanPhone,
                요청사항: qualification.memo,
                품목요약: summary,
                품목JSON: JSON.stringify(clean),
                상태: '신규',
                접수일시: new Date().toISOString(), // 접수 시각 (에어테이블이 KST로 표시)
                개인정보동의: true,            // 위에서 검증됨 (미동의 시 접수 차단)
                마케팅수신동의: marketing === true,
              },
            },
          ],
        }),
      }
    );
    if (!r.ok) throw new Error(`Airtable ${r.status}`);

    // 접수 확인 알림톡 발송 — 실패해도 접수 자체는 성공으로 응답 (기록은 이미 완료됨)
    // 주문 링크·제안서 주문은 여기서 보내지 않는다: 에어테이블 자동화가 견적서 초안을 만들면
    // /api/quote-issue가 견적서 링크가 든 알림톡을 한 통 보낸다(실패하면 그쪽이 이 접수 확인으로 대신 보낸다).
    if (!fromOrder) {
      try {
        await sendReceipt({ phone: cleanPhone, no, name, summary });
      } catch (e) {
        console.error('alimtalk send failed:', e.message);
      }
    }

    res.status(200).json({ ok: true, requestNo: no });
  } catch (e) {
    res.status(500).json({
      error: '접수에 실패했습니다. 카카오톡 채널로 직접 문의해주세요.',
    });
  }
};

module.exports.receiptVars = receiptVars;
