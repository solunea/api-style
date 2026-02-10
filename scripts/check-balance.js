import { loadWallet, checkBalance } from './upload-arweave.js';

try {
  const wallet = loadWallet();
  const { address, balanceAR } = await checkBalance(wallet);
  console.log(`Adresse : ${address}`);
  console.log(`Solde   : ${balanceAR} AR`);
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}
