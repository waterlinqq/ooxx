function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

function animateFormation(root, now, triggerAt) {
  const members = root.userData.members;
  if (!members?.length) return;

  const since = now - triggerAt;
  for (const member of members) {
    const index = member.userData.navMemberIndex ?? 0;
    const delay = index * 95;
    const duration = 440;
    const t = Math.min(Math.max((since - delay) / duration, 0), 1);
    const ease = easeOutCubic(t);
    const bounce = t < 1 ? Math.sin(t * Math.PI) * 0.022 : 0;
    const base = member.userData.basePosition;
    const baseScale = member.userData.baseScale ?? 1;
    const settled = since > delay + duration;

    member.position.y = base.y - 0.065 * (1 - ease) + bounce;
    member.position.z = base.z + 0.028 * ease;
    if (settled) {
      member.position.y += Math.sin((since - delay) * 0.0038 + index * 1.4) * 0.0025;
    }
    member.scale.setScalar(baseScale * (0.8 + 0.2 * ease));
  }
}

function animateBattle(root, now, triggerAt) {
  const swords = root.userData.swords;
  if (!swords?.length) return;

  const since = now - triggerAt;
  const duration = 560;
  const t = Math.min(since / duration, 1);
  const ease = easeOutCubic(t);
  const clash = Math.sin(t * Math.PI);
  const baseRot = root.userData.baseRotation;

  for (let i = 0; i < swords.length; i++) {
    const sword = swords[i];
    const base = sword.userData.baseRotation;
    const posBase = sword.userData.basePosition;
    const side = i === 0 ? -1 : 1;
    sword.rotation.y = base.y + side * 0.62 * (1 - ease);
    sword.rotation.z = base.z * (1 - ease * 0.8) + side * clash * 0.28;
    sword.rotation.x = base.x - 0.22 * clash + Math.sin(since * 0.0055 + i * 1.2) * 0.045;
    if (posBase) {
      sword.position.y = posBase.y + clash * 0.055;
      sword.position.z = posBase.z + clash * 0.025;
    }
  }

  if (baseRot) {
    root.rotation.y = baseRot.y + Math.sin(since * 0.018) * 0.045 * ease;
    root.rotation.z = clash * 0.04 * (1 - t * 0.5);
  }
}

function animateCodex(root, now, triggerAt) {
  const book = root.userData.book;
  const clasp = root.userData.clasp;
  if (!book) return;

  const since = now - triggerAt;
  const t = Math.min(since / 460, 1);
  const ease = easeOutCubic(t);
  const base = book.userData.baseRotation;

  book.rotation.x = base.x - 0.14 * ease;
  book.rotation.z = Math.sin(since * 0.0032) * 0.012 * ease;

  if (clasp) {
    const claspBase = clasp.userData.basePosition;
    clasp.rotation.y = since * 0.0045;
    clasp.position.y = claspBase.y + Math.sin(since * 0.0055) * 0.007;
  }
}

function animateQuests(root, now, triggerAt) {
  const { paper, reward, checks, board } = root.userData;
  const since = now - triggerAt;

  if (paper?.userData.basePosition) {
    const t = Math.min(since / 420, 1);
    const ease = easeOutCubic(t);
    const base = paper.userData.basePosition;
    const rotBase = paper.userData.baseRotation;
    const wobble = t < 1 ? Math.sin(t * Math.PI * 2.5) * 0.025 : 0;
    paper.position.y = base.y + 0.15 * (1 - ease) + wobble;
    paper.position.z = base.z + 0.028 * ease;
    if (rotBase) {
      paper.rotation.x = rotBase.x + Math.sin(since * 0.005) * 0.08 * ease;
      paper.rotation.z = rotBase.z + Math.sin(since * 0.004) * 0.05 * ease;
    }
  }

  for (let i = 0; i < (checks?.length ?? 0); i++) {
    const delay = 100 + i * 100;
    const t = Math.min(Math.max((since - delay) / 320, 0), 1);
    const pop = easeOutBack(t);
    checks[i].scale.setScalar(Math.max(0.05, pop) * (checks[i].userData.baseScale ?? 1));
  }

  if (reward?.userData.basePosition) {
    const base = reward.userData.basePosition;
    const baseScale = reward.userData.baseScale ?? 1;
    const pulse = 1 + Math.sin(since * 0.011) * 0.18;
    reward.rotation.y = since * 0.014;
    reward.rotation.x = Math.sin(since * 0.008) * 0.25;
    reward.position.y = base.y + Math.sin(since * 0.009) * 0.022;
    reward.scale.setScalar(baseScale * pulse);
  }

  if (board?.userData.baseRotation) {
    const base = board.userData.baseRotation;
    const t = Math.min(since / 500, 1);
    board.rotation.x = base.x + Math.sin(t * Math.PI) * 0.06;
    board.rotation.z = base.z + Math.sin(since * 0.004) * 0.025;
  }
}

function animateShop(root, now, triggerAt) {
  const { awning, coins, gem, stall } = root.userData;
  const since = now - triggerAt;
  const entry = Math.min(since / 450, 1);
  const entryEase = easeOutBack(entry);

  if (awning?.userData.baseRotation) {
    const base = awning.userData.baseRotation;
    const flap = entry < 1 ? (1 - entryEase) * -0.32 : 0;
    awning.rotation.x = base.x + flap + Math.sin(since * 0.007) * 0.09;
  }

  for (let i = 0; i < (coins?.length ?? 0); i++) {
    const delay = i * 80;
    const ct = Math.min(Math.max((since - delay) / 380, 0), 1);
    const coin = coins[i];
    const base = coin.userData.basePosition;
    const rotBase = coin.userData.baseRotation;
    const hop = Math.sin(ct * Math.PI);
    coin.position.y = base.y + hop * 0.055;
    coin.position.x = base.x + hop * 0.012 * (i - 1);
    if (rotBase) {
      coin.rotation.y = rotBase.y + ct * Math.PI * 2.2;
    }
  }

  if (gem?.userData.basePosition) {
    const base = gem.userData.basePosition;
    const baseScale = gem.userData.baseScale ?? 1;
    const pulse = 1 + Math.sin(since * 0.012) * 0.28;
    gem.position.y = base.y + Math.sin(since * 0.01) * 0.018;
    gem.scale.setScalar(baseScale * pulse);
    if (gem.material) {
      gem.material.emissiveIntensity = (gem.userData.baseEmissive ?? 1.4) + Math.sin(since * 0.012) * 1.1;
    }
  }

  if (stall) {
    stall.position.y = Math.sin(since * 0.006) * 0.006 * entryEase;
  }
}

export const NAV_ANIMATORS = {
  formation: animateFormation,
  battle: animateBattle,
  codex: animateCodex,
  quests: animateQuests,
  shop: animateShop,
};

/** Intro duration per nav icon (ms), matched to the staggered entry animations. */
export const NAV_INTRO_MS = {
  formation: 720,
  battle: 620,
  codex: 520,
  quests: 720,
  shop: 560,
};

export const NAV_IDLE_MS = 1500;
export const NAV_ANIM_ICON_PX = 104;
export const NAV_ANIM_FPS = 30;

export function applyNavIconAnimation(model, navId, now, triggerAt = 0) {
  const animate = NAV_ANIMATORS[navId];
  if (animate) animate(model, now, triggerAt);
}
