import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Pre-load and convert external images to base64 or ensure completed loading
 */
async function prepareElementImages(element) {
  if (!element) return;
  const images = Array.from(element.querySelectorAll('img'));

  await Promise.all(
    images.map(async (img) => {
      try {
        if (img.complete && img.naturalHeight !== 0) {
          return;
        }
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 600);
        });
      } catch (e) {
        // Continue gracefully
      }
    })
  );
}

/**
 * Direct isolated print targeting ONLY the clean A4 invoice sheet (1 page exact)
 */
export async function printInvoiceElement(elementOrId = 'printable-invoice-a4') {
  const element = typeof elementOrId === 'string' 
    ? document.getElementById(elementOrId) 
    : elementOrId;

  if (!element) {
    console.warn('Elemen invoice tidak ditemukan untuk print, fallback ke window.print()');
    window.print();
    return;
  }

  // Pre-load images on source element
  await prepareElementImages(element);

  // Remove any previously orphaned print iframes
  const oldIframe = document.getElementById('invoice-isolated-print-iframe');
  if (oldIframe) {
    oldIframe.remove();
  }

  // Create isolated iframe for clean single-page printing
  const iframe = document.createElement('iframe');
  iframe.id = 'invoice-isolated-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

  // Extract all existing stylesheet and style tags from current document
  const headStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(style => style.outerHTML)
    .join('\n');

  // Exact A4 CSS with strict 1-page constraints and margin zero
  const isolatedPrintCss = `
    <style>
      @page {
        size: 210mm 297mm;
        margin: 0;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        visibility: visible !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 210mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
        background: #ffffff !important;
        overflow: hidden !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      body * {
        visibility: visible !important;
      }
      #printable-invoice-a4,
      #printable-facility-form-a4,
      .printable-a4-sheet,
      [id^="printable-"] {
        visibility: visible !important;
        width: 210mm !important;
        height: 297mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        box-sizing: border-box !important;
        padding: 12mm 14mm !important;
        margin: 0 auto !important;
        border: none !important;
        box-shadow: none !important;
        transform: none !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        background: #ffffff !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        overflow: hidden !important;
      }
      #printable-invoice-a4 *,
      #printable-facility-form-a4 *,
      .printable-a4-sheet *,
      [id^="printable-"] * {
        visibility: visible !important;
      }
      img {
        visibility: visible !important;
        display: inline-block !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      svg {
        visibility: visible !important;
        display: inline-block !important;
      }
    </style>
  `;

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>Print Invoice A4</title>
        ${headStyles}
        ${isolatedPrintCss}
      </head>
      <body>
        ${element.outerHTML}
      </body>
    </html>
  `);
  iframeDoc.close();

  // Wait for all images inside iframe to be ready
  const iframeImages = Array.from(iframeDoc.querySelectorAll('img'));
  await Promise.all(
    iframeImages.map(img => {
      if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 800);
      });
    })
  );

  // Short delay for layout & font rendering
  await new Promise(r => setTimeout(r, 200));

  try {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  } catch (err) {
    console.error('Iframe print error, falling back to window.print():', err);
    window.print();
  } finally {
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        iframe.remove();
      }
    }, 4000);
  }
}

/**
 * Generate and download official A4 PDF document matching Live Canvas Preview
 */
export async function downloadInvoicePDF(elementOrId = 'printable-invoice-a4', fileName = 'Invoice.pdf') {
  const element = typeof elementOrId === 'string' 
    ? document.getElementById(elementOrId) 
    : elementOrId;

  if (!element) {
    throw new Error('Elemen invoice tidak ditemukan');
  }

  // Preload images
  await prepareElementImages(element);

  // Render to canvas with safe CORS options and unscaled clone
  const canvas = await html2canvas(element, {
    scale: 2, // 2x DPI for crisp text, logos & vectors
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    scrollY: 0,
    scrollX: 0,
    onclone: (clonedDoc) => {
      // Find the target invoice/form element inside the cloned document
      const targetId = typeof elementOrId === 'string' ? elementOrId : (element?.id || 'printable-invoice-a4');
      const clonedTarget = clonedDoc.getElementById(targetId) || 
        clonedDoc.getElementById('printable-facility-form-a4') || 
        clonedDoc.getElementById('printable-invoice-a4') || 
        clonedDoc.querySelector('.printable-a4-sheet') || 
        clonedDoc.querySelector('[id^="printable-"]');
      if (clonedTarget) {
        // Reset any CSS transforms on cloned element and its parents
        let parent = clonedTarget.parentElement;
        while (parent && parent.nodeType === 1) {
          parent.style.transform = 'none';
          parent.style.zoom = '1';
          parent.style.filter = 'none';
          parent.style.backdropFilter = 'none';
          parent.style.overflow = 'visible';
          parent = parent.parentElement;
        }

        clonedTarget.style.transform = 'none';
        clonedTarget.style.boxShadow = 'none';
        clonedTarget.style.border = 'none';
        clonedTarget.style.width = '210mm';
        clonedTarget.style.height = '297mm';
        clonedTarget.style.minHeight = '297mm';
        clonedTarget.style.maxHeight = '297mm';
        clonedTarget.style.boxSizing = 'border-box';
        clonedTarget.style.margin = '0 auto';
        clonedTarget.style.visibility = 'visible';
        clonedTarget.style.display = 'flex';
        clonedTarget.style.flexDirection = 'column';
        clonedTarget.style.justifyContent = 'space-between';
      }
    }
  });

  // Create jsPDF instance (ISO A4: 210mm x 297mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pdfWidth = 210;
  const pdfHeight = 297;
  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * pdfWidth) / canvas.width;

  // Single page invoice check (standard A4 with 15mm tolerance for sub-pixel differences)
  if (imgHeight <= pdfHeight + 15) {
    pdf.addImage(canvas, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  } else {
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pdfHeight;

    while (heightLeft > 5) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas, 'PNG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;
    }
  }

  const cleanName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  pdf.save(cleanName);
  return true;
}
