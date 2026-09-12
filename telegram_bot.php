<?php
/**
 * GetContact Telegram Bot
 * بوت تليجرام للبحث عن أرقام الهواتف
 */

// تحميل المكتبات
require_once __DIR__ . '/src/Http/HttpClientInterface.php';
require_once __DIR__ . '/src/Http/CurlHttpClient.php';
require_once __DIR__ . '/src/Security/Crypto.php';
require_once __DIR__ . '/src/Security/Signature.php';
require_once __DIR__ . '/src/Validator/NumberValidator.php';
require_once __DIR__ . '/src/GetContact.php';

use Restugbk\GetContact;

// ═══════════════════════════════════════════════════════
// 🔧 الإعدادات - غيّرها هنا
// ═══════════════════════════════════════════════════════

// GetContact Credentials
$token    = getenv('GETCONTACT_TOKEN') ?: 'dibVBTdddd51491e692ac0c2df6448df206adcc8c101b6dbd746ca3c8a';
$finalKey = getenv('GETCONTACT_FINAL_KEY') ?: '506e9091b355d6ed5ceba301699bd6bb32c867a4b85375e7083fdea095ae7918';

// Telegram Bot Token (اطلبه من @BotFather)
$telegramToken = getenv('TELEGRAM_BOT_TOKEN') ?: 'YOUR_BOT_TOKEN_HERE';

// ═══════════════════════════════════════════════════════
// 📥 استقبال الرسائل من تليجرام
// ═══════════════════════════════════════════════════════

$content = file_get_contents("php://input");
$update = json_decode($content, true);

if (!$update) {
    exit;
}

// معلومات الرسالة
$chatId = $update['message']['chat']['id'] ?? null;
$text = $update['message']['text'] ?? '';
$firstName = $update['message']['from']['first_name'] ?? 'User';

if (!$chatId) {
    exit;
}

// ═══════════════════════════════════════════════════════
// 🤖 معالجة الأوامر
// ═══════════════════════════════════════════════════════

// أمر البداية
if ($text === '/start') {
    $message = "🔍 *مرحباً $firstName!*\n\n";
    $message .= "أنا بوت البحث عن أرقام الهواتف باستخدام GetContact.\n\n";
    $message .= "📱 *كيفية الاستخدام:*\n";
    $message .= "• أرسل رقم الهاتف مباشرة\n";
    $message .= "• مثال: +201234567890\n";
    $message .= "• أو: 201234567890\n\n";
    $message .= "💡 *الأوامر المتاحة:*\n";
    $message .= "/start - رسالة الترحيب\n";
    $message .= "/help - المساعدة\n";
    $message .= "/about - عن البوت\n\n";
    $message .= "جرب الآن وأرسل أي رقم! 🚀";
    
    sendMessage($chatId, $message, $telegramToken);
    exit;
}

// أمر المساعدة
if ($text === '/help') {
    $message = "📖 *المساعدة*\n\n";
    $message .= "🔍 *البحث عن رقم:*\n";
    $message .= "فقط أرسل رقم الهاتف بالصيغة:\n";
    $message .= "• +201234567890\n";
    $message .= "• 201234567890\n";
    $message .= "• 966501234567\n\n";
    $message .= "⚡ *النتيجة:*\n";
    $message .= "سأرسل لك جميع الأسماء المسجلة لهذا الرقم.\n\n";
    $message .= "⚠️ *ملاحظة:*\n";
    $message .= "البحث قد يستغرق 2-5 ثواني.";
    
    sendMessage($chatId, $message, $telegramToken);
    exit;
}

// معلومات عن البوت
if ($text === '/about') {
    $message = "ℹ️ *عن البوت*\n\n";
    $message .= "🔍 GetContact Search Bot\n";
    $message .= "نسخة: 1.0\n\n";
    $message .= "📡 يستخدم GetContact API\n";
    $message .= "💻 مبني بـ PHP\n";
    $message .= "🤖 Telegram Bot API\n\n";
    $message .= "صُنع بـ ❤️";
    
    sendMessage($chatId, $message, $telegramToken);
    exit;
}

