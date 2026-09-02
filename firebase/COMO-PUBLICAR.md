# Publicar o app em `gp2t-gestaodefrota.web.app`

Hoje o app abre em `britojean51-beep.github.io/STRACTA-VIAGENS/`. No GitHub Pages o endereço
**sempre** começa com o nome de usuário. Publicando no **Firebase Hosting** — o mesmo projeto que já
faz o login — o app passa a abrir em:

**https://gp2t-gestaodefrota.web.app**

O login funciona nesse endereço sem configurar nada (o Firebase já autoriza o próprio domínio).
Depois de pronto, **toda atualização vai sozinha**: é só o código ser enviado que o site se atualiza.

---

## Parte 1 — configurar (uma vez só, pelo celular)

### 1. Ligar o Hosting
Firebase → menu → **Hosting** → **Começar**. Pode avançar as telas e sair; é só para o site existir.

### 2. Gerar a chave
Firebase → ⚙️ **Configurações do projeto** → aba **Contas de serviço** →
**Gerar nova chave privada** → **Gerar chave**. Baixa um arquivo `.json`.
Esse arquivo é uma senha: não mande para ninguém.

### 3. Dar permissão de publicar para essa chave
Ainda em **Contas de serviço**, toque em **Gerenciar permissões da conta de serviço**
(abre o Google Cloud; se ficar ruim de ver, ative "Versão para computador" no navegador).
1. Ache a linha `firebase-adminsdk-…@gp2t-gestaodefrota.iam.gserviceaccount.com`
2. Toque no lápis ✏️ → **Adicionar outro papel**
3. Escolha **Administrador do Firebase Hosting** (*Firebase Hosting Admin*) → **Salvar**

> Sem este passo a publicação falha com erro de permissão. É o tropeço mais comum.

### 4. Guardar a chave no GitHub
GitHub → repositório **STRACTA-VIAGENS** → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**:
- **Name:** `FIREBASE_SERVICE_ACCOUNT_GP2T`
- **Secret:** abra o arquivo `.json` baixado e cole **todo o conteúdo** (começa com `{` e termina com `}`)

### 5. Publicar
GitHub → aba **Actions** → fluxo **Publicar** → **Run workflow**.
Quando ficar verde ✅, abra **https://gp2t-gestaodefrota.web.app**.

Daí em diante não precisa fazer mais nada: cada envio de código publica sozinho.

---

## Parte 2 — trocar o app de endereço em cada celular

⚠️ **Importante:** os lançamentos ficam guardados **por endereço**. Abrindo o link novo, o app começa
vazio — os dados não vão junto sozinhos. Faça assim, celular por celular:

1. **No link antigo** (o de hoje): **⚙️ Configurações → 💾 Fazer backup** → salve o arquivo
   (Drive, WhatsApp para você mesmo, o que for mais fácil).
2. Abra **https://gp2t-gestaodefrota.web.app** e faça login.
3. **⚙️ Configurações → ⬆️ Restaurar backup** → escolha o arquivo → confirme.
   O app mostra quantos dias e lançamentos vieram antes de trocar qualquer coisa.
4. Menu do navegador → **Adicionar à tela inicial**.
5. Só agora **apague o atalho antigo**. Se ficar com os dois, cada um guarda seus próprios dados
   e um não enxerga o outro.

Em Configurações há uma linha mostrando **o endereço em que o app está aberto** — serve para saber
na hora se você está no app novo ou no antigo.

O link antigo continua funcionando; ele só deixa de ser usado quando todo mundo tiver mudado.

---

## O backup também serve para o dia a dia
Celular perdido, quebrado ou trocado: com o arquivo de backup, o app novo volta exatamente como
estava. Vale fazer um de vez em quando — e a planilha na nuvem continua sendo a segunda cópia de tudo.
