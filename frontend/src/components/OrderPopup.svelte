<script>
  import { onMount, onDestroy } from 'svelte'
  import {
    orders,
    riders,
    assignments,
    selectedOrderId,
    canAssign,
    addAssignment,
    removeAssignment,
    addOrUpdateOrder
  } from '../lib/store'
  import { recommendRiders } from '../lib/recommend'
  import { sendAssign, sendCancel } from '../lib/ws'
  import {
    formatTime,
    getTimerColor,
    BRANDS,
    ORDER_STATUS
  } from '../lib/utils'

  export let orderId
  let order
  let recommendations = []
  let assigned = null
  let countdownLeft = 0
  let countdownTimer = null
  let animatingLine = false

  $: if (orderId) {
    order = $orders.get(orderId)
    assigned = $assignments.get(orderId)
    if (order && !assigned) {
      recommendations = recommendRiders(order, Array.from($riders.values()))
    }
    if (assigned) {
      const elapsed = Date.now() - assigned.timestamp
      countdownLeft = Math.max(0, 5000 - elapsed)
    }
  }

  $: if (assigned) {
    const elapsed = Date.now() - assigned.timestamp
    countdownLeft = Math.max(0, 5000 - elapsed)
  }

  function handleAssign(riderId) {
    if (!canAssign(orderId)) return
    const assignment = {
      orderId,
      riderId,
      timestamp: Date.now(),
      status: 'pending_confirm'
    }
    animatingLine = true
    setTimeout(() => (animatingLine = false), 800)
    addAssignment(assignment)
    addOrUpdateOrder({ id: orderId, status: ORDER_STATUS.ASSIGNED })
    sendAssign(orderId, riderId)
  }

  function handleCancel() {
    if (!assigned) return
    sendCancel(orderId)
    removeAssignment(orderId)
    addOrUpdateOrder({ id: orderId, status: ORDER_STATUS.PENDING })
  }

  function close() {
    selectedOrderId.set(null)
  }

  onMount(() => {
    countdownTimer = setInterval(() => {
      if (assigned) {
        const elapsed = Date.now() - assigned.timestamp
        countdownLeft = Math.max(0, 5000 - elapsed)
      }
    }, 100)
  })

  onDestroy(() => {
    if (countdownTimer) clearInterval(countdownTimer)
  })

  let $orders, $riders, $assignments
  orders.subscribe((v) => ($orders = v))
  riders.subscribe((v) => ($riders = v))
  assignments.subscribe((v) => ($assignments = v))
</script>

