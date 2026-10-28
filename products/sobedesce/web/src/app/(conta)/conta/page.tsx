import type { Metadata } from "next";
import { Aviso } from "@/components/conta/aviso";
import { BotaoGoogle } from "@/components/conta/google";
import { BotaoZro, LogoZro } from "@/components/conta/zro";
import { mensagemDeErro } from "@/components/conta/mensagens";
import { Moldura } from "@/components/conta/moldura";
import { Linha, Linhas, Passo } from "@/components/kit/kit";
import { Cloud, Laptop, LockKeyhole, Trash2, UserRound } from "lucide-react";
import { exigirUsuario } from "@/lib/auth/atual";
import { listarDispositivos } from "@/lib/auth/sessao";
import { NoComputador } from "@/components/conta/no-computador";
import { InicioConta } from "@/components/conta/inicio";
import { MenuConta } from "@/components/conta/menu";
import { AbasConta } from "@/components/conta/abas";
import { contaComSenha } from "@/lib/auth/contas";
import { linksLigados } from "@/lib/auth/encerrar";
import { ehAdmin } from "@/lib/admin";
import { podeUsar } from "@/lib/recursos";
import { listarComputadores } from "@/lib/acompanhar/status";
import { macsParaAtualizar } from "@/lib/atualizar-mac";
import { DOWNLOAD_MAC } from "@/lib/site";
import { googleDeEntrar, listarContas } from "@/lib/google/contas";
import { zroConfigurado } from "@/lib/zro/config";
import { contaZroDe } from "@/lib/zro/contas";
import { NOME_PLATAFORMA, tempoRelativo } from "@/lib/tempo";
import { Computadores } from "./computadores";
import { Drives } from "./drives";
import { FormDesligarZro, FormNome, FormPrimeiraSenha, FormSenha } from "./forms";
import { ApagarConta } from "./apagar";
import { BotaoSair } from "./sair";
import { SemAcessoZro } from "../sem-acesso";

