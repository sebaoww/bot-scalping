const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getSwapIx } = require('./utils/raydium');
const fs = require('fs');
const axios = require('axios');
const { telegram, solana, trading } = require('./config');
const logger = require('./logger');

const connection = new Connection(solana.rpcUrl, 'confirmed');
const wallet = Keypair.fromSecretKey(Uint8Array.from(solana.walletKeypair.secretKey));
const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const entryFilePath = './logs/entry_prices.json';

function loadEntryPrices() {
    if (!fs.existsSync(entryFilePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(entryFilePath, 'utf8'));
    } catch {
        return {};
    }
}

function saveEntryPrices(entryPrices) {
    fs.writeFileSync(entryFilePath, JSON.stringify(entryPrices, null, 2));
}

async function getMintsFromRaydium(poolName) {
    try {
        const [tokenA, tokenB] = poolName.split('/');
        const response = await axios.get('https://api.raydium.io/v2/main/pairs');

        const pool = response.data.find(p =>
            (p.baseSymbol === tokenA && p.quoteSymbol === tokenB) ||
            (p.baseSymbol === tokenB && p.quoteSymbol === tokenA)
        );

        if (!pool) return null;

        const inputMint = tokenA === 'WSOL' ? new PublicKey(pool.quoteMint) : new PublicKey(pool.baseMint);
        const outputMint = tokenA === 'WSOL' ? new PublicKey(pool.baseMint) : new PublicKey(pool.quoteMint);

        return { inputMint, outputMint };
    } catch (err) {
        logger.error(`❌ Errore fetch mint: ${err.message}`);
        return null;
    }
}

async function getSolBalance() {
    const lamports = await connection.getBalance(wallet.publicKey);
    return lamports / 1e9;
}

async function executeTrade(analysis, amountSOL, poolName) {
    try {
        const action = analysis.isBullish ? 'BUY' : 'SELL';
        const mintInfo = await getMintsFromRaydium(poolName);

        if (!mintInfo) {
            logger.warn(`⚠️ Mints non trovati per la pool ${poolName}`);
            return;
        }

        const balance = await getSolBalance();
        const minRequired = amountSOL + 0.003;
        if (balance < minRequired) {
            logger.warn(`⚠️ Saldo insufficiente: ${balance.toFixed(4)} < ${minRequired}`);
            return;
        }

        const { inputMint, outputMint } = action === 'BUY'
            ? { inputMint: WSOL, outputMint: mintInfo.outputMint }
            : { inputMint: mintInfo.outputMint, outputMint: WSOL };

        const swapIx = await getSwapIx({
            connection,
            wallet,
            inputMint,
            outputMint,
            amountIn: Math.floor(amountSOL * 1e9),
            slippage: trading.slippage
        });

        if (!swapIx) {
            logger.warn(`⚠️ Nessuna istruzione di swap per ${poolName}`);
            return;
        }

        const tx = new Transaction().add(swapIx);
        const signature = await connection.sendTransaction(tx, [wallet]);
        await connection.confirmTransaction(signature, 'confirmed');

        const msg = `✅ *${action}* eseguito su *${poolName}*\n🔁 ${amountSOL} SOL\n🔗 https://solscan.io/tx/${signature}`;
        logger.info(msg);
        await sendTelegramMessage(msg);

        // Aggiorna entryPrice se BUY
        const entryPrices = loadEntryPrices();
        if (action === 'BUY') {
            entryPrices[poolName] = analysis.entryPrice;
        } else if (action === 'SELL') {
            delete entryPrices[poolName];
        }
        saveEntryPrices(entryPrices);

        // Log file
        const tradeLog = {
            time: new Date().toISOString(),
            action,
            pool: poolName,
            amountSOL,
            mintIn: inputMint.toBase58(),
            mintOut: outputMint.toBase58(),
            signature
        };
        fs.appendFileSync('./logs/trading_logs.json', JSON.stringify(tradeLog, null, 2) + ',\n');

    } catch (err) {
        logger.error(`❌ Errore trade ${poolName}: ${err.message}`);
    }
}

async function sendTelegramMessage(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
            chat_id: telegram.chatId,
            text: message,
            parse_mode: 'Markdown'
        });
    } catch (err) {
        logger.error(`❌ Errore Telegram: ${err.message}`);
    }
}

module.exports = {
    executeTrade
};
