<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { fromLonLat } from 'ol/proj'
import { Feature } from 'ol'
import { Point } from 'ol/geom'
import LineString from 'ol/geom/LineString'
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from 'ol/style'
import VectorSource from 'ol/source/Vector'
import VectorLayer from 'ol/layer/Vector'
import { defaults as defaultControls, Zoom } from 'ol/control'
import { gsap } from 'gsap'
import RoutePanel from '@/components/RoutePanel.vue'
import ARView from '@/components/ARView.vue'

interface Monument {
  id: string
  label: string
  description: string | null
  coord: string
  afstand_m: number
  inception: string | null
  image: string | null
  wikipedia: string | null
}

interface RouteMonument {
  id: number
  route_id: number
  monument_id: string
  monument_label: string
  monument_coord: string
  position: number
}

interface Route {
  id: number
  name: string
  created_at: string
  monuments: RouteMonument[]
}
const lat = ref<number | null>(null)
const lng = ref<number | null>(null)
const mapContainer = ref<HTMLDivElement | null>(null)
const monuments = ref<Monument[]>([])
let map: Map | null = null

const markerFeature = new Feature({ geometry: new Point(fromLonLat([0, 0])) })
markerFeature.setStyle(
  new Style({
    image: new CircleStyle({
      radius: 8,
      fill: new Fill({ color: 'oklch(0.63 0.22 29)' }),
      stroke: new Stroke({ color: 'oklch(1 0 0)', width: 2 }),
    }),
  }),
)

const markerLayer = new VectorLayer({
  source: new VectorSource({ features: [markerFeature] }),
  zIndex: 10,
})
const monumentSource = new VectorSource()
const monumentLayer = new VectorLayer({ source: monumentSource, zIndex: 5 })
const routeSource = new VectorSource()
const routeLayer = new VectorLayer({ source: routeSource, zIndex: 4 })

function monumentStyle(label: string, active = false) {
  return new Style({
    image: new CircleStyle({
      radius: active ? 13 : 10,
      fill: new Fill({ color: active ? 'oklch(0.76 0.18 62)' : 'oklch(0.82 0.14 88)' }),
      stroke: new Stroke({ color: 'oklch(0 0 0)', width: active ? 2.5 : 1.5 }),
    }),
    text: new Text({
      text: label.length > 20 ? label.slice(0, 18) + '…' : label,
      offsetY: -22,
      font: active ? 'bold 13px sans-serif' : '12px sans-serif',
      fill: new Fill({ color: 'oklch(1 0 0)' }),
      stroke: new Stroke({ color: 'oklch(0 0 0)', width: 3 }),
    }),
  })
}

function routeMonumentStyle(label: string, active = false) {
  return new Style({
    image: new CircleStyle({
      radius: active ? 13 : 10,
      fill: new Fill({ color: active ? 'oklch(0.76 0.18 62)' : 'oklch(0.77 0.09 215)' }),
      stroke: new Stroke({ color: 'oklch(1 0 0)', width: active ? 2.5 : 1.5 }),
    }),
    text: new Text({
      text: label.length > 20 ? label.slice(0, 18) + '…' : label,
      offsetY: -22,
      font: '12px sans-serif',
      fill: new Fill({ color: 'oklch(1 0 0)' }),
      stroke: new Stroke({ color: 'oklch(0 0 0)', width: 3 }),
    }),
  })
}

function dimmedMonumentStyle(label: string) {
  return new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: 'oklch(0.37 0 0)' }),
      stroke: new Stroke({ color: 'oklch(0.22 0 0)', width: 1 }),
    }),
    text: new Text({
      text: label.length > 20 ? label.slice(0, 18) + '…' : label,
      offsetY: -20,
      font: '11px sans-serif',
      fill: new Fill({ color: 'oklch(0.57 0 0)' }),
      stroke: new Stroke({ color: 'oklch(0 0 0)', width: 2 }),
    }),
  })
}

function selectedForRouteStyle(_label: string, index: number) {
  return new Style({
    image: new CircleStyle({
      radius: 13,
      fill: new Fill({ color: 'oklch(0.68 0.15 142)' }),
      stroke: new Stroke({ color: 'oklch(1 0 0)', width: 2 }),
    }),
    text: new Text({
      text: String(index),
      font: 'bold 13px sans-serif',
      fill: new Fill({ color: 'oklch(1 0 0)' }),
    }),
  })
}

