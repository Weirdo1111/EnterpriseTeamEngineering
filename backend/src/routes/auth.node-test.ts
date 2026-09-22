import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import argon2 from 'argon2'
import { createAuthRouter } from './auth.js'
import type { DbUser } from '../db.js'

const secret = 'test-only-secret-at-least-32-characters-long'

async function fixture(status = 'active') {
  const user: DbUser = {
    id: '1', username: 'doctor.demo', password_hash: await argon2.hash('correct-password'),
    name: 'Dr. Riley Lin', role: 'doctor', status,
  }
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter({
    byAccount: async (account) => account === user.username ? user : null,
    byId: async (id) => id === user.id ? user : null,
  }, secret))
  return { app, user }
}

test('login uses database role and never returns the password hash', async () => {
  const { app } = await fixture()
  const response = await request(app).post('/api/auth/login').send({ account: 'doctor.demo', password: 'correct-password', role: 'admin' })
  assert.equal(response.status, 200)
  assert.equal(response.body.user.role, 'doctor')
  assert.equal(response.body.user.account, 'doctor.demo')
  assert.equal(typeof response.body.token, 'string')
  assert.equal(response.body.user.password_hash, undefined)
})

test('wrong password and inactive account cannot log in', async () => {
  const { app } = await fixture()
  assert.equal((await request(app).post('/api/auth/login').send({ account: 'doctor.demo', password: 'wrong' })).status, 401)
  const inactive = await fixture('disabled')
  assert.equal((await request(inactive.app).post('/api/auth/login').send({ account: 'doctor.demo', password: 'correct-password' })).status, 401)
})

test('me verifies token and reloads current user; logout acknowledges valid token', async () => {
  const { app, user } = await fixture()
  assert.equal((await request(app).get('/api/auth/me')).status, 401)
  const login = await request(app).post('/api/auth/login').send({ account: user.username, password: 'correct-password' })
  const token = login.body.token as string
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
  assert.equal(me.status, 200)
  assert.equal(me.body.user.role, 'doctor')
  user.role = 'seniorDoctor'
  const refreshed = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
  assert.equal(refreshed.body.user.role, 'seniorDoctor')
  user.status = 'disabled'
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status, 401)
  user.status = 'active'
  assert.equal((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)).status, 200)
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}bad`)).status, 401)
})
