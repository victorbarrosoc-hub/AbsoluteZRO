"""Windowing contracts of the voice isolator, with stand-in models (needs PyTorch, no weights).

An identity separator and a unity mask must give back the input: any seam, gap or
lost tail in the overlap-add would show up here before it reaches a customer file.
"""
import importlib.util
import unittest
from unittest.mock import patch

try:
    import numpy as np
    import torch
    import torchaudio  # noqa: F401
except ImportError:  # pragma: no cover - the transport tests run without PyTorch
    torch = None

if torch is not None:
    import isolator


class Identity(torch.nn.Module if torch else object):
    def forward(self, block):
        return block.clone()


class UnityMask(torch.nn.Module if torch else object):
    def forward(self, features):
        return [torch.ones(1, features.shape[1], isolator.WIN // 2 + 1)]


@unittest.skipIf(torch is None, 'PyTorch is not installed')
class WindowingTests(unittest.TestCase):
    def test_separation_windows_rebuild_every_frame(self):
        rng = np.random.RandomState(2026)
        with patch.object(isolator, 'roformer', lambda device: Identity()):
            for seconds in (0.1, 1, 8, 8.5, 21.37):
                audio = (rng.randn(int(44100 * seconds), 2) * .1).astype(np.float32)
                result = isolator.separate_vocals(audio, device='cpu')
                self.assertEqual(result.shape, audio.shape)
                np.testing.assert_allclose(result, audio, atol=1e-6)

    def test_speech_mask_keeps_length_and_tail_in_both_paths(self):
        rng = np.random.RandomState(7)
        with patch.object(isolator, 'mossformer', lambda device: UnityMask()):
            for seconds in (3, 20, 21, 47.3):
                audio = (rng.randn(int(48000 * seconds)) * .1).astype(np.float32)
                result = isolator.enhance_speech(audio, device='cpu')
                self.assertEqual(result.shape, audio.shape)
                # center=False drops part of the first and last half window; everything else is exact.
                inner = slice(isolator.WIN, len(audio) - isolator.WIN)
                np.testing.assert_allclose(result[inner], audio[inner], atol=1e-4)
                self.assertGreater(np.abs(result[-2 * isolator.WIN:-isolator.WIN]).max(), 0)

    def test_isolation_returns_mono_48k_with_the_source_duration(self):
        audio = (np.random.RandomState(3).randn(44100 * 2, 2) * .1).astype(np.float32)
        with patch.object(isolator, 'roformer', lambda device: Identity()), \
                patch.object(isolator, 'mossformer', lambda device: UnityMask()):
            result = isolator.isolate_voice(audio, device='cpu')
        self.assertEqual(result.ndim, 1)
        self.assertLessEqual(abs(len(result) - 96000), 1)


if __name__ == '__main__':
    unittest.main()
