# STRACTA Frota — Gestão Operacional de Frota

Aplicativo **web / PWA** profissional e responsivo para controle operacional de
frota: equipamentos, operadores, abastecimento, produção, horímetro/KM e
manutenção. Funciona muito bem em **celular, tablet e computador**, é
**instalável** como app e funciona **offline**.

> Regra central: o **Lançamento Diário** é a única fonte dos dados operacionais.
> Todos os resumos, históricos e indicadores são **calculados automaticamente**.

---

## Como usar

Por ser um app estático (sem servidor), basta servir a pasta por HTTP:

```bash
# a partir da raiz do projeto
python3 -m http.server 8080
# abra http://localhost:8080/
```

> Abrir o `index.html` direto pelo `file://` **não funciona** porque o app usa
> módulos ES e Service Worker, que exigem `http://` ou `https://`.
> Qualquer hospedagem de site estático serve (GitHub Pages, Netlify, etc.).

### Primeiro acesso

- **E-mail:** `admin@stracta.com`
- **Senha:** `admin123`

Troque a senha e crie os demais usuários em **Usuários** (menu do Administrador).
Na primeira execução são carregados **dados de exemplo** (equipamentos,
operadores, lançamentos e manutenções) para demonstração.

---

## Módulos

| Módulo | O que faz |
|---|---|
| **Dashboard** | Cards do dia, gráficos de produção/consumo e rankings de eficiência |
| **Frota / Equipamentos** | Cadastro + perfil com totais, histórico operacional e de manutenção |
| **Operadores** | Cadastro + perfil com desempenho, equipamentos usados e histórico |
| **Lançamento Diário** | Tela principal; calcula Horas, L/h e L/Ton; valida e alerta |
| **Resumo Diário** | Visão do dia com destaques (melhor eficiência, maior produção, menor L/h) |
| **Resumo Mensal** | Consolidação, totais e evolução diária (gráficos) |
| **Manutenção** | Registro, histórico e **preventiva com semáforo** 🟢🟡🔴 |
| **Relatórios** | Exportação **CSV / Excel / PDF** e **imagem para WhatsApp** |
| **Histórico** | Busca geral por equipamento, operador, data, produção e manutenção |
| **Usuários** | Perfis (Administrador, Gestor, Operador, Visualização) e auditoria |

### Cálculos automáticos

```
Horas = Horímetro Final − Horímetro Inicial
L/h   = Litros / Horas
L/Ton = Litros / Toneladas
```

Médias consolidadas usam soma ponderada (`Σlitros / Σhoras`), não a média das
médias. Os campos automáticos são **somente leitura**.

### Validações e alertas

- **Bloqueiam:** horímetro final < inicial, valores negativos, equipamento/operador
  inexistentes, horímetro inicial menor que o último registrado (sem autorização).
- **Avisam:** consumo/produção fora do padrão histórico, horímetro muito diferente,
  equipamento marcado como *Manutenção* sendo lançado como operando.

---

## Arquitetura

- **Sem build, sem dependências externas** (funciona offline). HTML + CSS + JS
  moderno (módulos ES).
- **Banco relacional** sobre **IndexedDB** — tabelas `equipamentos`, `operadores`,
  `lancamentos`, `manutencoes`, `planos`, `usuarios`, `auditoria`, com índices.
- **PWA:** `manifest.webmanifest` + `sw.js` (cache offline).
- Senhas armazenadas apenas como **hash SHA-256 + salt** (Web Crypto).

```
index.html
manifest.webmanifest · sw.js
css/app.css
assets/  (ícones)
js/
  main.js        # bootstrap, layout, rotas
  store.js       # banco (IndexedDB), motor de cálculo, validação, seed
  auth.js        # login, sessão, permissões
  router.js      # roteador por hash
  ui.js          # componentes (card, tabela, modal, toast…)
  charts.js      # gráficos SVG
  format.js      # formatação pt-BR
  views/         # uma tela por arquivo
```

### Evolução futura (previsto na arquitetura)

Abastecimento completo (S-10, S-500, ARLA 32), pneus, lubrificação, ordens de
serviço, checklists, controle de viagens e custos, GPS/telemetria. Para
multiusuário em rede, a camada `store.js` pode ser trocada por uma API/backend
relacional mantendo as demais telas.

---

## Dados e backup

Os dados ficam no navegador do dispositivo (IndexedDB). Para backup/transferência
entre dispositivos, use as exportações em **Relatórios**. Uma sincronização em
nuvem pode ser adicionada via backend, como descrito acima.
