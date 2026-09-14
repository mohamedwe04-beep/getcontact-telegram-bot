const crypto = require('crypto');
const https  = require('https');

const HMAC    = '793167597c4a25263656206b5469243e5f416c69385d2f7843716d4d4d5031242a29493846774a2c2a725f59554d2034683f40372b40233c3e2b772d65335657';
const API_URL = '68747470733a2f2f7062737372762d63656e7472616c6576656e74732e636f6d2f76322e382f6e756d6265722d64657461696c';

function getCipher(k) {
  const l = Buffer.from(k, 'hex').length;
  if (l === 16) return 'aes-128-ecb';
  if (l === 24) return 'aes-192-ecb';
  if (l === 32) return 'aes-256-ecb';
  throw new Error('bad key');
}
function enc(d, k) {
  const c = crypto.createCipheriv(getCipher(k), Buffer.from(k, 'hex'), null);
  c.setAutoPadding(true);
  return Buffer.concat([c.update(d, 'utf8'), c.final()]).toString('base64');
}
function dec(d, k) {
  const c = crypto.createDecipheriv(getCipher(k), Buffer.from(k, 'hex'), null);
  c.setAutoPadding(true);
  return Buffer.concat([c.update(Buffer.from(d, 'base64')), c.final()]).toString('utf8');
}
function genSig(ts, msg, hmac) {
  return crypto.createHmac('sha256', Buffer.from(hmac, 'hex')).update(`${ts}-${msg}`).digest('base64');
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const b = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(b) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.write(b);
    req.end();
  });
}

function sendTG(chatId, text, tok) {
  const b = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true });
  const u = new URL(`https://api.telegram.org/bot${tok}/sendMessage`);
  return new Promise(resolve => {
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', resolve);
    req.write(b);
    req.end();
  });
}

