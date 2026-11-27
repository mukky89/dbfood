const path = require('node:path');

const closureReason = 'Objednávanie obedov sa skončilo. Objednať si môžete už iba oblátky od Yvonky.';

// Register before the lunch routes and static index so stale tabs observe the same closure.
function registerWaferClosure(app, getAppearance, deadline) {
  const whenClosed = handler => async (req, res, next) => {
    try {
      const { tema } = await getAppearance();
      res.set('Cache-Control', 'no-store');
      if (tema !== 'oblatky') return next();
      return handler(req, res);
    } catch {
      return res.status(503).send('Dostupnosť objednávania sa nepodarilo overiť. Skúste to o chvíľu znova.');
    }
  };
  app.get(['/', '/index.html'], whenClosed((req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'oblatky.html'))));
  app.get('/api/menu', whenClosed((req, res) =>
    res.json({ ok: false, menu: null, error: closureReason })));
  app.get('/api/status', whenClosed((req, res) =>
    res.json({ open: false, blocked: true, deadline: deadline(), blokovanyDovod: closureReason })));
  app.post('/api/orders', whenClosed((req, res) =>
    res.status(403).json({ ok: false, error: closureReason })));
}

module.exports = { registerWaferClosure };
