// Escritor mínimo de .xlsx (sem dependências), compartilhado entre web e mobile.
// Um .xlsx é um ZIP de XMLs; aqui o ZIP usa entradas STORED (sem compressão),
// o que dispensa um deflate e ainda gera um arquivo 100% válido para Excel/Sheets.
//
// Devolve bytes crus (Uint8Array). Entregar o arquivo é responsabilidade de cada
// app: <a download> no navegador, expo-file-system + compartilhamento no celular.

// UTF-8 na mão: TextEncoder existe no navegador, mas não é garantido no Hermes.
export function utf8Encode(str) {
  const s = String(str);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.codePointAt(i);
    if (c > 0xffff) i++; // par surrogate consumido de uma vez
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, data: Uint8Array }] -> Uint8Array do ZIP
function zip(files) {
  const entries = files.map((f) => {
    const nameBytes = utf8Encode(f.name);
    return { nameBytes, data: f.data, crc: crc32(f.data) };
  });

  let localSize = 0;
  let centralSize = 0;
  for (const e of entries) {
    localSize += 30 + e.nameBytes.length + e.data.length;
    centralSize += 46 + e.nameBytes.length;
  }

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let off = 0;

  for (const e of entries) {
    e.offset = off;
    view.setUint32(off, 0x04034b50, true); // local file header
    view.setUint16(off + 4, 20, true); // versão mínima
    view.setUint16(off + 6, 0x0800, true); // flag: nome em UTF-8
    view.setUint16(off + 8, 0, true); // método: stored
    view.setUint16(off + 10, 0, true); // hora
    view.setUint16(off + 12, 0, true); // data
    view.setUint32(off + 14, e.crc, true);
    view.setUint32(off + 18, e.data.length, true); // tamanho comprimido
    view.setUint32(off + 22, e.data.length, true); // tamanho original
    view.setUint16(off + 26, e.nameBytes.length, true);
    view.setUint16(off + 28, 0, true); // extra field
    off += 30;
    out.set(e.nameBytes, off);
    off += e.nameBytes.length;
    out.set(e.data, off);
    off += e.data.length;
  }

  const centralStart = off;
  for (const e of entries) {
    view.setUint32(off, 0x02014b50, true); // central directory header
    view.setUint16(off + 4, 20, true); // versão de criação
    view.setUint16(off + 6, 20, true); // versão mínima
    view.setUint16(off + 8, 0x0800, true);
    view.setUint16(off + 10, 0, true);
    view.setUint16(off + 12, 0, true);
    view.setUint16(off + 14, 0, true);
    view.setUint32(off + 16, e.crc, true);
    view.setUint32(off + 20, e.data.length, true);
    view.setUint32(off + 24, e.data.length, true);
    view.setUint16(off + 28, e.nameBytes.length, true);
    view.setUint16(off + 30, 0, true); // extra
    view.setUint16(off + 32, 0, true); // comentário
    view.setUint16(off + 34, 0, true); // disco
    view.setUint16(off + 36, 0, true); // atributos internos
    view.setUint32(off + 38, 0, true); // atributos externos
    view.setUint32(off + 42, e.offset, true);
    off += 46;
    out.set(e.nameBytes, off);
    off += e.nameBytes.length;
  }

  view.setUint32(off, 0x06054b50, true); // end of central directory
  view.setUint16(off + 4, 0, true);
  view.setUint16(off + 6, 0, true);
  view.setUint16(off + 8, entries.length, true);
  view.setUint16(off + 10, entries.length, true);
  view.setUint32(off + 12, centralSize, true);
  view.setUint32(off + 16, centralStart, true);
  view.setUint16(off + 20, 0, true);

  return out;
}

function esc(value) {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(index) {
  let s = "";
  let i = index;
  while (i >= 0) {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  }
  return s;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// s=0 padrão, s=1 cabeçalho (negrito), s=2 monetário (#,##0.00)
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function cellXml(ref, value, style) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (!isFinite(value)) return "";
    return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(columns, rows) {
  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`)
    .join("");

  const header = columns
    .map((c, i) => cellXml(`${colLetter(i)}1`, c.header, 1))
    .join("");

  const body = rows
    .map((row, r) => {
      const n = r + 2;
      const cells = columns
        .map((c, i) => cellXml(`${colLetter(i)}${n}`, row[i], c.type === "money" ? 2 : 0))
        .join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");

  const lastCol = colLetter(Math.max(columns.length - 1, 0));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData><row r="1">${header}</row>${body}</sheetData><autoFilter ref="A1:${lastCol}${rows.length + 1}"/></worksheet>`;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Monta uma planilha .xlsx de uma única aba e devolve os bytes.
 *
 * @param {object} opts
 * @param {string} opts.sheetName  nome da aba (Excel corta em 31 caracteres)
 * @param {Array<{header: string, width?: number, type?: "text"|"number"|"money"}>} opts.columns
 * @param {Array<Array<string|number>>} opts.rows  linhas na mesma ordem de `columns`
 * @returns {Uint8Array} conteúdo do arquivo .xlsx
 */
export function buildXlsx({ sheetName = "Planilha1", columns, rows }) {
  return zip([
    { name: "[Content_Types].xml", data: utf8Encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: utf8Encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: utf8Encode(workbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8Encode(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: utf8Encode(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: utf8Encode(sheetXml(columns, rows)) },
  ]);
}