export const metadata: Metadata = { title: "Sua conta" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Conta({ searchParams }: Props) {
  const { usuario, liberado } = await exigirUsuario("/conta");
  if (!liberado) return <SemAcessoZro volta="/conta" />;
  const q = await searchParams;
  const [contas, dispositivos, temSenha, admin, referencias, computadores, links, entrar, macs, zro] = await Promise.all([
    listarContas(usuario.id),
    listarDispositivos(usuario.id),
    contaComSenha(usuario.id),
    ehAdmin(usuario),
    podeUsar(usuario, "referencias"),
    listarComputadores(usuario.id),
    linksLigados(usuario.id),
    googleDeEntrar(usuario.id),
    macsParaAtualizar(usuario.id),
    contaZroDe(usuario.id),
  ]);
  const erro = typeof q.erro === "string" ? q.erro : undefined;
  const conectou = q.google === "ok";
  const primeiroNome = usuario.nome.split(" ")[0];
  const drivesOk = contas.filter((c) => c.estado === "ok").length;

  return (
    <Moldura larga abas={<AbasConta atual="conta" />} titulo={`Olá, ${primeiroNome}`} acao={<MenuConta admin={admin} sair={false} />}>
      {q.aviso === "nao-fui-eu" ? (
        // "Não fui eu" dos e-mails de aviso: o passo a passo para tirar da conta quem não devia estar nela.
        <Aviso tom="erro" className="mb-10">
          <p>
            <strong className="font-semibold">Não foi você? Faça agora, nesta ordem:</strong>
          </p>
          <ol className="grid list-decimal gap-1 pl-5">
            <li>
              {temSenha ? (
                <>
                  <a href="#senha" className="font-medium underline underline-offset-2">
                    Troque a senha
                  </a>
                  . Isso encerra tudo: os outros aparelhos e os computadores saem da conta, e a chave do Atalho e os avisos no celular são desligados.
                </>
              ) : (
                <>
                  <a href="#senha" className="font-medium underline underline-offset-2">
                    Crie uma senha
                  </a>{" "}
                  pelo link que vai para o seu e-mail. Ao salvar, os outros aparelhos e os computadores saem da conta.
                </>
              )}
            </li>
            <li>
              Confira os{" "}
              <a href="#computadores" className="font-medium underline underline-offset-2">
                computadores
              </a>
              .
            </li>
          </ol>
          <p>Se a mesma senha serve em outro site, troque lá também.</p>
        </Aviso>
      ) : conectou ? (
        <Aviso tom="ok" className="mb-10">
          <p>Google Drive conectado.</p>
        </Aviso>
      ) : q.zro === "ok" ? (
        <Aviso tom="ok" className="mb-10">
          <p>Conta Absolute ZRO ligada. Agora você entra pela Absolute ZRO. Para enviar ao Drive, conecte o Google Drive aqui embaixo.</p>
        </Aviso>
      ) : q.senha === "nova" ? (
        <Aviso tom="ok" className="mb-10">
          <p>Senha nova salva. Os outros aparelhos e os computadores saíram da conta, e a chave do Atalho foi desligada.</p>
          {links ? <p>{links === 1 ? "O link pra IA continua ligado" : `Os ${links} links pra IA continuam ligados`}: se não foi você que ligou, desligue na coleção.</p> : null}
        </Aviso>
      ) : mensagemDeErro(erro) ? (
        <Aviso tom={erro === "google_recusado" || erro === "zro_recusado" ? "info" : "erro"} className="mb-10">
          <p>{mensagemDeErro(erro)}</p>
        </Aviso>
      ) : null}

      {macs.length ? (
        // Até o build 299 o Atualizar do Mac podia travar (lib/atualizar-mac.ts): só o instalador resolve, uma vez.
        <Aviso tom="info" className="mb-6">
          <p>
            <strong className="font-semibold">{macs.length === 1 ? `Atualize o app no ${macs[0]} à mão, uma vez só.` : "Atualize o app nos seus Macs à mão, uma vez só."}</strong> O botão
            Atualizar pode dar erro nessa versão. Baixe, abra o arquivo e arraste o SOBEDESCE para Aplicativos, escolhendo Substituir. Depois, as próximas
            versões chegam sozinhas.
          </p>
          <p>
            <a href={DOWNLOAD_MAC} className="font-medium underline underline-offset-2">
              Baixar para Mac
            </a>
          </p>
        </Aviso>
      ) : null}

      <InicioConta
        drivesOk={drivesOk}
        drivesProblema={contas.length - drivesOk}
        computadores={dispositivos.length}
        andamento={computadores}
        referencias={referencias && drivesOk > 0}
      />

      <div className="mb-6 grid gap-1 border-t border-line pt-10">
        <h2 className="font-display text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">Ajustes da conta</h2>
        <p className="text-[15px] text-ink-2">Os Drives, os computadores, os seus dados e a senha.</p>
      </div>

      {/* Desktop largo: Drives e computadores na esquerda, dados e senha na direita. No celular, uma coluna. */}
      <div className="grid items-start gap-4 xl:grid-cols-2 xl:gap-x-6">
        <div className="grid gap-4">
          <Passo
            id="drives"
            icone={<Cloud />}
            tom="down"
            i={1}
            titulo="Google Drive"
            frase="As contas do Google que a SOBEDESCE usa para enviar e baixar."
            acao={contas.length ? <span className="text-[13px] font-medium text-ink-3 tabular-nums">{contas.length}</span> : null}
          >
            <Drives contas={contas} entrar={entrar} />
            <div>
              <BotaoGoogle modo="vincular" variant={contas.length ? "secondary" : "primary"} size="md" className="w-full sm:w-auto">
                {contas.length ? "Conectar outro Google Drive" : "Conectar Google Drive"}
              </BotaoGoogle>
            </div>
            <p className="text-[13px] leading-relaxed text-pretty text-ink-3">
              Na primeira vez, o Google avisa que ainda não verificou a SOBEDESCE. Toque em Avançado e depois em Acessar SOBEDESCE para continuar.
            </p>
          </Passo>

          <Passo
            id="computadores"
            icone={<Laptop />}
            tom="ok"
            i={2}
            titulo="Computadores"
            frase="O app SOBEDESCE do computador entra na sua conta e usa os mesmos Drives."
            acao={dispositivos.length ? <span className="text-[13px] font-medium text-ink-3 tabular-nums">{dispositivos.length}</span> : null}
          >
            {dispositivos.length ? null : (
              <div id="instalar" className="scroll-mt-24 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line ring-inset">
                <NoComputador />
              </div>
            )}
            <Computadores
              itens={dispositivos.map((d) => ({
                id: d.id,
                nome: d.nome ?? "Computador",
                detalhe: [d.plataforma ? NOME_PLATAFORMA[d.plataforma] : null, `usado ${tempoRelativo(d.ultimoUsoEm)}`].filter(Boolean).join(" · "),
                plataforma: d.plataforma,
              }))}
            />
          </Passo>
        </div>

        <div className="grid gap-4">
          {zro || zroConfigurado() ? (
            <Passo
              id="absolute-zro"
              icone={<LogoZro className="size-5!" />}
              tom="neutro"
              i={1}
              titulo="Absolute ZRO"
              frase="Uma conta para entrar em todas as ferramentas da Absolute ZRO. O Google Drive continua conectado aqui, à parte."
            >
              {zro ? (
                <>
                  <Linhas>
                    <Linha titulo="Ligada a" sub={<span className="[overflow-wrap:anywhere]">{zro.email}</span>} />
                    {zro.organizacao ? <Linha titulo="Organização" sub={zro.organizacao} /> : null}
                  </Linhas>
                  <FormDesligarZro />
                </>
              ) : (
                <div>
                  <BotaoZro modo="vincular" size="md" className="w-full sm:w-auto">
                    Ligar conta Absolute ZRO
                  </BotaoZro>
                </div>
              )}
            </Passo>
          ) : null}

          <Passo id="dados" icone={<UserRound />} tom="neutro" i={2} titulo="Dados da conta">
            <FormNome nome={usuario.nome} />
            <Linhas>
              <Linha titulo="E-mail" sub={<span className="[overflow-wrap:anywhere]">{usuario.email}</span>} />
            </Linhas>
          </Passo>

          <Passo
            id="senha"
            icone={<LockKeyhole />}
            tom="warn"
            i={3}
            titulo="Senha"
            frase={
              temSenha
                ? "Ao trocar, os outros aparelhos e os computadores saem da conta, e a chave do Atalho e os avisos no celular são desligados."
                : "Você entra com o Google. Se quiser, crie uma senha para entrar também com o e-mail."
            }
          >
            {temSenha ? <FormSenha links={links} /> : <FormPrimeiraSenha email={usuario.email} />}
          </Passo>

          <div className="flex justify-center py-4">
            <BotaoSair />
          </div>

          <Passo
            id="apagar"
            icone={<Trash2 />}
            tom="err"
            i={4}
            titulo="Apagar a conta"
            frase="Some tudo da SOBEDESCE na hora: a conta, os Drives conectados e os computadores. Os arquivos no Google Drive continuam lá."
            className="ring-err/25"
          >
            <ApagarConta email={usuario.email} temSenha={temSenha} />
          </Passo>
        </div>
      </div>
    </Moldura>
  );
}
