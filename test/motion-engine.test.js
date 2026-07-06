import test from "node:test";
import assert from "node:assert/strict";
import { MotionEngine } from "../src/background/motion-engine.js";

const browserWindow = { id: 7, left: 300, top: 160, width: 600, height: 500 };
const screen = { width: 1440, height: 900, availLeft: 0, availTop: 0 };

test("moderate motion stays fully on screen", () => {
  const engine = new MotionEngine({ random: () => 0.99 });
  engine.start(browserWindow, { intensity: 60, beatBoost: 100, screen });

  for (let index = 1; index <= 40; index += 1) {
    const operation = engine.step({ energy: 1, bass: 1, beat: index % 4 === 0 }, index * 40);
    if (!operation) continue;
    assert.ok(operation.left >= 0);
    assert.ok(operation.left <= screen.width - browserWindow.width);
    assert.ok(operation.top >= 0);
    assert.ok(operation.top <= screen.height - browserWindow.height);
  }
});

test("motion glides smoothly without teleporting between frames", () => {
  const engine = new MotionEngine({ random: () => 0.5 });
  engine.start(browserWindow, { intensity: 60, beatBoost: 100, screen });

  let previous = null;
  let moved = false;
  for (let index = 1; index <= 60; index += 1) {
    const operation = engine.step({ energy: 1, bass: 1, beat: index % 4 === 0 }, index * 40);
    if (!operation) continue;
    if (previous) {
      const jump = Math.hypot(operation.left - previous.left, operation.top - previous.top);
      assert.ok(jump < 80, `frame jumped ${jump}px — motion should stay smooth`);
      if (jump > 0.5) moved = true;
    }
    previous = operation;
  }
  assert.ok(moved, "window should actually move while music plays");
});

test("silence lets the window settle back home", () => {
  const engine = new MotionEngine();
  engine.start(browserWindow, { intensity: 60, screen });

  let clock = 0;
  // 음악으로 한동안 유영시켜 원위치에서 벗어나게 한다.
  for (let index = 0; index < 40; index += 1) {
    clock += 40;
    engine.step({ energy: 1, bass: 1, beat: index % 4 === 0 }, clock);
  }

  // 무음이 이어지면 부드럽게 원위치로 돌아와 결국 멈춘다.
  let last = null;
  for (let index = 0; index < 400; index += 1) {
    clock += 40;
    const operation = engine.step({ energy: 0, bass: 0, beat: false }, clock);
    if (operation) last = operation;
  }

  assert.ok(last, "engine should emit at least one homing frame");
  assert.ok(Math.abs(last.left - browserWindow.left) <= 2);
  assert.ok(Math.abs(last.top - browserWindow.top) <= 2);
});

test("drift current carries the window across the screen and wraps around", () => {
  const engine = new MotionEngine({ random: () => 0.5 });
  engine.start(
    { id: 7, left: 700, top: 100, width: 200, height: 300 },
    { intensity: 100, driftEnabled: true, screen: { ...screen, width: 800 } }
  );

  const positions = [];
  for (let index = 1; index <= 160; index += 1) {
    const operation = engine.step({ energy: 1, bass: 1, beat: false }, index * 50);
    if (operation) positions.push(operation.left);
  }

  assert.ok(positions.some((left) => left > 700));
  assert.ok(positions.some((left) => left < 0));
});

test("stop operation restores original bounds", () => {
  const engine = new MotionEngine();
  engine.start(browserWindow, { intensity: 90, screen });
  assert.deepEqual(engine.getRestoreOperation(), {
    windowId: 7,
    left: 300,
    top: 160,
    width: 600,
    height: 500
  });
});
