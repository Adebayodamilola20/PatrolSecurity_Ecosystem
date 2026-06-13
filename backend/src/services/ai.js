const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions'
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'
const NVIDIA_CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL || 'openai/gpt-oss-120b'
const NVIDIA_EMBEDDING_MODEL = process.env.NVIDIA_EMBEDDING_MODEL || 'nvidia/nv-embedqa-e5-v5'

let apiKey = process.env.MISTRAL_API_KEY || ''

export function setMistralKey(key) {
  apiKey = key
}

export async function enhanceIncidentReport(rawText, category) {
  if (!apiKey) {
    return {
      enhanced: rawText,
      summary: rawText.slice(0, 100),
      severity: 'medium',
      category: category || 'General',
    }
  }

  try {
    const res = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          {
            role: 'system',
            content: `You are a security report enhancement assistant. Given a raw guard incident note:
1. Fix grammar and spelling
2. Detect the incident category
3. Assign a severity (low, medium, high, critical)
4. Write a professional summary

Respond with valid JSON: { "enhanced": "...", "summary": "...", "severity": "...", "category": "..." }`,
          },
          { role: 'user', content: rawText },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) throw new Error(`Mistral API error: ${res.status}`)

    const data = await res.json()
    const result = JSON.parse(data.choices[0].message.content)

    return {
      enhanced: result.enhanced || rawText,
      summary: result.summary || rawText.slice(0, 100),
      severity: ['low', 'medium', 'high', 'critical'].includes(result.severity) ? result.severity : 'medium',
      category: result.category || category || 'General',
    }
  } catch {
    return {
      enhanced: rawText,
      summary: rawText.slice(0, 100),
      severity: 'medium',
      category: category || 'General',
    }
  }
}

function getNvidiaKey() {
  return process.env.NVIDIA_API_KEY?.trim() || ''
}

export function nvidiaConfigured() {
  return Boolean(getNvidiaKey())
}

export async function chatWithNvidia({ messages, temperature = 1, topP = 1, maxTokens = 4096 }) {
  const key = getNvidiaKey()
  if (!key) {
    return {
      unavailable: true,
      content: 'The AI assistant is not available yet because the NVIDIA API key has not been configured on the server.',
      model: NVIDIA_CHAT_MODEL,
    }
  }

  const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: NVIDIA_CHAT_MODEL,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: false,
    }),
  })

  if (!res.ok) {
    const details = await res.text().catch(() => '')
    throw new Error(`NVIDIA chat API error ${res.status}${details ? `: ${details.slice(0, 240)}` : ''}`)
  }

  const data = await res.json()
  return {
    content: data?.choices?.[0]?.message?.content || '',
    reasoning: data?.choices?.[0]?.message?.reasoning_content || null,
    model: data?.model || NVIDIA_CHAT_MODEL,
    usage: data?.usage || null,
  }
}

export async function embedWithNvidia(texts) {
  const key = getNvidiaKey()
  if (!key) return { unavailable: true, embeddings: [] }

  const res = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: NVIDIA_EMBEDDING_MODEL,
      input: texts,
      input_type: 'passage',
    }),
  })

  if (!res.ok) {
    const details = await res.text().catch(() => '')
    throw new Error(`NVIDIA embeddings API error ${res.status}${details ? `: ${details.slice(0, 240)}` : ''}`)
  }

  const data = await res.json()
  return {
    embeddings: (data?.data || []).map((item) => item.embedding),
    model: data?.model || NVIDIA_EMBEDDING_MODEL,
  }
}
