import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_FILE = join(ROOT, 'data', 'styles.json');
const API_DIR = join(ROOT, 'api');
const STYLES_DIR = join(API_DIR, 'styles');

// Lecture des données source
const styles = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

// Création des dossiers API
if (!existsSync(API_DIR)) mkdirSync(API_DIR, { recursive: true });
if (!existsSync(STYLES_DIR)) mkdirSync(STYLES_DIR, { recursive: true });

// Génération de l'index : api/styles.json (liste complète)
const index = styles.map(({ id, title, description, image, tags, createdAt }) => ({
  id,
  title,
  description,
  image,
  tags,
  createdAt
}));

writeFileSync(join(API_DIR, 'styles.json'), JSON.stringify(index, null, 2));
console.log(`✔ api/styles.json (${index.length} styles)`);

// Génération des fichiers individuels : api/styles/{id}.json
for (const style of styles) {
  const filePath = join(STYLES_DIR, `${style.id}.json`);
  writeFileSync(filePath, JSON.stringify(style, null, 2));
  console.log(`✔ api/styles/${style.id}.json`);
}

console.log(`\nBuild terminé — ${styles.length} style(s) générés.`);
