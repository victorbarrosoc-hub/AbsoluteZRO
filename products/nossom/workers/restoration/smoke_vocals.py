"""Build-time inference check with the bundled pretrained model, without CUDA.

Synthetic sound checks runtime compatibility and shape only, not music quality.
"""
import random
import numpy as np
import torch
from vocals import separate_vocals

random.seed(2026)
np.random.seed(2026)
torch.manual_seed(2026)
torch.set_num_threads(2)
clock = np.arange(11025, dtype=np.float32) / 44100
source = np.stack([.1 * np.sin(2*np.pi*220*clock),
                   .08 * np.sin(2*np.pi*330*clock)], axis=1).astype(np.float32)
result = separate_vocals(source, device='cpu')
assert result.shape == source.shape
assert np.isfinite(result).all()
assert not np.array_equal(result, source)
print('Pretrained HTDemucs CPU inference passed: 44100 Hz, stereo, original frame count.')
