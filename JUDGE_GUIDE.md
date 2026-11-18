# PrismDesk — Judge Guide

**Version:** v8.9.5 (10/10 in emulator testing)
**Live link:** https://silly-capybara-3678bd.netlify.app
**Track:** Productivity / **Division:** New Experience
**Video:** under 3:00, see Devpost

## How to open it

Open the live link in the Meta Quest 3 / 3S browser. It also runs in a desktop
browser in 2D (mouse and keyboard) and in the Immersive Web Emulator.
No install and no sign-in are needed.

## The judge journey (about 3 minutes)

Follow these steps in order. Each one shows a working mechanic.

1. **Start the Guided Tour.** Click "Guided Tour". The tour has 7 steps and
   walks through the whole app. Use TOUR NEXT / PREV, or the ArrowRight /
   ArrowLeft keys, to move through it.
2. **Explode the gearbox.** Step 2 of the tour explodes the 10-part Industrial
   Planetary Gearbox and Actuator. All 10 parts separate (PG-01, PG-02,
   PG-03A, PG-03B, PG-03C, PG-04 to PG-08).
3. **Prism View.** Switch on Prism View. The parts colour by stress:
   violet nominal, amber wear, crimson critical. PG-03B reads 511.8 MPa,
   safety factor 0.81, 118 C, critical.
4. **Finger caliper.** Use the caliper to measure a gear. The live laser and
   mm readouts show the wear.
5. **Gaze dwell.** Look at a wrist button (for example TORQUE +20) for
   1.35 seconds. The reticle grows and turns amber, the 360 degree arc fills
   amber and turns emerald when it fires, and the button face itself glows
   amber while charging. Torque rises by exactly 20 Nm per dwell.
6. **Poke.** Tap a wrist button with your finger. It fires exactly once per
   poke. Try moving out and back, or pulling back and returning, it fires
   once per cycle.
7. **Plane snap.** Press P. The quarantine tray snaps to the real desk.
   The prompt reads: "Quarantine tray snapped to real desk (desk y=0.74m,
   tray surface y=0.765m [Emulator 0.74m Plane])".
8. **Quarantine and BOM.** Drop the worn gear on the desk tray. The BOM
   Triage Agent ("Pulse") computes the replacement: titanium, 359.3 MPa,
   safety factor 2.45, 39 C. Final BOM $390.50, mass 5.03 kg.
9. **Export.** Use Export JSON. It produces a manifest with a scannable QR
   code.

## Expected values (for checking)

- Before the tour: Torque 420 Nm, RPM 1800, BOM $342.00, mass 5.28 kg,
  peak stress 512 MPa.
- After the tour: BOM $390.50, mass 5.03 kg, peak 359 MPa.
- PG-03B worn: 511.8 MPa / SF 0.81 / 118 C (critical).
- Titanium fresh: 359.3 MPa / SF 2.45 / 39 C.
- Titanium worn safety factor 1.72.
- RPM +100 and -100 each fire once; the 2D slider, the XR banner, and the
  wall board all agree.

## What is honest about this build

- Tested 10/10 in the Immersive Web Emulator (gate, baseline, tour, plane
  snap, keyguard, dwell with face glow, poke by click, debounce, Escape,
  RPM). The poke entry and the keyguard were confirmed in focused retests.
- Real Quest 3/3S hand tracking, real-desk plane detection, and a measured
  60 fps have not been tested on real hardware yet. The emulator is the
  test environment used here.
- The BOM agent ("Pulse") is deterministic logic inside the app, not a live
  AI call. That is by design, so the audit trail is exact and repeatable.
- There is no time limit anywhere in the app. The gaze dwell of 1.35s is
  the only timed interaction, and it is user-chosen.
