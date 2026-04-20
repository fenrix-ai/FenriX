import { useEffect } from "react";

/**
 * FE-06 — The opening "company email" modal for each round. Backend
 * writes `rounds/round_{N}.marketEmail = { subject, body, from }` at the
 * start of the email phase (BE-07). The parent page (`/game/email`)
 * subscribes to that doc and passes the current value in as props.
 *
 * Dismiss behavior: clicking the primary button fires `onContinue`. The
 * parent decides whether to navigate, wait for the phase to auto-advance,
 * or both.
 */
export interface MarketEmailModalProps {
  open: boolean;
  /** Round the email is for — shown as "Round N briefing". */
  round: number | null;
  /** Body of the email (may contain newlines). */
  body: string | null;
  subject?: string | null;
  from?: string | null;
  /** Footer action copy, default: "Got it — let's bake". */
  continueLabel?: string;
  onContinue?: () => void;
  /** Disable the continue button (e.g. while phase is loading). */
  continueDisabled?: boolean;
}

export function MarketEmailModal({
  open,
  round,
  body,
  subject,
  from,
  continueLabel = "Got it — let's bake",
  onContinue,
  continueDisabled,
}: MarketEmailModalProps) {
  // Trap scroll on the body while the modal is open so readers don't lose
  // their place in background content.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="market-email-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-email-subject"
    >
      <div
        className="market-email-modal__backdrop"
        aria-hidden="true"
      />

      <div className="market-email-modal__card">
        <header className="market-email-modal__header">
          <div className="market-email-modal__icon" aria-hidden="true">
            <img src="/assets/ui/email.svg" alt="" />
          </div>
          <div className="market-email-modal__meta">
            <div className="market-email-modal__eyebrow">
              {round ? `Round ${round} briefing` : "Market briefing"}
            </div>
            <h2 id="market-email-subject" className="market-email-modal__subject">
              {subject ?? "This week's market memo"}
            </h2>
            {from && (
              <div className="market-email-modal__from">From: {from}</div>
            )}
          </div>
        </header>

        <div className="market-email-modal__body">
          {body ? (
            body
              .split(/\n\n+/)
              .map((para, i) => (
                <p key={i} className="market-email-modal__para">
                  {para}
                </p>
              ))
          ) : (
            <p className="market-email-modal__para market-email-modal__para--pending">
              The market memo is on its way…
            </p>
          )}
        </div>

        <footer className="market-email-modal__footer">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onContinue}
            disabled={continueDisabled}
          >
            {continueLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
