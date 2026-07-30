import { fmtDateBR } from "./format";

// Colunas da planilha exportada — as mesmas informações mostradas no card da nota
export const EXPORT_COLUMNS = [
  { header: "Loja", width: 26 },
  { header: "Data", width: 12 },
  { header: "Produto", width: 38 },
  { header: "Qtd", width: 8, type: "number" },
  { header: "Unidade", width: 10 },
  { header: "Preço unit.", width: 13, type: "money" },
  { header: "Total item", width: 13, type: "money" },
  { header: "Subtotal da nota", width: 17, type: "money" },
  { header: "Desconto", width: 12, type: "money" },
  { header: "Total pago", width: 13, type: "money" },
];

// Uma linha por item, com os dados da nota repetidos ao lado.
// Nota sem itens vira uma linha só, com as colunas de produto vazias.
export function notasToRows(notas) {
  const rows = [];
  for (const n of notas || []) {
    const loja = n.loja || "Compra";
    const data = fmtDateBR(n.date);
    const subtotal = n.valorTotal ?? 0;
    const desconto = n.desconto || 0;
    const totalPago = n.valorPago ?? n.valorTotal ?? 0;
    const items = n.items || [];

    if (!items.length) {
      rows.push([loja, data, "", "", "", "", "", subtotal, desconto, totalPago]);
      continue;
    }
    for (const it of items) {
      rows.push([
        loja,
        data,
        it.name || "",
        it.qty ?? "",
        it.unit || "",
        it.unitPrice ?? "",
        it.total ?? "",
        subtotal,
        desconto,
        totalPago,
      ]);
    }
  }
  return rows;
}

// Nome de arquivo estável entre as duas plataformas
export function xlsxFilename(now = new Date()) {
  return `notas-${now.toISOString().slice(0, 10)}.xlsx`;
}
