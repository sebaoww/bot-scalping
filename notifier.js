// notifier.js
const { Telegraf } = require('telegraf');
const config = require('./config');

const bot = new Telegraf(config.telegram.botToken);

async function sendTelegramMessage(text) {
    try {
        await bot.telegram.sendMessage(config.telegram.chatId, text, {
            parse_mode: 'Markdown',
        });
    } catch (err) {
        console.error('❌ Errore Telegram:', err.message);
    }
}

module.exports = { sendTelegramMessage };