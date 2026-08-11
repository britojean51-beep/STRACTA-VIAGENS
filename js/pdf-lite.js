/* ══════════════════════════════════════════════════════════
   STRACTA VIAGENS — pdf-lite.js
   Gerador de PDF simples, sem nenhuma dependência externa —
   funciona 100% offline (nada de CDN). Suporta texto, negrito,
   linhas horizontais e paginação automática.
   ══════════════════════════════════════════════════════════ */

// Mapa dos caracteres especiais mais comuns (travessão, bullet, aspas curvas)
// pro byte correto da codificação WinAnsi — sem isso, viravam "?" no PDF.
const _CP1252_MAPA = {
  0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94,
  0x2013: 0x96, 0x2014: 0x97, 0x2022: 0x95, 0x2026: 0x85
};

function _pdfEscapeText(str) {
  // Converte para bytes WinAnsi (compatível com Latin-1 nos acentos comuns do PT-BR)
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 255) {
      out += String.fromCharCode(code);
    } else if (_CP1252_MAPA[code]) {
      out += String.fromCharCode(_CP1252_MAPA[code]);
    } else {
      out += '-'; // qualquer outro símbolo sem mapeamento (ex: emoji) vira um traço discreto
    }
  }
  return out.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function _stringParaBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
  return bytes;
}

class PDFLite {
  constructor() {
    this.pageWidth = 595.28;  // A4 em pontos
    this.pageHeight = 841.89;
    this.marginX = 40;
    this.marginTop = 44;
    this.marginBottom = 44;
    this.pages = [];
    this._novaPagina();
  }

  _novaPagina() {
    this._linhas = [];
    this.y = this.pageHeight - this.marginTop;
    this.pages.push(this._linhas);
  }

  _garantirEspaco(altura) {
    if (this.y - altura < this.marginBottom) this._novaPagina();
  }

  texto(str, { tamanho = 10, negrito = false, x = this.marginX, salto = 14, cor = null } = {}) {
    this._garantirEspaco(salto);
    const fonte = negrito ? '/F2' : '/F1';
    const corCmd = cor ? `${cor[0]} ${cor[1]} ${cor[2]} rg ` : '';
    const resetCmd = cor ? ' 0 0 0 rg' : '';
    this._linhas.push(`${corCmd}BT ${fonte} ${tamanho} Tf ${x} ${this.y.toFixed(2)} Td (${_pdfEscapeText(str)}) Tj ET${resetCmd}`);
    this.y -= salto;
  }

  // Desenha um retângulo preenchido com cor (usado pra logo/faixas coloridas).
  // x, yTopo, largura, altura em pontos; yTopo é medido do topo da página atual.
  retanguloPreenchido(x, yTopo, largura, altura, corRGB) {
    const yPdf = yTopo - altura;
    this._linhas.push(`${corRGB[0]} ${corRGB[1]} ${corRGB[2]} rg ${x.toFixed(2)} ${yPdf.toFixed(2)} ${largura.toFixed(2)} ${altura.toFixed(2)} re f`);
  }

  // Cabeçalho com a identidade visual do STRACTA MINERAÇÃO (azul, laranja, branco)
  cabecalhoMarca(subtitulo) {
    const azulMarinho = [0.09, 0.15, 0.29];
    const laranja = [0.96, 0.65, 0.14];
    const branco = [1, 1, 1];
    const alturaFaixa = 62;
    const topoPagina = this.pageHeight;

    // faixa azul principal, de ponta a ponta da página
    this.retanguloPreenchido(0, topoPagina, this.pageWidth, alturaFaixa, azulMarinho);
    // friso laranja fino embaixo da faixa azul
    this.retanguloPreenchido(0, topoPagina - alturaFaixa, this.pageWidth, 5, laranja);

    this.y = topoPagina - 26;
    const _marca = (typeof window !== 'undefined' && window.MARCA && window.MARCA.nome) ? window.MARCA.nome : 'STRACTA';
    this.texto(_marca.toUpperCase(), { tamanho: 19, negrito: true, cor: branco, salto: 20 });
    this.texto(subtitulo + ' — por GP2T', { tamanho: 10.5, cor: laranja, salto: 16 });

    this.y = topoPagina - alturaFaixa - 5 - 14;
  }

  // Desenha vários pedaços de texto alinhados em colunas, na mesma linha —
  // usado pra criar um efeito de "tabela" (Hora | Descrição | Duração).
  linhaColunas(colunas, { tamanho = 9, salto = 12, corPadrao = null } = {}) {
    this._garantirEspaco(salto);
    let comandos = '';
    for (const col of colunas) {
      const fonte = col.negrito ? '/F2' : '/F1';
      const cor = col.cor || corPadrao;
      const corCmd = cor ? `${cor[0]} ${cor[1]} ${cor[2]} rg ` : '';
      const resetCmd = cor ? ' 0 0 0 rg' : '';
      comandos += `${corCmd}BT ${fonte} ${col.tamanho || tamanho} Tf ${col.x} ${this.y.toFixed(2)} Td (${_pdfEscapeText(col.texto)}) Tj ET${resetCmd}\n`;
    }
    this._linhas.push(comandos.trim());
    this.y -= salto;
  }

  linhaHorizontal() {
    this._garantirEspaco(10);
    this._linhas.push(`0.6 w ${this.marginX} ${this.y.toFixed(2)} m ${(this.pageWidth - this.marginX).toFixed(2)} ${this.y.toFixed(2)} l S`);
    this.y -= 10;
  }

  espaco(altura = 8) {
    this._garantirEspaco(altura);
    this.y -= altura;
  }

  espacoDisponivel() {
    return this.y - this.marginBottom;
  }

  build() {
    const objetos = [];        // strings de cada objeto PDF (sem número/gen)
    const P = this.pages.length;

    // 1: Catalog | 2: Pages | 3..: Page + Content por página | último par: Fontes
    const idxCatalog = 1, idxPages = 2;
    const pageObjIdx = (i) => 3 + 2 * i;
    const contentObjIdx = (i) => 4 + 2 * i;
    const idxFontRegular = 3 + 2 * P;
    const idxFontBold = 4 + 2 * P;

    objetos[idxCatalog - 1] = `<< /Type /Catalog /Pages ${idxPages} 0 R >>`;
    const kids = [];
    for (let i = 0; i < P; i++) kids.push(`${pageObjIdx(i)} 0 R`);
    objetos[idxPages - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${P} >>`;

    for (let i = 0; i < P; i++) {
      const conteudo = this.pages[i].join('\n');
      objetos[pageObjIdx(i) - 1] =
        `<< /Type /Page /Parent ${idxPages} 0 R /MediaBox [0 0 ${this.pageWidth.toFixed(2)} ${this.pageHeight.toFixed(2)}] ` +
        `/Resources << /Font << /F1 ${idxFontRegular} 0 R /F2 ${idxFontBold} 0 R >> >> /Contents ${contentObjIdx(i)} 0 R >>`;
      objetos[contentObjIdx(i) - 1] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
    }

    objetos[idxFontRegular - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objetos[idxFontBold - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

    // Monta o arquivo, registrando o offset (em bytes) de cada objeto
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    for (let i = 0; i < objetos.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objetos[i]}\nendobj\n`;
    }

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n`;
    pdf += `0000000000 65535 f \n`;
    for (const off of offsets) {
      pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${idxCatalog} 0 R >>\n`;
    pdf += `startxref\n${xrefStart}\n%%EOF`;

    return new Blob([_stringParaBytes(pdf)], { type: 'application/pdf' });
  }
}

window.PDFLite = PDFLite;
