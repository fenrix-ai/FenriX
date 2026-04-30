export type EventPlayerStatus =
  | "pending"
  | "active"
  | "passed"
  | "eliminated"
  | "disconnected"
  | "winner";

export type EventVisualMode = "cookie" | "bakery" | "winners";

export type CookieShape = "circle" | "triangle" | "star" | "umbrella" | "";

export interface EventRosterPlayer {
  normalizedName: string;
  expectedFilename: string;
  noPicture: boolean;
  isCustom?: boolean;
}

export interface EventPlayerState {
  status: EventPlayerStatus;
  shape: CookieShape;
  team: string;
  note: string;
}

export interface EventPlayerEntry extends EventRosterPlayer, EventPlayerState {}

export interface EventBoardMeta {
  mode: EventVisualMode;
  title: string;
  subtitle: string;
}

export interface EventCounts {
  total: number;
  pending: number;
  active: number;
  passed: number;
  eliminated: number;
  disconnected: number;
  winner: number;
}
