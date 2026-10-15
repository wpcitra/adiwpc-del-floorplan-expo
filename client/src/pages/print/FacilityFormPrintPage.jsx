import React, { useEffect, useRef, useState } from 'react';
import FacilityFormA4View from '../../components/admin/FacilityFormA4View';
import { DEFAULT_INVOICE_CONFIG } from '../../utils/invoiceTemplateConfig';

// /print/facility-form (AGENTS.md §46): the facility form sheet alone, the source of the server's "Download PDF A4"
// (headless Chromium injects `window.__FACILITY_PRINT__` = { tenant, form, items, mode, docNumber, config }). The
// sheet is marked `data-print-ready="1"` once fonts and images (logo, kop surat) are loaded.
export default function FacilityFormPrintPage() {
  const [payload] = useState(() => (typeof window !== 'undefined' ? window.__FACILITY_PRINT__ || null : null));
  const [ready, setReady] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.add('print-route');
    return () => document.documentElement.classList.remove('print-route');
  }, []);

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

  if (!payload) return <div className="p-8 text-sm text-slate-600">Formulir fasilitas dibuat dari menu Fasilitas.</div>;

  return (
    <div ref={rootRef} className="facility-print-root" data-print-ready={ready ? '1' : '0'}>
      <FacilityFormA4View
        tenant={payload.tenant || {}}
        form={payload.form || {}}
        selectedItems={payload.items || []}
        mode={payload.mode === 'filled' ? 'filled' : 'blank'}
        docNumber={payload.docNumber || undefined}
        companyConfig={{ ...DEFAULT_INVOICE_CONFIG, ...(payload.config || {}) }}
      />
    </div>
  );
}
