import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useIsProfessor } from "./useIsProfessor";
import { normalizeAvatarName, slugifyAvatarKey } from "../lib/avatarManifest";
import { fetchEventRoster } from "../lib/eventRoster";
import { db } from "../lib/firebase";
import type {
  CookieShape,
  EventBoardMeta,
  EventCounts,
  EventPlayerState,
  EventPlayerStatus,
  EventRosterPlayer,
  EventVisualMode,
} from "../types/event";

const DEFAULT_SESSION_ID = "live-event-board";
const LEGACY_STORAGE_KEY = "bakery-bash:event-leaderboard:v1";
const LEGACY_STORAGE_KEY_V2 = "bakery-bash:event-leaderboard:v2";

const DEFAULT_PLAYER_STATE: EventPlayerState = {
  status: "pending",
  shape: "",
  team: "",
  note: "",
};

type EventStateMap = Record<string, EventPlayerState>;

interface StoredBoardState {
  meta: EventBoardMeta;
  players: EventStateMap;
  customPlayers: string[];
}

interface StoredBoardDocument extends StoredBoardState {
  updatedAt?: unknown;
}

interface BulkTeamAssignment {
  team: string;
  names: string[];
}

interface BulkAssignResult {
  assigned: number;
  added: number;
}

const REMOVED_PLAYER_SLUGS = new Set<string>(["dylan-massaro"]);

function normalizeEventSessionId(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  const sanitized = normalized.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return sanitized.replace(/^-|-$/g, "") || DEFAULT_SESSION_ID;
}

function storageKeyForSession(sessionId: string) {
  return `bakery-bash:event-leaderboard:${sessionId}:v3`;
}

function dedupeNamesBySlug(names: string[]) {
  const seen = new Set<string>();
  return names.filter((name) => {
    const slug = slugifyAvatarKey(name);
    if (!slug || seen.has(slug) || REMOVED_PLAYER_SLUGS.has(slug)) return false;
    seen.add(slug);
    return true;
  });
}

const DEFAULT_META_BY_MODE: Record<EventVisualMode, EventBoardMeta> = {
  cookie: {
    mode: "cookie",
    title: "Cookie Round Control Board",
    subtitle:
      "Track who is still pending, who passed the cookie round, and who was eliminated.",
  },
  bakery: {
    mode: "bakery",
    title: "Bakery Bash Round Visuals",
    subtitle:
      "Use this board for team snapshots, live status changes, disconnects, and round updates.",
  },
  winners: {
    mode: "winners",
    title: "Winner Announcements",
    subtitle:
      "Highlight finalists, winners, and notable updates between rounds or at the end of the event.",
  },
};

function cloneDefaultMeta(mode: EventVisualMode): EventBoardMeta {
  return { ...DEFAULT_META_BY_MODE[mode] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStoredPlayer(value: unknown): EventPlayerState {
  const source = isPlainObject(value) ? value : {};
  const status = source.status;
  return {
    status:
      status === "pending" ||
      status === "active" ||
      status === "passed" ||
      status === "eliminated" ||
      status === "disconnected" ||
      status === "winner"
        ? status
        : DEFAULT_PLAYER_STATE.status,
    shape:
      source.shape === "circle" ||
      source.shape === "triangle" ||
      source.shape === "star" ||
      source.shape === "umbrella"
        ? source.shape
        : "",
    team: typeof source.team === "string" ? source.team : "",
    note: typeof source.note === "string" ? source.note : "",
  };
}

function loadLegacyPlayers(raw: string): EventStateMap {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([name, player]) => [
        name,
        normalizeStoredPlayer(player),
      ]),
    );
  } catch {
    return {};
  }
}

