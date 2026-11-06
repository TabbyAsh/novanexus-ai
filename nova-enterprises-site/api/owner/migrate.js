const { handleOwnerMigrate } = require('../../lib/intake/handlers');

module.exports = (req, res) => handleOwnerMigrate(req, res);
