import { describe, expect, it, vi } from 'vitest'

import {
  USGS_EARTHQUAKE_FEED_URL,
  earthquakeObjectId,
  fetchLatestEarthquakes,
  normalizeUsgsEarthquakeFeed,
} from './live-gis-services.js'

const feed = {
  type: 'FeatureCollection',
  metadata: {
    generated: 1_787_832_493_000,
    count: 4,
  },
  features: [
    {
      type: 'Feature',
      id: 'newer-event',
      properties: {
        mag: 3.1,
        place: '12 km N of Test City',
        time: 1_787_832_400_000,
        updated: 1_787_832_450_000,
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/newer-event',
        detail: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=newer-event',
        alert: null,
        status: 'reviewed',
        tsunami: 0,
        sig: 148,
      },
      geometry: {
        type: 'Point',
        coordinates: [116.4, 39.9, 8.2],
      },
    },
    {
      type: 'Feature',
      id: 'strongest/event',
      properties: {
        mag: 5.6,
        place: 'Off the coast of Test Region',
        time: 1_787_830_000_000,
        updated: 1_787_831_000_000,
        url: 'https://earthquake.usgs.gov/earthquakes/eventpage/strongest-event',
        detail: 'https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=strongest-event',
        alert: 'green',
        status: 'reviewed',
        tsunami: 1,
        sig: 482,
      },
      geometry: {
        type: 'Point',
        coordinates: [142.2, 38.4, 24.5],
      },
    },
    {
      type: 'Feature',
      id: 'invalid-magnitude',
      properties: { mag: null, place: 'Unknown', time: 1_787_832_000_000 },
      geometry: { type: 'Point', coordinates: [120, 30, 4] },
    },
    {
      type: 'Feature',
      id: 'invalid-location',
      properties: { mag: 4.2, place: 'Invalid', time: 1_787_832_000_000 },
      geometry: { type: 'Point', coordinates: [220, 95, 4] },
    },
  ],
}

describe('live GIS service normalization', () => {
  it('turns the USGS feed into bounded, stable, surface-safe GeoJSON', () => {
    const result = normalizeUsgsEarthquakeFeed(feed, 10)

    expect(result.featureCount).toBe(2)
    expect(result.generatedAt).toBe('2026-08-27T12:08:13.000Z')
    expect(result.strongest).toMatchObject({
      eventId: 'strongest/event',
      objectId: 'entity:usgs-earthquakes-live:strongest%2Fevent',
      magnitude: 5.6,
      depthKm: 24.5,
      longitude: 142.2,
      latitude: 38.4,
    })
    expect(result.geoJson.features.map(feature => feature.id)).toEqual([
      'strongest/event',
      'newer-event',
    ])
    expect(result.geoJson.features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [142.2, 38.4, 0] },
      properties: {
        semanticType: 'earthquake',
        magnitude: 5.6,
        depthKm: 24.5,
        live: true,
        source: 'USGS Earthquake Hazards Program',
      },
    })
  })

  it('caps the visible feed and URI-encodes stable object IDs', () => {
    const result = normalizeUsgsEarthquakeFeed(feed, 1)

    expect(result.featureCount).toBe(1)
    expect(earthquakeObjectId('event/with space')).toBe(
      'entity:usgs-earthquakes-live:event%2Fwith%20space',
    )
  })

  it('fails before scene mutation when the remote service is unavailable', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })

    await expect(fetchLatestEarthquakes({ fetcher, timeoutMs: 50 })).rejects.toThrow(
      'USGS earthquake feed returned 503 Service Unavailable',
    )
    expect(fetcher).toHaveBeenCalledWith(
      USGS_EARTHQUAKE_FEED_URL,
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
})