function normalizeStoredBoardState(parsed: unknown): StoredBoardState {
  if (isPlainObject(parsed)) {
    const mode =
      parsed.meta && isPlainObject(parsed.meta) && parsed.meta.mode === "bakery"
        ? "bakery"
        : parsed.meta && isPlainObject(parsed.meta) && parsed.meta.mode === "winners"
          ? "winners"
          : "cookie";
    const defaults = cloneDefaultMeta(mode);
    const metaSource = parsed.meta && isPlainObject(parsed.meta) ? parsed.meta : {};
    const playersSource =
      parsed.players && isPlainObject(parsed.players) ? parsed.players : {};
    const customPlayersSource = Array.isArray(parsed.customPlayers)
      ? parsed.customPlayers.filter((value): value is string => typeof value === "string")
      : [];
    return {
      meta: {
        mode,
        title:
          typeof metaSource.title === "string" && metaSource.title.trim()
            ? metaSource.title
            : defaults.title,
        subtitle:
          typeof metaSource.subtitle === "string" && metaSource.subtitle.trim()
            ? metaSource.subtitle
            : defaults.subtitle,
      },
      players: Object.fromEntries(
        Object.entries(playersSource).map(([name, player]) => [
          name,
          normalizeStoredPlayer(player),
        ]),
      ),
      customPlayers: customPlayersSource.map(normalizeAvatarName).filter(Boolean),
    };
  }

  return {
    meta: cloneDefaultMeta("cookie"),
    players: {},
    customPlayers: [],
  };
}

function loadStoredBoardState(sessionId: string): StoredBoardState {
  if (typeof window === "undefined") {
    return {
      meta: cloneDefaultMeta("cookie"),
      players: {},
      customPlayers: [],
    };
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForSession(sessionId));
    if (raw) {
      return normalizeStoredBoardState(JSON.parse(raw) as unknown);
    }

    const legacyRaw =
      sessionId === DEFAULT_SESSION_ID
        ? window.localStorage.getItem(LEGACY_STORAGE_KEY_V2) ??
          window.localStorage.getItem(LEGACY_STORAGE_KEY)
        : null;
    return {
      meta: cloneDefaultMeta("cookie"),
      players: legacyRaw ? loadLegacyPlayers(legacyRaw) : {},
      customPlayers: [],
    };
  } catch {
    return {
      meta: cloneDefaultMeta("cookie"),
      players: {},
      customPlayers: [],
    };
  }
}

function saveStoredBoardState(sessionId: string, state: StoredBoardState) {
  window.localStorage.setItem(storageKeyForSession(sessionId), JSON.stringify(state));
}

function serializeBoardState(state: StoredBoardState): StoredBoardDocument {
  return {
    meta: state.meta,
    players: state.players,
    customPlayers: state.customPlayers,
    updatedAt: serverTimestamp(),
  };
}

const EMPTY_COUNTS: EventCounts = {
  total: 0,
  pending: 0,
  active: 0,
  passed: 0,
  eliminated: 0,
  disconnected: 0,
  winner: 0,
};

function createCustomRosterPlayer(name: string): EventRosterPlayer {
  const normalizedName = normalizeAvatarName(name);
  return {
    normalizedName,
    expectedFilename: `${slugifyAvatarKey(normalizedName) || "default"} (default avatar)`,
    noPicture: true,
    isCustom: true,
  };
}

