import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve, extname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_FILE = join(ROOT, 'data', 'styles.json');
const IMAGES_DIR = join(ROOT, 'images');

if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log('--- Ajouter un nouveau style ---\n');

  const title = await ask('Titre : ');
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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

  const imageSource = await ask('\nImage — chemin vers le fichier image : ');
  let image = '';

  if (imageSource.trim()) {
    const imagePath = resolve(imageSource);
    if (!existsSync(imagePath)) {
      console.error(`\n✖ Fichier introuvable : ${imagePath}`);
      rl.close();
      process.exit(1);
    }

    const ext = extname(imagePath).toLowerCase();
    const filename = `${id}${ext}`;
    copyFileSync(imagePath, join(IMAGES_DIR, filename));
    image = `images/${filename}`;
    console.log(`  ✔ Image copiée dans ${image}`);
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
  console.log('  Lancez "npm run build" pour régénérer l\'API.');

  rl.close();
}

main();
