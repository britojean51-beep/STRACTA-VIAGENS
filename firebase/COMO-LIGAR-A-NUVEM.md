# Ligar os dados na nuvem (Etapa 2)

Até agora cada celular guardava os lançamentos só nele. Com a nuvem ligada:

- o que o operador lança **aparece no seu Painel em segundos**;
- o horímetro/KM que o app preenche sozinho passa a ser o último **de toda a frota**,
  não o último daquele aparelho;
- trocar de celular deixa de exigir backup (ele continua existindo, como segurança);
- o tanque de diesel/ARLA desconta uma vez só, mesmo com vários celulares abastecendo junto;
- **sem internet nada trava**: o lançamento entra normalmente e sobe quando a rede voltar.

A planilha do Google continua funcionando exatamente como está.

---

## Passo 1 — publicar as regras (uma vez)
As regras dizem quem pode ler e escrever. Sem elas o Firebase bloqueia tudo.

1. Firebase → **Firestore Database** → aba **Regras**
2. Apague o que estiver lá e cole o conteúdo de **`firebase/regras-firestore.txt`**
3. **Publicar**

O que as regras garantem:
- só entra quem tem liberação em **Usuários** e não está desativado;
- **todos leem** os lançamentos da frota;
- **cada um só corrige ou apaga o que ele mesmo lançou** — menos o gestor, que mexe em tudo;
- cadastro de equipamentos, operadores e metas: **só o gestor** altera;
- último KM/horímetro, status e tanques: qualquer um atualiza (é o que acontece ao lançar).

## Passo 2 — ligar no seu celular
1. **⚙️ Configurações → 💾 Fazer backup** (segurança, antes de qualquer coisa)
2. No mesmo lugar, cartão **☁️ Dados na nuvem** → ligue a chavinha
3. Toque em **⬆️ Enviar os dados deste celular** — sobe todo o histórico
4. A etiqueta ao lado do título deve ficar **em dia**

## Passo 3 — conferir (vale a pena, leva 2 minutos)
- Entre no app em outro aparelho (ou outra aba anônima) com **outro usuário**, ligue a chavinha lá
  também e veja se os lançamentos aparecem.
- Peça para um operador lançar um abastecimento e veja surgir no seu Painel sem recarregar.
- **Teste da regra:** entrando como operador, ele deve ver em **✏️ Meus lançamentos** só o que ele
  lançou hoje. Se tentar mexer no de outro, o Firebase recusa.

## Passo 4 — quando estiver confiante
Me avise e eu deixo a nuvem **ligada por padrão** para todo mundo, sem precisar da chavinha em cada
aparelho.

---

## Se aparecer "sem permissão"

A ordem certa é: **publicar as regras primeiro**, ligar a chavinha depois. Quem liga antes fica com o
erro grudado — o Firebase derruba a conexão e ela não volta sozinha.

No cartão **☁️ Dados na nuvem** há dois botões para isso:

- **🔍 Testar nuvem** — refaz cada operação separada e mostra em qual delas o Firebase recusou,
  com o código do erro. O primeiro ❌ da lista é a causa:
  - falhou no **passo 1** (ler sua liberação) → o documento em **Usuários** não existe ou o e-mail
    está diferente do que você usa para entrar;
  - passou no 1 e falhou do **2 em diante** → as regras publicadas ainda não são as novas;
  - **todos ✅** mas a etiqueta continua vermelha → era o erro grudado: toque em **Reconectar**.
- **🔄 Reconectar** — liga de novo sem precisar fechar o app.

Como saber qual versão das regras está valendo: no Firebase → Firestore → **Regras**, o texto que
está publicado deve ter **`match /frota/{frota}`** e a palavra **`criadoPor`**. A versão antiga tem
18 linhas e termina em `allow read, write: if false`.

## Enquanto a chave estiver desligada
O app se comporta exatamente como antes: guarda tudo no celular e manda para a planilha.
Nada é enviado para a nuvem. Dá para desligar a qualquer momento.

## O que o operador passa a ver
Um cartão novo no início: **✏️ Meus lançamentos**. Ali ele corrige ou apaga **o que ele mesmo lançou
hoje** — o resto continua com você. É o que evita o telefonema a cada dígito errado.

## Detalhes técnicos (para consulta)
- Cada lançamento é um documento em `frota/gp2t/abastecimentos|viagens|manutencoes`, com o campo
  `criadoPor`. Dois operadores lançando ao mesmo tempo não se sobrescrevem.
- Cadastro em `frota/gp2t/cadastro/frota`, operação em `.../operacao`, tanques em `.../estoque`.
- Cada celular acompanha ao vivo os **últimos 120 dias**; o histórico mais antigo continua guardado
  no aparelho e na planilha.