// قراءة الـ body يدوياً
function readBody(req) {
  return new Promise((resolve, reject) => {
    // لو req.body موجود خلاص (Vercel parse تلقائي)
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const TOK   = process.env.GETCONTACT_TOKEN     || 'dibVBTdddd51491e692ac0c2df6448df206adcc8c101b6dbd746ca3c8a';
  const FK    = process.env.GETCONTACT_FINAL_KEY  || '506e9091b355d6ed5ceba301699bd6bb32c867a4b85375e7083fdea095ae7918';
  const TGTOK = process.env.TELEGRAM_BOT_TOKEN   || '';

  let update;
  try {
    update = await readBody(req);
  } catch (e) {
    return res.status(200).json({ ok: true });
  }

  const chatId = update?.message?.chat?.id;
  const text   = update?.message?.text || '';
  const name   = update?.message?.from?.first_name || 'User';

  if (!chatId) return res.status(200).json({ ok: true });

  if (text === '/start') {
    await sendTG(chatId, `🔍 *مرحباً ${name}!*\n\nأرسل أي رقم هاتف وسأبحث عنه!\n\nمثال: +201234567890\n\n/help /about`, TGTOK);
    return res.status(200).json({ ok: true });
  }
  if (text === '/help') {
    await sendTG(chatId, `📖 *المساعدة*\n\nأرسل رقم الهاتف:\n• +201234567890\n• 966501234567`, TGTOK);
    return res.status(200).json({ ok: true });
  }
  if (text === '/about') {
    await sendTG(chatId, `ℹ️ GetContact Bot\n📡 GetContact API\n💻 Node.js على Vercel`, TGTOK);
    return res.status(200).json({ ok: true });
  }

  // أمر Debug مؤقت
  if (text.startsWith('/debug ')) {
    const phone = text.replace('/debug ', '').trim();
    try {
      const payload = JSON.stringify({ countryCode: 'us', phoneNumber: phone, source: 'profile', token: TOK });
      const ts      = String(Math.round(Date.now()));
      const s       = genSig(ts, payload, HMAC);
      const e       = enc(payload, FK);
      const apiUrl  = Buffer.from(API_URL, 'hex').toString('utf8');
      const resp = await httpPost(apiUrl, { data: e }, {
        'X-Os': 'android 9', 'X-Mobile-Service': 'GMS', 'X-App-Version': '5.6.2',
        'X-Client-Device-Id': '93b089d5f4213534', 'X-Lang': 'en_US',
        'X-Token': TOK, 'X-Req-Timestamp': ts, 'X-Encrypted': '1',
        'X-Network-Country': 'us', 'X-Country-Code': 'us',
        'X-Req-Signature': s, 'Content-Type': 'application/json'
      });
      let rawMsg = `🔍 Raw Response:\n\`\`\`\n${JSON.stringify(resp, null, 2).slice(0, 3000)}\n\`\`\``;
      if (resp && resp.data) {
        try {
          const decrypted = dec(resp.data, FK);
          rawMsg += `\n\n🔓 Decrypted:\n\`\`\`\n${decrypted.slice(0, 2000)}\n\`\`\``;
        } catch(de) {
          rawMsg += `\n\nDecrypt error: ${de.message}`;
        }
      }
      await sendTG(chatId, rawMsg, TGTOK);
    } catch(err) {
      await sendTG(chatId, `❌ Debug Error: ${err.message}`, TGTOK);
    }
    return res.status(200).json({ ok: true });
  }

  const phone = text.trim().replace(/[\s\-\(\)]/g, '');
  if (!/^[\+]?[0-9]{10,15}$/.test(phone)) {
    await sendTG(chatId, `❌ رقم غير صحيح\n\nمثال: +201234567890`, TGTOK);
    return res.status(200).json({ ok: true });
  }

  await sendTG(chatId, `🔍 جاري البحث...\n⏳`, TGTOK);

  try {
    const payload = JSON.stringify({ countryCode: 'us', phoneNumber: phone, source: 'profile', token: TOK });
    const ts      = String(Math.round(Date.now()));
    const s       = genSig(ts, payload, HMAC);
    const e       = enc(payload, FK);
    const apiUrl  = Buffer.from(API_URL, 'hex').toString('utf8');

    const resp = await httpPost(apiUrl, { data: e }, {
      'X-Os': 'android 9', 'X-Mobile-Service': 'GMS', 'X-App-Version': '5.6.2',
      'X-Client-Device-Id': '93b089d5f4213534', 'X-Lang': 'en_US',
      'X-Token': TOK, 'X-Req-Timestamp': ts, 'X-Encrypted': '1',
      'X-Network-Country': 'us', 'X-Country-Code': 'us',
      'X-Req-Signature': s, 'Content-Type': 'application/json'
    });

    if (!resp || !resp.data) {
      await sendTG(chatId, `❌ فشل البحث\n\nالاستجابة: ${JSON.stringify(resp)}`, TGTOK);
      return res.status(200).json({ ok: true });
    }

    const json = JSON.parse(dec(resp.data, FK));
    const tags = (json.result?.tags || []).map(t => t.tag);

    if (tags.length > 0) {
      let msg = `✅ *نتائج البحث*\n━━━━━━━━━━━━━━━━\n📱 *الرقم:* \`${phone}\`\n\n👤 *الأسماء (${tags.length}):*\n━━━━━━━━━━━━━━━━\n`;
      tags.slice(0, 20).forEach((t, i) => msg += `${i + 1}. ${t}\n`);
      if (tags.length > 20) msg += `\n_...و ${tags.length - 20} آخرين_`;
      msg += `\n━━━━━━━━━━━━━━━━\n🔍 ابحث عن رقم آخر!`;
      await sendTG(chatId, msg, TGTOK);
    } else {
      await sendTG(chatId, `ℹ️ *الرقم:* \`${phone}\`\n\nلا توجد أسماء مسجلة.\n\nRAW: ${JSON.stringify(json)}`, TGTOK);
    }
  } catch (err) {
    await sendTG(chatId, `❌ خطأ: ${err.message}`, TGTOK);
  }

  return res.status(200).json({ ok: true });
};
