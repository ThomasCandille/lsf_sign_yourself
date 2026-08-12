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
        <h2>Avant de contribuer</h2>
        <p className="modal-lead">
          Vous allez enregistrer de courtes vidéos de mots en langue des signes
          française. Les vidéos réelles que vous validez seront envoyées pour
          créer un jeu de données d'entraînement et de validation LSF.
        </p>

        <ul className="consent-list">
          <li>
            <strong>Avant envoi :</strong> la vidéo reste dans votre navigateur.
            Vous pourrez la regarder, la refaire ou la supprimer.
          </li>
          <li>
            <strong>Si vous validez :</strong> la vidéo brute est envoyée au
            serveur et conservée dans l'espace de stockage du projet pour une
            validation humaine de la qualité.
          </li>
          <li>
            <strong>Pour l'entraînement :</strong> après validation, les vidéos
            pourront être transformées en tenseurs si elles sont assez qualitatives pour le modèle LSF.
          </li>
        </ul>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onAccept}>
            J'ai compris et je contribue
          </button>
          <button className="btn btn-secondary" onClick={onDecline}>
            Je ne participe pas
          </button>
        </div>
      </div>
    </div>
  );
}
