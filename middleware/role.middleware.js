// middleware/role.middleware.js

// checkRole accepts array or single string
exports.checkRole = (allowed) => {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed];
  return (req, res, next) => {
    if (!req.identity || !req.identity.role) return res.status(401).json({ message: 'Unauthenticated' });
    if (!allowedRoles.includes(req.identity.role)) return res.status(403).json({ message: 'Access denied' });
    next();
  };
};
