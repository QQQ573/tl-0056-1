import { haversineDistance, estimateTravelMinutes } from './utils'

export function recommendRiders(order, riders, topN = 3) {
  if (!order || !riders || riders.length === 0) return []

  const scored = riders
    .filter((r) => r.online && r.backlog < 4)
    .map((rider) => {
      const dist = haversineDistance(
        order.storeLat,
        order.storeLng,
        rider.lat,
        rider.lng
      )
      const extraMinutes = estimateTravelMinutes(dist)
      const brandBonus = rider.brand === order.brand ? 0 : 2
      const backlogPenalty = rider.backlog * 1.5
      const score = extraMinutes + brandBonus + backlogPenalty
      return { rider, distanceKm: dist, extraMinutes, score }
    })
    .sort((a, b) => a.score - b.score)

  return scored.slice(0, topN)
}
