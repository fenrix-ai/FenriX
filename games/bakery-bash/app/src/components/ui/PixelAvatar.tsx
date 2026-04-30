import { useState } from "react";
import { avatarPathForFilename, avatarPathForMember, initialsForName } from "../../lib/avatarManifest";

const DEFAULT_EVENT_AVATAR_PATH = "/assets/avatars/defaults/pixel-spark.svg";

interface PixelAvatarProps {
  uid?: string | null;
  displayName?: string | null;
  /**
   * The opaque-hash avatar filename (e.g. `474109343644.png`) supplied by the
   * roster fetch. Preferred over `displayName`-derived URLs because the
   * manifest no longer derives URL slugs from human names — server-rendered
   * filenames are the only way to reach a roster avatar PNG.
   */
  avatarFilename?: string | null;
  className?: string;
  forceDefault?: boolean;
}

export function PixelAvatar({
  uid,
  displayName,
  avatarFilename,
  className = "",
  forceDefault = false,
}: PixelAvatarProps) {
  const [imageMissing, setImageMissing] = useState(false);
  const src = imageMissing
    ? null
    : forceDefault
      ? DEFAULT_EVENT_AVATAR_PATH
      : avatarFilename
        ? avatarPathForFilename(avatarFilename)
        : avatarPathForMember({ uid, displayName });
  const fallbackLabel = initialsForName(displayName ?? "");
  const avatarClassName = ["pixel-avatar", className].filter(Boolean).join(" ");

  if (!src) {
    return (
      <span
        className={`${avatarClassName} pixel-avatar--fallback`}
        aria-hidden="true"
      >
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      className={avatarClassName}
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setImageMissing(true)}
    />
  );
}
