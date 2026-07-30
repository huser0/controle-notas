import React from "react";

// Mesmas cores de App.jsx. Redefinidas aqui (em vez de importadas) para o
// boundary não depender do módulo que ele justamente precisa proteger.
const INK = "#241F1A";
const INK_SOFT = "#6E655A";
const PAPER = "#F6F1E6";
const LINE = "#D8CFBB";
const RED = "#AE3B2E";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stack: "" };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erro capturado pelo ErrorBoundary:", error, info);
    this.setState({ stack: info?.componentStack || "" });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          background: PAPER,
          border: `1px solid ${LINE}`,
          borderRadius: 10,
          padding: 18,
          margin: "18px auto",
          maxWidth: 640,
          textAlign: "left",
          color: INK,
        }}
      >
        <p style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>Algo deu errado</p>
        <p style={{ fontSize: 13, color: INK_SOFT, margin: "0 0 12px" }}>
          {this.props.label
            ? `Esta parte do app (${this.props.label}) parou de funcionar, mas o resto continua disponível.`
            : "O app encontrou um erro inesperado."}{" "}
          Se o problema continuar, copie os detalhes abaixo.
        </p>

        <p style={{ fontSize: 13, color: RED, margin: "0 0 12px", wordBreak: "break-word" }}>
          {String(error?.message || error)}
        </p>

        {stack && (
          <details style={{ fontSize: 12, color: INK_SOFT, marginBottom: 14 }}>
            <summary style={{ cursor: "pointer" }}>Detalhes técnicos</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#FFFDF8",
                border: `1px solid ${LINE}`,
                borderRadius: 6,
                padding: 10,
                marginTop: 8,
                maxHeight: 240,
                overflow: "auto",
              }}
            >
              {stack}
            </pre>
          </details>
        )}

        <button
          onClick={() => window.location.reload()}
          style={{
            background: INK,
            color: PAPER,
            border: "none",
            borderRadius: 7,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Recarregar página
        </button>
      </div>
    );
  }
}
