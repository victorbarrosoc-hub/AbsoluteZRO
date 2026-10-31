/**
 * Renderiza as opções de /entrar (components/conta/opcoes-entrar.tsx) fora da condição react-server e imprime o HTML.
 * O formulário de e-mail e senha (componente de cliente) entra como um marcador. Argumentos: <volta> [aberto 1|0].
 * Usado por zro-outra-conta.test.mts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpcoesEntrar } from "../src/components/conta/opcoes-entrar";

const [volta = "/conta", aberto = "0"] = process.argv.slice(2);
const formulario = createElement("form", { "data-formulario-senha": "" });
process.stdout.write(renderToStaticMarkup(createElement(OpcoesEntrar, { volta, formulario, abrirFormulario: aberto === "1" })));
