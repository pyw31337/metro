# Subway Optimization Tasks

- [x] **Stabilization & Crash Fixes**
    - [x] Resolve MapLibre `beforeId` layer order error in `SubwayLayers.tsx`.
    - [x] Fix `filter` prop null-type error in `TrainLayers.tsx`.
    - [x] Implement robust `Content-Type` validation in `api-client.ts` to prevent JSON parsing crashes.
- [x] **Topology Correction**
    - [x] Update 샛강 (Saetgang) and 대방 (Daebang) coordinates in `subway-lines.ts`.
    - [x] Verify 가좌 (Gajwa) and 서강대 (Sogang Univ.) line branch logic.
- [x] **Premium UI Implementation**
    - [x] Design and implement vertical station timeline in `UnifiedBottomPanel.tsx`.
    - [x] Add arrival estimates and "Fast Transfer" badges to the timeline.
- [x] **Map Visualization**
    - [x] Implement Route Dimming in `SubwayLayers.tsx` to highlight active paths.
    - [x] Update station and label opacity based on active route state.
- [x] **Deployment & Verification**
    - [x] Test routing for key problematic paths
    - [x] Deploy to production
