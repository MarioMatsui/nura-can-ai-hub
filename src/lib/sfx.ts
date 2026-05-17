import uploadFoi from '@/assets/uploadFoi.mp3';
import receitaFoi from '@/assets/receitaFoi.mp3';

const cache = new Map<string, HTMLAudioElement>();
const lastPlay = new Map<string, number>();

export function playSfx(name: 'upload' | 'receita') {
  const src = name === 'upload' ? uploadFoi : receitaFoi;
  const now = Date.now();
  if (now - (lastPlay.get(name) ?? 0) < 300) return;
  lastPlay.set(name, now);
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = 'auto';
    cache.set(name, audio);
  }
  try {
    audio.currentTime = 0;
  } catch {
    /* noop */
  }
  audio.volume = 0.6;
  audio.play().catch(() => {
    /* silencia bloqueios de autoplay */
  });
}
