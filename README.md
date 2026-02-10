# API Style

API statique JSON pour gérer des styles (image Arweave, prompt, titre, description).  
Hébergée sur Git, accessible depuis n'importe quelle application web JS.

## Structure

```
api-style/
├── data/
│   └── styles.json           # Données source (éditer ici)
├── api/
│   ├── styles.json           # Liste de tous les styles (généré)
│   └── styles/
│       └── {id}.json         # Détail d'un style (généré)
├── scripts/
│   ├── build.js              # Génère les fichiers API
│   ├── add-style.js          # Assistant interactif (avec upload Arweave)
│   ├── upload-arweave.js     # Upload d'image vers Arweave
│   └── check-balance.js      # Vérifier le solde du wallet
├── wallet.json               # ⚠️ Wallet Arweave JWK (gitignored)
└── package.json
```

## Format d'un style

```json
{
  "id": "cyberpunk-neon",
  "title": "Cyberpunk Neon",
  "description": "Style futuriste avec des néons vibrants.",
  "prompt": "cyberpunk neon city, vibrant colors, dark atmosphere",
  "image": "https://arweave.net/TX_ID",
  "tags": ["cyberpunk", "neon"],
  "createdAt": "2026-02-10T10:00:00Z"
}
```

## Configuration Arweave

### 1. Wallet

Placez votre fichier wallet Arweave (JWK) à la racine du projet :

```
wallet.json   ← gitignored automatiquement
```

Vous pouvez obtenir un wallet sur :
- [arweave.app](https://arweave.app)
- [ArConnect](https://www.arconnect.io) (extension navigateur)

### 2. Vérifier le solde

```bash
npm run balance
```

### 3. Upload une image seule

```bash
npm run upload -- images/mon-image.png
```

Retourne l'URL Arweave (`https://arweave.net/<TX_ID>`).

## Utilisation

### Ajouter un style (avec upload intégré)

```bash
npm run add
```

L'assistant interactif demande les infos du style. Pour l'image, vous pouvez fournir :
- **Un chemin local** (`images/mon-image.png`) → upload automatique vers Arweave
- **Une URL Arweave existante** (`https://arweave.net/...`) → utilisée directement

Puis régénérez l'API :

```bash
npm run build
```

### Ajouter manuellement

Éditer `data/styles.json` puis lancer `npm run build`.

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
