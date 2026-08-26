import jwt from 'jsonwebtoken';
import { prisma } from './src/shared/database/prisma-client.js';
import { config } from './src/config/index.js';
const u = await prisma.user.findFirst({ where: { role: { in: ['owner','admin'] } } });
console.log(jwt.sign({ id: u!.id, orgId: u!.orgId, email: u!.email, role: u!.role, typ: 'access' }, config.jwtSecret, { expiresIn: '15m' }));
await prisma.$disconnect();
