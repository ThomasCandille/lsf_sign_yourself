import axios from "axios";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminRequest } from "../api";
import posthog from "../posthog";
import { Word } from "../types";
import "./ReviewWorkspace.css";

type Status = "en_attente" | "bon" | "pas_bon";
type ReferenceWord = Pick<Word, "id" | "label" | "video_url">;
type Video = { path: string; name: string; status: Status; size: number; reference_word: ReferenceWord | null };
const statuses: Status[] = ["en_attente", "bon", "pas_bon"];
const labels: Record<Status, string> = { en_attente: "En attente", bon: "Bon", pas_bon: "Pas bon" };

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return "Impossible de terminer cette opération. Réessayez.";
}

function ReferenceVideo({ word }: { word: ReferenceWord | null }) {
  const [failed, setFailed] = useState(false);
  return <div className="admin-video-panel is-reference">
    <h3>Vidéo de référence{word ? ` : ${word.label}` : ""}</h3>
    {word ? <>
      {!failed && <video src={word.video_url} controls loop autoPlay muted playsInline preload="metadata"
        aria-label={`Vidéo de référence : ${word.label}`} onError={() => setFailed(true)} />}
      {failed && <p role="status">Impossible de charger la vidéo de référence.</p>}
      <a className="admin-reference-link" href={word.video_url} target="_blank" rel="noreferrer">Ouvrir la référence dans un nouvel onglet ↗</a>
    </> : <p>Aucune référence disponible pour ce mot.</p>}
  </div>;
}

export default function ReviewWorkspace() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [status, setStatus] = useState<Status>("en_attente");
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const filtered = videos.filter((video) => video.status === status);
  const current = filtered.find((video) => video.path === selected) ?? filtered[0];
  const currentPath = current?.path;

  const handleError = useCallback((error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      setToken("");
      setVideos([]);
    }
    setError(errorMessage(error));
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await adminRequest<Video[]>(token, "/admin/videos");
    setVideos(data);
  }, [token]);

  useEffect(() => {
    if (token) refresh().catch(handleError);
  }, [token, refresh, handleError]);

  useEffect(() => {
    setPreview("");
    if (!token || !currentPath) return;
    const controller = new AbortController();
    let url = "";
    adminRequest<Blob>(token, "/admin/video", {
      params: { path: currentPath }, responseType: "blob", signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) {
        url = URL.createObjectURL(data);
        setPreview(url);
      }
    }).catch((error) => { if (!controller.signal.aborted) handleError(error); });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, currentPath, handleError]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await adminRequest<{ token: string }>("", "/admin/login", {
        method: "POST", data: { username, password },
      });
      setToken(data.token);
      posthog?.capture("admin_login_succeeded");
      setPassword("");
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  async function classify(nextStatus: Status) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await adminRequest(token, "/admin/classify", {
        method: "POST", data: { path: current.path, status: nextStatus },
      });
      await refresh();
      posthog?.capture("video_classification_succeeded", {
        moderation_status: nextStatus,
      });
      setSelected("");
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  async function download() {
    setDownloading(true);
    setError("");
    try {
      const { data } = await adminRequest<Blob>(token, "/admin/videos.zip", { responseType: "blob", timeout: 0 });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lsf-videos.zip";
      link.click();
      posthog?.capture("video_archive_downloaded");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { handleError(error); }
    finally { setDownloading(false); }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await adminRequest(token, "/admin/logout", { method: "POST" });
      posthog?.capture("admin_logout_succeeded");
      setToken("");
      setVideos([]);
      setSelected("");
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  return <main className="admin-page"><div className="admin-shell">
    <header className="admin-header">
      <h1>Administration des vidéos</h1>
      <a href="/">Retour au site</a>
    </header>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {!token ? <form className="admin-login" onSubmit={login}>
      <h2>Connexion</h2>
      <label htmlFor="admin-username">Identifiant</label>
      <input id="admin-username" autoComplete="username" required maxLength={256} value={username} onChange={(e) => setUsername(e.target.value)} />
      <label htmlFor="admin-password">Mot de passe</label>
      <input id="admin-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn btn-primary" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
    </form> : <>
      <div className="admin-actions admin-toolbar">
        <button className="btn btn-primary" onClick={download} disabled={downloading || busy}>{downloading ? "Préparation du ZIP…" : "Télécharger les 3 dossiers (ZIP)"}</button>
        <button className="btn btn-secondary" onClick={() => { setError(""); refresh().catch(handleError); }} disabled={busy}>Actualiser</button>
        <button className="btn btn-secondary" onClick={logout} disabled={busy || downloading}>Se déconnecter</button>
      </div>
      <nav className="admin-actions admin-folders" aria-label="Dossiers de vidéos">
        {statuses.map((folder) => <button key={folder} className={`btn ${status === folder ? "btn-primary" : "btn-secondary"}`} aria-pressed={status === folder} disabled={busy} onClick={() => { setStatus(folder); setSelected(""); setError(""); }}>
          <span>{labels[folder]}</span><span className="admin-folder-count">{videos.filter((video) => video.status === folder).length}</span>
        </button>)}
      </nav>
      {current ? <section className="admin-review">
        <label htmlFor="admin-video-select">Vidéo à examiner</label>
        <select id="admin-video-select" value={current.path} disabled={busy} onChange={(e) => { setSelected(e.target.value); setError(""); }}>
          {filtered.map((video) => <option key={video.path} value={video.path}>{video.reference_word?.label ?? "Mot inconnu"} — {video.name}</option>)}
        </select>
        <div className="admin-comparison">
          <div className="admin-video-panel">
            <h3>Vidéo de l’utilisateur{current.reference_word ? ` : ${current.reference_word.label}` : ""}</h3>
            {preview ? <video key={preview} src={preview} controls autoPlay muted playsInline preload="metadata" aria-label="Vidéo de l’utilisateur" /> : <p>Chargement de la vidéo…</p>}
          </div>
          <ReferenceVideo key={current.path} word={current.reference_word} />
        </div>
        <div className="admin-actions">
          {statuses.filter((folder) => folder !== status).map((folder) => <button key={folder} className="btn btn-secondary" disabled={busy || !preview} onClick={() => classify(folder)}>
            {folder === "en_attente" ? "Remettre en attente" : `Classer : ${labels[folder]}`}
          </button>)}
        </div>
      </section> : <p>Aucune vidéo dans ce dossier.</p>}
    </>}
  </div></main>;
}
