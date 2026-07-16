# 🚛 STRACTA · Controle de Frota — V1.0

Sistema **web** de controle de frota da **STRACTA Mineração**, projetado para funcionar **100% no celular**, sem servidor e sem internet obrigatória. Todos os dados ficam salvos no próprio aparelho (`localStorage`) e o app pode ser **instalado como aplicativo** (PWA).

<p align="center">
  <img src="docs/home.png" width="30%" alt="Tela inicial" />
  <img src="docs/dashboard.png" width="30%" alt="Dashboard" />
  <img src="docs/abastecimento.png" width="30%" alt="Abastecimento" />
</p>

## ✨ Funcionalidades

| Módulo | O que faz |
|---|---|
| 🟢 **Novo Dia** | Resumo do dia em KPIs, **pendências** (equipamentos sem movimento), escolha da data do novo dia, histórico de dias e cópia automática **KM/Horímetro Final → Inicial**. |
| ⛽ **Abastecimento** | Auto-preenche último KM e horímetro, calcula **Horas**, **KM Rodado** e **Média km/L**, **alerta de média abaixo da meta**, mostra os últimos abastecimentos e desconta o diesel do tanque. |
| 🚚 **Viagens** | Rotas (Origem → Destino) por equipamento, **ranking**, total da frota e **barra de progresso vs meta diária**. |
| 🔧 **Manutenção** | Preventiva, Corretiva, Lubrificação, Calibração e Troca de Óleo + **status do equipamento** (operando/manutenção/parado) e **próxima revisão** por horímetro/KM. |
| 🚛 **Frota** | Lista de equipamentos com status; cadastro de novos; abre a **ficha** de cada um. |
| 🚛 **Ficha do Equipamento** | Histórico completo, totais, **gráfico de evolução da média**, situação e revisões. |
| ✏️ **Corrigir Dados** | Editar ou excluir qualquer registro por dia. |
| 📋 **Relatório Diário** | Gerado automaticamente. **Copiar**, enviar para o **WhatsApp** e **gerar PDF**. |
| 📊 **Painel** | KPIs, **alertas automáticos**, **gráficos de tendência** (7 dias), status da frota e **metas de gestão** editáveis. |

### 📈 Recursos de gestão
- **Alertas automáticos**: média baixa, equipamento parado/em manutenção, revisão vencida/próxima e estoque baixo.
- **Gráficos** em SVG (funcionam offline, sem bibliotecas): diesel, média e viagens ao longo dos dias.
- **Metas**: média mínima km/L, meta de viagens/dia e estoque mínimo do tanque.
- **PDF**: relatório diário formatado, via impressão do navegador (Salvar como PDF).
- **Layout responsivo**: celular, tablet e computador.

## 📱 Como usar no celular

1. Hospede a pasta em qualquer servidor estático (ex.: **GitHub Pages**) ou abra o `index.html`.
2. No navegador do celular, abra o endereço e use **"Adicionar à tela inicial"**.
3. Pronto — funciona como app, inclusive **offline**.

### GitHub Pages (grátis)
`Settings → Pages → Branch: main → /(root)` e acesse o link gerado.

## 🗂️ Estrutura

```
index.html          Estrutura e telas
css/style.css       Estilo mobile-first (tema mineração)
js/storage.js       Camada de dados (localStorage)
js/app.js           Navegação, telas e cálculos
manifest.json       Configuração do app instalável (PWA)
sw.js               Service worker (offline)
icons/icon.svg      Ícone do app
```

## 🔒 Sobre os dados

Os dados são gravados **apenas neste aparelho**. Para transferir, use os botões de exportação (relatório) até chegar a sincronização em nuvem.

## 🚀 Próximas versões

- ✅ Assinatura digital
- ✅ Fotos dos equipamentos
- ✅ Gráficos / Power BI
- ✅ Aplicativo Android nativo
- ✅ Notificações automáticas
- ✅ Relatório em PDF
- ✅ Exportar para WhatsApp *(já disponível em V1.0)*

---
STRACTA Mineração · Controle de Frota 🚛📊
