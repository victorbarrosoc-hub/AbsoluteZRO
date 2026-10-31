/**
 * Renderiza a tela "Agora sua conta é Absolute ZRO" fora da condição react-server dos testes e imprime o HTML.
 * Argumentos: <volta> <erro|-> <temDrive 1|0> [<email da outra conta>]. Usado por zro-ligar.test.mts e
 * zro-outra-conta.test.mts.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LigarZro } from "../src/components/conta/ligar-zro";

const [volta = "/conta", erro = "-", temDrive = "1", email] = process.argv.slice(2);
const outra = email ? { email } : null;
process.stdout.write(renderToStaticMarkup(createElement(LigarZro, { volta, erro: erro === "-" ? undefined : erro, temDrive: temDrive === "1", outra })));
