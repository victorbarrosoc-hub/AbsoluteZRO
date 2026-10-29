"""Build-time check of Whisper with the bundled weights, without CUDA: it loads, runs and
writes nothing over near-silence. Real-speech accuracy is measured outside the build."""
import numpy as np
import torch
from transcribe import transcribe

torch.set_num_threads(2)
result = transcribe((np.random.RandomState(2026).randn(16000 * 3) * 1e-4).astype(np.float32), device='cpu')
assert result == {'language': None, 'words': []}, result
print('Whisper CPU inference passed: no words invented over silence.')
