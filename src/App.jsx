import "./storage";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Receipt, Plus, BarChart3, Trash2, ScanLine, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Loader2, X, Check, AlertCircle, FileUp } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

const INK = "#241F1A";
const INK_SOFT = "#6E655A";
const PAPER = "#F6F1E6";
const PAPER_DARK = "#EDE5D3";
const LINE = "#D8CFBB";
const RED = "#AE3B2E";
const GREEN = "#4C7A5A";
const GOLD = "#B8863A";

function toNumber(str) {
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

function fmtBRL(n) {
  return (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Parser mais tolerante para valores monetários do rodapé da nota (total, desconto,
// valor pago), que às vezes saem do OCR sem vírgula decimal ou com a letra "o"/"O"
// no lugar do dígito "0" (ex.: "Descontos R$: o72" em vez de "0,72").
function parseMoneyLoose(raw) {
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function storageSetWithRetry(key, value, shared, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await window.storage.set(key, value, shared);
      if (res) return res;
      lastErr = new Error("Resposta vazia do armazenamento");
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) await wait(400 * (i + 1));
  }
  throw lastErr;
}

function parseReceiptText(text) {
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
  
  return {
    items,
    date: isoDate,
    valorTotal,
    desconto,
    valorPago,
  };
}

function extractLoja(text) {
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

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

async function ensurePdfJs() {
  if (!window.pdfjsLib) {
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  }
  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
}

async function ensureTesseract() {
  if (!window.Tesseract) {
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
  }
}

async function pdfToCanvases(file, scale = 2.2) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const canvases = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

async function ocrCanvases(canvases, onProgress) {
  await ensureTesseract();
  const worker = await window.Tesseract.createWorker("por", 1, {
    logger: (m) => {
      if (onProgress && m.status === "recognizing text") onProgress(m.progress || 0);
    },
  });
  let fullText = "";
  for (const canvas of canvases) {
    const { data } = await worker.recognize(canvas);
    fullText += (data?.text || "") + "\n";
  }
  await worker.terminate();
  return fullText;
}

async function extractTextFromPdf(file, onProgress) {
  await ensurePdfJs();
  const canvases = await pdfToCanvases(file);
  const text = await ocrCanvases(canvases, onProgress);
  return text;
}

function TornCard({ children, style }) {
  return (
    <div
      style={{
        background: PAPER,
        border: `1px solid ${LINE}`,
        boxShadow: "0 2px 10px rgba(36,31,26,0.06)",
        clipPath:
          "polygon(0% 0%,100% 0%,100% 97%,96% 100%,92% 97%,88% 100%,84% 97%,80% 100%,76% 97%,72% 100%,68% 97%,64% 100%,60% 97%,56% 100%,52% 97%,48% 100%,44% 97%,40% 100%,36% 97%,32% 100%,28% 97%,24% 100%,20% 97%,16% 100%,12% 97%,8% 100%,4% 97%,0% 100%)",
        paddingBottom: 18,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Barcode() {
  const bars = useMemo(
    () => Array.from({ length: 38 }, () => 1 + Math.floor(Math.random() * 3)),
    []
  );
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22, opacity: 0.55 }}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, height: 22, background: INK }} />
      ))}
    </div>
  );
}

