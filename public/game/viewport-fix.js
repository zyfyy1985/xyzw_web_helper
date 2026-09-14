(function () {
  'use strict';

  var root = document.documentElement;
  var updatePending = false;
  var lastViewport = null;
  var cocosSyncTimer = null;
  var cocosStableChecks = 0;
  var forceCocosLayout = true;
  var settleTimers = [];

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

  function viewportSizeMatches(size, viewport) {
    return Boolean(
      size
      && Math.abs(Number(size.width) - viewport.width) <= 1
      && Math.abs(Number(size.height) - viewport.height) <= 1
    );
  }

  function applyDocumentViewport(viewport) {
    var body = document.body;
    if (!body) return;

    body.style.top = viewport.top + 'px';
    body.style.left = viewport.left + 'px';
    body.style.width = viewport.width + 'px';
    body.style.height = viewport.height + 'px';
  }

  function syncCocosViewport(viewport) {
    var cocos = window.cc;
    if (!cocos || !cocos.view || !cocos.game || !cocos.game.frame) return false;
    if (typeof cocos.view.setFrameSize !== 'function') return false;

    var body = document.body;
    var frameChanged = false;

    // Cocos normally uses documentElement as the frame when the canvas lives
    // directly under body. Its browser adapter then reads window.innerHeight,
    // which can lag behind visualViewport while the mobile address bar moves.
    // A sized body gives the engine one stable, measurable viewport source.
    if (
      body
      && cocos.game.container
      && cocos.game.container.parentNode === body
      && cocos.game.frame !== body
    ) {
      cocos.game.frame = body;
      frameChanged = true;
    }

    var currentSize = typeof cocos.view.getFrameSize === 'function'
      ? cocos.view.getFrameSize()
      : null;

    if (forceCocosLayout || frameChanged || !viewportSizeMatches(currentSize, viewport)) {
      cocos.view.setFrameSize(viewport.width, viewport.height);
    }

    currentSize = typeof cocos.view.getFrameSize === 'function'
      ? cocos.view.getFrameSize()
      : null;

    var synced = viewportSizeMatches(currentSize, viewport);
    if (synced) forceCocosLayout = false;
    return synced;
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
    var sizeChanged = !lastViewport
      || lastViewport.width !== roundedWidth
      || lastViewport.height !== roundedHeight;

    if (sizeChanged) forceCocosLayout = true;

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
    applyDocumentViewport(lastViewport);
    cocosStableChecks = 0;
    syncCocosViewport(lastViewport);
    startCocosSync();
    dispatchViewportChange(lastViewport);
  }

  function scheduleUpdate(forceLayout) {
    if (forceLayout === true) forceCocosLayout = true;
    if (updatePending) return;
    updatePending = true;
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(updateVisibleViewport);
    } else {
      window.setTimeout(updateVisibleViewport, 0);
    }
  }

  function clearSettleTimers() {
    settleTimers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    settleTimers = [];
  }

  function scheduleSettledUpdates() {
    clearSettleTimers();
    [120, 360, 900].forEach(function (delay) {
      settleTimers.push(window.setTimeout(function () {
        scheduleUpdate(true);
      }, delay));
    });
  }

  function handleViewportLayoutChange() {
    scheduleUpdate(true);
    scheduleSettledUpdates();
  }

  updateVisibleViewport();
  window.addEventListener('resize', handleViewportLayoutChange, false);
  window.addEventListener('load', handleViewportLayoutChange, false);
  window.addEventListener('focus', handleViewportLayoutChange, false);
  window.addEventListener('pageshow', handleViewportLayoutChange, false);
  window.addEventListener('orientationchange', handleViewportLayoutChange, false);

  document.addEventListener('DOMContentLoaded', handleViewportLayoutChange, false);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') handleViewportLayoutChange();
  }, false);

  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', handleViewportLayoutChange, false);
    window.visualViewport.addEventListener('scroll', function () {
      scheduleUpdate(false);
    }, false);
  }
})();
