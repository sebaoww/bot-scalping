// utils/raydium.js

const { Jupiter, RouteMap } = require('@jup-ag/core');
const { Connection } = require('@solana/web3.js');

async function getSwapIx({ connection, wallet, inputMint, outputMint, amountIn, slippage }) {
  const jupiter = await Jupiter.load({
    connection,
    cluster: 'mainnet-beta',
    user: wallet
  });

  const routes = await jupiter.computeRoutes({
    inputMint,
    outputMint,
    amount: amountIn,
    slippage
  });

  const bestRoute = routes?.routes?.[0];
  if (!bestRoute) throw new Error('Nessuna route disponibile');

  const { transactions } = await jupiter.exchange({ routeInfo: bestRoute });
  return transactions.swapTransaction; // singola istruzione
}

module.exports = {
  getSwapIx
};
