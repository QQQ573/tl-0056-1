import { writable, derived } from 'svelte/store'
import { ORDER_STATUS, getTimeoutRiskScore } from './utils'

export const orders = writable(new Map())
export const riders = writable(new Map())
export const assignments = writable(new Map())
export const lastEventId = writable('')
export const connectionStatus = writable('disconnected')
export const selectedOrderId = writable(null)
export const recentAssignTimestamps = writable(new Map())

export const pendingOrders = derived(orders, ($orders) => {
  return Array.from($orders.values()).filter((o) => o.status === ORDER_STATUS.PENDING)
})

export const sortedPendingOrders = derived(pendingOrders, ($pending) => {
  return [...$pending].sort((a, b) => getTimeoutRiskScore(a) - getTimeoutRiskScore(b))
})

export const availableRiders = derived(riders, ($riders) => {
  return Array.from($riders.values()).filter((r) => r.backlog < 4 && r.online)
})

export function addOrUpdateOrder(order) {
  orders.update((map) => {
    const existing = map.get(order.id)
    map.set(order.id, { ...existing, ...order })
    return new Map(map)
  })
}

export function removeOrder(id) {
  orders.update((map) => {
    map.delete(id)
    return new Map(map)
  })
}

export function addOrUpdateRider(rider) {
  riders.update((map) => {
    const existing = map.get(rider.id)
    map.set(rider.id, { ...existing, ...rider })
    return new Map(map)
  })
}

export function addAssignment(assignment) {
  assignments.update((map) => {
    map.set(assignment.orderId, assignment)
    return new Map(map)
  })
  recentAssignTimestamps.update((map) => {
    map.set(assignment.orderId, Date.now())
    return new Map(map)
  })
}

export function removeAssignment(orderId) {
  assignments.update((map) => {
    map.delete(orderId)
    return new Map(map)
  })
}

export function canAssign(orderId) {
  const ts = recentAssignTimestamps.get(orderId)
  if (!ts) return true
  return Date.now() - ts >= 5000
}
