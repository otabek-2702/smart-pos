// src/components/virtual-keyboard/layouts.ts
//
// Keyboard layout definitions. A layout is an array of rows; each row is an
// array of keys. A key is either a character (normal letter that responds
// to shift state) or a special action (shift, backspace, space, etc.).
//
// Symbols page is shared across all letter layouts.

export type LayoutId = 'en' | 'uz-latin' | 'uz-cyrillic' | 'ru';

export interface CharKey {
  type: 'char';
  /** Lowercase form. The component uppercases it when shift is active. */
  label: string;
  /** Optional override for the uppercase form (e.g. "ʻ" stays "ʻ"). */
  upper?: string;
  /** Optional flex weight (default 1). */
  flex?: number;
}

export type SpecialAction =
  | 'shift'
  | 'backspace'
  | 'space'
  | 'symbols'   // switch to symbols page
  | 'letters'   // switch back to letters
  | 'lang'      // open language picker
  | 'enter'
  | 'at'
  | 'period'
  | 'comma'
  | 'hide';     // close the keyboard (optional UX)

export interface SpecialKey {
  type: 'special';
  action: SpecialAction;
  /** Optional explicit label override (otherwise component picks an icon). */
  label?: string;
  flex?: number;
}

export type Key = CharKey | SpecialKey;
export type Row = Key[];
export type Layout = Row[];

const SHIFT: SpecialKey = { type: 'special', action: 'shift', flex: 1.6 };
const BACKSPACE: SpecialKey = { type: 'special', action: 'backspace', flex: 1.6 };
const SPACE: SpecialKey = { type: 'special', action: 'space', flex: 4 };
const SYMBOLS: SpecialKey = { type: 'special', action: 'symbols', label: '123', flex: 1.4 };
const LETTERS: SpecialKey = { type: 'special', action: 'letters', label: 'ABC', flex: 1.4 };
const LANG: SpecialKey = { type: 'special', action: 'lang', flex: 1 };
const ENTER: SpecialKey = { type: 'special', action: 'enter', flex: 1.6 };
const AT: SpecialKey = { type: 'special', action: 'at', flex: 1 };
const PERIOD: SpecialKey = { type: 'special', action: 'period', flex: 1 };

/** Letter keys helper */
function chars(s: string, upper?: string): CharKey[] {
  return s.split('').map((c, i) => {
    const u = upper?.[i];
    return u !== undefined ? { type: 'char', label: c, upper: u } : { type: 'char', label: c };
  });
}

/** Bottom utility row used by every letter layout (not by symbols). */
function bottomRow(): Row {
  return [SYMBOLS, LANG, AT, SPACE, PERIOD, ENTER];
}

/* ------------------------------ EN / QWERTY ------------------------------ */
const EN_LAYOUT: Layout = [
  chars('qwertyuiop'),
  chars('asdfghjkl'),
  [SHIFT, ...chars('zxcvbnm'), BACKSPACE],
  bottomRow(),
];

/* ------------------------------ UZ Latin ------------------------------ */
// Same physical positions as QWERTY; ʻ replaces what would be the ' key,
// but since QWERTY's bottom row has no ' visible we add it as a 4th letter
// row tail. Keeping it minimal: just pick up the apostrophe variant the
// language uses ("ʻ" U+02BB).
const UZ_LATIN_LAYOUT: Layout = [
  chars('qwertyuiop'),
  chars('asdfghjklʻ'),
  [SHIFT, ...chars('zxcvbnm'), BACKSPACE],
  bottomRow(),
];

/* ------------------------------ UZ Cyrillic ------------------------------ */
// Standard Uzbek Cyrillic layout. 33 main letters + Ў/Қ/Ғ/Ҳ specifics.
const UZ_CYR_LAYOUT: Layout = [
  chars('йцукенгшўзх'),
  chars('фқвапролджэ'),
  [SHIFT, ...chars('ячсмитьбю'), BACKSPACE],
  bottomRow(),
];

/* ------------------------------ RU ------------------------------ */
const RU_LAYOUT: Layout = [
  chars('йцукенгшщзх'),
  chars('фывапролджэ'),
  [SHIFT, ...chars('ячсмитьбю'), BACKSPACE],
  bottomRow(),
];

/* ------------------------------ Symbols (shared) ------------------------------ */
export const SYMBOLS_LAYOUT: Layout = [
  chars('1234567890'),
  chars("-/:;()$&@\""),
  [
    { type: 'special', action: 'symbols', label: '#+=', flex: 1.4 },
    ...chars('.,?!\'’"_'),
    BACKSPACE,
  ],
  [LETTERS, LANG, AT, SPACE, PERIOD, ENTER],
];

export const LAYOUTS: Record<LayoutId, Layout> = {
  en: EN_LAYOUT,
  'uz-latin': UZ_LATIN_LAYOUT,
  'uz-cyrillic': UZ_CYR_LAYOUT,
  ru: RU_LAYOUT,
};

export const LAYOUT_LABELS: Record<LayoutId, { short: string; full: string }> = {
  en: { short: 'EN', full: 'English' },
  'uz-latin': { short: 'UZ', full: "O'zbek (Lotin)" },
  'uz-cyrillic': { short: 'УЗ', full: 'Ўзбек (Кирил)' },
  ru: { short: 'RU', full: 'Русский' },
};

/** Order used when cycling via the globe button. */
export const LAYOUT_ORDER: LayoutId[] = ['en', 'uz-latin', 'uz-cyrillic', 'ru'];

/** Optional digit row, used when the consumer passes `numbers`. */
export const NUMBER_ROW: Row = chars('1234567890');
