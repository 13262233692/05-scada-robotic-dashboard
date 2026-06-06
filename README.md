# SCADA 六轴机械臂阵列监控系统

面向汽车柔性制造流水线的 SCADA（数据采集与监视控制）系统，用于实时监控六轴机械臂阵列的运行状态。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端看板 (Vue3)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ SVG 拓扑图  │  │ 状态指示灯阵列│  │ ECharts 实时曲线 │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│                              ↑                              │
│                      WebSocket (20Hz)                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    后端网关 (NestJS)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              WebSocket 多路复用网关                   │  │
│  └──────────────────────────────┬───────────────────────┘  │
│                                 │                           │
│  ┌──────────────────────────────▼───────────────────────┐  │
│  │              TelemetryGateway 服务                     │  │
│  │  - TCP 服务器 (端口 502)                              │  │
│  │  - 自定义字节序报文解析                                │  │
│  │  - 数据缓存与转发                                     │  │
│  └──────────────────────────────┬───────────────────────┘  │
└─────────────────────────────────┼───────────────────────────┘
                                  │
                          TCP (自定义协议)
                                  │
┌─────────────────────────────────▼───────────────────────────┐
│                PLC 模拟器 (4台六轴机械臂)                    │
│  - 模拟关节角度、温度、扭矩                                  │
│  - 模拟状态变化（运行/警告/故障）                            │
└─────────────────────────────────────────────────────────────┘
```

## 技术栈

### 后端
- **框架**: NestJS 10.x (Node.js + TypeScript)
- **TCP 通讯**: 原生 `net` 模块
- **WebSocket**: Socket.IO + @nestjs/websockets
- **数据频率**: 20Hz (50ms 间隔)

### 前端
- **框架**: Vue 3.3 + TypeScript
- **构建工具**: Vite 4.x
- **图表库**: ECharts 5.x
- **WebSocket**: Socket.IO Client
- **性能优化**: requestAnimationFrame 节流 + 环形缓冲区

## 自定义报文协议

采用小端序 (Little-Endian) 字节序，单帧长度 88 字节：

| 偏移 | 长度 | 字段 | 类型 | 说明 |
|------|------|------|------|------|
| 0 | 2 | 帧头 | uint16 | 固定值 0xAA55 |
| 2 | 2 | 机械臂ID | uint16 | 1-4 |
| 4 | 2 | 帧长度 | uint16 | 固定 88 |
| 6 | 4 | 时间戳 | uint32 | 毫秒级时间戳 |
| 10 | 24 | 关节角度 | float32[6] | J1-J6 角度 (°) |
| 34 | 24 | 电机温度 | float32[6] | J1-J6 温度 (°C) |
| 58 | 24 | 负载扭矩 | float32[6] | J1-J6 扭矩 (N·m) |
| 82 | 2 | 状态字 | uint16 | 位标志状态 |
| 84 | 2 | CRC 校验 | uint16 | Modbus CRC16 |
| 86 | 2 | 帧尾 | uint16 | 固定值 0x55AA |

**状态字位定义**:
- Bit 0: 运行中
- Bit 1: 故障
- Bit 2: 警告
- Bit 3: 维护中
- Bit 4: 急停
- Bit 5: 自动模式

## 快速开始

### 1. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 启动服务

需要开启三个终端，按顺序启动：

**终端 1: 启动后端网关**
```bash
cd backend
npm run start:dev
```
- TCP 服务器监听端口: 502
- HTTP/WebSocket 端口: 3000

**终端 2: 启动 PLC 模拟器**
```bash
cd backend
npm run simulator
```
- 模拟 4 台六轴机械臂
- 每台以 20Hz 频率发送数据

**终端 3: 启动前端看板**
```bash
cd frontend
npm run dev
```
- 访问地址: http://localhost:5173

## 功能特性

### 后端核心模块

1. **TelemetryGateway 模块**
   - TCP 服务器，支持多 PLC 并发连接
   - 报文粘包处理与帧同步
   - 自定义字节序解析
   - 实时数据缓存

2. **WebSocket 多路复用网关**
   - 20Hz 全双工数据推送
   - 按机械臂 ID 房间订阅
   - 下行指令通道
   - 自动重连机制

### 前端核心组件

1. **SVG 车间流水线拓扑图**
   - 可视化展示工位、传送带、机械臂布局
   - 机械臂姿态实时映射（关节角度驱动）
   - 状态颜色编码（绿/黄/红）
   - 传送带物料流动动画
   - 点击选择交互

2. **状态指示灯阵列**
   - 4 台机械臂运行状态概览
   - 6 关节实时角度显示
   - 温度超限预警（黄/红）
   - 最高温度、平均扭矩统计
   - 连接状态与频率显示

3. **ECharts 实时动态折线图**
   - 支持角度/温度/扭矩三种指标切换
   - 6 关节数据同屏对比
   - 300 点历史数据环形缓冲
   - requestAnimationFrame 节流渲染（50ms）
   - 零卡顿高频数据处理

## 性能优化要点

1. **数据层**: 前端采用环形缓冲区，固定窗口保存最近 300 点数据，避免内存无限增长
2. **渲染层**: ECharts 更新采用 `requestAnimationFrame` + 50ms 节流，与后端推送频率解耦
3. **组件层**: Vue 3 响应式系统仅更新变化数据，避免全量重渲染
4. **网络层**: WebSocket 批量推送 + 房间订阅机制，减少无效数据传输

## 项目结构

```
05-scada-robotic-dashboard/
├── backend/
│   ├── src/
│   │   ├── plc-protocol/        # PLC 协议解析
│   │   │   ├── types.ts
│   │   │   ├── protocol.ts
│   │   │   ├── parser.ts
│   │   │   └── plc-protocol.module.ts
│   │   ├── telemetry-gateway/   # 遥测网关核心
│   │   │   ├── telemetry-gateway.service.ts
│   │   │   └── telemetry-gateway.module.ts
│   │   ├── websocket/           # WebSocket 网关
│   │   │   ├── telemetry.gateway.ts
│   │   │   └── websocket.module.ts
│   │   ├── plc-simulator/       # PLC 模拟器
│   │   │   └── index.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── components/          # Vue 组件
    │   │   ├── TopologyDiagram.vue
    │   │   ├── StatusPanel.vue
    │   │   ├── StatusLights.vue
    │   │   └── RealtimeLineChart.vue
    │   ├── services/            # 业务服务
    │   │   └── telemetryManager.ts
    │   ├── types/               # 类型定义
    │   │   └── telemetry.ts
    │   ├── App.vue
    │   ├── main.ts
    │   └── style.css
    ├── index.html
    ├── package.json
    └── vite.config.ts
```
