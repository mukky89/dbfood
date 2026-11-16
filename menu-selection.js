function validSelection(value, type, prefix, menu) {
  if (!value) return true;
  const token = String(value).match(new RegExp('^' + prefix + '(\\d+)\\s+'));
  const items = menu.sekcie.find(s => s.nazov.toLowerCase().includes(type))?.polozky || [];
  const item = token && items.find(p => p.cislo === Number(token[1]));
  if (!item) return false;
  let name = item.nazov, variants = [];
  const match = name.match(/\(([^)]+)\)\s*$/);
  if (match) {
    const parts = match[1].split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2 && !parts.every(p => /^\d+$/.test(p))) { name = name.slice(0, match.index).trim(); variants = parts; }
  }
  const allowedSides = item.sideOptions?.length ? item.sideOptions.map(s => ' — príloha: ' + s) : [''];
  const allowedVariants = variants.length ? variants.map(v => ' — ' + v) : [''];
  return allowedSides.some(side => allowedVariants.some(variant => value === `${prefix}${item.cislo} ${name}${side}${variant}`));
}
module.exports = { validSelection };
