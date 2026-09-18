import { useEffect, useMemo, useRef, useState } from 'react';
import { CutPreview } from '../components/frontoffice/CutPreview';
import { PayrollTimeline } from '../components/contracts/PayrollTimeline';
import { PlayerCard } from '../components/players/PlayerCard';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { HypeStars } from '../components/ui/HypeStars';
import { PayrollBar } from '../components/ui/PayrollBar';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PositionBadge } from '../components/ui/PositionBadge';
import { TickerBar } from '../components/ui/TickerBar';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { useActionReceipt } from '../hooks/useActionReceipt';
import { useSeasonForm } from '../hooks/useSeasonForm';
import { activeContracts, capOkWith, expiringPids, isSynthetic } from '../lib/contracts';
import { askPrice, contractRate, fmtM, hypeCurve, maxYears } from '../lib/money';
import type { CatalogPlayer, Contract } from '../types/models';
import styles from './FrontOfficePage.module.css';

type Decision =
  | { kind: 'resigned'; contract: Contract }
  | { kind: 'cut' };

type CutTarget = {
  contract: Contract;
  returnFocus: HTMLButtonElement;
};

function StatLine({ player, form }: {
  player: CatalogPlayer;
  form: Map<number, { ppg: number }>;
}) {
  const live = form.get(player.pid);
  return (
    <span className={styles.statLine}>
      This season {live ? live.ppg.toFixed(1) : '—'} PPG / listed {Number(player.pts_per_game).toFixed(1)} PPG
    </span>
  );
}

const renewalFor = (player: CatalogPlayer, round: number, years: number): Contract => {
  const base = player.salary_per_round !== ''
    ? Number(player.salary_per_round)
    : hypeCurve(Number(player.hype));
  const ask = askPrice(base, round);
  return {
    pid: player.pid,
    rate: contractRate(ask, years),
    startRound: round,
    years,
    viaAuction: false,
    hardship: false,
  };
};

