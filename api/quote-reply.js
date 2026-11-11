// POST /api/quote-reply  { key, action: 'confirm' | 'change', memo }
// 고객이 견적서 페이지(/q/<키>)에서 [이대로 확정하기]·[수정 요청]을 누르면 그 견적(보여 준 최신 수정본)에 적는다.
// 고객응답일시가 바뀌면 에어테이블 자동화 '견적 고객 응답 → 대표 카톡'이 대표 번호로만 알린다.

const doc = require('../lib/quote-doc');
const { Q } = doc;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  try {
    const { key = '', action = '', memo = '' } = req.body || {};
    if (typeof key !== 'string' || !doc.KEY_RE.test(key)) return res.status(404).json({ error: '견적서를 찾을 수 없습니다.' });
    if (!['confirm', 'change'].includes(action)) return res.status(400).json({ error: '요청을 확인해 주세요.' });
    const text = typeof memo === 'string' ? memo.replace(/\s+\n/g, '\n').trim().slice(0, 800) : '';
    if (action === 'change' && text.length < 2) return res.status(400).json({ error: '바꿀 내용을 적어 주세요.' });

    const found = await doc.resolveKey(key);
    if (!found) return res.status(404).json({ error: '견적서를 찾을 수 없습니다.' });
    const rec = found.shown;
    const v = doc.viewOf(rec);
    if (action === 'confirm' && !v.canConfirm) {
      return res.status(409).json({ error: v.expired ? '유효기간이 지났습니다. [수정 요청]이나 카카오톡으로 알려주세요.' : '이미 처리된 견적입니다.' });
    }
    if (action === 'change' && !v.canChange) return res.status(409).json({ error: '이미 주문이 확정된 견적입니다. 카카오톡으로 알려주세요.' });

    // 같은 응답을 연달아 누르면 한 번만 적는다(대표 알림이 두 번 가지 않게)
    const f = rec.fields;
    const label = action === 'confirm' ? '확정' : '수정요청';
    const last = Date.parse(doc.str(f[Q.replyAt]) || '');
    if (doc.str(f[Q.reply]) === label && Number.isFinite(last) && Date.now() - last < 60000 && action === 'confirm') return res.status(200).json({ ok: true });

    const now = new Date();
    const line = action === 'confirm' ? `${doc.stamp(now)} 확정` : `${doc.stamp(now)} 수정요청: ${text}`;
    const fields = {
      [Q.reply]: label,
      [Q.replyAt]: now.toISOString(),
      [Q.replyText]: doc.prepend(doc.str(f[Q.replyText]), line).slice(0, 5000),
      [Q.memo]: doc.prepend(doc.str(f[Q.memo]), doc.memoLine('고객', label, action === 'confirm' ? '견적서 페이지에서 확정' : `견적서 페이지에서 수정 요청 — ${text.replace(/\n/g, ' / ').slice(0, 200)}`, now)),
    };
    if (action === 'confirm' && ['발송', '보류', '작성'].includes(v.status)) fields[Q.status] = '수락';
    await doc.patchQuote(rec.id, fields);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('quote-reply failed:', e.message);
    return res.status(500).json({ error: '전송에 실패했습니다. 카카오톡으로 알려주세요.' });
  }
};
