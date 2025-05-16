const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getSwapIx } = require('./utils/raydium');
const fs = require('fs');
const axios = require('axios');
const { telegram, solana, trading } = require('./config');
const logger = require('./logger');

const connection = new Connection(solana.rpcUrl, 'confirmed');
const wallet = Keypair.fromSecretKey(Uint8Array.from(solana.walletKeypair.secretKey));
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');

async function getMintFromPool(poolName) {
    try {
        const [tokenA, tokenB] = poolName.split('/');
        const tokenToFetch = tokenA === 'WSOL' ? tokenB : tokenA;
        const response = await axios.get('https://token.jup.ag/all');
        const tokenInfo = response.data.find(t => t.symbol === tokenToFetch);
        return tokenInfo ? new PublicKey(tokenInfo.address) : null;
    } catch (err) {
        logger.error(`Errore nel fetch mint per ${poolName}: ${err.message}`);
        return null;
    }
}

async function executeTrade(signal, amountSOL, poolName) {
    try {
        const action = signal.isBullish ? 'BUY' : 'SELL';
        const inputIsWSOL = action === 'BUY';
        const inputMint = inputIsWSOL ? WSOL : await getMintFromPool(poolName);
        const outputMint = inputIsWSOL ? await getMintFromPool(poolName) : WSOL;

        if (!inputMint || !outputMint) {
            logger.warn(`⚠️ Mint non trovato per pool ${poolName}`);
            return;
        }

        const swapIx = await getSwapIx({
            connection,
            wallet,
            inputMint,
            outputMint,
            amountIn: Math.floor(amountSOL * 1e9),
            slippage: trading.slippage
        });

        const tx = new Transaction().add(swapIx);
        const signature = await connection.sendTransaction(tx, [wallet]);
        await connection.confirmTransaction(signature, 'confirmed');

        const message = `✅ *${action}* eseguito su *${poolName}*\n🔁 ${amountSOL} SOL\n🔗 https://solscan.io/tx/${signature}`;
        logger.info(message);
        await sendTelegramMessage(message);

        logTrade({
            time: new Date().toISOString(),
            action,
            pool: poolName,
            amountSOL,
            mintIn: inputMint.toBase58(),
            mintOut: outputMint.toBase58(),
            signature
        });
    } catch (err) {
        logger.error(`❌ Errore esecuzione trade: ${err.message}`);
    }
}

async function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${telegram.botToken}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: telegram.chatId,
            text: message,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        logger.error(`Errore Telegram: ${err.message}`);
    }
}

function logTrade(entry) {
    const path = './logs/trading_logs.json';
    const content = JSON.stringify(entry, null, 2) + ',\n';
    fs.appendFileSync(path, content);
}

module.exports = {
    executeTrade
};
