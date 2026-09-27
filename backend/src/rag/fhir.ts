export type ParsedKnowledgeChunk = { location: string; heading: string; content: string }

type FhirResource = Record<string, any> & { resourceType?: string }
type FhirBundle = { resourceType?: string; entry?: { resource?: FhirResource }[] }

const display = (value: any): string | undefined => value?.text || value?.coding?.find((item: any) => item?.display)?.display
const date = (value: unknown) => typeof value === 'string' ? value.slice(0, 10) : undefined
const unique = (values: (string | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))]

function ageAtLatestRecord(birthDate: string, resources: FhirResource[]) {
  const birth = new Date(`${birthDate}T00:00:00Z`)
  const dates = resources.flatMap(resource => [resource.effectiveDateTime, resource.issued, resource.authoredOn,
    resource.recordedDate, resource.period?.end, resource.period?.start, resource.meta?.lastUpdated])
    .filter((value): value is string => typeof value === 'string').map(value => new Date(value)).filter(value => !Number.isNaN(value.getTime()))
  const reference = dates.length ? new Date(Math.max(...dates.map(value => value.getTime()))) : new Date()
  let age = reference.getUTCFullYear() - birth.getUTCFullYear()
  if (reference.getUTCMonth() < birth.getUTCMonth() || (reference.getUTCMonth() === birth.getUTCMonth() && reference.getUTCDate() < birth.getUTCDate())) age -= 1
  return age
}

function observationText(resource: FhirResource) {
  const name = display(resource.code)
  const direct = resource.valueQuantity ? `${resource.valueQuantity.value ?? ''} ${resource.valueQuantity.unit ?? ''}`.trim()
    : resource.valueCodeableConcept ? display(resource.valueCodeableConcept) : resource.valueString
  const components = resource.component?.map((item: any) => {
    const value = item.valueQuantity ? `${item.valueQuantity.value ?? ''} ${item.valueQuantity.unit ?? ''}`.trim() : display(item.valueCodeableConcept)
    return value ? `${display(item.code) || 'Component'}: ${value}` : undefined
  }).filter(Boolean).join('; ')
  if (!name || (!direct && !components)) return undefined
  return `${date(resource.effectiveDateTime || resource.issued) || 'Undated'} - ${name}: ${direct || components}`
}

export function parseFhirBundle(text: string) {
  const bundle = JSON.parse(text) as FhirBundle
  if (bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) throw new Error('JSON input must be an HL7 FHIR Bundle.')
  const resources = bundle.entry.map(item => item.resource).filter((item): item is FhirResource => Boolean(item))
  const patient = resources.find(resource => resource.resourceType === 'Patient')
  if (!patient?.birthDate) throw new Error('FHIR Bundle does not contain a Patient with birthDate.')
  const age = ageAtLatestRecord(patient.birthDate, resources)
  const title = `Synthetic older adult clinical record (age ${age})`
  const chunks: ParsedKnowledgeChunk[] = [{
    location: 'FHIR Patient', heading: 'De-identified synthetic demographics',
    content: `SYNTHETIC DATA - NOT A REAL PATIENT. Age at latest recorded event: ${age}. Sex: ${patient.gender || 'unknown'}. Marital status: ${display(patient.maritalStatus) || 'unknown'}. Names, addresses, contact details, identifiers, and exact birth date are intentionally excluded.`,
  }]

  const conditions = unique(resources.filter(resource => resource.resourceType === 'Condition').map(resource => {
    const name = display(resource.code); if (!name) return undefined
    const onset = date(resource.onsetDateTime || resource.recordedDate)
    return `${name}${onset ? ` (${onset})` : ''}`
  })).slice(-30)
  const allergies = unique(resources.filter(resource => resource.resourceType === 'AllergyIntolerance').map(resource => display(resource.code))).slice(-20)
  if (conditions.length || allergies.length) chunks.push({
    location: 'FHIR Conditions', heading: 'Conditions and allergies',
    content: `SYNTHETIC CLINICAL HISTORY. Conditions: ${conditions.join('; ') || 'none recorded'}. Allergies/intolerances: ${allergies.join('; ') || 'none recorded'}.`,
  })

  const medications = unique(resources.filter(resource => ['MedicationRequest', 'MedicationStatement'].includes(resource.resourceType || '')).map(resource => {
    const name = display(resource.medicationCodeableConcept) || display(resource.medication?.concept)
    if (!name) return undefined
    const authored = date(resource.authoredOn || resource.effectivePeriod?.start)
    return `${name}${resource.status ? ` [${resource.status}]` : ''}${authored ? ` (${authored})` : ''}`
  })).slice(-30)
  if (medications.length) chunks.push({ location: 'FHIR Medications', heading: 'Medication history', content: `SYNTHETIC MEDICATION HISTORY. ${medications.join('; ')}.` })

  const observations = resources.filter(resource => resource.resourceType === 'Observation').map(observationText).filter((value): value is string => Boolean(value)).slice(-30)
  if (observations.length) chunks.push({ location: 'FHIR Observations', heading: 'Recent observations and laboratory results', content: `SYNTHETIC OBSERVATIONS. ${observations.join('; ')}.` })

  const care = unique(resources.filter(resource => ['Encounter', 'Procedure', 'CarePlan', 'Immunization'].includes(resource.resourceType || '')).map(resource => {
    const kind = resource.resourceType
    const name = display(resource.type?.[0]) || display(resource.code) || display(resource.vaccineCode) || display(resource.category?.[0]) || kind
    return `${date(resource.period?.start || resource.performedDateTime || resource.occurrenceDateTime) || 'Undated'} - ${kind}: ${name}`
  })).slice(-30)
  if (care.length) chunks.push({ location: 'FHIR Care History', heading: 'Encounters, procedures, care plans, and immunizations', content: `SYNTHETIC CARE HISTORY. ${care.join('; ')}.` })
  return { title, age, chunks: chunks.filter(chunk => chunk.content.length >= 30) }
}
