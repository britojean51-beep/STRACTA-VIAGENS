# Conectar o app STRACTA à sua planilha do Google Sheets

Você faz isto **uma única vez** (uns 5 minutos). Depois é automático.

## Passo 1 — Abrir o editor de script
1. Abra sua planilha no **Google Sheets**.
2. Menu **Extensões** → **Apps Script**.
3. Vai abrir uma aba nova com um arquivo `Código.gs` (ou `Code.gs`).

## Passo 2 — Colar o script
1. Apague tudo que estiver nesse arquivo.
2. Copie **todo** o conteúdo do arquivo `Codigo.gs` (desta pasta) e cole ali.
3. Clique no ícone **💾 Salvar** (ou Ctrl+S).

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
3. No app STRACTA: **Painel** → seção **☁️ Planilha na nuvem** → cole a URL no campo → **Salvar**.
4. Toque em **Testar conexão** — deve aparecer o nome da sua planilha. ✅
5. Toque em **Sincronizar tudo** — envia toda a base atual para a planilha.

Pronto! A partir daí, cada lançamento no app sobe sozinho para a planilha.

---

## Como funciona (resumo)
- O **app é a fonte da verdade**. Cada lançamento tem um código oculto (`_id`).
- Salvar/editar no app → **atualiza a mesma linha** na planilha (não duplica).
- Excluir no app → **limpa a linha** correspondente.
- As colunas de fórmula (**Horas, L/h, L/Ton**) continuam calculando sozinhas — o script nunca mexe nelas.
- O script cria sozinho as colunas extras que faltarem: **KM, Combustível, ARLA (L), Situação** e a coluna oculta **_id**.

## Se precisar atualizar o script depois
Cole a versão nova, salve e faça **Implantar → Gerenciar implantações → ✏️ (editar) → Nova versão → Implantar**.
Assim a **mesma URL** continua valendo (não precisa trocar no app).
