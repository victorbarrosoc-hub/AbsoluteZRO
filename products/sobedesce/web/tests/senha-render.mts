/**
 * Renderiza o campo de senha (componente de cliente) fora da condição react-server dos testes e imprime o HTML.
 * Usado por senha.test.mts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InputSenha } from "../src/components/ui/senha";

process.stdout.write(renderToStaticMarkup(createElement(InputSenha, { id: "senha", name: "senha", autoComplete: "current-password", required: true })));
