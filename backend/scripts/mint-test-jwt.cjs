// One-off: mint JWT for test user
const jwt = require('jsonwebtoken');
const payload = {
  id: '55ae009c-4d3a-4775-937d-e765f5af7ff7',
  email: 'thanhpc.dongduong@gmail.com',
  orgId: '50d7a1a4-5eec-42f3-a077-0ef7770d834c',
  role: 'owner',
};
const secret = process.env.JWT_SECRET;
if (!secret) { console.error('JWT_SECRET missing'); process.exit(1); }
console.log(jwt.sign(payload, secret, { expiresIn: '24h' }));
