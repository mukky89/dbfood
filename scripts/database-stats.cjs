async function databaseStats(db) {
  const total = await db.command({ dbStats: 1, scale: 1 });
  const collections = [];
  for (const collection of await db.listCollections({}, { nameOnly: true }).toArray()) {
    const stats = await db.command({ collStats: collection.name, scale: 1 });
    collections.push({ name: collection.name, count: stats.count, dataSize: stats.size, storageSize: stats.storageSize, indexSize: stats.totalIndexSize });
  }
  return { dataSize: total.dataSize, storageSize: total.storageSize, indexSize: total.indexSize,
    filesystemUsed: total.fsUsedSize, filesystemTotal: total.fsTotalSize,
    collections: collections.sort((a,b) => b.storageSize - a.storageSize) };
}
module.exports = { databaseStats };
