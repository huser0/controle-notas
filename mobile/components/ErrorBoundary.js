import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { INK, INK_SOFT, PAPER, LINE, RED, FIELD } from "../theme";

// Versão RN do src/ErrorBoundary.jsx. Sem window.location.reload(): aqui o botão
// simplesmente limpa o estado do boundary e tenta renderizar a árvore de novo.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stack: "", showStack: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erro capturado pelo ErrorBoundary:", error, info);
    this.setState({ stack: info?.componentStack || "" });
  }

  render() {
    const { error, stack, showStack } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          backgroundColor: PAPER,
          borderWidth: 1,
          borderColor: LINE,
          borderRadius: 10,
          padding: 18,
          margin: 14,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "700", color: INK, marginBottom: 6 }}>
          Algo deu errado
        </Text>
        <Text style={{ fontSize: 13, color: INK_SOFT, marginBottom: 12 }}>
          {this.props.label
            ? `Esta parte do app (${this.props.label}) parou de funcionar.`
            : "O app encontrou um erro inesperado."}{" "}
          Se o problema continuar, copie os detalhes abaixo.
        </Text>

        <Text style={{ fontSize: 13, color: RED, marginBottom: 12 }}>
          {String(error?.message || error)}
        </Text>

        {!!stack && (
          <>
            <Pressable onPress={() => this.setState({ showStack: !showStack })}>
              <Text style={{ fontSize: 12, color: INK_SOFT, marginBottom: 8 }}>
                {showStack ? "▾ Detalhes técnicos" : "▸ Detalhes técnicos"}
              </Text>
            </Pressable>
            {showStack && (
              <ScrollView
                style={{
                  maxHeight: 200,
                  backgroundColor: FIELD,
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 6,
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <Text selectable style={{ fontSize: 11, color: INK_SOFT }}>
                  {stack}
                </Text>
              </ScrollView>
            )}
          </>
        )}

        <Pressable
          onPress={() => this.setState({ error: null, stack: "", showStack: false })}
          style={{
            backgroundColor: INK,
            borderRadius: 7,
            paddingVertical: 10,
            paddingHorizontal: 16,
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ color: PAPER, fontSize: 13, fontWeight: "700" }}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }
}
