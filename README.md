# API Style

API statique JSON pour gérer des styles (image, prompt avec variables, titre, description).  
Hébergée sur Git, accessible depuis n'importe quelle application web JS via jsDelivr CDN.

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
├── admin/                    # Interface web d'administration
├── scripts/
│   ├── build.js              # Génère les fichiers API
│   └── add-style.js          # Assistant interactif CLI
├── server.js                 # Serveur admin local
└── package.json
```

## Format d'un style

```json
{
  "id": "whimsical-illustrations",
  "title": "Whimsical Illustrations",
  "description": "Illustrations fantaisistes et ludiques.",
  "prompt": "Create a whimsical illustration featuring {{subject}} wearing {{clothing}}...",
  "variables": {
    "subject": {
      "label": "Sujet",
      "description": "Le personnage central",
      "placeholder": "a young artist"
    },
    "clothing": {
      "label": "Vêtements",
      "description": "Vêtements du personnage",
      "placeholder": "a beret and apron"
    }
  },
  "image": "images/whimsical-illustrations.jpg",
  "tags": ["whimsical", "illustration"],
  "createdAt": "2026-02-10T12:22:00Z"
}
```

Les prompts utilisent des `{{variables}}` remplaçables par l'application consommatrice.

## Utilisation

### Interface admin (recommandé)

```bash
npm run dev
```

Ouvre http://localhost:3000 — permet d'ajouter, modifier, supprimer des styles avec upload d'images et éditeur de variables.

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

// Un style spécifique
const style = await fetch(`${BASE}/styles/${styles[0].id}.json`).then(r => r.json());

// URL complète de l'image
const imageUrl = `${IMG_BASE}/${style.image}`;
```

## Déploiement

1. Modifier les styles via l'interface admin (`npm run dev`)
2. Cliquer **🚀 Publier sur CDN** — build + commit + push automatique
3. Les fichiers sont disponibles en ~5 min sur GitHub raw
