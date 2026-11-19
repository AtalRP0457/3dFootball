// Small procedural match sound system. It has no external asset or network
// dependencies and creates its AudioContext only after a user gesture.
export class MatchAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.crowdGain = null;
    this.enabled = true;
    this.inMatch = false;
  }

  unlock() {
    if (this.context) {
      this.context.resume?.();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? 0.65 : 0;
    this.master.connect(this.context.destination);
    this.startCrowd();
    this.context.resume?.();
  }

  startCrowd() {
    const ctx = this.context;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * 0.35;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    source.connect(filter);
    filter.connect(this.crowdGain);
    this.crowdGain.connect(this.master);
    source.start();
  }

  setInMatch(value) {
    this.inMatch = value;
    if (!this.context || !this.crowdGain) return;
    const now = this.context.currentTime;
    this.crowdGain.gain.setTargetAtTime(value && this.enabled ? 0.16 : 0, now, 0.7);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.65 : 0, this.context.currentTime, 0.03);
      this.crowdGain.gain.setTargetAtTime(this.enabled && this.inMatch ? 0.16 : 0, this.context.currentTime, 0.7);
    }
    return this.enabled;
  }

  tone(frequency, duration, volume = 0.07, type = 'sine', endFrequency = frequency) {
    if (!this.context || !this.enabled) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  noise(duration, volume = 0.04, frequency = 900) {
    if (!this.context || !this.enabled) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  playEvent(event) {
    if (!this.context || !this.enabled) return;
    if (event.type === 'kick') this.noise(0.055, 0.07, 420);
    else if (event.type === 'tackle') this.noise(0.08, 0.045, 220);
    else if (event.type === 'save') this.noise(0.12, 0.06, event.parry ? 300 : 520);
    else if (event.type === 'foul' || event.type === 'offside'
      || event.type === 'doubleTouch' || event.type === 'throwInGoal'
      || event.type === 'kickoffOwnGoal' || event.type === 'freeKickDirectGoal') {
      this.tone(1800, 0.24, 0.08, 'sine', 2350);
      this.tone(1650, 0.2, 0.06, 'sine', 2100);
    } else if (event.type === 'card') {
      this.tone(event.color === 'red' ? 920 : 1320, 0.22, 0.07, 'triangle', 760);
    } else if (event.type === 'substitution') {
      this.tone(660, 0.14, 0.04, 'sine', 520);
    } else if (event.type === 'injury') {
      this.tone(220, 0.3, 0.05, 'triangle', 180);
    } else if (event.type === 'goal') {
      this.tone(523, 0.45, 0.08, 'triangle', 660);
      this.tone(659, 0.55, 0.06, 'triangle', 784);
      this.crowdSurge();
    }
  }

  crowdSurge() {
    if (!this.context || !this.crowdGain || !this.enabled || !this.inMatch) return;
    const now = this.context.currentTime;
    this.crowdGain.gain.cancelScheduledValues(now);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, now);
    this.crowdGain.gain.linearRampToValueAtTime(0.32, now + 0.25);
    this.crowdGain.gain.setTargetAtTime(0.16, now + 1.2, 1.4);
  }
}
