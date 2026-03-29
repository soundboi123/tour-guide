<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

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

const props = defineProps<{
  monuments: Monument[]
  userLat: number | null
  userLng: number | null
}>()

const emit = defineEmits<{
  close: []
  narrate: [monument: Monument]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const heading = ref(0)
const compassAvailable = ref(true)
let stream: MediaStream | null = null

// Half of the horizontal field of view in degrees (~phone camera FOV)
const FOV_HALF = 35

// Monuments within 50m only
const AR_RADIUS = 10000

function toRad(d: number) {
  return (d * Math.PI) / 180
}

function bearingTo(mLat: number, mLng: number): number {
  const lat1 = toRad(props.userLat!)
  const lat2 = toRad(mLat)
  const dLng = toRad(mLng - props.userLng!)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360
}

function angleDiff(bearing: number): number {
  let d = bearing - heading.value
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

const visibleMonuments = computed(() => {
  if (props.userLat === null || props.userLng === null) return []
  return props.monuments
    .filter((m) => m.afstand_m <= AR_RADIUS)
    .map((m) => {
      const parts = m.coord.replace('Point(', '').replace(')', '').split(' ')
      const mLng = parseFloat(parts[0] ?? '0')
      const mLat = parseFloat(parts[1] ?? '0')
      const diff = angleDiff(bearingTo(mLat, mLng))
      return { ...m, diff }
    })
    .filter((m) => Math.abs(m.diff) <= FOV_HALF)
    .sort((a, b) => a.afstand_m - b.afstand_m)
    .slice(0, 5)
})

function leftPct(diff: number): string {
  const pct = 50 + (diff / FOV_HALF) * 50
  return `${Math.max(8, Math.min(92, pct))}%`
}

// Closer monuments appear lower on screen (top: 65%), farther appear higher (top: 20%)
function topPct(afstand_m: number): string {
  const pct = 65 - (afstand_m / AR_RADIUS) * 45
  return `${Math.max(15, Math.min(65, pct))}%`
}

function formatDist(m: number): string {
  return `${m} m`
}

// Truncate description to ~100 chars
function shortDesc(desc: string | null): string {
  if (!desc) return ''
  return desc.length > 100 ? desc.slice(0, 98) + '…' : desc
}

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number }

function onOrientation(e: OrientationEvent) {
  // iOS uses webkitCompassHeading (0 = north, clockwise)
  if (typeof e.webkitCompassHeading === 'number') {
    heading.value = e.webkitCompassHeading
  } else if (e.alpha !== null) {
    // Android absolute orientation: convert to compass heading
    heading.value = (360 - (e.alpha ?? 0)) % 360
  }
}

onMounted(async () => {
  // Start rear camera
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    if (videoRef.value) {
      videoRef.value.srcObject = stream
    }
  } catch {
    // Camera permission denied — video stays black
  }

  // iOS 13+ requires explicit permission for DeviceOrientationEvent
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const result = await DOE.requestPermission()
      if (result !== 'granted') compassAvailable.value = false
    } catch {
      compassAvailable.value = false
    }
  }

  // Prefer absolute orientation (Android); fall back to relative (iOS uses webkit above)
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener, true)
  window.addEventListener('deviceorientation', onOrientation as EventListener)
})

onUnmounted(() => {
  stream?.getTracks().forEach((t) => t.stop())
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener, true)
  window.removeEventListener('deviceorientation', onOrientation as EventListener)
})
</script>

<template>
  <div class="ar-view">
    <video ref="videoRef" class="ar-camera" autoplay playsinline muted></video>

    <!-- Close -->
    <button class="ar-close" @click="emit('close')">
      <i class="fa-solid fa-xmark"></i>
    </button>

    <!-- Compass unavailable hint -->
    <div v-if="!compassAvailable" class="ar-hint">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Compass unavailable — move your phone to calibrate
    </div>

    <!-- No nearby monuments hint -->
    <div v-else-if="monuments.filter(m => m.afstand_m <= 50).length === 0" class="ar-hint">
      <i class="fa-solid fa-magnifying-glass"></i>
      No monuments within 50 m
    </div>

    <!-- Monument labels -->
    <TransitionGroup name="ar-pop">
      <div
        v-for="m in visibleMonuments"
        :key="m.id"
        class="ar-label"
        :style="{
          left: leftPct(m.diff),
          top: topPct(m.afstand_m),
        }"
      >
        <div class="ar-label-card">
          <span class="ar-label-name">{{ m.label }}</span>
          <p v-if="m.description" class="ar-label-desc">{{ shortDesc(m.description) }}</p>
          <div class="ar-label-footer">
            <span class="ar-label-dist">
              <i class="fa-solid fa-location-dot"></i>
              {{ formatDist(m.afstand_m) }}
            </span>
            <button class="ar-label-narrate" @click.stop="emit('narrate', m)">
              <i class="fa-solid fa-headphones"></i>
            </button>
          </div>
        </div>

      </div>
    </TransitionGroup>

    <!-- Crosshair -->
    <div class="ar-crosshair">
      <div class="ar-crosshair-h"></div>
      <div class="ar-crosshair-v"></div>
    </div>
  </div>
</template>

<style scoped>
.ar-view {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: oklch(0 0 0);
  overflow: hidden;
}

.ar-camera {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ── Close button ── */
.ar-close {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  background: oklch(0 0 0 / 0.55);
  border: none;
  color: oklch(1 0 0);
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 50%;
  font-size: 1.1rem;
  cursor: pointer;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

/* ── Hints ── */
.ar-hint {
  position: absolute;
  bottom: 7rem;
  left: 50%;
  transform: translateX(-50%);
  background: oklch(0 0 0 / 0.65);
  color: oklch(1 0 0);
  padding: 0.6rem 1.1rem;
  border-radius: 2rem;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  backdrop-filter: blur(6px);
}

/* ── Monument label ── */
.ar-label {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
  transform-origin: bottom center;
  pointer-events: none;
}

.ar-label-card {
  background: oklch(0.04 0 0 / 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid oklch(1 0 0 / 0.14);
  border-radius: 1.1rem;
  padding: 0.65rem 0.95rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-width: 210px;
  pointer-events: all;
}

.ar-label-name {
  color: oklch(1 0 0);
  font-size: 0.95rem;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 190px;
}

.ar-label-desc {
  color: oklch(1 0 0 / 0.65);
  font-size: 0.72rem;
  line-height: 1.35;
  margin: 0;
  text-align: center;
}

.ar-label-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-top: 0.1rem;
}

.ar-label-dist {
  color: oklch(0.77 0.09 215);
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.ar-label-narrate {
  background: oklch(0.77 0.09 215 / 0.18);
  border: 1px solid oklch(0.77 0.09 215 / 0.35);
  color: oklch(0.77 0.09 215);
  border-radius: 50%;
  width: 1.8rem;
  height: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}

.ar-label-narrate:hover,
.ar-label-narrate:active {
  background: oklch(0.77 0.09 215 / 0.35);
}


/* ── Crosshair ── */
.ar-crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  pointer-events: none;
  opacity: 0.35;
}

.ar-crosshair-h {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: oklch(1 0 0);
}

.ar-crosshair-v {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: oklch(1 0 0);
}

/* ── Transition ── */
.ar-pop-enter-active,
.ar-pop-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.ar-pop-enter-from,
.ar-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.8);
}
</style>
