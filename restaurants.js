// Schválené zdroje; URL od klienta nikdy nepoužívame na serverový request.
const restaurants = [
  { id: 'fantozzi', name: 'Fantozzi', url: 'https://www.fantozzi.sk/dennemenu', phones: ['0952 331 262', '02 / 45 245 014', '0903 102 591'], address: 'Ipeľská 4, Bratislava' },
  { id: 'lupo', name: 'Jedáleň LUPO', url: 'https://jedalenlupo.sk/', phones: ['0918 728 335'], address: '' },
  { id: 'nevadzka', name: 'Jedáleň Nevädzka', url: 'https://www.menucka.sk/denne-menu/bratislava/jedalen-nevaedzka', phones: ['0905 540 635', '0903 923 453'], address: 'Nevädzová 5, Bratislava' }
];
function getRestaurant(id) {
  const restaurant = restaurants.find(r => r.id === id);
  if (!restaurant) throw new Error('Neznáma jedáleň');
  return restaurant;
}
function todaySK(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
module.exports = { restaurants, getRestaurant, todaySK };
