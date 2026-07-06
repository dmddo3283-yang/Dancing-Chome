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
    this.dirX = 0;
    this.dirY = 0;
    this.nextDartAt = 0;
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

    // 소리에 즉각 반응하도록 빠르게 따라간다(=더 정신없이).
    this.level = approach(this.level, activity, 6, dt);

    if (beat) {
      const kick = 0.45 + this.settings.beatBoost / 100 * 0.6;
      this.surge = Math.min(1.6, this.surge + kick);
    }
    this.surge = approach(this.surge, 0, 3.4, dt);

    const heat = Math.min(1, this.level + this.surge);
    const settled = this.level < 0.02 && this.surge < 0.02 && !this.settings.driftEnabled;
    if (settled && Math.abs(this.pos.x - this.home.x) < 1 && Math.abs(this.pos.y - this.home.y) < 1) {
      return null;
    }

    const amp = profile.reach * (this.level * 0.9 + this.surge * 0.7);

    // 비트마다, 그리고 짧은 간격마다 엉뚱한 방향으로 홱 돌진한다.
    if (beat || now >= this.nextDartAt) {
      this.dirX = signed(this.random);
      this.dirY = signed(this.random);
      this.nextDartAt = now + profile.dartMs * (0.5 + this.random());
    }

    // 서로 안 맞는 여러 주파수를 겹쳐 난조(chaotic) 궤적을 만든다.
    this.swim += profile.swimSpeed * (0.7 + heat) * dt;
    const wobbleX = 0.6 * Math.sin(this.swim) + 0.3 * Math.sin(this.swim * 2.7 + 1.1) + 0.2 * Math.sin(this.swim * 5.3);
    const wobbleY = 0.6 * Math.cos(this.swim * 1.3 + 0.5) + 0.3 * Math.sin(this.swim * 3.9 + 2.0) + 0.2 * Math.cos(this.swim * 6.1);

    if (this.settings.driftEnabled) {
      this.driftX += profile.driftSpeed * (0.35 + this.level) * dt;
    }

    const targetX = this.home.x + this.driftX + this.dirX * amp + wobbleX * amp * 0.6;
    const targetY = this.home.y + this.dirY * amp * 0.85 + wobbleY * amp * 0.6;

    // 빠르게 홱홱 따라붙는다(부드럽게 미끄러지지 않는다).
    this.pos.x = approach(this.pos.x, targetX, profile.follow, dt);
    this.pos.y = approach(this.pos.y, targetY, profile.follow, dt);

    // 매 프레임 부들부들 떨리는 잔진동을 얹는다.
    const jitter = profile.jitter * heat;
    this.pos.x += signed(this.random) * jitter;
    this.pos.y += signed(this.random) * jitter;

    this.confine(profile);

    return {
      windowId: this.windowId,
      left: Math.round(this.pos.x),
      top: Math.round(this.pos.y)
    };
  }

  confine(profile) {
    // 드리프트 사용 시: 오른쪽 밖으로 완전히 나가면 왼쪽 밖에서 다시 튀어 들어온다.
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

    const allowX = profile.offscreenEnabled ? this.bounds.width * 0.6 : 0;
    const allowY = profile.offscreenEnabled ? this.bounds.height * 0.4 : 0;
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
    this.dirX = 0;
    this.dirY = 0;
    this.nextDartAt = 0;
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

function signed(random) {
  return random() * 2 - 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
