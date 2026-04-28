import { useState } from "react";
import { avatarPathForMember, initialsForName } from "../../lib/avatarManifest";

interface PixelAvatarProps {
  uid?: string | null;
  displayName?: string | null;
  className?: string;
}

export function PixelAvatar({
  uid,
  displayName,
  className = "",
}: PixelAvatarProps) {
  const [imageMissing, setImageMissing] = useState(false);
  const src = imageMissing ? null : avatarPathForMember({ uid, displayName });
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