export function useEventLeaderboard() {
  const { user, loading: authLoading } = useAuth();
  // Only professors can write the eventBoards doc (firestore.rules:45-48).
  // Display-only consumers should not try to seed-on-empty — the setDoc
  // call would silently fail and the hook would re-trigger on every
  // snapshot. Gate seeding + mutation paths on the professor claim.
  const { isProfessor } = useIsProfessor();
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_SESSION_ID;
    return normalizeEventSessionId(
      new URLSearchParams(window.location.search).get("session"),
    );
  }, []);
  const [roster, setRoster] = useState<EventRosterPlayer[]>([]);
  const [boardState, setBoardState] = useState<StoredBoardState>(() =>
    loadStoredBoardState(sessionId),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventBoardRef = useMemo(() => doc(db, "eventBoards", sessionId), [sessionId]);

  useEffect(() => {
    let active = true;
    void fetchEventRoster()
      .then((players) => {
        if (!active) return;
        setRoster(players);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load event roster.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === storageKeyForSession(sessionId) ||
        (sessionId === DEFAULT_SESSION_ID &&
          (event.key === LEGACY_STORAGE_KEY || event.key === LEGACY_STORAGE_KEY_V2))
      ) {
        setBoardState(loadStoredBoardState(sessionId));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [sessionId]);

  useEffect(() => {
    if (authLoading || !user) return;

    const unsubscribe = onSnapshot(
      eventBoardRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          // Seed-on-empty only when the caller can actually write
          // (firestore.rules requires isProfessor() for write). Display
          // consumers stay in a "waiting for board" state until the
          // professor opens the control surface.
          if (isProfessor) {
            void setDoc(eventBoardRef, serializeBoardState(loadStoredBoardState(sessionId)));
          }
          return;
        }

        const nextState = normalizeStoredBoardState(snapshot.data() as StoredBoardDocument);
        setBoardState(nextState);
        saveStoredBoardState(sessionId, nextState);
      },
      () => {
        setError("Could not sync the shared event board.");
      },
    );

    return unsubscribe;
  }, [authLoading, eventBoardRef, isProfessor, sessionId, user]);

  const rosterNameBySlug = useMemo(
    () =>
      new Map(
        roster.map((player) => [slugifyAvatarKey(player.normalizedName), player.normalizedName]),
      ),
    [roster],
  );

  const customNameBySlug = useMemo(
    () =>
      new Map(
        boardState.customPlayers.map((name) => [slugifyAvatarKey(name), name]),
      ),
    [boardState.customPlayers],
  );

  const resolveCanonicalName = (name: string) => {
    const normalizedName = normalizeAvatarName(name);
    const slug = slugifyAvatarKey(normalizedName);
    if (!slug) return "";
    if (REMOVED_PLAYER_SLUGS.has(slug)) return "";
    return rosterNameBySlug.get(slug) ?? customNameBySlug.get(slug) ?? normalizedName;
  };

  const players = useMemo(() => {
    const combinedRoster = [
      ...roster,
      ...boardState.customPlayers.map(createCustomRosterPlayer),
    ];

    return combinedRoster
      .filter((player) => !REMOVED_PLAYER_SLUGS.has(slugifyAvatarKey(player.normalizedName)))
      .filter(
        (player, index, source) =>
          source.findIndex(
            (candidate) =>
              slugifyAvatarKey(candidate.normalizedName) ===
              slugifyAvatarKey(player.normalizedName),
          ) === index,
      )
      .map((player) => ({
        ...player,
        ...(boardState.players[player.normalizedName] ?? DEFAULT_PLAYER_STATE),
      }));
  }, [boardState.customPlayers, boardState.players, roster]);

  const counts = useMemo(() => {
    return players.reduce((acc, player) => {
      acc.total += 1;
      acc[player.status] += 1;
      return acc;
    }, { ...EMPTY_COUNTS });
  }, [players]);

  const saveBoard = (next: StoredBoardState) => {
    setBoardState(next);
    saveStoredBoardState(sessionId, next);
    if (user) {
      void setDoc(eventBoardRef, serializeBoardState(next), { merge: true }).catch(() => {
        setError("Could not save the shared event board.");
      });
    }
  };

  const updatePlayer = (normalizedName: string, patch: Partial<EventPlayerState>) => {
    const next: StoredBoardState = {
      ...boardState,
      players: {
        ...boardState.players,
        [normalizedName]: {
          ...(boardState.players[normalizedName] ?? DEFAULT_PLAYER_STATE),
          ...patch,
        },
      },
    };
    saveBoard(next);
  };

  const setStatus = (normalizedName: string, status: EventPlayerStatus) =>
    updatePlayer(normalizedName, { status });

  const setShape = (normalizedName: string, shape: CookieShape) =>
    updatePlayer(normalizedName, { shape });

  const setTeam = (normalizedName: string, team: string) =>
    updatePlayer(normalizedName, {
      team,
      ...(team.trim() ? { status: "active" as const } : {}),
    });

  const setNote = (normalizedName: string, note: string) =>
    updatePlayer(normalizedName, { note });

  const setMode = (mode: EventVisualMode) => {
    const defaults = cloneDefaultMeta(mode);
    saveBoard({
      ...boardState,
      meta: defaults,
    });
  };

  const setTitle = (title: string) =>
    saveBoard({
      ...boardState,
      meta: {
        ...boardState.meta,
        title,
      },
    });

  const setSubtitle = (subtitle: string) =>
    saveBoard({
      ...boardState,
      meta: {
        ...boardState.meta,
        subtitle,
      },
    });

  const setAllStatuses = (status: EventPlayerStatus) => {
    const nextPlayers = Object.fromEntries(
      players.map((player) => [
        player.normalizedName,
        {
          ...(boardState.players[player.normalizedName] ?? DEFAULT_PLAYER_STATE),
          status,
        },
      ]),
    );

    saveBoard({
      ...boardState,
      players: nextPlayers,
    });
  };

  const setTeamStatus = (teamName: string, status: EventPlayerStatus) => {
    const normalizedTeam = teamName.trim();
    if (!normalizedTeam) return;

    const nextPlayers = { ...boardState.players };
    players
      .filter((player) => player.team.trim() === normalizedTeam)
      .forEach((player) => {
        nextPlayers[player.normalizedName] = {
          ...(nextPlayers[player.normalizedName] ?? DEFAULT_PLAYER_STATE),
          status,
        };
      });

    saveBoard({
      ...boardState,
      players: nextPlayers,
    });
  };

  const addCustomPlayer = (name: string) => {
    const normalizedName = resolveCanonicalName(name);
    if (!normalizedName) return;
    if (
      rosterNameBySlug.has(slugifyAvatarKey(normalizedName)) ||
      customNameBySlug.has(slugifyAvatarKey(normalizedName))
    ) {
      return;
    }

    saveBoard({
      ...boardState,
      customPlayers: dedupeNamesBySlug([...boardState.customPlayers, normalizedName]).sort(
        (a, b) => a.localeCompare(b),
      ),
      players: {
        ...boardState.players,
        [normalizedName]: DEFAULT_PLAYER_STATE,
      },
    });
  };

  const removeCustomPlayer = (name: string) => {
    const normalizedName = resolveCanonicalName(name);
    if (!normalizedName) return;

    const nextPlayers = { ...boardState.players };
    delete nextPlayers[normalizedName];

    saveBoard({
      ...boardState,
      customPlayers: boardState.customPlayers.filter(
        (playerName) => playerName !== normalizedName,
      ),
      players: nextPlayers,
    });
  };

  const bulkAssignTeams = (assignments: BulkTeamAssignment[]): BulkAssignResult => {
    let assigned = 0;
    let added = 0;

    const knownNames = new Set(
      roster.map((player) => slugifyAvatarKey(player.normalizedName)),
    );
    const customNames = new Set(
      boardState.customPlayers.map((name) => slugifyAvatarKey(name)),
    );
    const nextCustomPlayers = [...boardState.customPlayers];
    const nextPlayers = { ...boardState.players };

    assignments.forEach(({ team, names }) => {
      const trimmedTeam = team.trim();
      if (!trimmedTeam) return;

      names.forEach((name) => {
        const normalizedName = resolveCanonicalName(name);
        const slug = slugifyAvatarKey(normalizedName);
        if (!normalizedName) return;

        if (!knownNames.has(slug) && !customNames.has(slug)) {
          customNames.add(slug);
          nextCustomPlayers.push(normalizedName);
          added += 1;
        }

        nextPlayers[normalizedName] = {
          ...(nextPlayers[normalizedName] ?? DEFAULT_PLAYER_STATE),
          team: trimmedTeam,
          status: "active",
        };
        assigned += 1;
      });
    });

    saveBoard({
      ...boardState,
      customPlayers: dedupeNamesBySlug(nextCustomPlayers).sort((a, b) =>
        a.localeCompare(b),
      ),
      players: nextPlayers,
    });

    return { assigned, added };
  };

  const resetAll = () => {
    const next = {
      meta: cloneDefaultMeta(boardState.meta.mode),
      players: {},
      customPlayers: boardState.customPlayers,
    };
    saveBoard(next);
  };

  return {
    sessionId,
    players,
    counts,
    meta: boardState.meta,
    loading,
    error,
    setStatus,
    setShape,
    setTeam,
    setNote,
    setMode,
    setTitle,
    setSubtitle,
    setAllStatuses,
    setTeamStatus,
    addCustomPlayer,
    removeCustomPlayer,
    bulkAssignTeams,
    resetAll,
  };
}
