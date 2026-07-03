import axios from "axios";
import { Word, LeaderboardEntry } from "./types";

const BASE = "http://localhost:8000";

export async function fetchWords(): Promise<Word[]> {
  const { data } = await axios.get<Word[]>(`${BASE}/words`);
  return data;
}

export async function checkPseudo(pseudo: string): Promise<void> {
  await axios.post(`${BASE}/check-pseudo`, { pseudo });
}

export async function uploadSign(
  wordId: string,
  pseudo: string,
  blob: Blob
): Promise<{ count: number }> {
  const form = new FormData();
  form.append("word_id", wordId);
  form.append("pseudo", pseudo);
  form.append("video", blob, "sign.webm");
  const { data } = await axios.post<{ ok: boolean; count: number }>(
    `${BASE}/upload`,
    form
  );
  return data;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data } = await axios.get<LeaderboardEntry[]>(`${BASE}/leaderboard`);
  return data;
}
