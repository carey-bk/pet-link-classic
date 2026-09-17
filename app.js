const PETS = Array.from({ length: 42 }, (_, index) => ({
  id: `pet-${String(index + 1).padStart(2, "0")}`,
  src: `assets/original-tiles/pet-${String(index + 1).padStart(2, "0")}.png`
}));
const TILE_IMAGE_CACHE = new Map();

const ENERGY_START = 300;
const ENERGY_CAP = 302;
const FINAL_LEVEL = 11;

const DIFFICULTIES = {
  easy: { label: "初级", rows: 7, cols: 12, lives: 2, hints: 4, speed: "Ⅰ", timerMs: 400, petCount: 21 },
  normal: { label: "中级", rows: 8, cols: 14, lives: 3, hints: 6, speed: "Ⅱ", timerMs: 500, petCount: 28 },
  hard: { label: "高级", rows: 9, cols: 16, lives: 4, hints: 8, speed: "Ⅲ", timerMs: 600, petCount: 36 },
  expert: { label: "特高", rows: 10, cols: 18, lives: 5, hints: 10, speed: "Ⅳ", timerMs: 700, petCount: 42 }
};

const LEVEL_MODES = [
  null,
  "不变化",
  "向下",
  "向左",
  "上下分离",
  "左右分离",
  "上下集中",
  "左右集中",
  "上左下右",
  "左下右上",
  "向外扩散",
  "向内集中"
];

const SPECIAL_EVENTS = [
  { text: "不错，送您提示两点!", tone: "hint" },
  { text: "三奖，送您分数2500点!", tone: "win" },
  { text: "喔喔，倒扣提示一点!", tone: "miss" },
  { text: "普奖,送您提示一点!", tone: "hint" },
  { text: "安慰奖,送您时间七秒!", tone: "hint" },
  { text: "普奖,送您分数1000点!", tone: "win" },
  { text: "喔喔,倒扣时间七秒!", tone: "miss" }
];

const state = {
  difficulty: "easy",
  rows: 7,
  cols: 12,
  grid: [],
  selected: null,
  score: 0,
  pairsLeft: 0,
  timeLeft: ENERGY_START,
  totalTime: ENERGY_START,
  level: 1,
  lives: 2,
  hints: 4,
  timer: null,
  paused: false,
  ended: false,
  sound: true,
  audio: null,
  messageTimer: null,
  specialTimer: null,
  specialEvent: -1
};

const boardEl = document.getElementById("board");
const gameAreaEl = document.querySelector(".game-area");
const pathLayer = document.getElementById("pathLayer");
const timeLeftEl = document.getElementById("timeLeft");
const timeBarEl = document.getElementById("timeBar");
const pairsLeftEl = document.getElementById("pairsLeft");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const speedLabelEl = document.getElementById("speedLabel");
const levelLabelEl = document.getElementById("levelLabel");
const modeLabelEl = document.getElementById("modeLabel");
const lifeLabelEl = document.getElementById("lifeLabel");
const hintCountEl = document.getElementById("hintCount");
const messageEl = document.getElementById("message");
const newGameBtn = document.getElementById("newGameBtn");
const hintBtn = document.getElementById("hintBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const pauseBtn = document.getElementById("pauseBtn");
const soundBtn = document.getElementById("soundBtn");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayBtn = document.getElementById("overlayBtn");

function setup() {
  preloadTileImages();

  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.difficulty === button.dataset.difficulty) return;
      state.difficulty = button.dataset.difficulty;
      document.querySelectorAll("[data-difficulty]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      startGame();
    });
  });

  newGameBtn.addEventListener("click", startGame);
  hintBtn.addEventListener("click", showHint);
  shuffleBtn.addEventListener("click", manualShuffle);
  pauseBtn.addEventListener("click", togglePause);
  overlayBtn.addEventListener("click", () => {
    if (state.ended) startGame();
    else setPaused(false);
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !state.ended) setPaused(false);
  });
  soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    soundBtn.textContent = state.sound ? "🔊" : "🔇";
    soundBtn.setAttribute("aria-label", state.sound ? "关闭音效" : "打开音效");
    playTone("tap");
  });

  window.addEventListener("resize", () => {
    resizeBoard();
    drawPathAgain();
  });
  window.addEventListener("orientationchange", () => {
    requestAnimationFrame(() => {
      resizeBoard();
      drawPathAgain();
    });
  });
  if ("ResizeObserver" in window) {
    const boardResizeObserver = new ResizeObserver(() => {
      resizeBoard();
      drawPathAgain();
    });
    boardResizeObserver.observe(gameAreaEl);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !state.ended) {
      setPaused(true);
      return;
    }
    if (!document.hidden) recoverBoardPaint();
  });
  window.addEventListener("pageshow", recoverBoardPaint);

  startGame();
}