// ═══════════════════════════════════════════════════════
// 🔍 البحث عن الرقم
// ═══════════════════════════════════════════════════════

// تنظيف الرقم
$phoneNumber = trim($text);

// التحقق من أنه رقم
if (!preg_match('/^[\+]?[0-9]{10,15}$/', str_replace([' ', '-', '(', ')'], '', $phoneNumber))) {
    $message = "❌ *خطأ في الرقم*\n\n";
    $message .= "الرجاء إرسال رقم هاتف صحيح.\n\n";
    $message .= "📱 *أمثلة صحيحة:*\n";
    $message .= "• +201234567890\n";
    $message .= "• 966501234567\n\n";
    $message .= "اكتب /help للمزيد من المساعدة.";
    
    sendMessage($chatId, $message, $telegramToken);
    exit;
}

// إرسال رسالة انتظار
sendMessage($chatId, "🔍 جاري البحث عن الرقم...\nالرجاء الانتظار ⏳", $telegramToken);

// البحث في GetContact
try {
    $getContact = new GetContact($token, $finalKey);
    $response = $getContact->checkNumber($phoneNumber);
    
    if ($response['success']) {
        $message = "✅ *تم العثور على معلومات*\n";
        $message .= "━━━━━━━━━━━━━━━━━━━━\n\n";
        $message .= "📱 *الرقم:* `" . $response['number'] . "`\n\n";
        
        if (!empty($response['tags'])) {
            $message .= "👤 *الأسماء المسجلة:* (" . count($response['tags']) . ")\n";
            $message .= "━━━━━━━━━━━━━━━━━━━━\n";
            
            $count = 0;
            foreach ($response['tags'] as $tag) {
                $count++;
                if ($count <= 20) { // حد أقصى 20 اسم
                    $message .= "$count. " . $tag . "\n";
                }
            }
            
            if (count($response['tags']) > 20) {
                $remaining = count($response['tags']) - 20;
                $message .= "\n_...و $remaining اسم آخر_\n";
            }
        } else {
            $message .= "ℹ️ *لا توجد أسماء مسجلة* لهذا الرقم في قاعدة البيانات.\n";
        }
        
        $message .= "\n━━━━━━━━━━━━━━━━━━━━\n";
        $message .= "🔍 ابحث عن رقم آخر!";
        
    } else {
        $message = "❌ *فشل البحث*\n\n";
        $message .= "السبب: " . $response['message'] . "\n\n";
        $message .= "💡 تأكد من:\n";
        $message .= "• صحة الرقم\n";
        $message .= "• صيغة الرقم الدولية (+XXX)\n";
    }
    
    sendMessage($chatId, $message, $telegramToken);
    
} catch (Exception $e) {
    $message = "❌ *حدث خطأ*\n\n";
    $message .= "الخطأ: " . $e->getMessage() . "\n\n";
    $message .= "حاول مرة أخرى لاحقاً.";
    
    sendMessage($chatId, $message, $telegramToken);
}

// ═══════════════════════════════════════════════════════
// 📤 دالة إرسال الرسائل
// ═══════════════════════════════════════════════════════

function sendMessage($chatId, $message, $token) {
    $url = "https://api.telegram.org/bot$token/sendMessage";
    
    $data = [
        'chat_id' => $chatId,
        'text' => $message,
        'parse_mode' => 'Markdown',
        'disable_web_page_preview' => true
    ];
    
    $options = [
        'http' => [
            'header'  => "Content-type: application/x-www-form-urlencoded\r\n",
            'method'  => 'POST',
            'content' => http_build_query($data)
        ]
    ];
    
    $context = stream_context_create($options);
    file_get_contents($url, false, $context);
}
