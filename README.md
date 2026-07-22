# STRACTA VIAGENS

Aplicativo web (PWA) para **controle operacional de frota** — funciona 100% offline no celular, tablet e computador, com sincronização automática na nuvem quando há conexão.

> Versão atual do build: **4.4.1** — *STRACTA VIAGENS Enterprise (rumo à Build 5.0)*

## Visão geral

O STRACTA VIAGENS é um app *offline-first* instalável (PWA) voltado para operação de frota:
registro de turnos, viagens, abastecimento, lubrificação, checklists e geração de relatórios.
Os dados ficam salvos localmente no dispositivo (IndexedDB) e são sincronizados com o Firebase
quando o aparelho está online.

## Principais funcionalidades

- **Login e permissões** por perfil (motorista / gestão) — `auth.js`, `permissoes.js`
- **Operação e turnos** — abertura e fechamento de turno, viagens — `operacao.js`, `viagens.js`
- **Abastecimento** — tipo de equipamento, ARLA, combustível e situação — `abastecimento.js`
- **Lubrificação e checklist** — `lubrificacao.js`, `checklist.js`
- **Frota / equipamentos** — cadastro e gestão — `equipamentos.js`
- **Painel / dashboard** — indicadores operacionais — `dashboard.js`
- **Relatórios** — exportação em PDF e Excel — `relatorio.js`, `relatorio-excel.js`, `pdf-lite.js`
- **Sincronização** offline/online com Firebase — `sync.js`, `firebase-sync.js`, `db.js`
- **Diagnóstico e log** — `diagnostico.js`, `log.js`
- **Controle de versão do build** — `version.js`

## Estrutura do projeto

```
.
├── index.html            # Shell do app (todas as telas)
├── manifest.json         # Manifest PWA
├── service-worker.js     # Service worker (cache / offline)
├── _headers             # Regras de cache (Netlify)
├── css/
│   └── style.css
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── js/
    ├── app.js            # Núcleo / navegação
    ├── db.js             # Camada de dados (IndexedDB)
    ├── auth.js           # Autenticação
    ├── permissoes.js     # Perfis e permissões
    ├── operacao.js       # Turnos e operação
    ├── viagens.js        # Viagens
    ├── abastecimento.js  # Abastecimento
    ├── lubrificacao.js   # Lubrificação
    ├── checklist.js      # Checklists
    ├── equipamentos.js   # Frota / equipamentos
    ├── dashboard.js      # Painel de indicadores
    ├── relatorio.js      # Relatórios
    ├── relatorio-excel.js# Exportação Excel
    ├── pdf-lite.js       # Geração de PDF
    ├── sync.js           # Sincronização
    ├── firebase-sync.js  # Integração Firebase
    ├── diagnostico.js    # Diagnóstico
    ├── log.js            # Log
    ├── utils.js          # Utilitários
    ├── config-padrao.js  # Configuração padrão
    ├── motorista.js      # Dados do motorista
    └── version.js        # Versão do build
```

## Dependências externas (via CDN)

- Firebase 10.12.2 (app, auth, firestore — compat)
- SheetJS (xlsx) 0.18.5 — exportação de planilhas

## Como executar localmente

Por ser um app estático, basta servir a pasta com qualquer servidor HTTP. Por exemplo:

```bash
# Python 3
python3 -m http.server 8080

# ou Node
npx serve .
```

Depois abra `http://localhost:8080` no navegador.

> Observação: alguns recursos (service worker / PWA / Firebase) exigem contexto seguro.
> Use `localhost` ou hospedagem HTTPS (ex.: Netlify).

## Deploy

O app é servido como conteúdo estático. O arquivo `_headers` já configura o cache correto
para `service-worker.js`, `index.html` e `manifest.json` em hospedagens como o Netlify,
garantindo que novas versões apareçam rapidamente para quem já usou o app.
