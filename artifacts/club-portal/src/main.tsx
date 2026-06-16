import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: "monospace", padding: 24, color: "#c00", background: "#fff9f9", border: "2px solid #c00", borderRadius: 8, margin: 24, whiteSpace: "pre-wrap" }}>
          <b>React Error:</b>{"\n"}{this.state.error.stack || this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
