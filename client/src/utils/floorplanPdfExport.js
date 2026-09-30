import { jsPDF } from 'jspdf';

/**
 * Professional Architectural Floorplan PDF Exporter
 * Generates an official, print-ready ISO A4 Floorplan PDF document
 * with Blueprint Visuals, KPI Summary, and Exhibitor Directory.
 */
export async function exportFloorplanToPdf(canvasSource, metadata = {}, options = {}) {
  const {
    orientation = 'landscape', // 'landscape' | 'portrait'
    includeDirectory = false, // User requested: cukup bagian floorplanya saja yang dijadikan PDF
    fileName
  } = options;

  const eventTitle = metadata.eventTitle || metadata.title || 'Indonesia International Expo 2026';
  const hallTitle = metadata.hallTitle || metadata.title || 'Denah Utama';
  const venue = metadata.venue || 'Jakarta Convention Center';
  const dateStr = metadata.date || new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const booths = Array.isArray(metadata.booths) ? metadata.booths : [];
  const summary = metadata.summary || {
    total: booths.length,
    available: booths.filter(b => b.status === 'available').length,
    reserved: booths.filter(b => b.status === 'reserved').length,
    sold: booths.filter(b => b.status === 'sold').length,
    total_potential_revenue: booths.reduce((acc, b) => acc + (b.price || 0), 0)
  };

  // 1. Resolve Canvas Image DataURL with High Resolution
  let imgDataUrl = null;
  let imgNaturalW = 1400;
  let imgNaturalH = 850;

  if (typeof canvasSource === 'string') {
    imgDataUrl = canvasSource;
  } else if (canvasSource && typeof canvasSource.toDataURL === 'function') {
    try {
      imgDataUrl = canvasSource.toDataURL({ format: 'png', multiplier: 3 });
      imgNaturalW = canvasSource.width * 3 || 1400;
      imgNaturalH = canvasSource.height * 3 || 850;
    } catch (err) {
      console.warn('Canvas toDataURL failed, using fallback:', err);
    }
  }

  // 2. Initialize jsPDF (ISO A4: 297x210 mm Landscape or 210x297 mm Portrait)
  const isLandscape = orientation === 'landscape';
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = isLandscape ? 297 : 210;
  const pageHeight = isLandscape ? 210 : 297;
  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);

  // Helper for header rendering
  const drawHeader = (pageNum, totalPages) => {
    // Top Brand Bar (Slate 900)
    pdf.setFillColor(15, 23, 42); // #0f172a
    pdf.roundedRect(margin, margin, contentWidth, 15, 2, 2, 'F');

    // Accent line (Indigo 500)
    pdf.setFillColor(99, 102, 241); // #6366f1
    pdf.rect(margin, margin + 14.2, contentWidth, 0.8, 'F');

    // Event Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.text(eventTitle.toUpperCase(), margin + 5, margin + 6.5);

    // Hall & Venue
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(199, 210, 254); // indigo-200
    pdf.text(`Hall: ${hallTitle}   |   Venue: ${venue}`, margin + 5, margin + 11.5);

    // Date & Official Badge (Right-aligned)
    pdf.setFontSize(7);
    pdf.setTextColor(203, 213, 225); // slate-300
    pdf.text(`Tanggal Cetak: ${dateStr}`, pageWidth - margin - 5, margin + 6.5, { align: 'right' });

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(52, 211, 153); // emerald-400
    pdf.text('DENAH RESMI (FLOORPLAN BLUEPRINT)', pageWidth - margin - 5, margin + 11.5, { align: 'right' });
  };

  const drawFooter = (pageNum, totalPages) => {
    const footerY = pageHeight - margin + 3.5;
    pdf.setDrawColor(226, 232, 240); // slate-200
    pdf.setLineWidth(0.3);
    pdf.line(margin, footerY - 4.5, pageWidth - margin, footerY - 4.5);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text('Floorplan Studio Management System • Dokumen Resmi Denah Lantai Pameran', margin, footerY);
    pdf.text(totalPages > 1 ? `Halaman ${pageNum} dari ${totalPages}` : 'Dokumen 1 Halaman ISO A4', pageWidth - margin, footerY, { align: 'right' });
  };

  // ==========================================
  // PAGE 1: BLUEPRINT VISUAL & STATS
  // ==========================================
  const totalPages = includeDirectory && booths.length > 0 ? (1 + Math.ceil(booths.length / 16)) : 1;
  drawHeader(1, totalPages);

  // KPI & Legend Bar (Height: 8.5mm)
  const kpiY = margin + 17.5;
  pdf.setFillColor(248, 250, 252); // slate-50
  pdf.setDrawColor(226, 232, 240); // slate-200
  pdf.setLineWidth(0.3);
  pdf.roundedRect(margin, kpiY, contentWidth, 8.5, 1.2, 1.2, 'FD');

  let curX = margin + 4;
  const kpiItems = [
    { label: 'Tersedia', count: summary.available, color: [34, 197, 94] },
    { label: 'Reserved', count: summary.reserved, color: [245, 158, 11] },
    { label: 'Terjual (Sold)', count: summary.sold, color: [239, 68, 68] },
    { label: 'Total Unit', count: summary.total || booths.length, color: [59, 130, 246] }
  ];

  kpiItems.forEach(item => {
    // Circle indicator
    pdf.setFillColor(item.color[0], item.color[1], item.color[2]);
    pdf.circle(curX + 2, kpiY + 4.2, 1.8, 'F');

    // Label & count
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(71, 85, 105); // slate-600
    pdf.text(item.label, curX + 6, kpiY + 4);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 23, 42); // slate-900
    pdf.text(String(item.count), curX + 6, kpiY + 7.2);

    curX += 42;
  });

  // Scale & Revenue Info (Right Side of Legend Bar)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor(79, 70, 229); // indigo-600
  pdf.text(`Skala Denah: 1m = 20px`, pageWidth - margin - 4, kpiY + 4.2, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(`Estimasi Omzet: Rp ${(summary.total_potential_revenue || 0).toLocaleString('id-ID')}`, pageWidth - margin - 4, kpiY + 7.2, { align: 'right' });

  // Main Canvas Viewport Area - MAXIMIZED FOR CRISP FLOORPLAN BLUEPRINT
  const canvasAreaY = kpiY + 10.5;
  const canvasMaxW = contentWidth;
  const canvasMaxH = pageHeight - canvasAreaY - margin - 5;

  // Background frame for blueprint
  pdf.setFillColor(248, 250, 252); // slate-50
  pdf.setDrawColor(203, 213, 225); // slate-300
  pdf.setLineWidth(0.4);
  pdf.roundedRect(margin, canvasAreaY, canvasMaxW, canvasMaxH, 1.5, 1.5, 'FD');

  if (imgDataUrl) {
    try {
      // Calculate proportional fit without distortion
      const imgAspect = imgNaturalW / (imgNaturalH || 1);
      const areaAspect = canvasMaxW / canvasMaxH;

      let drawW = canvasMaxW;
      let drawH = canvasMaxH;

      if (imgAspect > areaAspect) {
        drawW = canvasMaxW - 4;
        drawH = drawW / imgAspect;
      } else {
        drawH = canvasMaxH - 4;
        drawW = drawH * imgAspect;
      }

      const drawX = margin + (canvasMaxW - drawW) / 2;
      const drawY = canvasAreaY + (canvasMaxH - drawH) / 2;

      pdf.addImage(imgDataUrl, 'PNG', drawX, drawY, drawW, drawH, undefined, 'FAST');
    } catch (renderErr) {
      console.warn('Failed to embed floorplan image into PDF:', renderErr);
      pdf.setFontSize(10);
      pdf.setTextColor(148, 163, 184);
      pdf.text('Denah Kanvas Sedang Dipersiapkan', margin + canvasMaxW / 2, canvasAreaY + canvasMaxH / 2, { align: 'center' });
    }
  }

  drawFooter(1, totalPages);

  // ==========================================
  // PAGE 2+: EXHIBITOR & BOOTH DIRECTORY
  // ==========================================
  if (includeDirectory && booths.length > 0) {
    const rowsPerPage = isLandscape ? 13 : 20;
    const totalDirPages = Math.ceil(booths.length / rowsPerPage);

    for (let pageIdx = 0; pageIdx < totalDirPages; pageIdx++) {
      pdf.addPage();
      const currentPageNum = 2 + pageIdx;
      drawHeader(currentPageNum, totalPages);

      const tableTopY = margin + 25;

      // Section Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(15, 23, 42);
      pdf.text(`DIREKTORI BOOTH & TENANT EXHIBITOR (${booths.length} Unit)`, margin, tableTopY);

      // Table Header Setup
      const theadY = tableTopY + 4;
      pdf.setFillColor(30, 41, 59); // slate-800
      pdf.rect(margin, theadY, contentWidth, 7, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(255, 255, 255);

      const cols = isLandscape ? [
        { label: 'No.', x: margin + 3, w: 10 },
        { label: 'Kode Booth', x: margin + 14, w: 22 },
        { label: 'Ukuran', x: margin + 38, w: 18 },
        { label: 'Tipe / Kategori', x: margin + 58, w: 26 },
        { label: 'Nama Brand / Tenant Exhibitor', x: margin + 86, w: 75 },
        { label: 'Kategori Bisnis', x: margin + 163, w: 45 },
        { label: 'Status', x: margin + 210, w: 28 },
        { label: 'Harga Sewa', x: margin + 240, w: 30 }
      ] : [
        { label: 'No.', x: margin + 3, w: 8 },
        { label: 'Kode', x: margin + 12, w: 18 },
        { label: 'Ukuran', x: margin + 32, w: 16 },
        { label: 'Tipe', x: margin + 50, w: 22 },
        { label: 'Nama Brand / Tenant', x: margin + 74, w: 50 },
        { label: 'Status', x: margin + 126, w: 28 },
        { label: 'Harga Sewa', x: margin + 156, w: 28 }
      ];

      cols.forEach(c => pdf.text(c.label, c.x, theadY + 4.8));

      // Table Rows
      let currentY = theadY + 7;
      const startIdx = pageIdx * rowsPerPage;
      const pageBooths = booths.slice(startIdx, startIdx + rowsPerPage);

      pageBooths.forEach((b, idx) => {
        const isEven = idx % 2 === 0;
        const rowHeight = 7.5;

        // Alternating row background
        if (isEven) {
          pdf.setFillColor(248, 250, 252); // slate-50
          pdf.rect(margin, currentY, contentWidth, rowHeight, 'F');
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(51, 65, 85); // slate-700

        const globalIdx = startIdx + idx + 1;
        const dimStr = b.widthM && b.heightM ? `${b.widthM}x${b.heightM}m` : (b.dimensions || '3x3m');
        const priceStr = `Rp ${(b.price || 0).toLocaleString('id-ID')}`;
        const owner = b.ownerName || b.owner_name || b.companyName || '-';
        const brandCat = b.brandCategory || b.brand_category || '-';
        const isSold = b.status === 'sold' || b.status === 'paid';
        const isReserved = b.status === 'reserved' || b.status === 'unpaid';

        // Column 1: No
        pdf.text(String(globalIdx), cols[0].x, currentY + 5);

        // Column 2: Code
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text(b.code || b.booth_number || `B-${globalIdx}`, cols[1].x, currentY + 5);

        // Column 3: Dimension
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        pdf.text(dimStr, cols[2].x, currentY + 5);

        // Column 4: Category
        pdf.text(b.category || 'Standard', cols[3].x, currentY + 5);

        // Column 5: Brand / Tenant
        pdf.setFont('helvetica', isSold ? 'bold' : 'normal');
        pdf.setTextColor(isSold ? 21 : 71, isSold ? 128 : 85, isSold ? 61 : 105);
        const truncatedOwner = owner.length > 32 ? owner.slice(0, 30) + '...' : owner;
        pdf.text(truncatedOwner, cols[4].x, currentY + 5);

        if (isLandscape) {
          // Column 6: Brand Category
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 116, 139);
          const truncatedCat = brandCat.length > 22 ? brandCat.slice(0, 20) + '...' : brandCat;
          pdf.text(truncatedCat, cols[5].x, currentY + 5);

          // Column 7: Status Badge
          if (isSold) {
            pdf.setFillColor(220, 252, 231); // green-100
            pdf.setTextColor(22, 101, 52); // green-800
            pdf.rect(cols[6].x, currentY + 1.5, 22, 4.5, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(6.5);
            pdf.text('TERJUAL', cols[6].x + 3, currentY + 4.8);
          } else if (isReserved) {
            pdf.setFillColor(254, 243, 199); // amber-100
            pdf.setTextColor(146, 64, 14); // amber-800
            pdf.rect(cols[6].x, currentY + 1.5, 22, 4.5, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(6.5);
            pdf.text('RESERVED', cols[6].x + 3, currentY + 4.8);
          } else {
            pdf.setFillColor(241, 245, 249); // slate-100
            pdf.setTextColor(71, 85, 105); // slate-600
            pdf.rect(cols[6].x, currentY + 1.5, 22, 4.5, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(6.5);
            pdf.text('TERSEDIA', cols[6].x + 3, currentY + 4.8);
          }

          // Column 8: Price
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7.5);
          pdf.setTextColor(15, 23, 42);
          pdf.text(priceStr, cols[7].x, currentY + 5);
        } else {
          // Portrait status & price
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7);
          pdf.setTextColor(isSold ? 22 : (isReserved ? 180 : 71), isSold ? 101 : (isReserved ? 83 : 85), isSold ? 52 : (isReserved ? 9 : 105));
          pdf.text(isSold ? 'TERJUAL' : (isReserved ? 'RESERVED' : 'TERSEDIA'), cols[5].x, currentY + 5);

          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(15, 23, 42);
          pdf.text(priceStr, cols[6].x, currentY + 5);
        }

        currentY += rowHeight;
      });

      // Bottom line of table
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.3);
      pdf.line(margin, currentY, margin + contentWidth, currentY);

      drawFooter(currentPageNum, totalPages);
    }
  }

  // 3. Save PDF File
  const safeName = (fileName || `Floorplan-${hallTitle}-${dateStr}`)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/__+/g, '_');
  pdf.save(`${safeName}.pdf`);
  return true;
}
