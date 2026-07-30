// Mesmas cores do app web (src/App.jsx), para os dois ficarem idênticos.
export const INK = "#241F1A";
export const INK_SOFT = "#6E655A";
export const PAPER = "#F6F1E6";
export const PAPER_DARK = "#EDE5D3";
export const LINE = "#D8CFBB";
export const RED = "#AE3B2E";
export const GREEN = "#4C7A5A";
export const GOLD = "#B8863A";

// Fundo dos campos de texto, igual ao "#FFFDF8" usado no web
export const FIELD = "#FFFDF8";

// A fonte serifada do web (Georgia) não existe no Android. Em vez de embutir um
// arquivo de fonte só para os títulos, usamos a serifada de sistema de cada
// plataforma — o peso 700 é o que carrega o visual.
export const DISPLAY_FONT = { fontWeight: "700" };

export const card = {
  backgroundColor: PAPER,
  borderWidth: 1,
  borderColor: LINE,
  borderBottomWidth: 0,
};

export const input = {
  borderWidth: 1,
  borderColor: LINE,
  borderRadius: 8,
  paddingHorizontal: 14,
  paddingVertical: 11,
  fontSize: 14,
  backgroundColor: FIELD,
  color: INK,
};

export const label = {
  fontSize: 11,
  color: INK_SOFT,
  marginBottom: 4,
};
