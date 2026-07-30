import { EXPORT_COLUMNS, notasToRows, xlsxFilename } from "shared/exportNotas";
import { downloadXlsx } from "./xlsx";

export function exportNotasXlsx(notas) {
  if (!notas || !notas.length) return;
  downloadXlsx({
    filename: xlsxFilename(),
    sheetName: "Notas",
    columns: EXPORT_COLUMNS,
    rows: notasToRows(notas),
  });
}
