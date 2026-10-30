/**
 * A semente da área do freela (e2e/area-freela.spec.ts, drizzle/0037), chamada pelo e2e/preparar.ts depois do banco
 * migrado e do ambiente pronto. Duas produtoras com marca (Estúdio Farol e Casa Aurora), a Alice freela nas duas, o
 * Bruno só no Farol (na mesma diária, com outro valor), a Mia da equipe do Farol e freela na Aurora, a Cora ligada sem
 * trabalho e o Nilo sem vínculo nenhum. Sessões como o login daria: os freelas na conta deles, sem o Maestro.
 */
export async function sementeDaAreaDoFreela() {
  const { getBanco, schema } = await import("../src/lib/db/client");
  const { sql: q } = await import("drizzle-orm");
  const { criarSessao } = await import("../src/lib/auth/sessao");
  const { hojeBr, somarDias } = await import("../src/lib/dinheiro");
  const hoje = hojeBr();
  const amanha = somarDias(hoje, 1);
  const semana = somarDias(hoje, 6);
  const passado = somarDias(hoje, -12);
  const SUB = {
    farol: "00000000-0000-4000-8000-0000000002a2",
    aurora: "00000000-0000-4000-8000-0000000002b2",
    alice: "00000000-0000-4000-8000-0000000002c2",
    bruno: "00000000-0000-4000-8000-0000000002d2",
    mia: "00000000-0000-4000-8000-0000000002e2",
    cora: "00000000-0000-4000-8000-0000000002f2",
    nilo: "00000000-0000-4000-8000-000000000302",
  };
  const r = await getBanco().asSystem("e2e: semente da área do freela", async (tx) => {
    const um = async (x: ReturnType<typeof q>) => ((await tx.execute(x)) as unknown as { id: string }[])[0].id;
    const org = async (zro: string, nome: string, produtos: string[]) =>
      (await tx.insert(schema.organizations).values({ zroOrgId: zro, name: nome, zroProducts: produtos }).returning({ id: schema.organizations.id }))[0].id;
    const farol = await org("00000000-0000-4000-8000-0000000002a1", "Estúdio Farol", ["maestro"]);
    const aurora = await org("00000000-0000-4000-8000-0000000002b1", "Casa Aurora", ["maestro"]);
    // a conta pessoal de cada freela no HUB (sem o Maestro)
    const pessoal: Record<string, string> = {};
    for (const [k, n] of [
      ["alice", "c1"],
      ["bruno", "d1"],
      ["cora", "f1"],
      ["nilo", "301"],
    ] as const)
      pessoal[k] = await org(`00000000-0000-4000-8000-000000000${n.padStart(3, "2")}`, `Conta de ${k}`, []);
    await tx.insert(schema.members).values([
      { orgId: farol, zroSub: SUB.farol, displayName: "Fábio Produção", hubRole: "owner", role: "admin" },
      { orgId: farol, zroSub: SUB.mia, displayName: "Mia Equipe", hubRole: "editor", role: "equipe" },
      { orgId: aurora, zroSub: SUB.aurora, displayName: "Aurélia", hubRole: "owner", role: "admin" },
      { orgId: pessoal.alice, zroSub: SUB.alice, displayName: "Alice Freela", hubRole: "owner", role: "admin" },
      { orgId: pessoal.bruno, zroSub: SUB.bruno, displayName: "Bruno Freela", hubRole: "owner", role: "admin" },
      { orgId: pessoal.cora, zroSub: SUB.cora, displayName: "Cora Freela", hubRole: "owner", role: "admin" },
      { orgId: pessoal.nilo, zroSub: SUB.nilo, displayName: "Nilo Sem Vínculo", hubRole: "owner", role: "admin" },
    ]);
    await tx.execute(
      q`insert into maestro.org_marca (org_id, nome, cor, telefone, email) values (${farol}, 'Estúdio Farol', '#0f7b5f', '11 98888-7777', 'producao@farol.exemplo')`,
    );
    await tx.execute(q`insert into maestro.org_marca (org_id, nome, cor, email) values (${aurora}, 'Casa Aurora', '#9a62b8', 'oi@aurora.exemplo')`);
    // A Aurora não mostra o cliente ao freela.
    await tx.execute(
      q`update maestro.organizations set settings = jsonb_build_object('empresa', jsonb_build_object('freelaVeCliente', false)) where id = ${aurora}`,
    );
    const freela = (o: string, nome: string, sub: string) =>
      um(
        q`insert into maestro.freelas (org_id, nome, zro_sub, notas, funcoes) values (${o}, ${nome}, ${sub}, 'NOTA INTERNA do freela', '{captacao-camera}') returning id`,
      );
    const aliceF = await freela(farol, "Alice Ramos", SUB.alice);
    const brunoF = await freela(farol, "Bruno Lima", SUB.bruno);
    const aliceA = await freela(aurora, "Alice Ramos", SUB.alice);
    const miaA = await freela(aurora, "Mia Costa", SUB.mia);
    await freela(farol, "Cora Dias", SUB.cora);
    const cliente = await um(q`insert into maestro.clients (org_id, name, document) values (${farol}, 'Café Aurora', '12.345.678/0001-90') returning id`);
    const clienteA = await um(q`insert into maestro.clients (org_id, name) values (${aurora}, 'Cliente Escondido') returning id`);
    const projeto = await um(
      q`insert into maestro.projects (org_id, code, title, client_id, briefing, value_cents) values (${farol}, 'MAE-2026-001', 'Filme do café', ${cliente}, 'BRIEFING INTERNO', 9900000) returning id`,
    );
    const projetoA = await um(
      q`insert into maestro.projects (org_id, code, title, client_id) values (${aurora}, 'MAE-2026-001', 'Série Aurora', ${clienteA}) returning id`,
    );
    const diaria = await um(
      q`insert into maestro.eventos (org_id, projeto_id, tipo, titulo, data, data_fim, hora_ini, hora_fim, local, notas)
        values (${farol}, ${projeto}, 'diaria', 'Diária na cafeteria', ${amanha}, ${somarDias(amanha, 1)}, '08:00', '18:30', 'Rua Augusta, 1200, São Paulo', 'NOTA INTERNA do evento') returning id`,
    );
    const escala = (o: string, p: string | null, ev: string | null, f: string, ini: string, fim: string, diariaCents: number | null, valor: number) =>
      um(q`insert into maestro.escalas (org_id, projeto_id, evento_id, freela_id, funcao, inicio, fim, dias, diaria_cents, valor_cents, notas)
           values (${o}, ${p}, ${ev}, ${f}, 'captacao-camera', ${ini}, ${fim}, ${diariaCents ? 2 : 1}, ${diariaCents}, ${valor}, 'NOTA INTERNA da escala') returning id`);
    const aliceDiaria = await escala(farol, projeto, diaria, aliceF, amanha, somarDias(amanha, 1), 60000, 120000);
    await tx.execute(
      q`update maestro.escalas set para_freela = 'Chegar 7h30. Figurino preto, sem logo.', entrega_url = 'https://drive.google.com/drive/folders/farol-entrega' where id = ${aliceDiaria}`,
    );
    const brunoDiaria = await escala(farol, projeto, diaria, brunoF, amanha, somarDias(amanha, 1), 77700, 155400);
    const alicePassada = await escala(farol, projeto, null, aliceF, passado, passado, null, 45000);
    await tx.execute(q`update maestro.lancamentos set pago_cents = valor_cents, pago_em = current_date where escala_id = ${alicePassada}`);
    const aliceAurora = await escala(aurora, projetoA, null, aliceA, semana, semana, null, 80000);
    await escala(aurora, projetoA, null, miaA, semana, semana, null, 50000);
    return { farol, aurora, pessoal, projeto, aliceDiaria, brunoDiaria, aliceAurora };
  });
  const sessao = async (orgId: string, sub: string, maestro: boolean) =>
    (
      await criarSessao({
        orgId,
        sub,
        produtos: maestro ? ["maestro"] : [],
        release: { maestro: maestro ? "allowed" : "closed" },
        tokens: null,
      })
    ).token;
  return {
    alice: await sessao(r.pessoal.alice, SUB.alice, false),
    bruno: await sessao(r.pessoal.bruno, SUB.bruno, false),
    cora: await sessao(r.pessoal.cora, SUB.cora, false),
    nilo: await sessao(r.pessoal.nilo, SUB.nilo, false),
    mia: await sessao(r.farol, SUB.mia, true),
    farol: await sessao(r.farol, SUB.farol, true),
    projeto: r.projeto,
    aliceDiaria: r.aliceDiaria,
    brunoDiaria: r.brunoDiaria,
    aliceAurora: r.aliceAurora,
  };
}
