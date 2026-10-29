"""NOSSOM remixer: five stems that add back up to the original.

Voice comes from Mel-Band RoFormer (the best vocal model in our benchmark). The rest of
the song goes to the official HTDemucs 6-source checkpoint for drums, bass and guitar;
"outros" is what remains (piano, synths, effects), so the five stems sum exactly to the
input: with every fader at 0 dB the remix is the original.
"""
from functools import lru_cache
import hashlib
import os
from pathlib import Path

MODEL_URL = 'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/5c90dfd2-34c22ccb.th'
MODEL_HASH = '34c22ccb'
MODEL_PATH = Path(os.environ.get('NOSSOM_STEMS_MODEL', '/opt/nossom-models/htdemucs_6s.th'))
STEMS = ('voz', 'bateria', 'baixo', 'guitarra', 'outros')


def verify_model(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if not digest.hexdigest().startswith(MODEL_HASH):
        raise RuntimeError('Invalid HTDemucs 6s checkpoint')


def download_model():
    import torch
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not MODEL_PATH.exists():
        torch.hub.download_url_to_file(MODEL_URL, str(MODEL_PATH), hash_prefix=MODEL_HASH)
    verify_model(MODEL_PATH)


@lru_cache(maxsize=1)
def load_model():
    import torch
    from demucs.states import load_model as from_package
    verify_model(MODEL_PATH)
    # Only this bundled, official checkpoint is deserialized as a full package.
    package = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)
    model = from_package(package).eval()
    if (model.samplerate != 44100 or model.audio_channels != 2
            or not {'drums', 'bass', 'guitar'} <= set(model.sources)):
        raise RuntimeError('Unsupported stems model')
    return model


def split_instruments(audio, device='cuda'):
    """audio: (frames, 2) at 44.1 kHz -> dict of drums, bass, guitar, same shape."""
    import numpy as np
    import torch
    from demucs.apply import apply_model
    model = load_model()
    mix = torch.from_numpy(np.ascontiguousarray(audio.T))
    reference = mix.mean(0)
    mean, std = reference.mean(), reference.std()
    if std < 1e-8:
        return {name: np.zeros_like(audio) for name in ('drums', 'bass', 'guitar')}
    with torch.inference_mode():
        stems = apply_model(model, ((mix - mean) / std)[None], device=device, shifts=1,
                            split=True, overlap=0.25, segment=7.8, num_workers=0, progress=False)[0]
    # The normalisation offset belongs to the mix once, not to every stem.
    return {name: (stems[model.sources.index(name)] * std).cpu().numpy().T.astype(np.float32)
            for name in ('drums', 'bass', 'guitar')}


def separate_stems(audio, device='cuda'):
    """audio: (frames, 2) float32 at 44.1 kHz -> list of five (frames, 2) stems in STEMS order."""
    import numpy as np
    from isolator import separate_vocals
    if audio.ndim != 2 or audio.shape[1] != 2:
        raise ValueError('Stereo input required')
    voice = separate_vocals(audio, device)
    instrumental = audio - voice
    parts = split_instruments(instrumental, device)
    rest = instrumental - parts['drums'] - parts['bass'] - parts['guitar']
    stems = [voice, parts['drums'], parts['bass'], parts['guitar'], rest]
    for stem in stems:
        if stem.shape != audio.shape or not np.isfinite(stem).all():
            raise RuntimeError('Invalid stem')
    return stems


def encode_flac(stem, gain):
    """Lossless 24-bit stereo FLAC of one stem, scaled by the shared gain."""
    import subprocess
    import numpy as np
    pcm = np.ascontiguousarray(stem * gain, dtype='<f4').tobytes()
    process = subprocess.run([
        'ffmpeg', '-nostdin', '-v', 'error', '-f', 'f32le', '-ar', '44100', '-ac', '2',
        '-i', 'pipe:0', '-c:a', 'flac', '-sample_fmt', 's32', '-bits_per_raw_sample', '24',
        '-f', 'flac', 'pipe:1',
    ], input=pcm, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300, check=False)
    if process.returncode or not process.stdout.startswith(b'fLaC'):
        raise RuntimeError('Stem encoding failed')
    return process.stdout


def stems_package(stems):
    """One gain for all stems (so they still sum to the mix) and the FLAC bytes of each."""
    import math
    import numpy as np
    peak = max(float(np.max(np.abs(s))) for s in stems)
    gain = min(1.0, 10 ** (-1 / 20) / max(peak, 1e-12))
    files = [encode_flac(stem, gain) for stem in stems]
    return files, 20 * math.log10(gain)


if __name__ == '__main__':
    download_model()
    load_model()
    print('HTDemucs 6-source checkpoint downloaded, verified and loaded on CPU.')
