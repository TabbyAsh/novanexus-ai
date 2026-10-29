const { handleHealth } = require('../../lib/intake/handlers');

module.exports = (req, res) => handleHealth(req, res);
