"""Voice-isolation benchmark: real PT-BR speech + real noise/music, objective metrics.

Usage: python run_bench.py ENGINE [ENGINE...]   (results appended to results.jsonl)
"""
import json
import subprocess
import os
import sys
import time
from pathlib import Path

import librosa
import numpy as np
import onnxruntime as ort
import soundfile as sf
from pesq import pesq
from pystoi import stoi

import engines

S = Path(os.environ.get('NOSSOM_BENCH_DIR', Path(__file__).resolve().parent / 'work'))
D = S / 'data'
OUT = S / 'out'
OUT.mkdir(parents=True, exist_ok=True)
SR = 48000


def load48(path):
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR),
                          '-f', 'f32le', 'pipe:1'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<f4').copy()


def rms(x):
    return float(np.sqrt(np.mean(x ** 2) + 1e-12))


def speech_clips():
    files = sorted((D / 'ptcorpus/audio/Esperado').glob('*.wav'), key=lambda p: int(p.stem))
    clips, cur = [], []
    for f in files:
        cur.append(load48(f))
        cur.append(np.zeros(int(0.3 * SR), np.float32))
        if sum(len(c) for c in cur) > 10 * SR:
            x = np.concatenate([np.zeros(int(0.5 * SR), np.float32)] + cur)
            clips.append(x / rms(x[np.abs(x) > 1e-4]) * 10 ** (-23 / 20))
            cur = []
    return clips


def noise(name, n, offset):
    if name.startswith('music-'):
        x = load48(D / f'{name}.mp3')
    else:
        x = load48(D / name / 'ch01.wav')
    offset %= max(1, len(x) - n)
    x = x[offset:offset + n]
    return x / rms(x)


def reverb(x, rt60=0.7, seed=3):
    rng = np.random.RandomState(seed)
    n = int(rt60 * 1.2 * SR)
    t = np.arange(n) / SR
    rir = rng.randn(n) * np.exp(-6.9 * t / rt60)
    rir[: int(0.002 * SR)] = 0
    rir[0] = 1.0
    rir *= 0.6 / np.sqrt(np.sum(rir[1:] ** 2))  # DRR ~ +4 dB: a typical untreated room at ~1.5 m
    rir[0] = 1.0
    y = np.convolve(x, rir)[: len(x)]
    return y.astype(np.float32)


SCENARIOS = {
    # name: list of (noise source, SNR dB) ; speech level fixed
    'clean': [],
    'music_0dB': [('music-Local', 0)],
    'cafe_0dB': [('PCAFETER', 0)],
    'street_5dB': [('STRAFFIC', 5)],
    'kitchen_0dB': [('DKITCHEN', 0)],
    'vlog_music-3_cafe5': [('music-Sneak', -3), ('PCAFETER', 5)],
    'loudmusic_-6dB': [('music-Monke', -6)],
    'reverb_street10': [('STRAFFIC', 10)],
}


def build():
    clips = speech_clips()
    items = []
    for i, (name, mixes) in enumerate(SCENARIOS.items()):
        clean = clips[i % len(clips)].astype(np.float32)
        src = reverb(clean) if name.startswith('reverb') else clean
        mix = src.copy()
        for j, (nz, snr) in enumerate(mixes):
            mix += noise(nz, len(clean), SR * (17 + 23 * i + 7 * j)) * rms(clean) * 10 ** (-snr / 20)
        peak = np.max(np.abs(mix))
        g = min(1.0, 0.89 / peak)
        items.append((name, (clean * g).astype(np.float32), (mix * g).astype(np.float32)))
    return items


def si_sdr(ref, est):
    ref = ref - ref.mean()
    est = est - est.mean()
    a = np.dot(est, ref) / (np.dot(ref, ref) + 1e-12)
    t = a * ref
    return float(10 * np.log10(np.sum(t ** 2) / (np.sum((est - t) ** 2) + 1e-12)))


class DNSMOS:
    def __init__(self):
        p = S / 'dnsmos'
        self.main = ort.InferenceSession(str(p / 'sig_bak_ovr.onnx'))
        self.p808 = ort.InferenceSession(str(p / 'model_v8.onnx'))

    def __call__(self, x48):
        a = librosa.resample(x48.astype(np.float64), orig_sr=SR, target_sr=16000)
        L = int(9.01 * 16000)
        while len(a) < L:
            a = np.append(a, a)
        hops = int(np.floor(len(a) / 16000) - 9.01) + 1
        sig, bak, ovr, p8 = [], [], [], []
        for k in range(hops):
            seg = a[k * 16000: k * 16000 + L]
            if len(seg) < L:
                continue
            s, b, o = self.main.run(None, {'input_1': seg.astype('float32')[None]})[0][0]
            mel = librosa.feature.melspectrogram(y=seg[:-160], sr=16000, n_fft=321, hop_length=160, n_mels=120)
            mel = ((librosa.power_to_db(mel, ref=np.max) + 40) / 40).T
            p8.append(self.p808.run(None, {'input_1': mel.astype('float32')[None]})[0][0][0])
            sig.append(np.poly1d([-0.08397278, 1.22083953, 0.0052439])(s))
            bak.append(np.poly1d([-0.13166888, 1.60915514, -0.39604546])(b))
            ovr.append(np.poly1d([-0.06766283, 1.11546468, 0.04602535])(o))
        return dict(SIG=float(np.mean(sig)), BAK=float(np.mean(bak)), OVRL=float(np.mean(ovr)),
                    P808=float(np.mean(p8)))


def metrics(clean, est, mos):
    n = min(len(clean), len(est))
    c, e = clean[:n], est[:n]
    c16 = librosa.resample(c.astype(np.float64), orig_sr=SR, target_sr=16000)
    e16 = librosa.resample(e.astype(np.float64), orig_sr=SR, target_sr=16000)
    try:
        pq = float(pesq(16000, c16, e16, 'wb'))
    except Exception:
        pq = float('nan')
    return dict(si_sdr=si_sdr(c, e), pesq_wb=pq, estoi=float(stoi(c16, e16, 16000, extended=True)), **mos(e))


def main():
    items = build()
    for name, clean, mix in items:
        sf.write(OUT / f'{name}__clean.wav', clean, SR)
        sf.write(OUT / f'{name}__input.wav', mix, SR)
    mos = DNSMOS()
    with open(S / 'results.jsonl', 'a') as log:
        for engine in sys.argv[1:]:
            for name, clean, mix in items:
                t = time.time()
                y = engines.run(engine, mix)
                dt = time.time() - t
                y = np.asarray(y, np.float32)[: len(mix)]
                sf.write(OUT / f'{name}__{engine}.wav', y, SR)
                row = dict(engine=engine, scenario=name, seconds=round(dt, 2), audio_s=round(len(mix) / SR, 2),
                           **metrics(clean, y, mos))
                log.write(json.dumps(row) + '\n')
                log.flush()
                print(json.dumps(row), flush=True)


if __name__ == '__main__':
    main()
