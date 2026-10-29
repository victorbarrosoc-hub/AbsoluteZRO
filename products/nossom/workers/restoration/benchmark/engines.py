"""Candidate voice-isolation engines, all run on CPU for an offline benchmark."""
import os
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
import torch
import torchaudio

S = Path(os.environ.get('NOSSOM_BENCH_DIR', Path(__file__).resolve().parent / 'work'))
torch.set_num_threads(4)


def resample(x, src, dst):
    if src == dst:
        return x.astype(np.float32)
    t = torch.from_numpy(np.ascontiguousarray(x, dtype=np.float32))
    return torchaudio.functional.resample(t, src, dst).numpy()


# ---------------------------------------------------------------- Mel-Band RoFormer (Kim, MIT)
@lru_cache(1)
def mel_model():
    from bs_roformer import MelBandRoformer  # PyPI bs-roformer==0.3.10 (MIT)
    m = MelBandRoformer(dim=384, depth=6, stereo=True, num_stems=1, time_transformer_depth=1,
                        freq_transformer_depth=1, num_bands=60, dim_head=64, heads=8, attn_dropout=0,
                        ff_dropout=0, flash_attn=True, dim_freqs_in=1025, sample_rate=44100, stft_n_fft=2048,
                        stft_hop_length=441, stft_win_length=2048, stft_normalized=False, mask_estimator_depth=2)
    sd = torch.load(S / 'models/melbandroformer/MelBandRoformer.ckpt', map_location='cpu', weights_only=True)
    m.load_state_dict(sd, strict=True)
    return m.eval()


def mel_vocals(x44, chunk=352800, overlap=2):
    """x44: (T,) or (T,2) float32 at 44.1 kHz -> vocals with same shape."""
    mono = x44.ndim == 1
    st = np.stack([x44, x44], 0) if mono else x44.T
    model = mel_model()
    T = st.shape[1]
    step = chunk // overlap
    fade = chunk // 10
    win = np.ones(chunk, np.float32)
    win[:fade] = np.linspace(0, 1, fade)
    win[-fade:] = np.linspace(1, 0, fade)
    pad = step
    tail = pad + (-(T + 2 * pad - chunk) % step if T + 2 * pad > chunk else chunk - T - 2 * pad)
    padded = np.pad(st, ((0, 0), (pad, tail)), mode='constant')
    out = np.zeros_like(padded)
    weight = np.zeros(padded.shape[1], np.float32)
    with torch.inference_mode():
        for start in range(0, padded.shape[1] - chunk + 1, step):
            seg = torch.from_numpy(np.ascontiguousarray(padded[:, start:start + chunk]))[None]
            y = model(seg)[0].numpy()
            if y.ndim == 3:
                y = y[0]
            out[:, start:start + chunk] += y * win
            weight[start:start + chunk] += win
    out = out / np.maximum(weight, 1e-8)
    out = out[:, pad:pad + T]
    return out.mean(0) if mono else out.T


# ---------------------------------------------------------------- MossFormer2 SE 48K (Apache-2.0)
class MossArgs:
    sampling_rate = 48000
    win_type = 'hamming'
    win_len = 1920
    win_inc = 384
    fft_len = 1920
    num_mels = 60
    one_time_decode_length = 20
    decode_window = 4


@lru_cache(1)
def moss_model():
    from clearvoice.models.mossformer2_se.mossformer2_se_wrapper import MossFormer2_SE_48K
    m = MossFormer2_SE_48K(MossArgs).model
    sd = torch.load(S / 'models/MossFormer2_SE_48K/last_best_checkpoint.pt', map_location='cpu', weights_only=True)
    m.load_state_dict(sd, strict=True)
    return m.eval()


def _fbank(seg, a):
    fb = torchaudio.compliance.kaldi.fbank(seg[None], dither=0.0, frame_length=a.win_len / a.sampling_rate * 1000,
                                           frame_shift=a.win_inc / a.sampling_rate * 1000, num_mel_bins=a.num_mels,
                                           sample_frequency=a.sampling_rate, window_type=a.win_type)
    tr = fb.T
    d1 = torchaudio.functional.compute_deltas(tr)
    d2 = torchaudio.functional.compute_deltas(d1)
    return torch.cat([fb, d1.T, d2.T], 1)[None]


