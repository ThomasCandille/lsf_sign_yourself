import React from "react";
import "./Modal.css";

const tensorExampleImage = `${process.env.PUBLIC_URL}/lsf-tenseur-exemple.png`;

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
            pourront être transformées en tenseurs (coordonnées mathématiques
            des parties du corps) si elles sont assez qualitatives pour le
            modèle LSF.
          </li>
        </ul>

        <figure className="consent-tensor-example">
          <img
            src={tensorExampleImage}
            alt="Exemple de transformation d'une vidéo en tenseur de points du corps"
            width="706"
            height="691"
            loading="lazy"
            decoding="async"
          />
          <figcaption>
            Exemple de tenseur : la vidéo sert à extraire des points du corps
            utilisables par le modèle.
          </figcaption>
        </figure>

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
