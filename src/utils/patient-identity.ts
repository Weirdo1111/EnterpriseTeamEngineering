export interface PatientIdentity {
  patientId: string
  currentName: string | null
  snapshotName: string
  profileMissing: boolean
}

/** Resolve the current profile by its exact, opaque ID; keep historical names separate. */
export function resolvePatientIdentity(
  patients: ReadonlyArray<{ readonly id: string; readonly name: string }>,
  source: { readonly patientId: string; readonly patientName: string },
): PatientIdentity {
  const patient = patients.find(item => item.id === source.patientId)
  return {
    patientId: source.patientId,
    currentName: patient?.name ?? null,
    snapshotName: source.patientName,
    profileMissing: !patient,
  }
}
