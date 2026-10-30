import axios from "axios";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminRequest } from "../api";
import "./AdminPage.css";

type Status = "en_attente" | "bon" | "pas_bon";
type Video = { path: string; name: string; status: Status; size: number };
const statuses: Status[] = ["en_attente", "bon", "pas_bon"];
const labels: Record<Status, string> = { en_attente: "En attente", bon: "Bon", pas_bon: "Pas bon" };

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return "Impossible de terminer cette opération. Réessayez.";
}

function AdminEmblem() {
  return <svg className="admin-emblem" viewBox="0 0 420 320" fill="none" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <filter id="admin-crayon" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="8" result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.5" />
      </filter>
    </defs>
    <g filter="url(#admin-crayon)">
      <path d="M21 278L70 273L127 281L185 274L254 280L323 272L399 279" stroke="#4c9f4b" strokeWidth="6" />
      <path d="M44 287L67 282M121 290L141 285M304 287L326 282M352 290L379 285" stroke="#80be52" strokeWidth="5" />
      <path d="M28 70L47 74M44 33L56 49M86 21L84 42M117 36L103 52M127 75L109 77M113 111L100 98M76 120L78 104M40 104L54 93" stroke="#efaf16" strokeWidth="5" />
      <path d="M58 59Q82 43 100 64Q117 90 88 98Q60 103 56 80Z" fill="#ffdc4f" stroke="#efaf16" strokeWidth="4" />
      <path d="M69 73L70 76M91 72L92 75M72 85Q81 94 92 84" stroke="#80572c" strokeWidth="3" />
      <path d="M271 45Q260 20 242 36Q225 29 221 48Q199 53 209 66L279 66Q295 49 271 45Z" stroke="#73b8df" strokeWidth="4" />
      <path d="M322 103L372 94L379 267L315 270Z" fill="#a8d5f0" stroke="#3377b5" strokeWidth="4" />
      <path d="M301 105L344 54L391 100L302 107" fill="#f47d67" stroke="#ce524a" strokeWidth="5" />
      <path d="M337 268L335 214L359 210L361 267M329 137L354 135L355 164L330 162Z" fill="#ffda51" stroke="#3377b5" strokeWidth="4" />
      <path d="M341 137L342 162M330 150L355 148" stroke="#3377b5" strokeWidth="3" />
      <path d="M169 112Q199 85 219 116Q235 151 202 163Q171 166 165 140Z" fill="#ffe2b9" stroke="#765745" strokeWidth="4" />
      <path d="M166 119L170 101L179 109L186 92L195 103L207 94L213 110L222 107" stroke="#a16237" strokeWidth="5" />
      <path d="M182 130L183 134M207 127L207 132M184 145Q196 156 209 141" stroke="#765745" strokeWidth="3" />
      <path d="M179 171L213 169L236 229L157 232Z" fill="#a293dc" stroke="#7854b4" strokeWidth="5" />
      <path d="M172 179L137 202L116 176M217 180L249 196L267 166" stroke="#765745" strokeWidth="5" />
      <path d="M177 234L171 269L153 273M216 233L225 268L243 269" stroke="#765745" strokeWidth="5" />
      <path d="M112 179L107 169M115 177L117 166M119 182L126 174M265 168L260 156M268 165L271 153M272 169L281 159" stroke="#765745" strokeWidth="3" />
      <path d="M80 271L83 226M83 247L67 238M82 254L98 242" stroke="#4c9f4b" strokeWidth="4" />
      <path d="M81 224C56 232 58 206 74 212C61 192 88 188 88 207C102 187 119 211 98 218C118 230 92 244 89 226Z" fill="#f7a6b9" stroke="#d96b89" strokeWidth="3" />
      <circle cx="85" cy="217" r="7" fill="#ffdc4f" stroke="#d99c27" strokeWidth="2" />
      <path d="M135 67L142 51L148 68L166 70L151 81L154 98L141 88L126 96L131 79L119 70Z" fill="#ffdb50" stroke="#e3aa2c" strokeWidth="3" />
      <path d="M287 233L294 221L298 233L312 236L300 244L300 256L289 247L278 251L282 239L273 233Z" fill="#f5a1b8" stroke="#d46b8b" strokeWidth="3" />
      <path d="M34 158Q46 145 55 157Q64 144 74 155" stroke="#3377b5" strokeWidth="3" />
    </g>
  </svg>;
}

