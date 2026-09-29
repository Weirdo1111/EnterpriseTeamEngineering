import { describe, expect, it } from 'vitest'
import { resolvePatientIdentity } from './patient-identity'

describe('patient identity for linked clinical records', () => {
  it('uses the linked ID even when another patient has the same saved name', () => {
    const patients = [
      { id: 'P-202609-001', name: 'Original Name' },
      { id: 'P-a79f0b01-b3b9-4667-b8e8-21650ba46ab1', name: 'Updated Name' },
    ]
    const source = { patientId: patients[1]!.id, patientName: 'Original Name' }
    const identity = resolvePatientIdentity(patients, source)
    expect(identity.currentName).toBe('Updated Name')
    expect(identity.snapshotName).toBe('Original Name')
    expect(identity.patientId).toBe(source.patientId)
    expect(identity.profileMissing).toBe(false)
  })

  it('reflects a renamed current profile without modifying a historical record', () => {
    const patients = [{ id: 'P-202609-001', name: 'Original Name' }]
    const source = Object.freeze({ patientId: 'P-202609-001', patientName: 'Original Name' })
    expect(resolvePatientIdentity(patients, source).currentName).toBe('Original Name')
    patients[0]!.name = 'Corrected Name'
    const identity = resolvePatientIdentity(patients, source)
    expect(identity.currentName).toBe('Corrected Name')
    expect(identity.snapshotName).toBe('Original Name')
    expect(source.patientName).toBe('Original Name')
  })

  it.each(['missing', 'p-202609-001', ' P-202609-001', 'P-202609-001 '])(
    'marks profile %s missing instead of using the first patient or matching a name',
    patientId => {
      const patients = [{ id: 'P-202609-001', name: 'Saved Name' }]
      const identity = resolvePatientIdentity(patients, { patientId, patientName: 'Saved Name' })
      expect(identity.currentName).toBeNull()
      expect(identity.profileMissing).toBe(true)
      expect(identity.patientId).toBe(patientId)
      expect(identity.snapshotName).toBe('Saved Name')
    },
  )

  it('keeps the saved identity available when there are no loaded profiles', () => {
    const identity = resolvePatientIdentity([], { patientId: 'P-202609-001', patientName: 'Historical Name' })
    expect(identity.currentName).toBeNull()
    expect(identity.profileMissing).toBe(true)
    expect(identity.snapshotName).toBe('Historical Name')
  })
})
