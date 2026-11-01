import test from 'node:test';
import assert from 'node:assert/strict';
import { packProject, unpackProject, type Project } from '../lib/storage';

// O último recurso do Safari do iPhone: os áudios vão para o IndexedDB como bytes e voltam iguais, como Blob.
const audio = (text: string, type: string) => new Blob([text], { type });
const project = {
  id: 'p1',
  name: 'Máscara',
  createdAt: 1,
  updatedAt: 2,
  originalFile: audio('original', 'audio/mpeg'),
  originalName: 'mascara.mp3',
  versions: [
    { id: 'v1', label: 'Original', blob: audio('wav', 'audio/wav') },
    { id: 'v2', label: 'EQ', parentId: 'v1', blob: audio('eq', 'audio/wav') },
  ],
  stems: {
    files: [audio('voz', 'audio/flac'), audio('resto', 'audio/flac')],
    gainDb: 0,
    createdAt: 3,
  },
} as unknown as Project;

test('o projeto em bytes não guarda Blob nenhum e volta igual', async () => {
  const packed = await packProject(project);
  const blobs = [
    packed.originalFile,
    ...packed.versions.map((v) => v.blob),
    ...packed.stems!.files,
  ];
  for (const value of blobs) {
    assert.equal(value instanceof Blob, false);
    assert.ok(
      (value as unknown as { nossomBytes: ArrayBuffer }).nossomBytes instanceof ArrayBuffer,
    );
  }
  const back = unpackProject(structuredClone(packed));
  assert.equal(back.name, 'Máscara');
  assert.equal(back.versions[1].parentId, 'v1');
  assert.equal(back.originalFile.type, 'audio/mpeg');
  assert.equal(await back.originalFile.text(), 'original');
  assert.deepEqual(await Promise.all(back.versions.map((v) => v.blob.text())), ['wav', 'eq']);
  assert.equal(back.stems!.files[1].type, 'audio/flac');
  assert.equal(await back.stems!.files[0].text(), 'voz');
});

test('um projeto guardado com Blobs passa sem mudança', () => {
  const back = unpackProject(project);
  assert.equal(back.originalFile, project.originalFile);
  assert.equal(back.versions[0].blob, project.versions[0].blob);
  assert.equal(back.stems!.files[0], project.stems!.files[0]);
});