function getMonumentStyle(monument: Monument, isActive = false) {
  if (isActive) return monumentStyle(monument.label, true)

  if (isCreatingRoute.value) {
    const selIndex = selectedMonuments.value.findIndex((m) => m.id === monument.id)
    if (selIndex >= 0) return selectedForRouteStyle(monument.label, selIndex + 1)
    return monumentStyle(monument.label, false)
  }

  if (activeRoute.value) {
    const onRoute = activeRoute.value.monuments.some((m) => m.monument_id === monument.id)
    if (!onRoute) return dimmedMonumentStyle(monument.label)
    return routeMonumentStyle(monument.label, false)
  }

  return monumentStyle(monument.label, false)
}

function updateMonumentMarkers(data: Monument[]) {
  monumentSource.clear()
  data.forEach((monument) => {
    const parts = monument.coord.replace('Point(', '').replace(')', '').split(' ')
    const mLng = parseFloat(parts[0] ?? '0')
    const mLat = parseFloat(parts[1] ?? '0')
    const feature = new Feature({
      geometry: new Point(fromLonLat([mLng, mLat])),
      monument,
    })
    feature.setStyle(getMonumentStyle(monument))
    monumentSource.addFeature(feature)
  })
}

function setActiveMarker(monumentId: string | null) {
  monumentSource.getFeatures().forEach((f) => {
    const m = f.get('monument') as Monument
    f.setStyle(getMonumentStyle(m, m.id === monumentId))
  })
}

