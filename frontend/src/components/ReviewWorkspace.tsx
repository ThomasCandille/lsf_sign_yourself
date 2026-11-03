import axios from "axios";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminRequest } from "../api";
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

function Shrimp({ className = "" }: { className?: string }) {
  return <svg className={`shrimp-mascot ${className}`} viewBox="0 0 360 300" fill="none" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="180" cy="266" rx="103" ry="13" fill="#eaa396" opacity=".22" />
    <g className="shrimp-body">
      <path d="M111 85C81 53 45 58 39 30M129 78C111 30 81 16 59 21" stroke="#c85c59" strokeWidth="4" />
      <path d="M131 88C173 62 228 77 248 115C273 163 257 217 218 238C185 256 141 247 124 218C113 200 122 181 140 179C158 176 163 195 182 192C203 189 213 164 200 148C188 132 167 139 147 145C119 153 92 132 98 111C101 100 114 92 131 88Z" fill="#ffab96" stroke="#b94f50" strokeWidth="4" />
      <path d="M194 84Q177 105 180 134M224 99Q207 120 207 149M245 128Q225 140 216 160M250 161L220 174M242 197L216 188M219 226L202 201M186 241L184 211M150 235L160 207" stroke="#db7669" strokeWidth="4" />
      <path d="M143 211C119 219 99 206 88 218C79 230 93 242 115 238C97 250 107 267 121 263C141 258 147 236 143 211Z" fill="#f48083" stroke="#b94f50" strokeWidth="4" />
      <path d="M138 221L112 232M139 225L122 249" stroke="#b94f50" strokeWidth="3" />
      <path d="M157 145L139 158L153 163M178 145L163 160L178 166M202 164L187 176L198 183" stroke="#b94f50" strokeWidth="3" />
      <ellipse cx="121" cy="109" rx="7" ry="10" fill="#663d43" />
      <ellipse cx="151" cy="101" rx="7" ry="10" fill="#663d43" />
      <circle cx="123" cy="106" r="2.4" fill="white" />
      <circle cx="153" cy="98" r="2.4" fill="white" />
      <ellipse cx="112" cy="126" rx="10" ry="6" fill="#ed7b82" opacity=".75" />
      <ellipse cx="163" cy="118" rx="10" ry="6" fill="#ed7b82" opacity=".75" />
      <path d="M131 122Q139 133 148 119" stroke="#91464c" strokeWidth="3" />
      <path d="M174 91Q186 88 196 95" stroke="#ffd7bd" strokeWidth="6" />
    </g>
    <path className="shrimp-heart" d="M279 74C268 61 251 72 258 84L279 103L299 82C307 68 288 61 279 74Z" fill="#ec8798" />
    <path d="M70 165V181M62 173H78M294 183V195M288 189H300" stroke="#d5a760" strokeWidth="3" />
    <circle cx="300" cy="132" r="8" stroke="#9fc7c2" strokeWidth="3" />
    <circle cx="69" cy="216" r="5" stroke="#9fc7c2" strokeWidth="2" />
    <circle cx="88" cy="72" r="3" fill="#d5a760" />
  </svg>;
}

function ReferenceVideo({ word }: { word: ReferenceWord | null }) {
  const [failed, setFailed] = useState(false);
  return <div className="admin-video-panel">
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
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { handleError(error); }
    finally { setDownloading(false); }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await adminRequest(token, "/admin/logout", { method: "POST" });
      setToken("");
      setVideos([]);
      setSelected("");
    } catch (error) { handleError(error); }
    finally { setBusy(false); }
  }

  return <main className={`admin-page${token ? " is-connected" : ""}`}><div className="admin-shell">
    <header className="admin-header">
      <div className="shrimp-brand"><Shrimp className="shrimp-logo" /><div><h1>La petite crevetterie</h1><span>Workspace · Validation des vidéos LSF</span></div></div>
      <a href="/">Retour au site <span aria-hidden="true">↗</span></a>
    </header>
    <section className="shrimp-welcome" aria-labelledby="shrimp-title">
      <div className="shrimp-welcome-copy"><span className="shrimp-eyebrow">Le repaire des crevettes</span><h2 id="shrimp-title">Petites crevettes,<br /><em>grands gestes.</em></h2><p>Un œil attentif, deux petites antennes.<br />Chaque geste mérite sa place.</p></div>
      <div className="shrimp-portrait"><span className="shrimp-portrait-label">Votre collègue à antennes</span><Shrimp /><span className="shrimp-hello">Coucou ! ♡</span></div>
    </section>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {!token ? <form className="admin-login" onSubmit={login}>
      <span className="shrimp-eyebrow">Entrée de la crevetterie</span>
      <h2>Bienvenue à bord !</h2>
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
          <span className="admin-folder-label"><span className="shrimp-folder-icon" aria-hidden="true">{folder === "en_attente" ? "◷" : folder === "bon" ? "♡" : "↺"}</span>{labels[folder]}</span><span className="admin-folder-count">{videos.filter((video) => video.status === folder).length}</span>
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
      </section> : <div className="shrimp-empty"><Shrimp /><h3>Petite pause pour les antennes.</h3><p>Aucune vidéo dans ce dossier.</p></div>}
    </>}
    <footer className="shrimp-footer"><span>La petite crevetterie</span><span>Des gestes, du soin et beaucoup de crevettes ♡</span></footer>
  </div></main>;
}
