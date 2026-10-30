"""NOSSOM voice isolation: Mel-Band RoFormer (vocals) followed by MossFormer2 SE 48 kHz.

Two presets share one separation model:
- `voice-isolator-v1` (Fala): RoFormer removes music and most background, MossFormer2
  removes what is left (babble, traffic, hum). Mono WAV float32 at 48 kHz.
- `roformer-vocals-v1` (Canto): RoFormer vocal stem only, stereo WAV float32 at 44.1 kHz.

Weights are pinned by Hugging Face revision and SHA-256, downloaded at image build and
loaded as plain state dicts (`weights_only=True`), never from a client-supplied name or URL.
"""
from functools import lru_cache
import hashlib
import os
from pathlib import Path

MODELS = Path(os.environ.get('NOSSOM_MODELS', '/opt/nossom-models'))
ROFORMER = {
    'repo': 'KimberleyJSN/melbandroformer',
    'revision': 'ac9b0614ab3cd7f77219e18ba494dfd93956c348',
    'file': 'MelBandRoformer.ckpt',
    'sha256': '87201f4d31afb5bc79993230fc49446918425574db48c01c405e44f365c7559e',
}
MOSSFORMER = {
    'repo': 'alibabasglab/MossFormer2_SE_48K',
    'revision': 'eff8c97925c8bec812af707814b3e5d777fd4503',
    'file': 'last_best_checkpoint.pt',
    'sha256': '03692b9f773bbd6bb43b9c5a41f96b1e28affd66e13796b7bec66ad3d8b227c6',
}
# Kim Mel-Band RoFormer vocals: 8 s windows at 44.1 kHz, half overlap, linear crossfades.
CHUNK = 352800
STEP = CHUNK // 2
FADE = CHUNK // 10


def weight_path(spec):
    return MODELS / spec['repo'].replace('/', '__') / spec['file']


def verify(spec):
    path = weight_path(spec)
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != spec['sha256']:
        raise RuntimeError('Invalid model checkpoint: ' + spec['repo'])
    return path


def download_models():
    from huggingface_hub import hf_hub_download
    for spec in (ROFORMER, MOSSFORMER):
        path = weight_path(spec)
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            hf_hub_download(spec['repo'], spec['file'], revision=spec['revision'], local_dir=path.parent)
        verify(spec)


@lru_cache(maxsize=2)
def roformer(device):
    import torch
    from bs_roformer import MelBandRoformer
    model = MelBandRoformer(
        dim=384, depth=6, stereo=True, num_stems=1, time_transformer_depth=1, freq_transformer_depth=1,
        num_bands=60, dim_head=64, heads=8, attn_dropout=0, ff_dropout=0, flash_attn=True,
        dim_freqs_in=1025, sample_rate=44100, stft_n_fft=2048, stft_hop_length=441, stft_win_length=2048,
        stft_normalized=False, mask_estimator_depth=2)
    state = torch.load(verify(ROFORMER), map_location='cpu', weights_only=True)
    model.load_state_dict(state, strict=True)
    return model.to(device).eval()


@lru_cache(maxsize=2)
def mossformer(device):
    import torch
    from clearvoice.models.mossformer2_se.mossformer2_se_wrapper import MossFormer2_SE_48K
    model = MossFormer2_SE_48K(None).model
    state = torch.load(verify(MOSSFORMER), map_location='cpu', weights_only=True)
    model.load_state_dict(state, strict=True)
    return model.to(device).eval()


def crossfade_window():
    import numpy as np
    window = np.ones(CHUNK, dtype=np.float32)
    window[:FADE] = np.linspace(0, 1, FADE, dtype=np.float32)
    window[-FADE:] = np.linspace(1, 0, FADE, dtype=np.float32)
    return window