export default function FrontOfficePage() {
  const { uid } = useAuth();
  const { game, team, catalog, call, gameId, membership, actsAs } = useGame();
  const { form } = useSeasonForm();
  const isGM = actsAs('GM');
  const gmFallback = isGM && membership?.role !== 'GM';
  const [err, setErr] = useState<unknown>(null);
  const [walked, setWalked] = useState<Set<number>>(new Set());
  const [resignYears, setResignYears] = useState<Record<number, number>>({});
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [serverDecisions, setServerDecisions] = useState<Record<number, Decision>>({});
  const [cutTarget, setCutTarget] = useState<CutTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const doneButtonRef = useRef<HTMLButtonElement>(null);

  const round = game?.round ?? 1;
  const actives = useMemo(
    () => (team ? activeContracts(team, round) : []),
    [team, round],
  );
  const stillExpiring = useMemo(
    () => (team ? expiringPids(team, round) : []),
    [team, round],
  );
  const justResigned = useMemo(
    () => actives.filter((contract) => contract.startRound === round)
      .map((contract) => contract.pid),
    [actives, round],
  );
  const expiring = useMemo(() => Array.from(new Set([
    ...stillExpiring,
    ...justResigned,
    ...walked,
    ...Object.keys(serverDecisions).map(Number),
  ])).filter((pid) => !isSynthetic(pid)), [stillExpiring, justResigned, walked, serverDecisions]);
  const tonightStars = useMemo(
    () => [...catalog.values()].filter((player) => Number(player.auction_round) === round),
    [catalog, round],
  );

  const actionScope = [
    gameId ?? '',
    round,
    game?.phase ?? '',
    membership?.teamId ?? '',
    membership?.role ?? '',
    uid ?? '',
  ].join('/');
  const { receipt, run: runWithReceipt } = useActionReceipt(actionScope);
  const scopeRef = useRef(actionScope);
  const scopeGeneration = useRef(0);
  if (scopeRef.current !== actionScope) {
    scopeRef.current = actionScope;
    scopeGeneration.current += 1;
  }

  useEffect(() => {
    const effectGeneration = scopeGeneration.current;
    setErr(null);
    setWalked(new Set());
    setResignYears({});
    setSelectedPid(null);
    setServerDecisions({});
    setCutTarget(null);
    setBusy(false);

    return () => {
      if (scopeGeneration.current === effectGeneration) {
        scopeGeneration.current += 1;
      }
    };
  }, [actionScope]);

  if (!game || !team || catalog.size === 0) return null;

  const isDone = team.doneRound === game.round && team.donePhase === game.phase;
  const activeSelectedPid = selectedPid !== null && expiring.includes(selectedPid)
    ? selectedPid
    : expiring[0] ?? null;
  const selectedPlayer = activeSelectedPid === null
    ? null
    : catalog.get(activeSelectedPid) ?? null;
  const selectedYears = activeSelectedPid === null
    ? 1
    : resignYears[activeSelectedPid] ?? 1;
  const selectedRenewal = selectedPlayer
    ? renewalFor(selectedPlayer, round, selectedYears)
    : undefined;
  const authoritativeRenewal = activeSelectedPid === null
    ? undefined
    : actives.find((contract) => (
      contract.pid === activeSelectedPid && contract.startRound === round
    ));
  const localRenewal = activeSelectedPid !== null
    && serverDecisions[activeSelectedPid]?.kind === 'resigned'
    ? serverDecisions[activeSelectedPid].contract
    : undefined;
  const savedRenewal = authoritativeRenewal ?? localRenewal;
  const selectedResigned = activeSelectedPid !== null && (
    serverDecisions[activeSelectedPid]?.kind === 'resigned'
    || authoritativeRenewal !== undefined
  );
  const selectedCut = activeSelectedPid !== null
    && serverDecisions[activeSelectedPid]?.kind === 'cut';
  const selectedWalked = activeSelectedPid !== null && walked.has(activeSelectedPid);
  const selectedPreview = selectedRenewal && !selectedResigned && !selectedCut && !selectedWalked
    ? selectedRenewal
    : undefined;
  const selectedCap = selectedPreview ? capOkWith(team, selectedPreview) : null;

  const perform = async <T,>(
    operation: () => Promise<T>,
    onSuccess?: (value: T) => void,
  ) => {
    const operationScope = actionScope;
    const operationGeneration = scopeGeneration.current;
    const stillCurrent = () => (
      scopeRef.current === operationScope
      && scopeGeneration.current === operationGeneration
    );
    setBusy(true);
    setErr(null);
    try {
      const value = await operation();
      if (stillCurrent()) onSuccess?.(value);
    } catch (error) {
      if (stillCurrent()) setErr(error);
    } finally {
      if (stillCurrent()) setBusy(false);
    }
  };

  const decidedCount = expiring.filter((pid) => (
    walked.has(pid)
    || serverDecisions[pid] !== undefined
    || actives.some((contract) => contract.pid === pid && contract.startRound === round)
  )).length;

  return (
    <main className={`page ${styles.page}`}>
      <PhaseHeader
        round={round}
        timerEndsAt={game.timerEndsAt}
        timerPausedMs={game.timerPausedMs}
        title="Front Office"
      />
      <PayrollBar round={round} team={team} />

      <div className={styles.commandBar}>
        <div>
          <h2>Set the next-round books</h2>
          <p>Resolve expired deals, inspect active contracts, and keep every committed dollar visible.</p>
        </div>
        {isGM ? (
          <div className={styles.doneControl}>
            <button
              className="btn gold"
              disabled={busy}
              onClick={() => void perform(() => call('markDone', { gameId }))}
              ref={doneButtonRef}
              type="button"
            >
              {isDone ? 'Done noted' : "We're done"}
            </button>
            {isDone ? (
              <span className={styles.doneNote} data-testid="done-note">
                Marked done — you can still make changes until the phase closes.
              </span>
            ) : null}
          </div>
        ) : (
          <p className={styles.readOnly}>The GM acts this phase. Decisions are read-only.</p>
        )}
      </div>

      {!cutTarget ? <ErrorNotice error={err} /> : null}
      {gmFallback ? (
        <p className={styles.fallback} data-testid="role-fallback">
          No GM on your team — any member may sign or cut.
        </p>
      ) : null}
      {receipt ? (
        <p aria-label="Saved action" className={styles.receipt} key={receipt.id} role="status">
          {receipt.label}
        </p>
      ) : null}

      <div className={styles.workspace}>
        <div className={styles.decisionColumn}>
          <section className={styles.panel} aria-labelledby="expiring-title">
            <header className={styles.panelHeading}>
              <div>
                <h2 id="expiring-title">Expiring decisions</h2>
                <p>Renew at tonight’s ask or select a reversible walk decision.</p>
              </div>
              <strong>{decidedCount} of {expiring.length} decided</strong>
            </header>

            {expiring.length === 0 ? (
              <div className={styles.emptyState}>
                <strong>No contracts expired this round.</strong>
                <span>Your active roster and payroll remain available below.</span>
              </div>
            ) : (
              <ul className={styles.decisionList}>
                {expiring.map((pid) => {
                  const player = catalog.get(pid);
                  if (!player) return null;
                  const resigned = serverDecisions[pid]?.kind === 'resigned'
                    || actives.some((contract) => contract.pid === pid && contract.startRound === round);
                  const cut = serverDecisions[pid]?.kind === 'cut';
                  const walk = walked.has(pid);
                  const state = cut ? 'Re-signed, then cut'
                    : resigned ? 'Re-signed'
                      : walk ? 'Walk selected'
                        : 'Needs decision';
                  return (
                    <li key={pid}>
                      <button
                        aria-label={`Review ${player.name}`}
                        aria-pressed={activeSelectedPid === pid}
                        className={styles.decisionButton}
                        data-selected={activeSelectedPid === pid || undefined}
                        onClick={() => setSelectedPid(pid)}
                        type="button"
                      >
                        <span className={styles.playerSummary}>
                          <PositionBadge pos={player.position} />
                          <span>
                            <strong>{player.name}</strong>
                            <small>{fmtM(renewalFor(player, round, 1).rate)}/rd one-round ask</small>
                          </span>
                        </span>
                        <span className={styles.decisionState}>{state}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="roster-title">
            <header className={styles.panelHeading}>
              <div>
                <h2 id="roster-title">Active roster</h2>
                <p>Cutting opens a roster spot, but every remaining annual payment stays.</p>
              </div>
              <strong>{actives.length} players</strong>
            </header>
            <ul className={styles.rosterList}>
              {actives.map((contract) => {
                const player = catalog.get(contract.pid);
                if (!player) return null;
                const endRound = contract.startRound + contract.years - 1;
                return (
                  <li key={contract.pid}>
                    <div className={styles.rosterPlayer}>
                      <PositionBadge pos={player.position} />
                      <span>
                        <strong>{player.name}</strong>
                        <StatLine form={form} player={player} />
                      </span>
                    </div>
                    <span className={styles.contractTerms}>
                      {fmtM(contract.rate)}/rd through Round {endRound}
                      {contract.hardship ? ' · hardship' : ''}
                    </span>
                    <button
                      aria-label={`Review cut for ${player.name}`}
                      className="btn cut"
                      disabled={busy || !isGM}
                      onClick={(event) => setCutTarget({
                        contract,
                        returnFocus: event.currentTarget,
                      })}
                      type="button"
                    >
                      Review cut
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="market-title">
            <header className={styles.panelHeading}>
              <div>
                <h2 id="market-title">Tonight’s market</h2>
                <p>Name, position, and public hype only.</p>
              </div>
              <strong>{tonightStars.length} stars</strong>
            </header>
            <TickerBar tag="SCOUT WIRE">League office confirms tonight’s auction class.</TickerBar>
            {tonightStars.length === 0 ? (
              <p className={styles.marketEmpty}>No auction stars are scheduled tonight.</p>
            ) : (
              <ul className={styles.marketList}>
                {tonightStars.map((player) => (
                  <li key={player.pid}>
                    <strong>{player.name}</strong>
                    <PositionBadge pos={player.position} />
                    <HypeStars hype={Number(player.hype)} />
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.marketFootnote}>The free-agent pool refreshes when the market opens.</p>
          </section>
        </div>

        <aside className={styles.detailColumn}>
          {selectedPlayer && activeSelectedPid !== null && selectedRenewal ? (
            <section
              aria-label={`Contract decision for ${selectedPlayer.name}`}
              className={styles.decisionDetail}
            >
              <PlayerCard identity={team.identity} player={selectedPlayer} selected>
                {selectedCut ? (
                  <p className={styles.savedDecision}>
                    Re-signed, then cut. Remaining salary is recorded as dead money.
                  </p>
                ) : selectedResigned && savedRenewal ? (
                  <div className={styles.savedDecision}>
                    <p>Re-signed for {fmtM(savedRenewal.rate)}/rd.</p>
                    <p>
                      {savedRenewal.years} round{savedRenewal.years === 1 ? '' : 's'} · Rounds{' '}
                      {savedRenewal.startRound}–{savedRenewal.startRound + savedRenewal.years - 1}.
                    </p>
                  </div>
                ) : selectedWalked ? (
                  <div className={styles.walkDecision}>
                    <p>Walk selected — undo until Front Office closes.</p>
                    <button
                      className="btn"
                      disabled={busy || !isGM}
                      onClick={() => setWalked((current) => {
                        const next = new Set(current);
                        next.delete(activeSelectedPid);
                        return next;
                      })}
                      type="button"
                    >
                      Undo walk
                    </button>
                  </div>
                ) : (
                  <div className={styles.contractComposer}>
                    <label>
                      Contract length for {selectedPlayer.name}
                      <select
                        aria-label={`Contract length for ${selectedPlayer.name}`}
                        disabled={busy || !isGM}
                        onChange={(event) => setResignYears((current) => ({
                          ...current,
                          [activeSelectedPid]: Number(event.target.value),
                        }))}
                        value={selectedYears}
                      >
                        {Array.from({ length: maxYears(round) }, (_, index) => index + 1)
                          .map((years) => {
                            const proposal = renewalFor(selectedPlayer, round, years);
                            return (
                              <option key={years} value={years}>
                                {years} round{years === 1 ? '' : 's'} · {fmtM(proposal.rate)}/rd
                              </option>
                            );
                          })}
                      </select>
                    </label>
                    <dl className={styles.commitment}>
                      <div><dt>Annual rate</dt><dd>{fmtM(selectedRenewal.rate)}</dd></div>
                      <div><dt>Guaranteed total</dt><dd>{fmtM(selectedRenewal.rate * selectedYears)}</dd></div>
                      <div><dt>Rounds covered</dt><dd>{round}–{round + selectedYears - 1}</dd></div>
                    </dl>
                    <p className={selectedCap?.ok ? styles.capOk : styles.capBlocked}>
                      {selectedCap?.ok
                        ? 'Fits the cap in every covered round.'
                        : `Over the cap in Round ${selectedCap?.worstRound}: ${fmtM(selectedCap?.worstPayroll ?? 0)}.`}
                    </p>
                    <div className={styles.decisionActions}>
                      <button
                        className="btn green"
                        disabled={busy || !isGM || !selectedCap?.ok}
                        onClick={() => {
                          const submittedRenewal = selectedRenewal;
                          void perform(() => runWithReceipt(
                            `Re-sign saved for ${selectedPlayer.name}.`,
                            () => call('signPlayer', {
                              gameId,
                              pid: activeSelectedPid,
                              years: selectedYears,
                            }),
                          ), () => setServerDecisions((current) => ({
                            ...current,
                            [activeSelectedPid]: {
                              kind: 'resigned',
                              contract: submittedRenewal,
                            },
                          })));
                        }}
                        type="button"
                      >
                        Re-sign {selectedPlayer.name}
                      </button>
                      <button
                        className="btn"
                        disabled={busy || !isGM}
                        onClick={() => setWalked((current) => new Set(current).add(activeSelectedPid))}
                        type="button"
                      >
                        Let walk
                      </button>
                    </div>
                  </div>
                )}
              </PlayerCard>
            </section>
          ) : (
            <section className={styles.emptyDetail}>
              <h2>All contracts carry forward</h2>
              <p>No expired deal needs a decision. The payroll horizon still shows every active and dead-money obligation.</p>
            </section>
          )}

          <PayrollTimeline preview={selectedPreview} round={round} team={team} />
        </aside>
      </div>

      {cutTarget ? (
        <CutPreview
          busy={busy}
          canAct={isGM}
          contract={cutTarget.contract}
          error={err}
          fallbackFocus={doneButtonRef.current}
          onCancel={() => setCutTarget(null)}
          onConfirm={() => {
            const targetPid = cutTarget.contract.pid;
            const player = catalog.get(targetPid);
            void perform(() => runWithReceipt(
              `Cut saved for ${player?.name ?? 'player'}.`,
              () => call('cutRosterPlayer', { gameId, pid: targetPid }),
            ), () => {
              if (expiring.includes(targetPid)) {
                setServerDecisions((current) => ({
                  ...current,
                  [targetPid]: { kind: 'cut' },
                }));
              }
              setCutTarget(null);
            });
          }}
          player={catalog.get(cutTarget.contract.pid)!}
          returnFocus={cutTarget.returnFocus}
          round={round}
          team={team}
        />
      ) : null}
    </main>
  );
}
