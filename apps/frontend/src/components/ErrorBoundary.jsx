import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-[var(--bg-surface)] border border-[var(--status-error)]/25 rounded-[var(--radius-lg)] p-6 text-center shadow-[var(--shadow-md)]">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-[var(--status-error-muted)] rounded-full border border-[var(--status-error)]/20 text-[var(--status-error)]">
              <AlertTriangle className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-sm font-bold text-[var(--fg-default)] mb-1">Component Failed</h2>
          <p className="text-[var(--fg-muted)] text-xs mb-4 max-w-md mx-auto leading-normal">
            Something went wrong while rendering this section of the dashboard. This might be due to a transient network issue or a temporary failure.
          </p>
          {this.state.error && (
            <div className="bg-[var(--bg-inset)] border border-[var(--border-default)] rounded-[var(--radius-md)] p-3 mb-4 text-left overflow-auto font-mono text-[10px] text-[var(--status-error)] max-h-36">
              {this.state.error.toString()}
            </div>
          )}
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)]/80 text-[var(--fg-default)] font-semibold py-1.5 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] hover:border-[var(--border-emphasis)] transition-colors cursor-pointer text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
