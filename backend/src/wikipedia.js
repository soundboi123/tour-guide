
export async function fetchWikipediaIntro(wikipediaUrl) {
    if (!wikipediaUrl) return null

    try {
        const urlObj = new URL(wikipediaUrl)
        const host = urlObj.host
        const title = decodeURIComponent(urlObj.pathname.split('/wiki/').pop() ?? '')
        if (!title) return null

        const apiUrl = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        const res = await fetch(apiUrl, {
            headers: { 'User-Agent': 'ARTourGuide/1.0' },
            signal: AbortSignal.timeout(8000),
        })

        if (!res.ok) return null
        const data = await res.json()
        return data.extract ?? null
    } catch {
        return null
    }
}
