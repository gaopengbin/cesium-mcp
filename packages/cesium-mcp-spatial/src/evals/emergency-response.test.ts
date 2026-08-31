import { describe, expect, it } from 'vitest'
import { createSpatialContext } from '../context.js'
import {
  createEmergencyResponseFeatures,
  createEmergencyResponseGeoJson,
  createEmergencyResponseObjects,
  emergencyQueryCases,
  emergencyRelationCases,
  runEmergencyResponseEvaluation,
} from './emergency-response.js'
import type { EmergencyResponseStage } from './emergency-response.js'

const stages: readonly EmergencyResponseStage[] = ['baseline', 'expanded']

describe('urban-flood spatial evaluation', () => {
  for (const stage of stages) {
    describe(stage, () => {
      const context = createSpatialContext(createEmergencyResponseObjects(stage))

      it('keeps the GeoJSON fixture and normalized object inventory aligned', () => {
        const features = createEmergencyResponseFeatures(stage)
        const geoJson = createEmergencyResponseGeoJson(stage)
        expect(features).toHaveLength(12)
        expect(geoJson.features.map(feature => feature.id))
          .toEqual(features.map(feature => feature.id))
        expect(context.describe().objectCount).toBe(13)
      })

      for (const evaluation of emergencyRelationCases(stage)) {
        it(evaluation.name, () => {
          const result = context.relate(
            evaluation.subjectId,
            evaluation.objectId,
            evaluation.relation,
            evaluation.options,
          )
          expect(result.value).toBe(evaluation.expectedValue)
          expect(result.quality).toBe(evaluation.expectedQuality)
          expect(result.basis).toBe(evaluation.expectedBasis)
        })
      }

      for (const evaluation of emergencyQueryCases) {
        it(evaluation.name, () => {
          expect(context.query(evaluation.query).map(object => object.objectId))
            .toEqual(evaluation.expectedObjectIds)
        })
      }
    })
  }

  it('produces a passing machine-readable report for both stages', () => {
    const report = runEmergencyResponseEvaluation()
    expect(report.passed).toBe(true)
    expect(report.stages.map(stage => stage.stage)).toEqual(stages)
    expect(report.stages.every(stage => stage.assertions.length === 6)).toBe(true)
  })
})
