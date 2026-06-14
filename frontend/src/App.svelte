<script>
  import { onMount } from 'svelte'
  import MapView from './components/MapView.svelte'
  import OrderList from './components/OrderList.svelte'
  import OrderPopup from './components/OrderPopup.svelte'
  import { initWebSocket } from './lib/ws'
  import { selectedOrderId, orders, riders } from './lib/store'
  import { onDestroy } from 'svelte'

  let tick

  onMount(() => {
    initWebSocket()
    tick = setInterval(() => {
      orders.update((m) => {
        const now = Date.now() / 1000
        for (const [id, o] of m) {
          o.remainingSeconds = Math.floor(o.promiseDeadline - now)
        }
        return new Map(m)
      })
    }, 1000)
  })

  onDestroy(() => {
    if (tick) clearInterval(tick)
  })
</script>

<main class="layout">
  <MapView />
  <OrderList />
  {#if $selectedOrderId}
    <OrderPopup orderId={$selectedOrderId} />
  {/if}
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(html),
  :global(body),
  :global(#app) {
    margin: 0;
    padding: 0;
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
      'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    background: #f1f5f9;
    overflow: hidden;
  }
  .layout {
    position: relative;
    width: 100vw;
    height: 100vh;
  }
  :global(.leaflet-container) {
    background: #e2e8f0;
  }
  :global(.leaflet-popup-content-wrapper) {
    border-radius: 10px;
  }
</style>
