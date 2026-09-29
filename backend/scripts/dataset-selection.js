import { isAbsolute, relative, resolve } from 'node:path'

export function selectDatasetSources(catalog, args) {
  const ids = args.filter(arg => arg.startsWith('--source=')).map(arg => arg.slice('--source='.length))
  if (args.some(arg => arg !== '--clinical' && !arg.startsWith('--source='))) throw new Error('Use --clinical or --source=<catalog-id>.')
  if (args.includes('--clinical') && ids.length) throw new Error('Do not combine --clinical and --source.')
  if (ids.some(id => !catalog.sources.some(source => source.id === id))) throw new Error('Unknown dataset source ID.')
  return catalog.sources.filter(source => args.includes('--clinical') ? source.category === 'geriatric-clinical-guidance' : !ids.length || ids.includes(source.id))
}

export function datasetPath(root, localPath) {
  if (!localPath || isAbsolute(localPath)) throw new Error('Dataset paths must be relative.')
  const path = resolve(root, localPath)
  const within = relative(resolve(root), path)
  if (!within || within === '..' || within.startsWith('../') || within.startsWith('..\\') || isAbsolute(within)) throw new Error('Dataset path leaves the dataset directory.')
  return path
}
