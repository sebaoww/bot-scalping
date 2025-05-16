// indicators.js - Modulo per il calcolo degli indicatori tecnici

// Calcolo della Media Mobile Esponenziale (EMA)
function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let emaArray = new Array(period - 1).fill(null);  // Riempie i primi `period - 1` con null
    let ema = data.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
    emaArray.push(ema);

    for (let i = period; i < data.length; i++) {
        ema = (data[i] - ema) * k + ema;
        emaArray.push(ema);
    }

    return emaArray;
}

// Calcolo dell'RSI
function calculateRSI(data, period) {
    if (data.length < period) return new Array(data.length).fill(null);

    let rsiArray = new Array(period).fill(null);
    let gains = 0;
    let losses = 0;

    // Calcolo iniziale per i primi `period` candele
    for (let i = 1; i <= period; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    rsiArray.push(rsi);

    // Calcolo progressivo per le restanti candele
    for (let i = period + 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        gains = change > 0 ? change : 0;
        losses = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gains) / period;
        avgLoss = (avgLoss * (period - 1) + losses) / period;

        rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

        rsiArray.push(rsi);
    }

    return rsiArray;
}

// Calcolo dell'ATR
function calculateATR(data, period) {
    if (data.length < period) return new Array(data.length).fill(null);

    let trArray = new Array(period).fill(null);

    for (let i = 1; i < data.length; i++) {
        const highLow = Math.abs(data[i].high - data[i].low);
        const highClose = Math.abs(data[i].high - data[i - 1].close);
        const lowClose = Math.abs(data[i].low - data[i - 1].close);
        const tr = Math.max(highLow, highClose, lowClose);
        trArray.push(tr);
    }

    const atrArray = calculateEMA(trArray.slice(period), period);
    return new Array(period).fill(null).concat(atrArray); // Riempi i primi valori con `null`
}

// Calcolo del SuperTrend
function calculateSuperTrend(data, atrMultiplier, period) {
    const atr = calculateATR(data, period);
    let superTrend = new Array(period).fill({ upper: null, lower: null, trend: "neutral" });

    for (let i = period; i < data.length; i++) {
        const atrValue = atr[i - period];
        const basicUpperBand = data[i].high + atrMultiplier * atrValue;
        const basicLowerBand = data[i].low - atrMultiplier * atrValue;

        const prevUpper = superTrend[i - 1]?.upper || basicUpperBand;
        const prevLower = superTrend[i - 1]?.lower || basicLowerBand;

        const finalUpperBand = data[i].close > prevUpper ? basicUpperBand : Math.min(basicUpperBand, prevUpper);
        const finalLowerBand = data[i].close < prevLower ? basicLowerBand : Math.max(basicLowerBand, prevLower);

        const trend = data[i].close > finalUpperBand ? "bullish" :
                      data[i].close < finalLowerBand ? "bearish" : "neutral";

        superTrend.push({
            upper: finalUpperBand,
            lower: finalLowerBand,
            trend: trend
        });
    }

    return superTrend;
}

module.exports = {
    calculateEMA,
    calculateRSI,
    calculateATR,
    calculateSuperTrend
};
