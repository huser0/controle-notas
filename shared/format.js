// Formatação pt-BR sem depender de Intl.
//
// A versão web usava toLocaleString("pt-BR") / toLocaleDateString("pt-BR"), mas o
// Hermes (motor JS do React Native) nem sempre traz ICU completo, e nesses casos
// cairia silenciosamente no formato en-US. Implementado à mão, o resultado é
// idêntico e determinístico nos dois apps.

// 1234.5 -> "1.234,50"   (sem o prefixo "R$", que é acrescentado na interface)
export function fmtBRL(n) {
  const num = Number(n) || 0;
  const neg = num < 0;
  const [int, dec] = Math.abs(num).toFixed(2).split(".");
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${withDots},${dec}`;
}

// "2025-06-12" -> "12/06/2025". String vazia quando não há data.
//
// Fatiar a string ISO direto (em vez de passar por new Date) elimina de vez o
// problema de fuso que a versão web contornava concatenando "T12:00:00".
export function fmtDateBR(date) {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date));
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// "2025-06-12" -> "12/06" (rótulo curto de eixo de gráfico)
export function fmtDayMonthBR(date) {
  const full = fmtDateBR(date);
  return full ? full.slice(0, 5) : "";
}

// Data de hoje em ISO "YYYY-MM-DD", no fuso local (não em UTC)
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
