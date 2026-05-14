import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from './db.js'

const password = bcrypt.hashSync('123456', 10)

const admin = {
  id: uuidv4(),
  name: 'Company Admin',
  email: 'admin@securecorp.com',
  password,
  role: 'admin',
  phone: '+234 800 000 0000',
  active: 1,
}

const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', ['admin@securecorp.com'])
if (!existingAdmin) {
  await db.run(`
    INSERT INTO users (id, name, email, password, role, phone, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, Object.values(admin))
  console.log('Admin user created: admin@securecorp.com / 123456')
} else {
  console.log('Admin user already exists')
}

const checkpoint = {
  id: uuidv4(),
  name: 'Shoprite Mall',
  code: 'SHOPRITE-001',
  latitude: 6.5244,
  longitude: 3.3792,
  radiusMeters: 50,
  active: 1,
}

const existingCheckpoint = await db.get('SELECT id FROM checkpoints WHERE code = ?', ['SHOPRITE-001'])
if (!existingCheckpoint) {
  await db.run(`
    INSERT INTO checkpoints (id, name, code, latitude, longitude, radiusMeters, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, Object.values(checkpoint))
  console.log('Checkpoint created: Shoprite Mall (SHOPRITE-001)')
} else {
  console.log('Checkpoint already exists')
}

console.log('Seed complete!')
