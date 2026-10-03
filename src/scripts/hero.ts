/**
 * Вращающийся знак на первом экране: видео стартует после загрузки страницы,
 * на паузе вне экрана. При prefers-reduced-motion остаётся неподвижный кадр (poster).
 */
import { onPage, prefersReducedMotion } from './lifecycle.ts';

onPage(() => {
  const video = document.querySelector<HTMLVideoElement>('[data-hero-video]');
  if (!video || prefersReducedMotion()) return;

  video.preload = 'auto';
  const play = () => {
    void video.play().catch(() => {
      /* автозапуск запрещён браузером — остаётся кадр-заставка */
    });
  };

  const observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) play();
    else video.pause();
  });
  observer.observe(video);

  return () => {
    observer.disconnect();
    video.pause();
  };
});
