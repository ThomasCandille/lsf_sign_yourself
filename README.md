# LSF Sign Yourself

Application web de collecte de vidéos de langue des signes française (LSF). Un
participant accepte la collecte, saisit un pseudo, réalise le signe demandé
devant sa caméra, puis peut revoir et envoyer sa vidéo. Les contributions sont
comptabilisées dans un classement.

La vidéo envoyée reste la vidéo réelle validée par le participant. Le backend
la convertit en MP4 avant de la stocker ; les tenseurs de points du corps, des
mains et du visage pourront être produits ultérieurement dans la chaîne de
traitement des données.

## Architecture

- `backend/` : API FastAPI, base SQLite asynchrone, validation des pseudos et
  des vidéos, classement et stockage des fichiers.
- `frontend/` : interface React/TypeScript créée avec Create React App.
- `backend/words.py` : liste des mots/signes proposés.
- `backend/videos/` : vidéos locales produites par défaut (ignoré par Git).
- `backend/lsf.db` : base SQLite locale produite par défaut.

L'API expose notamment :

- `GET /words` pour récupérer les mots, triés selon le nombre de contributions ;
- `POST /check-pseudo` pour valider un pseudo ;
- `POST /upload` pour envoyer une vidéo WebM ou MP4 ;
- `GET /leaderboard` pour récupérer les 20 meilleurs contributeurs ;
- `GET /admin/storage` et `GET /admin/videos.zip` pour l'administration.

## Pré-requis

- Node.js et npm ;
- Python 3.10 ou supérieur ;
- un navigateur autorisant l'accès à la caméra ;
- FFmpeg. La dépendance `imageio-ffmpeg` fournit un binaire pour la conversion
  dans la plupart des environnements ; un binaire système peut aussi être
  utilisé avec `FFMPEG_BINARY`.

## Installation

Installer les dépendances du frontend et de l'outillage racine :

```bash
npm install
cd frontend && npm install
```

Créer l'environnement Python du backend et installer ses dépendances :

### Linux et macOS

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
.venv/bin/pip install -r requirements.txt
```

### Windows PowerShell

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Si PowerShell bloque l'activation des scripts, exécuter une fois cette
commande dans PowerShell en tant qu'utilisateur :

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Windows Invite de commandes

```bat
cd backend
py -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements.txt
```

## Lancement en local

Depuis la racine du projet, démarrer les deux services en parallèle :

```bash
npm run start-all
```

Ou les lancer séparément :

Linux et macOS :

```bash
npm run backend
npm run frontend
```

Windows PowerShell :

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn api:app --reload --port 8000
```

Dans un second terminal, depuis la racine du projet :

```powershell
npm run frontend
```

Le script racine `npm run backend` utilise `.venv/bin/uvicorn` et est donc
prévu pour Linux et macOS. Sous Windows, utiliser la commande PowerShell
ci-dessus ou adapter le script avec `.venv\Scripts\uvicorn.exe`.

L'interface est disponible sur `http://localhost:3000` et l'API sur
`http://localhost:8000`. Le backend utilise le rechargement automatique avec
`npm run backend`.

Pour pointer le frontend vers une autre API, définir avant son démarrage :

```bash
REACT_APP_API_BASE_URL=http://localhost:8000
```

## Configuration du backend

Les valeurs par défaut sont adaptées au développement local :

