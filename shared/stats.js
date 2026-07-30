import { fmtDayMonthBR } from "./format";

// Estatísticas derivadas das notas, compartilhadas entre web e mobile.
// Extraído verbatim do useMemo de src/App.jsx. Puro: só array/object math,
// nenhuma formatação acontece aqui.

export function computeStats(notas) {
  const allItems = [];
  notas.forEach((n) =>
    (n.items || []).forEach((it) => allItems.push({ ...it, notaId: n.id, date: n.date, loja: n.loja }))
  );
  const totalGasto = notas.reduce((s, n) => s + (n.valorPago ?? n.valorTotal ?? 0), 0);

  const byMonth = {};
  notas.forEach((n) => {
    if (!n.date) return;
    const key = n.date.slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + (n.valorPago ?? n.valorTotal ?? 0);
  });
  const months = Object.keys(byMonth).sort();
  const monthData = months.map((k) => {
    const [y, m] = k.split("-");
    return { key: k, label: `${m}/${y.slice(2)}`, total: byMonth[k] };
  });

  let delta = null;
  if (monthData.length >= 2) {
    const cur = monthData[monthData.length - 1].total;
    const prev = monthData[monthData.length - 2].total;
    delta = { cur, prev, diff: cur - prev, pct: prev ? ((cur - prev) / prev) * 100 : 0 };
  }

  let maisCaro = null;
  let maisBarato = null;
  allItems.forEach((it) => {
    if (!maisCaro || it.unitPrice > maisCaro.unitPrice) maisCaro = it;
    if (!maisBarato || (it.unitPrice < maisBarato.unitPrice && it.unitPrice > 0)) maisBarato = it;
  });

  const byProduct = {};
  allItems.forEach((it) => {
    const key = it.name;
    if (!byProduct[key]) byProduct[key] = { name: key, prices: [], count: 0 };
    byProduct[key].prices.push(it.unitPrice);
    byProduct[key].count += 1;
  });
  const productList = Object.values(byProduct).map((p) => ({
    name: p.name,
    count: p.count,
    min: Math.min(...p.prices),
    max: Math.max(...p.prices),
    avg: p.prices.reduce((s, x) => s + x, 0) / p.prices.length,
    variou: Math.max(...p.prices) !== Math.min(...p.prices),
  }));
  productList.sort((a, b) => b.count - a.count);

  return { allItems, totalGasto, monthData, delta, maisCaro, maisBarato, productList };
}

// Série de preço unitário de um produto ao longo do tempo, para o gráfico de
// histórico da aba Análise.
export function buildPriceHistory(allItems, productName) {
  if (!productName) return [];
  return (allItems || [])
    .filter((it) => it.name === productName)
    .filter((it) => it.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((it) => ({
      date: it.date,
      label: fmtDayMonthBR(it.date),
      price: it.unitPrice,
      loja: it.loja,
    }));
}
