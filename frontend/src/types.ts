export interface Word {
  id: string;
  label: string;
  video_url: string;
  sample_count: number;
}

export interface LeaderboardEntry {
  pseudo: string;
  count: number;
}

export type AppStep =
  | "consent"
  | "declined"
  | "pseudo"
  | "camera"
  | "signing"
  | "leaderboard";
