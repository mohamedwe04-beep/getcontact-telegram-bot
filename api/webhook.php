const crypto = require('crypto');
const https = require('https');

// ═══════════════════════════════════════════════════════
// 🔧 الإعدادات
// ═══════════════════════════════════════════════════════

const HMAC    = '793167597c4a25263656206b5469243e5f416c69385d2f7843716d4d4d5031242a29493846774a2c2a725f59554d2034683f40372b40233c3e2b772d65335657';
const API_URL = '68747470733a2f2f7062737372762d63656e7472616c6576656e74732e636f6d2f76322e382f6e756d6265722d64657461696c';

// ═══════════════════════════════════════════════════════
// 🔐 Crypto Functions
// ═══════════════════════════════════════════════════════

function getCipher(finalKey) {
  const keyBytes = Buffer.from(finalKey, 'hex').length;
  if (keyBytes === 16) return 'aes-128-ecb';
  if (keyBytes === 24) return 'aes-192-ecb';
  if (keyBytes === 32) return 'aes-256-ecb';
  throw new Error('Invalid finalKey length');
}

function encrypt(data, finalKey) {
  const cipher = crypto.createCipheriv(getCipher(finalKey), Buffer.from(finalKey, 'hex'), null);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  return encrypted.toString('base64');
}

function decrypt(data, finalKey) {
  const decipher = crypto.createDecipheriv(getCipher(finalKey), Buffer.from(finalKey, 'hex'), null);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

function generateSignature(timestamp, message, hmac) {
  const key  = Buffer.from(hmac, 'hex');
  const data = `${timestamp}-${message}`;
  return crypto.createHmac('sha256', key).update(data).digest('base64');
}

// ═══════════════════════════════════════════════════════
// 🌐 HTTP Request
// ═══════════════════════════════════════════════════════

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname,
      method:   'POST',
      headers:  { ...headers, 'Content-Length': Buffer.byteLength(bodyStr) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════
// 📱 GetContact API
// ═══════════════════════════════════════════════════════

async function checkNumber(phoneNumber, token, finalKey) {
  const payload = JSON.stringify({
    countryCode: 'us',
    phoneNumber: phoneNumber,
    source:      'profile',
    token:       token
  });

  const timestamp = String(Math.round(Date.now()));
  const signature = generateSignature(timestamp, payload, HMAC);
  const encrypted = encrypt(payload, finalKey);

  const headers = {
    'X-Os':               'android 9',
    'X-Mobile-Service':   'GMS',
    'X-App-Version':      '5.6.2',
    'X-Client-Device-Id': '63c063f778cc6ee4',
    'X-Lang':             'en_US',
    'X-Token':            token,
    'X-Req-Timestamp':    timestamp,
    'X-Encrypted':        '1',
    'X-Network-Country':  'us',
    'X-Country-Code':     'us',
    'X-Req-Signature':    signature,
    'Content-Type':       'application/json'
  };

  const apiUrl  = Buffer.from(API_URL, 'hex').toString('utf8');
  const response = await httpPost(apiUrl, { data: encrypted }, headers);

  if (!response || !response.data) {
    return { success: false, message: 'Invalid response from API', raw: response };
  }

  const decrypted = decrypt(response.data, finalKey);
  const json      = JSON.parse(decrypted);
  const tags      = (json.result?.tags || []).map(t => t.tag);

  return { success: true, number: phoneNumber, tags, raw: json };
}

// ═══════════════════════════════════════════════════════
// 📤 Telegram Send Message
// ═══════════════════════════════════════════════════════

async function sendMessage(chatId, text, botToken, parseMode = 'Markdown') {
  const url  = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = { chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true };

  return new Promise((resolve) => {
    const bodyStr = JSON.stringify(body);
    const urlObj  = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', resolve);
    req.write(bodyStr);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════
// 🤖 Main Handler
// ═══════════════════════════════════════════════════════

module.exports = async (req, res) => {
  // يجب أن يكون POST
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  const TOKEN         = process.env.GETCONTACT_TOKEN    || 'dibVBTdddd51491e692ac0c2df6448df206adcc8c101b6dbd746ca3c8a';
  const FINAL_KEY     = process.env.GETCONTACT_FINAL_KEY || '506e9091b355d6ed5ceba301699bd6bb32c867a4b85375e7083fdea095ae7918';
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

  const update    = req.body;
  const chatId    = update?.message?.chat?.id;
  const text      = update?.message?.text || '';
  const firstName = update?.message?.from?.first_name || 'User';

  if (!chatId) return res.status(200).send('OK');

  // ═══ الأوامر ═══

  if (text === '/start') {
    let msg = `🔍 *مرحباً ${firstName}!*\n\n`;
    msg += `أنا بوت البحث عن أرقام الهواتف باستخدام GetContact.\n\n`;
    msg += `📱 *كيفية الاستخدام:*\n`;
    msg += `• أرسل رقم الهاتف مباشرة\n`;
    msg += `• مثال: +201234567890\n\n`;
    msg += `💡 *الأوامر:*\n/start /help /about\n\n`;
    msg += `جرب الآن! 🚀`;
    await sendMessage(chatId, msg, TELEGRAM_TOKEN);
    return res.status(200).send('OK');
  }

  if (text === '/help') {
    let msg = `📖 *المساعدة*\n\nأرسل رقم الهاتف بالصيغة:\n`;
    msg += `• +201234567890\n• 966501234567\n\n`;
    msg += `البحث يستغرق 2-5 ثواني.`;
    await sendMessage(chatId, msg, TELEGRAM_TOKEN);
    return res.status(200).send('OK');
  }

  if (text === '/about') {
    let msg = `ℹ️ *عن البوت*\n\n🔍 GetContact Search Bot\n`;
    msg += `📡 يستخدم GetContact API\n💻 Node.js على Vercel\n\nصُنع بـ ❤️`;
    await sendMessage(chatId, msg, TELEGRAM_TOKEN);
    return res.status(200).send('OK');
  }

  // ═══ البحث عن الرقم ═══

  const phone = text.trim().replace(/[\s\-\(\)]/g, '');

  if (!/^[\+]?[0-9]{10,15}$/.test(phone)) {
    let msg = `❌ *خطأ في الرقم*\n\nأرسل رقم صحيح مثل:\n• +201234567890\n• 966501234567`;
    await sendMessage(chatId, msg, TELEGRAM_TOKEN);
    return res.status(200).send('OK');
  }

  await sendMessage(chatId, `🔍 جاري البحث...\nالرجاء الانتظار ⏳`, TELEGRAM_TOKEN);

  try {
    const result = await checkNumber(phone, TOKEN, FINAL_KEY);

    if (result.success) {
      let msg = `✅ *تم العثور على معلومات*\n━━━━━━━━━━━━━━━━\n\n📱 *الرقم:* \`${result.number}\`\n\n`;
      if (result.tags && result.tags.length > 0) {
        msg += `👤 *الأسماء:* (${result.tags.length})\n━━━━━━━━━━━━━━━━\n`;
        result.tags.slice(0, 20).forEach((tag, i) => { msg += `${i + 1}. ${tag}\n`; });
        if (result.tags.length > 20) msg += `\n_...و ${result.tags.length - 20} اسم آخر_\n`;
      } else {
        msg += `ℹ️ لا توجد أسماء مسجلة لهذا الرقم.`;
      }
      msg += `\n━━━━━━━━━━━━━━━━\n🔍 ابحث عن رقم آخر!`;
      await sendMessage(chatId, msg, TELEGRAM_TOKEN);
    } else {
      await sendMessage(chatId, `❌ *فشل البحث*\n\n${result.message}`, TELEGRAM_TOKEN);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ *حدث خطأ*\n\n${e.message}`, TELEGRAM_TOKEN);
  }

  return res.status(200).send('OK');
};
