const { handleOwnerNotificationRetry } = require('../../lib/intake/handlers');

module.exports = (req, res) => handleOwnerNotificationRetry(req, res);
