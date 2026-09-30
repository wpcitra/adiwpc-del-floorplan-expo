// Indonesian Number to Words Converter for Invoices (Terbilang Rupiah)

export function terbilang(angka) {
  const bilangan = [
    '',
    'Satu',
    'Dua',
    'Tiga',
    'Empat',
    'Lima',
    'Enam',
    'Tujuh',
    'Delapan',
    'Sembilan',
    'Sepuluh',
    'Sebelas'
  ];

  const num = Math.floor(Math.abs(Number(angka))) || 0;

  if (num === 0) return 'Nol Rupiah';

  function konversi(n) {
    let hasil = '';
    if (n < 12) {
      hasil = bilangan[n];
    } else if (n < 20) {
      hasil = konversi(n - 10) + ' Belas';
    } else if (n < 100) {
      hasil = konversi(Math.floor(n / 10)) + ' Puluh ' + konversi(n % 10);
    } else if (n < 200) {
      hasil = 'Seratus ' + konversi(n - 100);
    } else if (n < 1000) {
      hasil = konversi(Math.floor(n / 100)) + ' Ratus ' + konversi(n % 100);
    } else if (n < 2000) {
      hasil = 'Seribu ' + konversi(n - 1000);
    } else if (n < 1000000) {
      hasil = konversi(Math.floor(n / 1000)) + ' Ribu ' + konversi(n % 1000);
    } else if (n < 1000000000) {
      hasil = konversi(Math.floor(n / 1000000)) + ' Juta ' + konversi(n % 1000000);
    } else if (n < 1000000000000) {
      hasil = konversi(Math.floor(n / 1000000000)) + ' Miliar ' + konversi(n % 1000000000);
    } else {
      hasil = konversi(Math.floor(n / 1000000000000)) + ' Triliun ' + konversi(n % 1000000000000);
    }
    return hasil.replace(/\s+/g, ' ').trim();
  }

  return `${konversi(num)} Rupiah`;
}
