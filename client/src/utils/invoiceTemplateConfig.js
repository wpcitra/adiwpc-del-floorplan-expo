// Invoice Template Layout & Theme Presets Configuration

export const INVOICE_PRESETS = [
  {
    id: 'indigo_modern',
    name: 'Modern Indigo (Standar)',
    primaryColor: '#4f46e5', // indigo-600
    secondaryColor: '#0f172a', // slate-900
    accentColor: '#10b981', // emerald-500
    headerLayout: 'logo_left_info_right',
    tableHeaderStyle: 'solid_primary',
    signaturePosition: 'right',
    fontFamily: 'font-sans'
  },
  {
    id: 'slate_corporate',
    name: 'Executive Dark Slate',
    primaryColor: '#1e293b', // slate-800
    secondaryColor: '#0284c7', // sky-600
    accentColor: '#f59e0b', // amber-500
    headerLayout: 'logo_right_info_left',
    tableHeaderStyle: 'solid_dark',
    signaturePosition: 'right',
    fontFamily: 'font-sans'
  },
  {
    id: 'emerald_green',
    name: 'Emerald Eco & Nature',
    primaryColor: '#059669', // emerald-600
    secondaryColor: '#064e3b', // emerald-900
    accentColor: '#d97706', // amber-600
    headerLayout: 'logo_left_info_right',
    tableHeaderStyle: 'tinted',
    signaturePosition: 'right',
    fontFamily: 'font-sans'
  },
  {
    id: 'crimson_deluxe',
    name: 'Crimson VIP Deluxe',
    primaryColor: '#b91c1c', // red-700
    secondaryColor: '#18181b', // zinc-900
    accentColor: '#eab308', // yellow-500
    headerLayout: 'logo_center_stacked',
    tableHeaderStyle: 'solid_primary',
    signaturePosition: 'split',
    fontFamily: 'font-sans'
  },
  {
    id: 'minimal_clean',
    name: 'Minimalist Monochrome',
    primaryColor: '#111827', // gray-900
    secondaryColor: '#4b5563', // gray-600
    accentColor: '#2563eb', // blue-600
    headerLayout: 'clean_minimal',
    tableHeaderStyle: 'bordered',
    signaturePosition: 'right',
    fontFamily: 'font-sans'
  }
];

export const DEFAULT_INVOICE_CONFIG = {
  templateName: 'Modern Corporate A4',
  presetId: 'indigo_modern',
  
  // Theme Colors
  primaryColor: '#4f46e5',
  secondaryColor: '#0f172a',
  accentColor: '#10b981',
  backgroundColor: '#ffffff',
  fontFamily: 'font-sans',
  
  // Header & Logo Customization
  headerLayout: 'logo_left_info_right', // 'logo_left_info_right' | 'logo_right_info_left' | 'logo_center_stacked' | 'clean_minimal'
  showLogo: true,
  logoUrl: '', // Custom uploaded or image link
  logoSize: 44, // px height
  logoText: 'FLOORPLAN STUDIO INDONESIA',
  logoTagline: 'Official Event Management & Exhibition Services',
  
  // Organizer / Company Contact Details
  companyName: 'PT Wahyu Promo Citra',
  companyAddress: 'Gedung Exhibition Plaza Lt. 4, Jl. Jend. Sudirman Kav. 52-53, Jakarta Pusat 10210',
  companyEmail: 'finance@expokarya.id',
  companyPhone: '+62 21-555-8899 / +62 812-3456-7890',
  companyWebsite: 'www.expokarya.id',
  companyNpwp: '01.345.678.9-012.000',
  
  // Document Titles & Labels
  invoiceTitle: 'INVOICE RESMI',
  invoiceSubtitle: 'BUKTI TAGIHAN SEWA BOOTH & LAYANAN PAMERAN',
  billToLabel: 'Ditagihkan Kepada (Client / Tenant):',
  issuedByLabel: 'Penyelenggara / Rekening Tujuan:',
  
  // Section Layout & Visibility
  clientSectionPosition: 'grid_2col', // 'grid_2col' | 'stacked'
  showClientNpwp: true,
  showClientAddress: true,
  showClientPhone: true,
  showClientEmail: true,
  showWatermark: true,
  
  // Table Styling
  tableHeaderStyle: 'solid_primary', // 'solid_primary' | 'solid_dark' | 'tinted' | 'bordered' | 'minimal'
  showItemNumber: true,
  showDimensionsCol: true,
  showFacilitiesCol: true,
  
  // Calculation & Highlights
  showTerbilang: true,
  showDiscountBadge: true,
  showTax: true,
  defaultTaxRate: 11,
  
  // Payment & Bank Instructions
  bankName: 'Bank Central Asia (BCA)',
  accountNumber: '882-019-3321',
  accountName: 'PT Wahyu Promi Citra',
  bankBranch: 'KCP Sudirman Tower Jakarta',
  paymentInstructions: '1. Mohon transfer tepat sesuai nominal total tagihan ke rekening di atas.\n2. Cantumkan nomor invoice pada berita transfer bank.\n3. Konfirmasi bukti pembayaran melalui WhatsApp: +62 812-3456-7890 atau email: finance@expokarya.id.',
  
  // Signatures & Footer
  signaturePosition: 'right', // 'right' | 'left' | 'split'
  signerCity: 'Jakarta',
  signerName: 'Satrio Sukur',
  signerTitle: 'Head of Finance & Exhibition',
  signatureImageUrl: '', // Custom uploaded signature image
  showStamp: true,
  showQrCode: true,
  footerNotes: 'Invoice ini sah dan diproses otomatis oleh Floorplan Studio Indonesia.'
};
