import { useState } from "react";
import { collection, getDocs, type DocumentData } from "firebase/firestore";
import { PixelAvatar } from "../components/ui/PixelAvatar";
import { PageShell } from "../components/ui/PageShell";
import { useGame } from "../contexts/GameContext";
import { useEventLeaderboard } from "../hooks/useEventLeaderboard";
import { useIsProfessor } from "../hooks/useIsProfessor";
import { normalizeAvatarName } from "../lib/avatarManifest";
import { db } from "../lib/firebase";
import type {
  CookieShape,
  EventPlayerStatus,
  EventVisualMode,
} from "../types/event";

const SHAPE_OPTIONS: Array<{ value: CookieShape; label: string }> = [
  { value: "", label: "No shape" },
  { value: "circle", label: "Circle" },
  { value: "triangle", label: "Triangle" },
  { value: "star", label: "Star" },
  { value: "umbrella", label: "Umbrella" },
];

const MODE_OPTIONS: Array<{ value: EventVisualMode; label: string }> = [
  { value: "cookie", label: "Cookie Activity" },
  { value: "bakery", label: "Bakery Rounds" },
  { value: "winners", label: "Winner Announcements" },
];

const STATUS_BUTTONS: Array<{ value: EventPlayerStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "passed", label: "Passed" },
  { value: "winner", label: "Winner" },
  { value: "disconnected", label: "Disconnected" },
  { value: "eliminated", label: "Eliminated" },
];

