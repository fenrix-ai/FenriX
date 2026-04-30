import { PixelAvatar } from "../components/ui/PixelAvatar";
import { PageShell } from "../components/ui/PageShell";
import { useEventLeaderboard } from "../hooks/useEventLeaderboard";
import type { EventCounts, EventPlayerEntry, EventPlayerStatus } from "../types/event";
import type { CSSProperties } from "react";

export function EventDisplayPage() {
  const { players, counts, meta, loading, error } = useEventLeaderboard();
  const cookieSections = buildCookieSections(players);
  const teams = groupPlayersByTeam(players);
  const featuredTeams = teams.slice(0, 3);
  const remainingTeams = teams.slice(3);
  const podiumColumnCount = Math.max(1, Math.min(featuredTeams.length, 3));

  return (
    <PageShell className="event-board event-board--display">
      <header className="event-board__header event-board__header--display">
        <div className="event-board__header-copy event-board__header-copy--display">
          <h1 className="event-board__title">{meta.title}</h1>
        </div>
        <div className="event-board__display-stats">
          {summaryStatsForMode(meta.mode, counts).map((item) => (
            <span key={item.label}>
              <strong>{item.label}</strong>
              <em>{item.value}</em>
            </span>
          ))}
        </div>
      </header>

      {error && (
        <p className="event-board__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="event-board__empty">Loading event roster…</p>
      ) : (
        meta.mode === "cookie" ? (
          <section className="event-display-stage">
            <section className="event-display-sections">
              {cookieSections.map((section) => (
                <article
                  key={section.title}
                  className={`event-display-section event-display-section--${section.tone}`}
                >
                  <header className="event-display-section__header">
                    <div>
                      <p className="event-display-section__eyebrow">{section.label}</p>
                      <h2>{section.title}</h2>
                    </div>
                    <span className="event-display-section__count">
                      {section.players.length}
                    </span>
                  </header>
                  {section.players.length > 0 ? (
                    <div className="event-display-section__grid">
                      {section.players.map((player) => (
                        <article
                          key={player.normalizedName}
                          className={`event-display-person-card event-display-person-card--${player.status}`}
                        >
                          <PixelAvatar
                            displayName={player.normalizedName}
                            className="event-display-person-card__avatar"
                            forceDefault={player.isCustom}
                          />
                          <div className="event-display-person-card__body">
                            <h3>{player.normalizedName}</h3>
                            {player.shape ? (
                              <p>{shapeLabel(player.shape)}</p>
                            ) : (
                              <p>{statusLabel(player.status)}</p>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="event-display-section__empty">No players here yet.</p>
                  )}
                </article>
              ))}
            </section>
          </section>
        ) : (
          <section className="event-display-stage">
            <section
              className="event-display-podium"
              style={{ "--event-podium-columns": String(podiumColumnCount) } as CSSProperties}
            >
              {featuredTeams.map((team, index) => (
                <article
                  key={team.name}
                  className={`event-display-podium__card event-display-podium__card--${team.tone}`}
                >
                  <span className="event-display-podium__place">#{index + 1}</span>
                  <div className="event-display-podium__body">
                    <p className="event-display-podium__eyebrow">
                      {team.players.length} members
                    </p>
                    <h2>{team.name}</h2>
                    <p className="event-display-podium__summary">{team.summary}</p>
                  </div>
                  <div className="event-display-podium__members">
                    {team.players.slice(0, 6).map((player) => (
                      <div key={player.normalizedName} className="event-display-member-chip">
                        <PixelAvatar
                          displayName={player.normalizedName}
                          className="event-display-member-chip__avatar"
                          forceDefault={player.isCustom}
                        />
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>

            {remainingTeams.length > 0 && (
              <section className="event-display-leaderboard">
                <div className="event-display-leaderboard__header">
                  <span>Rank</span>
                  <span>Team</span>
                  <span>Round Status</span>
                </div>
                <ol className="event-display-leaderboard__list">
                  {remainingTeams.map((team, index) => (
                    <li
                      key={team.name}
                      className={`event-display-row event-display-row--${team.tone}`}
                    >
                      <span className="event-display-row__rank">#{index + 4}</span>
                      <div className="event-display-row__identity">
                        <div className="event-display-row__body">
                          <h3>{team.name}</h3>
                          <p className="event-display-row__summary">{team.summary}</p>
                          <div className="event-display-row__avatars">
                            {team.players.slice(0, 8).map((player) => (
                              <PixelAvatar
                                key={player.normalizedName}
                                displayName={player.normalizedName}
                                className="event-display-row__avatar"
                                forceDefault={player.isCustom}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="event-display-row__status">
                        {team.statusLabel}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </section>
        )
      )}
    </PageShell>
  );
}

type CookieSection = {
  title: string;
  label: string;
  tone: EventPlayerStatus;
  players: EventPlayerEntry[];
};

function buildCookieSections(players: EventPlayerEntry[]): CookieSection[] {
  const passed = players.filter(
    (player) => player.status === "passed" || player.status === "winner",
  );
  const inProgress = players.filter(
    (player) => player.status === "pending" || player.status === "active",
  );
  const notPassed = players.filter(
    (player) =>
      player.status === "eliminated" || player.status === "disconnected",
  );

  return [
    {
      title: "Passed",
      label: "Advanced",
      tone: "passed",
      players: passed,
    },
    {
      title: "Still Playing",
      label: "Current Round",
      tone: "active",
      players: inProgress,
    },
    {
      title: "Not Passed",
      label: "Out",
      tone: "eliminated",
      players: notPassed,
    },
  ];
}

function summaryStatsForMode(mode: "cookie" | "bakery" | "winners", counts: EventCounts) {
  if (mode === "bakery") {
    return [
      { label: "Active", value: counts.active },
      { label: "Disconnected", value: counts.disconnected },
      { label: "Eliminated", value: counts.eliminated },
      { label: "Total", value: counts.total },
    ];
  }

  if (mode === "winners") {
    return [
      { label: "Winners", value: counts.winner },
      { label: "Active", value: counts.active + counts.passed },
      { label: "Total", value: counts.total },
    ];
  }

  return [
    { label: "Passed", value: counts.passed },
    {
      label: "Not Passed",
      value: counts.eliminated + counts.disconnected,
    },
  ];
}

function shapeLabel(shape: EventPlayerEntry["shape"]) {
  if (!shape) return "";
  return `${shape.charAt(0).toUpperCase()}${shape.slice(1)} shape`;
}

function statusLabel(status: EventPlayerStatus) {
  if (status === "winner") return "Winner";
  if (status === "passed") return "Passed";
  if (status === "active") return "Active";
  if (status === "disconnected") return "Disconnected";
  if (status === "eliminated") return "Eliminated";
  return "Pending";
}

type TeamGroup = {
  name: string;
  players: EventPlayerEntry[];
  summary: string;
  statusLabel: string;
  tone: EventPlayerStatus;
  score: number;
};

const TEAM_STATUS_PRIORITY: Record<EventPlayerStatus, number> = {
  winner: 0,
  active: 1,
  passed: 2,
  pending: 3,
  disconnected: 4,
  eliminated: 5,
};

function groupPlayersByTeam(players: EventPlayerEntry[]): TeamGroup[] {
  const groups = new Map<string, EventPlayerEntry[]>();

  players.forEach((player) => {
    const teamName = player.team.trim() || "Unassigned";
    const existing = groups.get(teamName) ?? [];
    existing.push(player);
    groups.set(teamName, existing);
  });

  return Array.from(groups.entries())
    .map(([name, teamPlayers]) => buildTeamGroup(name, teamPlayers))
    .sort((a, b) => {
      if (TEAM_STATUS_PRIORITY[a.tone] !== TEAM_STATUS_PRIORITY[b.tone]) {
        return TEAM_STATUS_PRIORITY[a.tone] - TEAM_STATUS_PRIORITY[b.tone];
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
}

function buildTeamGroup(name: string, players: EventPlayerEntry[]): TeamGroup {
  const counts = players.reduce(
    (acc, player) => {
      acc[player.status] += 1;
      return acc;
    },
    {
      pending: 0,
      active: 0,
      passed: 0,
      eliminated: 0,
      disconnected: 0,
      winner: 0,
    },
  );

  const score =
    counts.winner * 6 +
    counts.active * 4 +
    counts.passed * 3 +
    counts.pending * 1 -
    counts.disconnected * 1 -
    counts.eliminated * 2;

  const tone: EventPlayerStatus =
    counts.winner > 0
      ? "winner"
      : counts.active > 0
        ? "active"
        : counts.passed > 0
          ? "passed"
          : counts.disconnected > 0
            ? "disconnected"
            : counts.eliminated === players.length
              ? "eliminated"
              : "pending";

  const summaryBits = [
    counts.active ? `${counts.active} active` : null,
    counts.passed ? `${counts.passed} passed` : null,
    counts.winner ? `${counts.winner} winner` : null,
    counts.disconnected ? `${counts.disconnected} disconnected` : null,
    counts.eliminated ? `${counts.eliminated} eliminated` : null,
    counts.pending ? `${counts.pending} pending` : null,
  ].filter(Boolean);

  return {
    name,
    players,
    summary: summaryBits.join(" · ") || `${players.length} members`,
    statusLabel: teamStatusLabel(counts),
    tone,
    score,
  };
}

function teamStatusLabel(counts: Record<EventPlayerStatus, number>) {
  if (counts.winner > 0) return "Winner Team";
  if (counts.active > 0) return "In Play";
  if (counts.passed > 0 && counts.eliminated === 0) return "Advancing";
  if (counts.disconnected > 0) return "Attention Needed";
  if (counts.eliminated > 0 && counts.eliminated === counts.pending + counts.passed + counts.active + counts.disconnected + counts.winner + counts.eliminated) {
    return "Eliminated";
  }
  return "Pending";
}
