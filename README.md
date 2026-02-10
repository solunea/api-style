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

### Endpoints

Une fois sur GitHub, les fichiers sont accessibles via GitHub Pages ou raw :

| Endpoint | Description |
|---|---|
| `api/styles.json` | Liste de tous les styles (sans prompt) |
| `api/styles/{id}.json` | Détail complet d'un style |

### Exemple depuis une app JS

```js
// Tous les styles
const res = await fetch('https://<user>.github.io/api-style/api/styles.json');
const styles = await res.json();

// Un style spécifique
const detail = await fetch(`https://<user>.github.io/api-style/api/styles/${styles[0].id}.json`);
const style = await detail.json();
console.log(style.prompt, style.image);
```

## Déploiement

1. Créer un repo GitHub
2. Push le projet
3. Activer **GitHub Pages** (branche `main`, dossier `/` ou `/api`)
4. L'API est accessible publiquement

Alternativement, utiliser les URLs raw de GitHub :
```
https://raw.githubusercontent.com/<user>/api-style/main/api/styles.json
```

## CORS

Les fichiers statiques sur GitHub Pages sont servis avec les bons headers CORS.  
Pour les URLs `raw.githubusercontent.com`, utiliser un proxy CORS si nécessaire, ou préférer GitHub Pages.
