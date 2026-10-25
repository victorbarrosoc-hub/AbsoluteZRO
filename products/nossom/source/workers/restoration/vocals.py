"""Music source separation using the fixed, hash-checked official HTDemucs model."""
from functools import lru_cache
import hashlib
import os
from pathlib import Path

MODEL_URL = 'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th'
MODEL_HASH = '8726e21a'
MODEL_PATH = Path(os.environ.get('NOSSOM_VOCALS_MODEL', '/opt/nossom-models/htdemucs.th'))


def verify_model(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if not digest.hexdigest().startswith(MODEL_HASH):
        raise RuntimeError('Invalid HTDemucs checkpoint')


def download_model():
    import torch
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not MODEL_PATH.exists():
        torch.hub.download_url_to_file(MODEL_URL, str(MODEL_PATH), hash_prefix=MODEL_HASH)
    verify_model(MODEL_PATH)


@lru_cache(maxsize=1)
def load_vocals_model():
    import torch
    from demucs.states import load_model
    verify_model(MODEL_PATH)
    # Only this bundled, official checkpoint is deserialized as a full package.
    # Never load user-supplied model names, pickle files, or model URLs.
    package = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)
    model = load_model(package).eval()
    if model.samplerate != 44100 or model.audio_channels != 2 or 'vocals' not in model.sources:
        raise RuntimeError('Unsupported vocals model')
    return model


def separate_vocals(audio, device='cuda'):
    import numpy as np
    import torch
    from demucs.apply import apply_model
    model = load_vocals_model()
    mix = torch.from_numpy(np.ascontiguousarray(audio.T))
    reference = mix.mean(0)
    mean, std = reference.mean(), reference.std()
    if std < 1e-8:
        return np.zeros_like(audio)
    with torch.inference_mode():
        stems = apply_model(model, ((mix - mean) / std)[None], device=device,
                            shifts=1, split=True, overlap=0.25, segment=7.8,
                            num_workers=0, progress=False)[0]
        vocals = stems[model.sources.index('vocals')] * std + mean
    result = vocals.detach().cpu().numpy().T.astype(np.float32)
    if result.shape != audio.shape or not np.isfinite(result).all():
        raise RuntimeError('Invalid separated audio')
    return result


if __name__ == '__main__':
    download_model()
    load_vocals_model()
    print('HTDemucs checkpoint downloaded, verified and loaded on CPU.')
