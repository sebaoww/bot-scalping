// strategy.js - Modulo per la logica di trading basata sugli indicatori

const { calculateEMA, calculateRSI, calculateATR, calculateSuperTrend } = require('./indicators');
const logger = require('./logger');
const { strategy } = require('./config');

// Parametri strategia
const { EMA_PERIODS, RSI_PERIOD, ATR_PERIOD, SUPER_TREND_MULTIPLIER } = strategy;

/**
 * Analizza un pool e genera segnali di trading
 * @param {Array} data - Array di candele OHLCV
 * @returns {Object} Segnali di trading e valori calcolati
 */
function analyzePool(data) {
    if (!data || data.length < Math.max(EMA_PERIODS.long, RSI_PERIOD, ATR_PERIOD)) {
        logger.warn('❌ Dati insufficienti per il calcolo degli indicatori.');
        return {
            isBullish: false,
            isBearish: false,
            atr: 0,
            superTrend: { trend: 'neutral', value: 0 },
            entryPrice: 0,
            timestamp: new Date().toISOString()
        };
    }

    const closePrices = data.map(candle => candle.close);

    const emaShort = calculateEMA(closePrices, EMA_PERIODS.short);
    const emaLong = calculateEMA(closePrices, EMA_PERIODS.long);
    const rsi = calculateRSI(closePrices, RSI_PERIOD);
    const atr = calculateATR(data, ATR_PERIOD);
    const superTrend = calculateSuperTrend(data, SUPER_TREND_MULTIPLIER, ATR_PERIOD);

    const lastIndex = closePrices.length - 1;
    const lastClose = closePrices[lastIndex];

    const isBullish = emaShort[lastIndex] > emaLong[lastIndex] &&
                      rsi[lastIndex] > 40 &&
                      superTrend[lastIndex].trend === 'bullish';

    const isBearish = emaShort[lastIndex] < emaLong[lastIndex] &&
                      rsi[lastIndex] < 60 &&
                      superTrend[lastIndex].trend === 'bearish';

    logger.info(`📍 Ultimo prezzo: ${lastClose}`);
    logger.info(`📈 EMA Short (${EMA_PERIODS.short}): ${emaShort[lastIndex]}`);
    logger.info(`📉 EMA Long (${EMA_PERIODS.long}): ${emaLong[lastIndex]}`);
    logger.info(`📊 RSI (${RSI_PERIOD}): ${rsi[lastIndex]}`);
    logger.info(`📏 ATR (${ATR_PERIOD}): ${atr[lastIndex]}`);
    logger.info(`🟢 SuperTrend: ${superTrend[lastIndex].trend}`);

    return {
        isBullish,
        isBearish,
        atr: atr[lastIndex],
        superTrend: superTrend[lastIndex],
        emaShort: emaShort[lastIndex],
        emaLong: emaLong[lastIndex],
        rsi: rsi[lastIndex],
        entryPrice: lastClose,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    analyzePool
};
