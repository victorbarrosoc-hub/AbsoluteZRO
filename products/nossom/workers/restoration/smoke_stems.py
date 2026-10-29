"""Build-time check of the remixer with the bundled weights, without CUDA: five stereo stems
that add back up to the input and survive the FLAC package. Not a quality measurement."""
import subprocess
import numpy as np
import torch
from stems import STEMS, separate_stems, stems_package

torch.set_num_threads(2)
clock = np.arange(44100, dtype=np.float32) / 44100
source = np.stack([.1 * np.sin(2*np.pi*220*clock),
                   .08 * np.sin(2*np.pi*55*clock)], axis=1).astype(np.float32)
stems = separate_stems(source, device='cpu')
assert len(stems) == len(STEMS) and all(s.shape == source.shape for s in stems)
assert np.max(np.abs(sum(stems) - source)) < 1e-5
files, gain_db = stems_package(stems)
assert gain_db <= 0 and all(f.startswith(b'fLaC') for f in files)
decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 'f32le', 'pipe:1'],
                         input=files[1], capture_output=True, check=True).stdout
assert len(decoded) == source.size * 4
print('Remixer CPU inference passed: five stems, exact sum, FLAC package.')
