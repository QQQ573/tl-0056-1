import {
  orders,
  riders,
  assignments,
  lastEventId,
  connectionStatus,
  addOrUpdateOrder,
  removeOrder,
  addOrUpdateRider,
  removeAssignment
} from './store'
import { ORDER_STATUS } from './utils'

let ws = null
let reconnectTimer = null
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws'

function connect() {
  connectionStatus.set('connecting')

  let url = WS_URL
  let currentId = ''
  lastEventId.subscribe((v) => (currentId = v))()
  if (currentId) {
    const sep = url.includes('?') ? '&' : '?'
    url += `${sep}lastEventId=${encodeURIComponent(currentId)}`
  }

  ws = new WebSocket(url)

  ws.onopen = () => {
    connectionStatus.set('connected')
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleMessage(msg)
    } catch (e) {
      console.error('Failed to parse WS message:', e)
    }
  }

  ws.onerror = () => {
    connectionStatus.set('error')
  }

  ws.onclose = () => {
    connectionStatus.set('disconnected')
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(connect, 3000)
    }
  }
}

function handleMessage(msg) {
  if (msg.eventId) {
    lastEventId.set(msg.eventId)
  }

  switch (msg.type) {
    case 'snapshot':
      handleSnapshot(msg.payload)
      break
    case 'order_update':
      handleOrderUpdate(msg.payload)
      break
    case 'order_remove':
      handleOrderRemove(msg.payload)
      break
    case 'rider_update':
      handleRiderUpdate(msg.payload)
      break
    case 'assignment_confirmed':
      handleAssignmentConfirmed(msg.payload)
      break
    case 'assignment_cancelled':
      handleAssignmentCancelled(msg.payload)
      break
  }
}

function handleSnapshot(payload) {
  if (payload.orders) {
    orders.set(new Map(payload.orders.map((o) => [o.id, o])))
  }
  if (payload.riders) {
    riders.set(new Map(payload.riders.map((r) => [r.id, r])))
  }
}

function handleOrderUpdate(order) {
  addOrUpdateOrder(order)
}

function handleOrderRemove(payload) {
  removeOrder(payload.id)
  removeAssignment(payload.id)
}

function handleRiderUpdate(rider) {
  addOrUpdateRider(rider)
}

function handleAssignmentConfirmed(payload) {
  addOrUpdateOrder({ id: payload.orderId, status: ORDER_STATUS.CONFIRMED })
  if (payload.riderId) {
    riders.update((map) => {
      const r = map.get(payload.riderId)
      if (r) {
        r.backlog = (r.backlog || 0) + 1
        map.set(r.id, { ...r })
      }
      return new Map(map)
    })
  }
  removeAssignment(payload.orderId)
}

function handleAssignmentCancelled(payload) {
  addOrUpdateOrder({ id: payload.orderId, status: ORDER_STATUS.PENDING })
  removeAssignment(payload.orderId)
}

export function sendAssign(orderId, riderId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'assign', payload: { orderId, riderId } }))
  }
}

export function sendCancel(orderId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cancel', payload: { orderId } }))
  }
}

export function initWebSocket() {
  connect()
}

export function closeWebSocket() {
  if (ws) ws.close()
}
