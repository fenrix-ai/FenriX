import type { SpriteData } from '../sprite-data'

/** Cat sprite — 20×14, 6 frames: walk-L ×2, walk-R ×2, sit, groom.
 *
 * Silhouette tuned to clearly read as a cat (pointed ears, visible tail
 * curling up over the back) rather than a chicken / blob at tiny sizes.
 */
export const CAT_FRAME = {
  walkLeft1: 0,
  walkLeft2: 1,
  walkRight1: 2,
  walkRight2: 3,
  sit: 4,
  groom: 5,
} as const

export const cat: SpriteData = {
  width: 20,
  height: 14,
  palette: [
    '#1e1410', // 0 outline
    '#d9a35a', // 1 tabby body
    '#a67025', // 2 tabby shadow
    '#f6e0b5', // 3 belly
    '#ff8aa8', // 4 nose / tongue
    '#1aa34a', // 5 eye (green)
  ],
  frames: [
    // Frame 0: walk-left pose 1 (facing left; tail arches up over the back)
    [
      '                    ',
      ' 0    0             ',
      ' 010  010      00   ',
      ' 01110011    0110   ',
      ' 01510111   0110    ',
      ' 0111111110110      ',
      ' 011111111110       ',
      ' 013333333310       ',
      ' 011111111110       ',
      '  011 011 011       ',
      '  0 0 0 0 0 0       ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 1: walk-left pose 2 (legs offset; tail waves slightly)
    [
      '                    ',
      ' 0    0             ',
      ' 010  010       00  ',
      ' 01110011     0110  ',
      ' 01510111    0110   ',
      ' 01111111110110     ',
      ' 011111111110       ',
      ' 013333333310       ',
      ' 011111111110       ',
      '   011 011 011      ',
      '   0 0 0 0 0 0      ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 2: walk-right pose 1 (mirror of frame 0)
    [
      '                    ',
      '             0    0 ',
      '   00      010  010 ',
      '  0110    1100111 0 ',
      '   0110   1110151 0 ',
      '     0110111111110  ',
      '      011111111110  ',
      '      013333333310  ',
      '      011111111110  ',
      '      011 011 011   ',
      '      0 0 0 0 0 0   ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 3: walk-right pose 2
    [
      '                    ',
      '             0    0 ',
      '  00       010  010 ',
      '  0110   1100111 0  ',
      '   0110   1110151 0 ',
      '    0110 11111110   ',
      '      011111111110  ',
      '      013333333310  ',
      '      011111111110  ',
      '       011 011 011  ',
      '       0 0 0 0 0 0  ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 4: sitting (pointy ears; tail curled along the front)
    [
      '                    ',
      '   0    0           ',
      '   010  010         ',
      '   0111110          ',
      '   0151110          ',
      '   01111110         ',
      '   011111110   0    ',
      '   01333333110 0    ',
      '   01333333110 0    ',
      '   0111111111110    ',
      '    00     00       ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 5: grooming (head down licking paw; tail visible behind)
    [
      '                    ',
      '   0    0           ',
      '   010  010         ',
      '   0111110          ',
      '   0121110  00      ',
      '   01111110 010     ',
      '   011111111110     ',
      '   01333333310      ',
      '   01111111110      ',
      '     001001         ',
      '      0  0          ',
      '                    ',
      '                    ',
      '                    ',
    ],
  ],
}
