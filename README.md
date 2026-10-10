# API Style

API statique JSON pour gérer des styles d'image IA (prompt, background, variables, image de référence).  
Hébergée sur Git, accessible depuis n'importe quelle application web JS via GitHub raw / jsDelivr CDN.

## Structure

```
api-style/
├── data/
│   └── styles.json           # Données source (éditer ici)
├── api/
│   ├── styles.json           # Liste de tous les styles (généré)
│   └── styles/
│       └── {id}.json         # Détail d'un style (généré)
├── images/                   # Images des styles (stockées dans le repo)
├── uploads/                  # Dossier temporaire pour les uploads
├── admin/                    # Interface web d'administration
├── scripts/
│   ├── build.js              # Génère les fichiers API
│   └── add-style.js          # Assistant interactif CLI
├── server.js                 # Serveur admin local (port 3003)
└── package.json
```

## Format d'un style

```json
{
  "id": "neon-glow",
  "title": "Neon Glow",
  "description": "Style néon lumineux aux couleurs vives et contrastées.",
  "prompt": "A vibrant neon-lit illustration of {{subject}} with {{primary_color}} glow and {{accent_color}} highlights...",
  "background_prompt": "A dark cityscape environment with glowing {{primary_color}} neon signs and {{accent_color}} light reflections on wet surfaces...",
  "variables": ["subject", "primary_color", "accent_color"],
  "image": "images/neon-glow.jpg",
  "tags": ["neon", "glow", "cyberpunk"],
  "removeBackground": false,
  "supportImageReference": true,
  "createdAt": "2026-02-10T12:22:00Z"
}
```

### Champs

| Champ | Description |
|---|---|
| `prompt` | Prompt principal pour générer une image dans ce style. Utilise des `{{variables}}` remplaçables. |
| `background_prompt` | Prompt dédié au décor/environnement. Fonctionne en arrière-plan ET en premier plan (profondeur). |
| `variables` | Liste des variables détectées dans le prompt (`subject`, `primary_color`, `accent_color`, etc.). |
| `tags` | Tags précis et mots-clés généraux de recherche en anglais, dans un même tableau (ex. `cross-hatching`, `pencil`, `drawing`, `serious`). |
| `removeBackground` | Si `true`, le fond de l'image générée doit être supprimé (sujet détouré). |
| `supportImageReference` | Si `true`, ce style est optimisé pour le mode **img2img / style transfer** (pas de `{{subject}}`, le prompt décrit uniquement le style visuel à appliquer sur une image fournie par l'utilisateur). |

## Utilisation

### Interface admin (recommandé)

```bash
npm run dev
```

Ouvre http://localhost:3003 — permet de :
- Ajouter, modifier, supprimer des styles
- Uploader des images
- **Auto-remplir les champs avec l'IA** (Gemini 3 Pro via Replicate) à partir d'une image
- Re-analyser les images existantes avec l'IA
- Publier sur GitHub en un clic

### Auto-remplissage IA

L'IA analyse l'image uploadée et génère automatiquement : titre, description, prompt, background prompt et tags.

Les tags combinent 4 à 8 termes précis avec 3 à 6 mots-clés généraux en anglais, selon le style :
- Ambiance : `childlike`, `playful`, `serious`, `professional`, `soft`, `colorful`, `dark`, `dreamy`.
- Technique et médium : `technical`, `pencil`, `drawing`, `sketch`, `painting`, `watercolor`, `gouache`, `ink`, `charcoal`, `engraving`, `collage`, `photography`, `3d`, `vector`, `handcrafted`.
- Esthétique : `minimalist`, `geometric`, `retro`, `comic`, `pixel-art`.

Ces mots-clés sont conservés dans le champ `tags`, disponible dans la liste et le détail des styles. Les styles existants ont également été enrichis à partir de leurs descriptions, en conservant leurs tags précédents. La recherche de l'admin utilise déjà ce champ. La nouvelle consigne IA réserve les instructions de cadrage aux prompts.

Le prompt généré s'adapte selon le mode :
- **Text-to-image** (par défaut) — Prompt avec `{{subject}}`, description complète du style + sujet
- **Image reference** (`supportImageReference` coché) — Prompt style transfer sans `{{subject}}`, focalisé sur le rendu visuel à appliquer (technique, couleurs, textures, ambiance)

### CLI

```bash
npm run add
```

### Ajouter manuellement

Éditer `data/styles.json`, placer l'image dans `images/`, puis lancer `npm run build`.

### Endpoints

Les fichiers JSON sont accessibles publiquement via GitHub raw (CORS supporté, cache ~5 min) :

| Endpoint | URL |
|---|---|
| Tous les styles | `https://raw.githubusercontent.com/solunea/api-style/main/api/styles.json` |
| Un style | `https://raw.githubusercontent.com/solunea/api-style/main/api/styles/{id}.json` |
| Image | `https://raw.githubusercontent.com/solunea/api-style/main/images/{filename}` |

### Exemple depuis une app JS

```js
const BASE = 'https://raw.githubusercontent.com/solunea/api-style/main/api';
const IMG_BASE = 'https://raw.githubusercontent.com/solunea/api-style/main';

// Tous les styles
const styles = await fetch(`${BASE}/styles.json`).then(r => r.json());

// Recherche par mot-clé général
const pencilStyles = styles.filter(s => (s.tags || []).includes('pencil'));

// Un style spécifique
const style = await fetch(`${BASE}/styles/${styles[0].id}.json`).then(r => r.json());

// URL complète de l'image
const imageUrl = `${IMG_BASE}/${style.image}`;

// Remplacer les variables dans le prompt
let prompt = style.prompt
  .replace('{{subject}}', 'a cat wearing sunglasses')
  .replace('{{primary_color}}', 'electric blue')
  .replace('{{accent_color}}', 'hot pink');
```

## API Admin (localhost)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/styles` | Liste tous les styles |
| `GET` | `/api/styles/:id` | Détail d'un style |
| `POST` | `/api/styles` | Créer un style |
| `PUT` | `/api/styles/:id` | Modifier un style |
| `DELETE` | `/api/styles/:id` | Supprimer un style |
| `POST` | `/api/upload` | Uploader une image |
| `POST` | `/api/analyze` | Analyser une image avec l'IA |
| `POST` | `/api/build` | Regénérer les fichiers API |
| `POST` | `/api/push` | Build + commit + push GitHub |

## Déploiement

1. Modifier les styles via l'interface admin (`npm run dev`)
2. Cliquer **🚀 Publier sur CDN** — build + commit + push automatique
3. Les fichiers sont disponibles en ~5 min sur GitHub raw
