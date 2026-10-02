import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import InvoiceA4View from '../../components/admin/InvoiceA4View';
import { DEFAULT_INVOICE_CONFIG } from '../../utils/invoiceTemplateConfig';
import { api } from '../../services/api';

// /print/invoice/:id (AGENTS.md §34): the invoice sheet alone, at A4 size, with the design it is given. The source of
// the PDF made by the server (headless Chromium injects `window.__INVOICE_PRINT__`) and of "Print Invoice" (the page
// that opened this frame provides `__INVOICE_PRINT_PAYLOAD__`). Opened directly, a logged-in user gets the invoice
// from the API. The sheet is marked `data-print-ready="1"` once stylesheet, fonts and images are loaded.
function injectedPayload() {
  try {
    if (window.__INVOICE_PRINT__) return window.__INVOICE_PRINT__;
    if (window.parent && window.parent !== window && window.parent.__INVOICE_PRINT_PAYLOAD__) return window.parent.__INVOICE_PRINT_PAYLOAD__;
  } catch (e) { /* another origin: nothing injected */ }
  return null;
}

export default function InvoicePrintPage() {
  const { id } = useParams();
  const [payload, setPayload] = useState(injectedPayload);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.add('print-route');
    return () => document.documentElement.classList.remove('print-route');
  }, []);

  useEffect(() => {
    if (payload) return;
    let alive = true;
    Promise.all([api.fetchInvoiceById(id), api.fetchInvoiceConfig()]).then(([invoice, config]) => {
      if (!alive) return;
      if (invoice) setPayload({ invoice, config: config || null });
      else setError('Invoice tidak ditemukan, atau Anda belum login.');
    });
    return () => { alive = false; };
  }, [id, payload]);

  // Ready = this render is painted, every font the sheet uses is loaded and every image has finished (or failed)
  useEffect(() => {
    if (!payload) return undefined;
    let alive = true;
    const settle = async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const images = [...(rootRef.current?.querySelectorAll('img') || [])];
      await Promise.all(images.map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; }))));
      try { await document.fonts.ready; } catch (e) { /* older browser */ }
      await new Promise(r => requestAnimationFrame(r));
      if (alive) setReady(true);
    };
    settle();
    return () => { alive = false; };
  }, [payload]);

  if (error) return <div className="p-8 text-sm text-slate-600">{error}</div>;
  if (!payload) return <div className="p-8 text-sm text-slate-500">Memuat invoice…</div>;

  return (
    <div ref={rootRef} className="invoice-print-root" data-print-ready={ready ? '1' : '0'}>
      <InvoiceA4View invoice={payload.invoice} config={{ ...DEFAULT_INVOICE_CONFIG, ...(payload.config || {}) }} printMode />
    </div>
  );
}
