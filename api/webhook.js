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

function readBody(req) {
  return new Promise((resolve, reject) => {
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

  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const TOK   = process.env.GETCONTACT_TOKEN     || '';
  const FK    = process.env.GETCONTACT_FINAL_KEY  || '506e9091b355d6ed5ceba301699bd6bb32c867a4b85375e7083fdea095ae7918';
  const TGTOK = process.env.TELEGRAM_BOT_TOKEN   || '';

  let update;
  try { update = await readBody(req); }
  catch { return res.status(200).json({ ok: true }); }

  const chatId = update?.message?.chat?.id;
  const text   = update?.message?.text || '';
  const name   = update?.message?.from?.first_name || 'User';

  if (!chatId) return res.status(200).json({ ok: true });

  // ═══ الأوامر ═══

  if (text === '/start') {
    await sendTG(chatId,
      `🔍 *مرحباً ${name}!*\n\n` +
      `أنا بوت البحث عن أرقام الهواتف باستخدام GetContact.\n\n` +
      `📱 *كيفية الاستخدام:*\n` +
      `• أرسل رقم الهاتف مباشرة\n` +
      `• مثال: +201234567890\n\n` +
      `💡 *الأوامر:* /start /help /about\n\n` +
      `جرب الآن! 🚀`, TGTOK);
    return res.status(200).json({ ok: true });
  }

  if (text === '/help') {
    await sendTG(chatId,
      `📖 *المساعدة*\n\n` +
      `أرسل رقم الهاتف بالصيغة:\n` +
      `• +201234567890\n` +
      `• 966501234567\n\n` +
      `البحث يستغرق 2-5 ثواني.`, TGTOK);
    return res.status(200).json({ ok: true });
  }

  if (text === '/about') {
    await sendTG(chatId,
      `ℹ️ *عن البوت*\n\n` +
      `🔍 GetContact Search Bot\n` +
      `📡 يستخدم GetContact API\n` +
      `💻 Node.js على Vercel\n\n` +
      `صُنع بـ ❤️`, TGTOK);
    return res.status(200).json({ ok: true });
  }

  // ═══ البحث عن الرقم ═══

  const phone = text.trim().replace(/[\s\-\(\)]/g, '');

  if (!/^[\+]?[0-9]{10,15}$/.test(phone)) {
    await sendTG(chatId,
      `❌ *خطأ في الرقم*\n\n` +
      `الرجاء إرسال رقم صحيح:\n` +
      `• +201234567890\n` +
      `• 966501234567`, TGTOK);
    return res.status(200).json({ ok: true });
  }

  if (!TOK) {
    await sendTG(chatId, `⚠️ التوكن غير مضبوط. تواصل مع المسؤول.`, TGTOK);
    return res.status(200).json({ ok: true });
  }

  await sendTG(chatId, `🔍 جاري البحث...\nالرجاء الانتظار ⏳`, TGTOK);

  try {
    const payload = JSON.stringify({
      countryCode: 'us',
      phoneNumber: phone,
      source: 'profile',
      token: TOK
    });
    const ts     = String(Math.round(Date.now()));
    const s      = genSig(ts, payload, HMAC);
    const e      = enc(payload, FK);
    const apiUrl = Buffer.from(API_URL, 'hex').toString('utf8');

    const resp = await httpPost(apiUrl, { data: e }, {
      'X-Os':               'android 9',
      'X-Mobile-Service':   'GMS',
      'X-App-Version':      '5.6.2',
      'X-Client-Device-Id': process.env.GETCONTACT_DEVICE_ID || '93b089d5f4213534',
      'X-Lang':             'en_US',
      'X-Token':            TOK,
      'X-Req-Timestamp':    ts,
      'X-Encrypted':        '1',
      'X-Network-Country':  'us',
      'X-Country-Code':     'us',
      'X-Req-Signature':    s,
      'Content-Type':       'application/json'
    });

    if (!resp || !resp.data) {
      // فحص رسائل الخطأ
      const errCode    = resp?.meta?.errorCode || '';
      const errMessage = resp?.meta?.errorMessage || '';

      if (errCode === '403021' || errMessage.includes('query limit')) {
        await sendTG(chatId,
          `⚠️ *تم تجاوز الحد اليومي للبحث*\n\n` +
          `انتظر حتى الغد أو استخدم توكن جديد.`, TGTOK);
      } else if (errCode === '401' || errMessage.includes('token')) {
        await sendTG(chatId,
          `🔑 *التوكن منتهي أو غير صحيح*\n\n` +
          `تواصل مع المسؤول لتجديد التوكن.`, TGTOK);
      } else {
        await sendTG(chatId,
          `❌ *فشل البحث*\n\n` +
          `${errMessage || 'استجابة غير معروفة من الـ API'}`, TGTOK);
      }
      return res.status(200).json({ ok: true });
    }

    const json = JSON.parse(dec(resp.data, FK));

    // فحص أخطاء في الـ response المشفر
    const statusCode = json?.meta?.httpStatusCode;
    const errMsg     = json?.meta?.errorMessage || '';
    const errCode    = json?.meta?.errorCode    || '';

    if (statusCode === 403 || errCode === '403021' || errMsg.includes('query limit')) {
      await sendTG(chatId,
        `⚠️ *تم تجاوز الحد اليومي للبحث*\n\n` +
        `انتظر حتى الغد أو استخدم توكن جديد.`, TGTOK);
      return res.status(200).json({ ok: true });
    }

    if (statusCode && statusCode !== 200) {
      await sendTG(chatId,
        `❌ *خطأ من الـ API*\n\n` +
        `${errMsg || `Error ${statusCode}`}`, TGTOK);
      return res.status(200).json({ ok: true });
    }

    const tags = (json.result?.tags || []).map(t => t.tag).filter(Boolean);

    if (tags.length > 0) {
      let msg = `✅ *تم العثور على معلومات*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `📱 *الرقم:* \`${phone}\`\n\n`;
      msg += `👤 *الأسماء المسجلة (${tags.length}):*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      tags.slice(0, 20).forEach((t, i) => msg += `${i + 1}. ${t}\n`);
      if (tags.length > 20) msg += `\n_...و ${tags.length - 20} اسم آخر_`;
      msg += `\n━━━━━━━━━━━━━━━━━━━━\n🔍 ابحث عن رقم آخر!`;
      await sendTG(chatId, msg, TGTOK);
    } else {
      // DEBUG مؤقت - لنرى الـ raw response
      await sendTG(chatId, `🔍 DEBUG:\n${JSON.stringify(json).slice(0, 2000)}`, TGTOK);
    }

  } catch (err) {
    await sendTG(chatId, `❌ *حدث خطأ*\n\n${err.message}`, TGTOK);
  }

  return res.status(200).json({ ok: true });
};
