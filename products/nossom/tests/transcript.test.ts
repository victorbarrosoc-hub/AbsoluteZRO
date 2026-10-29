import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCues, parseTranscript, toSrt, toText, toVtt, type Word } from '../lib/transcript';

const words: Word[] = [
  [0.5, 0.9, 'Sua'],
  [0.9, 1.6, 'sensibilidade'],
  [1.6, 2.2, 'mostrará'],
  [2.2, 2.4, 'o'],
  [2.4, 3.0, 'caminho.'],
  [4.5, 4.7, 'É'],
  [4.7, 4.9, 'bom'],
  [4.9, 5.0, 'te'],
  [5.0, 5.3, 'ver'],
  [5.3, 5.8, 'colhendo'],
  [5.8, 6.2, 'flores'],
  [6.2, 6.8, 'menino'],
];

test('transcript contract accepts ordered words and refuses anything else', () => {
  const ok = { version: 1, language: 'pt', duration: 7, words };
  assert.deepEqual(parseTranscript(ok, 7)?.words, words);
  for (const bad of [
    null,
    { ...ok, version: 2 },
    { ...ok, language: 'pt<script>' },
    { ...ok, duration: 20 },
    { ...ok, words: [[1, 0.5, 'volta']] },
    {
      ...ok,
      words: [
        [1, 2, 'a'],
        [0.5, 3, 'b'],
      ],
    },
    { ...ok, words: [[0, 9, 'depois do fim']] },
    { ...ok, words: [[0, 1, '   ']] },
    { ...ok, words: [[0, Number.NaN, 'x']] },
    { ...ok, words: [[0, 1, 'x', 'extra']] },
  ])
    assert.equal(parseTranscript(bad, 7), null);
  assert.ok(parseTranscript({ ...ok, language: null }, 7.4));
});

test('cues break on sentence ends and pauses, never overlap, and respect line length', () => {
  const cues = buildCues(words);
  assert.deepEqual(
    cues.map((c) => c.text),
    ['Sua sensibilidade mostrará o caminho.', 'É bom te ver colhendo flores menino'],
  );
  assert.equal(cues[0].start, 0.5);
  assert.equal(cues[0].end, 3.0);
  const narrow = buildCues(words, { maxChars: 16, maxLines: 2 });
  for (const cue of narrow) {
    const lines = cue.text.split('\n');
    assert.ok(lines.length <= 2);
    assert.ok(lines.every((l) => l.length <= 16 || !l.includes(' ')));
  }
  for (let i = 0; i < narrow.length - 1; i++) assert.ok(narrow[i].end <= narrow[i + 1].start);
  const long = Array.from({ length: 40 }, (_, i): Word => [i * 0.3, i * 0.3 + 0.25, 'palavra']);
  assert.ok(buildCues(long).every((c) => c.end - c.start <= 6.3));
});

test('SRT, VTT and text use the standard formats', () => {
  const cues = buildCues(words);
  assert.equal(
    toSrt(cues),
    '1\n00:00:00,500 --> 00:00:03,000\nSua sensibilidade mostrará o caminho.\n\n' +
      '2\n00:00:04,500 --> 00:00:06,800\nÉ bom te ver colhendo flores menino\n',
  );
  assert.ok(toVtt(cues).startsWith('WEBVTT\n\n00:00:00.500 --> 00:00:03.000\n'));
  assert.equal(
    toText(words, 1),
    'Sua sensibilidade mostrará o caminho.\n\nÉ bom te ver colhendo flores menino\n',
  );
  assert.equal(
    toSrt(buildCues([[3725.0004, 3726.5, 'hora']])).split('\n')[1],
    '01:02:05,000 --> 01:02:06,500',
  );
  assert.equal(toText([]), '');
});
