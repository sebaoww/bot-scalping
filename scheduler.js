const axios = require('axios');
const fs = require('fs');
const { calculateEMA, calculateRSI, calculateATR } = require('./indicators');
const { executeTrade } = require('./tradeExecutor');
const { sendTelegramMessage } = require('./notifier');
const logger = require('./logger');
const { Connection, Keypair } = require('@solana/web3.js');
const { solana } = require('./config');

const ANALYSIS_INTERVAL = 5 * 60 * 1000;
const RAYDIUM_POOLS_URL = 'https://api.raydium.io/v2/main/pairs';
const entryPrices = new Map();
const botStatePath = './.botstate.json';
const statsPath = './stats.json';

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

    if (volume24h < 50 || price <= 0 || !name || price < 0.0000001 || price > 1000000) {
        if (volume24h < 50) logger.info(`⛔ ${name} esclusa: volume24h troppo basso (${volume24h})`);
        if (price <= 0) logger.info(`⛔ ${name} esclusa: prezzo non valido (${price})`);
        if (!name) logger.info(`⛔ Pool esclusa: nessun nome`);
        if (price < 0.0000001) logger.info(`⛔ ${name} esclusa: prezzo troppo basso (${price})`);
        if (price > 1000000) logger.info(`⛔ ${name} esclusa: prezzo troppo alto (${price})`);
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

        const canBuy =
            analysis.isBullish &&
            rsi > 50 &&
            (trend === 'bullish' || trend === 'neutral') &&
            ema50 >= ema200 * 0.95 &&
            !entryPrices.has(name);

        if (canBuy) {
            const amount = calculateDynamicAmount(balance, true);
            entryPrices.set(name, lastPrice);
            logger.info(`✅ BUY ${name} @ ${lastPrice.toFixed(6)} per ${amount.toFixed(2)} SOL`);
            await sendTelegramMessage(`📈 *BUY* - Pool: *${name}*\n🔹 Ingresso: ${lastPrice.toFixed(6)} USD\n📦 ${amount.toFixed(2)} SOL`);
            if (fs.existsSync(statsPath)) {
                const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
                stats.buyCount += 1;
                fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
            }
            executeTrade(analysis, amount, name);
        }

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

            if (fs.existsSync(statsPath)) {
                const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
                stats.sellCount += 1;
                stats.totalGain += gainPercent;
                fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
            }
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

function calculateSuperTrend(data, multiplier = 1.5, atrPeriod = 14) {
    const atr = calculateATR(data, atrPeriod);
    const trendDirection = [];
    let finalUpperBand = [], finalLowerBand = [];

    for (let i = 0; i < data.length; i++) {
        const hl2 = (data[i].high + data[i].low) / 2;
        const upperBand = hl2 + multiplier * atr[i];
        const lowerBand = hl2 - multiplier * atr[i];

        finalUpperBand.push(i > 0 ? Math.min(upperBand, finalUpperBand[i - 1] ?? upperBand) : upperBand);
        finalLowerBand.push(i > 0 ? Math.max(lowerBand, finalLowerBand[i - 1] ?? lowerBand) : lowerBand);

        if (i === 0) {
            trendDirection.push('neutral');
        } else {
            const prevTrend = trendDirection[i - 1];
            const close = data[i].close;
            if (prevTrend === 'bullish') {
                trendDirection.push(close < finalUpperBand[i] ? 'bearish' : 'bullish');
            } else if (prevTrend === 'bearish') {
                trendDirection.push(close > finalLowerBand[i] ? 'bullish' : 'bearish');
            } else {
                trendDirection.push(close > upperBand ? 'bullish' : (close < lowerBand ? 'bearish' : 'neutral'));
            }
        }
    }
    return { trend: trendDirection.at(-1) };
}

function calculateADX(data, period = 14) {
    const tr = [], plusDM = [], minusDM = [];

    for (let i = 1; i < data.length; i++) {
        const high = data[i].high, low = data[i].low;
        const prevClose = data[i - 1].close;
        const prevHigh = data[i - 1].high, prevLow = data[i - 1].low;

        const upMove = high - prevHigh;
        const downMove = prevLow - low;

        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
        minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }

    const tr14 = tr.slice(-period).reduce((a, b) => a + b, 0);
    const plusDM14 = plusDM.slice(-period).reduce((a, b) => a + b, 0);
    const minusDM14 = minusDM.slice(-period).reduce((a, b) => a + b, 0);

    const plusDI = 100 * (plusDM14 / tr14);
    const minusDI = 100 * (minusDM14 / tr14);
    const dx = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI);

    return dx;
}

function analyzePool(data) {
    const closePrices = data.map(c => c.close);
    const emaShort = calculateEMA(closePrices, 9).at(-1);
    const emaLong = calculateEMA(closePrices, 25).at(-1);
    const rsi = calculateRSI(closePrices, 14);
    const atr = calculateATR(data, 14);
    const superTrend = calculateSuperTrend(data);
    const adx = calculateADX(data);
    const lastPrice = closePrices.at(-1);

    const isBullish = rsi > 55 && emaShort > emaLong && (superTrend.trend === 'bullish' || superTrend.trend === 'neutral') && adx >= 20;
    const isBearish = rsi < 45 && emaShort < emaLong && superTrend.trend === 'bearish' && adx >= 20;

    logger.info(`📊 [ANALISI] RSI: ${rsi.toFixed(2)}, EMA9: ${emaShort.toFixed(6)}, EMA25: ${emaLong.toFixed(6)}, ADX: ${adx.toFixed(2)}, Trend: ${superTrend.trend}`);

    return {
        emaShort,
        emaLong,
        rsi,
        atr,
        superTrend,
        adx,
        entryPrice: lastPrice,
        isBullish,
        isBearish
    };
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
        const filtered = pools.filter(p => p.volume24h > 0 && p.price > 0).slice(0, 30);
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
    processPool,
    analyzePool
};
