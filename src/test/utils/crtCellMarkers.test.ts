/**
 * @file crtCellMarkers.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the edge space markers: which cells are marked, how a cell is split into marker text and
 * the middle, whitespace of every kind, characters outside the basic plane, the cap on a long run,
 * and that an ordinary cell costs nothing.
 */
import { describe, it, expect } from 'vitest';
import { CRT_MAX_MARKS, CRT_SPACE_MARK, markEdgeSpaces } from '../../utils/crt/crtCellMarkers';

const DOT = CRT_SPACE_MARK;

describe('markEdgeSpaces: cells that are not marked', () => {
  it('returns null for an empty cell', () => {
    expect(markEdgeSpaces('')).toBeNull();
  });

  it('returns null for text with no edge space', () => {
    expect(markEdgeSpaces('abc')).toBeNull();
    expect(markEdgeSpaces('a')).toBeNull();
  });

  it('returns null when the spaces are only inside the text', () => {
    expect(markEdgeSpaces('a b')).toBeNull();
    expect(markEdgeSpaces('a   b  c')).toBeNull();
    expect(markEdgeSpaces('a\tb')).toBeNull();
  });

  it('returns null for an emoji with no edge space', () => {
    expect(markEdgeSpaces('\u{1F600}')).toBeNull();
    expect(markEdgeSpaces('x \u{1F600} y')).toBeNull();
  });
});

describe('markEdgeSpaces: one edge', () => {
  it('marks a leading space', () => {
    expect(markEdgeSpaces(' abc')).toEqual({
      lead: DOT,
      middle: 'abc',
      trail: '',
      note: 'Leading space',
    });
  });

  it('marks a trailing space', () => {
    expect(markEdgeSpaces('abc ')).toEqual({
      lead: '',
      middle: 'abc',
      trail: DOT,
      note: 'Trailing space',
    });
  });

  it('gives one marker for each whitespace character of a run', () => {
    const marked = markEdgeSpaces('   abc ');
    expect(marked?.lead).toBe(DOT.repeat(3));
    expect(marked?.trail).toBe(DOT);
  });

  it('works for a one character text next to a space', () => {
    expect(markEdgeSpaces(' a')).toMatchObject({ lead: DOT, middle: 'a', trail: '' });
    expect(markEdgeSpaces('a ')).toMatchObject({ lead: '', middle: 'a', trail: DOT });
  });
});

describe('markEdgeSpaces: both edges', () => {
  it('marks both and says so', () => {
    expect(markEdgeSpaces('  a  ')).toEqual({
      lead: DOT.repeat(2),
      middle: 'a',
      trail: DOT.repeat(2),
      note: 'Leading and trailing space',
    });
  });

  it('leaves the middle exactly as stored, inner whitespace included', () => {
    const marked = markEdgeSpaces(' a  b\tc ');
    expect(marked?.middle).toBe('a  b\tc');
    expect(marked?.note).toBe('Leading and trailing space');
  });
});

describe('markEdgeSpaces: only whitespace', () => {
  it('is all markers and no middle', () => {
    expect(markEdgeSpaces('   ')).toEqual({
      lead: DOT.repeat(3),
      middle: '',
      trail: '',
      note: 'Only whitespace',
    });
  });

  it('handles a single space', () => {
    expect(markEdgeSpaces(' ')).toEqual({ lead: DOT, middle: '', trail: '', note: 'Only whitespace' });
  });

  it('handles mixed whitespace characters', () => {
    expect(markEdgeSpaces(' \t \n')).toMatchObject({ lead: DOT.repeat(4), middle: '', trail: '' });
  });
});

describe('markEdgeSpaces: kinds of whitespace', () => {
  it('marks a tab with the same dot as a space', () => {
    expect(markEdgeSpaces('\tabc')).toMatchObject({ lead: DOT, middle: 'abc' });
    expect(markEdgeSpaces('abc\t')).toMatchObject({ trail: DOT, middle: 'abc' });
  });

  it('marks a no-break space with the same dot', () => {
    expect(markEdgeSpaces(' abc ')).toMatchObject({ lead: DOT, middle: 'abc', trail: DOT });
  });

  it('marks other Unicode spaces and line breaks', () => {
    expect(markEdgeSpaces(' abc')).toMatchObject({ lead: DOT, middle: 'abc' });
    expect(markEdgeSpaces('abc\n')).toMatchObject({ trail: DOT, middle: 'abc' });
    expect(markEdgeSpaces('　abc')).toMatchObject({ lead: DOT, middle: 'abc' });
  });

  it('does not treat a zero width space as whitespace, like the key check', () => {
    // U+200B is not in the JavaScript whitespace class, so it is not an edge space.
    expect(markEdgeSpaces('​abc')).toBeNull();
  });
});

describe('markEdgeSpaces: characters outside the basic plane', () => {
  it('keeps an emoji whole next to a trailing space', () => {
    expect(markEdgeSpaces('\u{1F600} ')).toEqual({
      lead: '',
      middle: '\u{1F600}',
      trail: DOT,
      note: 'Trailing space',
    });
  });

  it('keeps an emoji whole between two edge runs', () => {
    expect(markEdgeSpaces('  \u{1F600}\u{1F680} ')).toMatchObject({
      lead: DOT.repeat(2),
      middle: '\u{1F600}\u{1F680}',
      trail: DOT,
    });
  });

  it('keeps accented and non Latin text whole', () => {
    expect(markEdgeSpaces(' café ')).toMatchObject({ middle: 'café' });
    expect(markEdgeSpaces(' 日本語 ')).toMatchObject({ middle: '日本語' });
  });
});

describe('markEdgeSpaces: a very long run', () => {
  it('draws at most CRT_MAX_MARKS markers for one run and keeps the middle', () => {
    const marked = markEdgeSpaces(`${' '.repeat(5000)}abc${' '.repeat(5000)}`);
    expect(marked?.lead).toBe(DOT.repeat(CRT_MAX_MARKS));
    expect(marked?.trail).toBe(DOT.repeat(CRT_MAX_MARKS));
    expect(marked?.middle).toBe('abc');
  });

  it('caps a text that is only whitespace too', () => {
    const marked = markEdgeSpaces(' '.repeat(5000));
    expect(marked?.lead).toBe(DOT.repeat(CRT_MAX_MARKS));
    expect(marked?.middle).toBe('');
  });

  it('draws every marker of a run that is exactly at the cap', () => {
    expect(markEdgeSpaces(`${' '.repeat(CRT_MAX_MARKS)}a`)?.lead).toBe(DOT.repeat(CRT_MAX_MARKS));
  });
});

describe('markEdgeSpaces: cost', () => {
  it('answers 200,000 ordinary cells quickly, without a marked result', () => {
    const cells = Array.from({ length: 200 }, (_, i) => `value ${i} with inner spaces`);
    const start = performance.now();
    let marked = 0;
    for (let round = 0; round < 1000; round++) {
      for (const text of cells) if (markEdgeSpaces(text) !== null) marked++;
    }
    expect(marked).toBe(0);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
