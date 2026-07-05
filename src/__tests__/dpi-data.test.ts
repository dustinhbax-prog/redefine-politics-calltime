// Data-integrity checks for the DPI map's static data. These catch pipeline
// mistakes (a state listed in the manifest with no folder, meta.json missing
// the fields the multi-state map relies on) before they ship.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DATA = join(process.cwd(), 'public', 'dpi-data')

type StateEntry = { po: string; name: string; bounds?: number[][]; default?: boolean }
const states: StateEntry[] = JSON.parse(readFileSync(join(DATA, 'states.json'), 'utf-8'))

describe('dpi-data manifest', () => {
  it('lists at least one state with exactly one default', () => {
    expect(states.length).toBeGreaterThan(0)
    expect(states.filter(s => s.default).length).toBe(1)
  })

  it.each(states.map(s => [s.po, s] as const))('%s entry is well-formed', (_po, s) => {
    expect(s.po).toMatch(/^[A-Z]{2}$/)
    expect(s.name).toBeTruthy()
  })
})

describe.each(states.map(s => [s.po] as const))('dpi-data/%s', po => {
  const dir = join(DATA, po)

  it('has a parseable meta.json with statewide stats', () => {
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf-8'))
    expect(meta.state).toBeTruthy()
    expect(meta.state.dpi).toBeGreaterThan(0)
    expect(meta.state.dpi).toBeLessThan(100)
    // non-default states must carry the fields the map needs to configure itself
    const entry = states.find(s => s.po === po)!
    if (!entry.default) {
      expect(meta.bounds, `${po} meta.json missing bounds`).toBeTruthy()
      expect(Array.isArray(meta.levels) && meta.levels.length, `${po} meta.json missing levels`).toBeTruthy()
    }
  })

  it('ships a geojson (and precompressed .gz) for every level', () => {
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf-8'))
    // default state (no meta.levels) uses the map's built-in MO layer list
    const levels: string[] = Array.isArray(meta.levels)
      ? meta.levels.map((l: { id: string }) => l.id)
      : ['county', 'house', 'senate', 'cd2025', 'cd2022', 'cityward', 'precinct', 'cousub', 'school', 'county_elec']
    for (const id of levels) {
      expect(existsSync(join(dir, `${id}.geojson`)), `${po}/${id}.geojson missing`).toBe(true)
      expect(existsSync(join(dir, `${id}.geojson.gz`)), `${po}/${id}.geojson.gz missing (nginx gzip_static)`).toBe(true)
    }
  })

  it('county.geojson features carry the properties the map colors by', () => {
    const gj = JSON.parse(readFileSync(join(dir, 'county.geojson'), 'utf-8'))
    expect(gj.features.length).toBeGreaterThan(0)
    const p = gj.features[0].properties
    expect(p.key, `${po} county features need a promoteId key`).toBeTruthy()
    expect(p).toHaveProperty('dpi')
  })
})
