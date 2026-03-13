const express = require('express');
const { registerCommonsRoutes } = require('./commons');
const { registerAgriRoutes } = require('./agri');
const { registerHealthRoutes } = require('./health');
const { requirePortalAccess } = require('./accessPolicy');

function createPortalRouter() {
  const router = express.Router();
  const access = {
    requirePortalAccess
  };

  registerCommonsRoutes(router, access);
  registerAgriRoutes(router, access);
  registerHealthRoutes(router, access);
  return router;
}

module.exports = { createPortalRouter };
