import { useState } from "react";
import { View } from "react-native";
import Svg, { G, Circle, Polyline, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { INK_SOFT, LINE, GOLD } from "../theme";
import { fmtBRL } from "shared/format";

const H = 190;
const PAD_BOTTOM = 22;
const PAD_TOP = 20;
const PAD_X = 16;

// Substitui o <LineChart> do recharts. data: [{ date, label, price, loja }]
export default function LineChartSvg({ data }) {
  const [width, setWidth] = useState(0);

  if (!data?.length) return null;

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.max(max, 1); // série constante: evita divisão por zero
  const plotH = H - PAD_BOTTOM - PAD_TOP;
  const plotW = Math.max(width - PAD_X * 2, 1);

  const xAt = (i) => PAD_X + (data.length === 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const yAt = (p) => PAD_TOP + plotH - ((p - min) / span) * plotH;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={H}>
          {[0, 0.5, 1].map((f) => (
            <SvgLine
              key={f}
              x1={0}
              x2={width}
              y1={PAD_TOP + plotH * f}
              y2={PAD_TOP + plotH * f}
              stroke={LINE}
              strokeWidth={1}
            />
          ))}

          <Polyline
            points={data.map((d, i) => `${xAt(i)},${yAt(d.price)}`).join(" ")}
            fill="none"
            stroke={GOLD}
            strokeWidth={2}
          />

          {data.map((d, i) => (
            <G key={`${d.date}-${i}`}>
              <Circle cx={xAt(i)} cy={yAt(d.price)} r={3} fill={GOLD} />
              <SvgText
                x={xAt(i)}
                y={yAt(d.price) - 8}
                fontSize={9.5}
                fill={INK_SOFT}
                textAnchor="middle"
              >
                {fmtBRL(d.price)}
              </SvgText>
              <SvgText x={xAt(i)} y={H - 7} fontSize={10} fill={INK_SOFT} textAnchor="middle">
                {d.label}
              </SvgText>
            </G>
          ))}
        </Svg>
      )}
    </View>
  );
}
