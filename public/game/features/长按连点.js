(function () {
    'use strict';

    const setupLongPressAutoClick = window.__MONSTER_SETUP_LONG_PRESS_AUTO_CLICK__;
    if (typeof setupLongPressAutoClick !== 'function') {
        console.error('[长按连点] 初始化入口不可用');
        return;
    }

    setupLongPressAutoClick();
})();
