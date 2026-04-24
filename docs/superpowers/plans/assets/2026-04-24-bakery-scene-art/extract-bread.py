"""
One-shot extraction of the Freepik bread sprite sheet into individual
transparent PNGs, saved to the repo's public/ asset directory.

Input: docs/superpowers/plans/assets/2026-04-24-bakery-scene-art/bread-pixel-art.jpg (2000x2000)
Output: games/bakery-bash/app/public/assets/pixel-scene/bread/*.png

Algorithm:
  1. Build a boolean mask of "bright" pixels (clearly bread, not shadow, not bg).
  2. Dilate the mask by R pixels so each item becomes a solid blob.
  3. Find connected components (4-connectivity BFS).
  4. For each component, compute its bbox, grow it to include the full item
     (non-bg pixels), chromakey the bg, save as PNG.
"""
from PIL import Image
from collections import deque
import os

SRC = '/Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2/docs/superpowers/plans/assets/2026-04-24-bakery-scene-art/bread-pixel-art.jpg'
OUT_DIR = '/Users/dylanmassaro/FenriX/.worktrees/bakery-scene-v2/games/bakery-bash/app/public/assets/pixel-scene/bread'

BG_R, BG_G, BG_B = 113, 66, 86        # #714256
BG_TOL = 40
BRIGHT_THRESH = 180                   # max-channel value for "clearly a bread pixel"
DILATE_RADIUS = 20                    # merges pixels within the same item
PADDING = 20
MIN_COMPONENT_AREA = 400              # discard specks

def dist2(r, g, b):
    dr, dg, db = r - BG_R, g - BG_G, b - BG_B
    return dr * dr + dg * dg + db * db

def main():
    img = Image.open(SRC).convert('RGB')
    W, H = img.size
    px = img.load()
    print(f'Loaded {W}x{H}')

    # Step 1: bright mask.
    bright = bytearray(W * H)
    for y in range(H):
        base = y * W
        for x in range(W):
            r, g, b = px[x, y]
            if max(r, g, b) > BRIGHT_THRESH:
                bright[base + x] = 1

    # Step 2: dilate with two 1D passes (separable box filter approximation).
    # Horizontal dilation:
    dil = bytearray(W * H)
    r = DILATE_RADIUS
    for y in range(H):
        base = y * W
        # Sliding window of size 2r+1; if any pixel in the window is set, dilation is 1.
        # Use a count; increment when entering the window, decrement when leaving.
        count = 0
        for x in range(-r, W + r):
            enter = x + r
            leave = x - r - 1
            if 0 <= enter < W and bright[base + enter]:
                count += 1
            if 0 <= leave < W and bright[base + leave]:
                count -= 1
            if 0 <= x < W and count > 0:
                dil[base + x] = 1
    # Vertical dilation (working from dil → dil2).
    dil2 = bytearray(W * H)
    for x in range(W):
        count = 0
        for y in range(-r, H + r):
            enter = y + r
            leave = y - r - 1
            if 0 <= enter < H and dil[enter * W + x]:
                count += 1
            if 0 <= leave < H and dil[leave * W + x]:
                count -= 1
            if 0 <= y < H and count > 0:
                dil2[y * W + x] = 1
    print('Dilation done.')

    # Step 3: connected components via BFS. Label buffer (0=unassigned, else id+1).
    labels = bytearray(W * H)  # up to 255 labels — plenty for ~14 items.
    components = []
    next_label = 1
    for sy in range(H):
        row_base = sy * W
        for sx in range(W):
            idx = row_base + sx
            if dil2[idx] and not labels[idx]:
                # BFS
                q = deque([(sx, sy)])
                labels[idx] = next_label
                minx, maxx, miny, maxy = sx, sx, sy, sy
                area = 0
                while q:
                    x, y = q.popleft()
                    area += 1
                    if x < minx: minx = x
                    if x > maxx: maxx = x
                    if y < miny: miny = y
                    if y > maxy: maxy = y
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < W and 0 <= ny < H:
                            ni = ny * W + nx
                            if dil2[ni] and not labels[ni]:
                                labels[ni] = next_label
                                q.append((nx, ny))
                if area >= MIN_COMPONENT_AREA:
                    components.append((minx, miny, maxx + 1, maxy + 1, area, next_label))
                next_label += 1
    print(f'Components: {len(components)}')
    for c in components:
        print(f'  bbox=({c[0]},{c[1]})-({c[2]},{c[3]})  area={c[4]}  label={c[5]}')

    # Step 4: sort row-major.
    components.sort(key=lambda c: (c[1] // 400, c[0]))

    os.makedirs(OUT_DIR, exist_ok=True)
    tol2 = BG_TOL * BG_TOL

    for i, (x0, y0, x1, y1, _area, label) in enumerate(components, start=1):
        x0p = max(0, x0 - PADDING)
        y0p = max(0, y0 - PADDING)
        x1p = min(W, x1 + PADDING)
        y1p = min(H, y1 + PADDING)
        crop = img.crop((x0p, y0p, x1p, y1p)).convert('RGBA')
        data = crop.load()
        cw, ch = crop.size
        for yy in range(ch):
            src_y = y0p + yy
            row_base = src_y * W
            for xx in range(cw):
                src_x = x0p + xx
                r, g, b, a = data[xx, yy]
                # Transparent if background OR belongs to a different component.
                pixel_label = labels[row_base + src_x]
                if pixel_label != label or dist2(r, g, b) <= tol2:
                    data[xx, yy] = (0, 0, 0, 0)
        name = f'{i:02d}.png'
        crop.save(os.path.join(OUT_DIR, name))
        print(f'  saved {name}: {cw}x{ch}')

if __name__ == '__main__':
    main()
