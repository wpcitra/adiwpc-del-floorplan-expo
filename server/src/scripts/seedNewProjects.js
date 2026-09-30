import db from '../db.js';
import { syncPaymentStatusFromInvoices } from '../utils/syncPaymentStatus.js';

console.log('--- STARTING DATABASE RESET & SEEDING MULTI-HALL PROJECTS ---');

const GRID_SCALE = 20; // 20px = 1m

const seed = db.transaction(() => {
  // 1. Wipe existing project tables
  console.log('1. Wiping old project data...');
  db.prepare('DELETE FROM invoices').run();
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM booths').run();
  db.prepare('DELETE FROM venue_items').run();
  db.prepare('DELETE FROM brand_categories').run();
  db.prepare('DELETE FROM floorplans').run();
  db.prepare('DELETE FROM events').run();

  // ==========================================
  // PROJECT 1: Indonesia Tech & AI Summit 2026
  // ==========================================
  const event1 = {
    id: 'EVT-TECH-2026',
    title: 'Indonesia Tech & AI Summit 2026',
    venue: 'JIExpo Kemayoran',
    startDate: '2026-10-20',
    endDate: '2026-10-23'
  };

  // Hall A: Cloud & Enterprise AI
  const p1_hallA = {
    id: 'FP-2026-001',
    eventId: event1.id,
    eventTitle: event1.title,
    eventVenue: event1.venue,
    title: 'Hall A - Cloud & Enterprise AI',
    venue: 'JIExpo Kemayoran (Hall A)',
    startDate: event1.startDate,
    endDate: event1.endDate,
    brandCategories: [
      'Artificial Intelligence & Robotics',
      'Cloud Computing & Cybersecurity',
      'Startup & Venture Capital',
      'Fintech & Digital Banking'
    ],
    booths: [
      // VIP Islands (6x6m = 120x120px)
      {
        code: 'VIP-01',
        category: 'Island',
        shape: 'rectangle',
        widthM: 6,
        heightM: 6,
        price: 25000000,
        status: 'sold',
        ownerName: 'Google Cloud Indonesia',
        brandCategory: 'Cloud Computing & Cybersecurity',
        clientName: 'Budi Raharjo',
        companyName: 'PT Google Cloud Services Indonesia',
        clientEmail: 'contact@googlecloud.co.id',
        clientPhone: '081288991122',
        left: 640,
        top: 200
      },
      {
        code: 'VIP-02',
        category: 'Island',
        shape: 'rectangle',
        widthM: 6,
        heightM: 6,
        price: 25000000,
        status: 'reserved',
        ownerName: 'OpenAI Partner Lab',
        brandCategory: 'Artificial Intelligence & Robotics',
        clientName: 'Sarah Jenkins',
        companyName: 'PT Partner Lab Artifisial',
        clientEmail: 'sarah@partnerlab.ai',
        clientPhone: '081199887766',
        left: 640,
        top: 360
      },

      // Premium Booths (6x3m = 120x60px)
      {
        code: 'CLOUD-01',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'sold',
        ownerName: 'Astra Graphia IT Solutions',
        brandCategory: 'Cloud Computing & Cybersecurity',
        clientName: 'Hendro Prasetyo',
        companyName: 'PT Astra Graphia Information Technology',
        clientEmail: 'hendro@agit.astra.co.id',
        clientPhone: '081377889900',
        left: 180,
        top: 460
      },
      {
        code: 'CLOUD-02',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 380,
        top: 460
      },

      // Corner Booths (3x3m = 60x60px)
      {
        code: 'INNO-01',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'sold',
        ownerName: 'Bank Mandiri Digital',
        brandCategory: 'Fintech & Digital Banking',
        clientName: 'Reza Firmansyah',
        companyName: 'PT Bank Mandiri (Persero) Tbk',
        clientEmail: 'digital@bankmandiri.co.id',
        clientPhone: '081234567890',
        left: 180,
        top: 220
      },
      {
        code: 'INNO-02',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 500,
        top: 220
      },

      // Standard Booths (3x3m = 60x60px)
      {
        code: 'TECH-01',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'sold',
        ownerName: 'NVIDIA AI Studio',
        brandCategory: 'Artificial Intelligence & Robotics',
        clientName: 'David Lee',
        companyName: 'NVIDIA Indonesia Lab',
        clientEmail: 'david@nvidia.com',
        clientPhone: '081299881122',
        left: 260,
        top: 220
      },
      {
        code: 'TECH-02',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'reserved',
        ownerName: 'Kopi Kenangan Tech',
        brandCategory: 'Startup & Venture Capital',
        clientName: 'Edward Tirtanata',
        companyName: 'PT Bumi Berkah Boga (Kopi Kenangan)',
        clientEmail: 'finance@kopikenangan.com',
        clientPhone: '081566778899',
        left: 340,
        top: 220
      },
      {
        code: 'TECH-03',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 420,
        top: 220
      },
      {
        code: 'TECH-04',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 260,
        top: 340
      },
      {
        code: 'TECH-05',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 340,
        top: 340
      },
      {
        code: 'TECH-06',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 420,
        top: 340
      }
    ],
    venueItems: [
      {
        id: 'venue_tech_stage',
        type: 'stage',
        label: 'KEYNOTE STAGE & AI DEMO',
        category: 'facility',
        widthM: 14,
        heightM: 3,
        left: 420,
        top: 80,
        bg: '#3b82f6',
        border: '#1d4ed8'
      },
      {
        id: 'venue_tech_entrance',
        type: 'entrance',
        label: 'REGISTRATION & BADGE PICKUP',
        category: 'facility',
        widthM: 6,
        heightM: 1.5,
        left: 120,
        top: 80,
        bg: '#047857',
        border: '#065f46'
      },
      {
        id: 'venue_tech_exit',
        type: 'exit',
        label: 'EMERGENCY EXIT',
        category: 'structure',
        widthM: 4,
        heightM: 1.5,
        left: 820,
        top: 80,
        bg: '#991b1b',
        border: '#7f1d1d'
      },
      {
        id: 'venue_tech_lounge',
        type: 'cafe',
        label: 'VIP LOUNGE & NETWORKING BAR',
        category: 'facility',
        widthM: 6,
        heightM: 4,
        left: 820,
        top: 260,
        bg: '#8b5cf6',
        border: '#6d28d9'
      }
    ]
  };

  // Hall B: Robotics & Startup Arena
  const p1_hallB = {
    id: 'FP-TECH-002',
    eventId: event1.id,
    eventTitle: event1.title,
    eventVenue: event1.venue,
    title: 'Hall B - Robotics & Startup Arena',
    venue: 'JIExpo Kemayoran (Hall B)',
    startDate: event1.startDate,
    endDate: event1.endDate,
    brandCategories: [
      'Artificial Intelligence & Robotics',
      'Cloud Computing & Cybersecurity',
      'Startup & Venture Capital',
      'Fintech & Digital Banking'
    ],
    booths: [
      // VIP Island
      {
        code: 'ROBOT-01',
        category: 'Island',
        shape: 'rectangle',
        widthM: 6,
        heightM: 6,
        price: 25000000,
        status: 'sold',
        ownerName: 'Boston Dynamics Indonesia',
        brandCategory: 'Artificial Intelligence & Robotics',
        clientName: 'Hendri Susanto',
        companyName: 'PT Robotika Nusantara Solusi',
        clientEmail: 'hendri@robotika.id',
        clientPhone: '081299110022',
        left: 640,
        top: 220
      },
      // Premium Booths
      {
        code: 'STARTUP-01',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'sold',
        ownerName: 'Tokopedia by ByteDance',
        brandCategory: 'Startup & Venture Capital',
        clientName: 'Melissa Siska',
        companyName: 'PT Tokopedia',
        clientEmail: 'melissa@tokopedia.com',
        clientPhone: '081122334466',
        left: 180,
        top: 440
      },
      {
        code: 'STARTUP-02',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 380,
        top: 440
      },
      // Corner Booths
      {
        code: 'CYBER-01',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'reserved',
        ownerName: 'Kaspersky Lab Indonesia',
        brandCategory: 'Cloud Computing & Cybersecurity',
        clientName: 'Anton Wijaya',
        companyName: 'PT Cyber Security Mandiri',
        clientEmail: 'anton@kaspersky.co.id',
        clientPhone: '081333445566',
        left: 180,
        top: 220
      },
      {
        code: 'CYBER-02',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 500,
        top: 220
      },
      // Standard Booths
      {
        code: 'BOT-01',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'sold',
        ownerName: 'Drone Racing Indo',
        brandCategory: 'Artificial Intelligence & Robotics',
        clientName: 'Rian Hidayat',
        companyName: 'PT Aero Drone Indonesia',
        clientEmail: 'rian@aerodrone.id',
        clientPhone: '081788990011',
        left: 260,
        top: 220
      },
      {
        code: 'BOT-02',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 340,
        top: 220
      },
      {
        code: 'BOT-03',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 420,
        top: 220
      },
      {
        code: 'BOT-04',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 260,
        top: 330
      },
      {
        code: 'BOT-05',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 340,
        top: 330
      }
    ],
    venueItems: [
      {
        id: 'venue_tech_b_stage',
        type: 'stage',
        label: 'ROBOT BATTLE & DRONE ARENA',
        category: 'facility',
        widthM: 14,
        heightM: 3,
        left: 420,
        top: 80,
        bg: '#7c3aed',
        border: '#6d28d9'
      },
      {
        id: 'venue_tech_b_entrance',
        type: 'entrance',
        label: 'EAST GATE & SECURITY SCAN',
        category: 'facility',
        widthM: 6,
        heightM: 1.5,
        left: 120,
        top: 80,
        bg: '#047857',
        border: '#065f46'
      },
      {
        id: 'venue_tech_b_exit',
        type: 'exit',
        label: 'EMERGENCY EXIT B',
        category: 'structure',
        widthM: 4,
        heightM: 1.5,
        left: 820,
        top: 80,
        bg: '#991b1b',
        border: '#7f1d1d'
      },
      {
        id: 'venue_tech_b_cafe',
        type: 'cafe',
        label: 'PITCHING & COFFEE CORNER',
        category: 'facility',
        widthM: 6,
        heightM: 4,
        left: 820,
        top: 260,
        bg: '#d97706',
        border: '#b45309'
      }
    ]
  };

  // ==========================================
  // PROJECT 2: Jakarta Culinary & Halal Food Expo 2026
  // ==========================================
  const event2 = {
    id: 'EVT-FOOD-2026',
    title: 'Jakarta Culinary & Halal Food Expo 2026',
    venue: 'Jakarta Convention Center (JCC Senayan)',
    startDate: '2026-11-12',
    endDate: '2026-11-15'
  };

  // Hall A: Artisan Coffee & Halal Gourmet
  const p2_hallA = {
    id: 'FP-FOOD-2026',
    eventId: event2.id,
    eventTitle: event2.title,
    eventVenue: event2.venue,
    title: 'Hall A - Artisan Coffee & Halal Gourmet',
    venue: 'Jakarta Convention Center (Hall A)',
    startDate: event2.startDate,
    endDate: event2.endDate,
    brandCategories: [
      'Artisan Coffee & Beverages',
      'Halal Gourmet & Restaurant',
      'Organic & Healthy Living',
      'Food Packaging & Kitchen Tech'
    ],
    booths: [
      // Island Booth (6x6m = 120x120px)
      {
        code: 'FEST-01',
        category: 'Island',
        shape: 'rectangle',
        widthM: 6,
        heightM: 6,
        price: 20000000,
        status: 'sold',
        ownerName: 'Indofood Sukses Makmur',
        brandCategory: 'Halal Gourmet & Restaurant',
        clientName: 'Axton Salim',
        companyName: 'PT Indofood CBP Sukses Makmur Tbk',
        clientEmail: 'corporate@indofood.co.id',
        clientPhone: '081122334455',
        left: 640,
        top: 240
      },

      // Premium Booths (6x3m = 120x60px)
      {
        code: 'CHEF-01',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'sold',
        ownerName: 'Kopi Nusantara Roastery',
        brandCategory: 'Artisan Coffee & Beverages',
        clientName: 'Agus Pramono',
        companyName: 'PT Roastery Kopi Indonesia',
        clientEmail: 'agus@kopinusantara.id',
        clientPhone: '081299334455',
        left: 180,
        top: 440
      },
      {
        code: 'CHEF-02',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'reserved',
        ownerName: 'GreenLeaf Organic Kitchen',
        brandCategory: 'Organic & Healthy Living',
        clientName: 'Linda Wijaya',
        companyName: 'PT Greenleaf Hidroponik Nusantara',
        clientEmail: 'linda@greenleaf.id',
        clientPhone: '081822331100',
        left: 380,
        top: 440
      },

      // Corner Booths (3x3m = 60x60px)
      {
        code: 'KUL-01',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'sold',
        ownerName: 'Dapur Solo Rasa Ibu',
        brandCategory: 'Halal Gourmet & Restaurant',
        clientName: 'Ibu Ratna',
        companyName: 'CV Dapur Solo Sejahtera',
        clientEmail: 'dapursolo@gmail.com',
        clientPhone: '081399882211',
        left: 180,
        top: 220
      },
      {
        code: 'KUL-02',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 500,
        top: 220
      },

      // Standard Booths (3x3m = 60x60px)
      {
        code: 'FOOD-01',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'sold',
        ownerName: 'Matcha Tokyo Premium',
        brandCategory: 'Artisan Coffee & Beverages',
        clientName: 'Kenji Sato',
        companyName: 'PT Matcha Kuliner Jepang',
        clientEmail: 'kenji@matchatokyo.co.id',
        clientPhone: '081977665544',
        left: 260,
        top: 220
      },
      {
        code: 'FOOD-02',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'reserved',
        ownerName: 'EcoPackaging Kraft',
        brandCategory: 'Food Packaging & Kitchen Tech',
        clientName: 'Bambang Sudirman',
        companyName: 'PT Kraft Kemasan Ramah Lingkungan',
        clientEmail: 'sales@ecopack.id',
        clientPhone: '081244556677',
        left: 340,
        top: 220
      },
      {
        code: 'FOOD-03',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 420,
        top: 220
      },
      {
        code: 'FOOD-04',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 260,
        top: 320
      },
      {
        code: 'FOOD-05',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 340,
        top: 320
      }
    ],
    venueItems: [
      {
        id: 'venue_food_stage',
        type: 'stage',
        label: 'LIVE COOKING DEMO & CHEF ARENA',
        category: 'facility',
        widthM: 14,
        heightM: 3,
        left: 400,
        top: 80,
        bg: '#ea580c',
        border: '#c2410c'
      },
      {
        id: 'venue_food_entrance',
        type: 'entrance',
        label: 'MAIN GATE & TICKET REDEEM',
        category: 'facility',
        widthM: 6,
        heightM: 1.5,
        left: 120,
        top: 80,
        bg: '#047857',
        border: '#065f46'
      },
      {
        id: 'venue_food_exit',
        type: 'exit',
        label: 'LOADING DOCK & EMERGENCY EXIT',
        category: 'structure',
        widthM: 5,
        heightM: 1.5,
        left: 800,
        top: 80,
        bg: '#991b1b',
        border: '#7f1d1d'
      },
      {
        id: 'venue_food_seating',
        type: 'cafe',
        label: 'FOOD TASTING & SEATING COURT',
        category: 'facility',
        widthM: 6,
        heightM: 4,
        left: 800,
        top: 260,
        bg: '#d97706',
        border: '#b45309'
      }
    ]
  };

  // Hall B: Healthy Living & Kitchen Tech
  const p2_hallB = {
    id: 'FP-FOOD-002',
    eventId: event2.id,
    eventTitle: event2.title,
    eventVenue: event2.venue,
    title: 'Hall B - Healthy Living & Kitchen Tech',
    venue: 'Jakarta Convention Center (Hall B)',
    startDate: event2.startDate,
    endDate: event2.endDate,
    brandCategories: [
      'Artisan Coffee & Beverages',
      'Halal Gourmet & Restaurant',
      'Organic & Healthy Living',
      'Food Packaging & Kitchen Tech'
    ],
    booths: [
      // Island Booth
      {
        code: 'ORGANIC-01',
        category: 'Island',
        shape: 'rectangle',
        widthM: 6,
        heightM: 6,
        price: 20000000,
        status: 'sold',
        ownerName: 'Nutrifood Indonesia',
        brandCategory: 'Organic & Healthy Living',
        clientName: 'Mardi Wu',
        companyName: 'PT Nutrifood Indonesia',
        clientEmail: 'mardi@nutrifood.co.id',
        clientPhone: '081222339900',
        left: 640,
        top: 220
      },
      // Premium Booths
      {
        code: 'TECH-F01',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'sold',
        ownerName: 'Modena Kitchen Tech',
        brandCategory: 'Food Packaging & Kitchen Tech',
        clientName: 'Bagus Prastowo',
        companyName: 'PT Modena Indonesia',
        clientEmail: 'bagus@modena.com',
        clientPhone: '081333778899',
        left: 180,
        top: 420
      },
      {
        code: 'TECH-F02',
        category: 'Premium',
        shape: 'rectangle',
        widthM: 6,
        heightM: 3,
        price: 12000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 380,
        top: 420
      },
      // Corner Booths
      {
        code: 'HEALTH-01',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'reserved',
        ownerName: 'Re.juve Cold Pressed',
        brandCategory: 'Organic & Healthy Living',
        clientName: 'Richard Anthony',
        companyName: 'PT Sewu Segar Primatama',
        clientEmail: 'richard@rejuve.co.id',
        clientPhone: '081555667788',
        left: 180,
        top: 220
      },
      {
        code: 'HEALTH-02',
        category: 'Corner',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 7500000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 480,
        top: 220
      },
      // Standard Booths
      {
        code: 'NATUR-01',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'sold',
        ownerName: 'Lemonilo Alam Sehat',
        brandCategory: 'Organic & Healthy Living',
        clientName: 'Shinta Nurfauzia',
        companyName: 'PT Lemonilo Indonesia Sehat',
        clientEmail: 'shinta@lemonilo.com',
        clientPhone: '081299882233',
        left: 260,
        top: 220
      },
      {
        code: 'NATUR-02',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 340,
        top: 220
      },
      {
        code: 'NATUR-03',
        category: 'Standard',
        shape: 'rectangle',
        widthM: 3,
        heightM: 3,
        price: 5000000,
        status: 'available',
        ownerName: '',
        brandCategory: '',
        left: 420,
        top: 220
      }
    ],
    venueItems: [
      {
        id: 'venue_food_b_stage',
        type: 'stage',
        label: 'MASTERCLASS WORKSHOP STAGE',
        category: 'facility',
        widthM: 14,
        heightM: 3,
        left: 400,
        top: 80,
        bg: '#16a34a',
        border: '#15803d'
      },
      {
        id: 'venue_food_b_entrance',
        type: 'entrance',
        label: 'EAST WING ENTRANCE',
        category: 'facility',
        widthM: 5,
        heightM: 1.5,
        left: 120,
        top: 80,
        bg: '#047857',
        border: '#065f46'
      },
      {
        id: 'venue_food_b_exit',
        type: 'exit',
        label: 'EMERGENCY EXIT',
        category: 'structure',
        widthM: 4,
        heightM: 1.5,
        left: 800,
        top: 80,
        bg: '#991b1b',
        border: '#7f1d1d'
      },
      {
        id: 'venue_food_b_cafe',
        type: 'cafe',
        label: 'NUTRITION & JUICE BAR',
        category: 'facility',
        widthM: 6,
        heightM: 4,
        left: 800,
        top: 240,
        bg: '#0284c7',
        border: '#0369a1'
      }
    ]
  };

  const projectList = [p1_hallA, p1_hallB, p2_hallA, p2_hallB];

  for (const proj of projectList) {
    console.log(`2. Inserting Event & Floorplan for: ${proj.eventTitle} -> ${proj.title}`);

    // Insert Event (INSERT OR IGNORE to allow multiple halls per event)
    db.prepare(`
      INSERT OR IGNORE INTO events (id, title, venue, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(proj.eventId, proj.eventTitle, proj.eventVenue, proj.startDate, proj.endDate);

    // Pre-insert Floorplan record so child foreign keys (booths, venue_items) succeed
    db.prepare(`
      INSERT INTO floorplans (
        id, event_id, title, canvas_fabric_json, metadata_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, '{}', '{}', 'published', datetime('now'), datetime('now'))
    `).run(proj.id, proj.eventId, proj.title);

    // Insert Brand Categories
    proj.brandCategories.forEach((catName, idx) => {
      db.prepare(`
        INSERT OR IGNORE INTO brand_categories (id, name, is_active, sort_order, project_id)
        VALUES (?, ?, 1, ?, ?)
      `).run(`cat_${proj.id}_${idx + 1}`, catName, idx + 1, proj.id);
    });

    // Build Fabric.js Canvas Objects
    const fabricObjects = [];
    const metaBooths = [];
    const metaVenueElements = [];

    // Add Venue Items
    proj.venueItems.forEach(v => {
      const pixelW = v.widthM * GRID_SCALE;
      const pixelH = v.heightM * GRID_SCALE;

      fabricObjects.push({
        type: 'Group',
        version: '7.4.0',
        originX: 'center',
        originY: 'center',
        left: v.left,
        top: v.top,
        width: pixelW,
        height: pixelH,
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
          gridScale: GRID_SCALE
        },
        objects: [
          {
            type: 'Rect',
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
            type: 'Text',
            text: v.label,
            fontSize: 10,
            fontWeight: 'bold',
            fill: '#ffffff',
            originX: 'center',
            originY: 'center'
          }
        ]
      });

      metaVenueElements.push({
        id: v.id,
        type: v.type,
        category: v.category,
        label: v.label,
        dimensions_meters: { width: v.widthM, height: v.heightM },
        coordinates: { x: v.left, y: v.top, width: pixelW, height: pixelH, rotation: 0 }
      });

      // Insert into SQLite venue_items
      db.prepare(`
        INSERT INTO venue_items (id, floorplan_id, type, category, label, width_m, height_m, coordinates_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        v.id,
        proj.id,
        v.type,
        v.category,
        v.label,
        v.widthM,
        v.heightM,
        JSON.stringify({ x: v.left, y: v.top, width: pixelW, height: pixelH })
      );
    });

    // Add Booths
    proj.booths.forEach((b, idx) => {
      const boothId = `booth_${proj.id}_${b.code.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      const pixelW = b.widthM * GRID_SCALE;
      const pixelH = b.heightM * GRID_SCALE;

      const isSold = b.status === 'sold';
      const isReserved = b.status === 'reserved';
      const catColor = b.category === 'Corner' ? '#06b6d4' : (b.category === 'Premium' ? '#8b5cf6' : (b.category === 'Island' ? '#f59e0b' : '#3b82f6'));

      const statusBg = isSold ? '#f0fdf4' : (isReserved ? '#fffbeb' : '#ecfdf5');
      const statusBorder = isSold ? '#22c55e' : (isReserved ? '#f59e0b' : '#10b981');
      const statusText = isSold ? 'SOLD' : (isReserved ? 'RESERVED' : 'AVAILABLE');
      const statusTextColor = isSold ? '#16a34a' : (isReserved ? '#d97706' : '#10b981');

      // Proportional Typography Calculations
      const scaleFactor = Math.pow(Math.max(0.4, Math.min(pixelW, pixelH) / 60), 0.78);
      const padX = Math.max(3, Math.round(pixelW * 0.06));
      const padY = Math.max(3, Math.round(pixelH * 0.06));

      const dimStr = `${b.widthM}x${b.heightM}m`;
      const baseDimSize = Math.max(6, Math.round(8.5 * scaleFactor));
      const maxDimW = Math.max(8, (pixelW * 0.42) - padX);
      const dimFontSize = Math.min(baseDimSize, Math.max(4.5, maxDimW / (dimStr.length * 0.62)));

      const baseCodeSize = Math.max(7, Math.round(11 * scaleFactor));
      const maxCodeW = Math.max(10, (pixelW * 0.54) - padX);
      const codeFontSize = Math.min(baseCodeSize, Math.max(5, maxCodeW / (b.code.length * 0.65)));

      const baseStatusSize = Math.max(6, Math.round(8.5 * scaleFactor));
      const maxStatusW = Math.max(10, pixelW - (padX * 2) - 4);
      const statusFontSize = Math.min(baseStatusSize, Math.max(4.5, maxStatusW / (statusText.length * 0.62)));

      const baseOwnerSize = Math.max(7, Math.round(10.5 * scaleFactor));
      const maxOwnerW = Math.max(10, pixelW - (padX * 2) - 4);
      const topClearance = Math.max(dimFontSize, codeFontSize) + Math.max(2, Math.round(pixelH * 0.04)) + 3;
      const bottomClearance = statusFontSize + 3;
      const maxOwnerH = Math.max(6, pixelH - (padY * 2) - topClearance - bottomClearance);

      const rawOwner = String(b.ownerName || '').trim();
      let finalOwnerText = rawOwner || (b.status === 'available' ? '' : '(Booking)');
      let ownerFontSize = baseOwnerSize;
      let isMultiLine = false;

      if (rawOwner) {
        const words = rawOwner.split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
          let minSplit = 1;
          if ((words[0].toUpperCase() === 'PT' || words[0].toUpperCase() === 'CV') && words.length > 2) {
            minSplit = 2;
          }
          let bestSplit = minSplit;
          let bestDiff = Infinity;
          for (let i = minSplit; i < words.length; i++) {
            const l1 = words.slice(0, i).join(' ');
            const l2 = words.slice(i).join(' ');
            const diff = Math.abs(l1.length - l2.length);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestSplit = i;
            }
          }
          const line1 = words.slice(0, bestSplit).join(' ');
          const line2 = words.slice(bestSplit).join(' ');
          const longestLine = Math.max(line1.length, line2.length);
          const singleEstW = rawOwner.length * baseOwnerSize * 0.62;
          const wrappedEstW = longestLine * baseOwnerSize * 0.62;
          if (singleEstW > maxOwnerW || (pixelW >= 50 && pixelH >= 45 && words.length > 2) || wrappedEstW < singleEstW * 0.75) {
            finalOwnerText = `${line1}\n${line2}`;
            isMultiLine = true;
            ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (longestLine * 0.62));
          } else {
            ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (rawOwner.length * 0.62));
          }
        } else {
          ownerFontSize = Math.min(baseOwnerSize, maxOwnerW / (rawOwner.length * 0.62));
        }

        const linesCount = isMultiLine ? 2 : 1;
        const totalLineHeightUnits = linesCount * 1.15;
        if (ownerFontSize * totalLineHeightUnits > maxOwnerH) {
          ownerFontSize = Math.min(ownerFontSize, maxOwnerH / totalLineHeightUnits);
        }
        ownerFontSize = Math.max(4, ownerFontSize);
      }

      fabricObjects.push({
        type: 'Group',
        version: '7.4.0',
        originX: 'left',
        originY: 'top',
        left: b.left,
        top: b.top,
        width: pixelW,
        height: pixelH,
        isBooth: true,
        boothData: {
          id: boothId,
          code: b.code,
          category: b.category,
          status: b.status,
          price: b.price,
          ownerName: b.ownerName || '',
          brandCategory: b.brandCategory || '',
          widthM: b.widthM,
          heightM: b.heightM,
          facilities: ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL']
        },
        objects: [
          {
            type: 'Rect',
            width: pixelW,
            height: pixelH,
            fill: statusBg,
            stroke: statusBorder,
            strokeWidth: 2,
            strokeUniform: true,
            rx: 4,
            ry: 4,
            originX: 'center',
            originY: 'center'
          },
          {
            type: 'Rect',
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
            type: 'Text',
            text: dimStr,
            fontSize: dimFontSize,
            fill: '#475569',
            left: -(pixelW / 2) + padX,
            top: -(pixelH / 2) + padY + Math.max(2, Math.round(pixelH * 0.04)),
            originX: 'left',
            originY: 'top'
          },
          {
            type: 'Text',
            text: b.code,
            fontSize: codeFontSize,
            fontWeight: 'bold',
            fill: '#0f172a',
            left: (pixelW / 2) - padX,
            top: -(pixelH / 2) + padY + Math.max(2, Math.round(pixelH * 0.04)),
            originX: 'right',
            originY: 'top'
          },
          {
            type: 'Text',
            text: finalOwnerText,
            fontSize: ownerFontSize,
            fontWeight: b.ownerName ? 'bold' : 'normal',
            fontStyle: b.ownerName ? 'normal' : 'italic',
            textAlign: 'center',
            lineHeight: 1.05,
            fill: isSold ? '#15803d' : (isReserved ? '#b45309' : '#94a3b8'),
            left: 0,
            top: isMultiLine ? 0 : 1,
            originX: 'center',
            originY: 'center'
          },
          {
            type: 'Text',
            text: statusText,
            fontSize: statusFontSize,
            fontWeight: 'bold',
            fill: statusTextColor,
            left: 0,
            top: (pixelH / 2) - padY,
            originX: 'center',
            originY: 'bottom'
          }
        ]
      });

      metaBooths.push({
        id: boothId,
        booth_number: b.code,
        category: b.category,
        brand_category: b.brandCategory || '',
        shape: b.shape,
        price: b.price,
        status: b.status,
        owner_name: b.ownerName || '',
        dimensions_meters: { width: b.widthM, height: b.heightM },
        coordinates: { x: b.left, y: b.top, width: pixelW, height: pixelH, rotation: 0 },
        facilities: ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL']
      });

      // Insert into SQLite booths
      db.prepare(`
        INSERT INTO booths (
          id, floorplan_id, code, category, price, status, owner_name, brand_category,
          width_m, height_m, shape, facilities_json, coordinates_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        boothId,
        proj.id,
        b.code,
        b.category,
        b.price,
        b.status,
        b.ownerName || '',
        b.brandCategory || '',
        b.widthM,
        b.heightM,
        b.shape,
        JSON.stringify(['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL']),
        JSON.stringify({ x: b.left, y: b.top, width: pixelW, height: pixelH })
      );

      // Create Orders and Invoices for SOLD and RESERVED booths
      if (isSold || isReserved) {
        const orderId = `ORD-${proj.id}-${b.code}`;
        const invoiceId = `INV-${proj.id}-${b.code}`;
        const prefix = proj.eventId.includes('TECH') ? 'TECH' : 'FOOD';
        const invNum = `INV/${prefix}-${proj.id.replace(/[^A-Za-z0-9]/g, '')}-${b.code}`;
        const paymentStatus = isSold ? 'PAID' : 'UNPAID';
        const paymentMethod = isSold ? 'Transfer Bank (BCA)' : 'Transfer Bank Virtual Account';

        const issueDate = '2026-09-10';
        const dueDate = isSold ? '2026-09-12' : '2026-09-25';

        const items = [
          {
            id: `item-${idx + 1}`,
            description: `Sewa Booth Pameran ${b.code} (${b.category} ${b.widthM}x${b.heightM}m) - ${b.brandCategory || 'Tenant'} [${proj.title}]`,
            boothCode: b.code,
            dimensions: `${b.widthM}x${b.heightM}m`,
            facilities: ['Karpet Standar', 'Listrik 2A', '1 Meja', '2 Kursi', 'Lampu TL'],
            qty: 1,
            unitPrice: b.price,
            amount: b.price
          }
        ];

        // Insert Order
        db.prepare(`
          INSERT INTO orders (
            id, floorplan_id, booth_id, booth_code, company_name, pic_name, email, phone,
            total_amount, payment_method, payment_status, invoice_number, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          orderId,
          proj.id,
          boothId,
          b.code,
          b.companyName || b.ownerName,
          b.clientName || b.ownerName,
          b.clientEmail || 'tenant@expo.com',
          b.clientPhone || '081234567890',
          b.price,
          paymentMethod,
          paymentStatus,
          invNum
        );

        // Insert Invoice
        db.prepare(`
          INSERT INTO invoices (
            id, invoice_number, floorplan_id, booth_id, booth_code,
            event_id, event_title, event_venue, client_name, company_name, client_email,
            client_phone, issue_date, due_date, items_json, subtotal, discount_type,
            discount_value, discount_amount, discount_reason, tax_rate, tax_amount,
            total_amount, payment_status, payment_method, bank_details_json, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nominal', 0, 0, '', 0, 0, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          invoiceId,
          invNum,
          proj.id,
          boothId,
          b.code,
          proj.eventId,
          proj.eventTitle,
          proj.venue,
          b.clientName || b.ownerName,
          b.companyName || b.ownerName,
          b.clientEmail || 'finance@tenant.com',
          b.clientPhone || '081234567890',
          issueDate,
          dueDate,
          JSON.stringify(items),
          b.price,
          b.price,
          paymentStatus,
          paymentMethod,
          JSON.stringify({
            bankName: 'Bank Central Asia (BCA)',
            accountNumber: '882-019-3321',
            accountName: 'PT EXPO KARYA INDONESIA'
          }),
          isSold ? 'Pembayaran lunas via transfer bank. Terima kasih atas partisipasi Anda.' : 'Silakan lakukan transfer sebelum batas jatuh tempo.'
        );
      }
    });

    // Construct Fabric Canvas JSON
    const canvasFabricJson = {
      version: '7.4.0',
      objects: fabricObjects
    };

    const metadataJson = {
      schema_version: '1.0',
      event: {
        id: proj.eventId,
        title: proj.eventTitle,
        venue: proj.venue,
        hall_title: proj.title,
        created_at: new Date().toISOString()
      },
      floorplan: {
        scale: '20px = 1m',
        grid_size_px: GRID_SCALE,
        total_booths: proj.booths.length,
        total_venue_elements: proj.venueItems.length,
        summary: {
          available: proj.booths.filter(b => b.status === 'available').length,
          reserved: proj.booths.filter(b => b.status === 'reserved').length,
          sold: proj.booths.filter(b => b.status === 'sold').length,
          total_potential_revenue: proj.booths.reduce((acc, b) => acc + b.price, 0)
        }
      },
      booths: metaBooths,
      venue_elements: metaVenueElements
    };

    // Update Floorplan with final canvas JSON and metadata
    db.prepare(`
      UPDATE floorplans
      SET canvas_fabric_json = ?, metadata_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      JSON.stringify(canvasFabricJson),
      JSON.stringify(metadataJson),
      proj.id
    );
  }
});

// Run seeding transaction
seed();

// Run universal payment sync
console.log('3. Running universal syncPaymentStatusFromInvoices()...');
syncPaymentStatusFromInvoices();

console.log('--- DATABASE RESET & SEEDING COMPLETED SUCCESSFULLY! ---');
