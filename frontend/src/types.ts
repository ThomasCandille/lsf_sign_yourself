export interface Word {
  id: string;
  label: string;
  video_url: string;
}

export interface LeaderboardEntry {
  pseudo: string;
  count: number;
}

export type AppStep =
  | "consent"
  | "pseudo"
  | "camera"
  | "signing"
  | "leaderboard";
