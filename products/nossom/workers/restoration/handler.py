"""RunPod queue worker for the owner-selected Resemble Enhance preset D.

URLs are short-lived private Supabase object capabilities, never arbitrary URLs.
No administrator key, provider key or database key is sent to this worker.
"""
import io
import math
import os
import random
import re
import struct
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
import requests
import runpod
import torch
from resemble_enhance.enhancer.inference import enhance, load_enhancer

PART_BYTES = 20 * 1024 * 1024
MAX_BYTES = 100 * 1024 * 1024
MAX_SECONDS = 600
PRESET = 'resemble-d-v1'
VOCALS_PRESET = 'htdemucs-vocals-v1'


def allowed_url(url, kind):
    origin = os.environ.get('NOSSOM_STORAGE_ORIGIN', '').rstrip('/')
    base, target = urlsplit(origin), urlsplit(url)
    expected = '/storage/v1/object/' + ('sign/' if kind == 'read' else 'upload/sign/') + 'nossom-restoration/'
    if (not origin or base.scheme != 'https' or target.scheme != 'https'
            or target.netloc != base.netloc or target.username or target.password
            or target.fragment or not target.path.startswith(expected)
            or not re.fullmatch(r'[0-9a-f-]{36}/[0-9a-f-]{36}/' +
                                ('source-[0-4]' if kind == 'read' else 'output-(?:[0-9]|10)') + r'\.bin',
                                target.path[len(expected):])
            or not target.query):
        raise ValueError('Invalid private storage address')
    return url


def download_parts(urls, path, expected):
    total = 0
    with path.open('wb') as output:
        for index, url in enumerate(urls):
            count = 0
            with requests.get(allowed_url(url, 'read'), timeout=(15, 90),
                              stream=True, allow_redirects=False) as response:
                if response.status_code != 200:
                    raise ValueError('Source download failed')
                for block in response.iter_content(256 * 1024):
                    count += len(block)
                    total += len(block)
                    if count > PART_BYTES or total > MAX_BYTES:
                        raise ValueError('Source exceeds size limit')
                    output.write(block)
            if index < len(urls) - 1 and count != PART_BYTES:
                raise ValueError('Incomplete source part')
    if total != expected:
        raise ValueError('Source size does not match request')


def float_wav(samples, rate=44100, channels=1):
    data = np.asarray(samples, dtype='<f4').tobytes()
    return struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', 36 + len(data), b'WAVE',
                       b'fmt ', 16, 3, channels, rate, rate * channels * 4, channels * 4, 32, b'data', len(data)) + data


def handler(job):
    """One inference at a time per worker; the queue owns GPU lifecycle."""
    try:
        payload = job.get('input', {})
        preset = payload.get('preset')
        channels = 2 if preset == VOCALS_PRESET else 1
        output_count = 11 if preset == VOCALS_PRESET else 6
        if preset not in (PRESET, VOCALS_PRESET):
            raise ValueError('Unknown preset')
        urls, outputs = payload.get('input_urls'), payload.get('output_urls')
        size = payload.get('input_bytes')
        duration = payload.get('duration')
        if (not isinstance(size, int) or isinstance(size, bool) or not 44 < size <= MAX_BYTES
                or not isinstance(duration, (int, float)) or not math.isfinite(duration)
                or not 0.1 <= duration <= MAX_SECONDS
                or not isinstance(urls, list) or len(urls) != math.ceil(size / PART_BYTES)
                or not isinstance(outputs, list) or len(outputs) != output_count):
            raise ValueError('Invalid audio request')
        for url in urls:
            allowed_url(url, 'read')
        for url in outputs:
            allowed_url(url, 'write')
        if not torch.cuda.is_available():
            raise RuntimeError('CUDA unavailable')
        with tempfile.TemporaryDirectory(prefix='nossom-audio-') as folder:
            source = Path(folder) / 'source'
            download_parts(urls, source, size)
            # Decode in float, reserving over-zero headroom of float recordings.
            process = subprocess.run([
                # Uploaded bytes may not reference other files or network resources.
                'ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file',
                '-i', str(source), '-vn',
                '-t', '601', '-ac', str(channels), '-ar', '44100', '-f', 'f32le', 'pipe:1',
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90, check=False)
            if process.returncode:
                raise ValueError('Audio decoding failed')
            audio = np.frombuffer(process.stdout, dtype='<f4').copy()
            if channels == 2:
                audio = audio.reshape(-1, channels)
            if not 4410 <= len(audio) <= 44100 * MAX_SECONDS or not np.isfinite(audio).all():
                raise ValueError('Invalid audio duration or samples')
            if abs(len(audio) / 44100 - duration) > 1:
                raise ValueError('Audio duration does not match request')
            random.seed(2026)
            np.random.seed(2026)
            torch.manual_seed(2026)
            torch.cuda.manual_seed_all(2026)
            if preset == VOCALS_PRESET:
                print('NOSSOM: separating music vocals', flush=True)
                from vocals import separate_vocals
                samples = separate_vocals(audio)
                rate = 44100
            else:
                with torch.inference_mode():
                    restored, rate = enhance(torch.from_numpy(audio), 44100, 'cuda',
                                              nfe=64, solver='midpoint', lambd=0.5, tau=0.1)
                samples = restored.detach().cpu().numpy().reshape(-1).astype(np.float32)
            if rate != 44100 or samples.shape != audio.shape or not np.isfinite(samples).all():
                raise ValueError('Audio output invalid')
            maximum = float(np.max(np.abs(samples)))
            gain = min(1.0, 10 ** (-3 / 20) / max(maximum, 1e-12))
            wav = float_wav(samples * gain, rate, channels)
            parts = []
            for index, start in enumerate(range(0, len(wav), PART_BYTES)):
                block = wav[start:start + PART_BYTES]
                response = requests.put(allowed_url(outputs[index], 'write'), data=block,
                                        headers={'Content-Type': 'application/octet-stream'},
                                        timeout=(15, 120), allow_redirects=False)
                if response.status_code not in (200, 201):
                    raise ValueError('Result upload failed')
                parts.append({'index': index, 'bytes': len(block)})
            return {'preset': preset, 'chunks': parts, 'totalBytes': len(wav),
                    'frames': len(samples), 'sampleRate': rate, 'channels': channels,
                    'gainDb': 20 * math.log10(gain)}
    except Exception:
        # Never return tracebacks containing signed source URLs to the provider.
        raise RuntimeError('NOSSOM restoration failed; retry with the original file.') from None


if __name__ == '__main__':
    if not os.environ.get('NOSSOM_STORAGE_ORIGIN'):
        raise SystemExit('NOSSOM_STORAGE_ORIGIN is required')
    if not torch.cuda.is_available():
        raise SystemExit('GPU CUDA is required')
    load_enhancer(None, 'cuda')
    print('NOSSOM worker ready: resemble-d-v1 + htdemucs-vocals-v1', flush=True)
    runpod.serverless.start({'handler': handler})
