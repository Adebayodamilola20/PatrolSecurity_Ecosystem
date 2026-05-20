const RESEND_API_URL = 'https://api.resend.com/emails'

function parseList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean)
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export function buildFiveWsAndH(payload = {}) {
  return {
    who: payload.who || payload.userName || payload.officerName || '',
    what: payload.what || payload.title || payload.summary || '',
    when: payload.when || payload.occurredAt || new Date().toISOString(),
    where: payload.where || payload.siteLabel || payload.checkpointName || '',
    why: payload.why || payload.reason || payload.openIssues || '',
    how: payload.how || payload.activities || payload.description || payload.instructions || '',
  }
}

export async function sendEmail({ to, subject, html, text, tags = [] }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const recipients = parseList(to)

  if (!apiKey || !from || recipients.length === 0) {
    return {
      skipped: true,
      reason: !apiKey
        ? 'Missing RESEND_API_KEY'
        : !from
          ? 'Missing RESEND_FROM_EMAIL'
          : 'No recipients',
    }
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      text,
      tags,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.message || 'Failed to send email via Resend')
  }
  return { skipped: false, provider: 'resend', data }
}

export async function sendSms({ to, message }) {
  const apiKey = process.env.TERMII_API_KEY
  const senderId = process.env.TERMII_SENDER_ID
  const baseUrl = process.env.TERMII_BASE_URL
  const recipients = parseList(to)

  if (!apiKey || !senderId || !baseUrl || recipients.length === 0) {
    return {
      skipped: true,
      reason: !apiKey
        ? 'Missing TERMII_API_KEY'
        : !senderId
          ? 'Missing TERMII_SENDER_ID'
          : !baseUrl
            ? 'Missing TERMII_BASE_URL'
            : 'No recipients',
    }
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      to: recipients,
      from: senderId,
      sms: message,
      type: 'plain',
      channel: 'generic',
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.message || 'Failed to send SMS via Termii')
  }
  return { skipped: false, provider: 'termii', data }
}

export async function sendNotificationBundle({ emails, phones, subject, html, text, sms }) {
  const results = {
    email: null,
    sms: null,
  }

  if (emails?.length) {
    results.email = await sendEmail({ to: emails, subject, html, text })
  }
  if (phones?.length && sms) {
    results.sms = await sendSms({ to: phones, message: sms })
  }

  return results
}
