export function scrollToSection(selector: string) {
  const target = document.querySelector(selector);
  if (!target) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const initialScrollY = window.scrollY;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

  if (!reduceMotion) {
    window.setTimeout(() => {
      const hasNotMoved = Math.abs(window.scrollY - initialScrollY) < 2;
      const targetStillFar = Math.abs(target.getBoundingClientRect().top) > 140;
      if (hasNotMoved && targetStillFar) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }, 120);
  }
}
