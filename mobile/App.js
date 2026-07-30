import { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Receipt, Plus, BarChart3, AlertCircle } from "lucide-react-native";
import storage from "./lib/storage";
import ErrorBoundary from "./components/ErrorBoundary";
import NotasScreen from "./screens/NotasScreen";
import AddScreen from "./screens/AddScreen";
import AnaliseScreen from "./screens/AnaliseScreen";
import { computeStats } from "shared/stats";
import { toNumber } from "shared/parse";
import { INK, INK_SOFT, PAPER, LINE, RED } from "./theme";
import * as theme from "./theme";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function storageSetWithRetry(key, value, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await storage.set(key, value);
      if (res) return res;
      lastErr = new Error("Resposta vazia do armazenamento");
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) await wait(400 * (i + 1));
  }
  throw lastErr;
}

const TABS = [
  { id: "notas", label: "Notas", icon: Receipt },
  { id: "add", label: "Adicionar", icon: Plus },
  { id: "analise", label: "Análise", icon: BarChart3 },
];

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
          const r = await storage.get("notas-index");
          idx = r ? JSON.parse(r.value) : [];
        } catch {
          idx = [];
        }
        const loaded = [];
        for (const id of idx) {
          try {
            const r = await storage.get(`nota:${id}`);
            if (r) loaded.push(JSON.parse(r.value));
          } catch {
            // uma nota corrompida não pode impedir o resto de carregar
          }
        }
        loaded.sort((a, b) => (a.date < b.date ? 1 : -1));
        setNotas(loaded);
        try {
          const b = await storage.get("config:budget");
          if (b) setBudget(JSON.parse(b.value));
        } catch {
          // meta mensal é opcional
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveIndex = useCallback(async (ids) => {
    try {
      await storageSetWithRetry("notas-index", JSON.stringify(ids));
    } catch {
      setSaveError("Não foi possível salvar a lista de notas. Tente novamente.");
    }
  }, []);

  const addNota = useCallback(
    async (nota) => {
      const id = `${Date.now()}`;
      const record = { id, ...nota };
      try {
        await storageSetWithRetry(`nota:${id}`, JSON.stringify(record));
        const newList = [record, ...notas];
        await saveIndex(newList.map((n) => n.id));
        newList.sort((a, b) => (a.date < b.date ? 1 : -1));
        setNotas(newList);
        setSaveError("");
        return true;
      } catch {
        setSaveError("Não foi possível guardar a nota. Tente novamente.");
        return false;
      }
    },
    [notas, saveIndex]
  );

  const deleteNota = useCallback(
    async (id) => {
      try {
        await storage.delete(`nota:${id}`);
        const newList = notas.filter((n) => n.id !== id);
        await saveIndex(newList.map((n) => n.id));
        setNotas(newList);
      } catch {
        setSaveError("Não foi possível excluir a nota.");
      }
    },
    [notas, saveIndex]
  );

  const saveBudget = useCallback(async (v) => {
    setBudget(v);
    try {
      await storageSetWithRetry("config:budget", JSON.stringify(v));
    } catch {
      setSaveError("Não foi possível salvar a meta mensal.");
    }
  }, []);

  const stats = useMemo(() => computeStats(notas), [notas]);

  const budgetNum = toNumber(budget);
  const lastMonthTotal = stats.monthData.length
    ? stats.monthData[stats.monthData.length - 1].total
    : 0;
  const budgetDiff = budgetNum > 0 ? lastMonthTotal - budgetNum : null;

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: PAPER, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator size="large" color={INK} />
        <Text style={{ color: INK_SOFT, marginTop: 10, fontSize: 13 }}>
          Carregando suas notas...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: LINE,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                backgroundColor: INK,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Receipt size={20} color={PAPER} />
            </View>
            <View>
              <Text style={{ fontSize: 21, color: INK, ...theme.DISPLAY_FONT }}>
                Controle de Notas
              </Text>
              <Text style={{ fontSize: 11.5, color: INK_SOFT }}>suas compras, guardadas</Text>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 7,
                    paddingVertical: 8,
                    paddingHorizontal: 13,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? INK : LINE,
                    backgroundColor: active ? INK : "transparent",
                  }}
                >
                  <Icon size={15} color={active ? PAPER : INK} />
                  <Text style={{ fontSize: 12.5, fontWeight: "600", color: active ? PAPER : INK }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {!!saveError && (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                backgroundColor: "#F6E4E1",
                borderWidth: 1,
                borderColor: RED,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <AlertCircle size={16} color={RED} />
              <Text style={{ color: RED, fontSize: 13, flexShrink: 1 }}>{saveError}</Text>
            </View>
          )}

          {tab === "notas" && (
            <ErrorBoundary key="notas" label="lista de notas">
              <NotasScreen
                notas={notas}
                expanded={expanded}
                setExpanded={setExpanded}
                onDelete={deleteNota}
              />
            </ErrorBoundary>
          )}
          {tab === "add" && (
            <ErrorBoundary key="add" label="adicionar nota">
              <AddScreen onSave={addNota} onDone={() => setTab("notas")} />
            </ErrorBoundary>
          )}
          {tab === "analise" && (
            <ErrorBoundary key="analise" label="análise">
              <AnaliseScreen
                notas={notas}
                stats={stats}
                budget={budget}
                setBudget={saveBudget}
                budgetDiff={budgetDiff}
              />
            </ErrorBoundary>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
