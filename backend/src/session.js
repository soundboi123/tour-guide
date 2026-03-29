
const sessions = new Map()

export function getSession(userId) {
    if (!sessions.has(userId)) {
        sessions.set(userId, {
            narratedIds: new Set(),
            queuedIds: new Set(),
            storyMemory: '',
            queue: [],
            isProcessing: false,
            locationHistory: [],
            activeRoute: null,
        })
    }
    return sessions.get(userId)
}

export function deleteSession(userId) {
    sessions.delete(userId)
}

export function pushLocation(userId, lat, lng) {
    const s = getSession(userId)
    s.locationHistory.push({ lat, lng, t: Date.now() })
    if (s.locationHistory.length > 6) s.locationHistory.shift()
}

export function getHeading(userId) {
    const s = getSession(userId)
    const h = s.locationHistory
    if (h.length < 2) return null
    const a = h[h.length - 2]
    const b = h[h.length - 1]
    const dLng = b.lng - a.lng
    const dLat = b.lat - a.lat
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7) return null
    return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
}


export function addToMemory(userId, label) {
    const s = getSession(userId)
    s.storyMemory = s.storyMemory ? `${s.storyMemory}, ${label}` : label
    if (s.storyMemory.length > 600) {
        const parts = s.storyMemory.split(', ')
        s.storyMemory = parts.slice(-8).join(', ')
    }
}
