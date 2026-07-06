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
    // 돌진 궤적의 최대 반경(px): 낮으면 좁게, 높으면 화면을 휘젓듯 크게.
    reach: 20 + eased * 520,
    // 난조 흔들림의 기본 각속도(rad/s): 클수록 더 부산하게 떨린다.
    swimSpeed: 5 + eased * 20,
    // 목표점 추종 속도(1/s): 클수록 홱홱 낚아채듯 움직인다.
    follow: 9 + eased * 15,
    // 매 프레임 얹는 잔진동(px).
    jitter: 3 + eased * 24,
    // 엉뚱한 방향으로 돌진하는 간격(ms): 강도가 높을수록 더 잦다.
    dartMs: 220 - eased * 150,
    // 드리프트(화면을 가로질러 도는 해류) 속도(px/s).
    driftSpeed: 40 + eased * 220,
    offscreenEnabled: intensity >= 88,
    // 정신없이 움직이도록 짧은 간격으로 갱신한다(ms).
    updateInterval: intensity >= 75 ? 20 : intensity >= 35 ? 26 : 34
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
