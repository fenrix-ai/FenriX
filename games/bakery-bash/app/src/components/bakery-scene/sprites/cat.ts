import type { SpriteData } from '../sprite-data'

/** Cat sprite — 20×14, 6 frames: walk-L ×2, walk-R ×2, sit, groom. */
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
    // Frame 0: walk-left pose 1
    [
      '                    ',
      '  00                ',
      ' 0110   00          ',
      ' 01510  0100        ',
      ' 0111000110         ',
      ' 01111111110        ',
      ' 01133333110        ',
      ' 01133333110        ',
      ' 01111111110        ',
      '  0010 00110        ',
      '  001  0  0         ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 1: walk-left pose 2 (legs swap)
    [
      '                    ',
      '  00                ',
      ' 0110   00          ',
      ' 01510  0100        ',
      ' 0111000110         ',
      ' 01111111110        ',
      ' 01133333110        ',
      ' 01133333110        ',
      ' 01111111110        ',
      '  001000110         ',
      '   0  0  01         ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 2: walk-right pose 1 (mirror of frame 0)
    [
      '                    ',
      '                00  ',
      '          00   0110 ',
      '        0010  01510 ',
      '         0110001110 ',
      '        01111111110 ',
      '        01133333110 ',
      '        01133333110 ',
      '        01111111110 ',
      '        01100 0100  ',
      '         0  0  100  ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 3: walk-right pose 2
    [
      '                    ',
      '                00  ',
      '          00   0110 ',
      '        0010  01510 ',
      '         0110001110 ',
      '        01111111110 ',
      '        01133333110 ',
      '        01133333110 ',
      '        01111111110 ',
      '         011000100  ',
      '         10  0  0   ',
      '                    ',
      '                    ',
      '                    ',
    ],
    // Frame 4: sitting (tall vertical pose)
    [
      '                    ',
      '    00              ',
      '   0150             ',
      '   0110             ',
      '   01110            ',
      '   011110           ',
      '  0111111           ',
      '  0113331           ',
      '  0111111 0         ',
      '  01111110          ',
      '   011110           ',
      '    0000            ',
      '                    ',
      '                    ',
    ],
    // Frame 5: grooming (head down licking paw)
    [
      '                    ',
      '                    ',
      '   0 0              ',
      '   0 10             ',
      '   01100            ',
      '   011100           ',
      '   0111100          ',
      '   0133310          ',
      '   0111110          ',
      '   01111100         ',
      '    000110          ',
      '                    ',
      '                    ',
      '                    ',
    ],
  ],
}
