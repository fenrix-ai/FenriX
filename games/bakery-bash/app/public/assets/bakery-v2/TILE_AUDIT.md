# Tile Audit — Bakery Scene v2

Tile inventory for the bakery hero scene. All coordinates are **tile coordinates** (16-pixel units) on the named tilesheet, with `(col, row)` indexed from the top-left at `(0, 0)`. Pixel offset: `px = col * 16`, `py = row * 16`.

Coords below were picked by a combination of visual inspection and **programmatic pixel sampling** in the browser — see the scripted classifiers inside `__RU_TILES__` / `__MH_TILES__` in dev-only eval sessions. Any coord marked `~` is approximate.

## Decision: use rpg-urban as the primary sheet

Initially we planned to use Modern Houses TopDown as the main source, but a full audit revealed it's primarily a **house-exterior** sheet (roofs, facades, gables) — it only contains a handful of interior props and no clean repeatable floor tile. Kenney's RPG Urban Pack has:

- Clean 16×16 wood-plank floor tiles that tile seamlessly.
- Doors, windows, trees, signs, chairs, counters — all standalone 1- or 2-tile props.
- A full character set (bakers, customers) in cols 22–26.

Walls in rpg-urban are baked into pre-composed room fragments — there is no clean standalone wall tile. We draw the wall in **CSS** (`.bakery-scene__wall` — cream gradient + baseboard line), which is both simpler and more responsive to tile-size changes.

## Tile registry

| Tile key            | Sheet        | (col, row) | What it is                                     |
|---------------------|--------------|-----------:|------------------------------------------------|
| `floor-wood`        | rpg-urban    | (20, 6)    | Warm-brown wood plank — uniform `#c77b47`.     |
| `floor-wood-alt`    | rpg-urban    | (18, 6)    | Wood plank variant — same palette.             |
| `oven-left`         | rpg-urban    | (0, 14)    | Industrial stove left half (purple/chrome).    |
| `oven-right`        | rpg-urban    | (1, 14)    | Industrial stove right half.                   |
| `stove-left`        | rpg-urban    | (2, 14)    | Stove left half (warmer palette).              |
| `stove-right`       | rpg-urban    | (3, 14)    | Stove right half.                              |
| `counter-top`       | rpg-urban    | (3, 10)    | Wooden display counter — top tile.             |
| `counter-bot`       | rpg-urban    | (3, 11)    | Wooden display counter — bottom tile.          |
| `door-top`          | rpg-urban    | (13, 10)   | Painted wooden front door — top half.          |
| `door-bot`          | rpg-urban    | (13, 11)   | Painted wooden front door — bottom half.       |
| `window-top`        | rpg-urban    | (11, 12)   | Framed window — top half.                      |
| `window-bot`        | rpg-urban    | (11, 13)   | Framed window — bottom half.                   |
| `tree-green-top`    | rpg-urban    | (16, 8)    | Green tree — top crown.                        |
| `tree-green-mid`    | rpg-urban    | (16, 9)    | Green tree — middle trunk.                     |
| `tree-green-bot`    | rpg-urban    | (16, 10)   | Green tree — base + pot.                       |
| `tree-orange-top`   | rpg-urban    | (16, 11)   | Autumn tree — top crown (`#d95e37` dominant).  |
| `tree-orange-mid`   | rpg-urban    | (16, 12)   | Autumn tree — middle trunk.                    |
| `tree-orange-bot`   | rpg-urban    | (16, 13)   | Autumn tree — base.                            |
| `sign-red`          | rpg-urban    | (8, 10)    | Red shop-sign facade — for the BAKERY sign.    |
| `chair-wood`        | rpg-urban    | (15, 15)   | Orange-brown café chair (`rgb(188, 140, 94)`). |

## Scene composition

The hero scene is 24 × 14 tiles (see `SCENE_WIDTH_TILES` / `SCENE_HEIGHT_TILES` in `scene-data.ts`). Layout sketch:

```
 row 0-1  : painted cream wall band (CSS, height = tilePx*2)
 row 2    : [ . . . . . . . . . . . SI SI . . . . . . . . . . . ]  shop sign
 row 3-4  : [ . . WT WT . . . . . . . . . . . . . . . WT WT . . . ] windows flanking
            [ . . WB WB . . . . . . . . . . . . . . . WB WB . . . ]
 row 5    : [ . . . . . OL OR SL SR . . . . CT CT CT . . . . . . . ] oven + counter
 row 6    : [ . . . . . . . . . . . . . CB CB CB . . . . . . . . . ]
 row 7    : breathing space
 row 8-10 : [ . T1 . . . . . . . . . . . . . . . . . . . A1 . . ]   trees + café chairs
            [ . T2 . CH. . . . . . . . . . . . . . . . . A2 . . ]
            [ . T3 . . . . . CH. . . . . . . CH. . . . . A3 . . ]
 row 11   : breathing space
 row 12-13: [ . . . . . . . . . . . DT DT . . . . . . . . . . . ]   front door
            [ . . . . . . . . . . . DB DB . . . . . . . . . . . ]
 bottom   : painted cream front-wall band (CSS, height = tilePx*1.25)
```

## Sheets still bundled but unused

- `modern-houses.png` — Modern Houses TopDown (Zabin). Kept because the tile inspector route still references it as a browsable sheet for future additions (e.g. team-chalkboard picture frame). If unused by Phase 6, remove and update `LICENSES.md` / `SOURCES.md`.
- `tiny-town.png` / `tiny-dungeon.png` — Held in reserve. Not currently referenced.
