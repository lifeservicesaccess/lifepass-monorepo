function registerCommonsRoutes(router) {
  router.get('/commons/status', (_req, res) => {
    res.json({ success: true, portal: 'commons', capabilities: ['identity', 'navigation', 'service-discovery'] });
  });
}

module.exports = { registerCommonsRoutes };