function preloadTileImages() {
  PETS.forEach((pet) => {
    const image = new Image();
    image.decoding = "sync";
    image.loading = "eager";
    image.src = pet.src;
    TILE_IMAGE_CACHE.set(pet.id, image);
  });
}

function startGame() {
  const config = currentConfig();
  clearInterval(state.timer);
  clearTimeout(state.specialTimer);

  state.rows = config.rows;
  state.cols = config.cols;
  state.score = 0;
  state.level = 1;
  state.lives = config.lives;
  state.hints = config.hints;
  state.selected = null;
  state.paused = false;
  state.ended = false;
  state.specialEvent = -1;
  pathLayer.innerHTML = "";
  overlay.classList.add("hidden");

  startLevel(`${config.label}关卡`);
  state.timer = setInterval(tick, config.timerMs);
}

function startLevel(message) {
  state.timeLeft = ENERGY_START;
  state.totalTime = ENERGY_START;
  state.selected = null;
  state.specialEvent = -1;
  clearTimeout(state.specialTimer);
  pathLayer.innerHTML = "";
  boardEl.style.setProperty("--rows", state.rows);
  boardEl.style.setProperty("--cols", state.cols);
  state.grid = createSolvableGrid(state.rows, state.cols, currentConfig().petCount);
  state.pairsLeft = countTiles() / 2;
  renderBoard();
  updateHud();
  updateActionButtons();
  showMessage(message);
}

function createSolvableGrid(rows, cols, petCount) {
  const pairCount = (rows * cols) / 2;
  const availablePets = PETS.slice(0, petCount);
  const icons = [];
  for (let i = 0; i < pairCount; i += 1) {
    const pet = availablePets[i % availablePets.length].id;
    icons.push(pet, pet);
  }

  let grid;
  let attempts = 0;
  do {
    const shuffled = shuffleArray([...icons]);
    grid = [];
    for (let r = 0; r < rows; r += 1) {
      grid.push(shuffled.slice(r * cols, (r + 1) * cols));
    }
    attempts += 1;
  } while (!findAvailablePair(grid, rows, cols) && attempts < 300);

  return grid;
}

function currentConfig() {
  return DIFFICULTIES[state.difficulty];
}

function renderBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const value = state.grid[r][c];
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = value ? "tile" : "tile empty";
      tile.dataset.row = String(r);
      tile.dataset.col = String(c);
      tile.setAttribute("aria-label", value ? `宠物 ${value.replace("pet-", "")}` : "空格");
      tile.disabled = !value;
      if (value) {
        const img = document.createElement("img");
        img.decoding = "sync";
        img.loading = "eager";
        img.alt = "";
        img.src = TILE_IMAGE_CACHE.get(value)?.src || `assets/original-tiles/${value}.png`;
        img.addEventListener("error", () => {
          const retrySrc = `assets/original-tiles/${value}.png?reload=${Date.now()}`;
          img.src = retrySrc;
        }, { once: true });
        tile.appendChild(img);
        tile.addEventListener("click", () => selectTile(r, c));
      }
      boardEl.appendChild(tile);
    }
  }
  resizeBoard();
  markSelected();
}

