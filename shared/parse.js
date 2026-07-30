// Lógica de parsing de nota fiscal (NFC-e), compartilhada entre o app web e o
// app mobile (Expo). Puro JavaScript: sem DOM, sem React, sem Intl.

export function toNumber(str) {
  if (str === undefined || str === null) return 0;
  if (typeof str === "number") return str;
  let s = String(str).trim();
  // Se contiver vírgula ou barra (comum em erro de OCR), assume formato BR
  if (s.includes(",") || s.includes("/")) {
    s = s.replace(/\./g, "").replace(/[,/]/g, ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Parser mais tolerante para valores monetários do rodapé da nota (total, desconto,
// valor pago), que às vezes saem do OCR sem vírgula decimal ou com a letra "o"/"O"
// no lugar do dígito "0" (ex.: "Descontos R$: o72" em vez de "0,72").
export function parseMoneyLoose(raw) {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim().replace(/[oO]/g, "0");
  if (!s) return 0;
  if (s.includes(",") || s.includes(".")) {
    return toNumber(s);
  }
  // Sem separador decimal: assume que os 2 últimos dígitos são os centavos
  if (s.length > 2) {
    s = `${s.slice(0, -2)}.${s.slice(-2)}`;
  } else {
    s = `0.${s.padStart(2, "0")}`;
  }
  return toNumber(s);
}

export function parseReceiptText(text) {
  const items = [];
  const norm = String(text || "").replace(/\r/g, "");

  // Incluído Qtd total de itens no rodapé para garantir que o corte seja perfeito
  const footerMatch = norm.match(
    /Emiss[aã]o:|Valor\s*total\s*R\$|Descontos\s*R\$|Valor\s*a\s*pagar\s*R\$|Forma\s*de\s*pagamento|Chave\s*de\s*acesso|Tributos\s*totais|Qtd\.?\s*total\s*de\s*itens/i
  );
  const itemsText = footerMatch ? norm.slice(0, footerMatch.index) : norm;

// Modificado: Captura a linha inteira que possui o padrão do Código, independente de parênteses.
  // Isso impede que a regex "pule" para as linhas de valores debaixo.
  const headerRegex = /^([^\n(]+?)\s*(?:\(\s*)?C[oó]digo:\s*(\d+)[^\n]*/gim;
  const headers = [];
  let hm;

  while ((hm = headerRegex.exec(itemsText)) !== null) {
    // O cabeçalho termina exatamente onde a linha atual termina, eliminando o risco de engolir os valores abaixo
    const headerEndPos = headerRegex.lastIndex;

    headers.push({
      name: hm[1].trim(),
      code: hm[2].trim(),
      start: hm.index,
      headerEnd: headerEndPos
    });
  }

// ... dentro de parseReceiptText, substitua o bloco do laço for por este:

for (let i = 0; i < headers.length; i++) {
  const h = headers[i];
  const blockEnd = i + 1 < headers.length ? headers[i + 1].start : itemsText.length;
  const block = itemsText.slice(h.headerEnd, blockEnd);

  // Captura também o segundo número após "Unit:" (o total do item), quando presente.
  // Ele costuma vir com vírgula/ponto corretos mesmo quando o preço unitário sai
  // corrompido pelo OCR (ex.: "Vl Unit: 39 3,90" — "39" é lixo, "3,90" é o total real).
  const qm = block.match(/(?:Qtde|Gtde|Qide|Otde|Qtrie|Qtd)\s*[:,.;]*\s*([\d.,/]+)\s*UN\s*[:'|\-]*\s*(\S+).*?Unit\s*[:,.;]*\s*([\d.,/]+)(?:\s+([\d.,/]+))?/i);
  if (!qm) continue;

  const qty = toNumber(qm[1]);
  const unit = qm[2].trim();

  // Melhora o tratamento do preço unitário tratando barras e pontuações comuns de OCR
  let unitPriceRaw = qm[3].trim().replace(/\r/g, "").replace(/\//g, ".");

  // Se o OCR comeu a vírgula de um número grande (ex: "599" em vez de "59,90"),
  // mas o valor total do produto claramente bate com a casa decimal correta:
  if (!unitPriceRaw.includes('.') && !unitPriceRaw.includes(',') && unitPriceRaw.length > 2) {
    // Só divide por 100 se o número resultante fizer sentido lógico com o bloco
    const testVal = parseFloat(unitPriceRaw) / 100;
    // Se no bloco houver menção ao número original com ponto (ex: "59,90"), usamos o correto
    const matchCorrect = block.match(new RegExp(unitPriceRaw.slice(0, 2) + "[,.]" + unitPriceRaw.slice(2)));
    if (matchCorrect) {
      unitPriceRaw = unitPriceRaw.slice(0, 2) + "." + unitPriceRaw.slice(2);
    } else {
      unitPriceRaw = (parseFloat(unitPriceRaw) / 100).toFixed(2);
    }
  }

  let unitPrice = toNumber(unitPriceRaw);

  // Reconciliação: se o "Total" do item foi lido pelo OCR (qm[4]) com um separador
  // decimal válido, e ele não bate com qty × unitPrice calculado acima, confiamos
  // no total (mais confiável nesses casos) e recalculamos o preço unitário a partir
  // dele — corrige casos como "Vl Unit: 39 3,90" (preço unitário lido errado, "39"
  // em vez de "3,90", enquanto o total "3,90" veio certo).
  if (qm[4] && qty > 0) {
    const totalRaw = qm[4].trim().replace(/\r/g, "").replace(/\//g, ".");
    if (/[.,]/.test(totalRaw)) {
      const totalFromOcr = toNumber(totalRaw);
      const expected = Math.round(qty * unitPrice * 100) / 100;
      if (totalFromOcr > 0 && Math.abs(expected - totalFromOcr) > 0.02) {
        unitPrice = Math.round((totalFromOcr / qty) * 100) / 100;
      }
    }
  }

  // Força o cálculo matemático exato em vez de tentar ler o "Total" borrado do OCR
  const total = Math.round(qty * unitPrice * 100) / 100;

  if (!h.name) continue;
  items.push({ name: h.name, code: h.code, qty, unit, unitPrice, total });
}

  const dateMatch = text.match(/Emiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4})/);
  // Classe de caracteres inclui "o"/"O" pois o OCR às vezes lê "0" como a letra
  const totalMatch = text.match(/Valor\s*total\s*R\$:\s*([oO\d.,]+)/i);
  const descMatch = text.match(/Descontos\s*R\$:\s*([oO\d.,]+)/i);
  const payMatch = text.match(/Valor\s*a\s*pagar\s*R\$:\s*([oO\d.,]+)/i);

  let isoDate = "";
  if (dateMatch) {
    const [d, mo, y] = dateMatch[1].split("/");
    isoDate = `${y}-${mo}-${d}`;
  }

  const subtotalItens = items.reduce((s, i) => s + i.total, 0);
  const valorTotal = totalMatch ? parseMoneyLoose(totalMatch[1]) : subtotalItens;
  let desconto = descMatch ? parseMoneyLoose(descMatch[1]) : 0;
  let valorPago = payMatch ? parseMoneyLoose(payMatch[1]) : null;

  // Se não conseguimos ler o desconto diretamente, mas temos o total e o valor pago,
  // deduzimos o desconto pela diferença (mais confiável do que assumir zero).
  if (!descMatch && valorTotal && valorPago !== null && valorTotal > valorPago) {
    desconto = Math.round((valorTotal - valorPago) * 100) / 100;
  }
  if (valorPago === null) {
    valorPago = Math.round((valorTotal - desconto) * 100) / 100;
  }

  // A maioria das NFC-e traz "Qtd. total de itens" no rodapé — usamos isso para
  // avisar quando o OCR reconheceu menos (ou mais) itens do que a nota realmente tem,
  // o que costuma acontecer com PDFs de baixa qualidade (ex.: "Imprimir em PDF" do Safari).
  const qtdItensMatch = text.match(/Qtd\.?\s*total\s*de\s*itens\s*:?\s*(\d+)/i);
  const qtdItensEsperada = qtdItensMatch ? parseInt(qtdItensMatch[1], 10) : null;

  return {
    items,
    date: isoDate,
    valorTotal,
    desconto,
    valorPago,
    qtdItensEsperada,
  };
}

export function extractLoja(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => /CNPJ/i.test(l));
  if (idx > 0) {
    for (let i = idx - 1; i >= 0 && i >= idx - 3; i--) {
      const l = lines[i];
      if (l.length > 3 && !/CONSUMIDOR|ELETR[OÔÓ]NICA|DOCUMENTO AUXILIAR|^NFC/i.test(l)) {
        return l;
      }
    }
  }
  return "";
}
