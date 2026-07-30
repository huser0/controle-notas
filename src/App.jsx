import "./storage";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Receipt, Plus, BarChart3, Trash2, ScanLine, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Loader2, X, Check, AlertCircle, FileUp, Download } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { exportNotasXlsx } from "./exportNotas";
import ErrorBoundary from "./ErrorBoundary";
import { toNumber, parseReceiptText, extractLoja } from "shared/parse";
import { fmtBRL, fmtDateBR, todayISO } from "shared/format";
import { computeStats, buildPriceHistory } from "shared/stats";

const INK = "#241F1A";
const INK_SOFT = "#6E655A";
const PAPER = "#F6F1E6";
const PAPER_DARK = "#EDE5D3";
const LINE = "#D8CFBB";
const RED = "#AE3B2E";
const GREEN = "#4C7A5A";
const GOLD = "#B8863A";

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

// ATENÇÃO: o bloco de OCR abaixo (loadScriptOnce ... extractTextFromPdf) tem um
// espelho em mobile/lib/ocrHtml.js, que roda o mesmo pipeline dentro de uma
// WebView no app mobile. Ajuste feito aqui precisa ser refletido lá. Não dá para
// compartilhar de fato: aqui é módulo, lá precisa ser texto injetável na página.
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

async function pdfToCanvases(file, scale = 3) {
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

// PDFs gerados por "Imprimir em PDF" (comum no Safari/iOS) costumam sair com
// contraste mais baixo e texto levemente borrado, o que atrapalha o OCR.
// Aqui convertemos para escala de cinza e esticamos o contraste (o pixel mais
// escuro vira preto, o mais claro vira branco), o que ajuda o Tesseract a
// distinguir melhor as letras nesses PDFs de qualidade inferior.
function preprocessCanvasForOcr(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = Math.max(max - min, 1);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return out;
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
    const procCanvas = preprocessCanvasForOcr(canvas);
    const { data } = await worker.recognize(procCanvas);
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
      className="torn-card"
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

  const stats = useMemo(() => computeStats(notas), [notas]);

  const budgetNum = toNumber(budget);
  const lastMonthTotal = stats.monthData.length ? stats.monthData[stats.monthData.length - 1].total : 0;
  const budgetDiff = budgetNum ? lastMonthTotal - budgetNum : null;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER, fontFamily: "Georgia, serif", color: INK, fontSize: 14, padding: "0 20px", textAlign: "center" }}>
        <Loader2 className="animate-spin" size={20} style={{ marginRight: 10, flexShrink: 0 }} />
        Carregando suas notas...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'Courier New', ui-monospace, monospace", color: INK }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html { -webkit-text-size-adjust: 100%; }
        .disp { font-family: Georgia, 'Times New Roman', serif; }
        .tabbtn { transition: all .15s ease; -webkit-user-select: none; user-select: none; }
        .tabbtn:hover { transform: translateY(-1px); }
        input, textarea, button, select { font-family: inherit; font-size: 16px; }
        input:focus, textarea:focus, select:focus { outline: 2px solid ${GOLD}; outline-offset: 1px; }
        ::-webkit-scrollbar { width: 8px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${LINE}; border-radius: 4px; }
        .app-header { padding: 24px 20px 18px; }
        .app-main { padding: 20px 20px 60px; }
        .app-nav { padding: 16px 20px 0; gap: 8px; }
        .nav-scroll { display: flex; gap: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 2px; }
        .nav-scroll::-webkit-scrollbar { display: none; }
        .card-pad { padding: 18px 22px 18px; }
        .card-pad-top { padding: 18px 22px 0; }
        .h1-title { font-size: 24px; }
        .btn-touch { min-height: 40px; }
        @media (max-width: 640px) {
          body { -webkit-text-size-adjust: 100%; }
          #root, .site-root { border-inline: none !important; }
          .app-header { padding: 18px 14px 14px; }
          .app-header .brand-row { gap: 10px; }
          .app-header .brand-icon { width: 38px; height: 38px; border-radius: 9px; }
          .h1-title { font-size: 21px; letter-spacing: 0; }
          .app-nav { padding: 12px 14px 0; }
          .tabbtn { padding: 8px 13px !important; font-size: 12.5px !important; flex: 0 0 auto; }
          .app-main { padding: 14px 14px 48px; }
          .card-pad, .card-pad-top { padding-left: 15px !important; padding-right: 15px !important; }
          .stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .details-row { flex-direction: column !important; align-items: stretch !important; }
          .details-row > label { flex: 1 1 auto !important; }
          .item-form-row { flex-direction: column !important; align-items: stretch !important; }
          .item-form-row > label { flex: 1 1 auto !important; }
          .item-form-row button { width: 100%; justify-content: center; padding: 10px !important; }
          .save-row { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .save-row button { width: 100%; justify-content: center; padding: 12px !important; }
          .nota-head { flex-direction: column !important; gap: 10px; }
          .nota-head .nota-total { text-align: left !important; }
          .chart-box { height: 180px !important; }
        }
      `}</style>

      <header className="app-header" style={{ borderBottom: `1px dashed ${LINE}` }}>
        <div className="brand-row" style={{ maxWidth: 880, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div className="brand-icon" style={{ width: 46, height: 46, borderRadius: 10, background: INK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Receipt color={PAPER} size={22} />
          </div>
          <h1 className="disp h1-title" style={{ fontSize: 26, margin: 0, color: "#222", fontWeight: 700, letterSpacing: 0.2 }}>Livro de Notas</h1>
        </div>
      </header>

      <nav className="app-nav" style={{ maxWidth: 880, margin: "0 auto", display: "flex" }}>
        <div className="nav-scroll" style={{ width: "100%" }}>
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
                className="tabbtn btn-touch"
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
                  whiteSpace: "nowrap",
                }}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="app-main" style={{ maxWidth: 880, margin: "0 auto" }}>
        {saveError && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#F6E4E1", border: `1px solid ${RED}`, color: RED, padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} /> {saveError}
          </div>
        )}

        {tab === "notas" && (
          <ErrorBoundary key="notas" label="lista de notas">
            <NotasTab notas={notas} expanded={expanded} setExpanded={setExpanded} onDelete={deleteNota} />
          </ErrorBoundary>
        )}
        {tab === "add" && (
          <ErrorBoundary key="add" label="adicionar nota">
            <AddTab onSave={addNota} onDone={() => setTab("notas")} />
          </ErrorBoundary>
        )}
        {tab === "analise" && (
          <ErrorBoundary key="analise" label="análise">
            <AnaliseTab
              notas={notas}
              stats={stats}
              budget={budget}
              setBudget={saveBudget}
              budgetDiff={budgetDiff}
            />
          </ErrorBoundary>
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

  const handleExport = useCallback(() => exportNotasXlsx(filtered), [filtered]);

  if (!notas.length) {
    return (
      <div style={{ textAlign: "center", padding: "50px 16px", color: INK_SOFT }}>
        <ScanLine size={32} style={{ marginBottom: 10, opacity: 0.6 }} />
        <p className="disp" style={{ fontSize: 16, color: INK, margin: "0 0 4px" }}>Nenhuma nota guardada ainda</p>
        <p style={{ fontSize: 13, margin: 0 }}>Vá em "Adicionar" e cole o texto da sua nota fiscal.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por loja ou produto (ex: Sendas)"
          style={{
            width: "100%",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            padding: "11px 14px",
            fontSize: 14,
            background: "#FFFDF8",
          }}
        />
        <button
          onClick={handleExport}
          disabled={!filtered.length}
          className="btn-touch"
          style={{
            alignSelf: "flex-end",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            padding: "9px 14px",
            fontSize: 12.5,
            background: "#FFFDF8",
            color: INK,
            cursor: filtered.length ? "pointer" : "not-allowed",
            opacity: filtered.length ? 1 : 0.5,
          }}
        >
          <Download size={14} /> Baixar Excel ({filtered.length} {filtered.length === 1 ? "nota" : "notas"})
        </button>
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
            <div className="card-pad-top">
              <div className="nota-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <p className="disp" style={{ fontSize: 17, fontWeight: 700, margin: 0, overflowWrap: "break-word" }}>
                    {n.loja || "Compra"}
                  </p>
                  <p style={{ fontSize: 12, color: INK_SOFT, margin: "3px 0 0" }}>
                    <span>{fmtDateBR(n.date) || "sem data"}</span> · <span>{(n.items || []).length} itens</span>
                  </p>
                </div>
                <div className="nota-total" style={{ textAlign: "right", flexShrink: 0 }}>
                  {n.desconto > 0 && (
                    <p style={{ fontSize: 11.5, color: INK_SOFT, textDecoration: "line-through", margin: 0 }}>
                      R$ {fmtBRL(n.valorTotal)}
                    </p>
                  )}
                  <p style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>R$ {fmtBRL(total)}</p>
                  {n.desconto > 0 && (
                    <p style={{ fontSize: 11, color: GREEN, margin: "2px 0 0" }}>
                      desconto de R$ {fmtBRL(n.desconto)}
                    </p>
                  )}
                  <button
                    onClick={() => onDelete(n.id)}
                    style={{ marginTop: 4, background: "none", border: "none", color: RED, fontSize: 11.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, padding: 4 }}
                  >
                    <Trash2 size={12} /> excluir
                  </button>
                </div>
              </div>

              <button
                onClick={() => setExpanded(isOpen ? null : n.id)}
                className="btn-touch"
                style={{ marginTop: 12, background: "none", border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer", color: INK }}
              >
                {isOpen ? "ocultar itens" : "ver itens"}
              </button>

              {isOpen && (
                <div style={{ marginTop: 12, borderTop: `1px dashed ${LINE}`, paddingTop: 10 }}>
                  {(n.items || []).map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "6px 0", borderBottom: i < n.items.length - 1 ? `1px dotted ${LINE}` : "none" }}>
                      <span style={{ color: INK, minWidth: 0, overflowWrap: "break-word" }}>{it.name} <span style={{ color: INK_SOFT }}>x{it.qty}{it.unit}</span></span>
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>R$ {fmtBRL(it.total)}</span>
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
      } else if (r.qtdItensEsperada && r.qtdItensEsperada !== r.items.length) {
        setPdfError(`A nota indica ${r.qtdItensEsperada} itens, mas só reconheci ${r.items.length}. Isso é comum quando o PDF vem de um "Imprimir em PDF" do celular (qualidade mais baixa) — confira o texto lido abaixo e complete os itens que faltarem manualmente.`);
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

  const pdfEmAndamento = pdfStatus === "carregando" || pdfStatus === "renderizando" || pdfStatus === "lendo";
  // Um único texto dentro de um <span> próprio: o React atualiza por textContent
  // em vez de remover/inserir nós de texto irmãos, que é onde o "removeChild"
  // estourava quando algo externo (tradutor do navegador, extensão) mexia no DOM.
  const pdfLabel =
    pdfStatus === "carregando" ? "Preparando leitor..."
      : pdfStatus === "renderizando" ? "Abrindo PDF..."
        : pdfStatus === "lendo" ? `Lendo nota (OCR)... ${Math.round(pdfProgress * 100)}%`
          : "Escolher PDF da nota";

  const handleSave = async () => {
    if (!manualItems.length) return;
    setSaving(true);
    const ok = await onSave({
      loja: loja.trim(),
      date: date || todayISO(),
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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <TornCard>
        <div className="card-pad">
          <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Enviar PDF da nota</p>
          <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 12px" }}>
            Envie o PDF baixado da consulta da NFC-e. Como esse PDF costuma ser uma imagem da página (sem texto selecionável), o app lê o conteúdo por OCR direto no seu navegador — pode levar alguns segundos.
          </p>
          <p style={{ fontSize: 11.5, color: INK_SOFT, background: PAPER_DARK, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px", margin: "0 0 12px", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0, color: GOLD }} />
            Dica: no iPhone, o "Imprimir → Salvar em PDF" do Safari costuma gerar um PDF de qualidade mais baixa que o do PC, o que atrapalha o OCR. Se possível, use o botão de baixar/compartilhar PDF da própria página da NFC-e (quando existir), ou copie o texto da página no Safari e cole no campo abaixo em vez de enviar o PDF.
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
            className="btn-touch"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: pdfStatus && pdfStatus !== "erro" ? LINE : INK,
              color: pdfStatus && pdfStatus !== "erro" ? INK_SOFT : PAPER,
              border: "none",
              padding: "10px 16px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              cursor: pdfStatus && pdfStatus !== "erro" ? "default" : "pointer",
            }}
          >
            {pdfEmAndamento ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileUp size={15} />
            )}
            <span>{pdfLabel}</span>
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
        </div>
      </TornCard>

      <TornCard>
        <div className="card-pad">
          <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Colar texto da nota</p>
          <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 12px" }}>
            Ou, se preferir, cole aqui o texto da nota fiscal (mesmo formato do cupom eletrônico) e clique em "Ler nota". Esse é o mesmo campo preenchido automaticamente ao enviar o PDF acima — dá pra revisar e reprocessar.
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"PALHA BIG TOSTY 80G (Código: 1111681 )\nQtde.:1   UN: PC   Vl. Unit.:   5,99\tVl. Total\n5,99\n..."}
            style={{ width: "100%", minHeight: 130, border: `1px solid ${LINE}`, borderRadius: 8, padding: 12, fontSize: 13, background: "#FFFDF8", resize: "vertical" }}
          />
          <button
            onClick={handleParse}
            disabled={!raw.trim()}
            className="btn-touch"
            style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 7, background: raw.trim() ? INK : LINE, color: raw.trim() ? PAPER : INK_SOFT, border: "none", padding: "10px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: raw.trim() ? "pointer" : "default" }}
          >
            <ScanLine size={15} /> Ler nota
          </button>
          {parsed && parsed.items.length === 0 && (
            <p style={{ fontSize: 12, color: RED, marginTop: 8 }}>Não consegui reconhecer itens nesse texto — adicione manualmente abaixo.</p>
          )}
          {parsed && parsed.items.length > 0 && parsed.qtdItensEsperada && parsed.qtdItensEsperada !== parsed.items.length && (
            <p style={{ fontSize: 12, color: GOLD, marginTop: 8, display: "flex", alignItems: "flex-start", gap: 5 }}>
              <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> A nota indica {parsed.qtdItensEsperada} itens, mas só reconheci {parsed.items.length} — confira o texto e complete manualmente os que faltarem.
            </p>
          )}
          {parsed && parsed.items.length > 0 && (!parsed.qtdItensEsperada || parsed.qtdItensEsperada === parsed.items.length) && (
            <p style={{ fontSize: 12, color: GREEN, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <Check size={13} /> {parsed.items.length} itens reconhecidos
            </p>
          )}
        </div>
      </TornCard>

      <TornCard>
        <div className="card-pad">
          <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Detalhes da compra</p>
          <div className="details-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: INK_SOFT, flex: "1 1 200px" }}>
              Loja / mercado
              <input value={loja} onChange={(e) => setLoja(e.target.value)} placeholder="ex: Supermercado Bom Preço" style={{ display: "block", width: "100%", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 6, padding: "9px 10px", fontSize: 14, background: "#FFFDF8" }} />
            </label>
            <label style={{ fontSize: 12, color: INK_SOFT, flex: "1 1 150px" }}>
              Data
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 6, padding: "9px 10px", fontSize: 14, background: "#FFFDF8" }} />
            </label>
            <label style={{ fontSize: 12, color: INK_SOFT, flex: "1 1 130px" }}>
              Desconto (R$)
              <input value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" style={{ display: "block", width: "100%", marginTop: 4, border: `1px solid ${LINE}`, borderRadius: 6, padding: "9px 10px", fontSize: 14, background: "#FFFDF8" }} />
            </label>
          </div>

          <p className="disp" style={{ fontSize: 14, fontWeight: 700, margin: "18px 0 8px" }}>Itens ({manualItems.length})</p>
          <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${LINE}`, borderRadius: 8 }}>
            {manualItems.length === 0 && (
              <p style={{ fontSize: 12, color: INK_SOFT, padding: 14, margin: 0 }}>Nenhum item ainda.</p>
            )}
            {manualItems.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < manualItems.length - 1 ? `1px dotted ${LINE}` : "none", fontSize: 12.5 }}>
                <span style={{ minWidth: 0, overflowWrap: "break-word" }}>{it.name} <span style={{ color: INK_SOFT }}>x{it.qty}{it.unit} · R$ {fmtBRL(it.unitPrice)}/un</span></span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontWeight: 600 }}>R$ {fmtBRL(it.total)}</span>
                  <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: RED, cursor: "pointer", padding: 4 }}><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="item-form-row" style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 11, color: INK_SOFT, flex: "2 1 160px" }}>
              Produto
              <input value={newItem.name} onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 9px", fontSize: 13.5, background: "#FFFDF8" }} />
            </label>
            <label style={{ fontSize: 11, color: INK_SOFT, flex: "1 1 70px" }}>
              Qtd
              <input value={newItem.qty} onChange={(e) => setNewItem((v) => ({ ...v, qty: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 9px", fontSize: 13.5, background: "#FFFDF8" }} />
            </label>
            <label style={{ fontSize: 11, color: INK_SOFT, flex: "1 1 70px" }}>
              Un.
              <input value={newItem.unit} onChange={(e) => setNewItem((v) => ({ ...v, unit: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 9px", fontSize: 13.5, background: "#FFFDF8" }} />
            </label>
            <label style={{ fontSize: 11, color: INK_SOFT, flex: "1 1 90px" }}>
              Preço unit.
              <input value={newItem.unitPrice} onChange={(e) => setNewItem((v) => ({ ...v, unitPrice: e.target.value }))} placeholder="0,00" style={{ display: "block", width: "100%", marginTop: 3, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 9px", fontSize: 13.5, background: "#FFFDF8" }} />
            </label>
            <button onClick={addManualItem} className="btn-touch" style={{ background: PAPER_DARK, border: `1px solid ${LINE}`, borderRadius: 6, padding: "9px 12px", fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
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
            <div className="save-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p className="disp" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                {descontoNum > 0 ? "Total a pagar" : "Total"}: R$ {fmtBRL(total)}
              </p>
              <button
                onClick={handleSave}
                disabled={!manualItems.length || saving}
                className="btn-touch"
                style={{ background: manualItems.length ? INK : LINE, color: manualItems.length ? PAPER : INK_SOFT, border: "none", padding: "11px 20px", borderRadius: 7, fontSize: 13.5, fontWeight: 700, cursor: manualItems.length ? "pointer" : "default", display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Guardar nota
              </button>
            </div>
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

  const priceHistory = useMemo(
    () => buildPriceHistory(stats.allItems, activeProductName),
    [stats.allItems, activeProductName]
  );

  if (!notas.length) {
    return (
      <div style={{ textAlign: "center", padding: "50px 16px", color: INK_SOFT }}>
        <BarChart3 size={32} style={{ marginBottom: 10, opacity: 0.6 }} />
        <p className="disp" style={{ fontSize: 16, color: INK, margin: "0 0 4px" }}>Sem dados para analisar ainda</p>
        <p style={{ fontSize: 13, margin: 0 }}>Adicione ao menos uma nota para ver os números.</p>
      </div>
    );
  }

  const { delta } = stats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <StatBox label="Total gasto" value={`R$ ${fmtBRL(stats.totalGasto)}`} />
        <StatBox label="Notas guardadas" value={notas.length} />
        <StatBox label="Itens comprados" value={stats.allItems.length} />
      </div>

      {stats.monthData.length > 1 && (
        <TornCard>
          <div className="card-pad">
            <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Gasto por mês</p>
            <div className="chart-box" style={{ height: 220, marginTop: 10 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthData} margin={{ left: -18, right: 4 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={{ stroke: LINE }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: INK_SOFT }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip formatter={(v) => [`R$ ${fmtBRL(v)}`, "Gasto"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${LINE}` }} />
                  <Bar dataKey="total" fill={INK} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {delta && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
                {delta.diff >= 0 ? <ArrowUpRight color={RED} size={16} style={{ flexShrink: 0 }} /> : <ArrowDownRight color={GREEN} size={16} style={{ flexShrink: 0 }} />}
                <span style={{ color: delta.diff >= 0 ? RED : GREEN, fontWeight: 700 }}>
                  {delta.diff >= 0 ? "Déficit" : "Economia"} de R$ {fmtBRL(Math.abs(delta.diff))}
                </span>
                <span style={{ color: INK_SOFT }}>em relação ao mês anterior ({delta.pct >= 0 ? "+" : ""}{delta.pct.toFixed(0)}%)</span>
              </div>
            )}
          </div>
        </TornCard>
      )}

      <TornCard>
        <div className="card-pad">
          <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Meta mensal</p>
          <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 10px" }}>Defina um orçamento para ver se está no azul ou no vermelho.</p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="R$ 800,00"
              style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "9px 10px", fontSize: 14, width: 140, background: "#FFFDF8" }}
            />
            {budgetDiff !== null && (
              <span style={{ fontSize: 13, fontWeight: 700, color: budgetDiff > 0 ? RED : GREEN, display: "flex", alignItems: "center", gap: 6 }}>
                {budgetDiff > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {budgetDiff > 0 ? `Déficit de R$ ${fmtBRL(budgetDiff)}` : `Superávit de R$ ${fmtBRL(Math.abs(budgetDiff))}`} no último mês
              </span>
            )}
          </div>
        </div>
      </TornCard>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        {stats.maisCaro && (
          <TornCard>
            <div className="card-pad" style={{ paddingTop: 20 }}>
              <p style={{ fontSize: 11, color: INK_SOFT, letterSpacing: 0.5, margin: 0 }}>PRODUTO MAIS CARO</p>
              <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "6px 0 2px", overflowWrap: "break-word" }}>{stats.maisCaro.name}</p>
              <p style={{ fontSize: 19, fontWeight: 700, color: RED, margin: 0 }}>R$ {fmtBRL(stats.maisCaro.unitPrice)} <span style={{ fontSize: 12, fontWeight: 400, color: INK_SOFT }}>/{stats.maisCaro.unit}</span></p>
            </div>
          </TornCard>
        )}
        {stats.maisBarato && (
          <TornCard>
            <div className="card-pad" style={{ paddingTop: 20 }}>
              <p style={{ fontSize: 11, color: INK_SOFT, letterSpacing: 0.5, margin: 0 }}>PRODUTO MAIS BARATO</p>
              <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "6px 0 2px", overflowWrap: "break-word" }}>{stats.maisBarato.name}</p>
              <p style={{ fontSize: 19, fontWeight: 700, color: GREEN, margin: 0 }}>R$ {fmtBRL(stats.maisBarato.unitPrice)} <span style={{ fontSize: 12, fontWeight: 400, color: INK_SOFT }}>/{stats.maisBarato.unit}</span></p>
            </div>
          </TornCard>
        )}
      </div>

      {repeatedProducts.length > 0 && (
        <TornCard>
          <div className="card-pad">
            <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Variação de preço por produto</p>
            <p style={{ fontSize: 12.5, color: INK_SOFT, margin: "0 0 12px" }}>Produtos comprados mais de uma vez — toque em um para ver a evolução do preço ao longo do tempo.</p>
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
                      gap: 8,
                      padding: "9px 10px",
                      margin: "0 -10px",
                      borderRadius: 6,
                      borderBottom: `1px dotted ${LINE}`,
                      fontSize: 12.5,
                      cursor: "pointer",
                      background: isActive ? PAPER_DARK : "transparent",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "break-word", fontWeight: isActive ? 700 : 400 }}>{p.name} <span style={{ color: INK_SOFT, fontWeight: 400 }}>({p.count}x)</span></span>
                    <span style={{ color: INK_SOFT, flexShrink: 0 }}>min R$ {fmtBRL(p.min)}</span>
                    <span style={{ fontWeight: 600, color: p.variou ? GOLD : INK, flexShrink: 0 }}>max R$ {fmtBRL(p.max)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </TornCard>
      )}

      {activeProductName && priceHistory.length > 1 && (
        <TornCard>
          <div className="card-pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <p className="disp" style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Histórico de preço</p>
                <p style={{ fontSize: 12.5, color: INK_SOFT, margin: 0, overflowWrap: "break-word" }}>{activeProductName}</p>
              </div>
              <select
                value={activeProductName}
                onChange={(e) => setSelectedProduct(e.target.value)}
                style={{ border: `1px solid ${LINE}`, borderRadius: 6, padding: "7px 10px", fontSize: 13, background: "#FFFDF8", color: INK, maxWidth: "100%" }}
              >
                {repeatedProducts.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="chart-box" style={{ height: 200, marginTop: 14 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceHistory} margin={{ left: -18, right: 4 }}>
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
          </div>
        </TornCard>
      )}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div style={{ background: PAPER_DARK, border: `1px solid ${LINE}`, borderRadius: 10, padding: "13px 14px" }}>
      <p style={{ fontSize: 10, color: INK_SOFT, letterSpacing: 0.5, margin: 0 }}>{label.toUpperCase()}</p>
      <p className="disp" style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 0" }}>{value}</p>
    </div>
  );
}