function recoverBoardPaint() {
  if (state.ended || !state.grid.length) return;
  requestAnimationFrame(() => {
    renderBoard();
    drawPathAgain();
  });
}

function resizeBoard() {
  if (!gameAreaEl || !state.rows || !state.cols) return;

  const areaStyle = getComputedStyle(gameAreaEl);
  const boardStyle = getComputedStyle(boardEl);
  const paddingX = parseFloat(areaStyle.paddingLeft) + parseFloat(areaStyle.paddingRight);
  const paddingY = parseFloat(areaStyle.paddingTop) + parseFloat(areaStyle.paddingBottom);
  const availableWidth = Math.max(1, gameAreaEl.clientWidth - paddingX);
  const availableHeight = Math.max(1, gameAreaEl.clientHeight - paddingY);
  const gap = parseFloat(boardStyle.getPropertyValue("--gap")) || 0;
  const maxTile = 53;
  const widthTile = (availableWidth - gap * (state.cols - 1)) / state.cols;
  const heightTile = (availableHeight - gap * (state.rows - 1)) / state.rows;
  const tileSize = Math.max(12, Math.floor(Math.min(maxTile, widthTile, heightTile)));
  boardEl.style.setProperty("--tile-size", `${tileSize}px`);
}

function selectTile(row, col) {
  if (state.paused || state.ended || !state.grid[row][col]) return;
  ensureAudio();
  clearHints();
  pathLayer.innerHTML = "";

  const current = { row, col };
  if (state.selected && state.selected.row === row && state.selected.col === col) {
    state.selected = null;
    markSelected();
    playTone("tap");
    return;
  }

  if (!state.selected) {
    state.selected = current;
    markSelected();
    playTone("tap");
    return;
  }

  const first = state.selected;
  const firstValue = state.grid[first.row][first.col];
  const secondValue = state.grid[row][col];

  if (firstValue !== secondValue) {
    state.selected = current;
    markSelected();
    playTone("miss");
    return;
  }

  const path = findPath(state.grid, state.rows, state.cols, first, current);
  if (!path) {
    state.selected = current;
    markSelected();
    playTone("miss");
    return;
  }

  drawPath(path);
  removePair(first, current);
}

function removePair(first, second) {
  const firstEl = getTile(first.row, first.col);
  const secondEl = getTile(second.row, second.col);
  firstEl.classList.add("removing");
  secondEl.classList.add("removing");
  state.grid[first.row][first.col] = null;
  state.grid[second.row][second.col] = null;
  state.selected = null;
  state.score += 10;
  state.timeLeft = Math.min(ENERGY_CAP, state.timeLeft + 5);
  state.pairsLeft -= 1;
  playTone("match");
  updateHud();

  setTimeout(() => {
    applyLevelMovement();
    renderBoard();
    pathLayer.innerHTML = "";
    if (state.pairsLeft === 0) {
      advanceLevelOrFinish();
      return;
    }
    if (!findAvailablePair(state.grid, state.rows, state.cols)) {
      handleDeadBoard();
      return;
    }
    maybeTriggerSpecialEvent();
  }, 220);
}

function advanceLevelOrFinish() {
  const bonus = Math.max(0, state.timeLeft) + 10 * (state.hints + 2 * state.lives);
  state.score += bonus;
  if (state.level >= FINAL_LEVEL) {
    finishGame(true, `全部过关了! 另加${bonus}分.`);
    return;
  }

  state.level += 1;
  state.hints += 1;
  state.lives += 1;
  startLevel(`过关了!另加${bonus}分. 进入第${state.level - 1}关.`);
  playTone("win");
}

function handleDeadBoard() {
  shuffleRemainingTiles();
  renderBoard();
  updateHud();
  updateActionButtons();
  showMessage("没有可消除的牌，已自动重排");
  playTone("shuffle");
}

