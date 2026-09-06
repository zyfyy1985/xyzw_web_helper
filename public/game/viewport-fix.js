(function () {
  'use strict';

  var root = document.documentElement;
  var updatePending = false;
  var lastViewport = null;
  var cocosSyncTimer = null;
  var cocosStableChecks = 0;

  function positiveNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function readCssPixel(name) {
    if (typeof window.getComputedStyle !== 'function') return 0;
    var value = window.getComputedStyle(root).getPropertyValue(name);
    var number = parseFloat(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function readSafeAreaInsets() {
    return {
      top: readCssPixel('--h5-safe-area-inset-top'),
      right: readCssPixel('--h5-safe-area-inset-right'),
      bottom: readCssPixel('--h5-safe-area-inset-bottom'),
      left: readCssPixel('--h5-safe-area-inset-left')
    };
  }

  function syncCocosViewport(viewport) {
    var cocos = window.cc;
    if (!cocos || !cocos.view || !cocos.game || !cocos.game.frame) return false;
    if (typeof cocos.view.setFrameSize !== 'function') return false;

    var currentSize = typeof cocos.view.getFrameSize === 'function'
      ? cocos.view.getFrameSize()
      : null;
    var widthMatches = currentSize && Math.abs(Number(currentSize.width) - viewport.width) <= 1;
    var heightMatches = currentSize && Math.abs(Number(currentSize.height) - viewport.height) <= 1;

    if (!widthMatches || !heightMatches) {
      cocos.view.setFrameSize(viewport.width, viewport.height);
    }

    return true;
  }

  function dispatchViewportChange(viewport) {
    var event;
    try {
      event = new CustomEvent('monster:h5-viewport-change', { detail: viewport });
    } catch (error) {
      event = document.createEvent('Event');
      event.initEvent('monster:h5-viewport-change', false, false);
      event.detail = viewport;
    }
    window.dispatchEvent(event);
  }

  function startCocosSync() {
    if (cocosSyncTimer !== null) return;

    cocosSyncTimer = window.setInterval(function () {
      if (!lastViewport || !syncCocosViewport(lastViewport)) {
        cocosStableChecks = 0;
        return;
      }

      cocosStableChecks += 1;
      if (cocosStableChecks >= 12) {
        window.clearInterval(cocosSyncTimer);
        cocosSyncTimer = null;
      }
    }, 250);
  }

  function updateVisibleViewport() {
    updatePending = false;

    var viewport = window.visualViewport;
    var width = positiveNumber(viewport && viewport.width)
      || positiveNumber(window.innerWidth)
      || positiveNumber(root.clientWidth);
    var height = positiveNumber(viewport && viewport.height)
      || positiveNumber(window.innerHeight)
      || positiveNumber(root.clientHeight);
    var offsetLeft = viewport ? Math.max(0, Number(viewport.offsetLeft) || 0) : 0;
    var offsetTop = viewport ? Math.max(0, Number(viewport.offsetTop) || 0) : 0;
    var roundedWidth = Math.max(1, Math.round(width));
    var roundedHeight = Math.max(1, Math.round(height));
    var roundedLeft = Math.round(offsetLeft);
    var roundedTop = Math.round(offsetTop);
    var safeAreaInsets = readSafeAreaInsets();

    root.style.setProperty('--h5-visible-viewport-width', roundedWidth + 'px');
    root.style.setProperty('--h5-visible-viewport-height', roundedHeight + 'px');
    root.style.setProperty('--h5-visible-viewport-left', roundedLeft + 'px');
    root.style.setProperty('--h5-visible-viewport-top', roundedTop + 'px');
    root.classList.add('monster-h5-viewport-ready');

    lastViewport = {
      width: roundedWidth,
      height: roundedHeight,
      left: roundedLeft,
      top: roundedTop,
      safeAreaInsets: safeAreaInsets,
      safeArea: {
        left: safeAreaInsets.left,
        right: Math.max(safeAreaInsets.left, roundedWidth - safeAreaInsets.right),
        top: safeAreaInsets.top,
        bottom: Math.max(safeAreaInsets.top, roundedHeight - safeAreaInsets.bottom),
        width: Math.max(0, roundedWidth - safeAreaInsets.left - safeAreaInsets.right),
        height: Math.max(0, roundedHeight - safeAreaInsets.top - safeAreaInsets.bottom)
      }
    };

    window.__MONSTER_H5_VIEWPORT__ = lastViewport;
    cocosStableChecks = 0;
    syncCocosViewport(lastViewport);
    startCocosSync();
    dispatchViewportChange(lastViewport);
  }

  function scheduleUpdate() {
    if (updatePending) return;
    updatePending = true;
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(updateVisibleViewport);
    } else {
      window.setTimeout(updateVisibleViewport, 0);
    }
  }

  updateVisibleViewport();
  window.addEventListener('resize', scheduleUpdate, false);
  window.addEventListener('load', scheduleUpdate, false);
  window.addEventListener('focus', scheduleUpdate, false);
  window.addEventListener('pageshow', scheduleUpdate, false);
  window.addEventListener('orientationchange', function () {
    scheduleUpdate();
    window.setTimeout(scheduleUpdate, 80);
    window.setTimeout(scheduleUpdate, 250);
    window.setTimeout(scheduleUpdate, 600);
  }, false);

  document.addEventListener('DOMContentLoaded', scheduleUpdate, false);

  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', scheduleUpdate, false);
    window.visualViewport.addEventListener('scroll', scheduleUpdate, false);
  }
})();
