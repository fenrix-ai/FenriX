const AVATAR_BASE_PATH = "/assets/avatars";

type AvatarOverride = {
  path: string;
};

const DISPLAY_NAME_ALIASES: Record<string, string> = {
  "peyton-grey": "Peyton Gray",
  peytongray: "Peyton Gray",
  peytongrey: "Peyton Gray",
  "zacharynamimatsu": "Zachary Namimatsu",
  "joshua-kreider": "Josh Kreider",
  "sam-simpkins-no-picture": "Sam Simpkins",
  "sam-simpkins-no-pic": "Sam Simpkins",
  "bonny-nguyen-no-picture": "Bonny Nguyen",
  "bonny-nguyen-no-pic": "Bonny Nguyen",
  "naveed-tabatabaii-no-picture": "Naveed Tabatabaii",
  "naveed-tabatabaii-no-pic": "Naveed Tabatabaii",
  "klaus-asay-no-picture": "Klaus Asay",
  "klaus-asay-no-pic": "Klaus Asay",
  "lincoln-stuek-no-picture": "Lincoln Stuek",
  "lincoln-stuek-no-pic": "Lincoln Stuek",
};

const DISPLAY_NAME_OVERRIDES: Record<string, AvatarOverride> = {
  "bonny-nguyen": { path: `${AVATAR_BASE_PATH}/defaults/pixel-heart.svg` },
  "finbar-o-brien": { path: `${AVATAR_BASE_PATH}/defaults/pixel-star.svg` },
  "joshua-kreider": { path: `${AVATAR_BASE_PATH}/defaults/pixel-cookie.svg` },
  "josh-kreider": { path: `${AVATAR_BASE_PATH}/defaults/pixel-cookie.svg` },
  "klaus-asay": { path: `${AVATAR_BASE_PATH}/defaults/pixel-bagel.svg` },
  lincoln: { path: `${AVATAR_BASE_PATH}/defaults/pixel-oven.svg` },
  lincoin: { path: `${AVATAR_BASE_PATH}/defaults/pixel-oven.svg` },
  "lincoln-stuek": { path: `${AVATAR_BASE_PATH}/defaults/pixel-oven.svg` },
  "naveed-tabatabaii": { path: `${AVATAR_BASE_PATH}/defaults/pixel-coffee.svg` },
  xavier: { path: `${AVATAR_BASE_PATH}/defaults/pixel-spark.svg` },
  "sam-simpkins": { path: `${AVATAR_BASE_PATH}/defaults/pixel-cookie.svg` },
};

/**
 * Optional uid-specific overrides when multiple players may share a name.
 */
const UID_ALIASES: Record<string, string> = {};

export function normalizeAvatarName(value: string): string {
  return value
    .replace(/\((?:ta|cm|no picture)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyAvatarKey(value: string): string {
  return normalizeAvatarName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function initialsForName(value: string): string {
  const parts = normalizeAvatarName(value)
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function avatarPathForMember(member: {
  uid?: string | null;
  displayName?: string | null;
}): string | null {
  const uid =
    typeof member.uid === "string" && member.uid.trim().length > 0
      ? member.uid.trim()
      : null;
  const uidKey = uid ? UID_ALIASES[uid] ?? null : null;
  if (uidKey) {
    return `${AVATAR_BASE_PATH}/${slugifyAvatarKey(uidKey)}.png`;
  }

  const rawDisplayName =
    typeof member.displayName === "string" ? member.displayName.trim() : "";
  if (!rawDisplayName) return null;

  const normalizedDisplayName = normalizeAvatarName(rawDisplayName);
  const normalizedSlug = slugifyAvatarKey(normalizedDisplayName);
  const canonicalDisplayName =
    DISPLAY_NAME_ALIASES[normalizedSlug] ?? normalizedDisplayName;
  const canonicalSlug = slugifyAvatarKey(canonicalDisplayName);
  const override =
    DISPLAY_NAME_OVERRIDES[canonicalSlug] ??
    DISPLAY_NAME_OVERRIDES[normalizedSlug];
  if (override) return override.path;

  const displayKey = canonicalSlug || normalizedSlug;
  return displayKey ? `${AVATAR_BASE_PATH}/${displayKey}.png` : null;
}
