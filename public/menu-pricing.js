(function(root) {
  function price(value, type, menu) {
    const section = menu?.sekcie?.find(s => s.nazov.toLowerCase().includes(type));
    const token = String(value || '').match(/^(?:PZ|[PJD]|č\.)(\d+)\b/);
    const item = token && section?.polozky.find(p => p.cislo === Number(token[1]));
    return typeof item?.cena === 'number' && Number.isFinite(item.cena) ? item.cena : null;
  }
  function calculate(polievka, jedlo, pizza, dezert, menu) {
    if (!menu?.pricing) return menu?.restaurant && menu.restaurant.id !== 'fantozzi' ? null : undefined;
    let celkom = 0; const detail = [];
    const main = jedlo || pizza;
    if (main) {
      let cena = price(main, pizza ? 'pizza' : 'hlavné', menu);
      if (cena === null) return null;
      if (polievka && !menu.pricing.soupIncluded) {
        if (typeof menu.pricing.soupWithMain !== 'number') return null;
        cena += menu.pricing.soupWithMain;
      }
      if (!polievka && menu.pricing.soupIncluded) {
        if (typeof menu.pricing.withoutSoupDiscount !== 'number') return null;
        cena -= menu.pricing.withoutSoupDiscount;
      }
      celkom += cena; detail.push(`Hlavné jedlo${polievka ? ' + polievka' : ''}: ${cena.toFixed(2)} €`);
    } else if (polievka) {
      if (typeof menu.pricing.soup !== 'number') return null;
      celkom += menu.pricing.soup; detail.push(`Polievka: ${menu.pricing.soup.toFixed(2)} €`);
    }
    if (dezert) {
      const cena = price(dezert, 'dezert', menu); if (cena === null) return null;
      celkom += cena; detail.push(`Dezert: ${cena.toFixed(2)} €`);
    }
    return celkom > 0 ? { celkom: Math.round(celkom * 100) / 100, detail } : null;
  }
  if (typeof module !== 'undefined') module.exports = { calculate };
  else root.MenuPricing = { calculate };
})(typeof window === 'undefined' ? globalThis : window);
