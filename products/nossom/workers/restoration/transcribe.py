"""NOSSOM transcription: Whisper large-v3-turbo (MIT) with word timestamps.

Weights are pinned by Hugging Face revision and SHA-256, downloaded at image build and read
from the local folder only. The worker returns words with times; lines and subtitle files are
built in the browser, where they can be edited.
"""
from functools import lru_cache
import hashlib
import os
from pathlib import Path

MODELS = Path(os.environ.get('NOSSOM_MODELS', '/opt/nossom-models'))
WHISPER = {
    'repo': 'openai/whisper-large-v3-turbo',
    'revision': '41f01f3fe87f28c78e2fbf8b568835947dd65ed9',
    'files': ['added_tokens.json', 'config.json', 'generation_config.json', 'merges.txt',
              'model.safetensors', 'normalizer.json', 'preprocessor_config.json',
              'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.json'],
    'sha256': '542566a422ae4f3fd23f1ba11add198fca01bbf82e66e6a2857b3f608b1eb9d1',
}
RATE = 16000
# Whisper invents text over silence and music; known closing credits are never real speech here.
PHANTOMS = ('amara.org', 'legendas pela comunidade', 'legendado por', 'inscreva-se no canal')


def model_dir():
    return MODELS / WHISPER['repo'].replace('/', '__')


def verify():
    path = model_dir() / 'model.safetensors'
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != WHISPER['sha256']:
        raise RuntimeError('Invalid Whisper checkpoint')
    return model_dir()


def download_model():
    from huggingface_hub import hf_hub_download
    folder = model_dir()
    folder.mkdir(parents=True, exist_ok=True)
    for name in WHISPER['files']:
        if not (folder / name).exists():
            hf_hub_download(WHISPER['repo'], name, revision=WHISPER['revision'], local_dir=folder)
    verify()


@lru_cache(maxsize=2)
def recognizer(device):
    import torch
    from transformers import WhisperForConditionalGeneration, WhisperProcessor, pipeline
    folder = verify()
    dtype = torch.float16 if device == 'cuda' else torch.float32
    processor = WhisperProcessor.from_pretrained(folder, local_files_only=True)
    model = WhisperForConditionalGeneration.from_pretrained(
        folder, local_files_only=True, use_safetensors=True, torch_dtype=dtype).to(device).eval()
    # No pipeline chunking: with word timestamps it keeps every window's attention in memory
    # and runs out of it past 30 s. `windows` cuts the audio at pauses instead.
    return pipeline('automatic-speech-recognition', model=model, tokenizer=processor.tokenizer,
                    feature_extractor=processor.feature_extractor, device=device, dtype=dtype)


WINDOW = 28 * RATE
SEARCH = 8 * RATE


def windows(audio):
    """(start, end) sample ranges under 30 s, each cut at the quietest 20 ms of its last 8 s."""
    import numpy as np
    bounds, start = [], 0
    while len(audio) - start > WINDOW:
        region = audio[start + WINDOW - SEARCH:start + WINDOW]
        frames = region[: len(region) // 320 * 320].reshape(-1, 320)
        cut = start + WINDOW - SEARCH + int(np.argmin((frames ** 2).mean(axis=1))) * 320 + 160
        bounds.append((start, cut))
        start = cut
    bounds.append((start, len(audio)))
    return bounds


def speech_floor(audio):
    """35 dB under the loud frames, and never under −60 dBFS: quieter words are invented."""
    import numpy as np
    frames = audio[: len(audio) // 320 * 320].reshape(-1, 320)
    if not len(frames):
        return 1e-3
    levels = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
    return max(float(np.percentile(levels, 95)) * 10 ** (-35 / 20), 1e-3)


def clean_words(chunks, audio):
    """Words with ordered, bounded times; drops credits Whisper makes up over silence."""
    import numpy as np
    duration = len(audio) / RATE
    floor = speech_floor(audio)
    words, last = [], 0.0
    for chunk in chunks:
        raw = chunk.get('text') or ''
        # A cut-off start comes back as "...word"; keep the word, not the ellipsis.
        text = raw.strip().lstrip('.…').strip()
        start, end = chunk.get('timestamp') or (None, None)
        if not any(ch.isalnum() for ch in text):
            continue
        # Without a leading space the token continues the previous word ("quinta" + "-feira").
        if words and raw[:1] not in (' ', '') and not raw.startswith(('.', '…')):
            words[-1][2] += text
            if end is not None:
                words[-1][1] = round(min(max(float(end), words[-1][0]), duration), 3)
            continue
        start = last if start is None else min(max(float(start), last), duration)
        end = duration if end is None else min(max(float(end), start), duration)
        span = audio[int(start * RATE):max(int(end * RATE), int(start * RATE) + 1)]
        if float(np.sqrt(np.mean(span ** 2) + 1e-12)) < floor:
            continue
        words.append([round(start, 3), round(end, 3), text])
        last = start
    joined = ' '.join(w[2] for w in words).lower()
    if any(p in joined for p in PHANTOMS):
        words = [w for w in words if not any(p.split()[0] in w[2].lower() for p in PHANTOMS)]
    return words


def transcribe(audio, device='cuda'):
    """audio: (frames,) float32 mono at 16 kHz -> {'language', 'words': [[start, end, text]]}."""
    import numpy as np
    if audio.ndim != 1:
        raise ValueError('Mono input required')
    audio = np.ascontiguousarray(audio, dtype=np.float32)
    language = detect_language(audio, device)
    pipe = recognizer(device)
    chunks = []
    for start, end in windows(audio):
        if end - start < RATE // 10:
            continue
        result = pipe({'raw': audio[start:end], 'sampling_rate': RATE}, return_timestamps='word',
                      generate_kwargs={'task': 'transcribe',
                                       **({'language': language} if language else {})})
        offset = start / RATE
        for chunk in result.get('chunks') or []:
            begin, finish = chunk.get('timestamp') or (None, None)
            chunks.append({'text': chunk.get('text'), 'timestamp': (
                None if begin is None else begin + offset,
                None if finish is None else finish + offset)})
    words = clean_words(chunks, audio)
    return {'language': language if words else None, 'words': words}


def detect_language(audio, device):
    """Language of the loudest 30 s, decided once so every window is written in it."""
    import numpy as np
    import torch
    pipe = recognizer(device)
    window = 30 * RATE
    if len(audio) > window:
        seconds = (audio[: len(audio) // RATE * RATE].reshape(-1, RATE) ** 2).sum(axis=1)
        start = int(np.argmax(np.convolve(seconds, np.ones(30), 'valid'))) * RATE
        audio = audio[start:start + window]
    features = pipe.feature_extractor(audio, sampling_rate=RATE, return_tensors='pt').input_features
    with torch.inference_mode():
        token = pipe.model.detect_language(features.to(device, pipe.model.dtype))[0]
    code = pipe.tokenizer.decode(token).strip('<|>')
    return code if code.isalpha() and 2 <= len(code) <= 3 else None


if __name__ == '__main__':
    download_model()
    recognizer('cpu')
    print('Whisper large-v3-turbo checkpoint verified and loaded on CPU.')
