import type { Style } from './types';

/** All 5 non-math Unicode palettes, PRD appendix A.3. */
export const NON_MATH_STYLES: readonly Style[] = [
  {
    id: 'circled',
    label: 'Circled',
    upperBase: 0x24B6,
    lowerBase: 0x24D0,
    digitBase: null,
    coverage: 'full',
    exceptions: new Map([
      ['0', 0x24EA],
      ['1', 0x2460],
      ['2', 0x2461],
      ['3', 0x2462],
      ['4', 0x2463],
      ['5', 0x2464],
      ['6', 0x2465],
      ['7', 0x2466],
      ['8', 0x2467],
      ['9', 0x2468],
    ]),
  },
  {
    id: 'squared',
    label: 'Squared',
    upperBase: 0x1F130,
    lowerBase: null,
    digitBase: null,
    coverage: 'upperOnly',
    exceptions: new Map(),
  },
  {
    id: 'negative-squared',
    label: 'Negative Squared',
    upperBase: 0x1F170,
    lowerBase: null,
    digitBase: null,
    coverage: 'upperOnly',
    exceptions: new Map(),
  },
  {
    id: 'fullwidth',
    label: 'Fullwidth',
    upperBase: 0xFF21,
    lowerBase: 0xFF41,
    digitBase: 0xFF10,
    coverage: 'full',
    exceptions: new Map(),
  },
  {
    id: 'parenthesized',
    label: 'Parenthesized',
    upperBase: null,
    lowerBase: 0x249C,
    digitBase: null,
    coverage: 'lowerOnly',
    exceptions: new Map([
      ['1', 0x2474],
      ['2', 0x2475],
      ['3', 0x2476],
      ['4', 0x2477],
      ['5', 0x2478],
      ['6', 0x2479],
      ['7', 0x247A],
      ['8', 0x247B],
      ['9', 0x247C],
    ]),
  },
];

/** Lookup a non-math palette style by id. */
export const NON_MATH_STYLE_BY_ID: ReadonlyMap<string, Style> = new Map(
  NON_MATH_STYLES.map(s => [s.id, s])
);
