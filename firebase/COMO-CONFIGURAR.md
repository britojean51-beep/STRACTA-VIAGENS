# Ligar o login do app (Firebase) — passo a passo

Você faz isto **uma vez**. Enquanto não terminar, o app continua funcionando
normalmente **sem login** — nada para de funcionar no meio do caminho.

> 💡 No celular, se a tela do Firebase ficar estranha, ative
> **"Versão para computador"** no menu (⋮) do navegador.

## Passo 1 — Criar o projeto
1. Acesse **console.firebase.google.com** e entre com sua conta Google.
2. **Adicionar projeto** → nome: **GP2T-Gestaodefrota** → Continuar.
3. Pode **desativar** o Google Analytics (não precisamos) → Criar projeto.

## Passo 2 — Ligar o login por e-mail e senha
1. No menu lateral: **Criação → Authentication** → **Vamos começar**.
2. Aba **Sign-in method** → **E-mail/senha** → **Ativar** → **Salvar**.

## Passo 3 — Criar o banco (só para a lista de quem pode entrar)
1. Menu: **Criação → Firestore Database** → **Criar banco de dados**.
2. Escolha **Modo de produção** → local `southamerica-east1` (São Paulo) → Ativar.
3. Abra a aba **Regras**, apague tudo, cole o conteúdo do arquivo
   **`regras-firestore.txt`** (desta pasta) e clique em **Publicar**.

## Passo 4 — Pegar a configuração do app
1. Clique na **engrenagem ⚙️ → Configurações do projeto**.
2. Role até **Seus apps** → clique no ícone **`</>`** (Web).
3. Apelido: **GP2T** → **Registrar app**.
4. Vai aparecer um bloco parecido com este:

```js
const firebaseConfig = {
  apiKey: "AIza........",
  authDomain: "gp2t-gestaodefrota.firebaseapp.com",
  projectId: "gp2t-gestaodefrota",
  storageBucket: "gp2t-gestaodefrota.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxx"
};
```

5. **Copie esse bloco inteiro e me mande** — eu coloco no app.

## Passo 5 — Criar o seu usuário
> 💡 **Ninguém precisa ter e-mail.** O Firebase só exige um identificador em
> formato de e-mail — usamos um endereço **interno**, que não existe de verdade:
> `nome@gp2t.local`. Na tela de login a pessoa digita **só o nome**.

1. Volte em **Authentication → Users → Adicionar usuário**.
2. No campo de e-mail digite **`jean@gp2t.local`** (troque "jean" pelo nome que
   você quiser usar) e crie uma **senha** (mínimo 6 caracteres) → Adicionar.
3. Me avise qual nome você usou: eu já deixo você liberado como **Gestor**.

Pronto! Depois disso o app pede login (você digita só **jean** + senha), e você
libera as outras pessoas direto pelo app, em **Início → Usuários**.

---

## Como funciona depois de ligado

**Dois perfis:**
- 🧑‍💼 **Gestor** — acesso total (Painel, Relatórios, Frota, Manutenção, Usuários).
- 👷 **Operador** — só **Abastecimento** e **Viagens** (lançar no dia a dia).

**Para liberar alguém novo (ex.: o Saulo):**
1. Firebase → **Authentication → Users → Adicionar usuário** →
   e-mail: **`saulo@gp2t.local`** + uma senha.
2. No app → **Início → Usuários** → digite só **`saulo`**, escolha o perfil →
   **Liberar acesso**.
3. Entregue para a pessoa apenas: **usuário `saulo`** e a **senha**.

**Para bloquear alguém:** app → **Usuários** → botão **✕** na linha da pessoa.

**Para trocar a senha de alguém** (não existe "esqueci minha senha", porque não há
e-mail de verdade): Firebase → **Authentication → Users** → os três pontinhos **⋮**
na linha da pessoa → **Redefinir senha** (ou apague e crie de novo com a senha nova).

## Quando o app precisa de internet?

| Situação | Precisa de internet? |
|---|---|
| **Primeiro login** de cada pessoa em cada celular | **Sim**, uma única vez |
| Usar o app no dia a dia (lançar, ver relatório) | Não |
| **Celular desligou / reiniciou** | **Não** — a sessão fica gravada no aparelho |
| Celular reiniciou com **sinal fraco** | Não — o app entra com o acesso salvo |
| Depois de tocar em **"Sair"** | Sim — sair apaga o acesso salvo de propósito |
| Depois de **limpar os dados** do app | Sim |

### O botão "Sair" fica escondido

A equipe **não vê** nenhum botão de sair — assim ninguém se tranca fora do app
por engano. Para trocar de usuário num celular (só você precisa saber):

> Na tela **Início**, toque **5 vezes seguidas** em "versão ..." lá embaixo.
> Abre a **Área do desenvolvedor** com o botão "Trocar usuário (sair)".
> Ele pede confirmação e avisa que será preciso internet para entrar de novo.

Sair **nunca apaga os lançamentos** — só encerra o acesso salvo naquele aparelho.

### ⚠️ O que ainda pode apagar os dados

"**Limpar dados/armazenamento**" nas configurações do **celular** (não é do app —
é do Android/iPhone) apaga tudo que o app guardou: o acesso salvo **e os
lançamentos que ainda não subiram** para a planilha. Isso está fora do alcance do
app — nenhum aplicativo consegue bloquear essa opção do sistema.

Como se proteger:
- Mantenha a **sincronização com a planilha ligada**: o que já subiu está seguro
  na nuvem, mesmo que o celular seja limpo ou perdido.
- Oriente a equipe: "limpar **cache**" é seguro; "limpar **dados**" nunca.
- Se quiser, dá para eu criar um **backup manual** (botão que gera um arquivo com
  tudo) — é só pedir.

**Segurança:** a configuração do Passo 4 é pública por natureza — todo site que
usa Firebase mostra esses dados. Quem protege de verdade são a **senha de cada um**
e as **regras** do Passo 3, que só deixam entrar quem você liberou.
