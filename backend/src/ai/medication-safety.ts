import { readFileSync } from 'node:fs'

type Evidence = { title: string; url: string; version: string; reviewedBy: string; reviewedAt: string }
type InteractionRule = { withIngredient: string; message: string; severity: 'warning' | 'critical'; evidence: Evidence }
type CrossAllergyRule = { allergenIngredient: string; message: string; severity: 'warning' | 'critical'; evidence: Evidence }
type DoseRule = { route: string; maxDailyMg: number; minAge?: number; maxEgfr?: number; message: string; evidence: Evidence }
export type MedicationEntry = {
  ingredient: string
  approvalNumber: string
  aliases?: string[]
  interactions?: InteractionRule[]
  crossAllergies?: CrossAllergyRule[]
  doseRules?: DoseRule[]
}
export type MedicationCatalog = { formatVersion: 1; jurisdiction: 'CN'; version: string; medications: MedicationEntry[] }
export type SafetyFinding = { category: 'allergy' | 'cross-allergy' | 'interaction' | 'dose'; severity: 'warning' | 'critical'; message: string; evidence?: Evidence }

const str = (value: unknown, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase()
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0
const isEvidence = (value: unknown): value is Evidence => {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return Boolean(str(item.title) && /^https:\/\//.test(str(item.url, 500)) && str(item.version) && str(item.reviewedBy) && /^\d{4}-\d{2}-\d{2}$/.test(str(item.reviewedAt)))
}

export function validateMedicationCatalog(value: unknown): MedicationCatalog {
  if (!value || typeof value !== 'object') throw new Error('Medication knowledge must be a JSON object.')
  const catalog = value as Record<string, unknown>
  if (catalog.formatVersion !== 1 || catalog.jurisdiction !== 'CN' || !str(catalog.version) || !Array.isArray(catalog.medications)) {
    throw new Error('Medication knowledge requires formatVersion 1, jurisdiction CN, version, and medications.')
  }
  const seen = new Set<string>()
  for (const raw of catalog.medications) {
    const drug = raw as MedicationEntry
    if (!drug || !str(drug.ingredient) || !str(drug.approvalNumber)) throw new Error('Each medication requires an ingredient and approval number.')
    const key = `${normalized(drug.ingredient)}|${normalized(drug.approvalNumber)}`
    if (seen.has(key)) throw new Error(`Duplicate medication entry: ${key}`)
    seen.add(key)
    if (drug.aliases && (!Array.isArray(drug.aliases) || drug.aliases.some(alias => !str(alias)))) throw new Error(`Invalid aliases for ${key}`)
    for (const rule of drug.interactions || []) {
      if (!str(rule.withIngredient) || !str(rule.message) || !['warning', 'critical'].includes(rule.severity) || !isEvidence(rule.evidence)) throw new Error(`Invalid interaction rule for ${key}`)
    }
    for (const rule of drug.crossAllergies || []) {
      if (!str(rule.allergenIngredient) || !str(rule.message) || !['warning', 'critical'].includes(rule.severity) || !isEvidence(rule.evidence)) throw new Error(`Invalid cross-allergy rule for ${key}`)
    }
    for (const rule of drug.doseRules || []) {
      if (!str(rule.route) || !positive(rule.maxDailyMg) || !str(rule.message) || !isEvidence(rule.evidence) ||
        (rule.minAge !== undefined && !positive(rule.minAge)) || (rule.maxEgfr !== undefined && !positive(rule.maxEgfr))) throw new Error(`Invalid dose rule for ${key}`)
    }
  }
  return catalog as MedicationCatalog
}

export function loadMedicationCatalog(path = process.env.MEDICATION_KNOWLEDGE_PATH): MedicationCatalog | null {
  return path ? validateMedicationCatalog(JSON.parse(readFileSync(path, 'utf8'))) : null
}

function resolveMedication(catalog: MedicationCatalog, ingredient: string, approvalNumber: string) {
  return catalog.medications.find(drug => normalized(drug.approvalNumber) === normalized(approvalNumber) &&
    [drug.ingredient, ...(drug.aliases || [])].some(name => normalized(name) === normalized(ingredient)))
}

export function checkOrderSafety(input: Record<string, unknown>, catalog: MedicationCatalog | null = null) {
  const patient = input.patient && typeof input.patient === 'object' ? input.patient as Record<string, unknown> : {}
  const order = input.order && typeof input.order === 'object' ? input.order as Record<string, unknown> : {}
  const content = str(order.content, 2000)
  const type = str(order.type, 30)
  if (!['Medication', 'Examination', 'Laboratory', 'Nursing'].includes(type)) throw new Error('A valid order type is required.')
  if (!content && type !== 'Medication') throw new Error('Order details are required.')

  const findings: SafetyFinding[] = []
  const checked: string[] = []
  const notChecked: string[] = []
  const allergies = Array.isArray(patient.allergies) ? patient.allergies.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 30) : []
  if (type !== 'Medication') {
    checked.push('Order type and text presence')
    notChecked.push('Clinical indication and patient-specific contraindications')
  } else {
    const medication = order.medication && typeof order.medication === 'object' ? order.medication as Record<string, unknown> : {}
    const ingredient = str(medication.ingredient)
    const approvalNumber = str(medication.approvalNumber)
    const current = Array.isArray(patient.currentMedications) ? patient.currentMedications.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 100) : []
    const candidate = catalog && ingredient && approvalNumber ? resolveMedication(catalog, ingredient, approvalNumber) : undefined
    const exactAllergy = patient.allergyStatus === 'known' && ingredient && allergies.some(allergen => normalized(allergen) === normalized(ingredient))
    if (exactAllergy) findings.push({ category: 'allergy', severity: 'critical', message: `Documented allergy exactly matches ${ingredient}. Verify ingredient and reaction before prescribing.` })
    if (ingredient && (patient.allergyStatus === 'known' || patient.allergyStatus === 'none')) checked.push('Exact ingredient against documented allergy names')
    else notChecked.push('Exact allergy: confirm the ingredient and allergy history')
    if (!catalog) notChecked.push('No reviewed Mainland China medication knowledge catalog is configured')
    else if (!candidate) notChecked.push('Drug identity is not matched to a reviewed ingredient and approval number')

    if (candidate && patient.allergyStatus === 'known' && candidate.crossAllergies?.length) {
      for (const rule of candidate.crossAllergies || []) if (allergies.some(allergen => normalized(allergen) === normalized(rule.allergenIngredient))) {
        findings.push({ category: 'cross-allergy', severity: rule.severity, message: rule.message, evidence: rule.evidence })
      }
      checked.push('Reviewed cross-allergy rules for documented allergen names')
    } else notChecked.push('Cross-allergy: verified drug identity, allergy list, and reviewed rules required')

    if (candidate && patient.medicationListConfirmed === true) {
      const knownCurrent = current.map(name => catalog!.medications.filter(drug => [drug.ingredient, ...(drug.aliases || [])].some(alias => normalized(alias) === normalized(name))))
      for (const rule of candidate.interactions || []) if (current.some(name => normalized(name) === normalized(rule.withIngredient)) ||
        knownCurrent.some(drugs => drugs.some(drug => normalized(drug.ingredient) === normalized(rule.withIngredient)))) {
        findings.push({ category: 'interaction', severity: rule.severity, message: rule.message, evidence: rule.evidence })
      }
      for (const drugs of knownCurrent) for (const drug of drugs) for (const rule of drug.interactions || []) {
        if (normalized(rule.withIngredient) === normalized(candidate.ingredient) && !findings.some(item => item.category === 'interaction' && item.message === rule.message)) {
          findings.push({ category: 'interaction', severity: rule.severity, message: rule.message, evidence: rule.evidence })
        }
      }
      if (knownCurrent.some(drugs => !drugs.length)) notChecked.push('Interaction: some current medications were not matched to the reviewed catalog')
      if (!(candidate.interactions?.length) && !knownCurrent.some(drugs => drugs.some(drug => drug.interactions?.length))) notChecked.push('Interaction: no reviewed pair rules are available for these ingredients')
      else checked.push('Available reviewed interaction pairs against confirmed current medication list')
      notChecked.push('Interaction: current medication product identities and complete pair coverage are not verified')
    } else notChecked.push('Interaction: confirm the complete current medication list and drug identity')

    const dose = medication.dose && typeof medication.dose === 'object' ? medication.dose as Record<string, unknown> : {}
    const route = str(medication.route)
    const amount = dose.value
    const unit = str(dose.unit).toLowerCase()
    const frequency = medication.frequencyPerDay
    const multiplier = unit === 'g' ? 1000 : unit === 'mcg' ? 0.001 : unit === 'mg' ? 1 : null
    const dailyMg = positive(amount) && positive(frequency) && multiplier !== null ? (amount as number) * (frequency as number) * multiplier : null
    if (candidate && route && dailyMg !== null && candidate.doseRules?.length) {
      const applicable = candidate.doseRules.filter(rule => normalized(rule.route) === normalized(route) &&
        (rule.minAge === undefined || (typeof patient.age === 'number' && patient.age >= rule.minAge)) &&
        (rule.maxEgfr === undefined || (typeof patient.egfr === 'number' && patient.egfr <= rule.maxEgfr)))
      for (const rule of applicable) if (dailyMg > rule.maxDailyMg) findings.push({ category: 'dose', severity: 'critical', message: `${rule.message} Proposed daily dose: ${dailyMg} mg.`, evidence: rule.evidence })
      if (candidate.doseRules.some(rule => rule.maxEgfr !== undefined) && !positive(patient.egfr)) notChecked.push('Renal dosing: current eGFR is required')
      if (candidate.doseRules.some(rule => rule.minAge !== undefined) && !positive(patient.age)) notChecked.push('Age-specific dosing: patient age is required')
      if (applicable.length) checked.push('Reviewed daily dose limits for matching route and available patient factors')
      else notChecked.push('Dose: no reviewed limit applies to this route and patient context')
    } else notChecked.push('Dose: verified formulation, route, amount, frequency, and reviewed product-specific limits required')
    notChecked.push('Indication, formulation strength, liver function, pregnancy, and other patient-specific contraindications')
  }
  if (patient.status === 'critical') findings.push({ category: 'dose', severity: 'warning', message: 'Patient is marked high risk; assess clinical urgency and complete context.' })
  const uniqueGaps = [...new Set(notChecked)]
  return {
    status: findings.length ? 'potential-match' as const : 'incomplete' as const,
    alerts: findings.map(item => item.message), findings,
    documentedAllergies: patient.allergyStatus === 'known' ? allergies : [],
    checked, notChecked: uniqueGaps,
    catalogVersion: catalog?.version || null,
    generatedAt: new Date().toISOString(),
  }
}
