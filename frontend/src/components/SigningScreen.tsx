import React, { useRef, useState, useEffect, useCallback } from "react";
import CameraView, { CameraViewHandle } from "./CameraView";
import { Word, LeaderboardEntry } from "../types";
import { uploadSign, fetchLeaderboard } from "../api";
import "./SigningScreen.css";

type Phase =
  | "loading"
  | "ready"
  | "countdown"
  | "recording"
  | "review"
  | "uploading"
  | "success"
  | "error";

interface Props {
  word: Word;
  pseudo: string;
  totalSigned: number;
  onSigned: (newCount: number) => void;
  onNext: () => void | Promise<void>;
}

const COUNTDOWN_SEC = 3;
const RECORD_SEC = 2;

function getSafeErrorMessage(err: any, fallback: string) {
  const detail = err.response?.data?.detail;
  return typeof detail === "string" && detail.length <= 180 ? detail : fallback;
}

export default function SigningScreen({
  word,
  pseudo,
  totalSigned,
  onSigned,
  onNext,
}: Props) {
  const cameraRef = useRef<CameraViewHandle>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isChoosingNext, setIsChoosingNext] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const sampleCount = word.sample_count ?? 0;
  const sampleLabel = `${sampleCount} échantillon${sampleCount > 1 ? "s" : ""}`;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const discardRecording = useCallback(() => {
    clearTimer();
    setRecordedBlob(null);
    setErrorMessage("");
    setPhase(isCameraReady ? "ready" : "loading");
  }, [clearTimer, isCameraReady]);

  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    setPhase("ready");
  }, []);
  const handleCameraError = useCallback((msg: string) => {
    setCameraError(msg);
    setErrorMessage(msg);
    setPhase("error");
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (!recordedBlob) {
      setPreviewUrl("");
      return;
    }

    const url = URL.createObjectURL(recordedBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordedBlob]);

  useEffect(() => {
    clearTimer();
    setRecordedBlob(null);
    setErrorMessage("");
    if (!cameraError) setPhase(isCameraReady ? "ready" : "loading");
  }, [cameraError, clearTimer, isCameraReady, word.id]);

  useEffect(() => {
    fetchLeaderboard()
      .then(setLeaderboard)
      .catch(() => {});
  }, [totalSigned]);

  function startCountdown() {
    clearTimer();
    setRecordedBlob(null);
    setErrorMessage("");
    setPhase("countdown");
    setCountdown(COUNTDOWN_SEC);

    let remaining = COUNTDOWN_SEC;
    const tick = () => {
      remaining--;
      if (remaining <= 0) {
        setCountdown(0);
        startRecording();
      } else {
        setCountdown(remaining);
        timerRef.current = setTimeout(tick, 1000);
      }
    };
    timerRef.current = setTimeout(tick, 1000);
  }

  function startRecording() {
    setPhase("recording");
    cameraRef.current?.startRecording();
    timerRef.current = setTimeout(async () => {
      try {
        const blob = (await cameraRef.current?.stopRecording()) ?? new Blob([]);
        if (blob.size === 0) {
          throw new Error("empty-video");
        }
        setRecordedBlob(blob);
        setPhase("review");
      } catch {
        setErrorMessage("La vidéo est vide ou illisible. Réessayez.");
        setPhase("error");
      }
    }, RECORD_SEC * 1000);
  }

  async function uploadRecording() {
    if (!recordedBlob) return;
    setPhase("uploading");
    setErrorMessage("");
    try {
      const { count } = await uploadSign(word.id, pseudo, recordedBlob);
      onSigned(count);
      setRecordedBlob(null);
      setPhase("success");
    } catch (err: any) {
      setErrorMessage(
        getSafeErrorMessage(
          err,
          "L'envoi a échoué. Vous pouvez réessayer ou supprimer cette vidéo.",
        ),
      );
      setPhase("error");
    }
  }

  async function handleNextWord() {
    setIsChoosingNext(true);
    try {
      await onNext();
      setRecordedBlob(null);
      setErrorMessage("");
      setPhase(isCameraReady ? "ready" : "loading");
    } finally {
      setIsChoosingNext(false);
    }
  }

  return (
    <div className="signing-screen">
      <div className="signing-layout">
        {/* Colonne gauche : référence + classement */}
        <div className="signing-left">
          <div className="word-reference">
            <p className="word-label">Signer le mot :</p>
            <h2 className="word-title">{word.label}</h2>
            <div className="word-meta">
              <span>{sampleLabel}</span>
              <span>mot prioritaire</span>
            </div>
            <p className="word-priority-note">
              Ce mot est proposé maintenant parce qu'il manque d'exemples dans
              le dataset.
            </p>
            <video
              src={word.video_url}
              autoPlay
              loop
              muted
              playsInline
              className="reference-video"
            />
          </div>

          <div className="inline-leaderboard">
            <h3 className="lb-inline-title">Classement</h3>
            <p className="my-score">
              Vos mots : <strong>{totalSigned}</strong>
            </p>
            {leaderboard.length === 0 ? (
              <p className="lb-inline-empty">Aucun score.</p>
            ) : (
              <ol className="lb-inline-list">
                {leaderboard.slice(0, 10).map((e, i) => (
                  <li
                    key={e.pseudo}
                    className={`lb-inline-entry ${e.pseudo === pseudo ? "lb-inline-entry--me" : ""}`}
                  >
                    <span className="lb-inline-rank">#{i + 1}</span>
                    <span className="lb-inline-pseudo">{e.pseudo}</span>
                    <span className="lb-inline-score">{e.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Colonne droite : caméra + actions */}
        <div className="signing-right">
          <div className="camera-section">
            <CameraView
              ref={cameraRef}
              onReady={handleCameraReady}
              onError={handleCameraError}
            />
            {phase === "countdown" && (
              <div className="countdown-overlay">
                <span>{countdown === 0 ? "GO !" : countdown}</span>
              </div>
            )}
            {phase === "recording" && (
              <div className="recording-indicator">
                <span className="rec-dot" /> Enregistrement…
              </div>
            )}
            {phase === "review" && previewUrl && (
              <div className="preview-overlay">
                <video
                  src={previewUrl}
                  controls
                  muted
                  playsInline
                  className="recording-preview"
                />
              </div>
            )}
          </div>

          <div className="signing-actions">
            {phase === "ready" && (
              <button
                className="btn btn-primary btn-large"
                onClick={startCountdown}
              >
                Démarrer
              </button>
            )}
            {phase === "countdown" && (
              <button className="btn btn-secondary" onClick={discardRecording}>
                Annuler
              </button>
            )}
            {phase === "loading" && <p>Chargement de la caméra…</p>}
            {phase === "uploading" && <p>Envoi en cours…</p>}
            {phase === "review" && (
              <div className="review-box">
                <p>
                  La vidéo est encore locale. Elle ne sera envoyée que si vous
                  validez.
                </p>
                <div className="review-actions">
                  <button className="btn btn-primary" onClick={uploadRecording}>
                    Envoyer cette vidéo
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={startCountdown}
                  >
                    Refaire
                  </button>
                  <button className="btn btn-danger" onClick={discardRecording}>
                    Supprimer la vidéo
                  </button>
                </div>
              </div>
            )}
            {phase === "success" && (
              <div className="success-box">
                <p>Bravo ! Geste enregistré.</p>
                <button
                  className="btn btn-primary"
                  onClick={handleNextWord}
                  disabled={isChoosingNext}
                >
                  {isChoosingNext ? "Choix du mot..." : "Mot suivant"}
                </button>
              </div>
            )}
            {phase === "error" && (
              <div className="error-box">
                <p>{errorMessage || "Une erreur est survenue. Réessayez."}</p>
                {!cameraError && recordedBlob && (
                  <div className="review-actions">
                    <button
                      className="btn btn-primary"
                      onClick={uploadRecording}
                    >
                      Réessayer l'envoi
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={discardRecording}
                    >
                      Supprimer la vidéo
                    </button>
                  </div>
                )}
                {!cameraError && !recordedBlob && (
                  <button
                    className="btn btn-primary"
                    onClick={discardRecording}
                  >
                    Réessayer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
