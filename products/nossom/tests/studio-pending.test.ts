import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeAria, badgeLabel, studioPending } from '../lib/studio-pending';

test('balão de Meus projetos: só o pedido que espera a pessoa conta', () => {
  assert.deepEqual(studioPending(null), { projects: { count: 0, title: '' } });
  // pronto para salvar (com ou sem o áudio aqui)
  assert.equal(studioPending({ status: 'completed', projectId: 'p' }).projects.count, 1);
  assert.match(studioPending({ status: 'completed' }).projects.title, /pronto para salvar/);
  // envio incompleto: só a pessoa retoma ou cancela
  assert.match(
    studioPending({ status: 'uploading', projectId: 'p' }).projects.title,
    /Envio incompleto/,
  );
  // em andamento sem o áudio neste aparelho: precisa recuperar
  assert.match(studioPending({ status: 'running' }).projects.title, /recupere/);
  // na fila, confirmando ou restaurando com o áudio aqui: o trabalho é do servidor
  for (const status of ['queued', 'submitting', 'running'])
    assert.deepEqual(studioPending({ status, projectId: 'p' }), {
      projects: { count: 0, title: '' },
    });
});

test('número e nome do balão', () => {
  assert.equal(badgeLabel(1), '1');
  assert.equal(badgeLabel(99), '99');
  assert.equal(badgeLabel(100), '99+');
  assert.equal(badgeAria(1), '1 pendência');
  assert.equal(badgeAria(4), '4 pendências');
});
