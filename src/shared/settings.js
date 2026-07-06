export const DEFAULT_SETTINGS = Object.freeze({
  intensity: 42,
  sensitivity: 55,
  beatBoost: 70,
  driftEnabled: false,
  restoreOnStop: true,
  screen: {
    width: 1440,
    height: 900,
    availLeft: 0,
    availTop: 0
  }
});

export function normalizeSettings(input = {}) {
  const screen = input.screen ?? {};

  return {
    intensity: clampNumber(input.intensity, 1, 100, DEFAULT_SETTINGS.intensity),
    sensitivity: clampNumber(input.sensitivity, 1, 100, DEFAULT_SETTINGS.sensitivity),
    beatBoost: clampNumber(input.beatBoost, 0, 100, DEFAULT_SETTINGS.beatBoost),
    driftEnabled: Boolean(input.driftEnabled),
    restoreOnStop: input.restoreOnStop !== false,
    screen: {
      width: clampNumber(screen.width, 640, 10000, DEFAULT_SETTINGS.screen.width),
      height: clampNumber(screen.height, 480, 10000, DEFAULT_SETTINGS.screen.height),
      availLeft: clampNumber(screen.availLeft, -10000, 10000, 0),
      availTop: clampNumber(screen.availTop, -10000, 10000, 0)
    }
  };
}

export function movementProfile(intensity) {
  const amount = clampNumber(intensity, 1, 100, DEFAULT_SETTINGS.intensity) / 100;
  const eased = amount ** 1.9;

  return {
    amount,
    // 유영 궤적의 최대 반경(px): 낮으면 잔잔하게, 높으면 화면을 가로지르듯 크게.
    reach: 16 + eased * 460,
    // 좌우로 휘젓는 속도(rad/s): 느릴수록 유유히, 빠를수록 활발하게.
    swimSpeed: 0.7 + eased * 1.9,
    // 목표점 추종 속도(1/s): 낮을수록 더 부드럽게 미끄러진다.
    follow: 2.2 + eased * 2.6,
    // 드리프트(화면을 가로질러 도는 해류) 속도(px/s).
    driftSpeed: 40 + eased * 220,
    offscreenEnabled: intensity >= 88,
    // 부드러운 궤적을 위해 자주 갱신한다(ms).
    updateInterval: intensity >= 75 ? 24 : intensity >= 35 ? 30 : 40
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
