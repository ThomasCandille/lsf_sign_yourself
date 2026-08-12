import React, { useState } from "react";
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

function getSafeErrorMessage(err: any, fallback: string) {
  const detail = err.response?.data?.detail;
  return typeof detail === "string" && detail.length <= 180 ? detail : fallback;
}

export default function PseudoModal({ onConfirm }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = normalizePseudo(value);
    const validationError = getPseudoError(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await checkPseudo(trimmed);
      onConfirm(trimmed);
    } catch (err: any) {
      setError(getSafeErrorMessage(err, "Pseudo invalide"));
    } finally {
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
            onChange={(e) => setValue(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            spellCheck={false}
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || normalizePseudo(value).length < 2}
            >
              {loading ? "Vérification..." : "Continuer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
