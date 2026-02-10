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

### Endpoints (via jsDelivr CDN)

Les fichiers JSON sont accessibles publiquement via [jsDelivr](https://www.jsdelivr.com/) (CDN gratuit avec CORS) :

| Endpoint | URL |
|---|---|
| Tous les styles | `https://cdn.jsdelivr.net/gh/solunea/api-style@main/api/styles.json` |
| Un style | `https://cdn.jsdelivr.net/gh/solunea/api-style@main/api/styles/{id}.json` |

### Exemple depuis une app JS

```js
const BASE = 'https://cdn.jsdelivr.net/gh/solunea/api-style@main/api';

// Tous les styles
const styles = await fetch(`${BASE}/styles.json`).then(r => r.json());

// Un style spécifique
const style = await fetch(`${BASE}/styles/${styles[0].id}.json`).then(r => r.json());
console.log(style.prompt, style.image);
```

## Déploiement

1. Modifier les styles (`npm run dev` pour l'interface admin, ou éditer `data/styles.json`)
2. Regénérer l'API : `npm run build`
3. Commit & push : les fichiers sont immédiatement accessibles via jsDelivr

> **Note** : jsDelivr met en cache les fichiers. Pour forcer un rafraîchissement, purgez le cache :  
> `https://purge.jsdelivr.net/gh/solunea/api-style@main/api/styles.json`
