import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportError } from '../../services/errorReporter';

// Error boundary for one part of a page (e.g. one tab of Pengaturan): only that part shows the error, the page
// header, the tab bar and the other tabs keep working. Changing `resetKey` (e.g. switching tab) clears the error.
// The error is reported to the Pusat Maintenance like the app-wide ErrorBoundary.
export default class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('SectionErrorBoundary caught an error:', error, errorInfo);
    reportError(error, { kind: 'react', componentStack: errorInfo?.componentStack });
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-xs animate-fadeIn" role="alert">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">Bagian ini gagal ditampilkan</h3>
            <p className="text-xs text-slate-500 mt-1">
              {this.props.label ? `${this.props.label} mengalami kendala. ` : ''}Bagian lain di halaman ini tetap bisa digunakan. Kesalahan sudah dilaporkan otomatis ke tim teknis.
            </p>
            <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] text-rose-700 break-words">
              {String(this.state.error?.message || this.state.error)}
            </div>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-3 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={13} /> Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }
}
