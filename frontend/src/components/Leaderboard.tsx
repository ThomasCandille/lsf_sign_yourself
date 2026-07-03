import React, { useEffect, useState } from "react";
import { fetchLeaderboard } from "../api";
import { LeaderboardEntry } from "../types";
import "./Leaderboard.css";

interface Props {
  pseudo: string;
  onBack: () => void;
}

export default function Leaderboard({ pseudo, onBack }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="leaderboard-page">
      <button className="btn-back" onClick={onBack}>
        ← Retour
      </button>
      <h1>Classement</h1>
      <p className="lb-subtitle">Nombre de mots signés par joueur</p>

      {loading ? (
        <p className="lb-loading">Chargement…</p>
      ) : entries.length === 0 ? (
        <p className="lb-empty">Aucun score pour l'instant.</p>
      ) : (
        <ol className="lb-list">
          {entries.map((e, i) => (
            <li
              key={e.pseudo}
              className={`lb-entry ${e.pseudo === pseudo ? "lb-entry--me" : ""}`}
            >
              <span className="lb-rank">#{i + 1}</span>
              <span className="lb-pseudo">{e.pseudo}</span>
              <span className="lb-score">{e.count} mot{e.count > 1 ? "s" : ""}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
