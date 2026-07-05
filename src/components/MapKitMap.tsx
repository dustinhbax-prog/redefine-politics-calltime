import { useEffect, useRef, useState } from 'react'

/**
 * A compact Apple Maps (MapKit JS) pin map. Lazily loads mapkit.js once per
 * page, authorizes via the backend token endpoint, and drops a marker at the
 * given coordinate. Renders nothing if MapKit fails to load or authorize (e.g.
 * the origin-locked token on a non-prod host), so the profile never shows a
 * broken map.
 */

declare global {
  interface Window { mapkit?: any }
}

const MAPKIT_SRC = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js'

let mapkitReady: Promise<any> | null = null

// Auth/config failures happen AFTER mapkit.init resolves (token vending is async),
// so surface them through a module-level flag + listeners that mounted maps
// subscribe to — otherwise a failed token leaves a dead gray box on the page.
let mapkitFailed = false
const failListeners = new Set<() => void>()
function markFailed() {
  if (mapkitFailed) return
  mapkitFailed = true
  failListeners.forEach(fn => fn())
}

function loadMapKit(): Promise<any> {
  if (mapkitReady) return mapkitReady
  mapkitReady = new Promise((resolve, reject) => {
    const w = window
    const init = () => {
      try {
        w.mapkit.init({
          authorizationCallback: (done: (token: string) => void) => {
            fetch('/api/mapkit/token')
              .then(r => (r.ok ? r.json() : Promise.reject(new Error(`token ${r.status}`))))
              .then(d => done(d.token))
              .catch(err => { console.warn('[mapkit] token fetch failed', err); markFailed() })
          },
          language: 'en',
        })
        // an origin-rejected or malformed token surfaces here, not as a promise rejection
        w.mapkit.addEventListener('configuration-error', markFailed)
        w.mapkit.addEventListener('error', markFailed)
        resolve(w.mapkit)
      } catch (e) { reject(e) }
    }
    if (w.mapkit && typeof w.mapkit.init === 'function') { init(); return }
    const existing = document.getElementById('apple-mapkit-js') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', init)
      existing.addEventListener('error', () => reject(new Error('mapkit.js failed to load')))
      return
    }
    const s = document.createElement('script')
    s.id = 'apple-mapkit-js'
    s.src = MAPKIT_SRC
    s.crossOrigin = 'anonymous'
    s.async = true
    s.addEventListener('load', init)
    s.addEventListener('error', () => reject(new Error('mapkit.js failed to load')))
    document.head.appendChild(s)
  })
  return mapkitReady
}

export default function MapKitMap({
  lat, lon, label, className,
}: { lat: number; lon: number; label?: string; className?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let map: any = null
    let cancelled = false
    if (mapkitFailed) { setFailed(true); return }
    const onFail = () => { if (!cancelled) setFailed(true) }
    failListeners.add(onFail)
    loadMapKit()
      .then(mapkit => {
        if (cancelled || !el.current) return
        const coord = new mapkit.Coordinate(lat, lon)
        map = new mapkit.Map(el.current, {
          center: coord,
          colorScheme: mapkit.Map.ColorSchemes.Dark,
          showsCompass: mapkit.FeatureVisibility.Hidden,
          showsZoomControl: true,
          showsMapTypeControl: false,
          isRotationEnabled: false,
          cameraDistance: 1500,
        })
        map.addAnnotation(new mapkit.MarkerAnnotation(coord, { color: '#10b981', title: label || '' }))
        map.addEventListener('error', () => { if (!cancelled) setFailed(true) })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      failListeners.delete(onFail)
      if (map) { try { map.destroy() } catch { /* already gone */ } }
    }
  }, [lat, lon, label])

  if (failed) return null
  return <div ref={el} className={className} />
}
