import { useState } from "react";
import { avatarPathForMember, initialsForName } from "../../lib/avatarManifest";

const DEFAULT_EVENT_AVATAR_PATH = "/assets/avatars/defaults/pixel-spark.svg";

interface PixelAvatarProps {
  uid?: string | null;
  displayName?: string | null;
  className?: string;
  forceDefault?: boolean;
}

export function PixelAvatar({
  uid,
  displayName,
  className = "",
  forceDefault = false,
}: PixelAvatarProps) {
  const [imageMissing, setImageMissing] = useState(false);
  const src = imageMissing
    ? null
    : forceDefault
      ? DEFAULT_EVENT_AVATAR_PATH
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
