(function(root) {
  const LUPO_PREPARATION_FEE = 0.50;
  const LUPO_PRICING_NOTE = 'Cena menu zahŕňa polievku a prílohu. Poplatok za prípravu a expedíciu 0,50 € za obed je započítaný do celkovej ceny aj QR platby. Doprava je pri aspoň 2 obedoch na jednu adresu zdarma; prípadná samostatná doprava 1 € nie je zahrnutá.';
  const portions = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 20 ? Number(value) : 1;
  function price(value, type, menu) {
    const section = menu?.sekcie?.find(s => s.nazov.toLowerCase().includes(type));
    const token = String(value || '').match(/^(?:PZ|[PJD]|č\.)(\d+)\b/);
    const item = token && section?.polozky.find(p => p.cislo === Number(token[1]));
    return typeof item?.cena === 'number' && Number.isFinite(item.cena) ? item.cena : null;
  }
  function calculate(polievka, jedlo, pizza, dezert, menu, porcie = 1) {
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
      const fee = menu.pricing.preparationFee ?? (menu.restaurant?.id === 'lupo' ? LUPO_PREPARATION_FEE : 0);
      if (typeof fee === 'number' && Number.isFinite(fee) && fee > 0) {
        celkom += fee; detail.push(`Príprava a expedícia: ${fee.toFixed(2)} €`);
      }
    } else if (polievka) {
      if (typeof menu.pricing.soup !== 'number') return null;
      celkom += menu.pricing.soup; detail.push(`Polievka: ${menu.pricing.soup.toFixed(2)} €`);
    }
    if (dezert) {
      const cena = price(dezert, 'dezert', menu); if (cena === null) return null;
      celkom += cena; detail.push(`Dezert: ${cena.toFixed(2)} €`);
    }
    const count = portions(porcie);
    if (count > 1) detail.push(`${count} porcie × ${celkom.toFixed(2)} €`);
    return celkom > 0 ? { celkom: Math.round(celkom * count * 100) / 100, detail } : null;
  }
  const api = { calculate, portions, LUPO_PREPARATION_FEE, LUPO_PRICING_NOTE };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MenuPricing = api;
})(typeof window === 'undefined' ? globalThis : window);
