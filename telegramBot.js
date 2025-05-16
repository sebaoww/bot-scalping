const { Telegraf } = require('telegraf');
const fs = require('fs');
const { getSolBalance, processPool } = require('./scheduler');
const { telegram, trading } = require('./config');

const bot = new Telegraf(telegram.botToken);
const stateFile = './.botstate.json';
let isBotActive = false;

// Carica stato
if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    isBotActive = state.isBotActive;
}

bot.use((ctx, next) => {
    if (ctx.chat.id !== Number(telegram.chatId)) {
        return ctx.reply('🚫 Non sei autorizzato.');
    }
    return next();
});

bot.command('on', (ctx) => {
    isBotActive = true;
    fs.writeFileSync(stateFile, JSON.stringify({ isBotActive }));
    ctx.reply('✅ Bot attivato.');
});

bot.command('off', (ctx) => {
    isBotActive = false;
    fs.writeFileSync(stateFile, JSON.stringify({ isBotActive }));
    ctx.reply('🛑 Bot disattivato.');
});

bot.command('status', async (ctx) => {
    const balance = await getSolBalance();
    ctx.reply(`📊 *Stato Bot:*\n- Attivo: ${isBotActive}\n- Modalità: ${trading.liveMode ? 'LIVE' : 'TEST'}\n- Saldo: ${balance.toFixed(4)} SOL`, { parse_mode: 'Markdown' });
});

bot.command('balance', async (ctx) => {
    const balance = await getSolBalance();
    ctx.reply(`💰 Saldo attuale: ${balance.toFixed(4)} SOL`);
});

bot.command('testtrade', async (ctx) => {
    try {
        ctx.reply('🧪 Eseguo test trade WSOL/MANEKI...');
        const balance = await getSolBalance();
        const testPool = {
            name: 'WSOL/MANEKI',
            price: 0.004,
            volume24h: 2000000
        };
        await processPool(testPool, balance);
    } catch (err) {
        ctx.reply('❌ Errore durante il test trade.');
    }
});

bot.launch();
console.log('🤖 Bot Telegram attivo!');
