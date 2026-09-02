"""Dados de exemplo com a MESMA matematica do app (js/storage.js).
Medias sempre recalculadas por totais, nunca media de medias."""
import datetime, random

random.seed(7)

EQUIPS = [
    ("CB-01", "Rodante (km/L)"), ("CB-11", "Rodante (km/L)"),
    ("CB-17", "Rodante (km/L)"), ("CB-22", "Rodante (km/L)"),
    ("PC-01", "Horímetro (L/h)"), ("PC-02", "Horímetro (L/h)"),
    ("RD-01", "Horímetro (L/h)"), ("MG-01", "Horímetro (L/h)"),
]
CAMINHOES = [e for e, t in EQUIPS if e.startswith("CB")]
OPERADORES = ["Saulo", "José", "Carlos", "Antônio", "Marcos"]
MATERIAIS = ["Minério", "Estéril", "Rejeito"]
FIM = datetime.date(2026, 9, 2)
DIAS = [FIM - datetime.timedelta(days=i) for i in range(29, -1, -1)]
DIAS = [d for d in DIAS if d.weekday() != 6]          # sem domingo

# CB-22 é o "problema" da frota: consome mais por tonelada
def perfil(eq):
    if eq == "CB-22":  return dict(kml=1.5, lton=0.80)
    if eq.startswith("CB"): return dict(kml=2.1, lton=0.48)
    return dict(lh=19.0 if eq.startswith("PC") else 12.0)

def gerar():
    abast, viagens, manut, estado = [], [], [], {}
    n = 0
    for d in DIAS:
        iso = d.isoformat()
        for i, (eq, tipo) in enumerate(EQUIPS):
            # um dia de manutenção por equipamento ao longo do mês
            if (d.toordinal() + i * 5) % 47 == 0:
                manut.append(dict(id=f"EX-M{len(manut)+1:03d}", dia=iso, equipamento=eq,
                                  responsavel="Pedro", tipo="Preventiva",
                                  servico="Troca de óleo e filtros", pecas="Filtro de óleo, filtro de ar",
                                  obs="Revisão de rotina"))
                continue
            op = OPERADORES[(d.toordinal() + i) % len(OPERADORES)]
            p = perfil(eq)
            st = estado.setdefault(eq, dict(hor=1000 + i * 130, km=8000 + i * 900))
            horas = round(random.uniform(7.5, 10.5), 1)
            hor_ini, hor_fim = st["hor"], round(st["hor"] + horas, 1)
            st["hor"] = hor_fim
            n += 1
            if eq in CAMINHOES:
                qtd = random.randint(5, 12)
                peso = random.choice([28, 30, 32])
                peso_total = qtd * peso
                litros = round(peso_total * p["lton"] * random.uniform(0.94, 1.06), 0)
                km = round(litros * p["kml"] * random.uniform(0.95, 1.05), 0)
                km_ini, km_fim = st["km"], st["km"] + km
                st["km"] = km_fim
                abast.append(dict(id=f"EX-A{n:04d}", dia=iso, equipamento=eq, operador=op,
                                  hor_ini=hor_ini, hor_fim=hor_fim, horas=horas, litros=litros,
                                  combustivel="S-10" if i % 4 else "S-500",
                                  arla=round(litros * 0.03, 0) if i % 3 == 0 else 0,
                                  km=km, media=round(km / litros, 2), unidade="km/L",
                                  toneladas=peso_total, lton=round(litros / peso_total, 2),
                                  situacao="Continua em operação"))
                viagens.append(dict(id=f"EX-V{n:04d}", dia=iso, equipamento=eq, operador=op,
                                    origem="01", destino="02", quantidade=qtd,
                                    material=MATERIAIS[(d.toordinal() + i) % 3],
                                    peso_viagem=peso, peso_total=peso_total))
            else:
                litros = round(horas * p["lh"] * random.uniform(0.93, 1.07), 0)
                abast.append(dict(id=f"EX-A{n:04d}", dia=iso, equipamento=eq, operador=op,
                                  hor_ini=hor_ini, hor_fim=hor_fim, horas=horas, litros=litros,
                                  combustivel="S-10", arla=0, km=0,
                                  media=round(litros / horas, 2), unidade="L/h",
                                  toneladas=0, lton=0, situacao="Continua em operação"))
    return abast, viagens, manut, estado

