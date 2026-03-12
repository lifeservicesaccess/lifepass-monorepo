const express = require('express');
const { registerCommonsRoutes } = require('./commons');
const { registerAgriRoutes } = require('./agri');
const { registerHealthRoutes } = require('./health');

function createPortalRouter() {
  const router = express.Router();
  registerCommonsRoutes(router);
  registerAgriRoutes(router);
  registerHealthRoutes(router);
  return router;
}

module.exports = { createPortalRouter };
