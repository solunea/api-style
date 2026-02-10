import Arweave from 'arweave';
import { readFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

/**
 * Upload un fichier image vers Arweave.
 * @param {string} imagePath - Chemin absolu ou relatif vers l'image
 * @param {object} wallet - Clé JWK du wallet Arweave
 * @returns {Promise<{id: string, url: string}>} - ID de transaction et URL Arweave
 */
export async function uploadToArweave(imagePath, wallet) {
  const ext = extname(imagePath).toLowerCase();
  const contentType = MIME_TYPES[ext];

  if (!contentType) {
    throw new Error(`Type de fichier non supporté : ${ext}. Formats acceptés : ${Object.keys(MIME_TYPES).join(', ')}`);
  }

  const data = readFileSync(imagePath);

  const transaction = await arweave.createTransaction({ data }, wallet);
  transaction.addTag('Content-Type', contentType);
  transaction.addTag('App-Name', 'api-style');

  await arweave.transactions.sign(transaction, wallet);

  console.log(`  Taille : ${(data.length / 1024).toFixed(1)} Ko`);
  console.log(`  Type   : ${contentType}`);
  console.log(`  TX ID  : ${transaction.id}`);

  const uploader = await arweave.transactions.getUploader(transaction);

  while (!uploader.isComplete) {
    await uploader.uploadChunk();
    process.stdout.write(`\r  Upload : ${uploader.pctComplete}%`);
  }

  console.log('\n  ✔ Upload terminé');

  return {
    id: transaction.id,
    url: `https://arweave.net/${transaction.id}`,
  };
}

/**
 * Charge le wallet depuis le fichier wallet.json
 */
export function loadWallet(walletPath) {
  const resolvedPath = walletPath || join(__dirname, '..', 'wallet.json');
  try {
    return JSON.parse(readFileSync(resolvedPath, 'utf-8'));
  } catch (err) {
    throw new Error(
      `Impossible de charger le wallet : ${resolvedPath}\n` +
      `Placez votre fichier wallet Arweave (JWK) à la racine du projet sous le nom "wallet.json".\n` +
      `Vous pouvez en générer un sur https://arweave.app ou https://www.arconnect.io`
    );
  }
}

/**
 * Vérifie le solde du wallet
 */
export async function checkBalance(wallet) {
  const address = await arweave.wallets.jwkToAddress(wallet);
  const balanceWinston = await arweave.wallets.getBalance(address);
  const balanceAR = arweave.ar.winstonToAr(balanceWinston);
  return { address, balanceAR, balanceWinston };
}

// Exécution directe : node scripts/upload-arweave.js <chemin-image>
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\\/g, '/').replace(/^\//, ''));

if (isDirectRun || process.argv[2]) {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.log('Usage : node scripts/upload-arweave.js <chemin-image>');
    console.log('Exemple : node scripts/upload-arweave.js images/my-style.png');
    process.exit(1);
  }

  try {
    const wallet = loadWallet();
    const { address, balanceAR } = await checkBalance(wallet);
    console.log(`Wallet  : ${address}`);
    console.log(`Solde   : ${balanceAR} AR\n`);
    console.log(`Upload de "${imagePath}" vers Arweave...`);

    const result = await uploadToArweave(imagePath, wallet);
    console.log(`\n✔ Image disponible sur : ${result.url}`);
  } catch (err) {
    console.error(`\n✖ Erreur : ${err.message}`);
    process.exit(1);
  }
}
