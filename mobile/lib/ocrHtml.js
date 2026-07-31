// Página que roda dentro da WebView invisível para fazer o OCR.
//
// pdf.js precisa de <canvas> e tesseract.js de WebAssembly com workers — nada
// disso existe no runtime do React Native, então rodamos o pipeline dentro de
// uma WebView, que é um navegador de verdade.
//
// ATENÇÃO: este pipeline é um espelho do que existe em src/App.jsx (funções
// ensurePdfJs / pdfToCanvases / preprocessCanvasForOcr / ocrCanvases) no app
// web. Ajuste de OCR feito lá precisa ser refletido aqui, e vice-versa. Não dá
// para compartilhar de fato: o web importa como módulo e aqui o código precisa
// ser texto injetável, e o Metro não converte um no outro.
//
// Protocolo de mensagens:
//   RN  -> web:  { kind: "pdf" | "image" | "tag", base64, scale? }
//   web -> RN :  { type: "status", status, page?, pages? }
//                { type: "progress", progress }    0..1
//                { type: "result", text }
//                { type: "error", message }

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

// Mesma escala do app web. O botão "tentar de novo em alta qualidade" manda
// `scale` no payload para subir isso pontualmente.
export const PDF_SCALE = 3;
export const PDF_SCALE_ALTA = 4;

// Modo de segmentação do Tesseract (PSM). O padrão é 3 (automático), que tende a
// se atrapalhar com cupom. 4 = coluna única de texto com tamanhos variados,
// adequado a nota fiscal; 6 = bloco único e uniforme, melhor para etiqueta.
// Se a precisão piorar, é aqui que se mexe — e só aqui.
const PSM_CUPOM = "4";
const PSM_ETIQUETA = "6";

export const OCR_HTML = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body>
<script>
var send = function (obj) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
};

window.onerror = function (msg) { send({ type: "error", message: String(msg) }); };

function loadScriptOnce(src) {
  return new Promise(function (resolve, reject) {
    if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
    var s = document.createElement("script");
    s.src = src;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error("Falha ao carregar " + src)); };
    document.head.appendChild(s);
  });
}

async function ensurePdfJs() {
  if (!window.pdfjsLib) await loadScriptOnce(${JSON.stringify(PDFJS)});
  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(PDFJS_WORKER)};
  }
}

async function ensureTesseract() {
  if (!window.Tesseract) await loadScriptOnce(${JSON.stringify(TESSERACT)});
}

function base64ToBytes(b64) {
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Solta a memória do canvas assim que ele deixa de ser necessário. Em nota de
// várias páginas na escala 3 isso é o que evita a WebView ser derrubada.
function liberar(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

// Converte para escala de cinza e estica o contraste (o pixel mais escuro vira
// preto, o mais claro vira branco). Ajuda o Tesseract em PDFs de "Imprimir em
// PDF" e em fotos, que costumam ter contraste baixo.
function preprocessCanvasForOcr(sourceCanvas) {
  var w = sourceCanvas.width, h = sourceCanvas.height;
  var out = document.createElement("canvas");
  out.width = w; out.height = h;
  var ctx = out.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);
  var imgData = ctx.getImageData(0, 0, w, h);
  var d = imgData.data;
  var min = 255, max = 0, i, gray;
  for (i = 0; i < d.length; i += 4) {
    gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  var range = Math.max(max - min, 1);
  for (i = 0; i < d.length; i += 4) {
    var v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return out;
}

function imageToCanvas(dataUrl) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = function () { reject(new Error("Não foi possível abrir a imagem")); };
    img.src = dataUrl;
  });
}

async function criarWorker(psm) {
  await ensureTesseract();
  var worker = await window.Tesseract.createWorker("por", 1, {
    logger: function (m) {
      if (m.status === "recognizing text") send({ type: "progress", progress: m.progress || 0 });
    }
  });
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    // Sem isto o Tesseract chuta o DPI e avisa; informar melhora o resultado.
    user_defined_dpi: "300"
  });
  return worker;
}

async function lerCanvas(worker, canvas) {
  var proc = preprocessCanvasForOcr(canvas);
  liberar(canvas);
  var res = await worker.recognize(proc);
  liberar(proc);
  return (res && res.data && res.data.text) || "";
}

// Página a página: renderiza, lê e libera antes de ir para a próxima, em vez de
// acumular todos os canvases em memória.
async function ocrPdf(bytes, scale) {
  var pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  var worker = await criarWorker(${JSON.stringify(PSM_CUPOM)});
  var fullText = "";
  try {
    for (var i = 1; i <= pdf.numPages; i++) {
      send({ type: "status", status: "renderizando", page: i, pages: pdf.numPages });
      var page = await pdf.getPage(i);
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
      send({ type: "status", status: "lendo", page: i, pages: pdf.numPages });
      fullText += (await lerCanvas(worker, canvas)) + "\\n";
      if (page.cleanup) page.cleanup();
    }
  } finally {
    await worker.terminate();
  }
  return fullText;
}

async function ocrImagem(base64, psm) {
  var worker = await criarWorker(psm);
  try {
    send({ type: "status", status: "lendo" });
    var canvas = await imageToCanvas("data:image/jpeg;base64," + base64);
    return await lerCanvas(worker, canvas);
  } finally {
    await worker.terminate();
  }
}

async function run(payload) {
  try {
    var text;
    if (payload.kind === "pdf") {
      send({ type: "status", status: "carregando" });
      await ensurePdfJs();
      text = await ocrPdf(base64ToBytes(payload.base64), payload.scale || ${PDF_SCALE});
    } else {
      send({ type: "status", status: "carregando" });
      text = await ocrImagem(
        payload.base64,
        payload.kind === "tag" ? ${JSON.stringify(PSM_ETIQUETA)} : ${JSON.stringify(PSM_CUPOM)}
      );
    }
    send({ type: "result", text: text });
  } catch (e) {
    send({ type: "error", message: (e && e.message) ? e.message : String(e) });
  }
}

function onMessage(ev) {
  var payload;
  try { payload = JSON.parse(ev.data); } catch (e) { return; }
  if (payload && payload.base64) run(payload);
}

// iOS entrega em window, Android em document — registramos nos dois.
window.addEventListener("message", onMessage);
document.addEventListener("message", onMessage);
send({ type: "status", status: "pronto" });
</script>
</body>
</html>`;

export default OCR_HTML;
