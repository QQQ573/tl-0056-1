# 外卖调度指挥台 (Dispatch Dashboard)

暴雨傍晚外卖爆单场景下的实时调度中台。值班 iPad 横屏展示地图 + 右侧待派清单，支持订单倒计时着色、骑手推荐、5 秒撤销、断线补拉等。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Svelte 4 + Vite |
| 地图 | Leaflet 1.9 + MarkerCluster |
| 实时通信 | WebSocket（服务端 `ws` 库） |
| 缓冲层 | Redis 7（事件日志 `dispatch:event_log`，最多保留 500 条） |
| 容器 | docker-compose 三服务编排 |

## 快速启动

```bash
docker compose up --build
```

打开：
- 前端指挥台：http://localhost:5173
- Mock WS 健康检查：http://localhost:8080/health

或本地开发：

```bash
# 终端 1：Redis
redis-server

# 终端 2：Mock WS
cd mock-ws && npm install && npm start

# 终端 3：前端
cd frontend && npm install && npm run dev
```

## 目录结构

```
tl-0056-1/
├── docker-compose.yml
├── README.md
├── frontend/
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.svelte
│       ├── main.js
│       ├── components/
│       │   ├── MapView.svelte        # Leaflet 地图 + 聚合 + 骑手/订单图层
│       │   ├── OrderList.svelte      # 右侧待派清单（超时风险排序）
│       │   └── OrderPopup.svelte     # Top3 推荐 + 指派/撤销动画
│       └── lib/
│           ├── utils.js              # Haversine、颜色分级、品牌常量
│           ├── store.js              # writable/derived 状态管理
│           ├── ws.js                 # WS 客户端（lastEventId 补拉、重连）
│           └── recommend.js          # Top3 骑手推荐（距离 + 背单 + 品牌偏好）
└── mock-ws/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── server.js                 # Mock WS + HTTP 健康检查 + 事件缓冲
        └── stress-test.js            # 300 连接压测脚本
```

## WebSocket 事件协议

所有下行消息统一信封：

```json
{
  "eventId": "evt-1718352000000-42",
  "type": "<事件类型>",
  "payload": { ... }
}
```

客户端可在连接 URL 追加 `?lastEventId=evt-xxx`，服务端先推 `snapshot` 再补发该 eventId **之后**的所有事件。

---

### 下行事件（Server → Client）

#### 1) `snapshot` — 首次连接全量快照

```json
{
  "eventId": "evt-1718352000000-1",
  "type": "snapshot",
  "payload": {
    "orders": [
      {
        "id": "order-a1b2c3d4",
        "storeId": "store-xx",
        "storeName": "华莱士·大学城店",
        "storeLat": 30.5738,
        "storeLng": 104.0678,
        "customerLat": 30.5812,
        "customerLng": 104.0710,
        "brand": "wallace",
        "distance": 1.2,
        "promiseDeadline": 1718353800,
        "remainingSeconds": 890,
        "status": "pending",
        "createdAt": 1718352900
      }
    ],
    "riders": [
      {
        "id": "rider-e5f6g7h8",
        "name": "张伟",
        "brand": "meituan",
        "lat": 30.5740,
        "lng": 104.0680,
        "backlog": 2,
        "online": true
      }
    ]
  }
}
```

#### 2) `order_update` — 新增或更新订单

```json
{
  "eventId": "evt-1718352005000-2",
  "type": "order_update",
  "payload": {
    "id": "order-a1b2c3d4",
    "status": "assigned",
    "remainingSeconds": 885
  }
}
```

#### 3) `order_remove` — 订单被取走或取消

```json
{
  "eventId": "evt-1718352010000-3",
  "type": "order_remove",
  "payload": { "id": "order-a1b2c3d4" }
}
```

#### 4) `rider_update` — 骑手位置/背单状态

```json
{
  "eventId": "evt-1718352005000-4",
  "type": "rider_update",
  "payload": {
    "id": "rider-e5f6g7h8",
    "lat": 30.5742,
    "lng": 104.0683,
    "backlog": 3
  }
}
```

#### 5) `assignment_confirmed` — 骑手已确认接单

```json
{
  "eventId": "evt-1718352015000-5",
  "type": "assignment_confirmed",
  "payload": { "orderId": "order-a1b2c3d4", "riderId": "rider-e5f6g7h8" }
}
```

#### 6) `assignment_cancelled` — 经理主动撤销（窗口内）或骑手拒单

