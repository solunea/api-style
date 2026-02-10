import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'styles.json');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('--- Ajouter un nouveau style ---\n');

  const title = await ask('Titre : ');
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const description = await ask('Description : ');
  const prompt = await ask('Prompt : ');
  const image = await ask('URL Arweave de l\'image (https://arweave.net/...) : ');
  const tagsRaw = await ask('Tags (séparés par des virgules) : ');
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

  const style = {
    id,
    title,
    description,
    prompt,
    image,
    tags,
    createdAt: new Date().toISOString()
  };

  const styles = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

  if (styles.some((s) => s.id === id)) {
    console.error(`\n✖ Un style avec l'id "${id}" existe déjà.`);
    rl.close();
    process.exit(1);
  }

  styles.push(style);
  writeFileSync(DATA_FILE, JSON.stringify(styles, null, 2));
  console.log(`\n✔ Style "${title}" ajouté dans data/styles.json`);
  console.log('   Lancez "npm run build" pour régénérer l\'API.');

  rl.close();
}

main();
