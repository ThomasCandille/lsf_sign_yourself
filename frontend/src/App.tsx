import { useCallback, useEffect, useState } from "react";
import ConsentModal from "./components/ConsentModal";
import PseudoModal from "./components/PseudoModal";
import SigningScreen from "./components/SigningScreen";
import { fetchWords } from "./api";
import { Word } from "./types";
import "./App.css";

export default function App() {
  const [step, setStep] = useState<
    "consent" | "declined" | "pseudo" | "signing"
  >("consent");
  const [pseudo, setPseudo] = useState("");
  const [words, setWords] = useState<Word[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [totalSigned, setTotalSigned] = useState(0);
  const [wordsLoading, setWordsLoading] = useState(true);
  const [wordsError, setWordsError] = useState("");

  const refreshWords = useCallback(async () => {
    const orderedWords = await fetchWords();
    setWords(orderedWords);
    setWordIndex(0);
    setWordsError("");
  }, []);

  useEffect(() => {
    refreshWords()
      .catch(() =>
        setWordsError("Impossible de charger les mots pour le moment."),
      )
      .finally(() => setWordsLoading(false));
  }, [refreshWords]);

  function handleSigned(newCount: number) {
    setTotalSigned(newCount);
  }

  async function handleNext() {
    try {
      await refreshWords();
    } catch {
      setWordIndex((i) => (words.length > 0 ? (i + 1) % words.length : 0));
    }
  }

  if (step === "declined") {
    return (
      <div className="app-loading app-message">
        <h1>Participation non lancée</h1>
        <p>
          Aucune vidéo n'est enregistrée ou envoyée tant que vous n'avez pas
          donné votre accord explicite.
        </p>
        <button
          className="btn btn-secondary"
          onClick={() => setStep("consent")}
        >
          Revoir les informations
        </button>
      </div>
    );
  }

  if ((wordsLoading || words.length === 0) && step === "signing") {
    return (
      <div className="app-loading">
        <p>{wordsError || "Chargement des mots..."}</p>
      </div>
    );
  }

  return (
    <>
      {step === "consent" && (
        <ConsentModal
          onAccept={() => setStep("pseudo")}
          onDecline={() => setStep("declined")}
        />
      )}
      {step === "pseudo" && (
        <PseudoModal
          onConfirm={(p) => {
            setPseudo(p);
            setStep("signing");
          }}
        />
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
