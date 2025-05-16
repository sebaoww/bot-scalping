const axios = require('axios');
const fs = require('fs');
const { analyzePool } = require('./strategy');
const { executeTrade } = require('./tradeExecutor');
const { sendTelegramMessage } = require('./notifier');
const logger = require('./logger');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { solana } = require('./config');

const ANALYSIS_INTERVAL = 5 * 60 * 1000;
const RAYDIUM_POOLS_URL = 'https://api.raydium.io/v2/main/pairs';
const entryPrices = new Map();
const botStatePath = './.botstate.json';

const connection = new Connection(solana.rpcUrl, 'confirmed');
const wallet = Keypair.fromSecretKey(Uint8Array.from(solana.walletKeypair.secretKey));

let tradeLevel = 1;
const maxLevel = 25;

function calculateDynamicAmount(balance, lastTradeWasProfit) {
    if (!lastTradeWasProfit) {
        tradeLevel = 1;
    } else {
        tradeLevel = Math.min(tradeLevel + 1, maxLevel);
    }
    const base = 0.012 * balance;
    const amount = base * tradeLevel;
    return Number(Math.min(Math.max(amount, 0.012), 0.3).toFixed(4));
}

async function getSolBalance() {
    const balanceLamports = await connection.getBalance(wallet.publicKey);
    return balanceLamports / 1e9;
}

async function fetchAllPools() {
    try {
        const response = await axios.get(RAYDIUM_POOLS_URL);
        return response.data;
    } catch (error) {
        logger.error(`❌ Errore nel recupero delle pool: ${error.message}`);
        return [];
    }
}

async function processPool(pool, balance) {
    const { name, price, volume24h } = pool;
    if (volume24h < 100 || price <= 0 || !name || price < 0.00001 || price > 100000) {
        logger.info(`⛔ ${name || 'pool senza nome'} esclusa: condizioni base non valide`);
        return;
    }

    try {
        logger.info(`🔍 Analisi pool: ${name} - Prezzo: ${price} - Volume 24h: ${volume24h}`);

        const data = generateSampleData(price);
        const analysis = analyzePool(data);

        const ema50 = calculateEMA(data.map(c => c.close), 50).at(-1);
        const ema200 = calculateEMA(data.map(c => c.close), 200).at(-1);
        const rsi = analysis.rsi;
        const trend = analysis.superTrend.trend;
        const lastPrice = data.at(-1).close;

        logger.info(`📈 EMA50: ${ema50.toFixed(6)} | EMA200: ${ema200.toFixed(6)}`);
        logger.info(`📊 RSI: ${rsi.toFixed(2)} | Trend: ${trend} | Ultimo Prezzo: ${lastPrice.toFixed(6)}`);

        // ✅ Salva sempre l'ultima analisi
        if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

        const lastAnalysis = {
            pool: name,
            timestamp: new Date().toISOString(),
            emaShort: analysis.emaShort,
            emaLong: analysis.emaLong,
            rsi: analysis.rsi,
            superTrend: analysis.superTrend,
            entryPrice: analysis.entryPrice
        };

        fs.writeFileSync('./logs/last_analysis.json', JSON.stringify(lastAnalysis, null, 2));
        logger.info(`📝 Ultima analisi salvata per ${name}`);

        // 🔍 Condizioni BUY più flessibili
        const canBuy =
            analysis.isBullish &&
            rsi > 50 &&
            (trend === 'bullish' || trend === 'neutral') &&
            ema50 >= ema200 * 0.95 &&
            !entryPrices.has(name);

        if (!canBuy) {
            if (!analysis.isBullish) logger.info(`⛔ Scartata ${name}: no bullish signal`);
            if (rsi <= 50) logger.info(`⛔ Scartata ${name}: RSI ${rsi.toFixed(2)} troppo basso`);
            if (trend !== 'bullish' && trend !== 'neutral') logger.info(`⛔ Scartata ${name}: trend ${trend}`);
            if (ema50 < ema200 * 0.95) logger.info(`⛔ Scartata ${name}: EMA50 < EMA200 (${ema50.toFixed(6)} < ${ema200.toFixed(6)})`);
            if (entryPrices.has(name)) logger.info(`⛔ Scartata ${name}: già in posizione`);
        }

        if (canBuy) {
            const amount = calculateDynamicAmount(balance, true);
            entryPrices.set(name, lastPrice);
            logger.info(`✅ BUY ${name} @ ${lastPrice.toFixed(6)} per ${amount.toFixed(2)} SOL`);
            await sendTelegramMessage(`📈 *BUY* - Pool: *${name}*\n🔹 Ingresso: ${lastPrice.toFixed(6)} USD\n📦 ${amount.toFixed(2)} SOL`);
            executeTrade(analysis, amount, name);
        }

        // 🔍 Condizioni SELL
        const canSell =
            analysis.isBearish &&
            rsi < 45 &&
            trend === 'bearish' &&
            entryPrices.has(name);

        if (canSell) {
            const entry = entryPrices.get(name);
            const gainPercent = ((lastPrice - entry) / entry) * 100;
            const lastTradeWasProfit = gainPercent >= 0;
            const amount = calculateDynamicAmount(balance, lastTradeWasProfit);
            entryPrices.delete(name);

            logger.info(`✅ SELL ${name} @ ${lastPrice.toFixed(6)} | Profitto: ${gainPercent.toFixed(2)}%`);
            await sendTelegramMessage(`📉 *SELL* - Pool: *${name}*\n🔹 Uscita: ${lastPrice.toFixed(6)} USD\n💰 Profitto: ${gainPercent.toFixed(2)}%\n📦 Prossimo trade: ${amount.toFixed(2)} SOL`);
            executeTrade(analysis, amount, name);
        }

    } catch (err) {
        logger.error(`❌ Errore nella pool ${name}: ${err.message}`);
        console.error(err);
    }
}

function generateSampleData(price) {
    const data = [];
    for (let i = 0; i < 50; i++) {
        const high = price + Math.random() * 0.02;
        const low = price - Math.random() * 0.02;
        const close = price + (Math.random() - 0.5) * 0.01;
        data.push({ high, low, close });
    }
    return data;
}

function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
    const emaArray = [ema];
    for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
        emaArray.push(ema);
    }
    return emaArray;
}

setInterval(async () => {
    logger.info('📡 Inizio analisi di tutte le pool...');

    if (fs.existsSync(botStatePath)) {
        const botState = JSON.parse(fs.readFileSync(botStatePath, 'utf8'));
        if (!botState.active) {
            logger.info('⏸ Bot disattivo, ciclo saltato.');
            return;
        }
    }

    const pools = await fetchAllPools();
    const solBalance = await getSolBalance();

    if (pools.length > 0) {
        const filtered = pools.filter(p => p.volume24h > 100 && p.price > 0).slice(0, 30); // Limita per ridurre memoria
        logger.info(`🔍 Pool analizzate: ${filtered.length} su ${pools.length}`);
        for (const pool of filtered) {
            await processPool(pool, solBalance);
        }
    } else {
        logger.warn('⚠️ Nessuna pool trovata.');
    }
}, ANALYSIS_INTERVAL);

module.exports = {
    getSolBalance,
    processPool
};
