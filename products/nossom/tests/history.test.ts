import test from 'node:test';
import assert from 'node:assert/strict';
import { activeIndex, activateVersion, previousIndex, nextIndex } from '../lib/history';
import type { Project } from '../lib/storage';
const project = {
  versions: [
    { id: 'raw' },
    { id: 'eq', parentId: 'raw' },
    { id: 'master', parentId: 'eq' },
    { id: 'fork', parentId: 'raw' },
  ],
} as Project;
test('undo and redo follow the selected branch without deleting history', () => {
  assert.equal(previousIndex(project, 2), 1);
  assert.equal(previousIndex(project, 3), 0);
  assert.equal(nextIndex(project, 0), 3);
  assert.equal(nextIndex(project, 1), 2);
  assert.equal(activeIndex(activateVersion(project, 1)), 1);
  assert.equal(activateVersion(project, 0).versions.length, 4);
  assert.throws(() => activateVersion(project, 7));
});
test('projects saved before parent and active IDs keep a usable linear history', () => {
  const legacy = { versions: [{ id: '0' }, { id: '1' }, { id: '2' }] } as Project;
  assert.equal(activeIndex(legacy), 2);
  assert.equal(previousIndex(legacy, 2), 1);
  assert.equal(nextIndex(legacy, 0), 1);
});

test('redo returns to the explicitly undone branch even when a newer branch exists', () => {
  const undone = { ...activateVersion(project, 0), redoVersionIds: ['eq'] };
  assert.equal(nextIndex(undone, 0), 1);
});
