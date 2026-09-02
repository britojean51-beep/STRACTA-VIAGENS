# -*- coding: utf-8 -*-
"""Calcula as formulas com o motor 'formulas' e compara com a conta feita em Python."""
import datetime, formulas, dados

ARQ = "GP2T-Planilha-Diretoria.xlsx"
xl = formulas.ExcelModel().loads(ARQ).finish()
sol = xl.calculate()

def val(chave):
    """Valor de uma celula. A chave do motor e '[arquivo]ABA'!CEL, entao o nome
       da aba comeca logo depois do ']' — sem isso, POR EQUIPAMENTO casaria
       tambem com RESUMO POR EQUIPAMENTO."""
    alvo = "]" + chave.upper().strip("'")
    for k, v in sol.items():
        if k.upper().endswith(alvo):
            try:
                return v.value[0, 0]
            except Exception:
                return v
    return None

abast, viagens, manut, estado = dados.gerar()
por_dia, por_eq, por_op, por_mes = dados.resumos(abast, viagens, manut)
ini, fim = datetime.date(2026, 8, 1), datetime.date(2026, 9, 30)
no_periodo = [d for d in por_dia if ini <= datetime.date(*map(int, d["data"].split("-"))) <= fim]

esperado_diesel = sum(d["diesel"] for d in no_periodo)
esperado_horas  = round(sum(d["horas"] for d in no_periodo), 1)
esperado_ton    = sum(d["ton"] for d in no_periodo)
esperado_km     = sum(d["km"] for d in no_periodo)
esperado_viag   = sum(d["viagens"] for d in no_periodo)

ok = []
def conf(nome, cel, esperado, tol=0.02):
    got = val(cel)
    try: got = float(got)
    except Exception: pass
    bate = isinstance(got, float) and abs(got - esperado) <= max(tol, abs(esperado) * 0.0005)
    ok.append((bate, nome, got, esperado))

conf("Diretoria · consumo total", "'DIRETORIA'!B7", esperado_diesel)
conf("Diretoria · horas",         "'DIRETORIA'!B8", esperado_horas, tol=0.2)
conf("Diretoria · produção",      "'DIRETORIA'!B9", esperado_ton)
conf("Diretoria · viagens",       "'DIRETORIA'!B10", esperado_viag)
conf("Diretoria · L/h (total/total)",   "'DIRETORIA'!B11", esperado_diesel / esperado_horas)
conf("Diretoria · L/Ton (total/total)", "'DIRETORIA'!B12", esperado_diesel / esperado_ton)
conf("Diretoria · km/L",          "'DIRETORIA'!B13", esperado_km / esperado_diesel)
conf("Diretoria · dias operados", "'DIRETORIA'!B14", len(no_periodo))

# por equipamento: confere 3 maquinas, uma de cada tipo + a fora da meta
for eq in ["CB-17", "CB-22", "PC-01"]:
    linhas = [x for x in por_eq if x["equipamento"] == eq
              and ini <= datetime.date(*map(int, x["data"].split("-"))) <= fim]
    dies = sum(x["diesel"] for x in linhas); hs = sum(x["horas"] for x in linhas)
    ton = sum(x["ton"] for x in linhas)
    r = 4 + [e for e, _ in dados.EQUIPS].index(eq)
    conf(f"Equip {eq} · consumo", f"'POR EQUIPAMENTO'!D{r}", dies)
    conf(f"Equip {eq} · horas",   f"'POR EQUIPAMENTO'!E{r}", round(hs, 1), tol=0.2)
    conf(f"Equip {eq} · L/h",     f"'POR EQUIPAMENTO'!F{r}", dies / hs)
    if ton:
        conf(f"Equip {eq} · L/Ton", f"'POR EQUIPAMENTO'!H{r}", dies / ton)

# por operador
for op in ["Saulo", "Carlos"]:
    linhas = [x for x in por_op if x["operador"] == op
              and ini <= datetime.date(*map(int, x["data"].split("-"))) <= fim]
    dies = sum(x["diesel"] for x in linhas); ton = sum(x["ton"] for x in linhas)
    r = 4 + dados.OPERADORES.index(op)
    conf(f"Operador {op} · consumo",  f"'POR OPERADOR'!C{r}", dies)
    conf(f"Operador {op} · produção", f"'POR OPERADOR'!F{r}", ton)