export default function App() {
  const [notas, setNotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("notas");
  const [budget, setBudget] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        let idx = [];
        try {
          const r = await window.storage.get("notas-index", false);
          idx = r ? JSON.parse(r.value) : [];
        } catch (e) {
          idx = [];
        }
        const loaded = [];
        for (const id of idx) {
          try {
            const r = await window.storage.get(`nota:${id}`, false);
            if (r) loaded.push(JSON.parse(r.value));
          } catch (e) { }
        }
        loaded.sort((a, b) => (a.date < b.date ? 1 : -1));
        setNotas(loaded);
        try {
          const b = await window.storage.get("config:budget", false);
          if (b) setBudget(JSON.parse(b.value));
        } catch (e) { }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveIndex = useCallback(async (ids) => {
    try {
      await storageSetWithRetry("notas-index", JSON.stringify(ids), false);
    } catch (e) {
      setSaveError("Não foi possível salvar a lista de notas. Tente novamente.");
    }
  }, []);

  const addNota = useCallback(
    async (nota) => {
      const id = `${Date.now()}`;
      const record = { id, ...nota };
      try {
        await storageSetWithRetry(`nota:${id}`, JSON.stringify(record), false);
        const newList = [record, ...notas];
        const ids = newList.map((n) => n.id);
        await saveIndex(ids);
        newList.sort((a, b) => (a.date < b.date ? 1 : -1));
        setNotas(newList);
        setSaveError("");
        return true;
      } catch (e) {
        setSaveError("Erro ao salvar a nota — a conexão com o armazenamento falhou. Seus dados ainda estão preenchidos abaixo, clique em \"Guardar nota\" para tentar de novo.");
        return false;
      }
    },
    [notas, saveIndex]
  );

  const deleteNota = useCallback(
    async (id) => {
      try {
        await window.storage.delete(`nota:${id}`, false);
      } catch (e) { }
      const newList = notas.filter((n) => n.id !== id);
      setNotas(newList);
      await saveIndex(newList.map((n) => n.id));
    },
    [notas, saveIndex]
  );

  const saveBudget = useCallback(async (val) => {
    setBudget(val);
    try {
      await storageSetWithRetry("config:budget", JSON.stringify(val), false);
    } catch (e) { }
  }, []);

  const stats = useMemo(() => {
    const allItems = [];
    notas.forEach((n) =>
      (n.items || []).forEach((it) => allItems.push({ ...it, notaId: n.id, date: n.date, loja: n.loja }))
    );
    const totalGasto = notas.reduce((s, n) => s + (n.valorPago ?? n.valorTotal ?? 0), 0);

    const byMonth = {};
    notas.forEach((n) => {
      if (!n.date) return;
      const key = n.date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + (n.valorPago ?? n.valorTotal ?? 0);
    });
    const months = Object.keys(byMonth).sort();
    const monthData = months.map((k) => {
      const [y, m] = k.split("-");
      return { key: k, label: `${m}/${y.slice(2)}`, total: byMonth[k] };
    });

    let delta = null;
    if (monthData.length >= 2) {
      const cur = monthData[monthData.length - 1].total;
      const prev = monthData[monthData.length - 2].total;
      delta = { cur, prev, diff: cur - prev, pct: prev ? ((cur - prev) / prev) * 100 : 0 };
    }

    let maisCaro = null;
    let maisBarato = null;
    allItems.forEach((it) => {
      if (!maisCaro || it.unitPrice > maisCaro.unitPrice) maisCaro = it;
      if (!maisBarato || (it.unitPrice < maisBarato.unitPrice && it.unitPrice > 0)) maisBarato = it;
    });

    const byProduct = {};
    allItems.forEach((it) => {
      const key = it.name;
      if (!byProduct[key]) byProduct[key] = { name: key, prices: [], count: 0 };
      byProduct[key].prices.push(it.unitPrice);
      byProduct[key].count += 1;
    });
    const productList = Object.values(byProduct).map((p) => ({
      name: p.name,
      count: p.count,
      min: Math.min(...p.prices),
      max: Math.max(...p.prices),
      avg: p.prices.reduce((s, x) => s + x, 0) / p.prices.length,
      variou: Math.max(...p.prices) !== Math.min(...p.prices),
    }));
    productList.sort((a, b) => b.count - a.count);

    return { allItems, totalGasto, monthData, delta, maisCaro, maisBarato, productList };
  }, [notas]);

  const budgetNum = toNumber(budget);
  const lastMonthTotal = stats.monthData.length ? stats.monthData[stats.monthData.length - 1].total : 0;
  const budgetDiff = budgetNum ? lastMonthTotal - budgetNum : null;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER, fontFamily: "Georgia, serif", color: INK }}>
        <Loader2 className="animate-spin" size={22} style={{ marginRight: 10 }} />
        Carregando suas notas...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'Courier New', ui-monospace, monospace", color: INK }}>
      <style>{`
        * { box-sizing: border-box; }
        .disp { font-family: Georgia, 'Times New Roman', serif; }
        .tabbtn { transition: all .15s ease; }
        .tabbtn:hover { transform: translateY(-1px); }
        input, textarea, button { font-family: inherit; }
        input:focus, textarea:focus { outline: 2px solid ${GOLD}; outline-offset: 1px; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${LINE}; border-radius: 4px; }
      `}</style>

      <header style={{ borderBottom: `1px dashed ${LINE}`, padding: "28px 20px 20px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 10, background: INK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Receipt color={PAPER} size={24} />
          </div>
          <h1 className="disp" style={{ fontSize: 26, margin: 0, color: "#222", fontWeight: 700, letterSpacing: 0.2 }}>Livro de Notas</h1>
        </div>
      </header>

      <nav style={{ maxWidth: 880, margin: "0 auto", padding: "18px 20px 0", display: "flex", gap: 10 }}>
        {[
          { id: "notas", label: "Notas", icon: Receipt },
          { id: "add", label: "Adicionar", icon: Plus },
          { id: "analise", label: "Análise", icon: BarChart3 },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              className="tabbtn"
              onClick={() => setTab(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "9px 16px",
                borderRadius: 999,
                border: `1px solid ${active ? INK : LINE}`,
                background: active ? INK : "transparent",
                color: active ? PAPER : INK,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </nav>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "22px 20px 60px" }}>
        {saveError && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#F6E4E1", border: `1px solid ${RED}`, color: RED, padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <AlertCircle size={16} /> {saveError}
          </div>
        )}

        {tab === "notas" && (
          <NotasTab notas={notas} expanded={expanded} setExpanded={setExpanded} onDelete={deleteNota} />
        )}
        {tab === "add" && <AddTab onSave={addNota} onDone={() => setTab("notas")} />}
        {tab === "analise" && (
          <AnaliseTab
            notas={notas}
            stats={stats}
            budget={budget}
            setBudget={saveBudget}
            budgetDiff={budgetDiff}
          />
        )}
      </main>
    </div>
  );
}

function NotasTab({ notas, expanded, setExpanded, onDelete }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notas;
    return notas.filter((n) => {
      const lojaMatch = (n.loja || "").toLowerCase().includes(q);
      const itemMatch = (n.items || []).some((it) => (it.name || "").toLowerCase().includes(q));
      return lojaMatch || itemMatch;
    });
  }, [notas, search]);

  if (!notas.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: INK_SOFT }}>
        <ScanLine size={34} style={{ marginBottom: 10, opacity: 0.6 }} />
        <p className="disp" style={{ fontSize: 17, color: INK, margin: "0 0 4px" }}>Nenhuma nota guardada ainda</p>
        <p style={{ fontSize: 13, margin: 0 }}>Vá em "Adicionar" e cole o texto da sua nota fiscal.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ position: "relative" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por loja ou produto (ex: Sendas)"
          style={{
            width: "100%",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            background: "#FFFDF8",
          }}
        />
      </div>

      {filtered.length === 0 && (
        <p style={{ fontSize: 13, color: INK_SOFT, textAlign: "center", padding: "20px 0" }}>
          Nenhuma nota encontrada para "{search}".
        </p>
      )}

      {filtered.map((n) => {
        const isOpen = expanded === n.id;
        const total = n.valorPago ?? n.valorTotal ?? 0;
        return (
          <TornCard key={n.id}>
            <div style={{ padding: "18px 22px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p className="disp" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                    {n.loja || "Compra"}
                  </p>
                  <p style={{ fontSize: 12, color: INK_SOFT, margin: "3px 0 0" }}>
                    {n.date ? new Date(n.date + "T12:00:00").toLocaleDateString("pt-BR") : "sem data"} · {(n.items || []).length} itens
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  {n.desconto > 0 && (
                    <p style={{ fontSize: 11.5, color: INK_SOFT, textDecoration: "line-through", margin: 0 }}>
                      R$ {fmtBRL(n.valorTotal)}
                    </p>
                  )}
                  <p style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>R$ {fmtBRL(total)}</p>
                  {n.desconto > 0 && (
                    <p style={{ fontSize: 11, color: GREEN, margin: "2px 0 0" }}>
                      desconto de R$ {fmtBRL(n.desconto)}
                    </p>
                  )}
                  <button
                    onClick={() => onDelete(n.id)}
                    style={{ marginTop: 4, background: "none", border: "none", color: RED, fontSize: 11.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <Trash2 size={12} /> excluir
                  </button>
                </div>
              </div>

              <button
                onClick={() => setExpanded(isOpen ? null : n.id)}
                style={{ marginTop: 12, background: "none", border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: INK }}
              >
                {isOpen ? "ocultar itens" : "ver itens"}
              </button>

              {isOpen && (
                <div style={{ marginTop: 12, borderTop: `1px dashed ${LINE}`, paddingTop: 10 }}>
                  {(n.items || []).map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", borderBottom: i < n.items.length - 1 ? `1px dotted ${LINE}` : "none" }}>
                      <span style={{ color: INK }}>{it.name} <span style={{ color: INK_SOFT }}>x{it.qty}{it.unit}</span></span>
                      <span style={{ fontWeight: 600 }}>R$ {fmtBRL(it.total)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <Barcode />
              </div>
            </div>
          </TornCard>
        );
      })}
    </div>
  );
}

function AddTab({ onSave, onDone }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [loja, setLoja] = useState("");
  const [date, setDate] = useState("");
  const [desconto, setDesconto] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualItems, setManualItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", qty: "1", unit: "Un", unitPrice: "" });
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfError, setPdfError] = useState("");
  const fileInputRef = useRef(null);

  const handleParse = () => {
    const r = parseReceiptText(raw);
    setParsed(r);
    if (r.date) setDate(r.date);
    setManualItems(r.items);
    setDesconto(r.desconto ? String(r.desconto).replace(".", ",") : "");
  };

  const handlePdfFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfError("");
    setPdfProgress(0);
    try {
      setPdfStatus("carregando");
      await ensurePdfJs();
      setPdfStatus("renderizando");
      const canvases = await pdfToCanvases(file);
      setPdfStatus("lendo");
      const text = await ocrCanvases(canvases, (p) => setPdfProgress(p));
      setRaw(text);
      const r = parseReceiptText(text);
      setParsed(r);
      if (r.date) setDate(r.date);
      setManualItems(r.items);
      setDesconto(r.desconto ? String(r.desconto).replace(".", ",") : "");
      const lj = extractLoja(text);
      if (lj) setLoja(lj);
      if (!r.items.length) {
        setPdfError("Não consegui reconhecer os itens automaticamente. O texto lido apareceu no campo abaixo — confira e ajuste antes de continuar (ou adicione os itens manualmente).");
      }
      setPdfStatus("");
    } catch (err) {
      console.error(err);
      setPdfStatus("erro");
      setPdfError("Não foi possível ler o PDF. Verifique sua conexão com a internet (o leitor de PDF/OCR é carregado on-line na primeira vez) e tente novamente.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeItem = (i) => setManualItems((arr) => arr.filter((_, idx) => idx !== i));

  const addManualItem = () => {
    if (!newItem.name || !newItem.unitPrice) return;
    const qty = toNumber(newItem.qty) || 1;
    const unitPrice = toNumber(newItem.unitPrice);
    setManualItems((arr) => [...arr, { name: newItem.name, code: "", qty, unit: newItem.unit, unitPrice, total: qty * unitPrice }]);
    setNewItem({ name: "", qty: "1", unit: "Un", unitPrice: "" });
  };

  const subtotal = manualItems.reduce((s, i) => s + i.total, 0);
  const descontoNum = toNumber(desconto);
  const total = Math.max(subtotal - descontoNum, 0);

  const handleSave = async () => {
    if (!manualItems.length) return;
    setSaving(true);
    const ok = await onSave({
      loja: loja.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      items: manualItems,
      valorTotal: subtotal,
      desconto: descontoNum,
      valorPago: total,
    });
    setSaving(false);
    if (ok) {
      setRaw("");
      setParsed(null);
      setManualItems([]);
      setLoja("");
      setDate("");
      setDesconto("");
      onDone();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <TornCard style={{ padding: 22 }}>
        <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Enviar PDF da nota</p>
        <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 12px" }}>
          Envie o PDF baixado da consulta da NFC-e. Como esse PDF costuma ser uma imagem da página (sem texto selecionável), o app lê o conteúdo por OCR direto no seu navegador — pode levar alguns segundos.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handlePdfFile}
          disabled={!!pdfStatus && pdfStatus !== "erro"}
          style={{ display: "none" }}
          id="pdf-upload-input"
        />
        <label
          htmlFor="pdf-upload-input"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: pdfStatus && pdfStatus !== "erro" ? LINE : INK,
            color: pdfStatus && pdfStatus !== "erro" ? INK_SOFT : PAPER,
            border: "none",
            padding: "9px 16px",
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: pdfStatus && pdfStatus !== "erro" ? "default" : "pointer",
          }}
        >
          {pdfStatus === "carregando" || pdfStatus === "renderizando" || pdfStatus === "lendo" ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <FileUp size={15} />
          )}
          {pdfStatus === "carregando" && "Preparando leitor..."}
          {pdfStatus === "renderizando" && "Abrindo PDF..."}
          {pdfStatus === "lendo" && `Lendo nota (OCR)... ${Math.round(pdfProgress * 100)}%`}
          {(!pdfStatus || pdfStatus === "erro") && "Escolher PDF da nota"}
        </label>
        {pdfStatus === "lendo" && (
          <div style={{ marginTop: 10, height: 6, background: PAPER_DARK, borderRadius: 999, overflow: "hidden", maxWidth: 320 }}>
            <div style={{ width: `${Math.round(pdfProgress * 100)}%`, height: "100%", background: GOLD, transition: "width .2s ease" }} />
          </div>
        )}
        {pdfError && (
          <p style={{ fontSize: 12, color: RED, marginTop: 10, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {pdfError}
          </p>
        )}
      </TornCard>

      <TornCard style={{ padding: 22 }}>
        <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Colar texto da nota</p>
        <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 12px" }}>
          Ou, se preferir, cole aqui o texto da nota fiscal (mesmo formato do cupom eletrônico) e clique em "Ler nota". Esse é o mesmo campo preenchido automaticamente ao enviar o PDF acima — dá pra revisar e reprocessar.
        </p>
        <textarea

          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"PALHA BIG TOSTY 80G (Código: 1111681 )\nQtde.:1   UN: PC   Vl. Unit.:   5,99\tVl. Total\n5,99\n..."}
          style={{ width: "100%", minHeight: 140, border: `1px solid ${LINE}`, borderRadius: 8, padding: 12, fontSize: 12, background: "#FFFDF8", resize: "vertical" }}
        />
        <button
          onClick={handleParse}
          disabled={!raw.trim()}
          style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 7, background: raw.trim() ? INK : LINE, color: raw.trim() ? PAPER : INK_SOFT, border: "none", padding: "9px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: raw.trim() ? "pointer" : "default" }}
        >
          <ScanLine size={15} /> Ler nota
        </button>
        {parsed && parsed.items.length === 0 && (
          <p style={{ fontSize: 12, color: RED, marginTop: 8 }}>Não consegui reconhecer itens nesse texto — adicione manualmente abaixo.</p>
        )}
        {parsed && parsed.items.length > 0 && (
          <p style={{ fontSize: 12, color: GREEN, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <Check size={13} /> {parsed.items.length} itens reconhecidos
          </p>
        )}
      </TornCard>

      <TornCard style={{ padding: 22 }}>
        <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Detalhes da compra</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: INK_SOFT, flex: "1 1 200px" }}>
            Loja / mercado
            <input value={loja} onChange={(e) => setLoja(e.target.value)} placeholder="ex: Supermercado Bom Preço" style={{ display: "block", width: "100%", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, background: "#FFFDF8" }} />
          </label>
          <label style={{ fontSize: 12, color: INK_SOFT, flex: "1 1 150px" }}>
            Data
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, background: "#FFFDF8" }} />
          </label>
          <label style={{ fontSize: 12, color: INK_SOFT, flex: "1 1 130px" }}>
            Desconto (R$)
            <input value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" style={{ display: "block", width: "100%", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, background: "#FFFDF8" }} />
          </label>
        </div>

        <p className="disp" style={{ fontSize: 14, fontWeight: 700, margin: "18px 0 8px" }}>Itens ({manualItems.length})</p>
        <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${LINE}`, borderRadius: 8 }}>
          {manualItems.length === 0 && (
            <p style={{ fontSize: 12, color: INK_SOFT, padding: 14, margin: 0 }}>Nenhum item ainda.</p>
          )}
          {manualItems.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", borderBottom: i < manualItems.length - 1 ? `1px dotted ${LINE}` : "none", fontSize: 12.5 }}>
              <span>{it.name} <span style={{ color: INK_SOFT }}>x{it.qty}{it.unit} · R$ {fmtBRL(it.unitPrice)}/un</span></span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 600 }}>R$ {fmtBRL(it.total)}</span>
                <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: RED, cursor: "pointer" }}><X size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 11, color: INK_SOFT, flex: "2 1 160px" }}>
            Produto
            <input value={newItem.name} onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 9px", fontSize: 12.5, background: "#FFFDF8" }} />
          </label>
          <label style={{ fontSize: 11, color: INK_SOFT, flex: "1 1 70px" }}>
            Qtd
            <input value={newItem.qty} onChange={(e) => setNewItem((v) => ({ ...v, qty: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 9px", fontSize: 12.5, background: "#FFFDF8" }} />
          </label>
          <label style={{ fontSize: 11, color: INK_SOFT, flex: "1 1 70px" }}>
            Un.
            <input value={newItem.unit} onChange={(e) => setNewItem((v) => ({ ...v, unit: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 9px", fontSize: 12.5, background: "#FFFDF8" }} />
          </label>
          <label style={{ fontSize: 11, color: INK_SOFT, flex: "1 1 90px" }}>
            Preço unit.
            <input value={newItem.unitPrice} onChange={(e) => setNewItem((v) => ({ ...v, unitPrice: e.target.value }))} placeholder="0,00" style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 9px", fontSize: 12.5, background: "#FFFDF8" }} />
          </label>
          <button onClick={addManualItem} style={{ background: PAPER_DARK, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <Plus size={14} /> item
          </button>
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px dashed ${LINE}` }}>
          {descontoNum > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: INK_SOFT }}>
                <span>Subtotal</span>
                <span>R$ {fmtBRL(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: GREEN }}>
                <span>Desconto</span>
                <span>− R$ {fmtBRL(descontoNum)}</span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p className="disp" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
              {descontoNum > 0 ? "Total a pagar" : "Total"}: R$ {fmtBRL(total)}
            </p>
            <button
              onClick={handleSave}
              disabled={!manualItems.length || saving}
              style={{ background: manualItems.length ? INK : LINE, color: manualItems.length ? PAPER : INK_SOFT, border: "none", padding: "10px 20px", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: manualItems.length ? "pointer" : "default", display: "flex", alignItems: "center", gap: 7 }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Guardar nota
            </button>
          </div>
        </div>
      </TornCard>
    </div>
  );
}

function AnaliseTab({ notas, stats, budget, setBudget, budgetDiff }) {
  const repeatedProducts = useMemo(
    () => stats.productList.filter((p) => p.count > 1).sort((a, b) => b.count - a.count),
    [stats.productList]
  );
  const [selectedProduct, setSelectedProduct] = useState(null);

  const activeProductName = selectedProduct || (repeatedProducts[0] && repeatedProducts[0].name) || null;

  const priceHistory = useMemo(() => {
    if (!activeProductName) return [];
    return stats.allItems
      .filter((it) => it.name === activeProductName)
      .filter((it) => it.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((it) => ({
        date: it.date,
        label: new Date(it.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        price: it.unitPrice,
        loja: it.loja,
      }));
  }, [stats.allItems, activeProductName]);

  if (!notas.length) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: INK_SOFT }}>
        <BarChart3 size={34} style={{ marginBottom: 10, opacity: 0.6 }} />
        <p className="disp" style={{ fontSize: 17, color: INK, margin: "0 0 4px" }}>Sem dados para analisar ainda</p>
        <p style={{ fontSize: 13, margin: 0 }}>Adicione ao menos uma nota para ver os números.</p>
      </div>
    );
  }

  const { delta } = stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <StatBox label="Total gasto" value={`R$ ${fmtBRL(stats.totalGasto)}`} />
        <StatBox label="Notas guardadas" value={notas.length} />
        <StatBox label="Itens comprados" value={stats.allItems.length} />
      </div>

      {stats.monthData.length > 1 && (
        <TornCard style={{ padding: 22 }}>
          <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Gasto por mês</p>
          <div style={{ height: 220, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthData}>
                <CartesianGrid stroke={LINE} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={{ stroke: LINE }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v) => [`R$ ${fmtBRL(v)}`, "Gasto"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }} />
                <Bar dataKey="total" fill={INK} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {delta && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              {delta.diff >= 0 ? <ArrowUpRight color={RED} size={16} /> : <ArrowDownRight color={GREEN} size={16} />}
              <span style={{ color: delta.diff >= 0 ? RED : GREEN, fontWeight: 700 }}>
                {delta.diff >= 0 ? "Déficit" : "Economia"} de R$ {fmtBRL(Math.abs(delta.diff))}
              </span>
              <span style={{ color: INK_SOFT }}>em relação ao mês anterior ({delta.pct >= 0 ? "+" : ""}{delta.pct.toFixed(0)}%)</span>
            </div>
          )}
        </TornCard>
      )}

      <TornCard style={{ padding: 22 }}>
        <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Meta mensal</p>
        <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 10px" }}>Defina um orçamento para ver se está no azul ou no vermelho.</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="R$ 800,00"
            style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, width: 140, background: "#FFFDF8" }}
          />
          {budgetDiff !== null && (
            <span style={{ fontSize: 13, fontWeight: 700, color: budgetDiff > 0 ? RED : GREEN, display: "flex", alignItems: "center", gap: 6 }}>
              {budgetDiff > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {budgetDiff > 0 ? `Déficit de R$ ${fmtBRL(budgetDiff)}` : `Superávit de R$ ${fmtBRL(Math.abs(budgetDiff))}`} no último mês
            </span>
          )}
        </div>
      </TornCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        {stats.maisCaro && (
          <TornCard style={{ padding: 20 }}>
            <p style={{ fontSize: 11, color: INK_SOFT, letterSpacing: 0.5, margin: 0 }}>PRODUTO MAIS CARO</p>
            <p className="disp" style={{ fontSize: 17, fontWeight: 700, margin: "6px 0 2px" }}>{stats.maisCaro.name}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: RED, margin: 0 }}>R$ {fmtBRL(stats.maisCaro.unitPrice)} <span style={{ fontSize: 12, fontWeight: 400, color: INK_SOFT }}>/{stats.maisCaro.unit}</span></p>
          </TornCard>
        )}
        {stats.maisBarato && (
          <TornCard style={{ padding: 20 }}>
            <p style={{ fontSize: 11, color: INK_SOFT, letterSpacing: 0.5, margin: 0 }}>PRODUTO MAIS BARATO</p>
            <p className="disp" style={{ fontSize: 17, fontWeight: 700, margin: "6px 0 2px" }}>{stats.maisBarato.name}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: GREEN, margin: 0 }}>R$ {fmtBRL(stats.maisBarato.unitPrice)} <span style={{ fontSize: 12, fontWeight: 400, color: INK_SOFT }}>/{stats.maisBarato.unit}</span></p>
          </TornCard>
        )}
      </div>

      {repeatedProducts.length > 0 && (
        <TornCard style={{ padding: 22 }}>
          <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Variação de preço por produto</p>
          <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 12px" }}>Produtos comprados mais de uma vez — clique em um para ver a evolução do preço ao longo do tempo.</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {repeatedProducts.slice(0, 12).map((p, i) => {
              const isActive = p.name === activeProductName;
              return (
                <div
                  key={p.name}
                  onClick={() => setSelectedProduct(p.name)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    margin: "0 -10px",
                    borderRadius: 6,
                    borderBottom: `1px dotted ${LINE}`,
                    fontSize: 12.5,
                    cursor: "pointer",
                    background: isActive ? PAPER_DARK : "transparent",
                  }}
                >
                  <span style={{ flex: 1, fontWeight: isActive ? 700 : 400 }}>{p.name} <span style={{ color: INK_SOFT, fontWeight: 400 }}>({p.count}x)</span></span>
                  <span style={{ color: INK_SOFT, marginRight: 10 }}>min R$ {fmtBRL(p.min)}</span>
                  <span style={{ fontWeight: 600, color: p.variou ? GOLD : INK }}>max R$ {fmtBRL(p.max)}</span>
                </div>
              );
            })}
          </div>
        </TornCard>
      )}

      {activeProductName && priceHistory.length > 1 && (
        <TornCard style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Histórico de preço</p>
              <p style={{ fontSize: 12.5, color: INK_SOFT, margin: 0 }}>{activeProductName}</p>
            </div>
            <select
              value={activeProductName}
              onChange={(e) => setSelectedProduct(e.target.value)}
              style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, background: "#FFFDF8", color: INK }}
            >
              {repeatedProducts.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ height: 200, marginTop: 14 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceHistory}>
                <CartesianGrid stroke={LINE} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={{ stroke: LINE }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(v) => [`R$ ${fmtBRL(v)}`, "Preço"]}
                  labelFormatter={(label, payload) => {
                    const loja = payload && payload[0] && payload[0].payload ? payload[0].payload.loja : "";
                    return loja ? `${label} · ${loja}` : label;
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }}
                />
                <Line type="monotone" dataKey="price" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 10 }}>
            Menor preço: R$ {fmtBRL(Math.min(...priceHistory.map((h) => h.price)))} · Maior preço: R$ {fmtBRL(Math.max(...priceHistory.map((h) => h.price)))}
          </p>
        </TornCard>
      )}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div style={{ background: PAPER_DARK, border: `1px solid ${LINE}`, borderRadius: 10, padding: "14px 16px" }}>
      <p style={{ fontSize: 10.5, color: INK_SOFT, letterSpacing: 0.5, margin: 0 }}>{label.toUpperCase()}</p>
      <p className="disp" style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0" }}>{value}</p>
    </div>
  );
}