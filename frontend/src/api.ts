import axios from "axios";
import { Word, LeaderboardEntry } from "./types";

const BASE = process.env.REACT_APP_API_BASE_URL ?? "http://localhost:8000";
const apiClient = axios.create({
  baseURL: BASE,
  timeout: 15000,
  withCredentials: false,
  headers: {
    Accept: "application/json",
  },
});

function recordingFilename(blob: Blob): string {
  const contentType = (blob.type || "").split(";")[0].trim().toLowerCase();
  return contentType === "video/mp4" ? "sign.mp4" : "sign.webm";
}

export async function fetchWords(): Promise<Word[]> {
  const { data } = await apiClient.get<Word[]>("/words");
  return data;
}

export async function checkPseudo(pseudo: string): Promise<void> {
  await apiClient.post("/check-pseudo", { pseudo });
}

export async function uploadSign(
  wordId: string,
  pseudo: string,
  blob: Blob,
): Promise<{ count: number }> {
  const form = new FormData();
  form.append("word_id", wordId);
  form.append("pseudo", pseudo);
  form.append("video", blob, recordingFilename(blob));
  const { data } = await axios.post<{ ok: boolean; count: number }>(
    `${BASE}/upload`,
    form,
    {
      timeout: 30000,
      withCredentials: false,
      headers: {
        Accept: "application/json",
      },
    },
  );
  return data;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data } = await apiClient.get<LeaderboardEntry[]>("/leaderboard");
  return data;
}
