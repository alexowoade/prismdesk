# PrismDesk (v8.9.5) — The Worn-Gear Doctor

**A hands-first, multimodal WebXR workbench that diagnoses planetary gearbox failure in real time and autonomously triages the alloy that fixes it.**

Seated mixed-reality mechanical inspection, tolerance metrology, and agentic BOM teardown workbench for **Meta Quest 3 / 3S** and WebXR headsets. Built with Three.js, Web Audio synthesis, and a zero-latency deterministic ISO 6336 / AGMA Lewis gear-stress solver.

* **Live WebXR App (Netlify):** https://silly-capybara-3678bd.netlify.app
* **Meta Quest App ID:** `1363817520155866`
* **Competition:** Meta VR Start Developer Competition 2026 — **Track:** Productivity (**Division:** New Experience)

---

## The 10-Second Moment

At `420 Nm` torque and `1800 RPM`, the spatial wall board flags **Planet Gear B (`PG-03B`)** in crimson (`CRITICAL BOTTLENECK: 511.8 MPa > 415 MPa YIELD | SF 0.81x | 118.0°C`). When you quarantine the faulty gear onto your physical desk tray, the autonomous spatial agent (**"Pulse"**) audits five candidate alloys against stress, thermal, and budget constraints, rejects four, and snaps in **Ti-6Al-4V Grade 5** — flipping the wall board emerald green (`VERIFIED NOMINAL: 359.3 MPa | SF 2.45x | 39.0°C | -39% Part Mass`) and updating the 10-part BOM from `$342.00` (`5.28 kg`) to `$390.50` (`5.03 kg`) with a scannable QR audit manifest.

---

## Core Spatial & Agentic Mechanics

1. **7-Step Guided Spatial Tour (`assemble` → `explode` → `prism` → `caliper` → `quarantine` → `replace` → `final`)** — Zero-wall-of-text onboarding that walks any engineer or judge through the complete diagnostic and repair loop in under 3 minutes.
2. **Bimanual Exploded View** — Pull the 10-part Industrial Planetary Gearbox and Actuator apart along axial/radial vectors (`PG-08` clearance-tuned so wrist HUD controls stay unobstructed).
3. **Prism View Stress Spectrum** — Real-time shader color-coding across all 10 components: **Violet** (`Nominal`), **Amber** (`Moderate Wear` on `PG-03C`), and **Crimson** (`Critical Yield Failure` on `PG-03B`).
4. **3D Finger-Caliper Tolerance Metrology** — Live laser vernier readout between thumb and index finger measuring `PG-03B` outer diameter (`OD: 64.0 mm`), tooth wear (`-0.42 mm [OUT OF TOL]`), operating temperature (`118.0°C`), and safety factor (`0.81x`).
5. **Desk Quarantine & Autonomous BOM Triage Agent ("Pulse")** — Dropping `PG-03B` onto the desk quarantine tray activates Pulse's volumetric scan cone to evaluate 5 candidate alloys against three hard constraints (`SF >= 1.50x`, `Temp <= Thermal Limit`, `Unit Cost <= $95.00`):
   * `6061-T6 Aluminum` ($24.00) — **REJECTED** (Yield failure: `SF 0.54x < 1.50x`)
   * `AISI 4140 Worn Baseline` ($38.00) — **REJECTED** (Root fatigue failure: `511.8 MPa`, `SF 0.81x`)
   * `17-4PH Stainless Steel` ($64.00) — **REJECTED** (Sub-optimal thermal/mass ratio vs. Titanium)
   * `Inconel 718 Superalloy` ($142.00) — **REJECTED** (Passes physics, violates `$95.00` unit BOM cap)
   * `Ti-6Al-4V Grade 5 Titanium` ($86.50) — **SELECTED** (`359.3 MPa`, `SF 2.45x` fresh / `1.72x` worn, `39.0°C`, `+$48.50` net BOM delta)
