import { View, Text } from "react-native";
import { INK, INK_SOFT, LINE, PAPER_DARK } from "../theme";

export default function StatBox({ label, value }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "30%",
        backgroundColor: PAPER_DARK,
        borderWidth: 1,
        borderColor: LINE,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: 9.5, color: INK_SOFT, letterSpacing: 0.6 }}>
        {String(label).toUpperCase()}
      </Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: INK, marginTop: 3 }}>{value}</Text>
    </View>
  );
}
