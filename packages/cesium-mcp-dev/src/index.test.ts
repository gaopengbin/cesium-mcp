import { describe, it, expect } from 'vitest'
import { CESIUM_API_DOCS } from './resources/api-docs.js'
import { CODE_SNIPPETS } from './resources/code-snippets.js'
import { ENTITY_TEMPLATES } from './resources/entity-templates.js'

// ==================== API Docs Data Integrity ====================

describe('CESIUM_API_DOCS', () => {
  it('should have at least 5 entries', () => {
    expect(CESIUM_API_DOCS.length).toBeGreaterThanOrEqual(5)
  })

  it('every entry should have required fields', () => {
    for (const doc of CESIUM_API_DOCS) {
      expect(doc.name).toBeTruthy()
      expect(doc.description).toBeTruthy()
      expect(['class', 'method', 'property']).toContain(doc.category)
    }
  })

  it('should contain Viewer and Entity', () => {
    const names = CESIUM_API_DOCS.map(d => d.name)
    expect(names).toContain('Viewer')
    expect(names).toContain('Entity')
  })
})

// ==================== Code Snippets Data Integrity ====================

describe('CODE_SNIPPETS', () => {
  it('should have at least 5 snippets', () => {
    expect(CODE_SNIPPETS.length).toBeGreaterThanOrEqual(5)
  })

  it('every snippet should have title, keywords, and code', () => {
    for (const s of CODE_SNIPPETS) {
      expect(s.title).toBeTruthy()
      expect(s.keywords.length).toBeGreaterThan(0)
      expect(s.code).toBeTruthy()
    }
  })
})

// ==================== API Lookup Logic ====================

describe('API lookup logic', () => {
  function lookup(query: string, category: string = 'all') {
    const q = query.toLowerCase()
    return CESIUM_API_DOCS.filter(doc => {
      const nameMatch = doc.name.toLowerCase().includes(q)
      const descMatch = doc.description.toLowerCase().includes(q)
      const catMatch = category === 'all' || doc.category === category
      return (nameMatch || descMatch) && catMatch
    }).slice(0, 5)
  }

  it('should find Viewer by exact name', () => {
    const results = lookup('Viewer')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.name).toBe('Viewer')
  })

  it('should be case-insensitive', () => {
    const results = lookup('viewer')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.name).toBe('Viewer')
  })

  it('should filter by category', () => {
    const results = lookup('', 'class')
    for (const r of results) {
      expect(r.category).toBe('class')
    }
  })

  it('should return empty for non-existent API', () => {
    const results = lookup('xyznonexistent')
    expect(results).toHaveLength(0)
  })

  it('should limit to 5 results', () => {
    const results = lookup('')  // matches everything
    expect(results.length).toBeLessThanOrEqual(5)
  })
})

// ==================== Code Gen Match Logic ====================

describe('Code gen match logic', () => {
  function matchSnippets(description: string) {
    const desc = description.toLowerCase()
    return CODE_SNIPPETS.filter(s =>
      s.keywords.some(k => desc.includes(k)),
    )
  }

  it('should match flyTo keywords', () => {
    const results = matchSnippets('飞到北京')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.title).toContain('飞行')
  })

  it('should match marker keywords', () => {
    const results = matchSnippets('添加一个marker')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should return empty for unmatched description', () => {
    const results = matchSnippets('xyznonexistent')
    expect(results).toHaveLength(0)
  })

  it('should strip type annotations for javascript mode', () => {
    const code = 'const entity: Cesium.Entity = viewer.entities.add({})'
    const jsCode = code.replace(/: Cesium\.\w+/g, '')
    expect(jsCode).toBe('const entity = viewer.entities.add({})')
  })
})

// ==================== Entity Templates ====================

describe('ENTITY_TEMPLATES', () => {
  const ALL_TYPES = ['point', 'billboard', 'label', 'polyline', 'polygon', 'model', 'ellipse', 'box']

  it('should have all 8 entity types', () => {
    for (const t of ALL_TYPES) {
      expect(ENTITY_TEMPLATES[t]).toBeDefined()
    }
  })

  it('every template should have defaultSize and generate', () => {
    for (const t of ALL_TYPES) {
      const tmpl = ENTITY_TEMPLATES[t]!
      expect(typeof tmpl.defaultSize).toBe('number')
      expect(typeof tmpl.generate).toBe('function')
    }
  })

  it.each(ALL_TYPES)('%s template should generate code with coordinates and name', (type) => {
    const tmpl = ENTITY_TEMPLATES[type]!
    const code = tmpl.generate({
      name: 'TestEntity',
      lon: 116.4,
      lat: 39.9,
      height: 100,
      color: '#FF0000',
      size: tmpl.defaultSize,
    })
    expect(code).toContain('TestEntity')
    expect(code).toContain('116.4')
    expect(code).toContain('39.9')
    expect(code).toContain('viewer.entities.add')
  })

  it('point template should include pixelSize', () => {
    const code = ENTITY_TEMPLATES['point']!.generate({
      name: 'P', lon: 0, lat: 0, height: 0, color: '#FFF', size: 10,
    })
    expect(code).toContain('pixelSize: 10')
  })

  it('polygon template should include hierarchy', () => {
    const code = ENTITY_TEMPLATES['polygon']!.generate({
      name: 'Poly', lon: 100, lat: 30, height: 0, color: '#00F', size: 0,
    })
    expect(code).toContain('hierarchy')
  })
})
