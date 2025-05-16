require('dotenv').config();
const { Keypair } = require('@solana/web3.js');

// Estrazione della chiave direttamente da variabile .env
let walletKeypair;

if (process.env.WALLET_KEYPAIR) {
  try {
    const secret = Uint8Array.from(JSON.parse(process.env.WALLET_KEYPAIR));
    walletKeypair = Keypair.fromSecretKey(secret);
  } catch (e) {
    throw new Error('❌ WALLET_KEYPAIR malformato: ' + e.message);
  }
} else {
  throw new Error('❌ Variabile WALLET_KEYPAIR mancante');
}

module.exports = {
  telegram: {
    botToken: process.env.BOT_TOKEN,
    chatId: process.env.CHAT_ID,
  },
  solana: {
    rpcUrl: process.env.RPC_URL,
    walletKeypair,
  },
  trading: {
    tradeAmountUSD: parseFloat(process.env.TRADE_AMOUNT_USD) || 5,
    volumeThresholdSOL: parseFloat(process.env.VOLUME_THRESHOLD) || 1.5,
    takeProfitPercentage: parseFloat(process.env.TAKE_PROFIT) || 1.5,
    stopLossPercentage: parseFloat(process.env.STOP_LOSS) || 1.0,
    slippage: parseFloat(process.env.SLIPPAGE) || 0.02,
    trailingStopPercent: parseFloat(process.env.TRAILING_STOP) || 0.05,
    liveMode: process.env.LIVE_MODE === 'true'
  },
  strategy: {
    EMA_PERIODS: {
      short: parseInt(process.env.EMA_SHORT) || 9,
      long: parseInt(process.env.EMA_LONG) || 25,
    },
    RSI_PERIOD: parseInt(process.env.RSI_PERIOD) || 14,
    ATR_PERIOD: parseInt(process.env.ATR_PERIOD) || 14,
    SUPER_TREND_MULTIPLIER: parseFloat(process.env.SUPER_TREND_MULTIPLIER) || 2,
  }
};

