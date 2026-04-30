Drop pixel-avatar PNGs in this folder.

Filename rule:
- Use the normalized player name, lowercased and slugged.
- Example: `Sofia Morales Vilchis` -> `sofia-morales-vilchis.png`
- Example: `Kavin Ravi` -> `kavin-ravi.png`
- Example: `Adrian (TA)` -> `adrian.png`
- Example: `Bonny Nguyen (no picture)` uses a built-in creative default.

Recommended export:
- Square PNG
- 24x24 or 32x32 pixels
- Transparent or simple background

The frontend automatically tries `/assets/avatars/<slug>.png` for each team
member after stripping tags like `(TA)`, `(CM)`, and `(no picture)`.

Useful files:
- `scripts/avatar-upload-reference.csv` — rename checklist for the full roster
- `public/assets/avatars/event-attendance-roster.csv` — who is confirmed/maybe/pending for the live event
- `public/assets/avatars/faction-avatar-roster.csv` — full roster template for faction/role-driven character avatars
- `public/assets/avatars/faction-avatar-roster.sample.csv` — tiny sample roster for quick testing
- `src/lib/avatarManifest.ts` — custom/default avatar overrides

Faction-avatar workflow:
- Fill `faction-avatar-roster.csv` with faction names like `circle`, `triangle`, `star`, `umbrella`, `operations`, `finance`, or `advertising`.
- Run `scripts/generate-faction-avatars.py` to create chest-up character avatars.
- Sample output currently goes to `public/assets/avatars/faction-generated/`.
