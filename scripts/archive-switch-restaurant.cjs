const { getRestaurant, todaySK } = require('../restaurants');

// Jednorazová, explicitne zapnutá údržba. Úplný snapshot sa uloží pred zmenou objednávok.
async function archiveAndSwitch({ Daily, Settings, Archive, target, task, expectedCount, date, now = new Date(), log = console.log }) {
  getRestaurant(target);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(task || '')) throw new Error('Neplatný identifikátor údržby');
  if (date !== todaySK(now)) throw new Error('Údržba je povolená iba pre zadaný dnešný dátum');
  if (!Number.isInteger(expectedCount) || expectedCount < 0) throw new Error('Chýba očakávaný počet objednávok');
  const previous = await Archive.findById(task);
  if (previous?.status === 'complete') { log('RESTAURANT_MAINTENANCE ' + JSON.stringify({ task, status: 'already-complete' })); return previous; }
  const settings = await Settings.findOne({ key: 'restaurant' });
  const currentId = settings?.restaurantId || 'fantozzi';
  if (!previous && currentId === target) { log('RESTAURANT_MAINTENANCE ' + JSON.stringify({ task, status: 'already-selected', target })); return null; }
  const daily = await Daily.findOne({ datum: now.toDateString() });
  if (!daily) throw new Error('Dnešný záznam objednávok sa nenašiel');
  const snapshot = previous || { _id: task, status: 'pending', date, target, archivedAt: now.toISOString(),
    originalRestaurant: currentId, originalSettings: settings?.toObject ? settings.toObject() : settings,
    daily: daily.toObject ? daily.toObject() : daily, count: Object.keys(daily.orders || {}).length };
  if (snapshot.target !== target || snapshot.date !== date || snapshot.count !== expectedCount) throw new Error('Parametre sa nezhodujú s archívom');
  const count = Object.keys(daily.orders || {}).length;
  if (!previous && count !== expectedCount) throw new Error('Počet objednávok sa zmenil; údržba sa zastavila');
  if (currentId !== snapshot.originalRestaurant && currentId !== target) throw new Error('Aktívnu jedáleň zmenil iný správca');
  if (!previous) await Archive.create(snapshot);

  // Compare-and-set: ak sa objednávky alebo história od snapshotu zmenili, nič sa nevymaže.
  if (count) {
    const updated = await Daily.updateOne({ _id: daily._id, orders: snapshot.daily.orders, history: snapshot.daily.history }, { $set: { orders: {}, history: [] } });
    if (updated.matchedCount !== 1) throw new Error('Objednávky sa zmenili počas archivácie; zmena sa zastavila');
  } else if (!previous && expectedCount !== 0) throw new Error('Dnešné objednávky už zmenil iný správca');

  try {
    if (currentId !== target) {
      if (snapshot.originalSettings) {
        const revision = snapshot.originalSettings.revision === undefined ? { $exists: false } : snapshot.originalSettings.revision;
        const updated = await Settings.updateOne({ _id: snapshot.originalSettings._id, revision }, { $set: { restaurantId: target }, $inc: { revision: 1 } });
        if (updated.matchedCount !== 1) throw new Error('Nastavenie jedálne sa počas údržby zmenilo');
      } else await Settings.create({ key: 'restaurant', restaurantId: target, revision: 1 });
    }
  } catch (error) {
    const latest = await Settings.findOne({ key: 'restaurant' });
    if (latest?.restaurantId !== target) {
      await Daily.updateOne({ _id: daily._id, orders: {}, history: [] }, { $set: { orders: snapshot.daily.orders, history: snapshot.daily.history } });
      throw error;
    }
  }
  await Archive.updateOne({ _id: task }, { $set: { status: 'complete', completedAt: new Date().toISOString() } });
  log('RESTAURANT_MAINTENANCE ' + JSON.stringify({ task, status: 'complete', archivedCount: snapshot.count, previousRestaurant: snapshot.originalRestaurant, target, date }));
  return snapshot;
}

async function main() {
  const config = require('../config');
  if (!config.maintenanceRestaurantTarget) return;
  const mongoose = require('mongoose');
  try {
    const now = new Date();
    const [hh, mm] = config.orderDeadline.split(':').map(Number);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bratislava', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    if (time < `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`) throw new Error('Údržba nie je povolená pred uzávierkou');
    await mongoose.connect(config.mongoUri);
    const Daily = mongoose.model('DenneObjednavky', new mongoose.Schema({ datum: String, orders: mongoose.Schema.Types.Mixed, history: Array }, { strict: false }));
    const Settings = mongoose.model('RestaurantSettings', new mongoose.Schema({ key: {type:String,unique:true}, restaurantId: String, revision: Number }));
    const Archive = mongoose.model('RestaurantSwitchArchive', new mongoose.Schema({ _id: String, status: String, date: String, target: String, count: Number, daily: mongoose.Schema.Types.Mixed, originalSettings: mongoose.Schema.Types.Mixed, originalRestaurant: String, archivedAt: String, completedAt: String }));
    await Settings.init();
    await archiveAndSwitch({ Daily, Settings, Archive, target: config.maintenanceRestaurantTarget, task: config.maintenanceRestaurantTask,
      expectedCount: config.maintenanceRestaurantCount, date: config.maintenanceRestaurantDate, now });
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch(error => { console.error('RESTAURANT_MAINTENANCE_FAILED ' + error.message); process.exitCode = 1; });
module.exports = { archiveAndSwitch };
