// Údržba má samostatné modely a spojenie, preto musí bežať v samostatnom procese.
function start({ config = require('../config'), spawn = require('node:child_process').spawnSync,
  startServer = () => require('../server'), log = console.error } = {}) {
  if (config.maintenanceRestaurantTarget || config.maintenanceDatabaseStats) {
    try {
      const result = spawn(process.execPath, [require.resolve('./archive-switch-restaurant.cjs')], { stdio: 'inherit', timeout: 45000 });
      if (result.error || result.status !== 0) log('RESTAURANT_MAINTENANCE_FAILED Údržbový proces neskončil úspešne');
    } catch (error) { log('RESTAURANT_MAINTENANCE_FAILED ' + error.message); }
  }
  return startServer();
}
if (require.main === module) start();
module.exports = { start };
