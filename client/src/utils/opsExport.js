import { jsPDF } from 'jspdf';
import { SETUP_STATUS, SALES_DIM_OPACITY, boothKeyOf, opsTypeCounts, venueEmoji, drawLibraryIcon, INTERNET_LABELS, SPECIAL_DESIGN_DEFAULT_COLOR } from './opsLayer';
import { accentOf } from './elementLibrary';

// Export of the Denah Operasional for crews & vendors: booths + operational elements + icon legend.
// Never contains prices: the operations page only ever receives booth identity, size, tenant, category & PIC.

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

// Whole floorplan (all visible objects) rendered at full opacity, captions & setup colours included
function renderFloorplanImage(canvas, { multiplier = 2, padding = 40 } = {}) {
  const objects = canvas.getObjects().filter(o => o.visible !== false);
  if (!objects.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objects.forEach(o => {
    const r = o.getBoundingRect();
    minX = Math.min(minX, r.left); minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.left + r.width); maxY = Math.max(maxY, r.top + r.height);
  });
  const w = maxX - minX;
  const h = maxY - minY;
  const zoom = Math.min((canvas.width - padding * 2) / (w || 1), (canvas.height - padding * 2) / (h || 1), 2);

  const savedVpt = [...canvas.viewportTransform];
  // Sales objects are dimmed in the editor; the handout shows them at their real colours
  const dimmed = canvas.getObjects().filter(o => o.isSalesLayer && o.opsOrigOpacity !== undefined);
  dimmed.forEach(o => { o.opacity = o.opsOrigOpacity; });
  canvas.setViewportTransform([zoom, 0, 0, zoom, padding - minX * zoom, padding - minY * zoom]);
  const dataUrl = canvas.toDataURL({
    format: 'png', multiplier, left: 0, top: 0,
    width: Math.ceil(w * zoom + padding * 2), height: Math.ceil(h * zoom + padding * 2)
  });
  dimmed.forEach(o => { o.opacity = o.opsOrigOpacity * SALES_DIM_OPACITY; });
  canvas.setViewportTransform(savedVpt);
  canvas.requestRenderAll();
  return dataUrl;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

/**
 * Build the handout image (floorplan + legend panel) and download it as PNG or PDF.
 *   opsObjects  operational objects on the canvas
 *   boothOps    { boothKey: { setupStatus, powerWatt, waterNeeded, internet } }
 */
export async function exportOpsFloorplan(canvas, { title = 'Denah', venue = '', format = 'png', opsObjects = [], boothOps = {} } = {}) {
  const floorUrl = renderFloorplanImage(canvas);
  if (!floorUrl) throw new Error('Denah masih kosong');
  const floor = await loadImage(floorUrl);

  const S = 2; // legend drawn at the export multiplier
  const legendW = 300 * S;
  const headerH = 64 * S;
  const pad = 16 * S;
  const types = opsTypeCounts(opsObjects);
  const booths = canvas.getObjects().filter(o => o.isBooth && o.boothData && o.visible !== false);
  const statusCounts = Object.fromEntries(Object.keys(SETUP_STATUS).map(k => [k, 0]));
  let totalWatt = 0, water = 0, internet = 0;
  // Special design booths per colour (legend: one row per colour used)
  const specialColors = new Map();
  booths.forEach(b => {
    const d = boothOps[boothKeyOf(b.boothData)];
    if (d?.specialDesign) {
      const c = d.specialColor || SPECIAL_DESIGN_DEFAULT_COLOR;
      specialColors.set(c, [...(specialColors.get(c) || []), b.boothData.code]);
    }
    statusCounts[d?.setupStatus || 'belum_datang']++;
    totalWatt += Number(d?.powerWatt) || 0;
    if (d?.waterNeeded) water++;
    if (d?.internet && d.internet !== 'tidak') internet++;
  });

  const legendRows = 7 + types.length + Object.keys(SETUP_STATUS).length + 6 + (specialColors.size ? specialColors.size + 2 : 0);
  const outW = floor.width + legendW;
  const outH = Math.max(floor.height + headerH, headerH + legendRows * 22 * S + pad * 2);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  // Header
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, outW, headerH);
  ctx.fillStyle = '#fbbf24';
  ctx.font = `bold ${11 * S}px system-ui, sans-serif`;
  ctx.fillText('DENAH OPERASIONAL', pad, 22 * S);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${18 * S}px system-ui, sans-serif`;
  ctx.fillText(title, pad, 44 * S);
  ctx.font = `${10 * S}px system-ui, sans-serif`;
  ctx.fillStyle = '#cbd5e1';
  const dateStr = new Date().toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  ctx.fillText(`${venue ? `${venue} • ` : ''}Dicetak ${dateStr} • Untuk kru & vendor (tanpa informasi harga)`, pad, 58 * S);

  ctx.drawImage(floor, 0, headerH);

  // Legend panel
  const lx = floor.width + pad;
  let y = headerH + pad + 6 * S;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(floor.width, headerH, legendW, outH - headerH);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(floor.width, headerH, 1 * S, outH - headerH);
  const heading = (text) => {
    ctx.fillStyle = '#334155';
    ctx.font = `bold ${10 * S}px system-ui, sans-serif`;
    ctx.fillText(text.toUpperCase(), lx, y);
    y += 18 * S;
  };
  const row = (drawIcon, label, value) => {
    drawIcon(lx, y - 12 * S);
    ctx.fillStyle = '#0f172a';
    ctx.font = `${11 * S}px system-ui, sans-serif`;
    const lines = wrapText(ctx, label, legendW - pad * 2 - 60 * S);
    ctx.fillText(lines[0], lx + 24 * S, y);
    if (value !== undefined) {
      ctx.font = `bold ${11 * S}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(String(value), floor.width + legendW - pad, y);
      ctx.textAlign = 'left';
    }
    y += 22 * S;
  };

  heading('Legenda Elemen Operasional');
  if (!types.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = `italic ${10 * S}px system-ui, sans-serif`;
    ctx.fillText('Belum ada elemen operasional', lx, y);
    y += 22 * S;
  }
  types.forEach(t => row((x, yy) => {
    if (t.lib) drawLibraryIcon(ctx, t.type, x, yy, 16 * S, accentOf(t.type));
    else {
      ctx.font = `${13 * S}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(venueEmoji(t.type), x, yy + 13 * S);
    }
  }, t.name, t.count));

  y += 8 * S;
  heading('Status Setup Booth');
  Object.entries(SETUP_STATUS).forEach(([key, cfg]) => row((x, yy) => {
    ctx.fillStyle = cfg.color;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, yy, 16 * S, 14 * S);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2 * S;
    ctx.strokeRect(x, yy, 16 * S, 14 * S);
  }, cfg.label, `${statusCounts[key]} booth`));

  if (specialColors.size) {
    y += 8 * S;
    heading('Booth Special Design');
    specialColors.forEach((codes, color) => row((x, yy) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x, yy, 16 * S, 14 * S);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * S;
      ctx.strokeRect(x, yy, 16 * S, 14 * S);
    }, codes.join(', '), `${codes.length} booth`));
  }

  y += 8 * S;
  heading('Tanda');
  const mark = (color, glyph) => (x, yy) => {
    ctx.beginPath();
    ctx.arc(x + 8 * S, yy + 7 * S, 8 * S, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${10 * S}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(glyph, x + 8 * S, yy + 11 * S);
    ctx.textAlign = 'left';
  };
  row(mark('#e11d48', '!'), 'Bertabrakan dengan booth');
  row(mark('#f97316', '?'), 'Booth induk sudah dihapus');

  y += 8 * S;
  heading('Kebutuhan Booth');
  const plain = () => {};
  row(plain, 'Total kebutuhan listrik', `${totalWatt.toLocaleString('id-ID')} W`);
  row(plain, 'Booth butuh air', water);
  row(plain, `Booth butuh internet (${INTERNET_LABELS.wifi}/LAN)`, internet);
  row(plain, 'Jumlah booth', booths.length);

  const safeTitle = String(title).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Denah';
  const fileBase = `Denah_Operasional_${safeTitle}`;
  const dataUrl = out.toDataURL('image/png');

  if (format === 'pdf') {
    const landscape = outW >= outH;
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a3', compress: true });
    const pageW = landscape ? 420 : 297;
    const pageH = landscape ? 297 : 420;
    const margin = 8;
    const ratio = Math.min((pageW - margin * 2) / outW, (pageH - margin * 2) / outH);
    const w = outW * ratio;
    const h = outH * ratio;
    pdf.addImage(dataUrl, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
    pdf.save(`${fileBase}.pdf`);
  } else {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${fileBase}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return { width: outW, height: outH };
}
