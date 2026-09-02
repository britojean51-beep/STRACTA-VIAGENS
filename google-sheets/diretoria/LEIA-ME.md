# Planilha da Diretoria — gerador

`GP2T-Planilha-Diretoria.xlsx` (na pasta acima) é um modelo de apresentação: as abas azuis leem
as abas que o app preenche, então os números do relatório são sempre os mesmos do celular.

- `dados.py` — dados de exemplo, com a mesma matemática de `js/storage.js`
  (médias sempre por totais: Σ litros ÷ Σ horas, Σ litros ÷ Σ toneladas)
- `montar.py` — monta o arquivo (openpyxl): abas de apresentação com fórmula + abas do app com dados
- `conferir.py` — calcula as fórmulas com o motor `formulas` e compara com a conta feita em Python
- `integracao.py` — compara os cabeçalhos com os do `Codigo.gs`, coluna a coluna

Para regerar: `pip install formulas && python3 montar.py && python3 conferir.py && python3 integracao.py`

As tabelas têm 30 vagas e são alimentadas pelas abas `Equipamentos` e `Operadores` — equipamento
novo cadastrado no app aparece sozinho na apresentação.
