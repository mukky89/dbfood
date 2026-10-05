'use strict';

// The preview and tests share the production contract without touching MongoDB.
const compare = (a, b) => b.score - a.score || b.delivered - a.delivered || a.playerId.localeCompare(b.playerId);
const isBetter = (a, b) => !b || a.score > b.score || (a.score === b.score && a.delivered > b.delivered);
const publicEntry = (row, rank, playerId) => ({ rank, name: row.name, score: row.score, delivered: row.delivered, isMe: row.playerId === playerId });

class MemoryColonyStore {
  constructor() { this.runs = new Map(); this.results = new Map(); }
  ready() { return true; }
  async createRun(run) { this.runs.set(run.id, structuredClone(run)); }
  async getRun(id) { return this.runs.get(id); }
  async claimRun(id, playerId, now) {
    const run = this.runs.get(id);
    if (!run || run.playerId !== playerId || run.expiresAt <= now || run.status === 'complete' ||
        (run.status === 'processing' && now - run.claimedAt < 30000)) return null;
    run.status = 'processing'; run.claimedAt = now;
    return structuredClone(run);
  }
  async releaseRun(id) { const run = this.runs.get(id); if (run?.status === 'processing') run.status = 'active'; }
  async completeRun(id) { const run = this.runs.get(id); if (run) run.status = 'complete'; }
  async saveBest(run, result, now) {
    const key = `${run.day}:${run.playerId}`, previous = this.results.get(key);
    const improved = isBetter(result, previous);
    if (improved) this.results.set(key, { playerId: run.playerId, day: run.day, name: run.name, score: result.score, delivered: result.delivered, achievedAt: now });
    else previous.name = run.name;
    return { personalBest: this.results.get(key).score, improved };
  }
  async leaderboard(startDay, day, playerId) {
    const players = new Map();
    for (const row of [...this.results.values()].sort((a, b) => a.day.localeCompare(b.day))) {
      if (row.day < startDay || row.day > day) continue;
      const player = players.get(row.playerId) || { playerId: row.playerId, name: row.name, score: 0, delivered: 0 };
      player.name = row.name; player.score += row.score; player.delivered += row.delivered;
      players.set(row.playerId, player);
    }
    const ordered = [...players.values()].sort(compare);
    const ownIndex = ordered.findIndex(row => row.playerId === playerId);
    return { entries: ordered.slice(0, 20).map((row, i) => publicEntry(row, i + 1, playerId)),
      me: ownIndex < 0 ? null : publicEntry(ordered[ownIndex], ownIndex + 1, playerId) };
  }
  async prune(now) { for (const [id, run] of this.runs) if (run.expiresAt <= now) this.runs.delete(id); }
}

function createMongoColonyStore(mongoose) {
  const runSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true }, playerId: { type: String, required: true },
    name: String, day: String, seed: Number, version: Number, startedAt: Number, expiresAt: Number,
    expires: { type: Date, expires: 0 }, status: { type: String, default: 'active' }, claimedAt: Number
  }, { bufferCommands: false });
  const bestSchema = new mongoose.Schema({
    playerId: String, day: String, name: String, score: Number, delivered: Number, achievedAt: Number
  }, { bufferCommands: false });
  bestSchema.index({ playerId: 1, day: 1 }, { unique: true });
  bestSchema.index({ day: 1 });
  const Run = mongoose.models.ColonyRun || mongoose.model('ColonyRun', runSchema);
  const Best = mongoose.models.ColonyDailyBest || mongoose.model('ColonyDailyBest', bestSchema);
  const group = { $group: { _id: '$playerId', playerId: { $first: '$playerId' }, name: { $last: '$name' }, score: { $sum: '$score' }, delivered: { $sum: '$delivered' } } };
  return {
    ready: () => mongoose.connection.readyState === 1,
    async createRun(run) { await Run.create({ ...run, expires: new Date(run.expiresAt) }); },
    async getRun(id) { return Run.findOne({ id }).lean(); },
    async claimRun(id, playerId, now) {
      return Run.findOneAndUpdate({ id, playerId, expiresAt: { $gt: now },
        $or: [{ status: 'active' }, { status: 'processing', claimedAt: { $lte: now - 30000 } }] },
      { $set: { status: 'processing', claimedAt: now } }, { new: true }).lean();
    },
    async releaseRun(id) { await Run.updateOne({ id, status: 'processing' }, { $set: { status: 'active' } }); },
    async completeRun(id) { await Run.updateOne({ id }, { $set: { status: 'complete' } }); },
    async saveBest(run, result, now) {
      // A conditional pipeline keeps concurrent finishes from replacing a better result.
      const better = { $or: [{ $gt: [result.score, { $ifNull: ['$score', -1] }] },
        { $and: [{ $eq: [result.score, '$score'] }, { $gt: [result.delivered, '$delivered'] }] }] };
      const update = [{ $set: { playerId: { $literal: run.playerId }, day: { $literal: run.day }, name: { $literal: run.name },
        score: { $cond: [better, result.score, '$score'] }, delivered: { $cond: [better, result.delivered, '$delivered'] },
        achievedAt: { $cond: [better, now, '$achievedAt'] } } }];
      let previous;
      try { previous = await Best.findOneAndUpdate({ playerId: run.playerId, day: run.day }, update, { upsert: true, new: false }).lean(); }
      catch (error) {
        if (error.code !== 11000) throw error;
        previous = await Best.findOneAndUpdate({ playerId: run.playerId, day: run.day }, update, { new: false }).lean();
      }
      return { personalBest: Math.max(result.score, previous?.score ?? 0), improved: isBetter(result, previous) };
    },
    async leaderboard(startDay, day, playerId) {
      const match = { day: { $gte: startDay, $lte: day } };
      const ownRows = playerId ? await Best.aggregate([{ $match: { ...match, playerId } }, { $sort: { day: 1 } }, group]).exec() : [];
      const own = ownRows[0];
      const ahead = own ? [{ $match: { $or: [{ score: { $gt: own.score } },
        { score: own.score, delivered: { $gt: own.delivered } },
        { score: own.score, delivered: own.delivered, playerId: { $lt: playerId } }] } }, { $count: 'count' }] : [{ $match: { playerId: '__none__' } }];
      // No player identifiers leave this module; only the current browser gets isMe.
      const [view] = await Best.aggregate([{ $match: match }, { $sort: { day: 1 } }, group,
        { $facet: { entries: [{ $sort: { score: -1, delivered: -1, playerId: 1 } }, { $limit: 20 }], ahead } }]).exec();
      return { entries: view.entries.map((row, i) => publicEntry(row, i + 1, playerId)),
        me: own ? publicEntry(own, (view.ahead[0]?.count || 0) + 1, playerId) : null };
    },
    // MongoDB's TTL index removes run tokens; every claim also checks expiresAt.
    async prune() {}
  };
}

module.exports = { MemoryColonyStore, createMongoColonyStore };
