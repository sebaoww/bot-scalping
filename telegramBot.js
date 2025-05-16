const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { getSolBalance } = require('./scheduler');
const { telegram } = require('./config');

const bot = new Telegraf(telegram.botToken);
const statePath = './.botstate.json';
const appLogPath = path.join(__dirname, 'app.log');

// Stato del bot: attivo/disattivo
let botState = { active: true };

// Carica stato salvato da file se esiste
if (fs.existsSync(statePath)) {
  botState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

// 🔄 /status – Mostra lo stato del bot
bot.command('status', async (ctx) => {
  if (ctx.chat.id !== Number(telegram.chatId)) return;
  const balance = await getSolBalance();
  ctx.reply(`📊 Stato Bot:
- Attivo: ${botState.active}
- Modalità: LIVE
- Saldo: ${balance.toFixed(4)} SOL`);
});

// ✅ /on – Attiva il bot
bot.command('on', async (ctx) => {
  if (ctx.chat.id !== Number(telegram.chatId)) return;
  botState.active = true;
  fs.writeFileSync(statePath, JSON.stringify(botState));
  ctx.reply('✅ Bot attivato.');
});

// ⛔ /off – Disattiva il bot
bot.command('off', async (ctx) => {
  if (ctx.chat.id !== Number(telegram.chatId)) return;
  botState.active = false;
  fs.writeFileSync(statePath, JSON.stringify(botState));
  ctx.reply('⛔ Bot disattivato manualmente.');
});

// 🛑 /panic – Alias di /off per stop emergenza
bot.command('panic', async (ctx) => {
  if (ctx.chat.id !== Number(telegram.chatId)) return;
  botState.active = false;
  fs.writeFileSync(statePath, JSON.stringify(botState));
  ctx.reply('🛑 PANIC: Bot disattivato immediatamente.');
});

// 📄 /log – Mostra l’ultima pool analizzata
bot.command('log', async (ctx) => {
  if (ctx.chat.id !== Number(telegram.chatId)) return;
  const logFile = './logs/last_analysis.json';
  if (!fs.existsSync(logFile)) {
    return ctx.reply('📭 Nessuna analisi disponibile.');
  }

  try {
    const last = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    ctx.replyWithMarkdown(`📊 *Ultima Analisi* (${last.timestamp})
*Pool:* ${last.pool}
📈 EMA: ${last.emaShort.toFixed(6)} / ${last.emaLong.toFixed(6)}
📊 RSI: ${last.rsi.toFixed(2)}
🟢 SuperTrend: ${last.superTrend.trend}
💰 Prezzo: ${last.entryPrice.toFixed(6)} SOL`);
  } catch (e) {
    ctx.reply('❌ Errore nel recupero del log.');
  }
});

// 🐞 /debug – Mostra gli ultimi 5 log da app.log
bot.command('debug', async (ctx) => {
  if (ctx.chat.id !== Number(telegram.chatId)) return;
  if (fs.existsSync(appLogPath)) {
    const lines = fs.readFileSync(appLogPath, 'utf8').trim().split('\n');
    const lastLines = lines.slice(-5).join('\n');
    ctx.reply(`📋 *Ultimi 5 log:*\n\`\`\`\n${


