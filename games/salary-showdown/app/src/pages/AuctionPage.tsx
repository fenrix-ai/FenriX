import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useGame } from '../contexts/GameContext';
import { PhaseHeader } from '../components/ui/PhaseHeader';
import { PayrollBar } from '../components/ui/PayrollBar';
import { ErrorNotice } from '../components/ui/ErrorNotice';
import { OfferCard } from '../components/auction/OfferCard';
import { useActionReceipt } from '../hooks/useActionReceipt';
import { payrollAt } from '../lib/contracts';
import {
  mergeAuctionSnapshot,
  type Bids,
} from '../lib/auctionDraft';
import { CAP, fmtM, maxYears, minBid, r01, TOTAL_ROUNDS } from '../lib/money';
import type { AuctionDoc, PrivateAuctionDoc } from '../types/models';
import styles from './AuctionPage.module.css';

type DraftOffer = { rate: string; years: number };
type DraftOffers = Record<string, DraftOffer>;

const toDraftOffers = (bids: Bids): DraftOffers => Object.fromEntries(
  Object.entries(bids).map(([pid, bid]) => [pid, { rate: bid.rate.toFixed(1), years: bid.years }]),
);

const toBids = (draft: DraftOffers): Bids => {
  const bids: Bids = {};
  for (const [pid, offer] of Object.entries(draft)) {
    const rate = Number(offer.rate);
    if (offer.rate.trim() !== '' && Number.isFinite(rate) && rate > 0) {
      bids[pid] = { rate: r01(rate), years: offer.years };
    }
  }
  return bids;
};

const rawOfferMatchesBid = (offer: DraftOffer | undefined, bid: Bids[string] | undefined): boolean => {
  if (!offer || offer.rate.trim() === '') return bid === undefined;
  const rate = Number(offer.rate);
  return bid !== undefined && Number.isFinite(rate)
    && rate === bid.rate && offer.years === bid.years;
};

