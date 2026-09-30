// Light check for names that should match (bank account holder vs company name): very similar but not equal
// usually means a typo ("PT Wahyu Promi Citra" vs "PT Wahyu Promo Citra"). Never changes anything, only warns.
const norm = (s) => String(s || '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

export function looksLikeTypo(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y || x === y) return false;
  return editDistance(x, y) <= Math.max(2, Math.floor(Math.max(x.length, y.length) * 0.12));
}
