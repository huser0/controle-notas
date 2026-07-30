import { forwardRef, useImperativeHandle, useRef, useCallback } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { OCR_HTML } from "../lib/ocrHtml";

// WebView invisível que executa o OCR. A tela não precisa saber que existe uma
// WebView aqui dentro: chama `ref.current.runOcr({ kind, base64 })` e recebe o
// andamento pelos callbacks.
//
// O baseUrl https é necessário para os scripts de CDN carregarem — sem uma
// origem válida a página fica como "about:blank" e o carregamento é bloqueado.
const OcrWebView = forwardRef(function OcrWebView(
  { onStatus, onProgress, onResult, onError },
  ref
) {
  const webRef = useRef(null);

  useImperativeHandle(ref, () => ({
    runOcr(payload) {
      if (!webRef.current) {
        onError?.("O leitor ainda não está pronto. Tente de novo em alguns segundos.");
        return;
      }
      webRef.current.postMessage(JSON.stringify(payload));
    },
  }));

  const handleMessage = useCallback(
    (event) => {
      let msg;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      // A mensagem inteira vai junto: em PDF ela traz page/pages para o progresso.
      if (msg.type === "status") onStatus?.(msg.status, msg);
      else if (msg.type === "progress") onProgress?.(msg.progress);
      else if (msg.type === "result") onResult?.(msg.text);
      else if (msg.type === "error") onError?.(msg.message);
    },
    [onStatus, onProgress, onResult, onError]
  );

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }} pointerEvents="none">
      <WebView
        ref={webRef}
        source={{ html: OCR_HTML, baseUrl: "https://localhost/" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onError={(e) =>
          onError?.(e?.nativeEvent?.description || "Falha ao abrir o leitor de PDF.")
        }
        // O OCR é pesado; sem isto o iOS pode descartar a WebView em segundo plano
        androidLayerType="software"
        cacheEnabled
      />
    </View>
  );
});

export default OcrWebView;
