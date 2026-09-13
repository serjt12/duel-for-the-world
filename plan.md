project-palacio/
│
├── apps/
│   └── web/
│       ├── src/
│       │   ├── scenes/
│       │   ├── rendering/
│       │   ├── input/
│       │   └── ui/
│       └── index.html
│
├── packages/
│   ├── simulation/
│   │   └── src/
│   │       ├── battle/
│   │       ├── units/
│   │       ├── zones/
│   │       ├── commands/
│   │       ├── systems/
│   │       └── events/
│   │
│   ├── content/
│   │   └── src/
│   │       ├── cards.ts
│   │       ├── units.ts
│   │       └── balance.ts
│   │
│   └── ai/
│       └── src/
│           └── bot.ts
│
├── package.json
├── tsconfig.json
└── README.md


               ┌─────────────┐
               │   Player    │
               └──────┬──────┘
                      │ Commands
                      ▼
              ┌─────────────────┐
              │ BattleSimulation │
              │   TypeScript     │
              └────────┬────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        Bot controller      Phaser renderer


                                 A
                       [ ● ]
                      /     \
                     /       \
                    /         \
                   /           \
        SPAWN 1 [ ]             [ ] SPAWN 2
                 \               /
                  \             /
                   ●-----------●
                   B           C


                   spawn
  ↓
move toward objective
  ↓
enemy enters detection range?
  │
  ├── NO ──→ keep moving
  │
  └── YES
       ↓
     fight
       ↓
enemy defeated
       ↓
resume movement
       ↓
reach zone
       ↓
contest/capture