```json
{
  "eventId": "evt-1718352020000-6",
  "type": "assignment_cancelled",
  "payload": { "orderId": "order-a1b2c3d4" }
}
```

---

### 上行消息（Client → Server）

#### `assign` — 经理指派骑手

```json
{
  "type": "assign",
  "payload": { "orderId": "order-a1b2c3d4", "riderId": "rider-e5f6g7h8" }
}
```

服务端校验：订单必须是 `pending`，骑手背单必须 < 4。否则静默忽略。

#### `cancel` — 经理撤销指派

```json
{
  "type": "cancel",
  "payload": { "orderId": "order-a1b2c3d4" }
}
```

仅在指派后 5 秒窗口内有效。

---

## 撤销时序

```
 经理点击「指派」      5 s 窗口          5 s 到期骑手自动确认
       │                   │                       │
       ▼                   ▼                       ▼
 ┌───────────┐      ┌───────────────┐      ┌──────────────────┐
 │ UI 画连线  │─────▶│ 倒计时进度条   │─────▶│ assignment_    │
 │ 状态→assigned│    │ 可点「撤销」   │      │ confirmed 推送 │
 └───────────┘      └───────────────┘      └──────────────────┘
       │
       └─ 若 5 s 内点「撤销」：
          ├─ send {type:"cancel"}
          ├─ server → assignment_cancelled
          └─ UI 订单状态回退 pending，连线消失

 前端侧 5 s 内对同一订单再次点击「指派」会被 disabled 拒绝
 （store.recentAssignTimestamps + canAssign() 守卫）
```

## 核心业务规则

| 规则 | 说明 |
|---|---|
| 倒计时着色 | `≥15min` 绿 🟢，`8~15min` 黄 🟡，`<8min` 红 🔴 |
| 骑手品牌图标 | 美团黄 `#FFD100`、饿了么蓝 `#0097FF`、华莱士红 `#E60012`，首字母 + 背单徽标 |
| 推荐算法 | Haversine 距离换算分钟 + 跨品牌 +2 分钟惩罚 + 背单×1.5 惩罚，取 Top 3 |
| 背单上限 | 背单 ≥ 4 的骑手不出现在推荐列表且无法被指派 |
| 地图聚合 | `MarkerCluster` maxClusterRadius=60，缩放后自动展开为单点 |
| 防重复指派 | 同一订单 5 秒内只能指派一次（前端守卫） |
| 断线补拉 | 重连时携带 `lastEventId`，服务端从 Redis 队列回放 |
| 推送频率 | Mock 服务每 5 秒推送骑手位置与随机订单增量 |

## Mock WS 压测（困难级）

`mock-ws/src/stress-test.js` 模拟 300 个并发客户端连接同一台 Mock WS，用于验证：

- 广播广播能力（每 5 秒 1 轮推送）
- 断线重连 + `lastEventId` 补拉
- 服务端内存与 Redis 缓冲

运行：

```bash
cd mock-ws
npm install

# 启动服务端后另开终端
CONNECTIONS=300 WS_URL=ws://localhost:8080/ws node src/stress-test.js
```

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `CONNECTIONS` | 300 | 并发连接数 |
| `WS_URL` | `ws://localhost:8080/ws` | 目标 WS 地址 |
| `STAGGER_MS` | 50 | 每个连接之间的启动间隔（毫秒），避免瞬间打满 |

每 5 秒控制台输出：

```
[2026-06-14T10:00:05.000Z] Connections: 298/300, Messages: 18234, Reconnects: 4, Errors: 0
```

建议观察指标：
- 服务端 `ws` 广播延迟（可用 Wireshark 或 Chrome DevTools Network→WS 帧观察）
- Redis `LLEN dispatch:event_log` 稳定在 ~500
- 服务端 RSS 内存随 300 连接应 < 200 MB

## 环境变量（docker-compose 可调）

| 变量 | 服务 | 默认 | 说明 |
|---|---|---|---|
| `PUSH_INTERVAL` | mock-ws | 5000 | 推送间隔（毫秒） |
| `STORE_COUNT` | mock-ws | 3 | 模拟门店数 |
| `RIDER_PER_BRAND` | mock-ws | 6 | 每品牌骑手数 |
| `INITIAL_BACKLOG` | mock-ws | 40 | 启动时积压订单数 |
| `VITE_WS_URL` | frontend | `ws://localhost:8080/ws` | 前端连接的 WS 地址 |
