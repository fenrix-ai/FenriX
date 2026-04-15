## Bakery Bash SVG character style

These character assets are **pixel-art SVGs** for easy scaling and simple walk-cycle animation.

### Conventions
- **Transparent background**
- **Crisp pixels**: `shape-rendering="crispEdges"`
- **Grid**: each pixel is `1x1` in the SVG coordinate system
- **Frame size**: `32x48`
- **Spritesheets**: 3 frames laid out horizontally → `96x48` overall

### Animation approach (recommended)
Render the spritesheet as an `<img>` or background-image and animate the visible window:
- Set a `32x48` viewport/window
- Step through frames at ~6–10 fps

If you prefer frame-by-frame, you can split frames later (easy: copy a `32x48` region).
