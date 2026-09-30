import db from './db.js';

// Helper to strictly fit and truncate text inside box boundaries
function formatFittedText(rawText, maxWidth, baseSize = 10, minSize = 6.5) {
  if (!rawText) return { text: '', fontSize: baseSize };
  const str = String(rawText).trim();
  const charRatio = 0.62;
  
  let fontSize = baseSize;
  let estimatedW = str.length * fontSize * charRatio;
  
  while (estimatedW > maxWidth && fontSize > minSize) {
    fontSize -= 0.5;
    estimatedW = str.length * fontSize * charRatio;
  }
  
  if (estimatedW > maxWidth) {
    let truncated = str;
    while (truncated.length > 2 && (truncated.length + 1) * fontSize * charRatio > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return { text: truncated + '…', fontSize };
  }
  
  return { text: str, fontSize };
}

export function runSeed() {
  console.log('🔄 Clearing existing database tables...');

  // Clear all existing data
  db.exec(`
    DELETE FROM orders;
    DELETE FROM booths;
    DELETE FROM venue_items;
    DELETE FROM floorplans;
    DELETE FROM events;
  `);

  console.log('🌱 Inserting master event data...');
  const eventId = 'EVT-2026-001';
  db.prepare(`
    INSERT INTO events (id, title, venue, start_date, end_date, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    'Indonesia International Expo & Tech 2026',
    'Jakarta Convention Center (Hall A)',
    '2026-10-15',
    '2026-10-18',
    'active'
  );

  const floorplanId = 'FP-2026-001';
  const gridScale = 20;

  // Booth Definitions
  const boothDefs = [
    // Row A (Standard 3x3m - 60x60px)
    { code: 'A-01', category: 'Standard', brandCategory: 'Teknologi & Gadget', widthM: 3, heightM: 3, price: 5000000, status: 'sold', owner: 'PT Telkom Indonesia', left: 180, top: 220, pic: 'Budi Hartono', phone: '0812-3456-7890', email: 'corporate@telkom.co.id', pay: 'BCA Virtual Account' },
    { code: 'A-02', category: 'Standard', brandCategory: 'Lainnya', widthM: 3, heightM: 3, price: 5000000, status: 'reserved', owner: 'Bank Mandiri', left: 260, top: 220, pic: 'Siti Rahma', phone: '0813-9876-5432', email: 'marketing@bankmandiri.co.id', pay: 'Mandiri VA' },
    { code: 'A-03', category: 'Standard', brandCategory: 'Otomotif & Aksesoris', widthM: 3, heightM: 3, price: 5000000, status: 'sold', owner: 'PT Astra Group', left: 340, top: 220, pic: 'Agus Santoso', phone: '0811-2233-4455', email: 'events@astra.co.id', pay: 'QRIS' },
    { code: 'A-04', category: 'Standard', brandCategory: 'Fashion & Apparel', widthM: 3, heightM: 3, price: 5000000, status: 'available', owner: '', left: 420, top: 220 },
    { code: 'A-05', category: 'Standard', brandCategory: 'Kuliner & F&B', widthM: 3, heightM: 3, price: 5000000, status: 'available', owner: '', left: 500, top: 220 },

    // Row B (Corner & Standard 3x3m)
    { code: 'B-01', category: 'Corner', brandCategory: 'Kuliner & F&B', widthM: 3, heightM: 3, price: 7500000, status: 'sold', owner: 'Indofood Sukses', left: 180, top: 340, pic: 'Dewi Lestari', phone: '0815-5566-7788', email: 'brand@indofood.co.id', pay: 'Kartu Kredit' },
    { code: 'B-02', category: 'Standard', brandCategory: 'Education & Academy', widthM: 3, heightM: 3, price: 5000000, status: 'available', owner: '', left: 260, top: 340 },
    { code: 'B-03', category: 'Standard', brandCategory: 'Teknologi & Gadget', widthM: 3, heightM: 3, price: 5000000, status: 'sold', owner: 'Tokopedia', left: 340, top: 340, pic: 'Rian Pratama', phone: '0817-8899-0011', email: 'expo@tokopedia.com', pay: 'QRIS' },
    { code: 'B-04', category: 'Standard', brandCategory: 'Travel & Tourism', widthM: 3, heightM: 3, price: 5000000, status: 'available', owner: '', left: 420, top: 340 },
    { code: 'B-05', category: 'Corner', brandCategory: 'Kesehatan & Beauty', widthM: 3, heightM: 3, price: 7500000, status: 'available', owner: '', left: 500, top: 340 },

    // Row C (Premium 6x3m - 120x60px)
    { code: 'C-01', category: 'Premium', brandCategory: 'Teknologi & Gadget', widthM: 6, heightM: 3, price: 12000000, status: 'sold', owner: 'Samsung Electronics', left: 180, top: 460, pic: 'Kim Jae-won', phone: '0812-7788-9900', email: 'b2b.id@samsung.com', pay: 'Bank Transfer' },
    { code: 'C-02', category: 'Premium', brandCategory: 'Properti & Interior', widthM: 6, heightM: 3, price: 12000000, status: 'available', owner: '', left: 340, top: 460 },
    { code: 'C-03', category: 'Premium', brandCategory: 'Kerajinan & Craft', widthM: 6, heightM: 3, price: 12000000, status: 'available', owner: '', left: 500, top: 460 },

    // VIP Island (6x6m - 120x120px)
    { code: 'VIP-01', category: 'Island', brandCategory: 'Teknologi & Gadget', widthM: 6, heightM: 6, price: 25000000, status: 'sold', owner: 'Google Cloud Indonesia', left: 660, top: 220, pic: 'Sarah Wijaya', phone: '0819-1122-3344', email: 'cloud-events@google.com', pay: 'BCA Virtual Account' },
    { code: 'VIP-02', category: 'Island', brandCategory: 'Otomotif & Aksesoris', widthM: 6, heightM: 6, price: 25000000, status: 'available', owner: '', left: 660, top: 380 }
  ];

  // Venue items definitions
  const venueDefs = [
    { id: 'venue_stage', type: 'stage', label: 'MAIN STAGE & PRESENTATION', category: 'facility', widthM: 14, heightM: 3, left: 420, top: 80, bg: '#3b82f6', border: '#1d4ed8' },
    { id: 'venue_entrance', type: 'entrance', label: 'MAIN ENTRANCE / REGISTRATION', category: 'facility', widthM: 6, heightM: 1.5, left: 120, top: 80, bg: '#047857', border: '#065f46' },
    { id: 'venue_exit', type: 'exit', label: 'EMERGENCY EXIT K3', category: 'structure', widthM: 4, heightM: 1.5, left: 880, top: 80, bg: '#991b1b', border: '#7f1d1d' },
    { id: 'venue_toilet', type: 'toilet', label: 'RESTROOM & VIP LOUNGE', category: 'facility', widthM: 6, heightM: 3, left: 880, top: 220, bg: '#0284c7', border: '#0369a1' },
    { id: 'venue_cafe', type: 'cafe', label: 'FOOD COURT & CAFE', category: 'facility', widthM: 6, heightM: 4, left: 880, top: 360, bg: '#d97706', border: '#b45309' },
    { id: 'venue_pillar1', type: 'pillar', label: '■ PILLAR', category: 'structure', widthM: 1.5, heightM: 1.5, left: 120, top: 280, bg: '#475569', border: '#334155' },
    { id: 'venue_pillar2', type: 'pillar', label: '■ PILLAR', category: 'structure', widthM: 1.5, heightM: 1.5, left: 600, top: 280, bg: '#475569', border: '#334155' }
  ];

  console.log('🏛️ Generating Fabric.js Canvas Objects JSON...');

  // Construct Fabric Canvas JSON
  const fabricObjects = [];

  // 1. Add Venue Items
  venueDefs.forEach(v => {
    const pixelW = v.widthM * gridScale;
    const pixelH = v.heightM * gridScale;
    const fittedLabel = formatFittedText(v.label, pixelW - 12, 11, 7);

    fabricObjects.push({
      type: 'group',
      left: v.left,
      top: v.top,
      width: pixelW,
      height: pixelH,
      originX: 'center',
      originY: 'center',
      isVenueItem: true,
      venueData: {
        id: v.id,
        type: v.type,
        category: v.category,
        label: v.label,
        widthM: v.widthM,
        heightM: v.heightM,
        width: pixelW,
        height: pixelH,
        gridScale
      },
      objects: [
        {
          type: 'rect',
          width: pixelW,
          height: pixelH,
          fill: v.bg,
          stroke: v.border,
          strokeWidth: 2,
          strokeUniform: true,
          rx: 6,
          ry: 6,
          originX: 'center',
          originY: 'center'
        },
        {
          type: 'text',
          text: fittedLabel.text,
          fontSize: fittedLabel.fontSize,
          fontWeight: 'bold',
          fill: '#ffffff',
          originX: 'center',
          originY: 'center'
        }
      ]
    });
  });

  // 2. Add Booth Items
  boothDefs.forEach((b, idx) => {
    const boothId = `booth_seeded_${idx + 1}`;
    const pixelW = b.widthM * gridScale;
    const pixelH = b.heightM * gridScale;

    const isSold = b.status === 'sold';
    const isReserved = b.status === 'reserved';

    const bgColor = isSold ? '#fef2f2' : (isReserved ? '#fffbeb' : '#ecfdf5');
    const borderColor = isSold ? '#ef4444' : (isReserved ? '#f59e0b' : '#10b981');
    const statusColor = isSold ? '#ef4444' : (isReserved ? '#f59e0b' : '#10b981');
    const catColor = b.category === 'Corner' ? '#06b6d4' : (b.category === 'Premium' ? '#8b5cf6' : (b.category === 'Island' ? '#f59e0b' : '#3b82f6'));

    const fittedOwner = formatFittedText(b.owner || '(Nama Pemilik)', pixelW - 12, 10, 6.5);
    const fittedCode = formatFittedText(b.code, (pixelW / 2) - 8, 10, 8);
    const fittedDim = formatFittedText(`${b.widthM}x${b.heightM}m`, (pixelW / 2) - 8, 8, 6.5);

    fabricObjects.push({
      type: 'group',
      left: b.left,
      top: b.top,
      width: pixelW,
      height: pixelH,
      originX: 'left',
      originY: 'top',
      isBooth: true,
      boothData: {
        id: boothId,
        code: b.code,
        category: b.category,
        brandCategory: b.brandCategory || 'Teknologi & Gadget',
        status: b.status,
        price: b.price,
        ownerName: b.owner,
        widthM: b.widthM,
        heightM: b.heightM,
        facilities: ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL']
      },
      objects: [
        {
          type: 'rect',
          width: pixelW,
          height: pixelH,
          fill: bgColor,
          stroke: borderColor,
          strokeWidth: 2,
          strokeUniform: true,
          rx: 6,
          ry: 6,
          originX: 'center',
          originY: 'center'
        },
        {
          type: 'rect',
          width: Math.max(10, pixelW - 4),
          height: 4,
          fill: catColor,
          rx: 2,
          ry: 2,
          top: -(pixelH / 2) + 4,
          originX: 'center',
          originY: 'center'
        },
        {
          type: 'text',
          text: fittedDim.text,
          fontSize: fittedDim.fontSize,
          fill: '#475569',
          left: -(pixelW / 2) + 6,
          top: -(pixelH / 2) + 8,
          originX: 'left',
          originY: 'top'
        },
        {
          type: 'text',
          text: fittedCode.text,
          fontSize: fittedCode.fontSize,
          fontWeight: 'bold',
          fill: '#0f172a',
          left: (pixelW / 2) - 6,
          top: -(pixelH / 2) + 8,
          originX: 'right',
          originY: 'top'
        },
        {
          type: 'text',
          text: fittedOwner.text,
          fontSize: fittedOwner.fontSize,
          fontWeight: b.owner ? 'bold' : 'normal',
          fontStyle: b.owner ? 'normal' : 'italic',
          fill: b.owner ? '#0f172a' : '#94a3b8',
          left: 0,
          top: 1,
          originX: 'center',
          originY: 'center'
        },
        {
          type: 'text',
          text: b.status.toUpperCase(),
          fontSize: 7.5,
          fontWeight: 'bold',
          fill: statusColor,
          left: 0,
          top: (pixelH / 2) - 4,
          originX: 'center',
          originY: 'bottom'
        }
      ]
    });
  });

  const canvasFabricJson = {
    version: '6.0.0',
    objects: fabricObjects
  };

  const metadataJson = {
    schema_version: '1.0',
    event: {
      id: eventId,
      title: 'Indonesia International Expo & Tech 2026',
      venue: 'Jakarta Convention Center (Hall A)',
      created_at: new Date().toISOString()
    },
    booths: boothDefs.map((b, i) => ({
      id: `booth_seeded_${i + 1}`,
      booth_number: b.code,
      code: b.code,
      category: b.category,
      brand_category: b.brandCategory || 'Teknologi & Gadget',
      price: b.price,
      status: b.status,
      owner_name: b.owner,
      ownerName: b.owner,
      dimensions_meters: { width: b.widthM, height: b.heightM },
      coordinates: { x: b.left, y: b.top, width: b.widthM * gridScale, height: b.heightM * gridScale, rotation: 0 },
      facilities: ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL']
    })),
    venue_elements: venueDefs.map(v => ({
      id: v.id,
      type: v.type,
      category: v.category,
      label: v.label,
      dimensions_meters: { width: v.widthM, height: v.heightM },
      coordinates: { x: v.left, y: v.top, width: v.widthM * gridScale, height: v.heightM * gridScale, rotation: 0 }
    }))
  };

  console.log('💾 Saving Floorplan into database...');
  db.prepare(`
    INSERT INTO floorplans (id, event_id, title, canvas_fabric_json, metadata_json, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    floorplanId,
    eventId,
    'Denah Utama Pameran 2026 (Hall A)',
    JSON.stringify(canvasFabricJson),
    JSON.stringify(metadataJson),
    'published'
  );

  console.log('🎪 Inserting Booths records...');
  const insertBooth = db.prepare(`
    INSERT INTO booths (id, floorplan_id, code, category, brand_category, price, status, owner_name, width_m, height_m, facilities_json, coordinates_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  boothDefs.forEach((b, i) => {
    insertBooth.run(
      `booth_seeded_${i + 1}`,
      floorplanId,
      b.code,
      b.category,
      b.brandCategory || 'Teknologi & Gadget',
      b.price,
      b.status,
      b.owner || '',
      b.widthM,
      b.heightM,
      JSON.stringify(['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL']),
      JSON.stringify({ x: b.left, y: b.top, width: b.widthM * gridScale, height: b.heightM * gridScale, rotation: 0 })
    );
  });

  console.log('🏢 Inserting Venue Facilities records...');
  const insertVenue = db.prepare(`
    INSERT INTO venue_items (id, floorplan_id, type, category, label, width_m, height_m, coordinates_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  venueDefs.forEach(v => {
    insertVenue.run(
      v.id,
      floorplanId,
      v.type,
      v.category,
      v.label,
      v.widthM,
      v.heightM,
      JSON.stringify({ x: v.left, y: v.top, width: v.widthM * gridScale, height: v.heightM * gridScale, rotation: 0 })
    );
  });

  console.log('💳 Generating Confirmed Orders for Sold Booths...');
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, floorplan_id, booth_id, booth_code, company_name, pic_name, email, phone, total_amount, payment_method, payment_status, invoice_number, brand_category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let orderCount = 0;
  boothDefs.forEach((b, i) => {
    if (b.status === 'sold' && b.owner) {
      orderCount++;
      const grandTotal = Math.round(b.price * 1.11);
      insertOrder.run(
        `ORD-2026-${String(orderCount).padStart(3, '0')}`,
        floorplanId,
        `booth_seeded_${i + 1}`,
        b.code,
        b.owner,
        b.pic || 'PIC Perusahaan',
        b.email || 'finance@exhibitor.co.id',
        b.phone || '0812-0000-0000',
        grandTotal,
        b.pay || 'QRIS',
        'PAID',
        `INV/2026/09/EXP-${String(100 + orderCount)}`,
        b.brandCategory || 'Teknologi & Gadget'
      );
    }
  });

  console.log(`✅ Database seeding completed successfully! ${boothDefs.length} booths, ${venueDefs.length} facilities, and ${orderCount} paid orders inserted.`);

  return {
    success: true,
    boothsCount: boothDefs.length,
    ordersCount: orderCount,
    canvasFabricJson,
    metadataJson
  };
}

// If run directly via CLI
if (process.argv[1]?.endsWith('seed.js')) {
  runSeed();
}
