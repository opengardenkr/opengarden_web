const sharp = require('sharp');
const path = require('node:path');
const { getRecordImage, GROUPS } = require('../lib/catalog-data');
const LIMIT = 10 * 1024 * 1024;
function allowedImage(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (u.hostname.endsWith('.airtableusercontent.com') || u.hostname === 'dl.airtable.com');
  } catch { return false; }
}
async function readImage(response) {
  if (!response.ok || !/^image\/(jpeg|png|webp|avif|gif)(;|$)/i.test(response.headers.get('content-type') || '') ||
      Number(response.headers.get('content-length')) > LIMIT) throw new Error('Invalid image');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > LIMIT) throw new Error('Image too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
// One proportional mark for all source aspect ratios; never write back to attachments.
const WATERMARK = Object.freeze({ widthRatio: .24, marginRatio: .035, opacity: .30 });
async function watermark(input, maxSize = 1600) {
  const photo = await sharp(input, { limitInputPixels: 40000000 }).rotate()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#f4f6f1' }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  const { width, height } = photo.info;
  const margin = Math.max(0, Math.min(Math.round(width * WATERMARK.marginRatio), Math.floor(height * .1)));
  const logo = await sharp(path.join(__dirname, '../public/assets/logo.png'))
    .resize({ width: Math.max(1, Math.round(width * WATERMARK.widthRatio)), height: Math.max(1, height - margin * 2), fit: 'inside' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < logo.data.length; i += 4) logo.data[i] = Math.round(logo.data[i] * WATERMARK.opacity);
  return sharp(photo.data).composite([{
    input: logo.data, raw: { width: logo.info.width, height: logo.info.height, channels: 4 },
    left: Math.max(0, width - margin - logo.info.width), top: Math.max(0, height - margin - logo.info.height)
  }]).webp({ quality: 84 }).toBuffer();
}
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end();
  const { group, id } = req.query, index = String(req.query.index ?? '0');
  const previewSize = req.query.w === '520' ? 520 : 1600;
  if (!GROUPS.includes(group) || typeof id !== 'string' || !/^rec[A-Za-z0-9]{14}$/.test(id) || !/^\d{1,2}$/.test(index)) return res.status(400).end();
  try {
    const url = await getRecordImage(group, id, Number(index));
    if (!url) return res.status(404).end();
    if (!allowedImage(url)) throw new Error('Untrusted attachment');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const output = await watermark(await readImage(response), previewSize);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    return res.status(200).end(output);
  } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).end(); }
};
module.exports.allowedImage = allowedImage;
module.exports.watermark = watermark;
// 외부 저작물(CC 사진)용: 로고 없이 크기만 줄인다
async function resize(input, maxSize = 1600) {
  return sharp(input, { limitInputPixels: 40000000 }).rotate()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#f4f6f1' }).webp({ quality: 84 }).toBuffer();
}
module.exports.resize = resize;
module.exports.readImage = readImage;

module.exports.WATERMARK = WATERMARK;
