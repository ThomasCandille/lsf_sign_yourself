# lsf_sign_yourself

Le but de ce projet est de proposer aux utilisateurs de faire des gestes de la langue des signes française face à leur caméra pour collecter les vidéos réelles.

Au démarrage, une popup demande si l'utilisateur accepte que ses vidéos brutes soient enregistrées pour constituer un jeu de données d'entraînement et de validation LSF. Le site explique que la vidéo envoyée est la vidéo réelle validée par l'utilisateur, et que les tenseurs de points du corps, des mains et du visage pourront être produits plus tard dans la chaîne d'entraînement.

Une fois accepté, l'utilisation de la caméra est demandée. La page affiche la caméra de l'utilisateur avec un contour en overlay allant du buste à la tête pour aider au cadrage.

Une vidéo correspondant à un mot précis apparaît et un timer démarre. L'utilisateur effectue le geste pendant 2 secondes, puis peut revoir, refaire, supprimer ou envoyer sa vidéo.

La vidéo brute validée est ensuite enregistrée dans l'espace de stockage du projet avec le nom du mot correspondant. Pour rendre l'expérience ludique, un classement affiche le nombre de gestes effectués par utilisateur.

## Stockage des vidéos

Les vidéos sont stockées côté serveur dans le dossier défini par `VIDEO_STORAGE_PATH`.

En local, la valeur par défaut est :

```bash
VIDEO_STORAGE_PATH=./videos
DATABASE_URL=sqlite+aiosqlite:///./lsf.db
```

Depuis `backend/`, cela crée donc `backend/videos`. Ce dossier est ignoré par Git.

Pour récupérer les vidéos depuis l'API, définissez un token admin :

```bash
ADMIN_DOWNLOAD_TOKEN=un-token-long-et-secret
```

Puis téléchargez toutes les vidéos en zip :

```bash
curl -L \
  -H "Authorization: Bearer $ADMIN_DOWNLOAD_TOKEN" \
  http://localhost:8000/admin/videos.zip \
  -o lsf-videos.zip
```

Pour vérifier le dossier utilisé et le nombre de vidéos :

```bash
curl \
  -H "Authorization: Bearer $ADMIN_DOWNLOAD_TOKEN" \
  http://localhost:8000/admin/storage
```

## Déploiement Render

Sur Render, le filesystem est éphémère par défaut : sans disque persistant, les vidéos enregistrées seront perdues lors d'un redéploiement ou d'un redémarrage.

Configuration recommandée :

1. Créer le backend comme Web Service.
2. Ajouter un Persistent Disk au service backend.
3. Monter le disque sur `/var/data`.
4. Définir les variables d'environnement backend :

```bash
VIDEO_STORAGE_PATH=/var/data/videos
DATABASE_URL=sqlite+aiosqlite:////var/data/lsf.db
ADMIN_DOWNLOAD_TOKEN=un-token-long-et-secret
ALLOWED_HOSTS=nom-du-backend.onrender.com
ALLOWED_ORIGINS=https://url-du-frontend.onrender.com
```

5. Utiliser ce start command pour le backend :

```bash
cd backend && uvicorn api:app --host 0.0.0.0 --port $PORT
```

6. Côté frontend, définir :

```bash
REACT_APP_API_BASE_URL=https://url-du-backend.onrender.com
```

Ensuite, pour récupérer les vidéos depuis Render :

```bash
curl -L \
  -H "Authorization: Bearer $ADMIN_DOWNLOAD_TOKEN" \
  https://url-du-backend.onrender.com/admin/videos.zip \
  -o lsf-videos.zip
```
