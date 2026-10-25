FROM runpod/pytorch:1.4.1-cu1281-torch280-ubuntu2404
ENV HF_HUB_ENABLE_HF_TRANSFER=0 DS_BUILD_OPS=0 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git && rm -rf /var/lib/apt/lists/*
RUN python -m venv --system-site-packages /opt/nossom-restore
ENV PATH="/opt/nossom-restore/bin:${PATH}"
RUN python -c "from importlib.metadata import version; open('/tmp/torch-constraints.txt','w').write('\n'.join(p+'=='+version(p) for p in ('torch','torchaudio','torchvision')))"
RUN pip install --no-cache-dir -c /tmp/torch-constraints.txt 'numpy<2' 'demucs==4.0.1' 'runpod==1.7.13' 'requests>=2.32,<3' 'git+https://github.com/resemble-ai/resemble-enhance.git@8e978149bfe8abab3eb77d965d579a111afdb0ff'
# Bake weights into the image, rather than downloading them on every cold start.
RUN python -c "from resemble_enhance.enhancer.download import download; download()"
COPY workers/restoration/vocals.py /opt/nossom-vocals.py
RUN python /opt/nossom-vocals.py
WORKDIR /worker
COPY workers/restoration/vocals.py /worker/vocals.py
COPY workers/restoration/handler.py /worker/handler.py
COPY workers/restoration/smoke_vocals.py /worker/smoke_vocals.py
RUN python /worker/smoke_vocals.py
COPY workers/restoration/README.md /worker/README.md
CMD ["python", "-u", "/worker/handler.py"]