def resumos(abast, viagens, manut):
    """Espelha DB.resumoDia / totaisPorEquipamento / totaisPorOperador / resumoPeriodo."""
    dias = sorted({a["dia"] for a in abast} | {v["dia"] for v in viagens} | {m["dia"] for m in manut})

    def ton_equip_dia(eq, iso):                     # viagens têm prioridade sobre o campo do abastecimento
        p = sum(v["peso_total"] for v in viagens if v["equipamento"] == eq and v["dia"] == iso)
        if p: return p
        return sum(a["toneladas"] for a in abast if a["equipamento"] == eq and a["dia"] == iso)

    por_dia = []
    for iso in dias:
        ab = [a for a in abast if a["dia"] == iso]
        vi = [v for v in viagens if v["dia"] == iso]
        mn = [m for m in manut if m["dia"] == iso]
        equips = sorted({a["equipamento"] for a in ab} | {v["equipamento"] for v in vi})
        opers = sorted({a["operador"] for a in ab} | {v["operador"] for v in vi})
        diesel = sum(a["litros"] for a in ab)
        horas = sum(a["horas"] for a in ab)
        km = sum(a["km"] for a in ab)
        ton = sum(ton_equip_dia(e, iso) for e in equips)
        por_dia.append(dict(
            data=iso, equipamentos=len(equips), operadores=len(opers),
            diesel=diesel, horas=round(horas, 1),
            lh=diesel / horas if horas else 0, ton=ton, lton=diesel / ton if ton else 0,
            s10=sum(a["litros"] for a in ab if a["combustivel"] == "S-10"),
            s500=sum(a["litros"] for a in ab if a["combustivel"] == "S-500"),
            arla=sum(a["arla"] for a in ab), km=km,
            media=km / diesel if diesel else 0,
            viagens=sum(v["quantidade"] for v in vi), manutencoes=len(mn),
            quais_eq=", ".join(equips), quais_op=", ".join(opers)))

    por_eq = []
    for iso in dias:
        equips = sorted({a["equipamento"] for a in abast if a["dia"] == iso} |
                        {v["equipamento"] for v in viagens if v["dia"] == iso})
        for eq in equips:
            ab = [a for a in abast if a["dia"] == iso and a["equipamento"] == eq]
            vi = [v for v in viagens if v["dia"] == iso and v["equipamento"] == eq]
            diesel = sum(a["litros"] for a in ab); horas = sum(a["horas"] for a in ab)
            km = sum(a["km"] for a in ab); ton = ton_equip_dia(eq, iso)
            por_eq.append(dict(data=iso, equipamento=eq, diesel=diesel, horas=round(horas, 1),
                               lh=diesel / horas if horas else 0, ton=ton,
                               lton=diesel / ton if ton else 0, km=km,
                               media=km / diesel if diesel else 0,
                               viagens=sum(v["quantidade"] for v in vi)))

    por_op = []
    for iso in dias:
        opers = sorted({a["operador"] for a in abast if a["dia"] == iso} |
                       {v["operador"] for v in viagens if v["dia"] == iso})
        for op in opers:
            ab = [a for a in abast if a["dia"] == iso and a["operador"] == op]
            vi = [v for v in viagens if v["dia"] == iso and v["operador"] == op]
            diesel = sum(a["litros"] for a in ab); horas = sum(a["horas"] for a in ab)
            ton = sum(v["peso_total"] for v in vi)
            if not ton: ton = sum(a["toneladas"] for a in ab)
            eqs = sorted({a["equipamento"] for a in ab} | {v["equipamento"] for v in vi})
            por_op.append(dict(data=iso, operador=op, equipamentos=", ".join(eqs), diesel=diesel,
                               horas=round(horas, 1), lh=diesel / horas if horas else 0, ton=ton,
                               lton=diesel / ton if ton else 0,
                               viagens=sum(v["quantidade"] for v in vi)))

    MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto",
             "Setembro","Outubro","Novembro","Dezembro"]
    por_mes = []
    for chave in sorted({d["data"][:7] for d in por_dia}):
        ds = [d for d in por_dia if d["data"].startswith(chave)]
        diesel = sum(d["diesel"] for d in ds); horas = sum(d["horas"] for d in ds)
        ton = sum(d["ton"] for d in ds); km = sum(d["km"] for d in ds)
        eqs, ops = set(), set()
        for d in ds:
            eqs |= set(d["quais_eq"].split(", ")); ops |= set(d["quais_op"].split(", "))
        y, m = chave.split("-")
        por_mes.append(dict(chave=chave, mes=f"{MESES[int(m)-1]}/{y}", dias=len(ds),
                            equipamentos=len(eqs), operadores=len(ops), diesel=diesel,
                            horas=round(horas, 1), lh=diesel / horas if horas else 0, ton=ton,
                            lton=diesel / ton if ton else 0,
                            s10=sum(d["s10"] for d in ds), s500=sum(d["s500"] for d in ds),
                            arla=sum(d["arla"] for d in ds), km=km,
                            media=km / diesel if diesel else 0,
                            viagens=sum(d["viagens"] for d in ds),
                            manutencoes=sum(d["manutencoes"] for d in ds),
                            quais_eq=", ".join(sorted(eqs)), quais_op=", ".join(sorted(ops))))
    return por_dia, por_eq, por_op, por_mes
