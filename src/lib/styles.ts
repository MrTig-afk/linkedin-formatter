import type { Style } from './types';

/** All 13 math-alphanumeric styles, PRD appendix A.1. */
export const MATH_STYLES: readonly Style[] = [
  { id: 'bold',                   label: 'Bold',                   upperBase: 0x1D400, lowerBase: 0x1D41A, digitBase: 0x1D7CE, exceptions: new Map(), coverage: 'full' },
  { id: 'italic',                 label: 'Italic',                 upperBase: 0x1D434, lowerBase: 0x1D44E, digitBase: null,    exceptions: new Map([
    ['h', 0x210E],
  ]), coverage: 'full' },
  { id: 'bold-italic',            label: 'Bold Italic',            upperBase: 0x1D468, lowerBase: 0x1D482, digitBase: null,    exceptions: new Map(), coverage: 'full' },
  { id: 'script',                 label: 'Script',                 upperBase: 0x1D49C, lowerBase: 0x1D4B6, digitBase: null,    exceptions: new Map([
    ['B', 0x212C],
    ['E', 0x2130],
    ['F', 0x2131],
    ['H', 0x210B],
    ['I', 0x2110],
    ['L', 0x2112],
    ['M', 0x2133],
    ['R', 0x211B],
    ['e', 0x212F],
    ['g', 0x210A],
    ['o', 0x2134],
  ]), coverage: 'full' },
  { id: 'bold-script',            label: 'Bold Script',            upperBase: 0x1D4D0, lowerBase: 0x1D4EA, digitBase: null,    exceptions: new Map(), coverage: 'full' },
  { id: 'fraktur',                label: 'Fraktur',                upperBase: 0x1D504, lowerBase: 0x1D51E, digitBase: null,    exceptions: new Map([
    ['C', 0x212D],
    ['H', 0x210C],
    ['I', 0x2111],
    ['R', 0x211C],
    ['Z', 0x2128],
  ]), coverage: 'full' },
  { id: 'double-struck',          label: 'Double-struck',          upperBase: 0x1D538, lowerBase: 0x1D552, digitBase: 0x1D7D8, exceptions: new Map([
    ['C', 0x2102],
    ['H', 0x210D],
    ['N', 0x2115],
    ['P', 0x2119],
    ['Q', 0x211A],
    ['R', 0x211D],
    ['Z', 0x2124],
  ]), coverage: 'full' },
  { id: 'bold-fraktur',           label: 'Bold Fraktur',           upperBase: 0x1D56C, lowerBase: 0x1D586, digitBase: null,    exceptions: new Map(), coverage: 'full' },
  { id: 'sans-serif',             label: 'Sans-serif',             upperBase: 0x1D5A0, lowerBase: 0x1D5BA, digitBase: 0x1D7E2, exceptions: new Map(), coverage: 'full' },
  { id: 'sans-serif-bold',        label: 'Sans-serif Bold',        upperBase: 0x1D5D4, lowerBase: 0x1D5EE, digitBase: 0x1D7EC, exceptions: new Map(), coverage: 'full' },
  { id: 'sans-serif-italic',      label: 'Sans-serif Italic',      upperBase: 0x1D608, lowerBase: 0x1D622, digitBase: null,    exceptions: new Map(), coverage: 'full' },
  { id: 'sans-serif-bold-italic', label: 'Sans-serif Bold Italic', upperBase: 0x1D63C, lowerBase: 0x1D656, digitBase: null,    exceptions: new Map(), coverage: 'full' },
  { id: 'monospace',              label: 'Monospace',              upperBase: 0x1D670, lowerBase: 0x1D68A, digitBase: 0x1D7F6, exceptions: new Map(), coverage: 'full' },
];

/** Lookup a math-alphanumeric style by id. */
export const MATH_STYLE_BY_ID: ReadonlyMap<string, Style> = new Map(
  MATH_STYLES.map(s => [s.id, s])
);
