(function(root) {
  // Iba čísla skutočne uvedené v zátvorkách pri hmotnosti; žiadne odhadovanie.
  function parse(raw) {
    const text = String(raw || '').trim();
    const match = text.match(/\(([0-9,.;\s]+)\)/);
    if (!match) return { hmotnostText:text, numbers:[] };
    const numbers = [...new Set(match[1].split(/[,.;\s]+/).filter(Boolean).map(Number)
      .filter(n=>Number.isInteger(n) && n>=1 && n<=14))];
    if (!numbers.length) return { hmotnostText:text, numbers:[] };
    return { hmotnostText:(text.slice(0,match.index)+text.slice(match.index+match[0].length)).trim().replace(/,$/,'').trim(), numbers };
  }
  const api = { parse };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SourceAllergens = api;
})(typeof window === 'undefined' ? globalThis : window);