def separate_vocals(audio, device='cuda'):
    """audio: (frames, 2) float32 at 44.1 kHz -> vocal stem with the same shape."""
    import numpy as np
    import torch
    if audio.ndim != 2 or audio.shape[1] != 2:
        raise ValueError('Stereo input required')
    model = roformer(device)
    frames = len(audio)
    # Leading pad of one step keeps the first real sample inside two windows; the tail
    # pad completes the last window so every frame is covered with a full weight.
    span = frames + 2 * STEP
    tail = STEP + (-(span - CHUNK) % STEP if span > CHUNK else CHUNK - span)
    padded = np.pad(audio.T, ((0, 0), (STEP, tail)))
    window = crossfade_window()
    output = np.zeros_like(padded)
    weight = np.zeros(padded.shape[1], dtype=np.float32)
    with torch.inference_mode():
        for start in range(0, padded.shape[1] - CHUNK + 1, STEP):
            block = torch.from_numpy(np.ascontiguousarray(padded[:, start:start + CHUNK]))[None].to(device)
            stem = model(block)[0].float().cpu().numpy()
            output[:, start:start + CHUNK] += stem * window
            weight[start:start + CHUNK] += window
    result = (output / np.maximum(weight, 1e-8))[:, STEP:STEP + frames].T.astype(np.float32)
    if result.shape != audio.shape or not np.isfinite(result).all():
        raise RuntimeError('Invalid separated audio')
    return result


# MossFormer2 SE 48K front end, as published by ClearerVoice-Studio (Apache-2.0):
# Hamming 1920/384, 60 Kaldi filter banks with deltas, mask on the complex STFT.
WIN, HOP, MELS, RATE = 1920, 384, 60, 48000
ONE_PASS = 20 * RATE
WINDOW = 4 * RATE
STRIDE = WINDOW * 3 // 4


def _enhance_block(model, block, device):
    import torch
    import torchaudio
    features = torchaudio.compliance.kaldi.fbank(
        block[None], dither=0.0, frame_length=WIN / RATE * 1000, frame_shift=HOP / RATE * 1000,
        num_mel_bins=MELS, sample_frequency=RATE, window_type='hamming')
    first = torchaudio.functional.compute_deltas(features.T)
    second = torchaudio.functional.compute_deltas(first)
    features = torch.cat([features, first.T, second.T], dim=1)[None].to(device)
    mask = model(features)[-1].permute(2, 1, 0).float().cpu()
    window = torch.hamming_window(WIN, periodic=False)
    spectrum = torch.stft(block, WIN, HOP, WIN, center=False, window=window, return_complex=True)
    masked = torch.view_as_complex((torch.view_as_real(spectrum) * mask).contiguous())
    return torch.istft(masked, WIN, HOP, WIN, window=window, center=False, length=len(block))


def enhance_speech(audio, device='cuda'):
    """audio: (frames,) float32 mono at 48 kHz -> enhanced speech, same length."""
    import numpy as np
    import torch
    if audio.ndim != 1:
        raise ValueError('Mono input required')
    model = mossformer(device)
    frames = len(audio)
    # The model was trained on 16-bit scaled samples.
    signal = torch.from_numpy(np.ascontiguousarray(audio, dtype=np.float32)) * 32768.0
    with torch.inference_mode():
        if frames <= ONE_PASS:
            result = _enhance_block(model, signal, device)
        else:
            extra = (-(frames - WINDOW)) % STRIDE
            signal = torch.cat([signal, torch.zeros(extra)])
            result = torch.zeros(len(signal))
            give = (WINDOW - STRIDE) // 2
            for start in range(0, len(signal) - WINDOW + 1, STRIDE):
                block = _enhance_block(model, signal[start:start + WINDOW], device)
                if start == 0:
                    result[:WINDOW - give] = block[:-give]
                else:
                    result[start + give:start + WINDOW - give] = block[give:-give]
            # The final window keeps its tail: nothing comes after it.
            last = len(signal) - WINDOW
            result[last + WINDOW - give:] = block[WINDOW - give:]
    output = (result[:frames] / 32768.0).numpy().astype(np.float32)
    if output.shape != audio.shape or not np.isfinite(output).all():
        raise RuntimeError('Invalid enhanced audio')
    return output


def isolate_voice(audio44, device='cuda'):
    """audio44: (frames, 2) at 44.1 kHz -> (mono 48 kHz speech, frames at 48 kHz)."""
    import numpy as np
    import torch
    import torchaudio
    vocals = separate_vocals(audio44, device).mean(axis=1)
    speech48 = torchaudio.functional.resample(torch.from_numpy(vocals), 44100, RATE).numpy()
    return enhance_speech(np.ascontiguousarray(speech48, dtype=np.float32), device)


if __name__ == '__main__':
    download_models()
    roformer('cpu')
    mossformer('cpu')
    print('Mel-Band RoFormer and MossFormer2 SE 48K checkpoints verified and loaded on CPU.')
