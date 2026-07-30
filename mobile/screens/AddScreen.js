import { useState, useRef, useCallback } from "react";
import { View, Text, TextInput, Pressable, Platform, ActivityIndicator } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { ScanLine, Check, X, Plus, AlertCircle, FileUp, Camera } from "lucide-react-native";
import TornCard from "../components/TornCard";
import OcrWebView from "../components/OcrWebView";
import { parseReceiptText, extractLoja, toNumber } from "shared/parse";
import { fmtBRL, fmtDateBR, todayISO } from "shared/format";
import { INK, INK_SOFT, LINE, RED, GOLD, PAPER, PAPER_DARK, FIELD } from "../theme";
import * as theme from "../theme";

export default function AddScreen({ onSave, onDone }) {
  const [raw, setRaw] = useState("");
  const [loja, setLoja] = useState("");
  const [date, setDate] = useState("");
  const [desconto, setDesconto] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualItems, setManualItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", qty: "1", unit: "Un", unitPrice: "" });
  const [showPicker, setShowPicker] = useState(false);
  const [parseWarning, setParseWarning] = useState("");

  // OCR
  const ocrRef = useRef(null);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState("");

  // Miolo comum aos três caminhos de entrada: colar texto, PDF e foto.
  const applyParsedText = useCallback((text, { fromOcr = false } = {}) => {
    const r = parseReceiptText(text);
    if (r.date) setDate(r.date);
    setManualItems(r.items);
    setDesconto(r.desconto ? String(r.desconto).replace(".", ",") : "");
    const lj = extractLoja(text);
    if (lj) setLoja(lj);

    if (!r.items.length) {
      setParseWarning(
        fromOcr
          ? "Não consegui reconhecer os itens automaticamente. O texto lido apareceu no campo abaixo — confira e ajuste, ou lance os itens manualmente."
          : "Não consegui reconhecer nenhum item nesse texto. Confira o formato ou lance os itens manualmente abaixo."
      );
    } else if (r.qtdItensEsperada && r.qtdItensEsperada !== r.items.length) {
      setParseWarning(
        `A nota indica ${r.qtdItensEsperada} itens, mas reconheci ${r.items.length}. Complete os que faltarem manualmente.`
      );
    } else {
      setParseWarning("");
    }
  }, []);

  const handleParse = () => applyParsedText(raw);

  const ocrBusy =
    ocrStatus === "carregando" || ocrStatus === "renderizando" || ocrStatus === "lendo";

  const startOcr = (payload) => {
    setOcrError("");
    setOcrProgress(0);
    setOcrStatus("carregando");
    ocrRef.current?.runOcr(payload);
  };

  const pickPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const base64 = await new File(res.assets[0]).base64();
      startOcr({ kind: "pdf", base64 });
    } catch (e) {
      setOcrError(`Não foi possível abrir o PDF: ${e?.message || e}`);
      setOcrStatus("");
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setOcrError("Preciso de acesso à câmera para fotografar o cupom.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.9 });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const base64 = asset.base64 || (await new File(asset).base64());
      startOcr({ kind: "image", base64 });
    } catch (e) {
      setOcrError(`Não foi possível usar a câmera: ${e?.message || e}`);
      setOcrStatus("");
    }
  };

  const handleOcrResult = useCallback(
    (text) => {
      setRaw(text);
      applyParsedText(text, { fromOcr: true });
      setOcrStatus("");
      setOcrProgress(0);
    },
    [applyParsedText]
  );

  const handleOcrError = useCallback((message) => {
    setOcrStatus("");
    setOcrError(
      `Não foi possível ler a nota. Verifique sua conexão — o leitor de PDF/OCR é baixado da internet na primeira vez. (${message})`
    );
  }, []);

  const ocrLabel =
    ocrStatus === "carregando"
      ? "Preparando leitor..."
      : ocrStatus === "renderizando"
        ? "Abrindo arquivo..."
        : ocrStatus === "lendo"
          ? `Lendo nota (OCR)... ${Math.round(ocrProgress * 100)}%`
          : "";

  const removeItem = (i) => setManualItems((arr) => arr.filter((_, idx) => idx !== i));

  const addManualItem = () => {
    if (!newItem.name || !newItem.unitPrice) return;
    const qty = toNumber(newItem.qty) || 1;
    const unitPrice = toNumber(newItem.unitPrice);
    setManualItems((arr) => [
      ...arr,
      { name: newItem.name, code: "", qty, unit: newItem.unit, unitPrice, total: qty * unitPrice },
    ]);
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
      date: date || todayISO(),
      items: manualItems,
      valorTotal: subtotal,
      desconto: descontoNum,
      valorPago: total,
    });
    setSaving(false);
    if (ok) {
      setRaw("");
      setManualItems([]);
      setLoja("");
      setDate("");
      setDesconto("");
      setParseWarning("");
      onDone();
    }
  };

  const field = (label, value, onChangeText, extra = {}) => (
    <View style={{ flexGrow: 1, flexBasis: "100%" }}>
      <Text style={theme.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={INK_SOFT}
        style={theme.input}
        {...extra}
      />
    </View>
  );

  return (
    <View style={{ gap: 18 }}>
      <OcrWebView
        ref={ocrRef}
        onStatus={(s) => s !== "pronto" && setOcrStatus(s)}
        onProgress={setOcrProgress}
        onResult={handleOcrResult}
        onError={handleOcrError}
      />

      <TornCard>
        <View style={{ paddingHorizontal: 15, paddingTop: 16 }}>
          <Text style={{ fontSize: 16, color: INK, marginBottom: 4, ...theme.DISPLAY_FONT }}>
            Anexar a nota
          </Text>
          <Text style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 12 }}>
            Envie o PDF da NFC-e ou fotografe o cupom. A leitura é feita por OCR no próprio
            aparelho e pode levar alguns segundos — na primeira vez, mais, porque o leitor é
            baixado da internet.
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={pickPdf}
              disabled={ocrBusy}
              style={{
                flexGrow: 1,
                flexBasis: 0,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                backgroundColor: ocrBusy ? LINE : INK,
                borderRadius: 7,
                paddingVertical: 12,
              }}
            >
              <FileUp size={15} color={ocrBusy ? INK_SOFT : PAPER} />
              <Text style={{ color: ocrBusy ? INK_SOFT : PAPER, fontSize: 13, fontWeight: "700" }}>
                PDF
              </Text>
            </Pressable>

            <Pressable
              onPress={takePhoto}
              disabled={ocrBusy}
              style={{
                flexGrow: 1,
                flexBasis: 0,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                borderWidth: 1,
                borderColor: LINE,
                backgroundColor: FIELD,
                borderRadius: 7,
                paddingVertical: 12,
                opacity: ocrBusy ? 0.5 : 1,
              }}
            >
              <Camera size={15} color={INK} />
              <Text style={{ color: INK, fontSize: 13, fontWeight: "700" }}>Fotografar</Text>
            </Pressable>
          </View>

          {ocrBusy && (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color={INK} />
                <Text style={{ fontSize: 12.5, color: INK }}>{ocrLabel}</Text>
              </View>
              {ocrStatus === "lendo" && (
                <View
                  style={{
                    marginTop: 10,
                    height: 6,
                    backgroundColor: PAPER_DARK,
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${Math.round(ocrProgress * 100)}%`,
                      height: "100%",
                      backgroundColor: GOLD,
                    }}
                  />
                </View>
              )}
            </View>
          )}

          {!!ocrError && (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
              <AlertCircle size={13} color={RED} style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 12, color: RED, flexShrink: 1 }}>{ocrError}</Text>
            </View>
          )}
        </View>
      </TornCard>

      <TornCard>
        <View style={{ paddingHorizontal: 15, paddingTop: 16 }}>
          <Text style={{ fontSize: 16, color: INK, marginBottom: 4, ...theme.DISPLAY_FONT }}>
            Colar texto da nota
          </Text>
          <Text style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 12 }}>
            Cole aqui o texto da NFC-e (o da página de consulta da nota) e toque em "Ler nota".
            Os itens reconhecidos aparecem abaixo para revisão.
          </Text>
          <TextInput
            value={raw}
            onChangeText={setRaw}
            multiline
            textAlignVertical="top"
            placeholder={"PALHA BIG TOSTY 80G (Código: 1111681 )\nQtde.:1   UN: PC   Vl. Unit.:   5,99"}
            placeholderTextColor={INK_SOFT}
            style={{ ...theme.input, minHeight: 130 }}
          />
          <Pressable
            onPress={handleParse}
            disabled={!raw.trim()}
            style={{
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              backgroundColor: raw.trim() ? INK : LINE,
              borderRadius: 7,
              paddingVertical: 12,
            }}
          >
            <ScanLine size={15} color={raw.trim() ? PAPER : INK_SOFT} />
            <Text style={{ color: raw.trim() ? PAPER : INK_SOFT, fontSize: 13, fontWeight: "700" }}>
              Ler nota
            </Text>
          </Pressable>

          {!!parseWarning && (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
              <AlertCircle size={13} color={GOLD} style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 12, color: INK_SOFT, flexShrink: 1 }}>{parseWarning}</Text>
            </View>
          )}

        </View>
      </TornCard>

      <TornCard>
        <View style={{ paddingHorizontal: 15, paddingTop: 16, gap: 12 }}>
          <Text style={{ fontSize: 16, color: INK, ...theme.DISPLAY_FONT }}>Detalhes da compra</Text>

          {field("Loja / mercado", loja, setLoja, { placeholder: "Ex: Assaí" })}

          <View>
            <Text style={theme.label}>Data</Text>
            <Pressable onPress={() => setShowPicker(true)} style={theme.input}>
              <Text style={{ fontSize: 14, color: date ? INK : INK_SOFT }}>
                {date ? fmtDateBR(date) : "Hoje"}
              </Text>
            </Pressable>
            {showPicker && (
              <DateTimePicker
                value={date ? new Date(`${date}T12:00:00`) : new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, picked) => {
                  setShowPicker(Platform.OS === "ios");
                  if (event.type === "set" && picked) {
                    const p = (n) => String(n).padStart(2, "0");
                    setDate(`${picked.getFullYear()}-${p(picked.getMonth() + 1)}-${p(picked.getDate())}`);
                  }
                }}
              />
            )}
          </View>

          {field("Desconto (R$)", desconto, setDesconto, {
            placeholder: "0,00",
            keyboardType: "numeric",
          })}

          <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: INK, marginBottom: 8 }}>
              Itens ({manualItems.length})
            </Text>

            {manualItems.map((it, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 7,
                  borderBottomWidth: i < manualItems.length - 1 ? 1 : 0,
                  borderBottomColor: LINE,
                }}
              >
                <View style={{ flexShrink: 1, flexGrow: 1 }}>
                  <Text style={{ fontSize: 12.5, color: INK }}>{it.name}</Text>
                  <Text style={{ fontSize: 11, color: INK_SOFT }}>
                    {it.qty}{it.unit} × R$ {fmtBRL(it.unitPrice)}/un
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>
                  R$ {fmtBRL(it.total)}
                </Text>
                <Pressable onPress={() => removeItem(i)} style={{ padding: 4 }}>
                  <X size={14} color={RED} />
                </Pressable>
              </View>
            ))}

            {!manualItems.length && (
              <Text style={{ fontSize: 12.5, color: INK_SOFT, paddingVertical: 6 }}>
                Nenhum item ainda. Adicione abaixo.
              </Text>
            )}
          </View>

          <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12 }}>
            {field("Produto", newItem.name, (v) => setNewItem((s) => ({ ...s, name: v })), {
              placeholder: "Ex: ARROZ TIO JOAO 5KG",
            })}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flexGrow: 1, flexBasis: 0 }}>
                <Text style={theme.label}>Qtd</Text>
                <TextInput
                  value={newItem.qty}
                  onChangeText={(v) => setNewItem((s) => ({ ...s, qty: v }))}
                  keyboardType="numeric"
                  style={theme.input}
                  placeholderTextColor={INK_SOFT}
                />
              </View>
              <View style={{ flexGrow: 1, flexBasis: 0 }}>
                <Text style={theme.label}>Un.</Text>
                <TextInput
                  value={newItem.unit}
                  onChangeText={(v) => setNewItem((s) => ({ ...s, unit: v }))}
                  style={theme.input}
                  placeholderTextColor={INK_SOFT}
                />
              </View>
              <View style={{ flexGrow: 1.4, flexBasis: 0 }}>
                <Text style={theme.label}>Preço unit.</Text>
                <TextInput
                  value={newItem.unitPrice}
                  onChangeText={(v) => setNewItem((s) => ({ ...s, unitPrice: v }))}
                  keyboardType="numeric"
                  placeholder="0,00"
                  style={theme.input}
                  placeholderTextColor={INK_SOFT}
                />
              </View>
            </View>
            <Pressable
              onPress={addManualItem}
              disabled={!newItem.name || !newItem.unitPrice}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 7,
                paddingVertical: 11,
                backgroundColor: FIELD,
                opacity: newItem.name && newItem.unitPrice ? 1 : 0.5,
              }}
            >
              <Plus size={14} color={INK} />
              <Text style={{ fontSize: 13, color: INK, fontWeight: "600" }}>Adicionar item</Text>
            </Pressable>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12, gap: 4 }}>
            <Row label="Subtotal" value={`R$ ${fmtBRL(subtotal)}`} />
            {descontoNum > 0 && <Row label="Desconto" value={`- R$ ${fmtBRL(descontoNum)}`} />}
            <Row label="Total a pagar" value={`R$ ${fmtBRL(total)}`} strong />
          </View>

          <Pressable
            onPress={handleSave}
            disabled={!manualItems.length || saving}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              backgroundColor: manualItems.length && !saving ? INK : LINE,
              borderRadius: 7,
              paddingVertical: 13,
              marginBottom: 4,
            }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={PAPER} />
            ) : (
              <Check size={15} color={manualItems.length ? PAPER : INK_SOFT} />
            )}
            <Text
              style={{
                color: manualItems.length && !saving ? PAPER : INK_SOFT,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              {saving ? "Guardando..." : "Guardar nota"}
            </Text>
          </Pressable>
        </View>
      </TornCard>
    </View>
  );
}

function Row({ label, value, strong }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: strong ? 14 : 12.5, color: strong ? INK : INK_SOFT }}>{label}</Text>
      <Text
        style={{
          fontSize: strong ? 16 : 12.5,
          fontWeight: strong ? "700" : "400",
          color: INK,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
