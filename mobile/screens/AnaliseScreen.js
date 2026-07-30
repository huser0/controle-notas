import { useState, useMemo } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { BarChart3, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react-native";
import TornCard from "../components/TornCard";
import StatBox from "../components/StatBox";
import BarChartSvg from "../components/BarChartSvg";
import LineChartSvg from "../components/LineChartSvg";
import { buildPriceHistory } from "shared/stats";
import { fmtBRL } from "shared/format";
import { INK, INK_SOFT, LINE, RED, GREEN, PAPER_DARK, FIELD } from "../theme";
import * as theme from "../theme";

export default function AnaliseScreen({ notas, stats, budget, setBudget, budgetDiff }) {
  const [selectedProduct, setSelectedProduct] = useState("");

  const repeatedProducts = useMemo(
    () => stats.productList.filter((p) => p.count > 1),
    [stats.productList]
  );

  const activeProductName = selectedProduct || repeatedProducts[0]?.name || "";
  const priceHistory = useMemo(
    () => buildPriceHistory(stats.allItems, activeProductName),
    [stats.allItems, activeProductName]
  );

  if (!notas.length) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 50, paddingHorizontal: 16 }}>
        <BarChart3 size={32} color={INK_SOFT} style={{ marginBottom: 10, opacity: 0.6 }} />
        <Text style={{ fontSize: 16, color: INK, marginBottom: 4, ...theme.DISPLAY_FONT }}>
          Sem dados por enquanto
        </Text>
        <Text style={{ fontSize: 13, color: INK_SOFT, textAlign: "center" }}>
          Adicione ao menos uma nota para ver os números.
        </Text>
      </View>
    );
  }

  const { delta } = stats;

  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <StatBox label="Total gasto" value={`R$ ${fmtBRL(stats.totalGasto)}`} />
        <StatBox label="Notas guardadas" value={String(notas.length)} />
        <StatBox label="Itens comprados" value={String(stats.allItems.length)} />
      </View>

      {stats.monthData.length > 1 && (
        <TornCard>
          <View style={{ paddingHorizontal: 15, paddingTop: 16 }}>
            <Text style={{ fontSize: 16, color: INK, marginBottom: 10, ...theme.DISPLAY_FONT }}>
              Gasto por mês
            </Text>
            <BarChartSvg data={stats.monthData} />
            {delta && (
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {delta.diff >= 0 ? (
                  <ArrowUpRight size={16} color={RED} />
                ) : (
                  <ArrowDownRight size={16} color={GREEN} />
                )}
                <Text style={{ fontSize: 13, fontWeight: "700", color: delta.diff >= 0 ? RED : GREEN }}>
                  {delta.diff >= 0 ? "Déficit" : "Economia"} de R$ {fmtBRL(Math.abs(delta.diff))}
                </Text>
                <Text style={{ fontSize: 13, color: INK_SOFT }}>
                  vs. mês anterior ({delta.pct >= 0 ? "+" : ""}{delta.pct.toFixed(0)}%)
                </Text>
              </View>
            )}
          </View>
        </TornCard>
      )}

      <TornCard>
        <View style={{ paddingHorizontal: 15, paddingTop: 16 }}>
          <Text style={{ fontSize: 16, color: INK, marginBottom: 4, ...theme.DISPLAY_FONT }}>
            Meta mensal
          </Text>
          <Text style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 10 }}>
            Quanto você pretende gastar por mês.
          </Text>
          <TextInput
            value={budget}
            onChangeText={setBudget}
            keyboardType="numeric"
            placeholder="Ex: 800,00"
            placeholderTextColor={INK_SOFT}
            style={theme.input}
          />
          {budgetDiff !== null && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              {budgetDiff <= 0 ? (
                <TrendingDown size={16} color={GREEN} />
              ) : (
                <TrendingUp size={16} color={RED} />
              )}
              <Text style={{ fontSize: 13, color: budgetDiff <= 0 ? GREEN : RED, fontWeight: "700" }}>
                {budgetDiff <= 0
                  ? `R$ ${fmtBRL(Math.abs(budgetDiff))} abaixo da meta`
                  : `R$ ${fmtBRL(budgetDiff)} acima da meta`}
              </Text>
            </View>
          )}
        </View>
      </TornCard>

      {(stats.maisCaro || stats.maisBarato) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {stats.maisCaro && (
            <ExtremeBox label="Item mais caro" item={stats.maisCaro} color={RED} />
          )}
          {stats.maisBarato && (
            <ExtremeBox label="Item mais barato" item={stats.maisBarato} color={GREEN} />
          )}
        </View>
      )}

      {repeatedProducts.length > 0 && (
        <TornCard>
          <View style={{ paddingHorizontal: 15, paddingTop: 16 }}>
            <Text style={{ fontSize: 16, color: INK, marginBottom: 4, ...theme.DISPLAY_FONT }}>
              Produtos que você repete
            </Text>
            <Text style={{ fontSize: 12.5, color: INK_SOFT, marginBottom: 10 }}>
              Toque em um produto para ver o histórico de preço.
            </Text>
            {repeatedProducts.slice(0, 12).map((p) => (
              <Pressable
                key={p.name}
                onPress={() => setSelectedProduct(p.name)}
                style={{
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderBottomColor: LINE,
                  backgroundColor: p.name === activeProductName ? PAPER_DARK : "transparent",
                }}
              >
                <Text style={{ fontSize: 12.5, color: INK }}>{p.name}</Text>
                <Text style={{ fontSize: 11, color: INK_SOFT, marginTop: 2 }}>
                  {p.count}× · min R$ {fmtBRL(p.min)} · máx R$ {fmtBRL(p.max)} · méd R$ {fmtBRL(p.avg)}
                  {p.variou ? "  · variou" : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        </TornCard>
      )}

      {priceHistory.length > 1 && (
        <TornCard>
          <View style={{ paddingHorizontal: 15, paddingTop: 16 }}>
            <Text style={{ fontSize: 16, color: INK, marginBottom: 10, ...theme.DISPLAY_FONT }}>
              Histórico de preço
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 8,
                backgroundColor: FIELD,
                marginBottom: 10,
              }}
            >
              <Picker
                selectedValue={activeProductName}
                onValueChange={(v) => setSelectedProduct(v)}
                dropdownIconColor={INK}
              >
                {repeatedProducts.map((p) => (
                  <Picker.Item key={p.name} label={p.name} value={p.name} color={INK} />
                ))}
              </Picker>
            </View>
            <LineChartSvg data={priceHistory} />
            <Text style={{ fontSize: 11, color: INK_SOFT, marginTop: 6 }}>
              Comprado em: {[...new Set(priceHistory.map((d) => d.loja).filter(Boolean))].join(", ") || "—"}
            </Text>
          </View>
        </TornCard>
      )}
    </View>
  );
}

function ExtremeBox({ label, item, color }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        backgroundColor: PAPER_DARK,
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Text style={{ fontSize: 9.5, color: INK_SOFT, letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 12.5, color: INK, marginTop: 4 }}>{item.name}</Text>
      <Text style={{ fontSize: 15, fontWeight: "700", color, marginTop: 2 }}>
        R$ {fmtBRL(item.unitPrice)}
      </Text>
      {!!item.loja && (
        <Text style={{ fontSize: 11, color: INK_SOFT, marginTop: 2 }}>{item.loja}</Text>
      )}
    </View>
  );
}