function manualShuffle() {
  if (state.paused || state.ended || state.lives <= 0) return;
  state.lives -= 1;
  shuffleRemainingTiles();
  state.selected = null;
  pathLayer.innerHTML = "";
  renderBoard();
  updateHud();
  updateActionButtons();
  showMessage(`重排完成，生命剩余 ${state.lives}`);
  playTone("shuffle");
}

function shuffleRemainingTiles() {
  const remaining = [];
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      if (state.grid[r][c]) remaining.push(state.grid[r][c]);
    }
  }
  if (remaining.length <= 2) return;

  let attempts = 0;
  let nextGrid;
  do {
    attempts += 1;
    const shuffled = shuffleArray([...remaining]);
    let index = 0;
    nextGrid = state.grid.map((row) => row.map((cell) => (cell ? shuffled[index++] : null)));
  } while (!findAvailablePair(nextGrid, state.rows, state.cols) && attempts < 300);

  state.grid = nextGrid;
}

function applyLevelMovement() {
  switch (state.level) {
    case 2:
      moveColumns(0, state.rows - 1, 0, state.cols - 1, "down");
      break;
    case 3:
      moveRows(0, state.rows - 1, 0, state.cols - 1, "left");
      break;
    case 4:
      moveVerticalSplit("separate");
      break;
    case 5:
      moveHorizontalSplit("separate");
      break;
    case 6:
      moveVerticalSplit("center");
      break;
    case 7:
      moveHorizontalSplit("center");
      break;
    case 8:
      moveUpperLeftLowerRight();
      break;
    case 9:
      moveLeftDownRightUp();
      break;
    case 10:
      moveVerticalSplit("separate");
      moveHorizontalSplit("separate");
      break;
    case 11:
      moveVerticalSplit("center");
      moveHorizontalSplit("center");
      break;
    default:
      break;
  }
}

function moveVerticalSplit(type) {
  const mid = Math.floor(state.rows / 2);
  if (type === "separate") {
    moveColumns(0, mid - 1, 0, state.cols - 1, "up");
    moveColumns(mid, state.rows - 1, 0, state.cols - 1, "down");
    return;
  }
  moveColumns(0, mid - 1, 0, state.cols - 1, "down");
  moveColumns(mid, state.rows - 1, 0, state.cols - 1, "up");
}

function moveHorizontalSplit(type) {
  const mid = Math.floor(state.cols / 2);
  if (type === "separate") {
    moveRows(0, state.rows - 1, 0, mid - 1, "left");
    moveRows(0, state.rows - 1, mid, state.cols - 1, "right");
    return;
  }
  moveRows(0, state.rows - 1, 0, mid - 1, "right");
  moveRows(0, state.rows - 1, mid, state.cols - 1, "left");
}

function moveUpperLeftLowerRight() {
  const mid = Math.floor(state.rows / 2);
  moveRows(0, mid - 1, 0, state.cols - 1, "left");
  moveRows(mid, state.rows - 1, 0, state.cols - 1, "right");
}

function moveLeftDownRightUp() {
  const mid = Math.floor(state.cols / 2);
  moveColumns(0, state.rows - 1, 0, mid - 1, "down");
  moveColumns(0, state.rows - 1, mid, state.cols - 1, "up");
}

function moveRows(rowStart, rowEnd, colStart, colEnd, direction) {
  if (rowStart > rowEnd || colStart > colEnd) return;
  for (let r = rowStart; r <= rowEnd; r += 1) {
    const values = [];
    for (let c = colStart; c <= colEnd; c += 1) {
      if (state.grid[r][c]) values.push(state.grid[r][c]);
      state.grid[r][c] = null;
    }
    if (direction === "left") {
      values.forEach((value, index) => {
        state.grid[r][colStart + index] = value;
      });
    } else {
      values.forEach((value, index) => {
        state.grid[r][colEnd - values.length + 1 + index] = value;
      });
    }
  }
}

