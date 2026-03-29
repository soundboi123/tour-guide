const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b'
export async function generateNarration(monument, wikiIntro, storyMemory) {
    const memorySection = storyMemory
        ? `\nplaces you have already narrated today : ${storyMemory}\n`
        : ''

    const wikiSection = wikiIntro
        ? `\n this is the background introduction for the monument, translate to english, including the monument names!!:\n${wikiIntro.slice(0, 1500)}`
        : ''

    const prompt = `you are an amazing audiobook narrator that narrates for a listener walking on foot. \
please narrate the monument in 3 to 5 sentence as if the listener is looking at the monument. \
speak to the listener, make it historically correct but captivating, do not hallucinate. \
talk in prose, no special dashes or bullet points or anything that is out of line in a story. Write in English. \
Translate the landmarks to English aswell. DO NOT USE ANY DASHES!! please, i beg you \ 
${memorySection}
Landmark: ${monument.label}${monument.description ? `\nDescription: ${monument.description}` : ''}${monument.inception ? `\nBuilt: ${monument.inception}` : ''}${monument.architect ? `\nArchitect: ${monument.architect}` : ''}${wikiSection}

Narration:`

    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt, stream: true }),
        signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) throw new Error(`Ollama response: ${res.status}. is Ollama running? (${OLLAMA_URL})`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value, { stream: true }).split('\n').filter(Boolean)
        for (const line of lines) {
            try {
                const obj = JSON.parse(line)
                if (obj.response) fullText += obj.response
            } catch {}
        }
    }

    return fullText.trim()
}
