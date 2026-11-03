// Settings > General "Task complete tone" (option tone, this device): a short two-note chime made with Web Audio when a
// task is completed. No sound file; loaded the first time it plays (views.js lazyModules "tone").
/** @type {AudioContext | null} */
let audio = null;

export function playTone() {
  try {
    const Ctx = globalThis.AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const a = /** @type {AudioContext} */ (audio);
    if (a.state === 'suspended') void a.resume();
    const t0 = a.currentTime;
    for (const [i, f] of [[0, 784], [1, 1175]]) {
      const osc = a.createOscillator(), gain = a.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const at = t0 + i * 0.09;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      osc.connect(gain).connect(a.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    }
  } catch { /* no sound on this device */ }
}
