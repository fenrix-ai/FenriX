# Asset source files — 2026-04-24 art-polish session

These are the source images provided by the user for the bakery scene art polish work. See the parent plan `../../2026-04-24-pixel-bakery-scene-art-polish.md` for the full context.

## Files

| File | Contents | Use |
|---|---|---|
| `bread-pixel-art.zip` | Original Freepik download — pixel-art food illustration pack (JPG + AI + EPS) | Source of truth |
| `bread-pixel-art.jpg` | 14 pixel-art bread/pastry items arranged organically (not a strict grid) on a `#714256` wine-purple background. 2000×2000. | **USE THIS.** Extracted per-item PNGs with transparent background landed at `games/bakery-bash/app/public/assets/pixel-scene/bread/*.png` (see `extract-bread.py` in this folder for the extraction recipe — Pillow + connected-components BFS, chromakey by euclidean RGB distance). |
| `appliances-reference.zip` | Original Freepik download — cooking appliances icon set (JPG + EPS + licenses) | Reference only |
| `appliances-reference.jpg` | Grid of kitchen appliance icons, flat vector / cartoon style | **DO NOT USE** in the scene — style clash with pixel-art chefs. Keep as visual reference when hand-redrawing the oven and espresso machine in pixel-art style. |
| `appliances-license-free.txt` | Freepik free-tier license for the appliances pack | Attribution terms: `katemangostar / Freepik` |
| `appliances-license-premium.txt` | Freepik premium-tier license (N/A if user downloaded under free tier) | For completeness |

## Licensing summary

Both packs are Freepik free-tier assets. Using them in this project requires **visible attribution** somewhere in the app:

- Bread pack: generic `Designed by Freepik`
- Appliances pack: `Designed by katemangostar / Freepik` *(if used — current decision is NOT to ship these in the scene, but if any hand-redrawn element is inspired by the reference, attribution is still appropriate)*

The bread zip did not include a license text file. The Freepik free-tier attribution requirement applies regardless; the absence of the file is noted here so future maintainers know to double-check license terms at the Freepik download page before redistributing.

## Restrictions (from `License free.txt`)

- Allowed: personal + commercial projects, modification (cropping, recoloring, etc.), use in website/application as part of design.
- Not allowed: sub-license, resell, rent, or include in an archive/database for redistribution.
- This project repo is not considered an "archive or database" in the restrictive sense (it is project-internal source material, not a distributed asset library), but do not publish these raw JPGs as a standalone asset drop.
