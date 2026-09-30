const fetch = require('node-fetch');
async function run() {
  const res = await fetch('http://localhost:5001/api/floorplan/save', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      id: 'FP-TEST',
      eventId: 'EVT-2026-001',
      title: 'Test',
      fabricJson: { version: '6.0.0', objects: [] },
      metadata: { booths: [] },
      status: 'draft',
      booths: [{ id: 'booth_1', code: 'A-99', category: 'Standard', status: 'available', price: 5000 }]
    })
  });
  console.log(await res.json());
}
run();
