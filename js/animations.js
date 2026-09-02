const FX_DURATION = 620;
const EXPLOSION_DURATION = 480;

function getCell(boardEl, row, col) {
  return boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function getCellCenter(boardEl, row, col) {
  const cell = getCell(boardEl, row, col);
  if (!cell) return null;
  const board = boardEl.getBoundingClientRect();
  const rect = cell.getBoundingClientRect();
  return {
    x: rect.left - board.left + rect.width / 2,
    y: rect.top - board.top + rect.height / 2,
  };
}

function getLineCells(from, target) {
  const dr = Math.sign(target.row - from.row);
  const dc = Math.sign(target.col - from.col);
  const cells = [];
  let r = from.row;
  let c = from.col;

  while (true) {
    cells.push([r, c]);
    if (r === target.row && c === target.col) break;
    r += dr;
    c += dc;
  }

  return cells;
}

function spawnProjectile(fxLayer, from, to, team, kind) {
  const projectile = document.createElement('div');
  projectile.className = `projectile ${team} ${kind}`;
  projectile.style.left = `${from.x}px`;
  projectile.style.top = `${from.y}px`;
  fxLayer.appendChild(projectile);

  requestAnimationFrame(() => {
    projectile.style.left = `${to.x}px`;
    projectile.style.top = `${to.y}px`;
    projectile.classList.add('fly');
  });

  return projectile;
}

function spawnDamageNumber(fxLayer, pos, amount, killed) {
  const el = document.createElement('div');
  el.className = `damage-number${killed ? ' killed' : ''}`;
  el.textContent = killed ? 'KO!' : `-${amount}`;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  fxLayer.appendChild(el);
  return el;
}

export function playAttackAnimation(boardEl, fxLayer, fx) {
  return new Promise((resolve) => {
    const fromCell = getCell(boardEl, fx.from.row, fx.from.col);
    const unitEl = fromCell?.querySelector('.unit');

    if (unitEl && fx.type === 'melee') {
      const mainTarget = fx.targets[0];
      if (mainTarget) {
        const dx = Math.sign(mainTarget.col - fx.from.col);
        const dy = Math.sign(mainTarget.row - fx.from.row);
        unitEl.style.setProperty('--lunge-x', `${dx * 18}px`);
        unitEl.style.setProperty('--lunge-y', `${dy * 18}px`);
      }
      unitEl.classList.add('attacking');
    }

    if (fx.type === 'mage' && fx.targets.length > 0) {
      const lineCells = getLineCells(fx.from, fx.targets[fx.targets.length - 1]);
      for (const [r, c] of lineCells) {
        getCell(boardEl, r, c)?.classList.add('mage-beam');
      }
    }

    const fromCenter = getCellCenter(boardEl, fx.from.row, fx.from.col);
    const projectiles = [];

    if (fx.type === 'ranged' && fromCenter) {
      for (const target of fx.targets) {
        const toCenter = getCellCenter(boardEl, target.row, target.col);
        if (!toCenter) continue;
        projectiles.push(spawnProjectile(fxLayer, fromCenter, toCenter, fx.team, fx.type));
      }
    }

    const hitTimer = fx.type === 'melee' ? 180 : 280;
    const explosions = fx.explosions ?? [];

    setTimeout(() => {
      for (const target of fx.targets) {
        const cell = getCell(boardEl, target.row, target.col);
        cell?.classList.add('hit-flash', 'shake');
        if (target.killed) cell?.classList.add('unit-dying');

        const center = getCellCenter(boardEl, target.row, target.col);
        if (center) {
          spawnDamageNumber(fxLayer, center, fx.damage, target.killed);
        }
      }
    }, hitTimer);

    setTimeout(() => {
      unitEl?.classList.remove('attacking');
      boardEl.querySelectorAll('.mage-beam').forEach((el) => el.classList.remove('mage-beam'));
      boardEl.querySelectorAll('.hit-flash, .shake, .unit-dying').forEach((el) => {
        el.classList.remove('hit-flash', 'shake', 'unit-dying');
      });
      projectiles.forEach((p) => p.remove());
      fxLayer.querySelectorAll('.damage-number').forEach((el) => el.remove());

      if (explosions.length === 0) {
        resolve();
        return;
      }

      for (const exp of explosions) {
        getCell(boardEl, exp.from.row, exp.from.col)?.classList.add('explosion-flash');
      }

      setTimeout(() => {
        for (const exp of explosions) {
          for (const target of exp.targets) {
            const cell = getCell(boardEl, target.row, target.col);
            cell?.classList.add('hit-flash', 'shake');
            if (target.killed) cell?.classList.add('unit-dying');

            const center = getCellCenter(boardEl, target.row, target.col);
            if (center) {
              spawnDamageNumber(fxLayer, center, exp.damage, target.killed);
            }
          }
        }
      }, 160);

      setTimeout(() => {
        boardEl.querySelectorAll('.explosion-flash').forEach((el) => el.classList.remove('explosion-flash'));
        boardEl.querySelectorAll('.hit-flash, .shake, .unit-dying').forEach((el) => {
          el.classList.remove('hit-flash', 'shake', 'unit-dying');
        });
        fxLayer.querySelectorAll('.damage-number').forEach((el) => el.remove());
        resolve();
      }, EXPLOSION_DURATION);
    }, FX_DURATION);
  });
}
