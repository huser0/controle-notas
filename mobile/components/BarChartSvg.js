import { useState } from "react";
import { View } from "react-native";
import Svg, { G, Rect, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { INK, INK_SOFT, LINE } from "../theme";
import { fmtBRL } from "shared/format";

const H = 190;
const PAD_BOTTOM = 22; // faixa dos rótulos do eixo X
const PAD_TOP = 18; // espaço para o valor em cima da barra

// Substitui o <BarChart> do recharts (que é DOM/SVG de navegador e não roda em RN).
// data: [{ key, label, total }]
export default function BarChartSvg({ data }) {
  const [width, setWidth] = useState(0);

  if (!data?.length) return null;

  const max = Math.max(...data.map((d) => d.total), 0) || 1;
  const plotH = H - PAD_BOTTOM - PAD_TOP;
  const slot = width / data.length;
  const barW = Math.min(slot * 0.6, 46);

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

          {data.map((d, i) => {
            const h = Math.max((d.total / max) * plotH, 2);
            const x = slot * i + (slot - barW) / 2;
            const y = PAD_TOP + plotH - h;
            return (
              <G key={d.key}>
                <Rect x={x} y={y} width={barW} height={h} rx={4} fill={INK} />
                {/* sem tooltip de toque: o valor fica sempre visível acima da barra */}
                <SvgText x={x + barW / 2} y={y - 5} fontSize={9.5} fill={INK_SOFT} textAnchor="middle">
                  {fmtBRL(d.total)}
                </SvgText>
                <SvgText x={x + barW / 2} y={H - 7} fontSize={11} fill={INK_SOFT} textAnchor="middle">
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
