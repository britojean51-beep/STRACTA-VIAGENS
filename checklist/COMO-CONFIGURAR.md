# ✅ Checklist de Máquinas e Caminhões — como ligar

App para motoristas e operadores fazerem o checklist no celular, com **foto e vídeo**,
funcionando **sem sinal** no pátio. O gestor acompanha tudo no **Painel**.

**Endereço:** https://gestaofrotaapp.web.app/checklist/

Ele é publicado junto com o app de frota (mesmo projeto Firebase `gp2t-gestaodefrota`,
mesmo envio automático do GitHub). Nada precisa ser instalado: abre no navegador e dá
para **"Adicionar à tela inicial"** e usar como aplicativo.

---

## Onde fica cada coisa (e por que é seguro)

| O quê | Onde | Proteção |
|---|---|---|
| Site (o app) | Firebase Hosting (Google) | HTTPS sempre, servido pela rede de entrega do Google |
| Login | Firebase Authentication | senha guardada pelo Google; bloqueio automático contra tentativas em massa |
| Checklists, equipamentos, modelos, usuários | Firestore (`checklist_*`) | regras: só quem foi liberado lê e grava; o inspetor só vê o que ele mesmo fez |
| Fotos e vídeos | Firebase Storage (`checklist/…`) | regras: só liberados enviam/veem; só imagem e vídeo, até 60 MB; ninguém apaga pelo app |

Depois de enviado, o checklist **não pode ser alterado** pelo inspetor (só a marcação de
foto enviada). A foto leva **carimbo** com equipamento, data, hora e usuário.

---

## Configurar (uma vez só)

### 1. Ligar o Storage (fotos e vídeos)
Firebase → **Storage** → **Começar**.

> ⚠️ Desde 2024 o Google exige o plano **Blaze** (pago por uso) para usar o Storage.
> Mesmo no Blaze há uma **cota grátis** (por exemplo 5 GB guardados em região dos EUA).
> Uma foto do app tem ~100–300 KB; um vídeo de 30 s tem ~10–40 MB.
> **Recomendado:** em Google Cloud → Faturamento → **Orçamentos e alertas**, crie um
> alerta de R$ 50 para receber aviso por e-mail antes de qualquer surpresa.

### 2. Colar as regras do Firestore
Firebase → **Firestore Database** → **Regras** → apague tudo → cole o conteúdo de
[`regras.txt`](../regras.txt) (na raiz do repositório) → **Publicar**.

O arquivo é o mesmo do app de frota, com o bloco do checklist acrescentado — por isso
colar ele inteiro não estraga nada do que já funciona.

### 3. Colar as regras do Storage
Firebase → **Storage** → **Regras** → apague tudo → cole
[`regras-storage.txt`](regras-storage.txt) → **Publicar**.
Se aparecer um pedido para o Storage **acessar o Firestore**, aceite (é assim que ele
confere quem está liberado).

### 4. Primeiro acesso
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

## Vídeo
Até **60 segundos** (o navegador não consegue comprimir vídeo; o limite evita arquivos
enormes e conta alta no Storage).

## Endereço próprio (opcional)
Para ter um endereço só do checklist (ex.: `gp2t-checklist.web.app`):
Firebase → Hosting → **Adicionar outro site**, e então peça para incluir esse site no
`firebase.json` apontando para a pasta `checklist`. **Não** inclua antes de criar o site
no console: a publicação automática falharia para os dois apps.
