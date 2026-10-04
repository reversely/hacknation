// Wren's mascot, a companion in the role panel's empty space. Its pose follows what the page is doing: pecking while a
// model works, wings up when something succeeds, leaning in when the chat answers, eyes closed after
// a while with nothing happening. Six small PNGs, served beside the bundle.

export type Pose = 'work' | 'idle' | 'look' | 'answer' | 'celebrate' | 'rest';
const POSES: Pose[] = ['work', 'idle', 'look', 'answer', 'celebrate', 'rest'];
export const poseUrl = (pose: Pose) => new URL(`./mascot/${pose}.png`, import.meta.url).href;
const url = poseUrl;
const ALT: Record<Pose, string> = { work: 'Wren is working', idle: 'Wren', look: 'Wren is waiting', answer: 'Wren answered', celebrate: 'Wren is celebrating', rest: 'Wren is resting' };

export class Mascot {
  readonly element: HTMLElement;
  private img: HTMLImageElement;
  private pose: Pose = 'idle';

  constructor() {
    // Load every pose once, so a change never waits on the network.
    for (const p of POSES) new Image().src = url(p);
    this.img = document.createElement('img');
    this.img.src = url('idle');
    this.img.alt = ALT.idle;
    this.img.width = 72;
    this.img.height = 72;
    this.element = document.createElement('div');
    this.element.className = 'mascot idle';
    this.element.setAttribute('role', 'img');
    this.element.append(this.img);
  }

  show(pose: Pose): void {
    if (pose === this.pose) return;
    this.element.classList.remove(this.pose);
    this.pose = pose;
    this.img.src = url(pose);
    this.img.alt = ALT[pose];
    this.element.classList.add(pose);
    this.element.classList.remove('hop');
    void this.element.offsetWidth; // restart the hop
    this.element.classList.add('hop');
  }

  // A blink every few seconds while idle or looking: the closed-eye pose for a moment.
  startBlinking(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setInterval(() => {
      if (this.pose !== 'idle' && this.pose !== 'look') return;
      const open = this.img.src;
      this.img.src = url('rest');
      setTimeout(() => {
        if (this.pose === 'idle' || this.pose === 'look') this.img.src = open;
      }, 160);
    }, 4200);
  }
}
