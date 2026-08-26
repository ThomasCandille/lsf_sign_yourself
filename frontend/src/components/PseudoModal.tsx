import React, { useRef, useState } from "react";
import { checkPseudo } from "../api";
import "./Modal.css";

interface Props {
  onConfirm: (pseudo: string) => void;
}

const PSEUDO_PATTERN = /^[\p{L}\p{N} ._'’-]{2,20}$/u;

function normalizePseudo(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function getPseudoError(pseudo: string) {
  if (pseudo.length < 2 || pseudo.length > 20) {
    return "Le pseudo doit faire entre 2 et 20 caractères";
  }
  if (!PSEUDO_PATTERN.test(pseudo)) {
    return "Utilisez uniquement lettres, chiffres, espaces, tirets, points, apostrophes ou underscores.";
  }
  return "";
}

function getPseudoRequestError(err: any) {
  const detail = err.response?.data?.detail;
  if (typeof detail === "string" && detail.length <= 180) {
    return detail;
  }
  if (err.code === "ECONNABORTED") {
    return "La vérification du pseudo a pris trop de temps. Réessayez.";
  }
  if (!err.response) {
    return "Impossible de vérifier le pseudo. Vérifiez votre connexion puis réessayez.";
  }
  if (err.response.status >= 500) {
    return "Le serveur ne peut pas vérifier le pseudo pour le moment. Réessayez dans un instant.";
  }
  return "Pseudo invalide";
}

export default function PseudoModal({ onConfirm }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isCheckingPseudoRef = useRef(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    if (error) {
      setError("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isCheckingPseudoRef.current) {
      return;
    }

    const trimmed = normalizePseudo(value);
    const validationError = getPseudoError(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    isCheckingPseudoRef.current = true;
    setLoading(true);
    setError("");
    try {
      await checkPseudo(trimmed);
      onConfirm(trimmed);
    } catch (err: any) {
      const requestError = getPseudoRequestError(err);
      setError(requestError);
    } finally {
      isCheckingPseudoRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Choisissez votre pseudo</h2>
        <form onSubmit={handleSubmit}>
          <input
            className="pseudo-input"
            type="text"
            placeholder="Votre pseudo (2–20 caractères)"
            value={value}
            onChange={handleChange}
            maxLength={20}
            autoComplete="nickname"
            spellCheck={false}
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "pseudo-error-feedback" : undefined}
          />
          {error && (
            <p
              id="pseudo-error-feedback"
              className="error"
              role="alert"
              aria-live="polite"
            >
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "Vérification..." : "Continuer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
