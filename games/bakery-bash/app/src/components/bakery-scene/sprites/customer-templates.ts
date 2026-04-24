import type { SpriteData } from '../sprite-data'

export const CUSTOMER_FRAME = {
  walkLeft1: 0,
  walkLeft2: 1,
  walkRight1: 2,
  walkRight2: 3,
  idle: 4,
} as const

/**
 * Customer sprite — 20×36, 5 frames (2 walk-L, 2 walk-R, 1 idle).
 *
 * Palette convention (shared across all 3 body templates):
 *   0 = outline
 *   1 = skin light
 *   2 = skin shadow
 *   3 = hair
 *   4 = shirt
 *   5 = shirt shadow
 *   6 = pants
 *   7 = shoes
 */

/** Body template 1 — standard height, rounded head. */
const BODY_TEMPLATE_1_FRAMES: string[][] = [
  // Frame 0: walk-left pose 1
  [
    '                    ',
    '      03300         ',
    '     0333330        ',
    '     0322320        ',
    '     0122210        ',
    '     0122210        ',
    '      01110         ',
    '       010          ',
    '      04440         ',
    '     044444 0       ',
    '    0444444400      ',
    '   04444444440      ',
    '   04455554440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   00444444400      ',
    '    0044444000      ',
    '     066666600      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666006660      ',
    '    0660  0660      ',
    '    066    660      ',
    '    077    770      ',
    '   0777    7770     ',
    '   0770    0770     ',
    '   0770    0770     ',
    '    00      00      ',
  ],
  // Frame 1: walk-left pose 2 (leg forward/back reversed)
  [
    '                    ',
    '      03300         ',
    '     0333330        ',
    '     0322320        ',
    '     0122210        ',
    '     0122210        ',
    '      01110         ',
    '       010          ',
    '      04440         ',
    '     044444 0       ',
    '    0444444400      ',
    '   04444444440      ',
    '   04455554440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   00444444400      ',
    '    0044444000      ',
    '     066666600      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '   0666000660       ',
    '   0770  0770       ',
    '   077    770       ',
    '   077    770       ',
    '    0      0        ',
    '                    ',
  ],
  // Frame 2: walk-right pose 1 (mirror frame 0)
  [
    '                    ',
    '         00330      ',
    '        0333330     ',
    '        0323320     ',
    '        0122210     ',
    '        0122210     ',
    '         01110      ',
    '          010       ',
    '         04440      ',
    '       0 044440     ',
    '      0044444440    ',
    '      04444444440   ',
    '      04445555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      00444444400   ',
    '      000444440     ',
    '      0066666600    ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066606666 0   ',
    '      0660  0660    ',
    '      066    660    ',
    '      077    770    ',
    '     0777    7770   ',
    '     0770    0770   ',
    '     0770    0770   ',
    '      00      00    ',
  ],
  // Frame 3: walk-right pose 2
  [
    '                    ',
    '         00330      ',
    '        0333330     ',
    '        0323320     ',
    '        0122210     ',
    '        0122210     ',
    '         01110      ',
    '          010       ',
    '         04440      ',
    '       0 044440     ',
    '      0044444440    ',
    '      04444444440   ',
    '      04445555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      04455555440   ',
    '      00444444400   ',
    '      000444440     ',
    '      0066666600    ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '      066666666 0   ',
    '       066600066 0  ',
    '       077 0 0 77   ',
    '       77     77    ',
    '       77     77    ',
    '        0     0     ',
    '                    ',
  ],
  // Frame 4: idle (facing forward/camera)
  [
    '                    ',
    '      03300         ',
    '     0333330        ',
    '     0322320        ',
    '     0122210        ',
    '     0122210        ',
    '      01110         ',
    '       010          ',
    '      04440         ',
    '     044444 0       ',
    '    0444444400      ',
    '   04444444440      ',
    '   04455554440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   04455555440      ',
    '   00444444400      ',
    '    0044444000      ',
    '     066666600      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666666660      ',
    '    0666006660      ',
    '    0666006660      ',
    '    0660  0660      ',
    '    066    660      ',
    '    077    770      ',
    '   0777    7770     ',
    '   0770    0770     ',
    '   0770    0770     ',
    '    00      00      ',
  ],
]

/** Body template 2 — shorter/stockier (first row shifted down 2 px). */
const BODY_TEMPLATE_2_FRAMES: string[][] = BODY_TEMPLATE_1_FRAMES.map((frame) => {
  // shift down 2 px — first 2 rows blank, drop last 2 rows
  const shifted = ['                    ', '                    ', ...frame.slice(0, frame.length - 2)]
  return shifted
})

/** Body template 3 — taller head (add 1 row of hair at top). */
const BODY_TEMPLATE_3_FRAMES: string[][] = BODY_TEMPLATE_1_FRAMES.map((frame) => {
  const copy = [...frame]
  // Replace the first row with a hair row (more visible head)
  copy[0] = '     033333300      '
  return copy
})

/** Palette variant A: brown hair + red shirt + blue pants. */
const PALETTE_A = [
  '#1e1410', '#f2c9a3', '#d29872', '#4a2a10',
  '#b83a3a', '#832020', '#1f3c6b', '#2d1810',
]
/** Palette variant B: blonde hair + green shirt + tan pants. */
const PALETTE_B = [
  '#1e1410', '#f2c9a3', '#d29872', '#b89456',
  '#3a7a3a', '#205020', '#8a6a3a', '#2d1810',
]

function buildVariant(frames: string[][], palette: string[]): SpriteData {
  return { width: 20, height: 36, palette, frames }
}

/** 3 body templates × 2 palettes = 6 visually distinct customers. */
export const customerTemplates: SpriteData[] = [
  buildVariant(BODY_TEMPLATE_1_FRAMES, PALETTE_A),
  buildVariant(BODY_TEMPLATE_1_FRAMES, PALETTE_B),
  buildVariant(BODY_TEMPLATE_2_FRAMES, PALETTE_A),
  buildVariant(BODY_TEMPLATE_2_FRAMES, PALETTE_B),
  buildVariant(BODY_TEMPLATE_3_FRAMES, PALETTE_A),
  buildVariant(BODY_TEMPLATE_3_FRAMES, PALETTE_B),
]
