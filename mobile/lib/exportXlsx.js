// Entrega do .xlsx no celular: grava em cache e abre a folha de compartilhamento.
// A geração dos bytes é a mesma do app web (shared/xlsx.js).

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { buildXlsx, XLSX_MIME } from "shared/xlsx";
import { EXPORT_COLUMNS, notasToRows, xlsxFilename } from "shared/exportNotas";

export async function exportNotasXlsx(notas) {
  if (!notas || !notas.length) return;

  const bytes = buildXlsx({
    sheetName: "Notas",
    columns: EXPORT_COLUMNS,
    rows: notasToRows(notas),
  });

  const file = new File(Paths.cache, xlsxFilename());
  // overwrite: uma exportação anterior do mesmo dia ainda pode estar no cache,
  // e create() sem isso lança quando o arquivo já existe.
  file.create({ overwrite: true });
  file.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(
      `Este aparelho não oferece compartilhamento de arquivos. A planilha ficou salva em ${file.uri}`
    );
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: XLSX_MIME,
    UTI: "org.openxmlformats.spreadsheetml.sheet",
    dialogTitle: "Planilha das notas",
  });
}