def _mask_one(model, seg, a):
    win = torch.hamming_window(a.win_len, periodic=False)
    mask = model(_fbank(seg, a))[-1].permute(2, 1, 0)
    spec = torch.stft(seg, a.fft_len, a.win_inc, a.win_len, center=False, window=win, return_complex=True)
    spec = torch.view_as_complex((torch.view_as_real(spec) * mask).contiguous())
    return torch.istft(spec, a.fft_len, a.win_inc, a.win_len, window=win, center=False, length=len(seg))


def moss_enhance(x48):
    """x48: (T,) float32 mono at 48 kHz."""
    a = MossArgs
    model = moss_model()
    x = torch.from_numpy(np.ascontiguousarray(x48, dtype=np.float32)) * 32768.0
    n = len(x)
    with torch.inference_mode():
        if n <= a.sampling_rate * a.one_time_decode_length:
            y = _mask_one(model, x, a)
        else:
            window = int(a.sampling_rate * a.decode_window)
            stride = int(window * 0.75)
            t = n
            if t < window:
                x = torch.cat([x, torch.zeros(window - t)])
            elif t < window + stride:
                x = torch.cat([x, torch.zeros(window + stride - t)])
            elif (t - window) % stride:
                x = torch.cat([x, torch.zeros(t - (t - window) // stride * stride)])
            t = len(x)
            y = torch.zeros(t)
            give = (window - stride) // 2
            idx = 0
            while idx + window <= t:
                o = _mask_one(model, x[idx:idx + window], a)
                if idx == 0:
                    y[:window - give] = o[:-give]
                else:
                    y[idx + give:idx + window - give] = o[give:-give]
                idx += stride
    return (y[:n] / 32768.0).numpy()


# ---------------------------------------------------------------- DeepFilterNet3 (local engine today)
@lru_cache(1)
def dfn():
    import types
    if 'torchaudio.backend.common' not in sys.modules:  # deepfilternet 0.5.6 predates torchaudio 2.8
        backend = types.ModuleType('torchaudio.backend')
        common = types.ModuleType('torchaudio.backend.common')
        common.AudioMetaData = object
        backend.common = common
        sys.modules['torchaudio.backend'] = backend
        sys.modules['torchaudio.backend.common'] = common
    from df.enhance import init_df
    return init_df(log_level='ERROR')


def dfn_enhance(x48):
    m, st, _ = dfn()
    from df.enhance import enhance
    y = enhance(m, st, torch.from_numpy(x48[None].astype(np.float32)))
    return y[0].numpy()


# ---------------------------------------------------------------- HTDemucs vocals (current 'vocals' preset)
@lru_cache(1)
def htd():
    from demucs.pretrained import get_model
    return get_model('htdemucs').eval()


def htdemucs_vocals(x44):
    from demucs.apply import apply_model
    st = np.stack([x44, x44], 0)
    mix = torch.from_numpy(st)
    ref = mix.mean(0)
    mean, std = ref.mean(), ref.std()
    m = htd()
    with torch.inference_mode():
        stems = apply_model(m, ((mix - mean) / std)[None], device='cpu', shifts=1, split=True, overlap=0.25,
                            segment=7.8, progress=False)[0]
    return (stems[m.sources.index('vocals')] * std + mean).numpy().mean(0)


# ---------------------------------------------------------------- pipelines, all (T,) 48 kHz in/out
def run(name, x48):
    if name == 'input':
        return x48
    if name == 'dfn3':
        return dfn_enhance(x48)
    if name == 'htdemucs':
        return resample(htdemucs_vocals(resample(x48, 48000, 44100)), 44100, 48000)
    if name == 'mel':
        import hashlib
        key = S / 'cache' / (hashlib.sha1(x48.tobytes()).hexdigest() + '.npy')
        if key.exists():
            return np.load(key)
        y = resample(mel_vocals(resample(x48, 48000, 44100)), 44100, 48000)
        key.parent.mkdir(exist_ok=True)
        np.save(key, y)
        return y
    if name == 'moss':
        return moss_enhance(x48)
    if name == 'mel+moss':
        return moss_enhance(run('mel', x48))
    if name == 'mel+dfn3':
        return dfn_enhance(run('mel', x48))
    raise KeyError(name)
