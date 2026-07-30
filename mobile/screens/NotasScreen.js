import { useState, useMemo, useCallback } from "react";
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator } from "react-native";
import { ScanLine, Trash2, Download } from "lucide-react-native";
import TornCard from "../components/TornCard";
import Barcode from "../components/Barcode";
import { exportNotasXlsx } from "../lib/exportXlsx";
import { fmtBRL, fmtDateBR } from "shared/format";
import { INK, INK_SOFT, LINE, RED, GREEN, FIELD } from "../theme";
import * as theme from "../theme";

export default function NotasScreen({ notas, expanded, setExpanded, onDelete }) {
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notas;
    return notas.filter((n) => {
      const lojaMatch = (n.loja || "").toLowerCase().includes(q);
      const itemMatch = (n.items || []).some((it) => (it.name || "").toLowerCase().includes(q));
      return lojaMatch || itemMatch;
    });
  }, [notas, search]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportNotasXlsx(filtered);
    } catch (e) {
      Alert.alert("Não foi possível exportar", e?.message || String(e));
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  const confirmDelete = (id) =>
    Alert.alert("Excluir nota", "Esta nota será apagada do aparelho. Continuar?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => onDelete(id) },
    ]);

  if (!notas.length) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 50, paddingHorizontal: 16 }}>
        <ScanLine size={32} color={INK_SOFT} style={{ marginBottom: 10, opacity: 0.6 }} />
        <Text style={{ fontSize: 16, color: INK, marginBottom: 4, ...theme.DISPLAY_FONT }}>
          Nenhuma nota guardada ainda
        </Text>
        <Text style={{ fontSize: 13, color: INK_SOFT, textAlign: "center" }}>
          Vá em "Adicionar" para lançar sua nota fiscal.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por loja ou produto (ex: Sendas)"
          placeholderTextColor={INK_SOFT}
          style={theme.input}
        />
        <Pressable
          onPress={handleExport}
          disabled={!filtered.length || exporting}
          style={{
            alignSelf: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderWidth: 1,
            borderColor: LINE,
            borderRadius: 8,
            paddingVertical: 9,
            paddingHorizontal: 14,
            backgroundColor: FIELD,
            opacity: filtered.length && !exporting ? 1 : 0.5,
          }}
        >
          {exporting ? <ActivityIndicator size="small" color={INK} /> : <Download size={14} color={INK} />}
          <Text style={{ fontSize: 12.5, color: INK }}>
            Baixar Excel ({filtered.length} {filtered.length === 1 ? "nota" : "notas"})
          </Text>
        </Pressable>
      </View>

      {filtered.length === 0 && (
        <Text style={{ fontSize: 13, color: INK_SOFT, textAlign: "center", paddingVertical: 20 }}>
          Nenhuma nota encontrada para "{search}".
        </Text>
      )}

      {filtered.map((n) => {
        const isOpen = expanded === n.id;
        const total = n.valorPago ?? n.valorTotal ?? 0;
        return (
          <TornCard key={n.id}>
            <View style={{ paddingHorizontal: 15, paddingTop: 16 }}>
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontSize: 17, color: INK, ...theme.DISPLAY_FONT }}>
                    {n.loja || "Compra"}
                  </Text>
                  <Text style={{ fontSize: 12, color: INK_SOFT, marginTop: 3 }}>
                    {fmtDateBR(n.date) || "sem data"} · {(n.items || []).length} itens
                  </Text>
                </View>

                <View>
                  {n.desconto > 0 && (
                    <Text
                      style={{
                        fontSize: 11.5,
                        color: INK_SOFT,
                        textDecorationLine: "line-through",
                      }}
                    >
                      R$ {fmtBRL(n.valorTotal)}
                    </Text>
                  )}
                  <Text style={{ fontSize: 19, fontWeight: "700", color: INK }}>
                    R$ {fmtBRL(total)}
                  </Text>
                  {n.desconto > 0 && (
                    <Text style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>
                      desconto de R$ {fmtBRL(n.desconto)}
                    </Text>
                  )}
                  <Pressable
                    onPress={() => confirmDelete(n.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 }}
                  >
                    <Trash2 size={12} color={RED} />
                    <Text style={{ color: RED, fontSize: 11.5 }}>excluir</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={() => setExpanded(isOpen ? null : n.id)}
                style={{
                  marginTop: 6,
                  alignSelf: "flex-start",
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ fontSize: 12, color: INK }}>
                  {isOpen ? "ocultar itens" : "ver itens"}
                </Text>
              </Pressable>

              {isOpen && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10 }}>
                  {(n.items || []).map((it, i) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 10,
                        paddingVertical: 6,
                        borderBottomWidth: i < n.items.length - 1 ? 1 : 0,
                        borderBottomColor: LINE,
                      }}
                    >
                      <Text style={{ fontSize: 12.5, color: INK, flexShrink: 1 }}>
                        {it.name} <Text style={{ color: INK_SOFT }}>x{it.qty}{it.unit}</Text>
                      </Text>
                      <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>
                        R$ {fmtBRL(it.total)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ marginTop: 14, alignItems: "flex-end" }}>
                <Barcode />
              </View>
            </View>
          </TornCard>
        );
      })}
    </View>
  );
}
