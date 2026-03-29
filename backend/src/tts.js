const TTS_URL  = process.env.TTS_URL  || 'http://localhost:5050/tts'
const TTS_VOICE = process.env.KOKORO_VOICE || 'bm_lewis'
function splitSentences(text) {
    return text.match(/[^.!?]*[.!?]+[\s]*/g)?.map(s => s.trim()).filter(Boolean) ?? [text]
}

async function synthesizeSentence(text) {
    const res = await fetch(TTS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, voice: TTS_VOICE, speed: 1.0 }),
        signal:  AbortSignal.timeout(30000),
    })

    if (!res.ok) {
        console.error(`[TTS] Server error ${res.status} for: "${text.slice(0, 40)}"`)
        return null
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
}


function makeSilenceWav(durationMs, sampleRate = 24000) {
    const numSamples = Math.floor(sampleRate * durationMs / 1000)
    const dataLength = numSamples * 2
    const buf = Buffer.alloc(44 + dataLength, 0)

    buf.write('RIFF', 0, 'ascii')
    buf.writeUInt32LE(36 + dataLength, 4)
    buf.write('WAVE', 8, 'ascii')
    buf.write('fmt ', 12, 'ascii')
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20)
    buf.writeUInt16LE(1, 22)
    buf.writeUInt32LE(sampleRate, 24)
    buf.writeUInt32LE(sampleRate * 2, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36, 'ascii')
    buf.writeUInt32LE(dataLength, 40)
    return buf
}

export async function streamNarrationAudio(text, onChunk) {
    const sentences = splitSentences(text)
    const silence = makeSilenceWav(450)

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]
        if (!sentence) continue
        const wav = await synthesizeSentence(sentence)
        if (wav) {
            await onChunk(wav)
            if (i < sentences.length - 1) await onChunk(silence)
        }
    }
}