export default function AdminPage() {
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

  return <main className="admin-page"><div className="admin-shell">
    <header className="admin-header">
      <div className="admin-brand"><span className="admin-brand-mark" aria-hidden="true">✎</span><div><span className="admin-eyebrow">LSF · Le coin des vidéos</span><h1>Administration des vidéos</h1></div></div>
      <a href="/">Retour au site <span aria-hidden="true">↗</span></a>
    </header>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {!token ? <section className="admin-welcome">
      <div className="admin-intro">
        <span className="admin-eyebrow">Mon petit atelier</span>
        <h2>On regarde,<br />on <em>range !</em></h2>
        <p>Des gestes, des vidéos<br />et plein de couleurs !</p>
        <AdminEmblem />
        <span className="admin-caption">Fait avec des crayons et beaucoup d’application.</span>
      </div>
      <form className="admin-login" onSubmit={login}>
      <span className="admin-eyebrow">Le coin des grands</span>
      <h2>Coucou, c’est toi ?</h2>
      <p className="admin-form-intro">Connecte-toi pour ranger les vidéos.</p>
      <label htmlFor="admin-username">Identifiant</label>
      <input id="admin-username" autoComplete="username" required maxLength={256} value={username} onChange={(e) => setUsername(e.target.value)} />
      <label htmlFor="admin-password">Mot de passe</label>
      <input id="admin-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn btn-primary" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button>
      <p className="admin-login-note">Prêt ? À toi de jouer !</p>
    </form></section> : <>
      <div className="admin-dashboard-heading"><div><span className="admin-eyebrow">1. On regarde · 2. On choisit · 3. On range</span><h2>La boîte à vidéos !</h2></div><span className="admin-total">{videos.length} vidéo{videos.length > 1 ? "s" : ""} dans la boîte</span></div>
      <div className="admin-actions admin-toolbar">
        <button className="btn btn-primary" onClick={download} disabled={downloading || busy}>{downloading ? "Préparation du ZIP…" : "Télécharger les 3 dossiers (ZIP)"}</button>
        <button className="btn btn-secondary" onClick={() => { setError(""); refresh().catch(handleError); }} disabled={busy}>Actualiser</button>
        <button className="btn btn-secondary" onClick={logout} disabled={busy || downloading}>Se déconnecter</button>
      </div>
      <nav className="admin-actions admin-folders" aria-label="Dossiers de vidéos">
        {statuses.map((folder) => <button key={folder} className={`btn ${status === folder ? "btn-primary" : "btn-secondary"}`} aria-pressed={status === folder} disabled={busy} onClick={() => { setStatus(folder); setSelected(""); setError(""); }}>
          <span className="admin-folder-label">{labels[folder]}</span><span className="admin-folder-count">{videos.filter((video) => video.status === folder).length}</span>
        </button>)}
      </nav>
      {current ? <section className="admin-review">
        <label htmlFor="admin-video-select">Vidéo à examiner</label>
        <select id="admin-video-select" value={current.path} disabled={busy} onChange={(e) => { setSelected(e.target.value); setError(""); }}>
          {filtered.map((video) => <option key={video.path} value={video.path}>{video.name}</option>)}
        </select>
        <p className="admin-filename">{current.name}</p>
        {preview ? <video key={preview} src={preview} controls playsInline preload="metadata" /> : <p>Chargement de la vidéo…</p>}
        <div className="admin-actions">
          {statuses.filter((folder) => folder !== status).map((folder) => <button key={folder} className="btn btn-secondary" disabled={busy || !preview} onClick={() => classify(folder)}>
            {folder === "en_attente" ? "Remettre en attente" : `Classer : ${labels[folder]}`}
          </button>)}
        </div>
      </section> : <div className="admin-empty"><span aria-hidden="true">✧</span><h3>Rien dans cette boîte !</h3><p>Aucune vidéo dans ce dossier.</p></div>}
    </>}
    <footer className="admin-footer"><span>Des petites mains, des grands gestes.</span><span aria-hidden="true">Dessiné avec application ☀</span></footer>
  </div></main>;
}