# equipamento de horimetro nao pode gerar divisao por zero na coluna km/L
r_pc = 4 + [e for e, _ in dados.EQUIPS].index("PC-01")
kml_pc = val(f"'POR EQUIPAMENTO'!J{r_pc}")
ok.append((str(kml_pc).strip() in ("0", "0.0", "—") or kml_pc == 0,
           "PC-01 · km/L não estoura (horímetro puro)", kml_pc, "0 ou —"))

# --- destaques da aba Diretoria ---
ordem = [e for e, _ in dados.EQUIPS]
ltons = {}
for eq in ordem:
    linhas = [x for x in por_eq if x["equipamento"] == eq
              and ini <= datetime.date(*map(int, x["data"].split("-"))) <= fim]
    dies = sum(x["diesel"] for x in linhas); ton = sum(x["ton"] for x in linhas)
    if ton: ltons[eq] = dies / ton
melhor = min(ltons, key=ltons.get); pior = max(ltons, key=ltons.get)
ok.append((val("'Diretoria'!B17") == melhor, "Destaque · melhor L/Ton", val("'Diretoria'!B17"), melhor))
ok.append((val("'Diretoria'!B18") == pior, "Destaque · pior L/Ton", val("'Diretoria'!B18"), pior))
conf("Destaque · valor do melhor L/Ton", "'Diretoria'!C17", ltons[melhor])
conf("Destaque · valor do pior L/Ton", "'Diretoria'!C18", ltons[pior])

# --- frota: equipamentos que operaram e disponibilidade ---
conf("Frota · equipamentos que operaram", "'Diretoria'!E7", len(ordem))
conf("Frota · disponibilidade (7 de 8 operando)", "'Diretoria'!E10", 7 / 8)
conf("Frota · manutenções no período", "'Diretoria'!E11", len(manut))
conf("Frota · acima da meta de L/h", "'Diretoria'!E12",
     sum(1 for eq in ordem
         if (lambda ls: (sum(x["diesel"] for x in ls) / sum(x["horas"] for x in ls)) > 20 if ls else False)(
             [x for x in por_eq if x["equipamento"] == eq
              and ini <= datetime.date(*map(int, x["data"].split("-"))) <= fim])))

# --- última manutenção (SUMPRODUCT/MAX no lugar de MAXIFS) ---
eq_m = manut[0]["equipamento"]
r_m = 4 + ordem.index(eq_m)
esp_data = max(datetime.date(*map(int, m["dia"].split("-"))) for m in manut if m["equipamento"] == eq_m)
got_m = val(f"'Frota e Manutenção'!G{r_m}")
try: got_data = datetime.date(1899, 12, 30) + datetime.timedelta(days=float(got_m))
except Exception: got_data = got_m
ok.append((got_data == esp_data, f"Frota · última manutenção de {eq_m}", got_data, esp_data))

# --- espelhos: primeira linha da Evolução Diária e da Mensal ---
conf("Evolução Diária · consumo do 1º dia", "'Evolução Diária'!B4", por_dia[0]["diesel"])
conf("Evolução Mensal · consumo do 1º mês", "'Evolução Mensal'!C4", por_mes[0]["diesel"])

print("=== CONFERÊNCIA ===")
for bate, nome, got, esp in ok:
    print(("  OK  " if bate else " FALHA ") + nome + f" → planilha={got} · esperado={esp}")
print("=== FALHAS:", sum(1 for b, *_ in ok if not b), "===")

# erros de formula em qualquer aba
erros = []
for k, v in sol.items():
    try: x = v.value[0, 0]
    except Exception: continue
    if isinstance(x, str) and x.startswith("#"): erros.append((k, x))
print("=== CÉLULAS COM ERRO:", len(erros), "===")
for k, x in erros[:15]: print("  !", k, x)
