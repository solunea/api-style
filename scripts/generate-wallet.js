import Arweave from 'arweave';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WALLET_PATH = join(__dirname, '..', 'wallet.json');

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

if (existsSync(WALLET_PATH)) {
  console.error('✖ wallet.json existe déjà. Supprimez-le d\'abord si vous voulez en générer un nouveau.');
  process.exit(1);
}

console.log('Génération d\'un nouveau wallet Arweave...\n');

const key = await arweave.wallets.generate();
const address = await arweave.wallets.jwkToAddress(key);

writeFileSync(WALLET_PATH, JSON.stringify(key, null, 2));

console.log(`✔ Wallet généré avec succès`);
console.log(`  Adresse : ${address}`);
console.log(`  Fichier : wallet.json`);
console.log(`\n⚠️  Ce fichier est gitignored. Ne le partagez JAMAIS.`);
console.log(`💰 Envoyez du AR à cette adresse pour pouvoir uploader des images.`);
