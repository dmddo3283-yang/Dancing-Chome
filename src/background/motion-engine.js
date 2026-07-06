import { movementProfile, normalizeSettings } from "../shared/settings.js";

export class MotionEngine {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  start(browserWindow, settings) {
    if (!browserWindow?.id) throw new Error("움직일 Chrome 창을 찾지 못했습니다.");

    this.windowId = browserWindow.id;
    this.original = boundsOf(browserWindow);
    this.bounds = boundsOf(browserWindow);
    this.home = { x: this.bounds.left, y: this.bounds.top };
    this.pos = { x: this.bounds.left, y: this.bounds.top };
    this.settings = normalizeSettings(settings);
    this.lastUpdateAt = 0;
    this.swim = 0;
    this.level = 0;
    this.surge = 0;
    this.driftX = 0;
  }

  updateSettings(settings) {
    this.settings = normalizeSettings({ ...this.settings, ...settings });
  }

  step(frame, now = Date.now()) {
    if (!this.windowId || !this.bounds || !this.settings) return null;

    const profile = movementProfile(this.settings.intensity);
    if (now - this.lastUpdateAt < profile.updateInterval) return null;

    const dt = this.lastUpdateAt
      ? clamp((now - this.lastUpdateAt) / 1000, 0.001, 0.12)
      : profile.updateInterval / 1000;
    this.lastUpdateAt = now;

    const energy = clamp(Number(frame?.energy) || 0, 0, 1);
    const bass = clamp(Number(frame?.bass) || 0, 0, 1);
    const beat = Boolean(frame?.beat);
    const activity = Math.max(energy, bass * 0.85);

    // 음량 변화가 진폭에 곧바로 튀지 않도록 완만하게 따라간다.
    this.level = approach(this.level, activity, 3.2, dt);

    // 비트는 순간 점프가 아니라, 서서히 부풀었다 가라앉는 "물결(surge)"로 반영한다.
    if (beat) {
      const kick = 0.35 + this.settings.beatBoost / 100 * 0.5;
      this.surge = Math.min(1.4, this.surge + kick);
    }
    this.surge = approach(this.surge, 0, 2.4, dt);

    const settled = this.level < 0.02 && this.surge < 0.02 && !this.settings.driftEnabled;
    if (settled && Math.abs(this.pos.x - this.home.x) < 1 && Math.abs(this.pos.y - this.home.y) < 1) {
      return null;
    }

    // 유영 위상: 느리게 흐르되 소리가 커지거나 비트가 칠 때 살짝 빨라진다.
    const swimSpeed = profile.swimSpeed * (0.6 + this.level * 0.8) * (1 + this.surge * 0.7);
    this.swim += swimSpeed * dt;

    // 좌우로 크게 미끄러지고(주), 위아래로 완만히 물결치는(부) 범고래식 궤적.
    const amp = profile.reach * (this.level * 0.62 + this.surge * 0.5);
    const swayX = 0.8 * Math.sin(this.swim) + 0.2 * Math.sin(this.swim * 1.9 + 0.7);
    const swayY = Math.sin(this.swim * 0.5 + 1.2);

    if (this.settings.driftEnabled) {
      this.driftX += profile.driftSpeed * (0.35 + this.level) * dt;
    }

    const targetX = this.home.x + this.driftX + swayX * amp;
    const targetY = this.home.y + swayY * amp * 0.42;

    // 목표점을 향해 부드럽게 수렴(저역 통과) → 떨림 없이 미끄러진다.
    this.pos.x = approach(this.pos.x, targetX, profile.follow, dt);
    this.pos.y = approach(this.pos.y, targetY, profile.follow, dt);

    this.confine(profile);

    return {
      windowId: this.windowId,
      left: Math.round(this.pos.x),
      top: Math.round(this.pos.y)
    };
  }

  confine(profile) {
    // 드리프트 사용 시: 창이 오른쪽 밖으로 완전히 나가면(=화면 안 보임) 왼쪽 밖으로 감아 다시 헤엄쳐 들어온다.
    if (this.settings.driftEnabled) {
      const lap = this.settings.screen.width + this.bounds.width;
      if (this.pos.x > this.screenRight) {
        this.pos.x -= lap;
        this.driftX -= lap;
      } else if (this.pos.x + this.bounds.width < this.screenLeft) {
        this.pos.x += lap;
        this.driftX += lap;
      }
      this.pos.y = clamp(this.pos.y, this.screenTop, Math.max(this.screenTop, this.screenBottom - this.bounds.height));
      return;
    }

    const allowX = profile.offscreenEnabled ? this.bounds.width * 0.55 : 0;
    const allowY = profile.offscreenEnabled ? this.bounds.height * 0.35 : 0;
    this.pos.x = clamp(
      this.pos.x,
      this.screenLeft - allowX,
      Math.max(this.screenLeft - allowX, this.screenRight - this.bounds.width + allowX)
    );
    this.pos.y = clamp(
      this.pos.y,
      this.screenTop - allowY,
      Math.max(this.screenTop - allowY, this.screenBottom - this.bounds.height + allowY)
    );
  }

  getRestoreOperation() {
    if (!this.windowId || !this.original) return null;
    return { windowId: this.windowId, ...this.original };
  }

  reset() {
    this.windowId = null;
    this.original = null;
    this.bounds = null;
    this.home = null;
    this.pos = null;
    this.settings = null;
    this.lastUpdateAt = 0;
    this.swim = 0;
    this.level = 0;
    this.surge = 0;
    this.driftX = 0;
  }

  get screenLeft() {
    return this.settings.screen.availLeft;
  }

  get screenTop() {
    return this.settings.screen.availTop;
  }

  get screenRight() {
    return this.screenLeft + this.settings.screen.width;
  }

  get screenBottom() {
    return this.screenTop + this.settings.screen.height;
  }
}

function boundsOf(browserWindow) {
  return {
    left: Number(browserWindow.left) || 0,
    top: Number(browserWindow.top) || 0,
    width: Number(browserWindow.width) || 1000,
    height: Number(browserWindow.height) || 700
  };
}

// 프레임 간격(dt)에 무관하게 일정한 속도로 목표에 수렴하는 지수 감쇠 보간.
function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