{#if orderId && order}
  <div class="overlay" on:click={close}>
    <div class="popup" class:line-anim={animatingLine} on:click|stopPropagation>
      <button class="close" on:click={close}>×</button>
      <div class="header">
        <div class="brand" style="background:{BRANDS[order.brand.toUpperCase()]?.color || '#888'}">
          {BRANDS[order.brand.toUpperCase()]?.name || order.brand}
        </div>
        <div class="store">{order.storeName}</div>
      </div>

      <div class="timer-row">
        <div class="timer color-{getTimerColor(order.remainingSeconds || 0)}">
          {#if assigned}
            等待骑手确认
          {:else}
            剩余送达时间
          {/if}
        </div>
        {#if assigned}
          <div class="countdown">
            撤销窗口 {(countdownLeft / 1000).toFixed(1)}s
            <div class="countdown-bar">
              <div class="countdown-fill" style="width:{100 - (countdownLeft / 5000) * 100}%"></div>
            </div>
          </div>
        {:else}
          <div class="countdown color-{getTimerColor(order.remainingSeconds || 0)}">
            {formatTime(order.remainingSeconds || 0)}
          </div>
        {/if}
      </div>

      {#if assigned}
        <div class="assigned-info">
          <div class="rider-card assigned">
            <div class="avatar" style="background:{BRANDS[assigned.rider.brand?.toUpperCase()]?.color || '#888'}">
              {BRANDS[assigned.rider.brand?.toUpperCase()]?.name?.[0] || '?'}
            </div>
            <div class="info">
              <div class="name">{assigned.rider.name}</div>
              <div class="meta">
                {BRANDS[assigned.rider.brand?.toUpperCase()]?.name || assigned.rider.brand} ·
                背单 {assigned.rider.backlog}
              </div>
            </div>
          </div>
          <button
            class="cancel-btn"
            on:click={handleCancel}
            disabled={countdownLeft <= 0}
          >
            {countdownLeft > 0 ? '撤销指派' : '已过撤销窗口'}
          </button>
        </div>
      {:else}
        <div class="recommend-title">推荐骑手 Top 3</div>
        <div class="rider-list">
          {#each recommendations as rec, i}
            <button
              class="rider-card"
              on:click={() => handleAssign(rec.rider.id)}
              disabled={!canAssign(orderId)}
            >
              <div class="rank">#{i + 1}</div>
              <div class="avatar" style="background:{BRANDS[rec.rider.brand.toUpperCase()]?.color || '#888'}">
                {BRANDS[rec.rider.brand.toUpperCase()]?.name?.[0] || '?'}
              </div>
              <div class="info">
                <div class="name">{rec.rider.name}</div>
                <div class="meta">
                  {BRANDS[rec.rider.brand.toUpperCase()]?.name || rec.rider.brand} ·
                  背单 {rec.rider.backlog}
                </div>
              </div>
              <div class="extra">
                <div class="minutes">+{rec.extraMinutes} 分钟</div>
                <div class="distance">{rec.distanceKm.toFixed(1)} km</div>
              </div>
            </button>
          {/each}
          {#if recommendations.length === 0}
            <div class="empty">暂无可用骑手</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    backdrop-filter: blur(2px);
  }
  .popup {
    position: relative;
    width: 420px;
    max-width: 90vw;
    background: white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: popIn 0.25s ease-out;
  }
  .popup.line-anim::after {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 18px;
    border: 3px solid #8b5cf6;
    animation: linePulse 0.8s ease-out;
  }
  @keyframes popIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  @keyframes linePulse {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.03); }
  }
  .close {
    position: absolute;
    top: 12px;
    right: 16px;
    background: none;
    border: none;
    font-size: 28px;
    color: #9ca3af;
    cursor: pointer;
    line-height: 1;
  }
  .close:hover { color: #374151; }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .brand {
    padding: 4px 12px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 13px;
    color: #111;
  }
  .store {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
  }

  .timer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: #f9fafb;
    border-radius: 10px;
    margin-bottom: 20px;
  }
  .timer {
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
  }
  .timer.color-green { color: #16a34a; }
  .timer.color-yellow { color: #ca8a04; }
  .timer.color-red { color: #dc2626; }

  .countdown {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .countdown.color-green { color: #16a34a; }
  .countdown.color-yellow { color: #ca8a04; }
  .countdown.color-red { color: #dc2626; }

  .countdown-bar {
    width: 140px;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
    margin-top: 4px;
  }
  .countdown-fill {
    height: 100%;
    background: #f97316;
    transition: width 0.1s linear;
  }

  .recommend-title {
    font-size: 14px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 10px;
  }

  .rider-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rider-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1.5px solid #e5e7eb;
    border-radius: 10px;
    background: white;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }
  .rider-card:hover:not(:disabled) {
    border-color: #8b5cf6;
    background: #faf5ff;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
  }
  .rider-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .rider-card.assigned {
    border-color: #8b5cf6;
    background: #faf5ff;
    cursor: default;
  }

  .rank {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #8b5cf6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 12px;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 16px;
    color: #111;
  }

  .info { flex: 1; }
  .name {
    font-weight: 700;
    font-size: 15px;
    color: #111827;
  }
  .meta {
    font-size: 12px;
    color: #6b7280;
    margin-top: 2px;
  }

  .extra {
    text-align: right;
  }
  .minutes {
    font-weight: 800;
    color: #0ea5e9;
    font-size: 15px;
  }
  .distance {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 2px;
  }

  .assigned-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .cancel-btn {
    padding: 12px;
    border: 2px solid #ef4444;
    background: white;
    color: #ef4444;
    border-radius: 10px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .cancel-btn:hover:not(:disabled) {
    background: #ef4444;
    color: white;
  }
  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: #9ca3af;
    color: #9ca3af;
  }

  .empty {
    text-align: center;
    padding: 30px;
    color: #9ca3af;
    font-size: 14px;
  }
</style>
