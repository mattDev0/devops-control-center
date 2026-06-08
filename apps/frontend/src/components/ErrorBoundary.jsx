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
        <div className="bg-slate-900 border border-red-500/30 rounded-xl p-8 max-w-2xl mx-auto my-12 text-center backdrop-blur-md shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20 text-red-500 animate-bounce">
              <AlertTriangle className="w-12 h-12" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Component Crashed</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            Something went wrong while rendering this section of the dashboard. This might be due to a transient network issue or a temporary failure.
          </p>
          {this.state.error && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 mb-6 text-left overflow-auto font-mono text-xs text-red-400 max-h-48">
              {this.state.error.toString()}
            </div>
          )}
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-lg border border-slate-700 hover:border-slate-600 transition-all cursor-pointer shadow-lg"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