function moveColumns(rowStart, rowEnd, colStart, colEnd, direction) {
  if (rowStart > rowEnd || colStart > colEnd) return;
  for (let c = colStart; c <= colEnd; c += 1) {
    const values = [];
    for (let r = rowStart; r <= rowEnd; r += 1) {
      if (state.grid[r][c]) values.push(state.grid[r][c]);
      state.grid[r][c] = null;
    }
    if (direction === "up") {
      values.forEach((value, index) => {
        state.grid[rowStart + index][c] = value;
      });
    } else {
      values.forEach((value, index) => {
        state.grid[rowEnd - values.length + 1 + index][c] = value;
      });
    }
  }
}

function maybeTriggerSpecialEvent() {
  if (state.specialEvent >= 0 || state.timeLeft % 12 !== 11) return;
  const eventId = Math.floor(Math.random() * SPECIAL_EVENTS.length);
  let active = true;

  switch (eventId) {
    case 0:
      state.hints += 2;
      break;
    case 1:
      state.score += 2500;
      break;
    case 2:
      active = state.hints >= 1 && Math.floor(Math.random() * 2) === 0;
      if (active) state.hints -= 1;
      break;
    case 3:
      state.hints += 1;
      break;
    case 4:
      state.timeLeft = Math.min(ENERGY_CAP, state.timeLeft + 14);
      break;
    case 5:
      state.score += 1000;
      break;
    case 6:
      active = state.timeLeft >= 70 && Math.floor(Math.random() * 2) === 0;
      if (active) state.timeLeft = Math.max(0, state.timeLeft - 14);
      break;
    default:
      active = false;
      break;
  }

  if (!active) {
    state.specialEvent = -1;
    return;
  }

  state.specialEvent = eventId;
  clearTimeout(state.specialTimer);
  updateHud();
  updateActionButtons();
  showMessage(SPECIAL_EVENTS[eventId].text, 3000, true);
  playTone(SPECIAL_EVENTS[eventId].tone);
  state.specialTimer = setTimeout(() => {
    state.specialEvent = -1;
  }, 3000);
}

function findPath(grid, rows, cols, a, b) {
  const direct = makePathIfClear(grid, rows, cols, [a, b], a, b);
  if (direct) return direct;

  const cornerA = { row: a.row, col: b.col };
  const oneTurnA = makePathIfClear(grid, rows, cols, [a, cornerA, b], a, b);
  if (oneTurnA) return oneTurnA;

  const cornerB = { row: b.row, col: a.col };
  const oneTurnB = makePathIfClear(grid, rows, cols, [a, cornerB, b], a, b);
  if (oneTurnB) return oneTurnB;

  for (let row = -1; row <= rows; row += 1) {
    const path = [
      a,
      { row, col: a.col },
      { row, col: b.col },
      b
    ];
    const twoTurn = makePathIfClear(grid, rows, cols, path, a, b);
    if (twoTurn) return twoTurn;
  }

  for (let col = -1; col <= cols; col += 1) {
    const path = [
      a,
      { row: a.row, col },
      { row: b.row, col },
      b
    ];
    const twoTurn = makePathIfClear(grid, rows, cols, path, a, b);
    if (twoTurn) return twoTurn;
  }

  return null;
}

function makePathIfClear(grid, rows, cols, path, a, b) {
  const compactPath = compactLinePath(path);
  for (let i = 1; i < compactPath.length - 1; i += 1) {
    if (!isOpenCell(grid, rows, cols, compactPath[i], a, b)) return null;
  }
  for (let i = 0; i < compactPath.length - 1; i += 1) {
    if (!isClearLine(grid, rows, cols, compactPath[i], compactPath[i + 1], a, b)) return null;
  }
  return compactPath;
}

function compactLinePath(path) {
  const withoutDuplicates = path.filter((point, index) => {
    const prev = path[index - 1];
    return !prev || prev.row !== point.row || prev.col !== point.col;
  });
  const compact = [];
  for (const point of withoutDuplicates) {
    compact.push(point);
    while (compact.length >= 3) {
      const a = compact[compact.length - 3];
      const b = compact[compact.length - 2];
      const c = compact[compact.length - 1];
      const sameLine = (a.row === b.row && b.row === c.row) || (a.col === b.col && b.col === c.col);
      if (!sameLine) break;
      compact.splice(compact.length - 2, 1);
    }
  }
  return compact;
}

