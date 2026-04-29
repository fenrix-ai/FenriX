import type { SpriteData } from '../sprite-data'

/**
 * Bakery station chef — white hat + white t-shirt + navy apron.
 * 24×40. Frame 0 = standing, Frame 1 = 1-px Y-shift bob.
 *
 * K-06 (2026-04-29): standardized the chef uniform across all three
 * stations to the universal "chef" look — white hat, white shirt,
 * navy apron — so the sprite reads as a chef from the across-the-room
 * tile size rather than as "blue/cream/green blob". Per-station
 * differentiation now lives in the scene context (which counter the
 * sprite stands behind), not in the uniform itself.
 *
 * Palette:
 *   0 = outline / dark shadow
 *   1 = skin light
 *   2 = skin shadow
 *   3 = hair / hat brim
 *   4 = hat white
 *   5 = shirt white (under apron / collar / cuffs)
 *   6 = apron navy
 *   7 = apron navy shadow
 *   8 = pants brown
 *   9 = shoe dark
 */
export const chefBakery: SpriteData = {
  width: 24,
  height: 40,
  palette: [
    '#1e1410', // 0 outline
    '#f2c9a3', // 1 skin light
    '#d29872', // 2 skin shadow
    '#3d281a', // 3 hair
    '#ffffff', // 4 hat white
    '#ffffff', // 5 shirt white
    '#1e3a8a', // 6 apron navy
    '#172554', // 7 apron navy shadow
    '#6b4428', // 8 pants
    '#2d1810', // 9 shoe
  ],
  frames: [
    // Frame 0 — standing (Y = 0..39)
    [
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '    00      00          ',
    ],
    // Frame 1 — idle bob: shift everything down 1 px (first row becomes blank).
    [
      '                        ',
      '       00000000         ',
      '      04444444400       ',
      '      04444444400       ',
      '      00444444000       ',
      '       01112110         ',
      '        011110          ',
      '       0122210          ',
      '       0121110          ',
      '       012221 0         ',
      '      005555500         ',
      '     00566666500        ',
      '    0056666660500       ',
      '   00566666666050       ',
      '   05566666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05677776666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05666666666650       ',
      '   05566666666550       ',
      '   00055666655500       ',
      '     0055555500         ',
      '     0008880000         ',
      '     088888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888888880          ',
      '    0888008880          ',
      '    0880  0880          ',
      '    088    880          ',
      '    099    990          ',
      '   0999    9990         ',
      '   0990    0990         ',
      '   0990    0990         ',
      '   0990    0990         ',
    ],
  ],
}
