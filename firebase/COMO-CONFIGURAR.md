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
1. Volte em **Authentication → Users → Adicionar usuário**.
2. Coloque **seu e-mail** e uma **senha** (mínimo 6 caracteres) → Adicionar.
3. Me avise qual e-mail você usou: eu já deixo ele liberado como **Gestor**.

Pronto! Depois disso o app pede login, e você libera as outras pessoas
direto pelo app, em **Início → Usuários**.

---

## Como funciona depois de ligado

**Dois perfis:**
- 🧑‍💼 **Gestor** — acesso total (Painel, Relatórios, Frota, Manutenção, Usuários).
- 👷 **Operador** — só **Abastecimento** e **Viagens** (lançar no dia a dia).

**Para liberar alguém novo:**
1. Firebase → **Authentication → Users → Adicionar usuário** (e-mail + senha).
2. No app → **Início → Usuários** → digite o mesmo e-mail, escolha o perfil → **Liberar acesso**.
3. Entregue o e-mail e a senha para a pessoa.

**Para bloquear alguém:** app → **Usuários** → botão **✕** na linha da pessoa.

**Sem internet no campo:** quem já entrou uma vez continua usando normalmente
(o app guarda o acesso no aparelho). O primeiro login de cada pessoa precisa de internet.

**Segurança:** a configuração do Passo 4 é pública por natureza — todo site que
usa Firebase mostra esses dados. Quem protege de verdade são a **senha de cada um**
e as **regras** do Passo 3, que só deixam entrar quem você liberou.
