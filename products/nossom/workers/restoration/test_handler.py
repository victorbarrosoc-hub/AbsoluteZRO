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

    def test_ten_minutes_of_stems_fit_even_without_compression(self):
        os.environ['NOSSOM_STORAGE_ORIGIN'] = 'https://project.supabase.co'
        raw = 5 * 44100 * worker.MAX_SECONDS * 2 * 3
        self.assertLessEqual(-(-int(raw * 1.01) // worker.PART_BYTES), worker.STEMS_PARTS)
        base = 'https://project.supabase.co/storage/v1/object/upload/sign/nossom-restoration/'
        path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/'
        self.assertTrue(worker.allowed_url(base + path + 'output-39.bin?token=w', 'write'))
        with self.assertRaises(ValueError):
            worker.allowed_url(base + path + 'output-40.bin?token=w', 'write')

    def test_unknown_preset_is_refused_without_details(self):
        with self.assertRaisesRegex(RuntimeError, 'retry with the original file'):
            worker.handler({'input': {'preset': 'any-model-url'}})


class TranscriptTests(unittest.TestCase):
    def setUp(self):
        os.environ['NOSSOM_STORAGE_ORIGIN'] = 'https://project.supabase.co'
        base = 'https://project.supabase.co/storage/v1/object/'
        path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/'
        self.job = {'input': {
            'preset': 'whisper-transcript-v1', 'input_bytes': 1000, 'duration': 2.0,
            'input_urls': [base + 'sign/nossom-restoration/' + path + 'source-0.bin?token=r'],
            'output_urls': [base + 'upload/sign/nossom-restoration/' + path + 'output-0.bin?token=w'],
        }}
        self.pcm = (np.zeros(32000, dtype='<f4') + .01).tobytes()

    def run_job(self, words, language='pt'):
        fake = types.ModuleType('transcribe')
        fake.transcribe = Mock(return_value={'language': language, 'words': words})
        sent = {}
        def put(url, data, **kwargs):
            sent['data'] = data
            return Mock(status_code=200)
        decoded = Mock(returncode=0, stdout=self.pcm)
        cuda = types.SimpleNamespace(is_available=lambda: True, manual_seed_all=lambda seed: None)
        with patch.dict(sys.modules, {'transcribe': fake}), \
                patch.object(worker, 'download_parts'), \
                patch.object(worker.subprocess, 'run', return_value=decoded) as run, \
                patch.object(worker.requests, 'put', side_effect=put, create=True), \
                patch.object(worker.torch, 'cuda', cuda, create=True), \
                patch.object(worker.torch, 'manual_seed', lambda seed: None, create=True):
            result = worker.handler(self.job)
        return result, sent.get('data'), run.call_args[0][0], fake.transcribe.call_args[0][0]

    def test_transcript_is_decoded_at_16k_mono_and_uploaded_as_one_json_part(self):
        words = [[0.1, 0.4, 'Olá'], [0.4, 0.9, 'mundo.']]
        result, data, command, audio = self.run_job(words)
        self.assertEqual(command[command.index('-ar') + 1], '16000')
        self.assertEqual(command[command.index('-ac') + 1], '1')
        self.assertEqual(len(audio), 32000)
        document = __import__('json').loads(data.decode())
        self.assertEqual(document, {'version': 1, 'language': 'pt', 'duration': 2.0, 'words': words})
        self.assertEqual(result, {'preset': 'whisper-transcript-v1', 'totalBytes': len(data),
                                  'chunks': [{'index': 0, 'bytes': len(data)}],
                                  'words': 2, 'language': 'pt'})

    def test_oversized_transcript_is_refused(self):
        words = [[0.0, 0.001, 'x' * 200]] * 30000
        with self.assertRaisesRegex(RuntimeError, 'retry with the original file'):
            self.run_job(words)


class StemsTests(TranscriptTests):
    def test_stems_are_packed_in_order_and_split_into_signed_parts(self):
        base = 'https://project.supabase.co/storage/v1/object/upload/sign/nossom-restoration/'
        path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/'
        self.job['input'].update(preset='stems-v1', duration=1.0, output_urls=[
            base + path + f'output-{i}.bin?token=w' for i in range(40)])
        stereo = (np.zeros((44100, 2), dtype='<f4') + .01).tobytes()
        files = [b'fLaC' + bytes([i]) * (worker.PART_BYTES // 2) for i in range(5)]
        fake = types.ModuleType('stems')
        fake.STEMS = ('voz', 'bateria', 'baixo', 'guitarra', 'outros')
        fake.separate_stems = Mock(return_value=['s'] * 5)
        fake.stems_package = Mock(return_value=(files, -0.5))
        sent = []
        def put(url, data, **kwargs):
            sent.append((url, len(data)))
            return Mock(status_code=200)
        cuda = types.SimpleNamespace(is_available=lambda: True, manual_seed_all=lambda seed: None)
        with patch.dict(sys.modules, {'stems': fake}), \
                patch.object(worker, 'download_parts'), \
                patch.object(worker.subprocess, 'run', return_value=Mock(returncode=0, stdout=stereo)), \
                patch.object(worker.requests, 'put', side_effect=put, create=True), \
                patch.object(worker.torch, 'cuda', cuda, create=True), \
                patch.object(worker.torch, 'manual_seed', lambda seed: None, create=True):
            result = worker.handler(self.job)
        total = sum(len(f) for f in files)
        self.assertEqual(result['totalBytes'], total)
        self.assertEqual([s['name'] for s in result['stems']], list(fake.STEMS))
        self.assertEqual([s['bytes'] for s in result['stems']], [len(f) for f in files])
        self.assertEqual(len(sent), -(-total // worker.PART_BYTES))
        self.assertTrue(all(url.split('output-')[1].startswith(f'{i}.') for i, (url, _) in enumerate(sent)))
        self.assertEqual(result['gainDb'], -0.5)
        self.assertEqual(result['frames'], 44100)


if __name__ == '__main__':
    unittest.main()
