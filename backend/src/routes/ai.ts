import { Router } from 'express'
import type { Pool } from 'mysql2/promise'
import type { DbUser, UserLookup } from '../db.js'
import { prepareClinicalDraft, prepareConsultationSummary, type NarrativeModel } from '../ai/synthetic-narrative.js'
import { checkOrderSafety, type MedicationCatalog } from '../ai/medication-safety.js'
import { rankSimilarCases, relatedGuidance } from '../ai/similar.js'
import type { StoredKnowledgeChunk } from '../rag/repository.js'
import { createAuthenticated } from './auth.js'

type SimilarDependencies = {
  chunks: () => Promise<StoredKnowledgeChunk[]>
  embed: (query: string) => Promise<number[]>
}

export function createAiRouter(users: UserLookup, secret: string, pool: Pool, similar: SimilarDependencies, medicationCatalog: MedicationCatalog | null = null, narrativeModel?: NarrativeModel) {
  const router = Router()
  router.use(createAuthenticated(users, secret))
  const clinician = (user: DbUser) => ['doctor', 'seniorDoctor'].includes(user.role)
  async function audit(user: DbUser, action: string, patientId: string, details: object, ip?: string) {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, role, action, resource_type, resource_id, result, ip_address, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.name, user.role, action, 'patient', patientId || 'unlinked', 'Pending Review', ip || null, JSON.stringify(details)],
    )
  }
  router.post('/record-draft', async (req, res) => {
    const user = res.locals.user as DbUser
    if (!clinician(user)) {
      res.status(403).json({ message: 'Administrators cannot generate clinical content.' }); return
    }
    try {
      const suggestion = await prepareClinicalDraft(req.body && typeof req.body === 'object' ? req.body : {}, narrativeModel)
      const patientId = suggestion.sourceIds[0]!
      await audit(user, 'Generated AI medical record draft', patientId, { generator: suggestion.generator, sourceIds: suggestion.sourceIds }, req.ip)
      res.json({ suggestion })
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to generate the clinical draft.' })
    }
  })
  router.post('/consultation-summary', async (req, res) => {
    const user = res.locals.user as DbUser
    if (!clinician(user)) { res.status(403).json({ message: 'Administrators cannot generate clinical content.' }); return }
    try {
      const summary = await prepareConsultationSummary(req.body && typeof req.body === 'object' ? req.body : {}, narrativeModel)
      await audit(user, 'Summarized consultation', summary.sourceIds[0] || 'unlinked', { sourceIds: summary.sourceIds, generator: 'generator' in summary ? summary.generator : 'rule-based' }, req.ip)
      res.json({ summary })
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to summarize the consultation.' })
    }
  })
  router.post('/order-check', async (req, res) => {
    const user = res.locals.user as DbUser
    if (!clinician(user)) { res.status(403).json({ message: 'Administrators cannot check clinical orders.' }); return }
    try {
      const check = checkOrderSafety(req.body && typeof req.body === 'object' ? req.body : {}, medicationCatalog)
      const patientId = typeof req.body?.patient?.id === 'string' ? req.body.patient.id : 'unlinked'
      await audit(user, 'Checked proposed order', patientId, { status: check.status, orderType: req.body?.order?.type, catalogVersion: check.catalogVersion, findingCategories: check.findings.map(item => item.category), unassessedCount: check.notChecked.length }, req.ip)
      res.json({ check })
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unable to check the order.' })
    }
  })
  router.post('/similar-cases', async (req, res) => {
    const user = res.locals.user as DbUser
    if (!clinician(user)) { res.status(403).json({ message: 'Administrators cannot query clinical cases.' }); return }
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : ''
    if (query.length < 5 || query.length > 500) { res.status(400).json({ message: 'Enter 5 to 500 characters of clinical features.' }); return }
    try {
      const chunks = await similar.chunks()
      const embedding = await similar.embed(query)
      const cases = rankSimilarCases(chunks, embedding)
      const guidance = relatedGuidance(chunks, query, embedding)
      await audit(user, 'Searched synthetic similar cases', 'unlinked', { caseIds: cases.map(item => item.documentId), guidanceIds: guidance.map(item => item.documentId) }, req.ip)
      res.json({ cases, guidance, dataset: 'synthetic', clinicalUse: 'illustrative-only' })
    } catch (error) {
      res.status(502).json({ message: error instanceof Error ? error.message : 'Unable to search similar cases.' })
    }
  })
  return router
}
