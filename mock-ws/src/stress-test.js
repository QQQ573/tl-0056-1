const WebSocket = require('ws')
const { WebSocketServer } = require('ws')

const WS_URL = process.env.WS_URL || 'ws://localhost:8080/ws'
const CONNECTIONS = parseInt(process.env.CONNECTIONS || '300', 10)
const STAGGER_MS = parseInt(process.env.STAGGER_MS || '50', 10)
const REPORT_INTERVAL_MS = 5000

const stats = {
  connected: 0,
  disconnected: 0,
  errors: 0,
  messages: 0,
  reconnects: 0
}

function makeConnection(idx) {
  let ws
  let lastEventId = ''
  let msgCount = 0

  function connect() {
    let url = WS_URL
    if (lastEventId) {
      url += (url.includes('?') ? '&' : '?') + 'lastEventId=' + encodeURIComponent(lastEventId)
    }
    ws = new WebSocket(url)

    ws.on('open', () => {
      stats.connected++
    })

    ws.on('message', (raw) => {
      stats.messages++
      msgCount++
      try {
        const m = JSON.parse(raw.toString())
        if (m.eventId) lastEventId = m.eventId
      } catch {}
    })

    ws.on('error', () => {
      stats.errors++
    })

    ws.on('close', () => {
      stats.connected--
      stats.disconnected++
      stats.reconnects++
      setTimeout(connect, 1000 + Math.random() * 3000)
    })
  }

  connect()
}

console.log(`Starting stress test: ${CONNECTIONS} connections to ${WS_URL}`)
console.log(`Staggering connections by ${STAGGER_MS}ms each`)

for (let i = 0; i < CONNECTIONS; i++) {
  setTimeout(() => makeConnection(i), i * STAGGER_MS)
}

setInterval(() => {
  const now = new Date().toISOString()
  console.log(`[${now}] Connections: ${stats.connected}/${CONNECTIONS}, ` +
    `Messages: ${stats.messages}, Reconnects: ${stats.reconnects}, Errors: ${stats.errors}`)
}, REPORT_INTERVAL_MS)
