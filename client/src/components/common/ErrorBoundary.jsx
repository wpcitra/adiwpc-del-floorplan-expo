import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportError } from '../../services/errorReporter';

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
    reportError(error, { kind: 'react', componentStack: errorInfo?.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-lg w-full text-center shadow-2xl">
            <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
              <AlertTriangle size={28} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Terjadi Kesalahan Tampilan</h2>
            <p className="text-sm text-slate-400 mb-4">
              Aplikasi mengalami kendala saat memuat komponen ini. Silakan coba muat ulang halaman.
            </p>
            {this.state.error && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-left mb-6 font-mono text-xs text-rose-300 max-h-36 overflow-y-auto">
                {this.state.error.toString()}
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mx-auto transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
