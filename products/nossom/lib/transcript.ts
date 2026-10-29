/** Words with times from the GPU, and the subtitle files built from them in the browser. */
export type Word = [start: number, end: number, text: string];
export type Transcript = {
  version: 1;
  language: string | null;
  duration: number;
  words: Word[];
};
export type Cue = { start: number; end: number; text: string };

const MAX_WORDS = 20000;

/** Accept only a well-formed transcript for this audio: ordered, bounded, finite times. */
export function parseTranscript(value: unknown, duration: number): Transcript | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Transcript;
  if (
    t.version !== 1 ||
    !(t.language === null || (typeof t.language === 'string' && /^[a-z]{2,3}$/.test(t.language))) ||
    !Number.isFinite(t.duration) ||
    Math.abs(t.duration - duration) > 1 ||
    !Array.isArray(t.words) ||
    t.words.length > MAX_WORDS
  )
    return null;
  let last = 0;
  for (const w of t.words) {
    if (
      !Array.isArray(w) ||
      w.length !== 3 ||
      !Number.isFinite(w[0]) ||
      !Number.isFinite(w[1]) ||
      typeof w[2] !== 'string' ||
      !w[2].trim() ||
      w[2].length > 200 ||
      w[0] < last ||
      w[1] < w[0] ||
      w[1] > t.duration + 0.05
    )
      return null;
    last = w[0];
  }
  return { version: 1, language: t.language, duration: t.duration, words: t.words };
}

export type CueOptions = {
  /** Characters per line; 42 is the common broadcast limit. */
  maxChars?: number;
  maxLines?: number;
  /** Longest a cue stays on screen, in seconds. */
  maxSeconds?: number;
  /** A pause this long starts a new cue. */
  pause?: number;
};

function wrap(words: string[], maxChars: number) {
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (current !== undefined && (current + ' ' + word).length <= maxChars)
      lines[lines.length - 1] = current + ' ' + word;
    else lines.push(word);
  }
  return lines;
}

/** Group words into readable cues: break on pauses, sentence ends and line limits. */
export function buildCues(words: Word[], options: CueOptions = {}): Cue[] {
  const maxChars = options.maxChars ?? 42,
    maxLines = options.maxLines ?? 2,
    maxSeconds = options.maxSeconds ?? 6,
    pause = options.pause ?? 0.7;
  const cues: Cue[] = [];
  let group: Word[] = [];
  const flush = () => {
    if (!group.length) return;
    cues.push({
      start: group[0][0],
      end: Math.max(group[group.length - 1][1], group[0][0] + 0.2),
      text: wrap(
        group.map((w) => w[2].trim()),
        maxChars,
      ).join('\n'),
    });
    group = [];
  };
  for (const word of words) {
    const previous = group[group.length - 1];
    const candidate = [...group, word];
    if (
      previous &&
      (word[0] - previous[1] >= pause ||
        word[1] - group[0][0] > maxSeconds ||
        wrap(
          candidate.map((w) => w[2].trim()),
          maxChars,
        ).length > maxLines)
    )
      flush();
    group.push(word);
    if (/[.!?…]["”')\]]*$/.test(word[2].trim())) flush();
  }
  flush();
  // Never overlap the next cue: players show both at once.
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.min(cues[i].end, cues[i + 1].start);
  return cues;
}

function stamp(seconds: number, separator: ',' | '.') {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]) {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
    .join('\n');
}

export function toVtt(cues: Cue[]) {
  return (
    'WEBVTT\n\n' +
    cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')
  );
}

/** Plain text, one paragraph per long pause. */
export function toText(words: Word[], paragraphPause = 2) {
  let text = '';
  words.forEach((w, i) => {
    if (i) text += words[i - 1][1] <= w[0] - paragraphPause ? '\n\n' : ' ';
    text += w[2].trim();
  });
  return text ? text + '\n' : '';
}
