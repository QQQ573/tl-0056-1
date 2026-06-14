<script>
  import { onMount, onDestroy, tick } from 'svelte'
  import L from 'leaflet'
  import 'leaflet.markercluster'
  import {
    orders,
    riders,
    assignments,
    selectedOrderId,
    connectionStatus
  } from '../lib/store'
  import { getTimerColor, BRANDS, ORDER_STATUS } from '../lib/utils'

  let map
  let orderCluster
  const orderMarkers = new Map()
  const riderMarkers = new Map()
  const assignmentLines = new Map()
  let tickInterval
  let currentOrders = new Map()
  let currentRiders = new Map()

  const CENTER = [30.5728, 104.0668]

  function makeOrderIcon(order, remaining) {
    const color = getTimerColor(remaining)
    const colorMap = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }
    const bg = colorMap[color]
    const isAssigned = order.status === ORDER_STATUS.ASSIGNED
    return L.divIcon({
      className: 'order-marker',
      html: `<div style="
        width:32px;height:32px;border-radius:50%;
        background:${bg};border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:700;font-size:11px;
        ${isAssigned ? 'opacity:.55;filter:grayscale(.3);' : ''}
      ">${Math.max(0, Math.floor(remaining / 60))}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    })
  }

  function makeRiderIcon(rider) {
    const brand = BRANDS[rider.brand.toUpperCase()] || BRANDS.MEITUAN
    const initial = brand.name[0]
    return L.divIcon({
      className: 'rider-marker',
      html: `<div style="
        width:36px;height:36px;border-radius:50%;
        background:${brand.color};
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,.4);
        display:flex;align-items:center;justify-content:center;
        color:#111;font-weight:800;font-size:14px;
        position:relative;
      ">${initial}<span style="
        position:absolute;bottom:-6px;right:-6px;
        background:${rider.backlog >= 4 ? '#ef4444' : '#0ea5e9'};
        color:white;font-size:10px;font-weight:700;
        border-radius:10px;padding:1px 6px;border:2px solid white;
      ">${rider.backlog}</span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    })
  }

  function renderOrders(ords) {
    if (!orderCluster) return
    orderCluster.clearLayers()
    orderMarkers.clear()

    const now = Date.now() / 1000
    for (const order of ords.values()) {
      const remaining = order.promiseDeadline - now
      const marker = L.marker([order.storeLat, order.storeLng], {
        icon: makeOrderIcon(order, remaining)
      })
      marker.on('click', () => {
        selectedOrderId.set(order.id)
      })
      orderMarkers.set(order.id, marker)
      orderCluster.addLayer(marker)
    }
  }

  function renderRiders(rds) {
    if (!map) return
    for (const [id, m] of riderMarkers) {
      map.removeLayer(m)
    }
    riderMarkers.clear()

    for (const rider of rds.values()) {
      if (!rider.online) continue
      const marker = L.marker([rider.lat, rider.lng], {
        icon: makeRiderIcon(rider)
      })
      riderMarkers.set(rider.id, marker)
      marker.addTo(map)
    }
  }

  function renderAssignments(asns, ords, rds) {
    for (const [, line] of assignmentLines) {
      map.removeLayer(line)
    }
    assignmentLines.clear()

    for (const a of asns.values()) {
      const order = ords.get(a.orderId)
      const rider = rds.get(a.riderId)
      if (!order || !rider) continue
      const line = L.polyline(
        [
          [rider.lat, rider.lng],
          [order.storeLat, order.storeLng]
        ],
        { color: '#8b5cf6', weight: 4, opacity: 0.7, dashArray: '8,6' }
      )
      line.addTo(map)
      assignmentLines.set(a.orderId, line)
    }
  }

  function refreshColors(ords) {
    const now = Date.now() / 1000
    for (const order of ords.values()) {
      const marker = orderMarkers.get(order.id)
      if (marker) {
        const remaining = order.promiseDeadline - now
        marker.setIcon(makeOrderIcon(order, remaining))
      }
    }
  }

  orders.subscribe((v) => {
    currentOrders = v
    renderOrders(v)
    renderAssignments($assignments, v, currentRiders)
  })

  riders.subscribe((v) => {
    currentRiders = v
    renderRiders(v)
    renderAssignments($assignments, currentOrders, v)
  })

  assignments.subscribe((v) => {
    renderAssignments(v, currentOrders, currentRiders)
  })

  onMount(() => {
    map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView(CENTER, 14)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map)

    orderCluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount()
        let color = '#22c55e'
        if (count > 20) color = '#ef4444'
        else if (count > 10) color = '#eab308'
        return L.divIcon({
          html: `<div style="
            background:${color};width:40px;height:40px;
            border-radius:50%;color:white;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);
          ">${count}</div>`,
          className: 'order-cluster',
          iconSize: [40, 40]
        })
      }
    })
    map.addLayer(orderCluster)

    tickInterval = setInterval(() => {
      refreshColors(currentOrders)
    }, 1000)

    onDestroy(() => {
      clearInterval(tickInterval)
      if (map) map.remove()
    })
  })
</script>

<div id="map" class="map-container"></div>
<div class="status-bar">
  <span class="status-dot {$connectionStatus}"></span>
  <span>{$connectionStatus === 'connected' ? '已连接' : $connectionStatus === 'connecting' ? '连接中...' : '已断开'}</span>
</div>

<style>
  .map-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 380px;
    bottom: 0;
  }
  .status-bar {
    position: absolute;
    top: 12px;
    left: 12px;
    background: rgba(255, 255, 255, 0.95);
    padding: 6px 14px;
    border-radius: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 1000;
    font-size: 13px;
    font-weight: 600;
  }
  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #9ca3af;
  }
  .status-dot.connected {
    background: #22c55e;
    animation: pulse 2s infinite;
  }
  .status-dot.connecting {
    background: #eab308;
    animation: pulse 1s infinite;
  }
  .status-dot.error,
  .status-dot.disconnected {
    background: #ef4444;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
