import { useState } from "react";
import { View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { PAPER, LINE } from "../theme";

const TEETH = 14; // metade dos 28 pontos do clipPath do web
const STRIP_H = 9;

// Cartão "papel rasgado". No web isso é um clipPath de 28 pontos (src/App.jsx);
// em RN não existe clipPath, então o corpo é um View normal e a borda serrilhada
// de baixo é uma faixa SVG desenhada logo abaixo.
export default function TornCard({ children, style }) {
  const [width, setWidth] = useState(0);

  const points = [];
  points.push(`0,0`);
  points.push(`${width},0`);
  for (let i = TEETH; i >= 0; i--) {
    const x = (width * i) / TEETH;
    points.push(`${x},${i % 2 === 0 ? STRIP_H : 0}`);
  }

  return (
    <View style={style} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View
        style={{
          backgroundColor: PAPER,
          borderColor: LINE,
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          paddingBottom: 12,
          shadowColor: "#241F1A",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
          elevation: 2,
        }}
      >
        {children}
      </View>
      {width > 0 && (
        <Svg width={width} height={STRIP_H}>
          <Polygon points={points.join(" ")} fill={PAPER} stroke={LINE} strokeWidth={1} />
        </Svg>
      )}
    </View>
  );
}
