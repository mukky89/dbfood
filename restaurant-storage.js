// Nízkoobjemové nastavenie a archív môžu použiť existujúce kolekcie bez vytvárania nových WT tabuliek.
function createRestaurantSettingsStore(primary, appearance) {
  async function findOne() {
    const direct = await primary.findOne({ key: 'restaurant' });
    if (direct) return { ...direct, _storage: 'primary' };
    const doc = await appearance.findOne({});
    return doc?.restaurantSelection ? { ...doc.restaurantSelection, _id: doc._id, key: 'restaurant', _storage: 'appearance' } : null;
  }
  async function create(value) {
    if (await findOne()) throw new Error('Nastavenie jedálne už existuje');
    const doc = await appearance.findOne({});
    if (!doc) throw new Error('Existujúci dokument nastavení sa nenašiel');
    const result = await appearance.updateOne({ _id: doc._id, restaurantSelection: null }, { $set: { restaurantSelection: { restaurantId: value.restaurantId, revision: value.revision || 0 } } });
    if (result.matchedCount !== 1) throw new Error('Nastavenie sa súbežne zmenilo');
  }
  async function updateOne(filter, update) {
    if (filter._storage === 'primary') {
      const { _storage, ...query } = filter;
      return primary.updateOne(query, update);
    }
    const query = { _id: filter._id, 'restaurantSelection.revision': filter.revision };
    const mapped = {};
    for (const op of ['$set', '$inc']) if (update[op]) mapped[op] = Object.fromEntries(Object.entries(update[op]).map(([key, value]) => ['restaurantSelection.' + key, value]));
    return appearance.updateOne(query, mapped);
  }
  async function findOneAndUpdate(_, update) {
    const doc = await findOne();
    if (!doc) await create({ ...update.$set, revision: update.$inc?.revision || 0 });
    else {
      const result = await updateOne({ _id: doc._id, _storage: doc._storage, revision: doc.revision ?? { $exists: false } }, update);
      if (result.matchedCount !== 1) throw new Error('Nastavenie sa súbežne zmenilo');
    }
    return findOne();
  }
  return { findOne, create, updateOne, findOneAndUpdate };
}

function createEmbeddedArchiveStore(dailyCollection) {
  return {
    async findById(task) {
      const doc = await dailyCollection.findOne({ 'restaurantArchives._id': task }, { projection: { restaurantArchives: { $elemMatch: { _id: task } } } });
      return doc?.restaurantArchives?.find(a => a._id === task) || null;
    },
    async create(snapshot) {
      const result = await dailyCollection.updateOne({ _id: snapshot.daily._id, 'restaurantArchives._id': { $ne: snapshot._id } }, { $push: { restaurantArchives: snapshot } });
      if (result.matchedCount !== 1) throw new Error('Archív sa nepodarilo uložiť do denného dokumentu');
    },
    async updateOne(filter, update) {
      return dailyCollection.updateOne({ 'restaurantArchives._id': filter._id }, { $set: Object.fromEntries(Object.entries(update.$set).map(([key, value]) => ['restaurantArchives.$.' + key, value])) });
    }
  };
}
module.exports = { createRestaurantSettingsStore, createEmbeddedArchiveStore };
