"""CPU-only transport/security contracts; no model-quality claims or GPU calls."""
import importlib.util
import os
from pathlib import Path
import struct
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

import numpy as np

# The host does not have CUDA/PyTorch. These stubs are used only for imports;
# the tests below never exercise or pretend to exercise model inference.
for name in ('torch', 'runpod', 'requests', 'resemble_enhance', 'resemble_enhance.enhancer', 'resemble_enhance.enhancer.inference'):
    sys.modules[name] = types.ModuleType(name)
sys.modules['resemble_enhance.enhancer.inference'].enhance = Mock()
sys.modules['resemble_enhance.enhancer.inference'].load_enhancer = Mock()
spec = importlib.util.spec_from_file_location('worker_handler', Path(__file__).with_name('handler.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class TransportTests(unittest.TestCase):
    def setUp(self):
        os.environ['NOSSOM_STORAGE_ORIGIN'] = 'https://project.supabase.co'
        self.path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/'

    def test_only_scoped_supabase_object_capabilities_are_allowed(self):
        url = 'https://project.supabase.co/storage/v1/object/sign/nossom-restoration/' + self.path + 'source-0.bin?token=scoped'
        self.assertEqual(worker.allowed_url(url, 'read'), url)
        for bad in [url.replace('https:', 'http:'), url.replace('project.supabase.co', 'evil.test'),
                    url.replace('source-0', 'output-0'), url.replace(self.path, '../'),
                    url.replace('/object/sign/', '/auth/v1/'), url.split('?')[0],
                    url.replace('https://', 'https://user:pass@'), url + '#fragment']:
            with self.assertRaises(ValueError):
                worker.allowed_url(bad, 'read')

    def test_float_wav_keeps_over_full_scale_samples_and_exact_duration(self):
        samples = np.array([0, 1.5, -1.25, 0.1], dtype=np.float32)
        result = worker.float_wav(samples)
        self.assertEqual(len(result), 44 + 4 * len(samples))
        self.assertEqual(struct.unpack_from('<H', result, 20)[0], 3)
        np.testing.assert_array_equal(np.frombuffer(result[44:], dtype='<f4'), samples)

    def test_source_byte_limit_is_enforced_before_writing_excess_data(self):
        response = Mock()
        response.status_code = 200
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.iter_content.return_value = [b'abc', b'def']
        url = 'https://project.supabase.co/storage/v1/object/sign/nossom-restoration/' + self.path + 'source-0.bin?token=scoped'
        with tempfile.TemporaryDirectory() as folder, patch.object(worker.requests, 'get', return_value=response, create=True):
            with self.assertRaisesRegex(ValueError, 'does not match'):
                worker.download_parts([url], Path(folder) / 'source', 5)


class PresetTests(unittest.TestCase):
    def test_presets_match_the_web_contract(self):
        # Mirrors presetSpec() in lib/restoration.ts: decoded channels, output channels, rate, parts.
        self.assertEqual(worker.PRESETS, {
            'resemble-d-v1': (1, 1, 44100, 6),
            'htdemucs-vocals-v1': (2, 2, 44100, 11),
            'voice-isolator-v1': (2, 1, 48000, 6),
            'roformer-vocals-v1': (2, 2, 44100, 11),
        })

    def test_ten_minutes_of_isolated_speech_fit_the_signed_output_parts(self):
        for preset, (_, channels, rate, parts) in worker.PRESETS.items():
            wav_bytes = 44 + rate * worker.MAX_SECONDS * channels * 4
            self.assertLessEqual(-(-wav_bytes // worker.PART_BYTES), parts, preset)

    def test_unknown_preset_is_refused_without_details(self):
        with self.assertRaisesRegex(RuntimeError, 'retry with the original file'):
            worker.handler({'input': {'preset': 'any-model-url'}})


if __name__ == '__main__':
    unittest.main()
