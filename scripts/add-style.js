import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { uploadToArweave, loadWallet, checkBalance } from './upload-arweave.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'styles.json');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('--- Ajouter un nouveau style ---\n');

  const title = await ask('Titre : ');
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Vérifier que l'id n'existe pas déjà
  const styles = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  if (styles.some((s) => s.id === id)) {
    console.error(`\n✖ Un style avec l'id "${id}" existe déjà.`);
    rl.close();
    process.exit(1);
  }

  const description = await ask('Description : ');
  const prompt = await ask('Prompt : ');
  const tagsRaw = await ask('Tags (séparés par des virgules) : ');
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

  // Image : upload local ou URL existante
  const imageSource = await ask('\nImage — chemin local ou URL Arweave existante : ');
  let image;

  if (imageSource.startsWith('https://arweave.net/')) {
    image = imageSource;
    console.log('  ✔ URL Arweave existante utilisée');
  } else {
    // Upload vers Arweave
    const imagePath = resolve(imageSource);
    if (!existsSync(imagePath)) {
      console.error(`\n✖ Fichier introuvable : ${imagePath}`);
      rl.close();
      process.exit(1);
    }

    console.log(`\nUpload de "${imagePath}" vers Arweave...`);
    try {
      const wallet = loadWallet();
      const { address, balanceAR } = await checkBalance(wallet);
      console.log(`  Wallet : ${address}`);
      console.log(`  Solde  : ${balanceAR} AR\n`);

      const result = await uploadToArweave(imagePath, wallet);
      image = result.url;
    } catch (err) {
      console.error(`\n✖ Erreur upload : ${err.message}`);
      rl.close();
      process.exit(1);
    }
  }

  const style = {
    id,
    title,
    description,
    prompt,
    image,
    tags,
    createdAt: new Date().toISOString()
  };

  styles.push(style);
  writeFileSync(DATA_FILE, JSON.stringify(styles, null, 2));
  console.log(`\n✔ Style "${title}" ajouté dans data/styles.json`);
  console.log(`  Image : ${image}`);
  console.log('  Lancez "npm run build" pour régénérer l\'API.');

  rl.close();
}

main();
