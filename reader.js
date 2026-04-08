(function () {
  const root = document.getElementById('root');
  const status = document.getElementById('status');

  const searchParams = new URLSearchParams(window.location.search);
  const hashRaw = String(window.location.hash || '').replace(/^#/, '');
  const hashParams = new URLSearchParams(hashRaw);
  const getParam = (key) => {
    const fromHash = hashParams.get(key);
    if (fromHash != null && String(fromHash).trim() !== '') return fromHash;
    const fromSearch = searchParams.get(key);
    return fromSearch;
  };

  const backend = String(getParam('backend') || '').replace(/\/$/, '');
  const manga = String(getParam('manga') || '').trim();
  const chapter = String(getParam('chapter') || '').trim();
  const mode = String(getParam('mode') || 'horizontal').trim().toLowerCase() === 'vertical' ? 'vertical' : 'horizontal';
  const resumeIndex = Number(getParam('resumeIndex'));
  const resumeOffset = Number(getParam('resumeOffset'));
  const FALLBACK_BACKEND = 'https://backend-kami-api-production.up.railway.app';

  let imageElements = [];
  let lastProgressSentAt = 0;
  let progressFrame = 0;
  let resumedOnce = false;

  const setStatus = (msg) => {
    if (!status) return;
    status.innerHTML = '<div class="box">' + msg + '</div>';
  };

  const escapeHtml = (value) => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  const setError = (title, detail) => {
    if (!status) return;
    status.innerHTML = [
      '<div class="box">',
      '<strong>' + escapeHtml(title) + '</strong>',
      '<div style="margin-top:10px;opacity:.9;line-height:1.45">' + escapeHtml(detail) + '</div>',
      '<div style="margin-top:12px;opacity:.7;font-size:12px">manga=' + escapeHtml(manga) + ' | chapter=' + escapeHtml(chapter) + '</div>',
      '</div>'
    ].join('');
  };

  const blockNavigation = () => {
    const post = (type, payload) => {
      if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...(payload || {}) }));
      } catch {
        window.ReactNativeWebView.postMessage(String(type));
      }
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchLastY = 0;
    let lastY = 0;
    let lastNearEndAt = 0;
    let lastNearTopAt = 0;

    const sendProgress = (force) => {
      if (!imageElements.length) return;

      const now = Date.now();
      if (!force && now - lastProgressSentAt < 320) return;

      const viewportHeight = Math.max(0, Number(window.innerHeight || 0));
      let currentIndex = -1;
      let maxVisibleIndex = -1;

      for (let i = 0; i < imageElements.length; i += 1) {
        const element = imageElements[i];
        const rect = element.getBoundingClientRect();
        const visible = rect.bottom > 24 && rect.top < viewportHeight - 24;

        if (visible && currentIndex === -1) {
          currentIndex = i;
        }

        if (visible) {
          maxVisibleIndex = i;
        }
      }

      if (currentIndex === -1) {
        for (let i = 0; i < imageElements.length; i += 1) {
          const rect = imageElements[i].getBoundingClientRect();
          if (rect.bottom >= 0) {
            currentIndex = i;
            break;
          }
        }
      }

      if (currentIndex === -1) {
        currentIndex = Math.max(0, imageElements.length - 1);
      }

      if (maxVisibleIndex === -1) {
        maxVisibleIndex = currentIndex;
      }

      const currentImage = imageElements[currentIndex];
      const currentPage = Number(currentImage && currentImage.dataset && currentImage.dataset.page);

      lastProgressSentAt = now;
      post('progress', {
        imageIndex: currentIndex,
        imagePage: Number.isFinite(currentPage) ? currentPage : currentIndex + 1,
        maxVisibleImageIndex: maxVisibleIndex,
        scrollOffset: Math.max(0, Math.round(Number(window.scrollY || window.pageYOffset || 0))),
      });
    };

    const scheduleProgress = (force) => {
      if (progressFrame) {
        window.cancelAnimationFrame(progressFrame);
      }

      progressFrame = window.requestAnimationFrame(function () {
        progressFrame = 0;
        sendProgress(force);
      });
    };

    document.addEventListener('touchstart', function (e) {
      const t = e && e.touches && e.touches[0];
      if (t) {
        touchStartX = Number(t.clientX || 0);
        touchStartY = Number(t.clientY || 0);
        touchLastY = touchStartY;
      }
    }, { passive: true, capture: true });

    document.addEventListener('touchmove', function (e) {
      const t = e && e.touches && e.touches[0];
      if (t) {
        touchLastY = Number(t.clientY || 0);
      }
    }, { passive: true, capture: true });

    document.addEventListener('touchend', function (e) {
      const t = e && e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = Number(t.clientX || 0) - touchStartX;
      const dy = Number(t.clientY || 0) - touchStartY;
      const y = Math.max(0, Number(window.scrollY || window.pageYOffset || 0));
      const h = Math.max(0, Number(window.innerHeight || 0));
      const total = Math.max(0, Number(document.documentElement.scrollHeight || document.body.scrollHeight || 0));
      const nearTop = y <= 18;
      const nearBottom = total - (y + h) <= 120;

      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        post('tap');
        return;
      }

      if (mode === 'horizontal' && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0) post('swipeLeft');
        if (dx > 0) post('swipeRight');
        return;
      }

      if (mode === 'vertical' && Math.abs(dy) > 72 && Math.abs(dy) > Math.abs(dx) * 1.1) {
        if (nearBottom && dy < 0) {
          post('chapterNext');
          return;
        }

        if (nearTop && dy > 0) {
          post('chapterPrev');
          return;
        }
      }
    }, { passive: true, capture: true });

    document.addEventListener('click', function (e) {
      post('tap');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }, true);

    document.addEventListener('scroll', function () {
      const y = Math.max(0, Number(window.scrollY || window.pageYOffset || 0));
      const h = Math.max(0, Number(window.innerHeight || 0));
      const total = Math.max(0, Number(document.documentElement.scrollHeight || document.body.scrollHeight || 0));
      const distToEnd = total - (y + h);
      const now = Date.now();

      if (distToEnd <= 120 && now - lastNearEndAt > 900) {
        lastNearEndAt = now;
        if (mode === 'vertical' && touchLastY < touchStartY) {
          post('chapterNext');
        } else if (mode !== 'vertical') {
          post('nearEnd');
        }
      }

      const pullingDownAtTop = mode === 'vertical' && y <= 16 && touchLastY > touchStartY;
      const movingUp = y < lastY;
      if ((pullingDownAtTop || (mode !== 'vertical' && y <= 16 && movingUp)) && now - lastNearTopAt > 900) {
        lastNearTopAt = now;
        post(mode === 'vertical' ? 'chapterPrev' : 'nearTopPull');
      }

      lastY = y;
      scheduleProgress(false);
    }, { passive: true, capture: true });

    document.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }, true);

    window.open = function () { return null; };

    window.addEventListener('load', function () {
      scheduleProgress(true);
    });

    window.addEventListener('beforeunload', function () {
      sendProgress(true);
    });
  };

  const restorePosition = () => {
    if (resumedOnce) return;
    resumedOnce = true;

    const apply = function () {
      if (Number.isFinite(resumeOffset) && resumeOffset > 0) {
        window.scrollTo(0, Math.max(0, Math.round(resumeOffset)));
        return;
      }

      if (Number.isFinite(resumeIndex) && resumeIndex >= 0 && imageElements.length) {
        const target = imageElements[Math.min(imageElements.length - 1, Math.max(0, Math.round(resumeIndex)))];
        if (target && target.scrollIntoView) {
          target.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      }
    };

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        apply();
      });
    });

    window.setTimeout(apply, 180);
  };

  const renderImages = (images) => {
    root.innerHTML = '';
    imageElements = [];

    images.forEach(function (item, index) {
      const src = String((item && item.url) || '').trim();
      if (!src) return;
      const intrinsicWidth = Math.max(0, Number(item && item.w) || 0);
      const intrinsicHeight = Math.max(0, Number(item && item.h) || 0);
      const frame = document.createElement('div');
      const img = document.createElement('img');

      frame.className = 'chapter-frame';

      if (intrinsicWidth > 0 && intrinsicHeight > 0) {
        frame.style.aspectRatio = intrinsicWidth + ' / ' + intrinsicHeight;
        img.width = intrinsicWidth;
        img.height = intrinsicHeight;
      }

      img.src = src;
      img.className = 'chapter-img';
      img.loading = 'eager';
      img.decoding = 'async';
      img.addEventListener('load', function () {
        img.classList.add('is-ready');
      }, { once: true });
      img.dataset.index = String(index);
      img.dataset.page = String(Number(item && item.page) || index + 1);

      frame.appendChild(img);
      root.appendChild(frame);
      imageElements.push(img);
    });
    blockNavigation();
    restorePosition();
  };

  const run = async () => {
    if (!backend || !manga || !chapter) {
      setError('Parámetros inválidos.', 'Falta backend, manga o chapter en la URL.');
      return;
    }

    try {
      setStatus('Cargando imágenes...');

      const candidates = [backend, FALLBACK_BACKEND].filter((v, i, arr) => v && arr.indexOf(v) === i);
      let lastError = 'Error desconocido';
      let images = [];

      for (const base of candidates) {
        const url = base + '/chapter/' + encodeURIComponent(manga) + '/' + encodeURIComponent(chapter) + '/images';
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          const res = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (!res.ok) {
            lastError = 'HTTP ' + res.status + ' en ' + base;
            continue;
          }

          const data = await res.json();
          images = Array.isArray(data && data.images) ? data.images : [];
          if (images.length) {
            break;
          }
          lastError = 'Respuesta sin imágenes en ' + base;
        } catch (err) {
          const raw = (err && err.message) ? err.message : String(err);
          lastError = raw + ' en ' + base;
        }
      }

      if (!images.length) {
        setError('No se encontraron imágenes.', lastError);
        return;
      }

      renderImages(images);
    } catch (err) {
      const raw = (err && err.message) ? err.message : String(err);
      setError('No se pudo cargar el capítulo.', raw);
    }
  };

  run();
})();
