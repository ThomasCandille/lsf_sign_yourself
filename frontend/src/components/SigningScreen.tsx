import React, { useRef, useState, useEffect, useCallback } from "react";
import CameraView, { CameraViewHandle } from "./CameraView";
import { Word, LeaderboardEntry } from "../types";
import { uploadSign, fetchLeaderboard } from "../api";
import "./SigningScreen.css";

type Phase = "loading" | "ready" | "countdown" | "recording" | "uploading" | "success" | "error";

interface Props {
  word: Word;
  pseudo: string;
  totalSigned: number;
  onSigned: (newCount: number) => void;
  onNext: () => void;
}

const COUNTDOWN_SEC = 3;
const RECORD_SEC = 2;

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
  const [cameraError, setCameraError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleCameraReady = useCallback(() => setPhase("ready"), []);
  const handleCameraError = useCallback((msg: string) => {
    setCameraError(msg);
    setPhase("error");
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  useEffect(() => {
    fetchLeaderboard().then(setLeaderboard).catch(() => {});
  }, [totalSigned]);

  function startCountdown() {
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
      const blob = await cameraRef.current?.stopRecording() ?? new Blob([]);
      setPhase("uploading");
      try {
        const { count } = await uploadSign(word.id, pseudo, blob);
        onSigned(count);
        setPhase("success");
      } catch {
        setPhase("error");
      }
    }, RECORD_SEC * 1000);
  }

  return (
    <div className="signing-screen">
      <div className="signing-layout">
        {/* Colonne gauche : référence + classement */}
        <div className="signing-left">
          <div className="word-reference">
            <p className="word-label">Signer le mot :</p>
            <h2 className="word-title">{word.label}</h2>
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
          </div>

          <div className="signing-actions">
            {phase === "ready" && (
              <button className="btn btn-primary btn-large" onClick={startCountdown}>
                Démarrer
              </button>
            )}
            {phase === "loading" && <p>Chargement de la caméra…</p>}
            {phase === "uploading" && <p>Envoi en cours…</p>}
            {phase === "success" && (
              <div className="success-box">
                <p>Bravo ! Geste enregistré.</p>
                <button className="btn btn-primary" onClick={onNext}>
                  Mot suivant
                </button>
              </div>
            )}
            {phase === "error" && (
              <div className="error-box">
                <p>{cameraError || "Une erreur est survenue. Réessayez."}</p>
                {!cameraError && (
                  <button className="btn btn-primary" onClick={() => setPhase("ready")}>
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
