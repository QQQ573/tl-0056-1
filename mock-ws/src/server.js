const { WebSocketServer } = require('ws')
const http = require('http')
const url = require('url')
const Redis = require('ioredis')
const crypto = require('crypto')

const PORT = process.env.PORT || 8080
const PUSH_INTERVAL = parseInt(process.env.PUSH_INTERVAL || '5000', 10)
const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)
const STORE_COUNT = parseInt(process.env.STORE_COUNT || '3', 10)
const RIDER_PER_BRAND = parseInt(process.env.RIDER_PER_BRAND || '6', 10)
const INITIAL_BACKLOG = parseInt(process.env.INITIAL_BACKLOG || '40', 10)
const EVENT_LOG_KEY = 'dispatch:event_log'
const EVENT_LOG_MAX = 500
const CONFIRM_DELAY = 5000

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true })
redis.connect().catch((e) => console.warn('Redis connection failed, running without persistence:', e.message))

const BRANDS = ['meituan', 'eleme', 'wallace']
const CENTER_LAT = 30.5728
const CENTER_LNG = 104.0668

const stores = []
const orders = new Map()
const riders = new Map()
const assignments = new Map()
const clients = new Set()
let eventCounter = 0

function rand(min, max) {
  return Math.random() * (max - min) + min
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1))
}

function randomNearby(baseLat, baseLng, radiusKm) {
  const r = radiusKm / 111
  const u = Math.random()
  const v = Math.random()
  const w = r * Math.sqrt(u)
  const t = 2 * Math.PI * v
  const x = w * Math.cos(t)
  const y = w * Math.sin(t)
  return { lat: baseLat + y, lng: baseLng + x / Math.cos(baseLat * Math.PI / 180) }
}

function uid(prefix) {
  return prefix + '-' + crypto.randomBytes(4).toString('hex')
}

function now() {
  return Math.floor(Date.now() / 1000)
}

function initStores() {
  const storeConfigs = [
    { name: '华莱士·大学城店', brand: 'wallace', offsetLat: 0.001, offsetLng: 0.001 },
    { name: '麦当劳·熙街店', brand: 'meituan', offsetLat: -0.003, offsetLng: 0.004 },
    { name: '肯德基·重大店', brand: 'eleme', offsetLat: 0.005, offsetLng: -0.002 }
  ]
  for (let i = 0; i < Math.min(STORE_COUNT, storeConfigs.length); i++) {
    const cfg = storeConfigs[i]
    stores.push({
      id: uid('store'),
      name: cfg.name,
      brand: cfg.brand,
      lat: CENTER_LAT + cfg.offsetLat,
      lng: CENTER_LNG + cfg.offsetLng
    })
  }
}

function initRiders() {
  const riderNames = {
    meituan: ['张伟', '王磊', '李强', '刘洋', '陈浩', '杨帆', '赵鹏', '周涛'],
    eleme: ['黄磊', '徐明', '孙浩', '马超', '朱军', '胡斌', '林峰', '何伟'],
    wallace: ['吴明', '郑浩', '钱军', '冯斌', '蒋涛', '沈鹏']
  }
  for (const brand of BRANDS) {
    for (let i = 0; i < RIDER_PER_BRAND; i++) {
      const pos = randomNearby(CENTER_LAT, CENTER_LNG, 1.2)
      riders.set(uid('rider'), {
        id: '',
        name: riderNames[brand][i % riderNames[brand].length],
        brand,
        lat: pos.lat,
        lng: pos.lng,
        backlog: brand === 'wallace' ? randInt(3, 5) : randInt(0, 2),
        online: true
      })
    }
  }
  for (const r of riders.values()) r.id = r.id || uid('rider')
}

function initOrders() {
  for (let i = 0; i < INITIAL_BACKLOG; i++) {
    const store = stores[i % stores.length]
    const deadlineOffset = randInt(3 * 60, 25 * 60)
    const dest = randomNearby(store.lat, store.lng, 2)
    const order = {
      id: uid('order'),
      storeId: store.id,
      storeName: store.name,
      storeLat: store.lat,
      storeLng: store.lng,
      brand: store.brand,
      customerLat: dest.lat,
      customerLng: dest.lng,
      distance: rand(0.8, 3.5),
      promiseDeadline: now() + deadlineOffset,
      remainingSeconds: deadlineOffset,
      status: 'pending',
      createdAt: now()
    }
    orders.set(order.id, order)
  }
}

function broadcast(msg) {
  eventCounter++
  const eventId = `evt-${Date.now()}-${eventCounter}`
  const envelope = { eventId, ...msg }
  const payload = JSON.stringify(envelope)

  redis.rpush(EVENT_LOG_KEY, payload).catch(() => {})
  redis.ltrim(EVENT_LOG_KEY, -EVENT_LOG_MAX, -1).catch(() => {})

  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(payload)
    }
  }
}

