const axios = require('axios');
const { telegram } = require('./config');
const logger = require('./logger');

async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
      chat_id: telegram.chatId,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    logger.error(`❌ Errore invio Telegram: ${err.message}`);
  }
}

module.exports = {
  sendTelegramMessage
};
