function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const emaArray = [ema];
    for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
        emaArray.push(ema);
    }
    return emaArray;
}

function calculateRSI(data, period = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    gains /= period;
    losses /= period;

    const rs = gains / (losses || 1e-10);
    return 100 - 100 / (1 + rs);
}

function calculateATR(data, period = 14) {
    const atr = [];

    for (let i = 1; i < data.length; i++) {
        const high = data[i].high;
        const low = data[i].low;
        const prevClose = data[i - 1].close;

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );

        atr.push(tr);
    }

    const atrValues = [];
    let sum = 0;

    for (let i = 0; i < period; i++) {
        sum += atr[i];
    }

    atrValues[period - 1] = sum / period;

    for (let i = period; i < atr.length; i++) {
        atrValues[i] = (atrValues[i - 1] * (period - 1) + atr[i]) / period;
    }

    return Array(data.length - atr.length).fill(0).concat(atrValues);
}

module.exports = {
    calculateEMA,
    calculateRSI,
    calculateATR
};

