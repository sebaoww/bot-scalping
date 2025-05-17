// utils/raydium.js

const { getSwapRoute, getSwapInstructions } = require('@raydium-io/raydium-sdk');
const { PublicKey } = require('@solana/web3.js');

/**
 * Costruisce l'istruzione di swap tra WSOL e un token target su Raydium
 * @param {Object} params
 * @param {Connection} params.connection
 * @param {Keypair} params.wallet
 * @param {PublicKey} params.inputMint
 * @param {PublicKey} params.outputMint
 * @param {number} params.amountIn - Ammontare in lamports (1e9 = 1 SOL)
 * @returns {Promise<TransactionInstruction>}
 */
async function getSwapIx({ connection, wallet, inputMint, outputMint, amountIn }) {
    try {
        const route = await getSwapRoute({
            inputMint,
            outputMint,
            amountIn,
            slippage: 0.5
        });

        if (!route || !route.length) throw new Error('Percorso di swap non trovato.');

        const { instructions } = await getSwapInstructions({
            connection,
            wallet,
            routeInfo: route[0]
        });

        return instructions[0];
    } catch (err) {
        throw new Error(`Errore creazione istruzione swap: ${err.message}`);
    }
}

module.exports = {
    getSwapIx
};
