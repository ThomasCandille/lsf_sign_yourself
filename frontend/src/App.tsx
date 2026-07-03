import { useState, useEffect } from "react";
import ConsentModal from "./components/ConsentModal";
import PseudoModal from "./components/PseudoModal";
import SigningScreen from "./components/SigningScreen";
import { fetchWords } from "./api";
import { Word } from "./types";
import "./App.css";

export default function App() {
  const [step, setStep] = useState<"consent" | "pseudo" | "signing">("consent");
  const [pseudo, setPseudo] = useState("");
  const [words, setWords] = useState<Word[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [totalSigned, setTotalSigned] = useState(0);

  useEffect(() => {
    fetchWords().then(setWords).catch(() => {});
  }, []);

  function handleSigned(newCount: number) {
    setTotalSigned(newCount);
  }

  function handleNext() {
    setWordIndex((i) => (i + 1) % words.length);
  }

  if (words.length === 0 && step === "signing") {
    return (
      <div className="app-loading">
        <p>Chargement des mots…</p>
      </div>
    );
  }

  return (
    <>
      {step === "consent" && (
        <ConsentModal
          onAccept={() => setStep("pseudo")}
          onDecline={() => setStep("consent")}
        />
      )}
      {step === "pseudo" && (
        <PseudoModal onConfirm={(p) => { setPseudo(p); setStep("signing"); }} />
      )}
      {step === "signing" && words.length > 0 && (
        <SigningScreen
          word={words[wordIndex]}
          pseudo={pseudo}
          totalSigned={totalSigned}
          onSigned={handleSigned}
          onNext={handleNext}
        />
      )}
    </>
  );
}
