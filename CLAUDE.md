# CLAUDE.md

## Contexte du projet

Application web de collecte de données LSF (Langue des Signes Française).
Les utilisateurs signent des mots face à leur caméra. Les vidéos sont converties en tenseurs de landmarks corporels (MediaPipe Holistic) et uploadées sur Google Drive pour entraîner un modèle de reconnaissance LSF.

Aucune vidéo brute n'est conservée — seuls les fichiers `.npy` (numpy) sont stockés.

## Rôle attendu de l'agent

- Répondre en français, sauf demande explicite contraire.
- Rester pragmatique et factuel.
- Ne pas développer sans demande explicite.
- Ne pas ajouter de dépendances, de fichiers techniques ou de fonctionnalités sans validation claire.
- Pour les demandes larges, proposer d'abord un plan court avant de coder.
- Lire les fichiers existants avant toute modification.
- Ne jamais supprimer, déplacer ou réécrire un fichier existant sans demande explicite.
- Garder les modifications petites, justifiées et directement reliées à la demande.
- Signaler clairement ce qui n'a pas été fait.

## Stack technique

### Backend

- Langage : Python 3.11 (mediapipe ne supporte pas Python 3.12+)
- Framework : FastAPI avec uvicorn
- Extraction de pose : MediaPipe Holistic (33 pose + 21 main gauche + 21 main droite + 468 visage = 543 landmarks × 3 coordonnées)
- Tenseurs : NumPy `.npy`, shape `(N_frames, 543, 3)` en float32
- Base de données : SQLite via SQLAlchemy async + aiosqlite
- Upload : Google Drive API v3 avec service account (fichier `backend/service_account.json`)
- Validation pseudo : liste de mots vulgaires français dans `backend/profanity.py`
- Variables d'environnement : `backend/.env` (ne jamais commiter)

### Frontend

- Framework : React 19 avec TypeScript strict
- Bundler : Create React App (react-scripts)
- HTTP : axios
- Caméra : API navigateur `getUserMedia` + `MediaRecorder`
- Format vidéo enregistré : `video/webm;codecs=vp8`, 640×480, 30fps, 2 secondes
- Aucune lib de state management — useState/useRef suffisent

### Infrastructure

- Tenseurs uploadés dans un dossier Google Drive partagé avec le service account
- Le dossier Drive est configuré via `GOOGLE_DRIVE_FOLDER_ID` dans `backend/.env`
- Si l'upload Drive échoue, aucun enregistrement local — l'opération est abandonnée

## Structure des fichiers

```
backend/
  api.py              # FastAPI — routes /words /check-pseudo /upload /leaderboard
  words.py            # 20 mots LSF hardcodés avec URLs vidéo Elix (OVH CDN)
  pose.py             # MediaPipe → tenseur NumPy
  drive.py            # Upload .npy sur Google Drive
  database.py         # SQLite async — table scores (pseudo, count)
  profanity.py        # Filtre vulgarité français
  requirements.txt    # Dépendances Python
  .env.example        # Template d'environnement
  .env                # Variables réelles — NE PAS COMMITER
  service_account.json # Clé Google — NE PAS COMMITER

frontend/src/
  App.tsx             # Machine d'états : consent → pseudo → signing → leaderboard
  types.ts            # Types TypeScript partagés (Word, LeaderboardEntry, AppStep)
  api.ts              # Client axios vers le backend
  components/
    ConsentModal.tsx  # Popup de consentement dataset
    PseudoModal.tsx   # Saisie et validation du pseudo
    CameraView.tsx    # Webcam + overlay SVG buste→tête (forwardRef)
    SigningScreen.tsx # Vidéo de référence Elix + countdown 3s + enregistrement 2s
    Leaderboard.tsx   # Classement top 20
```

## Flux utilisateur

1. **Consentement** — l'utilisateur accepte que ses données soient utilisées pour entraîner un modèle
2. **Pseudo** — saisie d'un pseudo (2–20 chars, validé contre la liste de vulgarité côté backend)
3. **Signature** — boucle :
   - Affichage du mot à signer + vidéo de référence Elix en lecture automatique
   - Bouton "Démarrer" → countdown 3s → enregistrement 2s → upload → confirmation
   - Le bouton "Mot suivant" passe au mot suivant (rotation dans la liste des 20)
4. **Leaderboard** — accessible depuis l'écran de signature, affiche le top 20 par nombre de mots signés

## Les 20 mots LSF

Hardcodés dans `backend/words.py` avec leurs URLs vidéo depuis le CDN Elix (`elix-lsf.s3.rbx.io.cloud.ovh.net`).

API Elix utilisée pour découverte : `https://api.elix-lsf.fr/words?q=<mot>` (non authentifiée, non documentée publiquement).

Liste : bonjour, au revoir, merci, oui, non, comment, nom, habiter, travailler, manger, boire, aimer, famille, maison, ami, comprendre, parler, jour, nuit, eau.

## Règles de décision technique

- Ne pas remplacer MediaPipe par une autre lib sans raison explicite — c'est le standard pour l'extraction de pose en Python.
- Ne pas stocker les vidéos brutes — seuls les tenseurs `.npy` sont conservés.
- Ne pas ajouter de lib de state management côté frontend — la complexité ne le justifie pas.
- Ne pas passer à PostgreSQL sans demande — SQLite suffit pour le leaderboard.
- Ne pas stocker `service_account.json` ni `.env` dans le dépôt git.
- Ne pas modifier la liste des 20 mots sans vérifier que la vidéo Elix est disponible via l'API.
- Toute nouvelle dépendance Python doit être compatible avec Python 3.11.

## Conventions établies

### Composant CameraView

`CameraView` expose une ref via `forwardRef` avec deux méthodes : `startRecording()` et `stopRecording(): Promise<Blob>`. Ne pas changer cette interface sans mettre à jour `SigningScreen` en conséquence.

### Upload

L'endpoint `POST /upload` reçoit un `multipart/form-data` avec les champs `word_id` (string), `pseudo` (string) et `video` (fichier webm). Il retourne `{ ok: true, count: number }` où `count` est le nouveau total de mots signés pour ce pseudo.

### Leaderboard

Le score est le nombre total de mots signés par pseudo, incrémenté à chaque upload réussi. Pas de déduplication par mot — signer "bonjour" dix fois compte pour dix.

### Tenseur

Shape finale : `(N_frames, 543, 3)` en float32. Si MediaPipe ne détecte pas de landmarks pour un frame donné, les coordonnées sont `0.0`. Le fichier est sauvegardé avec `np.save()` et nommé `{word_id}__{pseudo}.npy` sur Drive.

## Prérequis avant lancement

1. `backend/service_account.json` — clé JSON du compte de service Google Cloud avec accès Drive
2. `backend/.env` avec `GOOGLE_SERVICE_ACCOUNT_JSON` et `GOOGLE_DRIVE_FOLDER_ID`
3. Python 3.11 pour le venv backend (`mediapipe` refuse Python 3.12+)
4. Le dossier Google Drive doit être partagé en écriture avec l'email du service account

## Lancement

```bash
# Backend
cd backend && source .venv/bin/activate && uvicorn api:app --reload

# Frontend
cd frontend && npm start
```

Backend : http://localhost:8000  
Frontend : http://localhost:3000