```bash
VIDEO_STORAGE_PATH=./videos
DATABASE_URL=sqlite+aiosqlite:///./lsf.db
ALLOWED_HOSTS=localhost,127.0.0.1,testserver
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Les chemins relatifs sont évalués depuis `backend/`. Les variables utiles sont :

| Variable                    | Rôle                                                | Valeur par défaut                             |
| --------------------------- | --------------------------------------------------- | --------------------------------------------- |
| `VIDEO_STORAGE_PATH`        | Dossier des vidéos converties en MP4                | `./videos`                                    |
| `DATABASE_URL`              | URL de connexion SQLAlchemy                         | `sqlite+aiosqlite:///./lsf.db`                |
| `ALLOWED_HOSTS`             | Hôtes acceptés, séparés par des virgules            | `localhost,127.0.0.1,testserver`              |
| `ALLOWED_ORIGINS`           | Origines CORS autorisées, séparées par des virgules | `http://localhost:3000,http://127.0.0.1:3000` |
| `ADMIN_DOWNLOAD_TOKEN`      | Protège les routes admin                            | vide, routes désactivées                      |
| `MAX_VIDEO_BYTES`           | Taille maximale d'une vidéo                         | `26214400` (25 MiB)                           |
| `RATE_LIMIT_WINDOW_SECONDS` | Fenêtre du rate limit                               | `60`                                          |
| `RATE_LIMIT_MAX_REQUESTS`   | Nombre maximal de requêtes par fenêtre et par IP    | `120`                                         |
| `FFMPEG_BINARY`             | Chemin explicite vers FFmpeg                        | détection automatique                         |

Un fichier `.env` peut être placé dans `backend/`; il est chargé au démarrage
de l'API.

## Stockage et export des vidéos

Le navigateur peut envoyer du WebM ou du MP4. Le serveur convertit chaque
fichier en MP4 standardisé (640x480, 30 images/s, sans piste audio) avant de
l'enregistrer dans `VIDEO_STORAGE_PATH`. La base conserve le mot, le pseudo et
le chemin du fichier.

Pour activer l'export administrateur, définir un secret suffisamment long :

```bash
ADMIN_DOWNLOAD_TOKEN=un-token-long-et-secret
```

Consulter le nombre de vidéos et leur taille :

```bash
curl -H "Authorization: Bearer $ADMIN_DOWNLOAD_TOKEN" \
  http://localhost:8000/admin/storage
```

Télécharger toutes les vidéos dans une archive ZIP :

```bash
curl -L -H "Authorization: Bearer $ADMIN_DOWNLOAD_TOKEN" \
  http://localhost:8000/admin/videos.zip \
  -o lsf-videos.zip
```

Le token ne doit pas être exposé dans le frontend ni versionné dans Git.

## Déploiement sur Render

Le système de fichiers Render étant éphémère par défaut, un disque persistant
est nécessaire pour conserver les vidéos et la base SQLite.

1. Créer le backend comme Web Service et ajouter un Persistent Disk monté sur
   `/var/data`.
2. Installer les dépendances avec `pip install -r backend/requirements.txt`.
3. Utiliser la commande de démarrage suivante :

```bash
cd backend && uvicorn api:app --host 0.0.0.0 --port $PORT
```

4. Définir les variables du backend :

```bash
VIDEO_STORAGE_PATH=/var/data/videos
DATABASE_URL=sqlite+aiosqlite:////var/data/lsf.db
ADMIN_DOWNLOAD_TOKEN=un-token-long-et-secret
ALLOWED_HOSTS=nom-du-backend.onrender.com
ALLOWED_ORIGINS=https://url-du-frontend.onrender.com
```

5. Déployer le frontend comme service séparé et définir :

```bash
REACT_APP_API_BASE_URL=https://url-du-backend.onrender.com
```

Pour exporter les vidéos depuis Render :

```bash
curl -L -H "Authorization: Bearer $ADMIN_DOWNLOAD_TOKEN" \
  https://url-du-backend.onrender.com/admin/videos.zip \
  -o lsf-videos.zip
```

## Scripts disponibles

Depuis la racine :

| Commande            | Action                                                        |
| ------------------- | ------------------------------------------------------------- |
| `npm run frontend`  | Lance le serveur de développement React                       |
| `npm run backend`   | Lance FastAPI avec rechargement automatique                   |
| `npm run start-all` | Lance le frontend et le backend en parallèle                  |
| `npm run prettier`  | Formate les fichiers JavaScript, TypeScript, JSON et Markdown |

Depuis `frontend/`, `npm test` lance les tests React et `npm run build` produit
le build de production dans `frontend/build/`.
