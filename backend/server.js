import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { fetchWikipediaIntro } from './src/wikipedia.js'
import { generateNarration } from './src/narrator.js'
import { streamNarrationAudio } from './src/tts.js'
import { getSession, deleteSession, pushLocation, addToMemory } from './src/session.js'
import { getAllRoutes, getRouteById, createRoute, deleteRoute } from './src/db.js'

const PORT = process.env.PORT || 8080
const BASE_URL = process.env.BASE_URL || 'https://lunch-backup-fioricet-boat.trycloudflare.com'

const server = createServer((req, res) => {
    if (req.url === '/feed.xml') {
        const routes = getAllRoutes()
        const items = routes.map(route => {
            const stops = route.monuments.map(m => m.monument_label).join(', ')
            return `
    <item>
      <title>${escapeXml(route.name)}</title>
      <link>${BASE_URL}/feed.xml</link>
      <guid isPermaLink="false">route-${route.id}</guid>
      <pubDate>${new Date(route.created_at).toUTCString()}</pubDate>
      <description>${escapeXml(`${route.monuments.length} stops: ${stops}`)}</description>
    </item>`
        }).join('')

        const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tour Guide Routes</title>
    <link>${BASE_URL}</link>
    <description>Saved monument routes</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`

        res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' })
        res.end(feed)
        return
    }
    res.writeHead(404)
    res.end()
})

const wss = new WebSocketServer({ server })

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
const FETCH_RADIUS = 5
const SHOW_RADIUS  = 5000
const NARRATE_RADIUS = 100
const MIN_MOVE_METERS = 150
const CACHE_DURATION_MS = 5 * 60 * 1000

function buildSparqlQuery(lat, lng) {
    return `
    PREFIX wd:  <http://www.wikidata.org/entity/>
    PREFIX wdt: <http://www.wikidata.org/prop/direct/>
    PREFIX wikibase: <http://wikiba.se/ontology#>
    PREFIX bd:  <http://www.bigdata.com/rdf#>
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX schema: <http://schema.org/>

    SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord ?afstand_km
                    ?wikipedia_en ?wikipedia_nl ?inception ?architectLabel ?image
    WHERE {
      SERVICE wikibase:around {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${FETCH_RADIUS}" .
        bd:serviceParam wikibase:distance ?afstand_km .
      }

      ?item wdt:P31 ?type .
      VALUES ?type {
        wd:Q4989906   wd:Q839954    wd:Q16748868
        wd:Q23413     wd:Q16970     wd:Q33506
        wd:Q570116    wd:Q12280     wd:Q271669
        wd:Q19844914  wd:Q1081138
      }

      OPTIONAL { ?item wdt:P571 ?inception . }
      OPTIONAL { ?item wdt:P84  ?architect . }
      OPTIONAL { ?item wdt:P18  ?image     . }
      OPTIONAL {
        ?wikipedia_en schema:about ?item ;
                      schema:inLanguage "en" ;
                      schema:isPartOf <https://en.wikipedia.org/> .
      }
      OPTIONAL {
        ?wikipedia_nl schema:about ?item ;
                      schema:inLanguage "nl" ;
                      schema:isPartOf <https://nl.wikipedia.org/> .
      }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,nl" . }
    }
    ORDER BY ASC(?afstand_km)
    LIMIT 100`
}

async function fetchMonuments(lat, lng) {
    const query = buildSparqlQuery(lat, lng)
    const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query)

    console.log(`[Wikidata] Fetching monuments`)

    const res = await fetch(url, {
        headers: {
            Accept: 'application/sparql-results+json',
            'User-Agent': 'ARTourGuide/1.0',
        },
        signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
        const body = await res.text()
        console.error('[Wikidata] Error body:', body)
        throw new Error(`Wikidata error: ${res.status}`)
    }

    const json = await res.json()
    return json.results.bindings.map(b => ({
        id:          b.item.value,
        label:       b.itemLabel?.value ?? 'Unknown',
        description: b.itemDescription?.value ?? null,
        coord:       b.coord.value,
        afstand_km:  parseFloat(b.afstand_km.value),
        inception:   b.inception?.value?.substring(0, 4) ?? null,
        architect:   b.architectLabel?.value ?? null,
        image:       b.image?.value ?? null,
        wikipedia:   b.wikipedia_en?.value ?? b.wikipedia_nl?.value ?? null,
    }))
}

function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000
    const toRad = d => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.asin(Math.sqrt(a))
}

function parseCoord(wktPoint) {
    const [lng, lat] = wktPoint.replace('Point(', '').replace(')', '').split(' ').map(Number)
    return { lat, lng }
}

const monumentCache = new Map()
const lastFetchLocation = new Map()

function isCacheValid(userId, lat, lng) {
    const c = monumentCache.get(userId)
    if (!c) return false
    if (Date.now() - c.fetchedAt > CACHE_DURATION_MS) return false
    return haversineMeters(c.lat, c.lng, lat, lng) < FETCH_RADIUS * 500
}

async function getMonumentsForUser(userId, lat, lng) {
    if (isCacheValid(userId, lat, lng)) return monumentCache.get(userId).monuments
    const monuments = await fetchMonuments(lat, lng)
    monumentCache.set(userId, { lat, lng, monuments, fetchedAt: Date.now() })
    return monuments
}

function shouldRefetch(userId, lat, lng) {
    const last = lastFetchLocation.get(userId)
    if (!last) return true
    return haversineMeters(last.lat, last.lng, lat, lng) >= MIN_MOVE_METERS
}

async function processNarrationQueue(userId, ws) {
    const session = getSession(userId)
    if (session.isProcessing || session.queue.length === 0) return

    session.isProcessing = true
    const monument = session.queue.shift()

    console.log(`[Narration ollama] starting: "${monument.label}" for user ${userId}`)

    try {
        send(ws, { type: 'NARRATION_START', monumentId: monument.id, label: monument.label })
        const wikiIntro = await fetchWikipediaIntro(monument.wikipedia)

        const text = await generateNarration(monument, wikiIntro, session.storyMemory)
        await streamNarrationAudio(text, async (wavBuffer) => {
            if (ws.readyState === 1) ws.send(wavBuffer)
        })

        addToMemory(userId, monument.label)
        session.narratedIds.add(monument.id)

        send(ws, { type: 'NARRATION_END', monumentId: monument.id })
        console.log(`[Narration] Done: "${monument.label}"`)
    } catch (err) {
        console.error(`[Narration] Error for "${monument.label}":`, err.message)
        send(ws, { type: 'NARRATION_ERROR', monumentId: monument.id, message: err.message })
        session.narratedIds.add(monument.id)
    } finally {
        session.isProcessing = false
        if (session.queue.length > 0) processNarrationQueue(userId, ws)
    }
}

function enqueueNearbyMonuments(userId, ws, visibleMonuments) {
    const session = getSession(userId)
    if (!session.activeRoute) return
    const routeIds = new Set(session.activeRoute.monuments.map(m => m.monument_id))
    const candidates = visibleMonuments.filter(m => routeIds.has(m.id))

    for (const monument of candidates) {
        if (monument.afstand_m > NARRATE_RADIUS) continue
        if (session.narratedIds.has(monument.id)) continue
        if (session.queuedIds.has(monument.id)) continue

        session.queuedIds.add(monument.id)
        session.queue.push(monument)
        console.log(`[Queue] Added "${monument.label}" at ${monument.afstand_m}m`)
    }

    processNarrationQueue(userId, ws)
}

function send(ws, obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj))
}

const users = new Map()

wss.on('connection', (ws) => {
    let userId = null
    console.log('[WS] clientel connected')

    ws.on('message', async (raw) => {
        if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return
        let msg
        try {
            msg = JSON.parse(raw)
        } catch {
            send(ws, { type: 'ERROR', message: 'invalid JSON' })
            return
        }
        switch (msg.type) {
            case 'REGISTER':
                userId = msg.userId
                users.set(userId, { ws, lat: null, lng: null })
                console.log(`[WS] Registered: ${userId}`)
                send(ws, { type: 'REGISTERED', userId })
                send(ws, { type: 'ROUTES', routes: getAllRoutes() })
                break

            case 'LOCATION': {
                if (!userId) { send(ws, { type: 'ERROR', message: 'Register first' }); return }
                const { lat, lng } = msg
                if (typeof lat !== 'number' || typeof lng !== 'number') {
                    send(ws, { type: 'ERROR', message: 'lat and lng must be numbers' })
                    return
                }
                users.set(userId, { ws, lat, lng })
                pushLocation(userId, lat, lng)
                send(ws, { type: 'LOCATION_ACK', lat, lng, timestamp: new Date().toISOString() })
                if (!shouldRefetch(userId, lat, lng)) break
                lastFetchLocation.set(userId, { lat, lng })
                try {
                    const all = await getMonumentsForUser(userId, lat, lng)
                    const visible = all
                        .map(m => {
                            const c = parseCoord(m.coord)
                            return { ...m, afstand_m: Math.round(haversineMeters(lat, lng, c.lat, c.lng)) }
                        })
                        .filter(m => m.afstand_m <= SHOW_RADIUS)
                        .sort((a, b) => a.afstand_m - b.afstand_m)
                    send(ws, { type: 'MONUMENTS', count: visible.length, monuments: visible })
                    enqueueNearbyMonuments(userId, ws, visible)
                } catch (err) {
                    console.error('[Wikidata] Fetch failed:', err.message)
                    send(ws, { type: 'ERROR', message: 'fetching monuments has failed' })
                }
                break
            }
            case 'GET_ROUTES':
                send(ws, { type: 'ROUTES', routes: getAllRoutes() })
                break
            case 'CREATE_ROUTE': {
                const { name, monuments: routeMonuments } = msg
                if (!name || !Array.isArray(routeMonuments) || routeMonuments.length === 0) {
                    send(ws, { type: 'ERROR', message: 'invalid route data' })
                    break
                }
                const route = createRoute(name, routeMonuments)
                send(ws, { type: 'ROUTE_CREATED', route })
                console.log(`[Routes] Created: "${name}" with ${routeMonuments.length} monuments`)
                break
            }

            case 'DELETE_ROUTE':
                deleteRoute(msg.routeId)
                send(ws, { type: 'ROUTE_DELETED', routeId: msg.routeId })
                console.log(`[Routes] Deleted route ${msg.routeId}`)
                break

            case 'NARRATE_MONUMENT': {
                if (!userId) { send(ws, { type: 'ERROR', message: 'no user id' }); break }
                const { monument } = msg
                if (!monument?.id) { send(ws, { type: 'ERROR', message: 'invalid monument' }); break }
                const session = getSession(userId)
                session.queue = session.queue.filter(m => m.id !== monument.id)
                session.queuedIds.delete(monument.id)
                session.narratedIds.delete(monument.id)
                session.queue.unshift(monument)
                session.queuedIds.add(monument.id)
                processNarrationQueue(userId, ws)
                break
            }

            case 'SET_ACTIVE_ROUTE': {
                if (!userId) { send(ws, { type: 'ERROR', message: 'Register first' }); break }
                const session = getSession(userId)
                session.activeRoute = msg.routeId ? getRouteById(msg.routeId) : null

                if (session.activeRoute) {
                    const user = users.get(userId)
                    const cache = monumentCache.get(userId)
                    if (user && cache && user.lat !== null && user.lng !== null) {
                        const visible = cache.monuments
                            .map(m => {
                                const c = parseCoord(m.coord)
                                return { ...m, afstand_m: Math.round(haversineMeters(user.lat, user.lng, c.lat, c.lng)) }
                            })
                            .filter(m => m.afstand_m <= SHOW_RADIUS)
                        enqueueNearbyMonuments(userId, ws, visible)
                    }
                }
                break
            }

            default:
                send(ws, { type: 'ERROR', message: `type: ${msg.type}` })
        }
    })

    ws.on('close', () => {
        if (userId) {
            users.delete(userId)
            monumentCache.delete(userId)
            lastFetchLocation.delete(userId)
            deleteSession(userId)
            console.log(`[WS] disconnected: ${userId}`)
        }
    })

    ws.on('error', (err) => console.error('[WS] error:', err.message))
})

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] running on ${PORT}`)
    console.log(`[Server] ollama URL: ${process.env.OLLAMA_URL}`)
})
