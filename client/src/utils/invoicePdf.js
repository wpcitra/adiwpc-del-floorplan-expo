// Invoice PDF & print (AGENTS.md §34). ONE template for everything: the print route /print/invoice/:id renders
// InvoiceA4View (the same component as the on-screen preview) with the app's full stylesheet.
//   - Download PDF: the server opens that route in headless Chromium and returns the PDF.
//   - Print Invoice (and the fallback when the server has no Chromium): the same route in a hidden frame of this
//     browser, printed once the stylesheet, fonts and images are in.
import { apiFetch } from '../services/session';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api');
const FRAME_ID = 'invoice-print-frame';

export const invoicePdfFileName = (invoice) =>
  `Invoice-${String(invoice?.invoice_number || invoice?.invoiceNumber || 'Dokumen').replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf`;

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Download the invoice as PDF made by the server. `config` only for a design that is not saved yet (layout editor)
 * or an invoice that is not issued yet. Returns { success } or { success: false, unavailable, error }.
 */
export async function downloadInvoicePdf({ invoice, config = null, preview = false, fileName }) {
  try {
    const issued = !preview && invoice?.id && !String(invoice.id).startsWith('INV-DOC');
    const res = issued
      ? await apiFetch(`${API_BASE_URL}/invoices/${encodeURIComponent(invoice.id)}/pdf${invoice.pdfToken ? `?token=${encodeURIComponent(invoice.pdfToken)}` : ''}`)
      : await apiFetch(`${API_BASE_URL}/invoices/pdf-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice, config }) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { success: false, unavailable: res.status === 503, error: json.error || `PDF gagal dibuat (HTTP ${res.status})` };
    }
    saveBlob(await res.blob(), fileName || invoicePdfFileName(invoice));
    return { success: true };
  } catch (e) {
    return { success: false, unavailable: true, error: 'Server tidak dapat dihubungi' };
  }
}

/**
 * Print with this browser: the print route in a hidden frame, fed with the invoice and design shown on screen
 * (also a design that is not saved, or a visitor's invoice). The dialog opens once the page says it is ready.
 */
export function printInvoice({ invoice, config }) {
  return new Promise((resolve) => {
    document.getElementById(FRAME_ID)?.remove();
    window.__INVOICE_PRINT_PAYLOAD__ = { invoice, config };
    const frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.setAttribute('aria-hidden', 'true');
    // off-screen at A4 width (a 0 x 0 frame would lay the sheet out for a zero-width page)
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
    frame.src = `/print/invoice/${encodeURIComponent(String(invoice?.id || 'preview'))}?frame=1`;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(giveUp);
      resolve(ok);
      setTimeout(() => frame.remove(), 60000); // the dialog is still open while the frame prints
    };
    const poll = setInterval(() => {
      try {
        if (!frame.contentDocument?.querySelector('[data-print-ready="1"]')) return;
        frame.contentWindow.focus();
        frame.contentWindow.print();
        finish(true);
      } catch (e) {
        finish(false);
      }
    }, 150);
    const giveUp = setTimeout(() => finish(false), 20000);
    document.body.appendChild(frame);
  });
}
