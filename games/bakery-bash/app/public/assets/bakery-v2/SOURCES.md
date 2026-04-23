# Asset Sources — Reproducibility Record

Fetched on 2026-04-23 for the `feat/bakery-scene-v2` branch. Hashes let you verify you grabbed the same bits we did.

## Packs

### Kenney — RPG Urban Pack 1.0

- Page: https://kenney.nl/assets/rpg-urban-pack
- Download (zip): https://kenney.nl/media/pages/assets/rpg-urban-pack/a2baff915a-1684996264/kenney_rpg-urban-pack.zip
- File used: `Tilemap/tilemap_packed.png`
- Copied to: `tiles/rpg-urban.png`
- sha256: `305e71fa778444a0858c33988d45a6b79ea923f500f96079f4378347cf6ad389`
- Grid: 16×16 tiles, 27 columns × 18 rows = 486 tiles, no spacing

### Kenney — Tiny Town 1.1

- Page: https://kenney.nl/assets/tiny-town
- Download (zip): https://kenney.nl/media/pages/assets/tiny-town/abbd39a3fc-1677495543/kenney_tiny-town.zip
- File used: `Tilemap/tilemap_packed.png`
- Copied to: `tiles/tiny-town.png`
- sha256: `3a54d99ecde790d4fdea207a3644cf130fc56fa838f1beb1507c185a95b8e902`
- Grid: 16×16 tiles, 12 columns × 11 rows = 132 tiles, no spacing

### Kenney — Tiny Dungeon

- Page: https://kenney.nl/assets/tiny-dungeon
- Download (zip): https://kenney.nl/media/pages/assets/tiny-dungeon/b56d7a13e3-1674742415/kenney_tiny-dungeon.zip
- File used: `Tilemap/tilemap_packed.png`
- Copied to: `tiles/tiny-dungeon.png`
- sha256: `d24e60a41e4ac7a745c0304dfde121143688557f40215f23221c29cfe683825f`
- Grid: 16×16 tiles, 12 columns × 11 rows = 132 tiles, no spacing

### Zabin — "Modern Houses" Tileset TopDown

- Page: https://opengameart.org/content/modern-houses-tileset-topdown
- Download (png): https://opengameart.org/sites/default/files/tiletest.png
- File used: `tiletest.png` (entire spritesheet)
- Copied to: `tiles/modern-houses.png`
- sha256: `45cba22b6c3caff4e70fe3b5570b862fa8b132ce2cc2fc3ae14468b7fc4af7ee`
- Grid: 16×16 tiles, 48 columns × 32 rows max (sparse — not all cells filled), no spacing

## How to re-fetch

```bash
mkdir -p /tmp/cc0-audit
cd /tmp/cc0-audit
curl -sLO https://kenney.nl/media/pages/assets/rpg-urban-pack/a2baff915a-1684996264/kenney_rpg-urban-pack.zip
curl -sLO https://kenney.nl/media/pages/assets/tiny-town/abbd39a3fc-1677495543/kenney_tiny-town.zip
curl -sLO https://kenney.nl/media/pages/assets/tiny-dungeon/b56d7a13e3-1674742415/kenney_tiny-dungeon.zip
curl -sLO https://opengameart.org/sites/default/files/tiletest.png
```

Then unzip each Kenney pack, grab `Tilemap/tilemap_packed.png`, and drop it in `tiles/` renamed as above. Verify hashes with `shasum -a 256 tiles/*.png`.

## Why these packs

- **Modern Houses TopDown** is our primary interior source. It includes: kitchen counter, sink, stove, fridge, wooden floor, wall sections in multiple palettes, doors, windows, beds, tables, and plant decor. Ideal ¾ top-down perspective that Stardew Valley also uses. CC0.
- **RPG Urban** provides ~80 modern-dressed character sprites, perfect for customers wandering a bakery. Also contributes outdoor street/sidewalk tiles visible through the bakery window. CC0.
- **Tiny Town** contributes exterior/storefront accents (sign posts, window variants, outdoor plants) used behind the shop window. CC0.
- **Tiny Dungeon** is a fallback pack held in reserve for crate/barrel/prop shapes if we need them. Currently unused; may be removed before ship if unused at final audit.

Any assets we ultimately don't use will be purged before merging.
