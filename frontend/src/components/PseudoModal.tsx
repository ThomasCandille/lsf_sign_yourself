import React, { useState } from "react";
import { checkPseudo } from "../api";
import "./Modal.css";

interface Props {
  onConfirm: (pseudo: string) => void;
}

export default function PseudoModal({ onConfirm }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      await checkPseudo(trimmed);
      onConfirm(trimmed);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Pseudo invalide");
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
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || value.trim().length < 2}
            >
              {loading ? "Vérification..." : "Continuer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
