# Testes

Rodam num navegador de verdade (Playwright) contra um Firebase e uma planilha
simulados. **Ficam no repositório de propósito**: já se perderam uma vez quando
o contêiner de trabalho foi reiniciado, e a bateria inteira teve de ser
reescrita.

## Como rodar

```bash
# servir o app (na raiz do repositório)
python3 -m http.server 8130

# e então, nesta pasta
NODE_PATH=/opt/node22/lib/node_modules node smoke.js
NODE_PATH=/opt/node22/lib/node_modules node test40.js
NODE_PATH=/opt/node22/lib/node_modules node test41.js
node simgs.js "Solicitações"      # roda o Codigo.gs de verdade sobre o que o app mandou
```

## O que é cada arquivo

| Arquivo | Para quê |
|---|---|
| `fakefs.js` | Firestore de mentira, no Node. Dois "celulares" compartilham os mesmos dados, o que permite testar a sincronização. |
| `sdk2.js` | SDK do Firebase de mentira, na página: login, sessão que sobrevive ao reload, ouvintes por sondagem. |
| `fetchstub.js` | Intercepta o envio para a planilha e guarda o payload. |
| `simgs.js` | Roda o `google-sheets/Codigo.gs` **de verdade** fora do Google e imprime as abas. |
| `smoke.js` | Passa por todas as telas nos dois temas: erro de JavaScript e contraste. |
| `test40.js` | Solicitações de manutenção com foto (r47). |
| `test41.js` | A aba Solicitações na planilha (r47). |

## Contraste

O verificador lê o `fill` dos `<text>` de SVG, e não só o `color` do HTML — foi
por olhar apenas o `color` que os gráficos passaram um dia ilegíveis no tema
claro com o teste verde.

Os **botões coloridos com texto branco** (2,3 a 2,6:1, mínimo 4,5) saem numa
lista à parte: são escolha de identidade, vêm do primeiro dia e não são
regressão. Ficam visíveis em toda rodada em vez de escondidos.
