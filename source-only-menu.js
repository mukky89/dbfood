const { parse } = require('./public/source-allergens');
function sourceOnlyMenu(menu) {
  if (!menu) return menu;
  const copy = structuredClone(menu);
  delete copy.allergenReview;
  for (const section of copy.sekcie || []) for (const item of section.polozky || []) {
    for (const key of Object.keys(item)) if (key.startsWith('aiAllergen')) delete item[key];
    item.allergens = parse(item.hmotnost).numbers;
  }
  return copy;
}
module.exports = { sourceOnlyMenu };