export default function AuctionPage() {
  const { uid } = useAuth();
  const { game, team, catalog, membership, call, gameId, actsAs } = useGame();
  const [wave, setWave] = useState<AuctionDoc | null>(null);
  const [draft, setDraftState] = useState<DraftOffers>({});
  const [saved, setSaved] = useState<Bids>({});
  const [dirty, setDirtyState] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<DraftOffers>({});
  const savedRef = useRef<Bids>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const editClockRef = useRef(0);
  const editVersionsRef = useRef<Map<string, number>>(new Map());
  const snapshotVersionRef = useRef(0);
  const scopeRef = useRef('');
  const submissionGeneration = useRef(0);
  const pendingSubmissionRef = useRef<{
    generation: number;
    payload: Bids;
    editVersions: ReadonlyMap<string, number>;
    snapshotVersion: number;
  } | null>(null);

  const round = game?.round ?? 1;
  const phase = game?.phase ?? '';
  const teamId = membership?.teamId ?? '';
  const isScout = actsAs('Scout');
  const scoutFallback = isScout && membership?.role !== 'Scout';
  const maxOfferYears = maxYears(round);
  const floor = minBid(round);
  const scope = `${gameId ?? ''}/${round}/${phase}/${teamId}/${membership?.role ?? ''}/${uid ?? ''}`;
  const { receipt, run } = useActionReceipt(scope);

  const replaceDraft = (next: DraftOffers) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const replaceDirty = (next: Set<string>) => {
    dirtyRef.current = next;
    setDirtyState(next);
  };
  const replaceSaved = (next: Bids) => {
    savedRef.current = next;
    setSaved(next);
  };

  useEffect(() => {
    scopeRef.current = scope;
    submissionGeneration.current += 1;
    pendingSubmissionRef.current = null;
    editClockRef.current = 0;
    editVersionsRef.current = new Map();
    snapshotVersionRef.current = 0;
    replaceDraft({});
    replaceDirty(new Set());
    replaceSaved({});
    setErr(null);
    setBusy(false);
    return () => {
      if (scopeRef.current === scope) scopeRef.current = '';
    };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps -- reset all editor state as one scope transaction

  useEffect(() => {
    if (!gameId || round < 1) return undefined;
    const listenerScope = scope;
    return onSnapshot(
      doc(db, 'games', gameId, 'auctions', String(round)),
      (snapshot) => {
        if (scopeRef.current === listenerScope) {
          setWave(snapshot.exists() ? snapshot.data() as AuctionDoc : null);
        }
      },
      () => {
        if (scopeRef.current === listenerScope) setWave(null);
      },
    );
  }, [gameId, round, scope]);

  useEffect(() => {
    if (!gameId || !membership) return undefined;
    const listenerScope = scope;
    return onSnapshot(
      doc(db, 'games', gameId, 'teams', membership.teamId, 'private', 'auction'),
      (snapshot) => {
        if (scopeRef.current !== listenerScope) return;
        const remoteDoc = snapshot.exists() ? snapshot.data() as PrivateAuctionDoc : undefined;
        const remote: Bids = remoteDoc?.round === round && remoteDoc.bids ? remoteDoc.bids : {};
        snapshotVersionRef.current += 1;
        replaceSaved(remote);

        const current = draftRef.current;
        const currentBids = toBids(current);
        const merged = toDraftOffers(mergeAuctionSnapshot(currentBids, remote, dirtyRef.current));
        for (const pid of dirtyRef.current) {
          if (Object.prototype.hasOwnProperty.call(current, pid)) merged[pid] = current[pid];
          else delete merged[pid];
        }
        replaceDraft(merged);
      },
      (error) => {
        if (scopeRef.current === listenerScope) setErr(error);
      },
    );
  }, [gameId, membership, round, uid, scope]);

  const bids = useMemo(() => toBids(draft), [draft]);

  const problems = useMemo(() => {
    const next: Record<string, string> = {};
    for (const [pid, offer] of Object.entries(draft)) {
      if (offer.rate.trim() === '') continue;
      const raw = Number(offer.rate);
      if (!Number.isFinite(raw) || raw <= 0) next[pid] = 'Enter a valid salary per round.';
      else if (raw < floor - 1e-9) next[pid] = `Minimum tonight is ${fmtM(floor)}.`;
      else if (Math.abs(raw * 10 - Math.round(raw * 10)) > 1e-6) {
        next[pid] = 'Bids move in $0.1M steps.';
      } else if (offer.years < 1 || offer.years > maxOfferYears) {
        next[pid] = `Choose 1–${maxOfferYears} rounds.`;
      }
    }
    return next;
  }, [draft, floor, maxOfferYears]);

  const exposure = useMemo(() => {
    if (!team) return [];
    return Array.from({ length: TOTAL_ROUNDS - round + 1 }, (_, index) => {
      const exposureRound = round + index;
      let payroll = payrollAt(team, exposureRound);
      for (const bid of Object.values(bids)) {
        if (exposureRound < round + bid.years) payroll = r01(payroll + bid.rate);
      }
      return { round: exposureRound, payroll };
    });
  }, [team, bids, round]);

  const guaranteed = useMemo(() => r01(Object.values(bids).reduce(
    (total, bid) => total + bid.rate * bid.years, 0,
  )), [bids]);
  const worst = exposure.reduce<{ round: number; payroll: number } | null>(
    (current, item) => current === null || item.payroll > current.payroll ? item : current,
    null,
  );
  const hasProblems = Object.keys(problems).length > 0;
  const hasDraftOffers = Object.keys(bids).length > 0;

  const updateOffer = (pid: number, nextOffer: DraftOffer) => {
    const key = String(pid);
    editClockRef.current += 1;
    editVersionsRef.current.set(key, editClockRef.current);
    const nextDraft = { ...draftRef.current, [key]: nextOffer };
    replaceDraft(nextDraft);
    const nextDirty = new Set(dirtyRef.current);
    if (pendingSubmissionRef.current) nextDirty.add(key);
    else if (rawOfferMatchesBid(nextOffer, savedRef.current[key])) nextDirty.delete(key);
    else nextDirty.add(key);
    replaceDirty(nextDirty);
    setErr(null);
  };

  const withdrawAll = () => {
    if (!wave) return;
    const nextDraft: DraftOffers = {};
    const nextDirty = new Set<string>();
    for (const pid of wave.stars) {
      const key = String(pid);
      const current = draftRef.current[key] ?? { rate: '', years: 1 };
      nextDraft[key] = { ...current, rate: '' };
      editClockRef.current += 1;
      editVersionsRef.current.set(key, editClockRef.current);
      if (pendingSubmissionRef.current || savedRef.current[key] !== undefined) nextDirty.add(key);
    }
    replaceDraft(nextDraft);
    replaceDirty(nextDirty);
    setErr(null);
  };

  const lockIn = async () => {
    if (!gameId || busy || pendingSubmissionRef.current
      || hasProblems || dirtyRef.current.size === 0) return;
    const operationScope = scope;
    const generation = submissionGeneration.current + 1;
    submissionGeneration.current = generation;
    const payload = { ...toBids(draftRef.current) };
    const submission = {
      generation,
      payload,
      editVersions: new Map(editVersionsRef.current),
      snapshotVersion: snapshotVersionRef.current,
    };
    pendingSubmissionRef.current = submission;
    setBusy(true);
    setErr(null);
    try {
      await run('Offers sealed', () => call('submitBids', { gameId, bids: payload }));
      if (scopeRef.current !== operationScope || submissionGeneration.current !== generation) return;
      const sawSnapshotAfterSubmit = snapshotVersionRef.current > submission.snapshotVersion;
      if (!sawSnapshotAfterSubmit) replaceSaved(payload);
      const acknowledgedSaved = sawSnapshotAfterSubmit ? savedRef.current : payload;
      const remaining = new Set<string>();
      for (const pid of dirtyRef.current) {
        const submittedVersion = submission.editVersions.get(pid) ?? 0;
        const currentVersion = editVersionsRef.current.get(pid) ?? 0;
        if (currentVersion > submittedVersion
          || !rawOfferMatchesBid(draftRef.current[pid], acknowledgedSaved[pid])) {
          remaining.add(pid);
        }
      }
      replaceDirty(remaining);
      pendingSubmissionRef.current = null;
    } catch (error) {
      if (scopeRef.current === operationScope && submissionGeneration.current === generation) {
        pendingSubmissionRef.current = null;
        const remaining = new Set<string>();
        const keys = new Set([...Object.keys(draftRef.current), ...Object.keys(savedRef.current)]);
        for (const pid of keys) {
          if (!rawOfferMatchesBid(draftRef.current[pid], savedRef.current[pid])) remaining.add(pid);
        }
        replaceDirty(remaining);
        setErr(error);
      }
    } finally {
      if (scopeRef.current === operationScope && submissionGeneration.current === generation) {
        setBusy(false);
      }
    }
  };

  if (!game || !team) return null;

  return (
    <main className={`page ${styles.page}`}>
      <PhaseHeader title="Star Auction" round={round} timerEndsAt={game.timerEndsAt}
        timerPausedMs={game.timerPausedMs} />
      <PayrollBar team={team} round={round} />

      <section className={styles.rules} aria-labelledby="auction-rules-title">
        <div>
          <h2 id="auction-rules-title">Build sealed contract offers</h2>
          <p>The highest guaranteed money wins. Winners pay their own offer; losers pay nothing.</p>
        </div>
        <dl>
          <div><dt>Minimum</dt><dd>{fmtM(floor)}/rd</dd></div>
          <div><dt>Duration</dt><dd>{maxOfferYears === 1 ? '1 round' : `1–${maxOfferYears} rounds`}</dd></div>
          <div><dt>Revisions</dt><dd>Open until close</dd></div>
        </dl>
      </section>

      <ErrorNotice error={err} />
      {scoutFallback ? (
        <p className={styles.roleNote} data-testid="role-fallback">
          No Scout is seated, so any teammate may manage offers.
        </p>
      ) : null}

      {!wave || catalog.size === 0 ? (
        <p className={styles.loading} role="status">Preparing tonight&apos;s auction board…</p>
      ) : (
        <div className={styles.workspace}>
          <section className={styles.showcase} aria-label="Tonight's auction players">
            {wave.stars.map((pid) => {
              const player = catalog.get(pid);
              if (!player) return null;
              const key = String(pid);
              const offer = draft[key] ?? { rate: '', years: 1 };
              return (
                <OfferCard
                  key={pid}
                  player={player}
                  rate={offer.rate}
                  years={offer.years}
                  maxYears={maxOfferYears}
                  minimum={floor}
                  identity={team.identity}
                  disabled={!isScout}
                  dirty={dirty.has(key)}
                  error={problems[key]}
                  onRateChange={(rate) => updateOffer(pid, { ...offer, rate })}
                  onYearsChange={(years) => updateOffer(pid, { ...offer, years })}
                />
              );
            })}
          </section>

          <aside className={styles.summary} aria-labelledby="offer-summary-title">
            <div className={styles.summaryHeading}>
              <div>
                <h2 id="offer-summary-title">Your offer sheet</h2>
                <p>{dirty.size > 0 ? 'Unsaved changes' : 'Saved with the league'}</p>
              </div>
              <span className={dirty.size > 0 ? styles.unsavedDot : styles.savedDot} aria-hidden="true" />
            </div>

            {receipt && dirty.size === 0 ? (
              <div className={styles.sealed} data-testid="sealed-receipt" key={receipt.id} role="status">
                <strong>SEALED</strong>
                <span>{receipt.label}. You can revise until the auction closes.</span>
              </div>
            ) : null}

            <dl className={styles.totals}>
              <div>
                <dt>Players offered</dt>
                <dd>{Object.keys(bids).length}</dd>
              </div>
              <div>
                <dt>Guaranteed if all win</dt>
                <dd key={`guaranteed-${guaranteed}`} className={styles.amount}>{fmtM(guaranteed)}</dd>
              </div>
            </dl>

            <div className={styles.rounds}>
              <h3>Worst-case round exposure</h3>
              {exposure.map((item) => (
                <div className={styles.roundRow} key={item.round}>
                  <span>Round {item.round}</span>
                  <span key={`${item.round}-${item.payroll}`} className={styles.amount}>
                    {fmtM(item.payroll)} / {fmtM(CAP)}
                  </span>
                </div>
              ))}
              {worst && worst.payroll > CAP ? (
                <p className={styles.warning} role="status">
                  Peak exposure is {fmtM(worst.payroll)} in round {worst.round}. This is allowed;
                  over-cap wins are skipped at resolution.
                </p>
              ) : (
                <p className={styles.ok}>Every proposed offer fits the cap if all win.</p>
              )}
            </div>

            {isScout ? (
              <div className={styles.actions}>
                <button className="btn gold" disabled={busy || hasProblems || dirty.size === 0}
                  onClick={() => void lockIn()}>
                  {busy ? 'Sealing offers…' : 'Lock in bids'}
                </button>
                <button className="btn" disabled={!hasDraftOffers && Object.keys(saved).length === 0}
                  onClick={withdrawAll}>
                  Withdraw all offers
                </button>
                <p>Submitting replaces the whole offer sheet. An empty sheet withdraws every bid.</p>
              </div>
            ) : (
              <p className={styles.readOnly}>The Scout manages this phase. These are your team&apos;s sealed offers.</p>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
