// Entrega do .xlsx no navegador. A geração dos bytes mora em shared/xlsx.js,
// compartilhada com o app mobile.
import { buildXlsx, XLSX_MIME } from "shared/xlsx";

/**
 * Gera e baixa uma planilha .xlsx de uma única aba.
 *
 * @param {object} opts
 * @param {string} opts.filename   nome do arquivo baixado (com .xlsx)
 * @param {string} opts.sheetName  nome da aba (Excel corta em 31 caracteres)
 * @param {Array<{header: string, width?: number, type?: "text"|"number"|"money"}>} opts.columns
 * @param {Array<Array<string|number>>} opts.rows  linhas na mesma ordem de `columns`
 */
export function downloadXlsx({ filename, sheetName, columns, rows }) {
  const bytes = buildXlsx({ sheetName, columns, rows });
  const blob = new Blob([bytes], { type: XLSX_MIME });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default downloadXlsx;
