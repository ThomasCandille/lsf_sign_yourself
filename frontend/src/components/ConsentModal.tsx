import React from "react";
import "./Modal.css";

interface Props {
  onAccept: () => void;
  onDecline: () => void;
}

export default function ConsentModal({ onAccept, onDecline }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Contribution au dataset LSF</h2>
        <p>
          Les vidéos que vous enregistrez seront converties en tenseurs de
          landmarks corporels (bâtons représentant les parties du corps) et
          utilisées pour entraîner un modèle de reconnaissance de la langue des
          signes française (LSF).
        </p>
        <div className="tensor-preview">
          <svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg">
            <line x1="100" y1="72" x2="100" y2="170" stroke="#4ade80" strokeWidth="3" strokeLinecap="round"/>
            <line x1="55" y1="100" x2="145" y2="100" stroke="#4ade80" strokeWidth="3" strokeLinecap="round"/>
            <line x1="55" y1="100" x2="28" y2="148" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="28" y1="148" x2="12" y2="195" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="145" y1="100" x2="172" y2="148" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="172" y1="148" x2="188" y2="195" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="100" y1="170" x2="78" y2="228" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="100" y1="170" x2="122" y2="228" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="100" cy="42" r="22" fill="none" stroke="#818cf8" strokeWidth="2.5"/>
            <circle cx="90" cy="37" r="2.5" fill="#60a5fa"/>
            <circle cx="110" cy="37" r="2.5" fill="#60a5fa"/>
            <circle cx="100" cy="44" r="2.5" fill="#f472b6"/>
            <circle cx="93" cy="53" r="2" fill="#f472b6"/>
            <circle cx="107" cy="53" r="2" fill="#f472b6"/>
            <circle cx="100" cy="72" r="3.5" fill="#94a3b8"/>
            <circle cx="55" cy="100" r="6" fill="#4ade80"/>
            <circle cx="145" cy="100" r="6" fill="#4ade80"/>
            <circle cx="28" cy="148" r="5" fill="#facc15"/>
            <circle cx="172" cy="148" r="5" fill="#facc15"/>
            <circle cx="12" cy="195" r="5" fill="#fb923c"/>
            <circle cx="188" cy="195" r="5" fill="#fb923c"/>
            <circle cx="84" cy="170" r="5" fill="#4ade80"/>
            <circle cx="116" cy="170" r="5" fill="#4ade80"/>
            <circle cx="78" cy="228" r="5" fill="#facc15"/>
            <circle cx="122" cy="228" r="5" fill="#facc15"/>
          </svg>
          <span className="tensor-caption">Données de position sauvegardées — aucune image conservée</span>
        </div>

        <p>
          <strong>Aucune vidéo brute</strong> n'est conservée — seules les
          données de position sont sauvegardées.
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onAccept}>
            J'accepte
          </button>
          <button className="btn btn-secondary" onClick={onDecline}>
            Je refuse
          </button>
        </div>
      </div>
    </div>
  );
}
