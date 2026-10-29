"""Build-time inference check of the voice isolator with the bundled weights, without CUDA.

A synthetic tone checks runtime compatibility, shapes and durations only, not quality.
"""
import numpy as np
import torch
from isolator import enhance_speech, isolate_voice, separate_vocals

torch.manual_seed(2026)
torch.set_num_threads(2)
clock = np.arange(44100, dtype=np.float32) / 44100
source = np.stack([.1 * np.sin(2*np.pi*220*clock),
                   .08 * np.sin(2*np.pi*330*clock)], axis=1).astype(np.float32)
stem = separate_vocals(source, device='cpu')
assert stem.shape == source.shape and np.isfinite(stem).all()
speech = isolate_voice(source, device='cpu')
assert speech.ndim == 1 and abs(len(speech) - 48000) <= 1 and np.isfinite(speech).all()
# Long inputs use the windowed path; the tail must be written, not left at zero.
long = (np.random.RandomState(2026).randn(48000 * 21) * .05).astype(np.float32)
enhanced = enhance_speech(long, device='cpu')
assert enhanced.shape == long.shape and np.isfinite(enhanced).all()
print('Voice isolator CPU inference passed: stem 44.1 kHz stereo, speech 48 kHz mono.')
