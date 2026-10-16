# ✅ Checklist de Máquinas e Caminhões — como ligar

App para motoristas e operadores fazerem o checklist no celular, com **foto** (e vídeo, quando ligar o Storage),
funcionando **sem sinal** no pátio. O gestor acompanha tudo no **Painel**.

**Endereço:** o seu próprio, por exemplo **https://gp2t-checklist.web.app** (passo 4 abaixo).

É um app **separado** do de frota: endereço próprio, ícone próprio, publicação própria.
Os operadores recebem só este link e só têm acesso ao checklist — mesmo que alguém
abra o app de frota e digite o usuário e a senha do checklist, ele recusa
("Acesso não liberado"), e as regras do Firestore também barram os dados da frota.
Os dois apps só dividem o projeto Firebase `gp2t-gestaodefrota` (a conta do Google),
o que permite ao gestor da frota administrar o checklist sem um segundo login.

Nada precisa ser instalado: abre no navegador e dá para **"Adicionar à tela inicial"**
e usar como aplicativo.

---

## Onde fica cada coisa (e por que é seguro)

| O quê | Onde | Proteção |
|---|---|---|
| Site (o app) | Firebase Hosting (Google) | HTTPS sempre, servido pela rede de entrega do Google |
| Login | Firebase Authentication | senha guardada pelo Google; bloqueio automático contra tentativas em massa |
| Checklists, equipamentos, modelos, usuários | Firestore (`checklist_*`) | regras: só quem foi liberado lê e grava; o inspetor só vê o que ele mesmo fez |
| Fotos | Firestore (`checklist_fotos`) | regras: só liberados enviam; o inspetor vê só as suas; só JPEG até 950 KB; só admin apaga |
| Vídeos *(quando ligar)* | Firebase Storage (`checklist/…`) | regras: só liberados enviam/veem; só imagem e vídeo, até 60 MB; ninguém apaga pelo app |

Depois de enviado, o checklist **não pode ser alterado** pelo inspetor (só a marcação de
foto enviada). A foto leva **carimbo** com equipamento, data, hora e usuário.

---

## Configurar (uma vez só)

### 1. Fotos: já funcionam, sem cartão
Hoje as fotos ficam no **Firestore** (`checklist_fotos`, uma foto por documento),
dentro do plano grátis. Cada foto tem ~100–200 KB. O Firestore grátis guarda 1 GB,
o que dá **umas 5 mil fotos**. O uso aparece em Firestore → **Uso**.

- Até **12 fotos** por checklist.
- **Sem vídeo** por enquanto: vídeo não cabe num documento do Firestore.

**Para ligar o vídeo depois** (plano Blaze):
1. Faça o upgrade, com um alerta de orçamento (ex.: R$ 50).
2. **Storage → Começar**, local **`US-CENTRAL1`** (só as regiões `US-` têm 5 GB grátis), modo de produção.
3. Cole as regras do passo 3.
4. Peça para trocar `USAR_STORAGE = false` para `true` em `checklist/js/midia.js`.
   Os checklists antigos continuam abrindo as fotos de onde estão.

### 2. Colar as regras do Firestore
Firebase → **Firestore Database** → **Regras** → apague tudo → cole o conteúdo de
[`regras.txt`](../regras.txt) (na raiz do repositório) → **Publicar**.

O arquivo é o mesmo do app de frota, com o bloco do checklist acrescentado — por isso
colar ele inteiro não estraga nada do que já funciona.

### 3. Colar as regras do Storage *(só quando ligar o vídeo)*
Firebase → **Storage** → **Regras** → apague tudo → cole
[`regras-storage.txt`](regras-storage.txt) → **Publicar**.
Se aparecer um pedido para o Storage **acessar o Firestore**, aceite (é assim que ele
confere quem está liberado).

### 4. Criar o endereço do checklist
1. Firebase → **Hosting** → **Adicionar outro site** → ID: `gp2t-checklist`
   (se já estiver em uso, escolha outro: só letras minúsculas, números e hífen).
2. Firebase → **Authentication** → **Configurações** → **Domínios autorizados** →
   **Adicionar** `gp2t-checklist.web.app` (o ID que você escolheu + `.web.app`).
3. GitHub → repositório → **Settings** → **Secrets and variables** → **Actions** →
   aba **Variables** → **New repository variable**:
   - **Name:** `CHECKLIST_SITE`
   - **Value:** `gp2t-checklist` (o mesmo ID)
4. GitHub → **Actions** → **Publicar Checklist** → **Run workflow**. Ficou verde ✅?
   Abra `https://gp2t-checklist.web.app`.

Daí em diante, cada mudança na pasta `checklist/` publica sozinha. A publicação é
**independente** da do app de frota: se uma falhar, a outra segue funcionando.
A chave usada é a mesma que o app de frota já usa (`FIREBASE_SERVICE_ACCOUNT_GP2T`).

### 5. Primeiro acesso
Quem é **gestor** no app de frota já entra no checklist como **administrador**.
Abra o endereço, entre com o mesmo usuário e senha e vá em:

1. **Cadastros → Equipamentos**: prefixo, placa e tipo (caminhão, máquina…)
2. **Cadastros → Usuários**: crie motoristas/operadores (usuário + senha inicial).
   Ninguém precisa ter e-mail: a pessoa digita só `joao.silva`.
3. **Cadastros → Modelos** *(opcional)*: os modelos de Caminhão e Máquina já vêm prontos.
   Para mudar itens ou marcar o que é **crítico**, toque em *Copiar modelos padrão* e edite.

Item **crítico** com defeito = equipamento **BLOQUEADO**. Defeito em item comum =
**LIBERADO COM RESTRIÇÃO**.

---

## Login rápido
- Entra **uma vez** e o app lembra — não pede senha de novo, nem sem sinal.
- O usuário digitado fica salvo; o celular pode guardar a senha (gerenciador de senhas).
- Bloquear alguém: **Cadastros → Usuários → bloquear** (vale na hora para tudo o que
  ele tentar enviar).

## Sem sinal
- Checklist, fotos e vídeos ficam guardados no celular e **sobem sozinhos** quando a
  rede volta. O topo mostra `sem sinal · 2` (2 arquivos esperando).
- Se fechar o app no meio do checklist, ele continua de onde parou.
- O **primeiro login** em cada celular precisa de internet.

## Vídeo (quando ligar o Storage)
Até **60 segundos** (o navegador não consegue comprimir vídeo; o limite evita arquivos
enormes e conta alta no Storage).