function isClearLine(grid, rows, cols, a, b, start, end) {
  if (a.row !== b.row && a.col !== b.col) return false;
  const rowStep = Math.sign(b.row - a.row);
  const colStep = Math.sign(b.col - a.col);
  let row = a.row + rowStep;
  let col = a.col + colStep;
  while (row !== b.row || col !== b.col) {
    if (!isOpenCell(grid, rows, cols, { row, col }, start, end)) return false;
    row += rowStep;
    col += colStep;
  }
  return true;
}

function isOpenCell(grid, rows, cols, point, start, end) {
  if (point.row < 0 || point.col < 0 || point.row >= rows || point.col >= cols) return true;
  if ((point.row === start.row && point.col === start.col) || (point.row === end.row && point.col === end.col)) return true;
  return !grid[point.row][point.col];
}

function drawPath(path) {
  const points = path.map((point) => cellCenter(point.row, point.col));
  pathLayer.innerHTML = "";
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  pathLayer.appendChild(polyline);
  pathLayer.dataset.path = JSON.stringify(path);
}

function drawPathAgain() {
  if (!pathLayer.dataset.path) return;
  try {
    drawPath(JSON.parse(pathLayer.dataset.path));
  } catch {
    pathLayer.innerHTML = "";
  }
}

function cellCenter(row, col) {
  const boardRect = boardEl.getBoundingClientRect();
  const layerRect = pathLayer.getBoundingClientRect();
  const tileWidth = boardRect.width / state.cols;
  const tileHeight = boardRect.height / state.rows;
  return {
    x: boardRect.left - layerRect.left + (col + 0.5) * tileWidth,
    y: boardRect.top - layerRect.top + (row + 0.5) * tileHeight
  };
}

function findAvailablePair(grid, rows, cols) {
  const positionsByPet = new Map();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const pet = grid[r][c];
      if (!pet) continue;
      if (!positionsByPet.has(pet)) positionsByPet.set(pet, []);
      positionsByPet.get(pet).push({ row: r, col: c });
    }
  }

  for (const positions of positionsByPet.values()) {
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const path = findPath(grid, rows, cols, positions[i], positions[j]);
        if (path) return { first: positions[i], second: positions[j], path };
      }
    }
  }
  return null;
}

function showHint() {
  if (state.paused || state.ended || state.hints <= 0) return;
  const pair = findAvailablePair(state.grid, state.rows, state.cols);
  if (!pair) {
    handleDeadBoard();
    return;
  }
  state.hints -= 1;
  clearHints();
  getTile(pair.first.row, pair.first.col).classList.add("hint");
  getTile(pair.second.row, pair.second.col).classList.add("hint");
  drawPath(pair.path);
  updateHud();
  updateActionButtons();
  showMessage(`提示剩余 ${state.hints} 次`);
  playTone("hint");
  setTimeout(() => {
    clearHints();
    pathLayer.innerHTML = "";
  }, 2300);
}

function tick() {
  if (state.paused || state.ended) return;
  state.timeLeft -= 1;
  updateHud();
  if (state.timeLeft <= 0) finishGame(false, "时间到!");
}

function finishGame(won, message) {
  state.ended = true;
  clearInterval(state.timer);
  clearTimeout(state.specialTimer);
  const best = Math.max(Number(localStorage.getItem("pet-link-best") || 0), state.score);
  localStorage.setItem("pet-link-best", String(best));
  bestScoreEl.textContent = String(best);
  overlayTitle.textContent = won ? "恭喜你" : "失败";
  overlayText.textContent = `${message || (won ? "全部过关了!" : "游戏结束")} 本局得分 ${state.score}`;
  overlayBtn.textContent = "再玩一局";
  overlay.classList.remove("hidden");
  updateHud();
  playTone(won ? "win" : "miss");
}

