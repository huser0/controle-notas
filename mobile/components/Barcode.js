import { useMemo } from "react";
import { View } from "react-native";
import { INK } from "../theme";

// Decoração: 38 barras de largura aleatória, estáveis enquanto o card viver.
export default function Barcode() {
  const bars = useMemo(
    () => Array.from({ length: 38 }, () => 1 + Math.floor(Math.random() * 3)),
    []
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 22, opacity: 0.55 }}>
      {bars.map((w, i) => (
        <View key={i} style={{ width: w, height: 22, backgroundColor: INK, marginLeft: i ? 2 : 0 }} />
      ))}
    </View>
  );
}