async function sendSnapshot(client, startAfterEventId) {
  const snapshot = {
    orders: Array.from(orders.values()),
    riders: Array.from(riders.values())
  }
  eventCounter++
  const eventId = `evt-${Date.now()}-${eventCounter}`
  client.send(JSON.stringify({
    eventId,
    type: 'snapshot',
    payload: snapshot
  }))

  if (startAfterEventId) {
    try {
      const log = await redis.lrange(EVENT_LOG_KEY, 0, -1)
      let found = false
      for (const entry of log) {
        const parsed = JSON.parse(entry)
        if (found) client.send(JSON.stringify(parsed))
        if (parsed.eventId === startAfterEventId) found = true
      }
    } catch (e) {}
  }
}

function tickOrders() {
  const nowTs = now()
  for (const order of orders.values()) {
    order.remainingSeconds = Math.floor(order.promiseDeadline - nowTs)
  }
}

function moveRiders() {
  for (const r of riders.values()) {
    if (!r.online) continue
    const delta = randomNearby(r.lat, r.lng, 0.05)
    r.lat = delta.lat
    r.lng = delta.lng
  }
}

function maybeAddOrRemoveOrder() {
  if (Math.random() < 0.35 && orders.size < 80) {
    const store = stores[randInt(0, stores.length - 1)]
    const deadlineOffset = randInt(5 * 60, 25 * 60)
    const dest = randomNearby(store.lat, store.lng, 2)
    const order = {
      id: uid('order'),
      storeId: store.id,
      storeName: store.name,
      storeLat: store.lat,
      storeLng: store.lng,
      brand: store.brand,
      customerLat: dest.lat,
      customerLng: dest.lng,
      distance: rand(0.8, 3.5),
      promiseDeadline: now() + deadlineOffset,
      remainingSeconds: deadlineOffset,
      status: 'pending',
      createdAt: now()
    }
    orders.set(order.id, order)
    broadcast({ type: 'order_update', payload: order })
  }
  if (Math.random() < 0.15 && orders.size > 5) {
    const pendingArr = Array.from(orders.values()).filter((o) => o.status === 'pending')
    if (pendingArr.length > 0) {
      const toRemove = pendingArr[randInt(0, pendingArr.length - 1)]
      orders.delete(toRemove.id)
      broadcast({ type: 'order_remove', payload: { id: toRemove.id } })
    }
  }
}

function pushUpdates() {
  tickOrders()
  moveRiders()
  maybeAddOrRemoveOrder()
  for (const r of riders.values()) {
    broadcast({ type: 'rider_update', payload: r })
  }
  const pending = Array.from(orders.values()).filter((o) => o.status === 'pending')
  for (let i = 0; i < Math.min(3, pending.length); i++) {
    const o = pending[randInt(0, pending.length - 1)]
    if (o) broadcast({ type: 'order_update', payload: o })
  }
}

function handleClientMessage(client, raw) {
  let msg
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  if (msg.type === 'assign' && msg.payload) {
    const { orderId, riderId } = msg.payload
    const order = orders.get(orderId)
    const rider = riders.get(riderId)
    if (!order || !rider || order.status !== 'pending' || rider.backlog >= 4) return
    order.status = 'assigned'
    const assignment = {
      orderId,
      riderId,
      rider: { ...rider },
      timestamp: Date.now()
    }
    assignments.set(orderId, assignment)
    broadcast({ type: 'order_update', payload: order })
    setTimeout(() => {
      if (assignments.has(orderId)) {
        assignments.delete(orderId)
        if (rider) rider.backlog += 1
        order.status = 'confirmed'
        broadcast({
          type: 'assignment_confirmed',
          payload: { orderId, riderId }
        })
        broadcast({ type: 'rider_update', payload: rider })
      }
    }, CONFIRM_DELAY)
  } else if (msg.type === 'cancel' && msg.payload) {
    const { orderId } = msg.payload
    const order = orders.get(orderId)
    if (!order || order.status !== 'assigned') return
    const assignment = assignments.get(orderId)
    if (!assignment) return
    if (Date.now() - assignment.timestamp <= CONFIRM_DELAY) {
      assignments.delete(orderId)
      order.status = 'pending'
      broadcast({ type: 'assignment_cancelled', payload: { orderId } })
      broadcast({ type: 'order_update', payload: order })
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, clients: clients.size, orders: orders.size }))
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server })

wss.on('connection', async (ws, req) => {
  const parsed = url.parse(req.url, true)
  const lastEventId = parsed.query.lastEventId
  clients.add(ws)
  console.log(`Client connected, total: ${clients.size}, lastEventId: ${lastEventId || 'none'}`)
  await sendSnapshot(ws, lastEventId)
  ws.on('message', (raw) => handleClientMessage(ws, raw))
  ws.on('close', () => {
    clients.delete(ws)
    console.log(`Client disconnected, total: ${clients.size}`)
  })
})

initStores()
initRiders()
initOrders()

setInterval(pushUpdates, PUSH_INTERVAL)

server.listen(PORT, () => {
  console.log(`Dispatch mock WS listening on port ${PORT}`)
  console.log(`Stores: ${stores.length}, Riders: ${riders.size}, Initial orders: ${orders.size}`)
  console.log(`Push interval: ${PUSH_INTERVAL}ms`)
})