function togglePause() {
  if (state.ended) return;
  setPaused(!state.paused);
}

function setPaused(paused) {
  state.paused = paused;
  pauseBtn.innerHTML = paused ? "▶ <span>继续</span>" : "⏸ <span>暂停</span>";
  if (paused) {
    overlayTitle.textContent = "暂停中";
    overlayText.textContent = "当前已暂停";
    overlayBtn.textContent = "继续";
    overlay.classList.remove("hidden");
  } else {
    overlay.classList.add("hidden");
    recoverBoardPaint();
  }
}

function updateHud() {
  timeLeftEl.textContent = formatTime(Math.ceil((state.timeLeft * currentConfig().timerMs) / 1000));
  timeBarEl.style.width = `${Math.max(0, Math.min(100, (state.timeLeft / state.totalTime) * 100))}%`;
  pairsLeftEl.textContent = String(state.pairsLeft);
  scoreEl.textContent = String(state.score);
  bestScoreEl.textContent = localStorage.getItem("pet-link-best") || "0";
  const config = currentConfig();
  speedLabelEl.textContent = config.speed;
  levelLabelEl.textContent = String(state.level - 1);
  modeLabelEl.textContent = LEVEL_MODES[state.level] || "不变化";
  lifeLabelEl.textContent = state.lives;
  hintCountEl.textContent = state.hints;
  hintBtn.title = `显示一对可连接的宠物，剩余 ${state.hints} 次`;
  shuffleBtn.title = `消耗一条生命重排，生命剩余 ${state.lives}`;
}

function updateActionButtons() {
  hintBtn.disabled = state.hints <= 0;
  shuffleBtn.disabled = state.lives <= 0;
}

function markSelected() {
  document.querySelectorAll(".tile.selected").forEach((tile) => tile.classList.remove("selected"));
  if (!state.selected) return;
  getTile(state.selected.row, state.selected.col).classList.add("selected");
}

function clearHints() {
  document.querySelectorAll(".tile.hint").forEach((tile) => tile.classList.remove("hint"));
}

function getTile(row, col) {
  return boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function countTiles() {
  return state.grid.flat().filter(Boolean).length;
}

function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function showMessage(text, duration = 2200, special = false) {
  clearTimeout(state.messageTimer);
  messageEl.textContent = text;
  messageEl.classList.toggle("special", special);
  state.messageTimer = setTimeout(() => {
    messageEl.textContent = "";
    messageEl.classList.remove("special");
  }, duration);
}

function ensureAudio() {
  if (!state.audio && window.AudioContext) {
    state.audio = new AudioContext();
  }
}

function playTone(type) {
  if (!state.sound) return;
  ensureAudio();
  if (!state.audio) return;
  const now = state.audio.currentTime;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  const tone = {
    tap: [420, 0.035, 0.03],
    match: [620, 0.11, 0.06],
    miss: [150, 0.08, 0.04],
    hint: [760, 0.09, 0.05],
    shuffle: [310, 0.10, 0.045],
    win: [880, 0.18, 0.07]
  }[type] || [400, 0.05, 0.04];

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(tone[0], now);
  gain.gain.setValueAtTime(tone[2], now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + tone[1]);
  oscillator.connect(gain);
  gain.connect(state.audio.destination);
  oscillator.start(now);
  oscillator.stop(now + tone[1]);
}

setup();

function runSelfTest() {
  const rows = 10;
  const cols = 12;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (let row = 0; row < rows - 1; row += 1) {
    grid[row][4] = "pet-01";
    grid[row][7] = "pet-02";
  }
  grid[9][4] = "pet-08";
  grid[9][5] = "pet-28";
  grid[9][6] = "pet-26";
  grid[9][7] = "pet-08";
  return {
    bottomOutsidePath: findPath(grid, rows, cols, { row: 9, col: 4 }, { row: 9, col: 7 })
  };
}

if (new URLSearchParams(window.location.search).has("selftest")) {
  document.documentElement.dataset.selftest = JSON.stringify(runSelfTest());
}
