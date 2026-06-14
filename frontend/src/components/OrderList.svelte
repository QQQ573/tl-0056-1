<script>
  import { onMount, onDestroy } from 'svelte'
  import {
    sortedPendingOrders,
    selectedOrderId,
    assignments,
    orders,
    connectionStatus
  } from '../lib/store'
  import { formatTime, getTimerColor, BRANDS, ORDER_STATUS } from '../lib/utils'

  let tickInterval

  onMount(() => {
    tickInterval = setInterval(() => {
      orders.update((m) => new Map(m))
    }, 1000)
  })

  onDestroy(() => {
    if (tickInterval) clearInterval(tickInterval)
  })

  function selectOrder(id) {
    selectedOrderId.set(id)
  }

  $: assignedOrders = Array.from($assignments.values()).map((a) => {
    return { ...$orders.get(a.orderId), assignment: a }
  }).filter((o) => o.id)
</script>

<aside class="panel">
  <header class="panel-header">
    <div class="title">
      <h2>待派单指挥台</h2>
      <span class="count">{$sortedPendingOrders.length} 单待处理</span>
    </div>
    <div class="legend">
      <span class="dot green"></span>充裕
      <span class="dot yellow"></span>紧张
      <span class="dot red"></span>紧急
    </div>
  </header>

  {#if assignedOrders.length > 0}
    <div class="assigned-section">
      <h3>待骑手确认 ({assignedOrders.length})</h3>
      <div class="assigned-list">
        {#each assignedOrders as o}
          <div class="assigned-item">
            <div class="brand-tag" style="background:{BRANDS[o.brand.toUpperCase()]?.color || '#888'}">
              {BRANDS[o.brand.toUpperCase()]?.name?.[0] || '?'}
            </div>
            <div class="assigned-info">
              <div class="store">{o.storeName}</div>
              <div class="countdown color-{getTimerColor(o.remainingSeconds || 0)}">
                {formatTime(o.remainingSeconds || 0)}
              </div>
            </div>
            <div class="assigned-status">等待确认中...</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="list-header">
    <h3>超时风险排序</h3>
  </div>

  <div class="order-list">
    {#each $sortedPendingOrders as order (order.id)}
      <button
        class="order-card"
        class:active={$selectedOrderId === order.id}
        on:click={() => selectOrder(order.id)}
      >
        <div class="brand-tag" style="background:{BRANDS[order.brand.toUpperCase()]?.color || '#888'}">
          {BRANDS[order.brand.toUpperCase()]?.name?.[0] || '?'}
        </div>
        <div class="order-info">
          <div class="store">{order.storeName}</div>
          <div class="meta">
            #{order.id.slice(-4)} · {order.distance.toFixed(1)}km
          </div>
        </div>
        <div class="countdown color-{getTimerColor(order.remainingSeconds || 0)}">
          {formatTime(order.remainingSeconds || 0)}
        </div>
      </button>
    {:else}
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <div>所有订单已处理完毕</div>
      </div>
    {/each}
  </div>

  <footer class="panel-footer">
    <div class="status {$connectionStatus}">
      {$connectionStatus === 'connected' ? '● 实时同步中' : '○ 连接中断'}
    </div>
  </footer>
</aside>

<style>
  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 380px;
    background: #f8fafc;
    border-left: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    z-index: 100;
  }

  .panel-header {
    padding: 16px 20px;
    background: linear-gradient(135deg, #1e293b, #0f172a);
    color: white;
  }

  .title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .title h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
  }

  .count {
    background: rgba(255, 255, 255, 0.15);
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
  }

  .legend {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-top: 10px;
    font-size: 11px;
    opacity: 0.8;
  }

  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
  }

  .dot.green { background: #22c55e; }
  .dot.yellow { background: #eab308; }
  .dot.red { background: #ef4444; }

  .assigned-section {
    padding: 12px 16px;
    background: #fef3c7;
    border-bottom: 1px solid #fde68a;
  }

  .assigned-section h3,
  .list-header h3 {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 700;
    color: #78350f;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .list-header {
    padding: 12px 20px 8px;
  }

  .list-header h3 {
    color: #64748b;
  }

  .assigned-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .assigned-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: white;
    border-radius: 8px;
    border: 1px solid #fcd34d;
  }

  .assigned-info {
    flex: 1;
    min-width: 0;
  }

  .assigned-status {
    font-size: 11px;
    color: #92400e;
    font-weight: 600;
    animation: blink 1.2s infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .order-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .order-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .order-card:hover {
    border-color: #94a3b8;
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
  }

  .order-card.active {
    border-color: #8b5cf6;
    background: #faf5ff;
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
  }

  .brand-tag {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    color: #111;
    flex-shrink: 0;
  }

  .order-info {
    flex: 1;
    min-width: 0;
  }

  .store {
    font-weight: 700;
    font-size: 14px;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 2px;
  }

  .countdown {
    font-weight: 800;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .countdown.color-green { color: #16a34a; }
  .countdown.color-yellow { color: #ca8a04; }
  .countdown.color-red { color: #dc2626; }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #94a3b8;
    font-size: 14px;
    padding: 40px 20px;
  }

  .empty-icon {
    font-size: 40px;
  }

  .panel-footer {
    padding: 10px 20px;
    background: white;
    border-top: 1px solid #e2e8f0;
  }

  .status {
    font-size: 12px;
    font-weight: 600;
  }

  .status.connected { color: #16a34a; }
  .status.connecting { color: #ca8a04; }
  .status.error, .status.disconnected { color: #dc2626; }
</style>
