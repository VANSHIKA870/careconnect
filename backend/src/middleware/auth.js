const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'super-secret-access-token-key-12345', (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token is invalid or has expired' });
    }
    req.user = decoded;
    next();
  });
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};
