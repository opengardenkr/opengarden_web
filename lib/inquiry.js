const TYPES = { domestic: '국내 재고 도매 구매', scheduled: '정기 수입·사전 예약', sourcing: '별도 해외 소싱·수입' };
const clean = (value, limit = 100) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
function qualifyInquiry(body = {}) {
  if (!Object.hasOwn(TYPES, body.inquiryType)) return { error: '사업용 거래 유형을 선택해주세요. 개인 소량 구매는 스마트스토어를 이용해주세요.' };
  for (const [key, label] of [['name', '담당자 / 업체명'], ['budget', '예상 총예산'], ['timing', '희망 납기']]) {
    if (!clean(body[key])) return { error: `${label}을 입력해주세요.` };
  }
  if (body.termsAccepted !== true) return { error: '사업용 거래 및 비용 조건 확인이 필요합니다.' };
  const referral = ['검색', 'AI', '유튜브', '소개', '기타'].includes(body.referral) ? body.referral : '미선택';
  return { memo: `거래 유형: ${TYPES[body.inquiryType]}\n예산: ${clean(body.budget)}\n납기: ${clean(body.timing)}\n유입 경로: ${referral}\n사업용 거래·비용 조건 확인: 예\n${clean(body.memo, 500)}` };
}
module.exports = { qualifyInquiry };
