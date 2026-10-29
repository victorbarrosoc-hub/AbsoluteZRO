FROM runpod/pytorch:1.4.1-cu1281-torch280-ubuntu2404
ENV HF_HUB_ENABLE_HF_TRANSFER=0 DS_BUILD_OPS=0 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git && rm -rf /var/lib/apt/lists/*
RUN python -m venv --system-site-packages /opt/nossom-restore
ENV PATH="/opt/nossom-restore/bin:${PATH}"
RUN python -c "from importlib.metadata import version; open('/tmp/torch-constraints.txt','w').write('\n'.join(p+'=='+version(p) for p in ('torch','torchaudio','torchvision')))"
RUN pip install --no-cache-dir -c /tmp/torch-constraints.txt 'numpy<2' 'demucs==4.0.1' 'runpod==1.7.13' 'requests>=2.32,<3' 'bs-roformer==0.3.10' 'clearvoice==0.1.2' 'rotary-embedding-torch==0.8.3' 'transformers==4.57.1' 'git+https://github.com/resemble-ai/resemble-enhance.git@8e978149bfe8abab3eb77d965d579a111afdb0ff'
# Bake weights into the image, rather than downloading them on every cold start.
RUN python -c "from resemble_enhance.enhancer.download import download; download()"
COPY workers/restoration/vocals.py /opt/nossom-vocals.py
RUN python /opt/nossom-vocals.py
# Voice isolator weights: pinned revisions, SHA-256 checked, loaded as plain state dicts.
COPY workers/restoration/isolator.py /opt/nossom-isolator.py
RUN python /opt/nossom-isolator.py
COPY workers/restoration/transcribe.py /opt/nossom-transcribe.py
RUN python /opt/nossom-transcribe.py
COPY workers/restoration/stems.py /opt/nossom-stems.py
RUN python /opt/nossom-stems.py
WORKDIR /worker
COPY workers/restoration/vocals.py /worker/vocals.py
COPY workers/restoration/isolator.py /worker/isolator.py
COPY workers/restoration/transcribe.py /worker/transcribe.py
COPY workers/restoration/stems.py /worker/stems.py
COPY workers/restoration/handler.py /worker/handler.py
COPY workers/restoration/smoke_vocals.py /worker/smoke_vocals.py
RUN python /worker/smoke_vocals.py
COPY workers/restoration/smoke_isolator.py /worker/smoke_isolator.py
RUN python /worker/smoke_isolator.py
COPY workers/restoration/smoke_transcribe.py /worker/smoke_transcribe.py
RUN python /worker/smoke_transcribe.py
COPY workers/restoration/smoke_stems.py /worker/smoke_stems.py
RUN python /worker/smoke_stems.py
COPY workers/restoration/README.md /worker/README.md
CMD ["python", "-u", "/worker/handler.py"]
