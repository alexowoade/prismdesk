# PrismDesk — The Worn-Gear Doctor

A hands-first XR workbench that diagnoses gearbox failure and picks the alloy that fixes it.

Seated, hands-first mixed-reality mechanical inspection, tolerance analysis, and BOM teardown workbench for Meta Quest 3/3S and Meta VR Glasses. Built with plain Three.js and Vite. No controller ever, hand tracking only.

**Live WebXR:** https://silly-capybara-3678bd.netlify.app

**Competition:** Meta VR Start Developer Competition 2026, Track: Productivity, Division: New Experience.

## The 10-second moment

The wall board flips red (`CRITICAL BOTTLENECK: 511.8 MPa > 415 MPa YIELD`) to green (`VERIFIED NOMINAL: TI-6AL-4V INSTALLED, SF 2.45, 39°C, -39% MASS`) in one frame, when the worn Planet Gear B is replaced with a titanium one.

## Five mechanics

1. **Bimanual Exploded View** — pull the 10-part Industrial Planetary Gearbox and Actuator apart with both hands.
2. **Prism View Stress Spectrum** — left-palm wrist dial shows Violet nominal, Amber wear, Crimson critical.
3. **Finger-Caliper Tolerance Check** — thumb-index caliper with live laser and mm readouts. Planet Gear B: -0.42 mm tooth wear, 118°C.
4. **Desk Quarantine and BOM Triage Agent** — drop the worn gear on your real desk, Havok physics, the agent computes mass and cost and spawns a titanium replacement.
5. **Gaze-and-Pinch and Wall Blueprints** — persistent anchors on the wall.

## Physics solver

The solver is unit-tested. The same torque and RPM input always produces the same 10-part stress table, the same 5-alloy audit, and the same JSON manifest. 511.8 MPa at 420 Nm is not a demo number, it is the number.

- `computePartPhysics(partData, torqueNm, rpm)` returns bending stress, safety factor, temperature, and status.
- Verified at 420 Nm / 1800 RPM: Planet Gear B 511.8 MPa, SF 0.81, 118.0°C, critical.
- Titanium Ti-6Al-4V: 359.3 MPa, SF 2.45, 39.0°C. The only alloy that passes both physics and the $95 cost cap.

## Scene Understanding

The AR session requests plane-detection and snaps the quarantine tray to a real detected desk plane on physical Quest hardware. When no plane is available, as in the emulator, the tray anchors to a semi-transparent work-surface overlay so it never floats. Verified: overlay anchoring in emulator; real-desk snapping pending physical Quest hardware.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL in Chrome with the Immersive Web Emulator, or on a Quest 3/3S.

## Build for deploy

```bash
npm run build
```

Drag the `dist/` folder onto the Netlify site deploys page.
