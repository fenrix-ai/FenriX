import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { adminDb, driveTo, newClient, type Seeded } from './harness';
import { auth, functions } from '../lib/firebase';
import App from '../App';

// The rendered client IS the professor: it calls createGame with its own uid.
// The professor holds no players/{uid} membership doc, so GameProvider/PhaseRouter
// stay dormant and ProfessorProvider is the only live data layer on /bigscreen.
test('bigscreen: lobby wall fills seats live, then flips to the decision wall', async () => {
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  const created = await httpsCallable(functions, 'createGame')({ teamNames: ['Alpha', 'Beta'] });
  const { gameId, joinCode } = created.data as { gameId: string; joinCode: string };
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = ['Alpha', 'Beta'].map(
    (nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);

  localStorage.setItem('ss.profGameId', gameId);
  render(<MemoryRouter initialEntries={['/bigscreen']}><App /></MemoryRouter>);

  // LobbyWall: giant join code, join URL line, seat counter (2 teams -> 6 seats).
  await waitFor(() => {
    expect(screen.getByTestId('bs-joincode')).toHaveTextContent(joinCode);
    expect(screen.getByText(
      `join at ${window.location.origin}/?code=${joinCode}`)).toBeInTheDocument();
    expect(screen.getByText('0 of 6 seats filled')).toBeInTheDocument();
  }, { timeout: 20000 });

  // A GM claims a seat -> that chip flips from open to the display name, counter ticks.
  const gm = await newClient('bs-gm');
  await gm.call('joinGame',
    { joinCode, teamId: teamIds[0], role: 'GM', displayName: 'Casey' });
  await waitFor(() => {
    expect(screen.getByText('GM: Casey')).toBeInTheDocument();
    expect(screen.getByText('1 of 6 seats filled')).toBeInTheDocument();
  }, { timeout: 15000 });

  // Drive to R2:FRONT_OFFICE. Round 1 has NO Front Office phase — startSeason opens
  // the season at R1:FREE_AGENCY (game.js startSeason), so Front Office first exists
  // in round 2. Zero bots is fine: the FREE_AGENCY exit hook hardship-signs every
  // roster-short team and the LINEUP exit auto-repair carries every team — the same
  // no-member-team path frontoffice.itest.tsx already relies on for Alpha.
  const prof: Seeded['prof'] = {
    uid: auth.currentUser!.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: () => Promise.resolve(),
  };
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots: [] };
  await driveTo(seeded, 'R2:FRONT_OFFICE');

  // DecisionWall: student-vocabulary phase title, round line, idle LED, a row per team.
  await waitFor(() => {
    expect(screen.getByText('Front Office')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByTestId('led')).toHaveTextContent('--:--');
    const lights = screen.getByTestId('bs-lights');
    expect(lights).toHaveTextContent('Alpha');
    expect(lights).toHaveTextContent('Beta');
  }, { timeout: 30000 });

  // Spec §9 two-client freeze, wall side: the professor harness client starts a
  // 90s timer then pauses it; the RENDERED bigscreen must show a frozen mm:ss
  // plus the plain "paused" text (T8's LedTimer pausedMs prop). This complements
  // T8's panel-side freeze test so BOTH rendered client types are covered.
  // setTimer callers ALWAYS send expectedPhase + expectedRound (hard rule).
  await prof.call('setTimer', { gameId, action: 'start', seconds: 90,
    expectedPhase: 'FRONT_OFFICE', expectedRound: 2 });
  await prof.call('setTimer', { gameId, action: 'pause',
    expectedPhase: 'FRONT_OFFICE', expectedRound: 2 });
  let frozen = '';
  await waitFor(() => {
    const led = screen.getByTestId('led');
    // 90s minus the start→pause round trip, floor + zero-pad (LedTimer format).
    expect(led).toHaveTextContent(/01:(2[0-9]|30)/);
    expect(screen.getByText('paused')).toBeInTheDocument();
    frozen = led.textContent ?? '';
  }, { timeout: 15000 });
  // Frozen means frozen: the readout must not tick while paused.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(screen.getByTestId('led').textContent).toBe(frozen);
}, 180000);

// Task 11: SIMULATE flood + RESULTS shuffle. 4 teams -> 6 games per round, so
// interval = min(3000, 45000/6) = 3000ms and the full flood takes ~18s of real
// time (real timers; generous waitFor timeouts bound it).
test('bigscreen: score-card flood, then standings shuffle with NEW and delta glyphs', async () => {
  await signInAnonymously(auth); // explicit: AuthProvider only signs in once rendered (Task 6 finding)
  const created = await httpsCallable(functions, 'createGame')(
    { teamNames: ['Alpha', 'Beta', 'Gamma', 'Delta'] });
  const { gameId, joinCode } = created.data as { gameId: string; joinCode: string };
  const teamsSnap = await adminDb().collection(`games/${gameId}/teams`).get();
  const teamIds = ['Alpha', 'Beta', 'Gamma', 'Delta'].map(
    (nm) => teamsSnap.docs.find((d) => d.data().name === nm)!.id);
  const prof: Seeded['prof'] = {
    uid: auth.currentUser!.uid,
    call: <T,>(fn: string, data: unknown) =>
      httpsCallable(functions, fn)(data).then((r) => r.data as T),
    dispose: () => Promise.resolve(),
  };
  const seeded: Seeded = { gameId, joinCode, teamIds, prof, bots: [] };

  localStorage.setItem('ss.profGameId', gameId);
  render(<MemoryRouter initialEntries={['/bigscreen']}><App /></MemoryRouter>);

  // R1:SIMULATE — all 6 score cards flood in, then the terminal line.
  await driveTo(seeded, 'R1:SIMULATE');
  await waitFor(() => {
    expect(screen.getAllByTestId('bs-scorecard')).toHaveLength(6);
    expect(screen.getByRole('status')).toHaveTextContent('Round complete.');
  }, { timeout: 60000 });

  // R1:RESULTS — round 1 has no previous round: every previousRank is null,
  // so the rest-state table is 4 rows, all marked NEW.
  await driveTo(seeded, 'R1:RESULTS');
  const rd1 = (await adminDb().doc(`games/${gameId}/rounds/1`).get()).data()!;
  expect((rd1.standings as { previousRank: number | null }[])
    .every((r) => r.previousRank === null)).toBe(true);
  await waitFor(() => {
    expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(4);
    for (const r of rd1.standings as { teamId: string }[]) {
      expect(screen.getByTestId(`bs-delta-${r.teamId}`)).toHaveTextContent('NEW');
    }
  }, { timeout: 30000 });

  // R2:RESULTS — every delta glyph must agree with the stored previousRank:
  // delta = previousRank - rank; positive -> '▲ d', negative -> '▼ |d|', zero -> '—'.
  await driveTo(seeded, 'R2:RESULTS');
  const rd2 = (await adminDb().doc(`games/${gameId}/rounds/2`).get()).data()!;
  expect((rd2.standings as { previousRank: number | null }[])
    .every((r) => r.previousRank !== null)).toBe(true);
  await waitFor(() => {
    expect(screen.getAllByTestId('bs-shuffle-row')).toHaveLength(4);
    for (const r of rd2.standings as
      { teamId: string; rank: number; previousRank: number }[]) {
      const d = r.previousRank - r.rank;
      const expected = d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '—';
      expect(screen.getByTestId(`bs-delta-${r.teamId}`)).toHaveTextContent(expected);
    }
  }, { timeout: 30000 });
}, 300000);
