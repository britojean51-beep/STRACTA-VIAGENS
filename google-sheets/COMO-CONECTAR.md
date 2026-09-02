# Conectar o app STRACTA à sua planilha do Google Sheets

Você faz isto **uma única vez** (uns 5 minutos). Depois é automático.

## Passo 1 — Abrir o editor de script

**No computador (planilha tem o menu Extensões):**
1. Abra sua planilha no **Google Sheets**.
2. Menu **Extensões** → **Apps Script**.
3. Vai abrir uma aba nova com um arquivo `Código.gs`.

**No celular (a planilha NÃO mostra "Extensões"):**
1. Abra o navegador e vá em **script.google.com**.
   *(Se a página aparecer estranha no celular, ative "Versão para computador" / "Desktop site" no menu do navegador.)*
2. Toque em **Novo projeto**.
3. Já vem um arquivo `Código.gs` em branco.

## Passo 2 — Colar o script
1. Apague tudo que estiver no arquivo `Código.gs`.
2. Copie **todo** o conteúdo do arquivo `Codigo.gs` (que recebeu) e cole ali.
3. **📌 IMPORTANTE (só no caminho do celular / script avulso):** na linha do topo
   `var PLANILHA_URL = "";` cole o **link da sua planilha** entre as aspas. Ex.:
   `var PLANILHA_URL = "https://docs.google.com/spreadsheets/d/ABC123.../edit";`
   *(Se você colou dentro da própria planilha pelo menu Extensões, deixe `""`.)*
4. Toque em **💾 Salvar**.

## Passo 3 — Publicar como App da Web
1. Botão azul **Implantar** (canto superior direito) → **Nova implantação**.
2. Clique na engrenagem ⚙️ ao lado de "Selecionar tipo" → escolha **App da Web**.
3. Preencha:
   - **Descrição:** STRACTA
   - **Executar como:** *Eu (seu e-mail)*
   - **Quem tem acesso:** **Qualquer pessoa**
4. Clique **Implantar**.
5. Vai pedir para **autorizar**: clique em **Autorizar acesso**, escolha sua conta Google,
   e se aparecer "Google não verificou este app", clique em **Avançado → Acessar (não seguro)**
   e depois **Permitir**. (É seguro: o app é seu, feito por você.)

## Passo 4 — Copiar o link e colar no app
1. No fim vai aparecer uma **URL do app da Web** terminando em **`/exec`**.
   Ex.: `https://script.google.com/macros/s/AKfycb...../exec`
2. **Copie** essa URL.
3. No app: **Início → ⚙️ Configurações** → seção **☁️ Planilha na nuvem** → cole a URL → **Salvar**.
   *(O app já vem com o link da planilha do GP2T embutido; isso só é preciso se você trocar de planilha.)*
4. Toque em **Testar conexão** — deve aparecer o nome da sua planilha. ✅
5. Toque em **Sincronizar tudo** — envia toda a base atual para a planilha.

Pronto! A partir daí, cada lançamento no app sobe sozinho para a planilha.

---

## O que a planilha tem (9 abas, criadas sozinhas)

**Quem calcula é o app.** A planilha não tem nenhuma fórmula: ela recebe os números
já prontos, do mesmo jeito que aparecem no Painel.

**Abas de lançamento (o dia a dia, linha por linha)**
| Aba | O que guarda |
|---|---|
| `Abastecimentos` | Data, equipamento, operador, horímetro, **horas**, litros, combustível, ARLA, KM, **média**, toneladas, **L/Ton**, situação |
| `Viagens` | Data, equipamento, operador, origem, destino, viagens, material, peso por viagem e peso total |
| `Manutenções` | Data, equipamento, responsável, tipo, serviço, peças, próxima manutenção |
| `Equipamentos` / `Operadores` | Os cadastros do app |

**Abas de resumo (uma linha por dia — para acompanhar)**
| Aba | O que mostra |
|---|---|
| `Resumo por Dia` | Equipamentos, operadores, **consumo total, horas totais, L/h, produção (t), L/Ton**, diesel S-10/S-500, ARLA, KM, média km/L, viagens, manutenções |
| `Resumo por Equipamento` | Os mesmos números, **um por equipamento** naquele dia |
| `Resumo por Operador` | Os mesmos números, **um por operador** naquele dia |
| `Resumo por Mês` | O mês fechado: uma linha por mês, com os mesmos números somados e as médias recalculadas pelos totais |

## Como funciona (resumo)
- O **app é a fonte da verdade**. Cada lançamento tem um código oculto (`_id`).
- Salvar/editar no app → **atualiza a mesma linha** na planilha (não duplica).
- Excluir no app → **limpa a linha** correspondente.
- Nas abas de resumo, quando algo muda no dia o app **regrava aquele dia inteiro** —
  então nunca sobra número velho. A linha do mês também é recalculada na hora.
- Sem internet, os envios ficam guardados no celular e sobem sozinhos quando a rede voltar.

## Se precisar atualizar o script depois
Cole a versão nova, salve e faça **Implantar → Gerenciar implantações → ✏️ (editar) → Nova versão → Implantar**.
Assim a **mesma URL** continua valendo (não precisa trocar no app).
Depois, no app: **Configurações → Sincronizar tudo** (cria as abas que faltarem e preenche o histórico).

## Abas antigas (da planilha com fórmulas)
Agora que o app manda tudo calculado, estas abas não servem mais e podem ser **apagadas**:
`Lançamento Diário`, `Resumo Diário`, `Resumo Semanal`, `Resumo Mensal`,
`Hist. Operadores`, `Hist. Equipamentos`, `Hist. Lançamentos`.

O antigo `Resumo Mensal` (de fórmula) foi substituído pela aba `Resumo por Mês`,
que o app preenche sozinho.
