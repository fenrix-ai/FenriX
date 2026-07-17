import { errorCopy } from '../../lib/errors';

export function ErrorNotice({ error }: { error: unknown | null }) {
  if (!error) return null;
  const { headline, raw } = errorCopy(error);
  return (
    <div className="error-notice" role="alert">
      {headline}{raw ? <div className="dim" style={{ fontSize: 12 }}>{raw}</div> : null}
    </div>
  );
}
