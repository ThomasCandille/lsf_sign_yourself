# lsf_sign_yourself

Le but de ce projet est de proposer aux utilisateurs de faire des gestes de la langue des signes française face à leur caméra pour collecter les vidéos réelles.

Au démarrage, une popup demande si l'utilisateur accepte que ses vidéos brutes soient enregistrées pour constituer un jeu de données d'entraînement et de validation LSF. Le site explique que la vidéo envoyée est la vidéo réelle validée par l'utilisateur, et que les tenseurs de points du corps, des mains et du visage pourront être produits plus tard dans la chaîne d'entraînement.

Une fois accepté, l'utilisation de la caméra est demandée. La page affiche la caméra de l'utilisateur avec un contour en overlay allant du buste à la tête pour aider au cadrage.

Une vidéo correspondant à un mot précis apparaît et un timer démarre. L'utilisateur effectue le geste pendant 2 secondes, puis peut revoir, refaire, supprimer ou envoyer sa vidéo.

La vidéo brute validée est ensuite enregistrée dans l'espace de stockage du projet avec le nom du mot correspondant. Pour rendre l'expérience ludique, un classement affiche le nombre de gestes effectués par utilisateur.

## Stockage des vidéos

Les vidéos sont stockées côté serveur en MP4 dans le dossier défini par `VIDEO_STORAGE_PATH`.
Le navigateur peut encore envoyer du WebM selon son support, mais le backend convertit ces vidéos en MP4 avant stockage et export admin.

En local, la valeur par défaut est :

```bash
VIDEO_STORAGE_PATH=./videos
DATABASE_URL=sqlite+aiosqlite:///./lsf.db
```

Depuis `backend/`, cela crée donc `backend/videos`. Ce dossier est ignoré par Git.

La conversion utilise FFmpeg via la dépendance Python `imageio-ffmpeg`.

## Administration et classement

Définissez les deux codes dans `backend/.env` (ou dans les variables du service backend en production) :

```bash
ADMIN_USERNAME=votre-identifiant
ADMIN_PASSWORD=votre-mot-de-passe-long-et-secret
```

Redémarrez le backend puis ouvrez `/admin` sur le site frontend. Les codes sont vérifiés uniquement côté backend ; aucune variable `REACT_APP_` ne doit les contenir. Utilisez HTTPS en production.

L'administrateur peut lire les vidéos, choisir **Bon** ou **Pas bon**, et corriger un classement, y compris remettre une vidéo en attente. Les trois dossiers sont créés sous `VIDEO_STORAGE_PATH` :

```text
videos/
  en_attente/
  bon/
  pas_bon/
```

Les nouvelles vidéos arrivent dans `en_attente/`. Au démarrage, les anciennes vidéos MP4/WebM à la racine (ou dans les anciens sous-dossiers) sont déplacées dans `en_attente/`, avec mise à jour de leurs chemins en base. Un conflit de noms arrête la migration sans écraser le fichier existant. Sauvegardez le stockage et la base avant le premier déploiement.

Le bouton **Télécharger les 3 dossiers (ZIP)** conserve cette arborescence et inclut les dossiers vides. Les fichiers sont déplacés physiquement dans le volume persistant : une récupération directe du volume conserve également leur classement.

Les sessions admin durent 8 heures et sont conservées en base ; la déconnexion les révoque. Le navigateur garde le jeton uniquement en mémoire : recharger la page demande une nouvelle connexion. Les vidéos et le ZIP nécessitent une session valide. Cinq échecs de connexion par adresse IP entraînent une attente de 5 minutes (compteur en mémoire par processus). L'ancien `ADMIN_DOWNLOAD_TOKEN` est remplacé par la connexion admin.

Pour un accès API, envoyez `POST /admin/login` avec un JSON `{"username":"…","password":"…"}`, puis le jeton reçu dans l'en-tête `Authorization: Bearer <token>` aux routes `/admin/videos`, `/admin/storage` ou `/admin/videos.zip`. `POST /admin/logout` révoque ce jeton.

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
ADMIN_USERNAME=votre-identifiant
ADMIN_PASSWORD=votre-mot-de-passe-long-et-secret
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

Ensuite, ouvrez `/admin` sur le frontend pour classer les vidéos et télécharger les trois dossiers dans une archive ZIP. Configurez l'hébergement frontend pour servir `index.html` sur `/admin` (réécriture SPA).