export function EventControlPage() {
  const { gameId, gameCode } = useGame();
  // Render-gate the control surface on the professor custom claim. The
  // Firestore rule for /eventBoards now also requires `isProfessor()` for
  // writes, so a non-professor visitor can't actually mutate the board even
  // if this gate were bypassed — but we still hide the UI to avoid leaking
  // the participant roster to anonymous visitors who happen onto the URL.
  const { isProfessor, loading: professorLoading } = useIsProfessor();
  const [newPlayerName, setNewPlayerName] = useState("");
  const [bulkTeamText, setBulkTeamText] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [playerLookup, setPlayerLookup] = useState("");
  const [teamDrafts, setTeamDrafts] = useState<Record<string, string>>({});
  const [importingTeams, setImportingTeams] = useState(false);
  const {
    sessionId,
    players,
    counts,
    meta,
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
  } = useEventLeaderboard();
  const sharedOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const sharedQuery = `?session=${sessionId}`;
  const controlLink = `${sharedOrigin}/event/control${sharedQuery}`;
  const displayLink = `${sharedOrigin}/event/display${sharedQuery}`;

  const teams = buildTeamSummaries(players);
  const normalizedLookup = normalizeAvatarName(playerLookup).toLowerCase();
  const visiblePlayers = normalizedLookup
    ? players.filter((player) => {
        const haystack = [
          player.normalizedName,
          player.team,
          player.note,
          player.expectedFilename,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedLookup);
      })
    : players;

  const handleAddPlayer = () => {
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    addCustomPlayer(trimmed);
    setNewPlayerName("");
  };

  const handleBulkAssign = () => {
    const assignments = parseBulkTeamInput(bulkTeamText);
    if (assignments.length === 0) {
      setBulkMessage("No team blocks were detected yet.");
      return;
    }

    const result = bulkAssignTeams(assignments);
    setTeamDrafts({});
    setBulkMessage(
      `Assigned ${result.assigned} team slots${result.added > 0 ? ` and added ${result.added} extra attendee${result.added === 1 ? "" : "s"}` : ""}.`,
    );
  };

  const handleMarkAllActive = () => {
    setAllStatuses("active");
    setBulkMessage("Marked everyone as active.");
  };

  const handleImportCurrentGameTeams = async () => {
    if (!gameId) {
      setBulkMessage("Open or join the current Bakery Bash game in this browser first.");
      return;
    }

    setImportingTeams(true);
    setBulkMessage("");

    try {
      const [rosterSnap, teamsSnap] = await Promise.all([
        getDocs(collection(db, "games", gameId, "roster")),
        getDocs(collection(db, "games", gameId, "teams")),
      ]);

      const rosterByUid = new Map<string, string>();
      rosterSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as DocumentData;
        const uid = typeof data.uid === "string" ? data.uid : docSnap.id;
        const displayName =
          typeof data.displayName === "string" ? data.displayName : "";
        if (uid && displayName) {
          rosterByUid.set(uid, displayName);
        }
      });

      const assignments = teamsSnap.docs
        .map((docSnap) => {
          const data = docSnap.data() as DocumentData;
          const roleAssignments =
            data.roleAssignments && typeof data.roleAssignments === "object"
              ? (data.roleAssignments as Record<string, unknown>)
              : {};
          const teamName =
            typeof data.name === "string" && data.name.trim()
              ? data.name.trim()
              : docSnap.id;
          const names = Object.keys(roleAssignments)
            .map((uid) => rosterByUid.get(uid) ?? "")
            .filter(Boolean);
          return { team: teamName, names };
        })
        .filter((assignment) => assignment.names.length > 0);

      if (assignments.length === 0) {
        setBulkMessage("No current Bakery Bash team assignments were found yet.");
        return;
      }

      const result = bulkAssignTeams(assignments);
      setTeamDrafts({});
      setBulkMessage(
        `Imported ${assignments.length} teams from ${gameCode ?? "the current game"} and assigned ${result.assigned} players${result.added > 0 ? `, including ${result.added} extra attendee${result.added === 1 ? "" : "s"}` : ""}.`,
      );
    } catch {
      setBulkMessage("Could not import teams from the current Bakery Bash game.");
    } finally {
      setImportingTeams(false);
    }
  };

  const handleSaveTeam = (playerName: string) => {
    const nextTeam = (teamDrafts[playerName] ?? "").trim();
    setTeam(playerName, nextTeam);
    setTeamDrafts((prev) => ({
      ...prev,
      [playerName]: nextTeam,
    }));
    setBulkMessage(`Saved team for ${playerName}.`);
  };

  if (professorLoading) {
    return (
      <PageShell className="event-board event-board--control">
        <p className="event-board__subtitle">Checking access…</p>
      </PageShell>
    );
  }

  if (!isProfessor) {
    return (
      <PageShell className="event-board event-board--control">
        <header className="event-board__header">
          <div>
            <p className="event-board__eyebrow">Event Visuals</p>
            <h1 className="event-board__title">Restricted</h1>
            <p className="event-board__subtitle">
              The event control board is only available to professors.
            </p>
          </div>
        </header>
      </PageShell>
    );
  }

  return (
    <PageShell className="event-board event-board--control">
      <header className="event-board__header">
        <div>
          <p className="event-board__eyebrow">Event Visuals</p>
          <h1 className="event-board__title">{meta.title}</h1>
          <p className="event-board__subtitle">{meta.subtitle}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={resetAll}>
          Reset all statuses
        </button>
      </header>

      <section className="event-board__meta-panel">
        <div className="event-player-card__field">
          <span>Shared session</span>
          <input type="text" value={sessionId} readOnly />
        </div>
        <div className="event-player-card__field">
          <span>Control link</span>
          <input type="text" value={controlLink} readOnly />
        </div>
        <div className="event-player-card__field">
          <span>Display link</span>
          <input type="text" value={displayLink} readOnly />
        </div>
        <label className="event-player-card__field">
          <span>Mode</span>
          <select
            value={meta.mode}
            onChange={(e) => setMode(e.target.value as EventVisualMode)}
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="event-player-card__field">
          <span>Board title</span>
          <input
            type="text"
            value={meta.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bakery Bash Round 2"
          />
        </label>
        <label className="event-player-card__field">
          <span>Subtitle</span>
          <input
            type="text"
            value={meta.subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="What should the audience see?"
          />
        </label>
        <div className="event-player-card__field">
          <span>Add extra attendee</span>
          <div className="event-board__add-player">
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Type a new person's name"
            />
            <button type="button" className="btn btn--small btn--secondary" onClick={handleAddPlayer}>
              Add
            </button>
          </div>
        </div>
      </section>

      <section className="event-board__lookup-panel">
        <label className="event-player-card__field">
          <span>Find a person or team</span>
          <input
            type="text"
            value={playerLookup}
            onChange={(e) => setPlayerLookup(e.target.value)}
            placeholder="Search by name, team, note, or filename"
          />
        </label>
        <p className="event-board__lookup-count">
          Showing {visiblePlayers.length} of {players.length} players
        </p>
      </section>

      <section className="event-board__bulk-panel">
        <div className="event-board__bulk-copy">
          <h2>Bulk Team Assignment</h2>
          <p>
            Paste team blocks like <code>Blue Team:</code> followed by names on new
            lines. Commas and semicolons also work.
          </p>
          <pre>{`Blue Team:
Abigail Damasco
Victoria Enriquez

Red Team:
Saidie Felix, Peyton Gray`}</pre>
        </div>
        <div className="event-board__bulk-form">
          <label className="event-player-card__field">
            <span>Paste teams here</span>
            <textarea
              value={bulkTeamText}
              onChange={(e) => setBulkTeamText(e.target.value)}
              placeholder={`Blue Team:\nAbigail Damasco\nVictoria Enriquez\n\nRed Team:\nSaidie Felix`}
            />
          </label>
          <div className="event-board__bulk-actions">
            <button type="button" className="btn btn--secondary" onClick={handleBulkAssign}>
              Apply teams
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleMarkAllActive}>
              Mark all active
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleImportCurrentGameTeams}
              disabled={importingTeams}
            >
              {importingTeams ? "Importing…" : "Import current game teams"}
            </button>
          </div>
          {bulkMessage && <p className="event-board__bulk-message">{bulkMessage}</p>}
        </div>
      </section>

      <section className="event-board__stats">
        <StatCard label="Total" value={counts.total} tone="neutral" />
        <StatCard label="Pending" value={counts.pending} tone="neutral" />
        <StatCard label="Active" value={counts.active} tone="info" />
        <StatCard label="Passed" value={counts.passed} tone="pass" />
        <StatCard label="Winners" value={counts.winner} tone="winner" />
        <StatCard label="Disconnected" value={counts.disconnected} tone="warn" />
        <StatCard label="Eliminated" value={counts.eliminated} tone="out" />
      </section>

      {teams.length > 0 && (
        <section className="event-board__team-panel">
          <div className="event-board__team-panel-copy">
            <h2>Team Status Controls</h2>
            <p>
              Use this for Bakery Bash rounds when an entire team advances,
              disconnects, or gets eliminated together.
            </p>
          </div>
          <div className="event-board__team-grid">
            {teams.map((team) => (
              <article key={team.name} className="event-team-card">
                <div className="event-team-card__header">
                  <div>
                    <h3>{team.name}</h3>
                    <p>{team.memberCount} members</p>
                  </div>
                  <span className={`event-team-card__status event-team-card__status--${team.status}`}>
                    {team.label}
                  </span>
                </div>
                <div className="event-team-card__members">
                  {team.members.slice(0, 6).map((member) => (
                    <span key={member}>{member}</span>
                  ))}
                </div>
                <div className="event-team-card__actions">
                  {STATUS_BUTTONS.map((button) => (
                    <button
                      key={button.value}
                      type="button"
                      className={`event-status-btn event-status-btn--${button.value}`}
                      onClick={() => setTeamStatus(team.name, button.value)}
                    >
                      {button.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {error && (
        <p className="event-board__error" role="alert">
          {error}
        </p>
      )}

      <section className="event-board__list">
        {loading ? (
          <p className="event-board__empty">Loading event roster…</p>
        ) : (
          visiblePlayers.map((player) => (
            <article
              key={player.normalizedName}
              className={`event-player-card event-player-card--${player.status}`}
            >
              <div className="event-player-card__identity">
                <PixelAvatar
                  avatarFilename={player.expectedFilename}
                  displayName={player.normalizedName}
                  className="event-player-card__avatar"
                  forceDefault={player.isCustom}
                />
                <div className="event-player-card__text">
                  <h2>
                    {player.normalizedName}
                    {player.isCustom && (
                      <span className="event-player-card__badge">Added</span>
                    )}
                  </h2>
                  <p>{player.expectedFilename}</p>
                </div>
              </div>

              <div className="event-player-card__controls">
                <div className="event-player-card__status-buttons">
                  {STATUS_BUTTONS.map((button) => (
                    <button
                      key={button.value}
                      type="button"
                      className={`event-status-btn${
                        player.status === button.value ? " event-status-btn--selected" : ""
                      } event-status-btn--${button.value}`}
                      onClick={() => setStatus(player.normalizedName, button.value)}
                    >
                      {button.label}
                    </button>
                  ))}
                </div>

                <div className="event-player-card__meta-grid">
                  <label className="event-player-card__field">
                    <span>Team</span>
                    <div className="event-player-card__inline-edit">
                      <input
                        type="text"
                        value={teamDrafts[player.normalizedName] ?? ""}
                        onChange={(e) =>
                          setTeamDrafts((prev) => ({
                            ...prev,
                            [player.normalizedName]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveTeam(player.normalizedName);
                          }
                        }}
                        placeholder="Blue Team"
                      />
                      <button
                        type="button"
                        className="btn btn--small btn--secondary"
                        onClick={() => handleSaveTeam(player.normalizedName)}
                      >
                        Apply
                      </button>
                    </div>
                  </label>

                  <label className="event-player-card__field">
                    <span>Shape</span>
                    <select
                      value={player.shape}
                      onChange={(e) =>
                        setShape(player.normalizedName, e.target.value as CookieShape)
                      }
                    >
                      {SHAPE_OPTIONS.map((option) => (
                        <option key={option.value || "blank"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="event-player-card__field">
                  <span>Note</span>
                  <input
                    type="text"
                    value={player.note}
                    onChange={(e) => setNote(player.normalizedName, e.target.value)}
                    placeholder="Late, left early, MVP, etc."
                  />
                </label>

                {player.isCustom && (
                  <div className="event-player-card__actions">
                    <button
                      type="button"
                      className="btn btn--small btn--danger"
                      onClick={() => removeCustomPlayer(player.normalizedName)}
                    >
                      Remove added person
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </PageShell>
  );
}

function parseBulkTeamInput(value: string): Array<{ team: string; names: string[] }> {
  const lines = value.split(/\r?\n/);
  const assignments: Array<{ team: string; names: string[] }> = [];
  let currentTeam = "";
  let currentNames: string[] = [];

  const flush = () => {
    if (!currentTeam || currentNames.length === 0) return;
    assignments.push({
      team: currentTeam,
      names: currentNames
        .map((name) => normalizeAvatarName(name))
        .filter(Boolean),
    });
    currentNames = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flush();
      currentTeam = "";
      return;
    }

    const headerMatch = line.match(/^(.+?):\s*(.*)$/);
    if (headerMatch) {
      flush();
      currentTeam = headerMatch[1].trim();
      const trailingNames = splitNames(headerMatch[2] ?? "");
      currentNames.push(...trailingNames);
      return;
    }

    if (line.endsWith(":")) {
      flush();
      currentTeam = line.slice(0, -1).trim();
      return;
    }

    if (!currentTeam) return;
    currentNames.push(...splitNames(line));
  });

  flush();
  return assignments.filter((assignment) => assignment.team && assignment.names.length > 0);
}

function splitNames(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "info" | "pass" | "winner" | "warn" | "out";
}) {
  return (
    <div className={`event-stat-card event-stat-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildTeamSummaries(players: Array<{
  normalizedName: string;
  team: string;
  status: EventPlayerStatus;
}>) {
  const grouped = new Map<
    string,
    { members: string[]; statuses: EventPlayerStatus[] }
  >();

  players.forEach((player) => {
    const teamName = player.team.trim();
    if (!teamName) return;
    const existing = grouped.get(teamName) ?? { members: [], statuses: [] };
    existing.members.push(player.normalizedName);
    existing.statuses.push(player.status);
    grouped.set(teamName, existing);
  });

  return Array.from(grouped.entries())
    .map(([name, value]) => {
      const status = summarizeTeamStatus(value.statuses);
      return {
        name,
        members: value.members,
        memberCount: value.members.length,
        status,
        label: labelForStatus(status),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function summarizeTeamStatus(statuses: EventPlayerStatus[]) {
  if (statuses.includes("winner")) return "winner";
  if (statuses.includes("active")) return "active";
  if (statuses.includes("passed")) return "passed";
  if (statuses.includes("disconnected")) return "disconnected";
  if (statuses.every((status) => status === "eliminated")) return "eliminated";
  return "pending";
}

function labelForStatus(status: EventPlayerStatus) {
  switch (status) {
    case "active":
      return "Active";
    case "passed":
      return "Passed";
    case "winner":
      return "Winner";
    case "disconnected":
      return "Disconnected";
    case "eliminated":
      return "Eliminated";
    default:
      return "Pending";
  }
}
