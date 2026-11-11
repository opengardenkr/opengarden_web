// 솔라피 알림톡 발송 (서버 전용). 키는 호스팅 환경변수로만 — 코드·클라이언트에 두지 않는다.
// SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_PFID 가 없으면 발송하지 않고 { skipped: true }를 돌려준다.
// SOLAPI_SENDER(발신번호)가 있으면 카톡 실패 시 문자로 대체 발송한다.

const crypto = require('crypto');

const env = (k) => (process.env[k] || '').trim();

/** 알림톡 한 통. variables = { '#{변수}': '값' } (버튼 주소의 변수도 같은 표로 채워진다). 실패하면 throw. */
async function sendAlimtalk({ to, templateId, variables }) {
  const KEY = env('SOLAPI_API_KEY');
  const SECRET = env('SOLAPI_API_SECRET');
  const PFID = env('SOLAPI_PFID');
  const FROM = env('SOLAPI_SENDER');
  if (!KEY || !SECRET || !PFID || !templateId) return { skipped: true };
  const phone = String(to || '').replace(/\D/g, '');
  if (phone.length < 10) throw new Error('수신번호 형식');

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(20).toString('hex');
  const signature = crypto.createHmac('sha256', SECRET).update(date + salt).digest('hex');
  const message = {
    to: phone,
    kakaoOptions: { pfId: PFID, templateId, variables, disableSms: !FROM },
  };
  if (FROM) message.from = FROM.replace(/\D/g, '');

  const r = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `HMAC-SHA256 apiKey=${KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Solapi ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return { ok: true };
}

/** 알림톡 변수 길이 보호: 줄 단위로 자르고 꼬리표를 붙인다. */
function clip(text, max, tail = '\n…(나머지는 견적서에서 확인)') {
  const s = String(text || '');
  if (s.length <= max) return s;
  return s.slice(0, max - tail.length).replace(/\n[^\n]*$/, '') + tail;
}

module.exports = { sendAlimtalk, clip };
