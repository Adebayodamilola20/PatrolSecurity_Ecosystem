import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import db from './db.js'

const password = bcrypt.hashSync('123456', 10)

let clientId = uuidv4()
let site1Id = uuidv4()
let site2Id = uuidv4()

const existingClient = await db.get('SELECT id FROM clients WHERE name = ?', ['SecureCorp Nigeria'])
if (!existingClient) {
  await db.run(
    'INSERT INTO clients (id, name, email, phone, active) VALUES (?, ?, ?, ?, ?)',
    [clientId, 'SecureCorp Nigeria', 'client@securecorp.com', '+234 800 000 0001', 1]
  )
  console.log('Client created: SecureCorp Nigeria')

  await db.run(
    'INSERT INTO sites (id, clientId, name, location, active) VALUES (?, ?, ?, ?, ?)',
    [site1Id, clientId, 'Lagos HQ', 'Lagos, Nigeria', 1]
  )
  await db.run(
    'INSERT INTO sites (id, clientId, name, location, active) VALUES (?, ?, ?, ?, ?)',
    [site2Id, clientId, 'Abuja Branch', 'Abuja, Nigeria', 1]
  )
  console.log('Sites created: Lagos HQ, Abuja Branch')
} else {
  clientId = existingClient.id
  const existingSites = await db.all(
    'SELECT id, name FROM sites WHERE clientId = ? ORDER BY createdAt ASC',
    [clientId]
  )
  site1Id = existingSites.find((site) => site.name === 'Lagos HQ')?.id || existingSites[0]?.id || site1Id
  site2Id = existingSites.find((site) => site.name === 'Abuja Branch')?.id || existingSites[1]?.id || site2Id
  if (!existingSites.some((site) => site.name === 'Lagos HQ')) {
    await db.run(
      'INSERT INTO sites (id, clientId, name, location, active) VALUES (?, ?, ?, ?, ?)',
      [site1Id, clientId, 'Lagos HQ', 'Lagos, Nigeria', 1]
    )
  }
  if (!existingSites.some((site) => site.name === 'Abuja Branch')) {
    await db.run(
      'INSERT INTO sites (id, clientId, name, location, active) VALUES (?, ?, ?, ?, ?)',
      [site2Id, clientId, 'Abuja Branch', 'Abuja, Nigeria', 1]
    )
  }
  console.log('Client/Sites already exist')
}

const admin = {
  id: uuidv4(),
  name: 'Company Admin',
  email: 'admin@securecorp.com',
  password,
  role: 'admin',
  phone: '+234 800 000 0000',
  active: 1,
  clientId: null,
}

const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', ['admin@securecorp.com'])
if (!existingAdmin) {
  await db.run(`
    INSERT INTO users (id, name, email, password, role, phone, active, clientId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, Object.values(admin))
  console.log('Admin user created: admin@securecorp.com / 123456')
} else {
  console.log('Admin user already exists')
}

const mainAccountId = uuidv4()
const existingMain = await db.get('SELECT id FROM users WHERE email = ?', ['client@securecorp.com'])
if (!existingMain) {
  await db.run(`
    INSERT INTO users (id, name, email, password, role, phone, active, clientId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [mainAccountId, 'Client Admin', 'client@securecorp.com', password, 'main_account', '+234 800 000 0001', 1, clientId])
  console.log('Main account user created: client@securecorp.com / 123456')
} else {
  console.log('Main account user already exists')
}

const guardId = uuidv4()
const existingGuard = await db.get('SELECT id FROM users WHERE email = ?', ['guard@securecorp.com'])
if (!existingGuard) {
  await db.run(`
    INSERT INTO users (id, name, email, password, role, phone, active, clientId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [guardId, 'Field Guard', 'guard@securecorp.com', password, 'guard', '+234 800 000 0002', 1, clientId])
  console.log('Guard user created: guard@securecorp.com / 123456')

  await db.run(
    'INSERT INTO user_site_assignments (id, userId, siteId) VALUES (?, ?, ?)',
    [uuidv4(), guardId, site1Id]
  )
  console.log('Guard assigned to Lagos HQ')
} else {
  console.log('Guard user already exists')
  const existingAssignment = await db.get(
    'SELECT id FROM user_site_assignments WHERE userId = ? AND siteId = ?',
    [existingGuard.id, site1Id]
  )
  if (!existingAssignment) {
    await db.run(
      'INSERT INTO user_site_assignments (id, userId, siteId) VALUES (?, ?, ?)',
      [uuidv4(), existingGuard.id, site1Id]
    )
  }
}

const checkpoint = {
  id: uuidv4(),
  name: 'Shoprite Mall',
  code: 'SHOPRITE-001',
  latitude: 6.5244,
  longitude: 3.3792,
  radiusMeters: 10,
  active: 1,
}

const existingCheckpoint = await db.get('SELECT id FROM checkpoints WHERE code = ?', ['SHOPRITE-001'])
if (!existingCheckpoint) {
  await db.run(`
    INSERT INTO checkpoints (id, name, code, latitude, longitude, radiusMeters, active, clientId, siteId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [...Object.values(checkpoint), clientId, site1Id])
  console.log('Checkpoint created: Shoprite Mall (SHOPRITE-001)')
} else {
  console.log('Checkpoint already exists')
}

console.log('Seed complete!')
