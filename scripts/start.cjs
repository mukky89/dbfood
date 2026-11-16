// Neúspešná údržba nesmie odstaviť objednávkovú aplikáciu.
require('./archive-switch-restaurant.cjs').runMaintenance()
  .catch(error => console.error('RESTAURANT_MAINTENANCE_FAILED ' + error.message))
  .finally(() => require('../server'));
