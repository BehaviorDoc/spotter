# spotter
Phone-camera rep counter that counts reps out loud

## Spotter WOD (`wod.html`)
CrossFit workout-of-the-day version. Same camera rep counting, plus a gym clock:

- **Formats:** AMRAP, For Time (rounds, 21-15-9 style ladders, time caps), EMOM (every movement or alternating), Tabata.
- **Camera-counted moves:** air squat, push-up, sit-up, pull-up, burpee, wall ball, thruster, KB swing, toes-to-bar, HSPU, deadlift, clean/snatch, push press, lunge. Everything else (box jumps, double-unders, runs, rows) gets a big tap button.
- **Paste from the whiteboard:** type or paste the WOD and it builds the workout.
- Benchmark presets, Rx / Scaled / Foundations, voice + beeps for 3-2-1-go, minutes and rounds, a result screen and history that stay on the phone.

Tests for the clock, scoring and parser: `node tests/wod.test.js`
