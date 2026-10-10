'use client';

import { Component, type ReactNode } from 'react';

// Évite l'écran blanc : affiche le vrai message d'erreur d'un onglet qui plante
// (utile pour diagnostiquer, par exemple, le module Grammaire en japonais).
export default class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Erreur dans', this.props.label ?? 'un onglet', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="conv-warning">
        <p>
          <strong>Cet onglet a rencontré une erreur.</strong> Message technique à me transmettre :
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{String(this.state.error?.message ?? this.state.error)}</pre>
        <button className="secondary" onClick={() => this.setState({ error: null })}>
          Réessayer
        </button>
      </div>
    );
  }
}
