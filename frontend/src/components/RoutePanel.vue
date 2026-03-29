<script setup lang="ts">
import { ref, watch } from 'vue'
import { gsap } from 'gsap'

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

interface Monument {
  id: string
  label: string
  coord: string
  afstand_m: number
}

const props = defineProps<{
  show: boolean
  routes: Route[]
  activeRoute: Route | null
  isCreating: boolean
  selectedMonuments: Monument[]
}>()

const emit = defineEmits<{
  activate: [route: Route]
  deactivate: []
  delete: [routeId: number]
  startCreating: []
  cancelCreating: []
  save: [name: string]
  removeMonument: [index: number]
}>()

const panel = ref<HTMLDivElement | null>(null)
const newRouteName = ref('')

watch(
  () => props.show,
  (visible) => {
    if (!panel.value) return
    if (visible) {
      gsap.fromTo(
        panel.value,
        { y: '100%', opacity: 0 },
        {
          y: '0%',
          opacity: 1,
          duration: 0.4,
          ease: 'power3.out',
          onComplete() {
            gsap.fromTo(
              '.route-item',
              { opacity: 0, x: -16 },
              { opacity: 1, x: 0, duration: 0.25, stagger: 0.07, ease: 'power2.out' },
            )
          },
        },
      )
    } else {
      gsap.to(panel.value, { y: '100%', opacity: 0, duration: 0.3, ease: 'power2.in' })
    }
  },
)

function handleSave() {
  if (!newRouteName.value.trim()) return
  emit('save', newRouteName.value)
  newRouteName.value = ''
}
</script>

<template>
  <div v-show="show" ref="panel" class="route-panel">
    <template v-if="isCreating">
      <div class="route-panel-header">
        <h2>New Route</h2>
        <button class="panel-icon-btn" @click="emit('cancelCreating')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="monument-list">
        <p v-if="selectedMonuments.length === 0" class="empty-hint">
          click on monuments on the map to add them
        </p>
        <div v-for="(m, i) in selectedMonuments" :key="m.id" class="monument-item">
          <span class="monument-item-index">{{ i + 1 }}</span>
          <span class="monument-item-label">{{ m.label }}</span>
          <button class="panel-icon-btn panel-icon-btn-sm" @click="emit('removeMonument', i)">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="route-panel-footer">
        <input
          v-model="newRouteName"
          class="route-name-input"
          placeholder="Route name..."
          @keyup.enter="handleSave"
        />
        <button
          class="btn btn-primary"
          :disabled="!newRouteName.trim() || selectedMonuments.length < 2"
          @click="handleSave"
        >
          Save
        </button>
      </div>
    </template>
    <template v-else>
      <div class="route-panel-header">
        <h2>Routes</h2>
        <button class="btn btn-primary btn-sm" @click="emit('startCreating')">
          <i class="fa-solid fa-plus"></i> New
        </button>
      </div>
      <div class="route-list">
        <p v-if="routes.length === 0" class="empty-hint">
          No routes yet. Tap <strong>New</strong> to create one.
        </p>
        <div
          v-for="route in routes"
          :key="route.id"
          class="route-item"
          :class="{ 'route-item-active': activeRoute?.id === route.id }"
        >
          <div class="route-item-info">
            <span class="route-item-name">{{ route.name }}</span>
            <span class="route-item-meta">{{ route.monuments.length }} stops</span>
          </div>
          <div class="route-item-actions">
            <button
              v-if="activeRoute?.id === route.id"
              class="btn btn-stop"
              @click="emit('deactivate')"
            >
              <i class="fa-solid fa-stop"></i>
            </button>
            <button v-else class="btn btn-go" @click="emit('activate', route)">
              <i class="fa-solid fa-play"></i>
            </button>
            <button class="btn btn-delete" @click="emit('delete', route.id)">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.route-panel {
  position: fixed;
  bottom: 4.5rem;
  left: 0;
  right: 0;
  background: oklch(0.06 0 0 / 0.96);
  border-radius: 1.5rem 1.5rem 0 0;
  padding: 1.25rem 1.25rem 1rem;
  z-index: 200;
  backdrop-filter: blur(14px);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  box-shadow: 0 -4px 32px oklch(0 0 0 / 0.5);
  color: oklch(1 0 0);
  transform: translateY(100%);
}

.route-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.route-panel-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.route-panel-footer {
  display: flex;
  gap: 0.75rem;
  flex-shrink: 0;
}


.route-list,
.monument-list {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty-hint {
  color: oklch(0.37 0 0);
  font-size: 0.85rem;
  text-align: center;
  padding: 1rem 0;
}

.route-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.875rem;
  border-radius: 0.875rem;
  background: oklch(1 0 0 / 0.04);
  border: 1px solid oklch(1 0 0 / 0.07);
  transition: border-color 0.25s;
}

.route-item-active {
  border-color: oklch(0.77 0.09 215 / 0.6);
  background: oklch(0.77 0.09 215 / 0.07);
}

.route-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.route-item-name {
  font-size: 0.95rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.route-item-meta {
  font-size: 0.75rem;
  color: oklch(0.44 0 0);
}

.route-item-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
  margin-left: 0.75rem;
}

.monument-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  background: oklch(1 0 0 / 0.04);
}

.monument-item-index {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: oklch(0.68 0.15 142);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.monument-item-label {
  flex: 1;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.route-name-input {
  flex: 1;
  background: oklch(1 0 0 / 0.07);
  border: 1px solid oklch(1 0 0 / 0.1);
  border-radius: 0.75rem;
  padding: 0.6rem 0.9rem;
  color: oklch(1 0 0);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.route-name-input::placeholder {
  color: oklch(0.37 0 0);
}

.route-name-input:focus {
  border-color: oklch(0.77 0.09 215);
}

.panel-icon-btn {
  background: none;
  border: none;
  color: oklch(0.44 0 0);
  cursor: pointer;
  padding: 0.3rem;
  font-size: 1rem;
  transition: color 0.15s;
}

.panel-icon-btn:hover {
  color: oklch(0.83 0 0);
}

.panel-icon-btn-sm {
  font-size: 0.85rem;
}

.btn {
  border: none;
  cursor: pointer;
  border-radius: 0.6rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.85rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  transition: opacity 0.15s;
}

.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-primary {
  background: oklch(0.77 0.09 215);
  color: oklch(0 0 0);
}

.btn-sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}

.btn-go {
  background: oklch(0.77 0.09 215 / 0.18);
  color: oklch(0.77 0.09 215);
  padding: 0.45rem 0.7rem;
}

.btn-stop {
  background: oklch(0.76 0.18 62 / 0.18);
  color: oklch(0.76 0.18 62);
  padding: 0.45rem 0.7rem;
}

.btn-delete {
  background: oklch(0.63 0.22 29 / 0.12);
  color: oklch(0.63 0.22 29);
  padding: 0.45rem 0.7rem;
}
</style>