async function animateRouteLine(route: Route) {
  routeSource.clear()
  if (route.monuments.length < 2) return

  const waypoints = route.monuments.map((m) => {
    const parts = m.monument_coord.replace('Point(', '').replace(')', '').split(' ')
    return [parseFloat(parts[0] ?? '0'), parseFloat(parts[1] ?? '0')] as [number, number]
  })

  let routeCoords: number[][]
  try {
    const coordStr = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/foot/${coordStr}?overview=full&geometries=geojson`,
    )
    const data = await res.json()
    const geometry: number[][] = data.routes[0].geometry.coordinates
    routeCoords = geometry.map(([lng, lat]) => fromLonLat([lng!, lat!]))
  } catch  {
    routeCoords = waypoints.map(([lng, lat]) => fromLonLat([lng, lat]))
  }

  const lineFeature = new Feature({
    geometry: new LineString([routeCoords[0]!, routeCoords[0]!]),
  })
  lineFeature.setStyle(new Style({ stroke: new Stroke({ color: 'oklch(0.77 0.09 215)', width: 4 }) }))
  routeSource.addFeature(lineFeature)

  const progress = { value: 0 }
  gsap.to(progress, {
    value: 1,
    duration: Math.min(Math.max(1.5, routeCoords.length / 80), 4),
    ease: 'power2.out',
    onUpdate() {
      const count = Math.max(2, Math.round(progress.value * routeCoords.length))
      ;(lineFeature.getGeometry() as LineString).setCoordinates(routeCoords.slice(0, count))
    },
  })
}
const routes = ref<Route[]>([])
const activeRoute = ref<Route | null>(null)
const showRoutesPanel = ref(false)
const showAR = ref(false)
const isCreatingRoute = ref(false)
const selectedMonuments = ref<Monument[]>([])

function activateRoute(route: Route) {
  unlockAudio()
  activeRoute.value = route
  ws.send(JSON.stringify({ type: 'SET_ACTIVE_ROUTE', routeId: route.id }))
  animateRouteLine(route)
  updateMonumentMarkers(monuments.value)
  showRoutesPanel.value = false
  if (isPaused.value) {
    audioCtx?.resume()
    isPaused.value = false
  }
  startBackgroundMusic()
}

function deactivateRoute() {
  activeRoute.value = null
  ws.send(JSON.stringify({ type: 'SET_ACTIVE_ROUTE', routeId: null }))
  routeSource.clear()
  updateMonumentMarkers(monuments.value)
  bgAudio.pause()
  bgAudio.currentTime = 0
}

function startCreatingRoute() {
  isCreatingRoute.value = true
  selectedMonuments.value = []
  updateMonumentMarkers(monuments.value)
}

function cancelCreatingRoute() {
  isCreatingRoute.value = false
  selectedMonuments.value = []
  updateMonumentMarkers(monuments.value)
}

function toggleMonumentSelection(monument: Monument) {
  const idx = selectedMonuments.value.findIndex((m) => m.id === monument.id)
  if (idx >= 0) {
    selectedMonuments.value.splice(idx, 1)
  } else {
    selectedMonuments.value.push(monument)
  }
  updateMonumentMarkers(monuments.value)
}

function removeSelectedMonument(i: number) {
  selectedMonuments.value.splice(i, 1)
  updateMonumentMarkers(monuments.value)
}

function saveRoute(name: string) {
  if (!name.trim() || selectedMonuments.value.length === 0) return
  ws.send(
    JSON.stringify({
      type: 'CREATE_ROUTE',
      name: name.trim(),
      monuments: selectedMonuments.value.map((m) => ({ id: m.id, label: m.label, coord: m.coord })),
    }),
  )
  isCreatingRoute.value = false
  selectedMonuments.value = []
  updateMonumentMarkers(monuments.value)
}

function deleteRoute(routeId: number) {
  if (activeRoute.value?.id === routeId) deactivateRoute()
  ws.send(JSON.stringify({ type: 'DELETE_ROUTE', routeId }))
}

function exitExploreMode() {
  showRoutesPanel.value = false
  if (isCreatingRoute.value) cancelCreatingRoute()
}

function narrateMonument(monument: Monument) {
  ws.send(JSON.stringify({ type: 'NARRATE_MONUMENT', monument }))
}

function getOrCreateUserId(): string {
  const stored = localStorage.getItem('ar_tour_user_id')
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem('ar_tour_user_id', id)
  return id
}

type PlayItem =
  | { kind: 'audio'; raw: ArrayBuffer }
  | { kind: 'start'; label: string; monumentId: string }
  | { kind: 'end'; monumentId: string }

let audioCtx: AudioContext | null = null
const playQueue: PlayItem[] = []
let isPlaying = false
let isDucked = false

const audioUnlocked = ref(false)
const nowPlaying = ref<string | null>(null)
const activeMonumentId = ref<string | null>(null)
const musicMuted = ref(false)

const bgAudio = new Audio('/soundtrack.mp3')
bgAudio.loop = true

let bgGain: GainNode | null = null
const MUSIC_VOLUME = 0.45
const DUCK_VOLUME = 0.07

function startBackgroundMusic() {
  if (!audioCtx || bgGain) return
  try {
    const source = audioCtx.createMediaElementSource(bgAudio)
    bgGain = audioCtx.createGain()
    bgGain.gain.value = MUSIC_VOLUME
    source.connect(bgGain)
    bgGain.connect(audioCtx.destination)
    bgAudio.play().catch(() => {})
  } catch {
  }
}

function duckMusic() {
  if (!bgGain || !audioCtx) return
  bgGain.gain.linearRampToValueAtTime(DUCK_VOLUME, audioCtx.currentTime + 2.0)
}

function unduckMusic() {
  if (!bgGain || !audioCtx) return
  bgGain.gain.linearRampToValueAtTime(
    musicMuted.value ? 0 : MUSIC_VOLUME,
    audioCtx.currentTime + 1.5,
  )
}

function toggleMusicMute() {
  musicMuted.value = !musicMuted.value
  if (!bgGain || !audioCtx) return
  bgGain.gain.linearRampToValueAtTime(
    musicMuted.value ? 0 : MUSIC_VOLUME,
    audioCtx.currentTime + 0.4,
  )
}

const isPaused = ref(false)

function unlockAudio() {
  if (audioUnlocked.value) return
  audioCtx = new AudioContext()
  audioCtx.resume()
  audioUnlocked.value = true
}

function togglePause() {
  if (!audioCtx) return
  if (isPaused.value) {
    audioCtx.resume()
    if (bgGain) bgAudio.play().catch(() => {})
    isPaused.value = false
  } else {
    audioCtx.suspend()
    bgAudio.pause()
    isPaused.value = true
  }
}

async function playNext() {
  if (playQueue.length === 0) {
    isPlaying = false
    return
  }
  isPlaying = true
  const item = playQueue.shift()!

  if (item.kind === 'start') {
    nowPlaying.value = item.label
    activeMonumentId.value = item.monumentId
    setActiveMarker(item.monumentId)
    playNext()
  } else if (item.kind === 'end') {
    nowPlaying.value = null
    activeMonumentId.value = null
    setActiveMarker(null)
    isDucked = false
    unduckMusic()
    playNext()
  } else {
    if (!audioCtx) {
      isPlaying = false
      return
    }
    try {
      const audioBuffer = await audioCtx.decodeAudioData(item.raw)
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioCtx.destination)
      source.onended = () => playNext()
      if (!isDucked) {
        isDucked = true
        duckMusic()
      }
      source.start()
    } catch {
      playNext()
    }
  }
}

const msgQueue: (() => Promise<void>)[] = []
let drainingMsgs = false

async function drainMsgQueue() {
  if (drainingMsgs) return
  drainingMsgs = true
  while (msgQueue.length) await msgQueue.shift()!()
  drainingMsgs = false
}

const ws = new WebSocket(
  import.meta.env.VITE_WS_URL ?? 'https://lunch-backup-fioricet-boat.trycloudflare.com/',
)
let watcherId: number | null = null

ws.binaryType = 'blob'

ws.onmessage = (event) => {
  msgQueue.push(async () => {
    if (event.data instanceof Blob) {
      const raw = await event.data.arrayBuffer()
      playQueue.push({ kind: 'audio', raw })
      if (!isPlaying) playNext()
      return
    }

    const msg = JSON.parse(event.data as string)

    switch (msg.type) {
      case 'MONUMENTS':
        monuments.value = msg.monuments
        updateMonumentMarkers(msg.monuments)
        break

      case 'NARRATION_START':
        playQueue.push({ kind: 'start', label: msg.label, monumentId: msg.monumentId })
        if (!isPlaying) playNext()
        break

      case 'NARRATION_END':
        playQueue.push({ kind: 'end', monumentId: msg.monumentId })
        if (!isPlaying) playNext()
        break

      case 'NARRATION_ERROR':
        console.error('Narration error:', msg.message)
        nowPlaying.value = null
        activeMonumentId.value = null
        setActiveMarker(null)
        break

      case 'ROUTES':
        routes.value = msg.routes
        break

      case 'ROUTE_CREATED':
        routes.value.unshift(msg.route)
        break

      case 'ROUTE_DELETED':
        routes.value = routes.value.filter((r) => r.id !== msg.routeId)
        break

      case 'ERROR':
        console.error('Server error:', msg.message)
        break
    }
  })
  drainMsgQueue()
}

onMounted(async () => {
  await nextTick()
  map = new Map({
    target: mapContainer.value!,
    controls: defaultControls({ attribution: false, zoom: false, rotate: false }).extend([
      new Zoom({ className: 'custom-zoom' }),
    ]),
    layers: [
      new TileLayer({ source: new OSM({ attributions: [] }) }),
      routeLayer,
      monumentLayer,
      markerLayer,
    ],
    view: new View({ center: fromLonLat([0, 0]), zoom: 15 }),
  })

  map.on('click', (event) => {
    if (!isCreatingRoute.value) return
    const feature = map!.forEachFeatureAtPixel(event.pixel, (f) => f)
    if (!feature) return
    const monument = feature.get('monument') as Monument | undefined
    if (!monument) return
    toggleMonumentSelection(monument)
  })

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'REGISTER', userId: getOrCreateUserId() }))

    watcherId = navigator.geolocation.watchPosition(
      (pos) => {
        lat.value = pos.coords.latitude
        lng.value = pos.coords.longitude
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'LOCATION', lat: lat.value, lng: lng.value }))
        }
      },
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    )
  }
})

watch([lat, lng], ([newLat, newLng]) => {
  if (map && newLat !== null && newLng !== null) {
    const coords = fromLonLat([newLng, newLat])
    markerFeature.getGeometry()?.setCoordinates(coords)
    map.getView().animate({ center: coords, duration: 500 })
  }
})

onUnmounted(() => {
  if (watcherId !== null) navigator.geolocation.clearWatch(watcherId)
  ws.close()
})
</script>

<template>
  <main @click="unlockAudio" @touchstart="unlockAudio">
    <div ref="mapContainer" class="map-container"></div>
    <Transition name="slide-down">
      <div v-if="activeRoute" class="active-route-badge">
        <i class="fa-solid fa-route"></i>
        <span>{{ activeRoute.name }}</span>
        <button class="active-route-badge-close" @click.stop="deactivateRoute">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </Transition>
    <Transition name="slide-up">
      <div v-if="nowPlaying" class="now-playing">
        <i class="fa-solid fa-circle-play now-playing-icon"></i>
        <div class="now-playing-text">
          <span class="now-playing-label">Now narrating</span>
          <span class="now-playing-title">{{ nowPlaying }}</span>
        </div>
        <button class="now-playing-pause" @click.stop="togglePause">
          <i :class="isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause'"></i>
        </button>
      </div>
    </Transition>
    <Transition name="slide-up">
      <div v-if="isCreatingRoute && !showRoutesPanel" class="create-hint">
        <i class="fa-solid fa-hand-pointer"></i>
        <span>click monuments on the map to add them to your route</span>
      </div>
    </Transition>

    <div class="navbar">
      <button
        :class="{ active: !showRoutesPanel && !isCreatingRoute }"
        @click.stop="exitExploreMode"
      >
        <i class="fa-solid fa-person-walking"></i>
      </button>
      <button :class="{ active: showRoutesPanel }" @click.stop="showRoutesPanel = !showRoutesPanel">
        <i class="fa-solid fa-route"></i>
      </button>
      <button @click.stop="showAR = true">
        <i class="fa-solid fa-camera"></i>
      </button>
      <button @click.stop="toggleMusicMute">
        <i :class="musicMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-music'"></i>
      </button>
    </div>

    <Transition name="fade">
      <ARView
        v-if="showAR"
        :monuments="monuments"
        :user-lat="lat"
        :user-lng="lng"
        @close="showAR = false"
        @narrate="narrateMonument"
      />
    </Transition>

    <RoutePanel
      :show="showRoutesPanel"
      :routes="routes"
      :active-route="activeRoute"
      :is-creating="isCreatingRoute"
      :selected-monuments="selectedMonuments"
      @activate="activateRoute"
      @deactivate="deactivateRoute"
      @delete="deleteRoute"
      @start-creating="startCreatingRoute"
      @cancel-creating="cancelCreatingRoute"
      @save="saveRoute"
      @remove-monument="removeSelectedMonument"
    />
  </main>
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 100vh;
}
/**
.audio-unlock {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background: oklch(0 0 0 / 0.72);
  color: oklch(1 0 0);
  padding: 0.6rem 1.2rem;
  border-radius: 2rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
  backdrop-filter: blur(6px);
  z-index: 100;
  pointer-events: none;
  white-space: nowrap;
}
*/
.active-route-badge {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background: oklch(0.09 0 0 / 0.88);
  color: oklch(1 0 0);
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.9rem;
  backdrop-filter: blur(8px);
  z-index: 100;
  white-space: nowrap;
}

.active-route-badge i:first-child {
  color: oklch(0.77 0.09 215);
}

.active-route-badge-close {
  background: none;
  border: none;
  color: oklch(0.70 0 0);
  cursor: pointer;
  padding: 0;
  margin-left: 0.25rem;
  font-size: 0.9rem;
}

.now-playing {
  position: fixed;
  bottom: 5.5rem;
  left: 1rem;
  right: 1rem;
  background: oklch(0.09 0 0 / 0.88);
  color: oklch(1 0 0);
  border-radius: 1rem;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  backdrop-filter: blur(8px);
  z-index: 100;
  box-shadow: 0 4px 20px oklch(0 0 0 / 0.35);
}

.now-playing-icon {
  font-size: 1.6rem;
  color: oklch(0.76 0.18 62);
  flex-shrink: 0;
  animation: pulse 1.4s ease-in-out infinite;
}

.now-playing-pause {
  background: oklch(1 0 0 / 0.1);
  border: none;
  color: oklch(1 0 0);
  cursor: pointer;
  border-radius: 50%;
  width: 2.2rem;
  height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: auto;
  font-size: 0.9rem;
  transition: background 0.15s;
}

.now-playing-pause:hover {
  background: oklch(1 0 0 / 0.2);
}

.now-playing-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.now-playing-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.6;
}

.now-playing-title {
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.create-hint {
  position: fixed;
  bottom: 5.5rem;
  left: 1rem;
  right: 1rem;
  background: oklch(0.77 0.09 215 / 0.12);
  border: 1px solid oklch(0.77 0.09 215 / 0.35);
  color: oklch(1 0 0);
  border-radius: 1rem;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  backdrop-filter: blur(8px);
  z-index: 100;
  font-size: 0.85rem;
}

.create-hint i {
  color: oklch(0.77 0.09 215);
  flex-shrink: 0;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(1rem);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-1rem);
}
</style>
