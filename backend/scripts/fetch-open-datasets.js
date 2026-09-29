import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { datasetPath, selectDatasetSources } from './dataset-selection.js'

const backendDirectory = fileURLToPath(new URL('../', import.meta.url))
const catalog = JSON.parse(await readFile(join(backendDirectory, 'data/dataset-catalog.json'), 'utf8'))
const outputDirectory = join(backendDirectory, 'data/open-datasets')
const downloadDirectory = join(outputDirectory, '.downloads')

async function download(url, destination) {
  await mkdir(dirname(destination), { recursive: true })
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (destination.endsWith('.pdf') && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`Not a PDF: ${url}`)
  await writeFile(destination, bytes)
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function patientAge(bundle) {
  const resources = bundle.entry?.map(item => item.resource).filter(Boolean) ?? []
  const patient = resources.find(resource => resource.resourceType === 'Patient')
  const birthDate = patient?.birthDate ? new Date(`${patient.birthDate}T00:00:00Z`) : undefined
  if (!birthDate || Number.isNaN(birthDate.getTime())) return -1
  const dated = resources.flatMap(resource => [resource.effectiveDateTime, resource.issued, resource.authoredOn,
    resource.recordedDate, resource.period?.end, resource.period?.start, resource.meta?.lastUpdated])
    .filter(Boolean).map(value => new Date(value)).filter(value => !Number.isNaN(value.getTime()))
  const reference = dated.length ? new Date(Math.max(...dated.map(value => value.getTime()))) : new Date()
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear()
  if (reference.getUTCMonth() < birthDate.getUTCMonth() || (reference.getUTCMonth() === birthDate.getUTCMonth() && reference.getUTCDate() < birthDate.getUTCDate())) age -= 1
  return age
}

let previous = { sources: [] }
try { previous = JSON.parse(await readFile(join(outputDirectory, 'fetch-receipt.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const selectedSources = selectDatasetSources(catalog, process.argv.slice(2))
const receipt = { fetchedAt: new Date().toISOString(), sources: previous.sources.filter(source => !selectedSources.some(selected => selected.id === source.id)) }
for (const source of selectedSources) {
  if (source.localPath.endsWith('.pdf')) {
    const destination = datasetPath(outputDirectory, source.localPath)
    const result = await download(source.downloadUrl, destination)
    receipt.sources.push({ id: source.id, files: 1, sourceUrl: source.sourceUrl, downloadUrl: source.downloadUrl, version: source.version, licenseName: source.licenseName, ...result })
    console.log(`Downloaded ${source.title}`)
    continue
  }

  if (source.id === 'synthea-older-adults') {
    const archive = join(downloadDirectory, basename(new URL(source.downloadUrl).pathname))
    const result = await download(source.downloadUrl, archive)
    const extracted = datasetPath(downloadDirectory, 'synthea-fhir')
    await rm(extracted, { recursive: true, force: true })
    await mkdir(extracted, { recursive: true })
    execFileSync('tar', ['-xf', archive, '-C', extracted], { stdio: 'inherit' })

    const selectedDirectory = datasetPath(outputDirectory, source.localPath)
    await rm(selectedDirectory, { recursive: true, force: true })
    await mkdir(selectedDirectory, { recursive: true })
    const candidates = (await readdir(extracted, { recursive: true, withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => join(entry.parentPath, entry.name)).sort()
    const selected = []
    for (const path of candidates) {
      const text = await readFile(path, 'utf8')
      const age = patientAge(JSON.parse(text))
      if (age < source.selection.minimumAge) continue
      const target = join(selectedDirectory, `synthea-older-adult-${String(selected.length + 1).padStart(2, '0')}.json`)
      await writeFile(target, text)
      selected.push({ file: basename(target), age })
      if (selected.length >= source.selection.maximumPatients) break
    }
    if (!selected.length) throw new Error('No Synthea records matched the configured older-adult cohort.')
    receipt.sources.push({ id: source.id, archiveBytes: result.bytes, archiveSha256: result.sha256, files: selected.length, selected })
    console.log(`Selected ${selected.length} synthetic patients aged ${source.selection.minimumAge}+`)
  }
}

await writeFile(join(outputDirectory, 'fetch-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
console.log(`Dataset bundle is ready in ${outputDirectory}`)
