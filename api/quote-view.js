// GET /q/<키>  (vercel.json rewrite → /api/quote-view?key=<키>)
// 주문 직후 자동 발행된 견적서를 고객에게 보여 준다. 원본은 에어테이블 '견적서 발송 내역'.
// 조건(CLAUDE.md 원칙 1 예외): 추측 불가 22자 키, noindex + robots Disallow /q/, 캐시 금지, 사이트에서 링크하지 않음.

const doc = require('../lib/quote-doc');

function send(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.status(status).send(html);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const missing = () => send(res, 404, doc.messagePage('견적서를 찾을 수 없습니다', '받으신 링크를 다시 확인해 주세요.'));
  if (!doc.KEY_RE.test(key)) return missing();
  try {
    const found = await doc.resolveKey(key);
    if (!found) return missing();
    const v = doc.viewOf(found.shown);
    if (!v.items.length) return send(res, 503, doc.messagePage('견적서를 준비하고 있습니다', '잠시 후 다시 열어 주세요.'));
    if (req.method === 'HEAD') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.status(200).end(); }
    return send(res, 200, doc.renderPage(v, { key }));
  } catch (e) {
    console.error('quote-view failed:', e.message);
    return send(res, 503, doc.messagePage('잠시 후 다시 열어 주세요', '견적서를 불러오지 못했습니다.'));
  }
};
