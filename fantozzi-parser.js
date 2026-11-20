function parseMenu($) {
  const result = {
    datum: '',
    sekcie: []
  };

  // Datum z textu "Denné menu do 14:00: Utorok 28.04.2026"
  const datumText = $('#daily-menu b').first().text();
  const datumMatch = datumText.match(/(Pondelok|Utorok|Streda|Štvrtok|Piatok|Sobota|Nedeľa)\s+\d{1,2}\.\d{2}\.\d{4}/i);
  if (datumMatch) {
    result.datum = datumMatch[0].trim();
  } else {
    // Fallback: dnesny datum
    result.datum = '';
  }

  // Parsujeme sekcie: h4 + nasledujuci ol.daily-menu-list
  $('#daily-menu h4').each((i, h4el) => {
    const $h4 = $(h4el);

    // Nazov sekcie - odstraname text price-tag
    const $h4clone = $h4.clone();
    $h4clone.find('.price-tag').remove();
    const nazov = $h4clone.text().trim();

    // Cena z .price-tag
    const cenaText = $h4.find('.price-tag').text().trim();
    const cena = cenaText || null;

    // Polozky z nasledujuceho ol
    const $ol = $h4.next('ol.daily-menu-list');
    const polozky = [];

    $ol.find('li').each((j, li) => {
      const $li = $(li);

      // Hmotnost z .daily-menu-weight
      const hmotnost = $li.find('.daily-menu-weight').text().trim();

      // Nazov polozky - odstraname span s hmotnostou
      const $liclone = $li.clone();
      $liclone.find('.daily-menu-weight').remove();
      const nazovPolozky = $liclone.text().trim();

      if (nazovPolozky) {
        // Cislo polozky - bud z atributu ol[start] alebo pocitame
        const olStart = parseInt($ol.attr('start') || '1', 10);
        const cislo = olStart + j;

        polozky.push({
          cislo,
          nazov: nazovPolozky,
          hmotnost
        });
      }
    });

    // Pridame sekciu iba ak ma polozky
    if (polozky.length > 0) {
      result.sekcie.push({ nazov, cena, polozky });
    }
  });

  return result;
}

module.exports = { parseMenu };