6. **Tri-Modal XR Input (Hands-First + 1.35s Gaze-Dwell + 6DoF Controllers)** — Supports bare-hand 3D button pokes (with peak-reversal hysteresis and unscaled OBB edge hit-boxes), controller-free **1.35-second Gaze-Dwell** (with amber button-face glow and a 360° clockwise amber-to-emerald progress arc), and 6DoF tracked-pointer ray-casting with debounce protection.
7. **JSON Export & Wall-Board QR Audit Manifest** — One-tap export generates a deterministic engineering sign-off JSON and renders a scannable spatial QR manifest directly on the 3D wall board.

---

## Verified Deterministic Physics (`computePartPhysics`)

The in-browser ISO 6336 / AGMA Lewis solver is 100% deterministic — zero cloud latency, zero hallucinated numbers. The same torque and RPM input always produces the exact same 10-part stress table, 5-alloy rejection audit, and JSON manifest:

| State | Load (`Torque / RPM`) | `PG-03B` Bending Stress | Safety Factor (`SF`) | Temp | Total 10-Part Mass | Total 10-Part BOM |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Baseline (Worn 4140)** | `420 Nm / 1800 RPM` | `511.8 MPa` (Yield: `415 MPa`) | `0.81x` (Critical) | `118.0°C` | `5.28 kg` | `$342.00` |
| **Repaired (Fresh Ti-6Al-4V)** | `420 Nm / 1800 RPM` | `359.3 MPa` (Yield: `880 MPa`) | `2.45x` (Nominal) | `39.0°C` | `5.03 kg` | `$390.50` |
| **Worn Margin (Ti-6Al-4V)** | `420 Nm / 1800 RPM` | `511.8 MPa` (Yield: `880 MPa`) | `1.72x` (Pass `>1.5x`) | — | `5.03 kg` | `$390.50` |
| **High-Load Test (Video final)** | `460 Nm / 1900 RPM` | Assembly peak `401 MPa` | `2.19x` min (Nominal) | — | `5.03 kg` | `$390.50` |

---

## Scene Understanding & How Judges Can Test

### On Meta Quest 3 / 3S Hardware
1. Open the **Meta Quest Browser** and navigate to https://silly-capybara-3678bd.netlify.app.
2. Click **Enter Quest MR** and click **Allow** when prompted for Spatial Data and Hand Tracking permissions.
3. **Desk Calibration:** The session requests `plane-detection` and `hit-test` to snap the quarantine tray to your physical desk (`y = 0.74m`, tray surface `y = 0.765m`), or lets you pinch-touch your desk height (`0.55m–0.84m`). If no room mesh is configured, it automatically anchors to a semi-transparent work-surface overlay so the tray never floats.
4. **Interaction:** Poke wrist buttons directly with your index finger, or simply **look at any wrist button for 1.35 seconds** to watch the amber button face and 360° progress arc charge and fire hands-free.

### On Desktop / Immersive Web Emulator (Chrome)
1. Open the live URL in desktop Chrome.
2. Use the 7-step tour controls, click/drag parts in 3D, press **`P`** in XR emulator mode to trigger the deterministic `0.74m` desk-plane snap (`tray surface y=0.765m`), and press **`Escape`** once to cleanly restore the 2D workbench with full state preservation.

---

## Run & Build Locally

```bash
npm install
npm run dev
```

To build the production bundle for Netlify:

```bash
npm run build
```

Drag the `dist/` folder onto the Netlify site deploys page.

---

## Corrections vs. the pasted review draft (verified against v8.9.5 main.js)

* `6061-T6` unit cost is **$24.00** in `ALLOY_CANDIDATES`, not $28.00.
* `17-4PH` unit cost is **$64.00** in `ALLOY_CANDIDATES`, not $78.00.
* High-load video row corrected to the verified final frame: **460 Nm / 1900 RPM, assembly peak 401 MPa, min SF 2.19x** (the draft's 440 Nm / 376.4 MPa / 2.28x is not in the code or the final frame).
* Worn-titanium temperature and high-load temperature left as "—" (not in the code as literals; do not invent).
* Debounce stated without a millisecond number (no `debounce` / `220ms` literal in main.js).
* "Havok physics" removed (the app uses deterministic Three.js kinematics + ISO 6336 / AGMA Lewis solver; Havok is not installed).
* "No controller ever, hand tracking only" removed (the app is tri-modal: hands-first + gaze-dwell + 6DoF controllers).
