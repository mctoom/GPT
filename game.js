/*
 * Camel Race Game
 *
 * This script implements a simple three‑lane endless runner where each lane hosts
 * a camel trying to avoid randomly generated obstacles. Players can perform
 * single and double jumps to clear snakes, rocks, holes and spikes. Once a
 * player touches an obstacle they lose a heart; after three hits they are out.
 * When two players are out the remaining player continues until they fail.
 * A scoreboard summarises times and declares the winner with a trophy.
 *
 * Multiplayer note: this code includes basic UI flows for hosting and
 * generating a shareable link. However, real time networking is outside the
 * scope of this implementation. When selecting “Start & Wait” the host is
 * presented with a link, but the game will only begin once the host clicks
 * “Play Now (vs bots)”.
 */

(function () {
  // Keep a reference to the current game so that utility functions such as
  // resizeCanvas() can update background radii when the window is
  // resized.  This variable is set in startGame().
  let activeGame = null;
  // DOM elements
  const startScreen = document.getElementById('start-screen');
  const waitingScreen = document.getElementById('waiting-screen');
  const gameScreen = document.getElementById('game-screen');
  const btnStart = document.getElementById('btn-start');
  const btnBots = document.getElementById('btn-bots');
  const btnPlayNow = document.getElementById('btn-play-now');
  const playerNameInput = document.getElementById('player-name');
  const shareLinkInput = document.getElementById('share-url');
  const waitingUrlInput = document.getElementById('waiting-url');
  const shareLinkContainer = document.getElementById('share-link');
  const scoreboardDiv = document.getElementById('scoreboard');

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  // Adjust canvas size to window
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Realign the scoreboard overlay when the window resizes.  Without
    // this the lane info for lower lanes could be pushed offscreen.  We
    // compute offsets relative to the game screen to match the canvas.
    if (scoreboardDiv) {
      const gameRect = gameScreen.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      scoreboardDiv.style.top = `${canvasRect.top - gameRect.top}px`;
      scoreboardDiv.style.left = `${canvasRect.left - gameRect.left}px`;
      scoreboardDiv.style.width = `${canvasRect.width}px`;
      scoreboardDiv.style.height = `${canvasRect.height}px`;
    }
    // Reinitialise background radii for the active game so that dune
    // segments cover the new width.  Only do this if a game is running.
    if (activeGame && typeof activeGame.initBackgroundRadii === 'function') {
      activeGame.initBackgroundRadii();
    }
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  /**
   * Utility: create a random alphanumeric string for room codes.
   * @param {number} length
   */
  function randomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Player class encapsulates state and behaviour for each camel.
   */
  class Player {
    /**
     * @param {string} name Name displayed in scoreboard
     * @param {number} lane Index of lane (0 top, 1 middle, 2 bottom)
     * @param {boolean} isBot Whether this player is a bot
     * @param {number} errorRate Chance of failing a jump for bots (0–1)
     */
    constructor(name, lane, isBot = false, errorRate = 0.1) {
      this.name = name;
      this.lane = lane;
      this.isBot = isBot;
      this.errorRate = errorRate;
      this.x = 150; // fixed horizontal position
      this.y = 0; // vertical offset from ground; 0 means on ground
      this.vy = 0; // vertical velocity
      this.width = 60;
      this.height = 40;
      this.gravity = 2000; // pixels per second squared
      this.jumpVelocity = 700; // initial jump velocity
      this.doubleJumpAvailable = true;
      this.lives = 3;
      this.invulnerable = false;
      this.invulnTimer = 0;
      this.time = 0; // time survived in seconds
      this.out = false;
      this.passedObstacles = 0;
      this.scoreboardEl = null; // reference to DOM element for scoreboard
    }

    /**
     * Perform a jump. If the player is on the ground they jump; if they are
     * mid‑air and have a double jump available they jump again.
     */
    jump() {
      if (this.out) return;
      if (this.y === 0) {
        // initial jump
        this.vy = -this.jumpVelocity;
        this.doubleJumpAvailable = true;
      } else if (this.doubleJumpAvailable) {
        // double jump resets vertical velocity
        this.vy = -this.jumpVelocity;
        this.doubleJumpAvailable = false;
      }
    }

    /**
     * Update vertical position based on gravity and velocity.
     * @param {number} dt Delta time in seconds
     */
    updatePhysics(dt) {
      if (this.out) return;
      // apply gravity
      this.vy += this.gravity * dt;
      this.y += this.vy * dt;
      // clamp to ground
      if (this.y > 0) {
        this.y = 0;
        this.vy = 0;
        this.doubleJumpAvailable = true;
      }
      // invulnerability timer after collision
      if (this.invulnerable) {
        this.invulnTimer -= dt;
        if (this.invulnTimer <= 0) {
          this.invulnerable = false;
        }
      }
      // increment survival time
      this.time += dt;
    }

    /**
     * Draw the camel to the canvas.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} laneHeight
     */
    draw(ctx, laneHeight) {
      // Draw a more detailed camel shape instead of a plain rectangle.
      // Compute the baseline of this lane and apply vertical offset (y)
      const baseY = laneHeight * (this.lane + 1) - 40;
      const drawY = baseY + this.y;
      // Choose colours based on bot/human/out state
      const bodyColour = this.out ? '#999' : (this.isBot ? '#6c8cd5' : '#d58c47');
      const legColour = bodyColour;
      const humpColour = bodyColour;
      const headColour = bodyColour;
      ctx.save();
      // Body: a rounded rectangle to represent the camel's torso
      const bodyWidth = this.width * 0.6;
      const bodyHeight = this.height * 0.5;
      const bodyX = this.x;
      const bodyY = drawY + this.height * 0.5 - bodyHeight;
      ctx.fillStyle = bodyColour;
      ctx.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
      // Humps: two semi‑circles on top of the body
      const humpRadius = this.width * 0.15;
      const humpSpacing = this.width * 0.05;
      const humpY = bodyY - humpRadius;
      const hump1X = bodyX + bodyWidth * 0.2;
      const hump2X = hump1X + humpRadius * 2 + humpSpacing;
      ctx.fillStyle = humpColour;
      ctx.beginPath();
      ctx.arc(hump1X + humpRadius, humpY + humpRadius, humpRadius, Math.PI, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hump2X + humpRadius, humpY + humpRadius, humpRadius, Math.PI, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();
      // Head: a circle on a slender neck
      const headRadius = this.width * 0.12;
      const headX = bodyX + bodyWidth + headRadius;
      const headY = bodyY - headRadius * 0.5;
      // neck
      ctx.strokeStyle = headColour;
      ctx.lineWidth = headRadius * 0.4;
      ctx.beginPath();
      ctx.moveTo(bodyX + bodyWidth, bodyY + bodyHeight * 0.2);
      ctx.lineTo(bodyX + bodyWidth, headY + headRadius);
      ctx.stroke();
      // head
      ctx.fillStyle = headColour;
      ctx.beginPath();
      ctx.arc(headX, headY, headRadius, 0, 2 * Math.PI);
      ctx.fill();
      // eye
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(headX + headRadius * 0.3, headY - headRadius * 0.2, headRadius * 0.15, 0, 2 * Math.PI);
      ctx.fill();
      // Legs: simple rectangles
      ctx.fillStyle = legColour;
      const legWidth = this.width * 0.08;
      const legHeight = this.height * 0.4;
      const legY = drawY + this.height - legHeight;
      const legPositions = [bodyX + bodyWidth * 0.1, bodyX + bodyWidth * 0.4];
      legPositions.forEach(posX => {
        ctx.fillRect(posX, legY, legWidth, legHeight);
        ctx.fillRect(posX + legWidth * 2, legY, legWidth, legHeight);
      });
      ctx.restore();
    }
  }

  /**
   * Obstacle class representing objects the camels must avoid.
   */
  class Obstacle {
    /**
     * @param {number} x X coordinate (top left)
     * @param {string} type Type of obstacle
     */
    constructor(x, type) {
      this.x = x;
      this.type = type;
      // set width and height based on type
      switch (type) {
        case 'snake': {
          // snakes vary in length and thickness.  Provide a range for
          // width and height to make them look more organic.  Width: 50–80px,
          // height: 20–30px.
          const width = 50 + Math.random() * 30;
          const height = 20 + Math.random() * 10;
          this.width = width;
          this.height = height;
          // generate a green hue for variety (range 90–150 hue degrees)
          const hue = 90 + Math.random() * 60;
          this.color = `hsl(${hue}, 50%, 40%)`;
          break;
        }
        case 'rock': {
          // rocks vary in size.  Width: 40–70px, height: 30–50px.
          const width = 40 + Math.random() * 30;
          const height = 30 + Math.random() * 20;
          this.width = width;
          this.height = height;
          // generate a brown/grey hue (range 20–40 degrees for earthy tones)
          const hue = 20 + Math.random() * 20;
          this.color = `hsl(${hue}, 30%, 40%)`;
          break;
        }
        case 'hole': {
          // holes vary in width but maintain zero height for collision
          // detection.  Width: 70–120px.
          const width = 70 + Math.random() * 50;
          this.width = width;
          this.height = 1;
          this.color = '#000000';
          break;
        }
        case 'spike':
        default: {
          // spikes vary in width and height.  Width: 50–80px, height:
          // 40–60px.  A reddish hue for danger (330–360 degrees).
          const width = 50 + Math.random() * 30;
          const height = 40 + Math.random() * 20;
          this.width = width;
          this.height = height;
          const hue = 330 + Math.random() * 30;
          this.color = `hsl(${hue}, 60%, 50%)`;
          break;
        }
      }
    }

    /**
     * Draw obstacle across all lanes.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} laneCount
     * @param {number} laneHeight
     */
    draw(ctx, laneCount, laneHeight) {
      for (let i = 0; i < laneCount; i++) {
        const baseY = laneHeight * (i + 1);
        // obstacles align with ground; height extends upward
        ctx.fillStyle = this.color;
        if (this.type === 'hole') {
          // draw hole as a rectangle on the ground with a dark fill
          ctx.fillRect(this.x, baseY - 10, this.width, 10);
        } else if (this.type === 'spike') {
          // draw spike as triangles
          ctx.fillStyle = this.color;
          const spikeHeight = this.height;
          const spikeCount = 4;
          const spikeWidth = this.width / spikeCount;
          for (let s = 0; s < spikeCount; s++) {
            ctx.beginPath();
            const startX = this.x + s * spikeWidth;
            ctx.moveTo(startX, baseY);
            ctx.lineTo(startX + spikeWidth / 2, baseY - spikeHeight);
            ctx.lineTo(startX + spikeWidth, baseY);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          ctx.fillRect(this.x, baseY - this.height, this.width, this.height);
        }
      }
    }
  }

  /**
   * Game controller managing the overall game state and loop.
   */
  class Game {
    constructor(playerNames, botCount) {
      this.laneCount = 3;
      this.playerCount = playerNames.length + botCount;
      this.players = [];
      this.obstacles = [];
      // Speed at which obstacles move leftwards (pixels/second). This will
      // increase over time to make the game more challenging.
      this.speed = 400;
      // Base speed used to normalise obstacle spawn gaps.  When the speed
      // increases, we scale the gap distance by (baseSpeed / speed) so that
      // obstacles appear at a consistent rate relative to real time.
      this.baseSpeed = this.speed;
      // Track elapsed time in the current run to trigger difficulty bumps.
      this.elapsedTime = 0;
      // The next time (in seconds) at which to increase speed and spawn rate.
      // Speed now increases every 5 seconds instead of 10 to steadily
      // ramp up the challenge.
      this.nextSpeedIncreaseAt = 5;
      // How much to multiply speed by when increasing difficulty. A value of
      // 1.3 means a 30% increase.
      this.speedIncreaseFactor = 1.3;
      this.gameOver = false;
      this.lastTime = null;
      /*
       * Minimum and maximum horizontal gaps between obstacles.  These values
       * determine how far apart obstacles are spawned.  We no longer
       * shrink these gaps when the difficulty increases, because doing so
       * resulted in too few obstacles appearing after extended play.  By
       * keeping the gap range constant, the appearance rate remains
       * consistent across the entire run.  The initial range (300–800px)
       * yields a nice balance of space and challenge.
       */
      this.spawnGapMin = 300;
      this.spawnGapMax = 800;

      // Preserve the original spawn gap range so we can derive time‑based gaps
      // as the game speeds up.  We don't mutate these values when the
      // difficulty changes.
      this.baseSpawnGapMin = this.spawnGapMin;
      this.baseSpawnGapMax = this.spawnGapMax;
      // Timer used to schedule obstacle spawns at fixed time intervals.  A
      // random spawn interval (in seconds) is chosen between
      // baseMinSpawnTime and baseMaxSpawnTime.  When the timer exceeds the
      // interval, a new obstacle is spawned and the timer resets.
      this.spawnTimer = 0;
      // Base spawn times derived from the base gap range and speed.  These
      // values represent how many seconds it should take for a gap of
      // baseSpawnGapMin or baseSpawnGapMax to be traversed at baseSpeed.
      this.baseMinSpawnTime = this.baseSpawnGapMin / this.baseSpeed;
      this.baseMaxSpawnTime = this.baseSpawnGapMax / this.baseSpeed;
      // Set the first spawn interval
      this.nextSpawnInterval = this.randomSpawnInterval();
      this.scoreboardEntries = [];
      this.winnerIndex = null;
      this.initializePlayers(playerNames, botCount);
      this.setupScoreboard();

      // Parallax background offsets for each lane.  These values are
      // decremented over time to animate the distant dunes.  Each lane has
      // its own offset so the pattern appears continuous across the lane.
      this.bgOffsets = new Array(this.laneCount).fill(0);
      // Background speed factor (0.6 means the background moves at 60% of
      // the obstacle speed).  Used to create a parallax effect.
      this.bgSpeedFactor = 0.6;
      // Width of a single dune pattern segment (in pixels).  Patterns are
      // repeated horizontally across the lane.
      this.bgPatternWidth = 300;
      // Base radius for the dune shapes.  Individual radii will vary
      // relative to this base to create depth without animation.
      this.bgBaseRadius = 60;
      // Arrays holding the radius for each dune segment in each lane.
      // We'll populate these arrays based on the current canvas width so
      // that the dunes persist and new segments entering from the right
      // adopt a random size.  The arrays will be updated as the
      // backgrounds scroll.
      this.bgRadii = [];
      this.initBackgroundRadii();
    }

    /**
     * Initialise the background radii arrays based on the current
     * canvas width.  Each lane will have enough segments to cover the
     * visible area plus a couple extra for seamless scrolling.  The
     * radii values are randomised within a range (70%–150% of the base
     * radius) and remain static until they scroll off screen.
     */
    initBackgroundRadii() {
      this.bgRadii = [];
      const segmentsNeeded = Math.ceil(canvas.width / this.bgPatternWidth) + 2;
      for (let lane = 0; lane < this.laneCount; lane++) {
        const radii = [];
        for (let i = 0; i < segmentsNeeded; i++) {
          const variation = 0.7 + Math.random() * 0.8;
          radii.push(this.bgBaseRadius * variation);
        }
        this.bgRadii.push(radii);
      }
    }

    initializePlayers(playerNames, botCount) {
      // assign players to lanes; if fewer than 3 human players, we still fill lanes sequentially
      const names = [...playerNames];
      // create human players first
      for (let i = 0; i < names.length; i++) {
        this.players.push(new Player(names[i], i, false));
      }
      // create bots to fill remaining lanes
      for (let b = 0; b < botCount; b++) {
        const lane = this.players.length;
        const botName = `Bot ${b + 1}`;
        // Give bots a small chance of failure (~5%) so they will successfully
        // avoid most obstacles. This makes their behaviour appear more
        // intelligent while still allowing the game to conclude eventually.
        this.players.push(new Player(botName, lane, true, 0.05));
      }
      // fill leftover lanes with placeholders if less than 3 players
      while (this.players.length < this.laneCount) {
        const lane = this.players.length;
        this.players.push(new Player(`Bot ${lane + 1}`, lane, true, 1.0));
      }
    }

    setupScoreboard() {
      scoreboardDiv.innerHTML = '';
      scoreboardDiv.style.display = 'block';
      // Position the scoreboard overlay so it aligns with the canvas.  The
      // parent element (#game-screen) uses flexbox with padding, so we need
      // to offset the scoreboard to match the canvas's position.  We
      // calculate offsets relative to the game screen.
      const gameRect = gameScreen.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const topOffset = canvasRect.top - gameRect.top;
      const leftOffset = canvasRect.left - gameRect.left;
      scoreboardDiv.style.top = `${topOffset}px`;
      scoreboardDiv.style.left = `${leftOffset}px`;
      scoreboardDiv.style.width = `${canvasRect.width}px`;
      scoreboardDiv.style.height = `${canvasRect.height}px`;
      this.players.forEach((player, index) => {
        // create lane info container
        const laneInfo = document.createElement('div');
        laneInfo.classList.add('lane-info');
        // hearts container
        const hearts = document.createElement('div');
        hearts.classList.add('hearts');
        for (let i = 0; i < 3; i++) {
          const heart = document.createElement('div');
          heart.classList.add('heart');
          hearts.appendChild(heart);
        }
        laneInfo.appendChild(hearts);
        // name label
        const nameSpan = document.createElement('span');
        nameSpan.textContent = player.name;
        nameSpan.style.marginRight = '10px';
        laneInfo.appendChild(nameSpan);
        // time label
        const timeSpan = document.createElement('span');
        timeSpan.textContent = '0.0s';
        laneInfo.appendChild(timeSpan);
        scoreboardDiv.appendChild(laneInfo);
        // store reference for updates
        player.scoreboardEl = { heartsContainer: hearts, timeSpan: timeSpan, nameSpan: nameSpan, laneInfo: laneInfo };
      });
    }

    /**
     * Generate a new obstacle at the end of the lane sequence.
     */
    spawnObstacle() {
      const types = ['snake', 'rock', 'hole', 'spike'];
      const type = types[Math.floor(Math.random() * types.length)];
      // Spawn the obstacle just outside the right edge of the canvas.  It will
      // move leftwards as the game progresses.  We don't rely on
      // nextObstacleX anymore because spawns are driven by a timer.
      const x = canvas.width + 50;
      const obs = new Obstacle(x, type);
      this.obstacles.push(obs);
    }

    /**
     * Pick a random spawn interval (in seconds) between the base min and max
     * spawn times.  These intervals are derived from the base gap range and
     * the base speed such that obstacles appear at the same cadence
     * regardless of the current speed.
     */
    randomSpawnInterval() {
      return this.baseMinSpawnTime + Math.random() * (this.baseMaxSpawnTime - this.baseMinSpawnTime);
    }

    /**
     * Start the game loop.
     */
    start() {
      // Wait until the first spawn interval has elapsed before spawning
      // anything.  Previously we prepopulated an obstacle at time zero, but
      // this made the very first obstacle appear like a cluster.  By letting
      // the timer handle the initial spawn the first obstacle will arrive
      // naturally after a short delay.  Reset the spawn timer and choose a
      // random initial interval so the first obstacle isn't predictable.
      this.spawnTimer = 0;
      this.nextSpawnInterval = this.randomSpawnInterval();
      // start loop
      requestAnimationFrame(this.update.bind(this));
    }

    /**
     * Update loop invoked via requestAnimationFrame.
     * @param {DOMHighResTimeStamp} timestamp
     */
    update(timestamp) {
      if (this.gameOver) return;
      if (!this.lastTime) this.lastTime = timestamp;
      const dt = (timestamp - this.lastTime) / 1000; // convert to seconds
      this.lastTime = timestamp;
      // accumulate elapsed time for difficulty scaling
      this.elapsedTime += dt;
      // Increase difficulty every 10 seconds by boosting speed and
      // increasing the obstacle speed.  Multiplying speed by
      // speedIncreaseFactor makes the game 30% faster.  We intentionally do
      // **not** shrink the spawn gaps here; keeping them constant ensures
      // that obstacles continue to appear at a similar rate throughout the
      // game.  Previously shrinking the gaps caused obstacles to
      // effectively disappear after extended play.
      if (this.elapsedTime >= this.nextSpeedIncreaseAt) {
        this.speed *= this.speedIncreaseFactor;
        // schedule next increase after 5 seconds
        this.nextSpeedIncreaseAt += 5;
      }
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const laneHeight = canvas.height / this.laneCount;
      // Draw lane backgrounds with alternating colours to enhance visual
      // separation.  Soft sand tones evoke a desert race track.
      const laneColours = ['#f7e6c5', '#f3dcb3'];
      for (let i = 0; i < this.laneCount; i++) {
        ctx.fillStyle = laneColours[i % laneColours.length];
        ctx.fillRect(0, laneHeight * i, canvas.width, laneHeight);
      }
      // Draw lane dividing lines
      ctx.strokeStyle = '#d0b47b';
      for (let i = 1; i < this.laneCount; i++) {
        const y = laneHeight * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw parallax backgrounds (distant dunes) moving slower than
      // obstacles.  These patterns are drawn on top of the solid lane
      // colours but behind obstacles and players.  Each lane has its own
      // offset that moves based on the game speed and a factor (60%).
      for (let laneIndex = 0; laneIndex < this.laneCount; laneIndex++) {
        // Update offset based on elapsed time and parallax speed
        this.bgOffsets[laneIndex] -= this.speed * this.bgSpeedFactor * dt;
        // Whenever the offset surpasses one pattern width, loop it back
        // and update the radii array by shifting a new random radius onto
        // the end.  This ensures that newly entering dunes have random
        // sizes but existing dunes retain their sizes.
        while (this.bgOffsets[laneIndex] <= -this.bgPatternWidth) {
          this.bgOffsets[laneIndex] += this.bgPatternWidth;
          // shift out the first radius and append a new random radius
          this.bgRadii[laneIndex].shift();
          const variation = 0.7 + Math.random() * 0.8;
          this.bgRadii[laneIndex].push(this.bgBaseRadius * variation);
        }
        const offset = this.bgOffsets[laneIndex];
        const yBase = laneHeight * (laneIndex + 1);
        // Choose a lighter shade for dunes relative to lane colour
        ctx.fillStyle = laneColours[(laneIndex + 1) % laneColours.length];
        // Draw repeating arcs across lane using the predefined radii
        const radiiArray = this.bgRadii[laneIndex];
        for (let i = 0; i < radiiArray.length; i++) {
          const x = offset + (i - 1) * this.bgPatternWidth;
          const radius = radiiArray[i];
          // Skip drawing if arc is entirely off screen to improve performance
          if (x + this.bgPatternWidth < -this.bgPatternWidth || x > canvas.width + this.bgPatternWidth) continue;
          ctx.beginPath();
          ctx.arc(x + this.bgPatternWidth / 2, yBase, radius, Math.PI, 2 * Math.PI);
          ctx.fill();
        }
      }
      // Update and draw obstacles
      for (const obs of this.obstacles) {
        obs.x -= this.speed * dt;
        obs.draw(ctx, this.laneCount, laneHeight);
      }
      // Remove obstacles that have gone off screen
      while (this.obstacles.length > 0 && this.obstacles[0].x + this.obstacles[0].width < 0) {
        this.obstacles.shift();
      }
      // Increment spawn timer and spawn obstacles when the timer exceeds
      // the next scheduled interval.  Using a loop allows multiple
      // spawns if dt is large.
      this.spawnTimer += dt;
      while (this.spawnTimer >= this.nextSpawnInterval) {
        this.spawnTimer -= this.nextSpawnInterval;
        this.spawnObstacle();
        this.nextSpawnInterval = this.randomSpawnInterval();
      }
      // Update players
      let outCount = 0;
      for (const player of this.players) {
        if (!player.out) {
          // bot decision
          if (player.isBot) {
            this.handleBot(player);
          }
          player.updatePhysics(dt);
          // collision detection if not invulnerable
          if (!player.invulnerable) {
            for (const obs of this.obstacles) {
              // Only check obstacles roughly overlapping horizontally
              if (obs.x < player.x + player.width && obs.x + obs.width > player.x) {
                // Collision if on ground and obstacle height > player's jump height
                if (player.y >= 0) {
                  // reduce life
                  player.lives--;
                  player.invulnerable = true;
                  player.invulnTimer = 0.7; // 700 ms of invulnerability
                  if (player.lives <= 0) {
                    player.out = true;
                    // When a player loses all lives, record their survival time
                    // (rounded for display) so the scoreboard remains static
                    player.time = player.time; // freeze time
                  }
                  break;
                }
              }
            }
          }
          // update scoreboard hearts and time
          this.updateScoreboard(player);
        }
        if (player.out) outCount++;
      }
      // Draw players
      for (const player of this.players) {
        player.draw(ctx, laneHeight);
      }

      // Overlay "OUT" on lanes of players who have been eliminated.
      // This visually freezes their lane and indicates that they are out.
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 32px Arial';
      for (const player of this.players) {
        if (player.out) {
          const yStart = laneHeight * player.lane;
          // semi‑transparent dark overlay
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(0, yStart, canvas.width, laneHeight);
          // "OUT" text
          ctx.fillStyle = '#fff';
          ctx.fillText('OUT', canvas.width / 2, yStart + laneHeight / 2);
        }
      }
      ctx.restore();
      // Check game over: when all players are out
      if (outCount >= this.laneCount) {
        this.endGame();
      }
      // Continue loop
      if (!this.gameOver) {
        requestAnimationFrame(this.update.bind(this));
      }
    }

    /**
     * Basic AI for bots: decide when to jump based on upcoming obstacle.
     * @param {Player} bot
     */
    handleBot(bot) {
      // find the next obstacle ahead of bot's position
      for (const obs of this.obstacles) {
        if (obs.x + obs.width > bot.x) {
          const distance = obs.x - bot.x;
          // adjust threshold based on speed and type: less reaction time at higher speeds
          const threshold = (bot.jumpVelocity / this.speed) * 200; // approximate reaction window
          if (distance < threshold && bot.y === 0) {
            // decide whether to jump or fail
            if (Math.random() > bot.errorRate) {
              bot.jump();
            }
          }
          break;
        }
      }
    }

    /**
     * Update scoreboard DOM elements for a given player.
     * @param {Player} player
     */
    updateScoreboard(player) {
      const el = player.scoreboardEl;
      // update hearts
      const hearts = el.heartsContainer.children;
      for (let i = 0; i < hearts.length; i++) {
        hearts[i].style.backgroundColor = i < player.lives ? 'red' : '#ccc';
      }
      // update time (to one decimal place)
      el.timeSpan.textContent = player.time.toFixed(1) + 's';
      // mark lane if out
      if (player.out) {
        el.laneInfo.style.opacity = '0.5';
      }

      // Position the lane info element inside its lane.  We compute the
      // vertical placement based on the lane height so that each player's
      // hearts, name and time appear in the top left corner of their lane.
      const laneHeight = canvas.height / this.laneCount;
      // Position lane info a little lower so it sits comfortably within
      // the lane. Adding extra padding pushes the label down from the
      // very top edge of the canvas.
      const topOffset = laneHeight * player.lane + 15;
      el.laneInfo.style.top = `${topOffset}px`;
      el.laneInfo.style.left = `10px`;
    }

    /**
     * End game: determine winner and display final scoreboard.
     */
    endGame() {
      this.gameOver = true;
      // Determine winner by longest time
      let bestTime = -Infinity;
      this.winnerIndex = -1;
      this.players.forEach((player, idx) => {
        if (player.time > bestTime) {
          bestTime = player.time;
          this.winnerIndex = idx;
        }
      });
      // Show final scoreboard emphasising winner
      // After a brief delay, display the final results overlay and start
      // a fireworks animation.  Clearing the lane info ensures the final
      // scoreboard sits cleanly in the centre of the screen.
      setTimeout(() => {
        // Clear the lane info entries
        scoreboardDiv.innerHTML = '';
        // Transform the scoreboard container into an overlay covering the
        // canvas.  We reuse this element instead of creating a new node to
        // simplify CSS.  Apply the final-overlay class to adopt styles.
        scoreboardDiv.classList.add('final-overlay');
        // Build a panel to hold the results
        const panel = document.createElement('div');
        panel.classList.add('final-panel');
        const title = document.createElement('h3');
        title.textContent = 'Race Results';
        panel.appendChild(title);
        const list = document.createElement('ul');
        list.classList.add('final-list');
        // Populate list with players ordered by survival time descending
        const sorted = this.players
          .map((p, idx) => ({ idx, name: p.name, time: p.time }))
          .sort((a, b) => b.time - a.time);
        sorted.forEach(entry => {
          const li = document.createElement('li');
          // Container for name and (possibly) trophy
          const nameContainer = document.createElement('div');
          nameContainer.style.display = 'flex';
          nameContainer.style.alignItems = 'center';
          const nameSpan = document.createElement('span');
          nameSpan.textContent = entry.name;
          nameContainer.appendChild(nameSpan);
          // add trophy next to the winner name using an emoji for
          // improved legibility.  Use a span with the trophy-big class.
          if (entry.idx === this.winnerIndex) {
            const trophy = document.createElement('span');
            trophy.classList.add('trophy-big');
            trophy.textContent = '🏆';
            nameContainer.appendChild(trophy);
            li.style.fontWeight = 'bold';
          }
          li.appendChild(nameContainer);
          const timeSpan = document.createElement('span');
          timeSpan.textContent = entry.time.toFixed(1) + 's';
          li.appendChild(timeSpan);
          list.appendChild(li);
        });
        panel.appendChild(list);
        // Repeat button
        const repeatBtn = document.createElement('button');
        repeatBtn.textContent = 'Repeat';
        repeatBtn.classList.add('repeat-btn');
        repeatBtn.addEventListener('click', () => {
          window.location.reload();
        });
        panel.appendChild(repeatBtn);
        scoreboardDiv.appendChild(panel);
        // Enable pointer events on the overlay to allow button clicks
        scoreboardDiv.style.pointerEvents = 'auto';
        // Kick off fireworks animation
        startFireworks();
      }, 1000);
    }
  }

  /**
   * Start a new game session.
   * @param {Array<string>} playerNames
   * @param {number} botCount
   */
  function startGame(playerNames, botCount) {
    startScreen.style.display = 'none';
    waitingScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    const game = new Game(playerNames, botCount);
    // set global reference for resize events
    activeGame = game;
    // Setup input handlers
    // Jump on key press (space or arrow up)
    function onKeydown(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        // human players all jump on same key; allow controlling one lane
        // We'll let the first human (index 0) jump
        const player = game.players.find(p => !p.isBot);
        if (player) player.jump();
      }
    }
    document.addEventListener('keydown', onKeydown);
    // Jump on touch/click
    function onTouch() {
      const player = game.players.find(p => !p.isBot);
      if (player) player.jump();
    }
    canvas.addEventListener('mousedown', onTouch);
    canvas.addEventListener('touchstart', onTouch);
    // Start game loop
    game.start();
  }

  /**
   * Launch a simple fireworks/confetti animation on top of the game
   * canvas.  This function creates a temporary canvas overlay and
   * animates colourful particles for a few seconds.  Once the
   * animation completes the overlay is removed.  Inspired by basic
   * particle effects.
   */
  function startFireworks() {
    // Create overlay canvas
    const fCanvas = document.createElement('canvas');
    fCanvas.width = canvas.width;
    fCanvas.height = canvas.height;
    fCanvas.style.position = 'absolute';
    fCanvas.style.top = scoreboardDiv.style.top || '0px';
    fCanvas.style.left = scoreboardDiv.style.left || '0px';
    fCanvas.style.pointerEvents = 'none';
    // Place above other elements but below the final panel so fireworks
    // appear behind the results panel
    fCanvas.style.zIndex = '15';
    gameScreen.appendChild(fCanvas);
    const fCtx = fCanvas.getContext('2d');
    // Particle definition
    class Particle {
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * fCanvas.width;
        this.y = Math.random() * fCanvas.height * 0.5; // spawn in top half
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 300;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = 4 + Math.random() * 4;
        const hue = Math.floor(Math.random() * 360);
        this.color = `hsl(${hue}, 80%, 60%)`;
        this.life = 2000 + Math.random() * 1000; // lifespan in ms
      }
      update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        // gravity
        this.vy += 200 * dt;
        this.life -= dt * 1000;
        // respawn if life expired or out of bounds
        if (this.life <= 0 || this.y > fCanvas.height) {
          this.reset();
        }
      }
      draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    // Create initial particle set
    const particles = Array.from({ length: 80 }, () => new Particle());
    let lastTimestamp;
    let startTimestamp;
    function animate(timestamp) {
      if (!startTimestamp) startTimestamp = timestamp;
      if (!lastTimestamp) lastTimestamp = timestamp;
      const dt = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      // Clear
      fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
      // Update and draw particles
      particles.forEach(p => {
        p.update(dt);
        p.draw(fCtx);
      });
      if (elapsed < 4000) {
        requestAnimationFrame(animate);
      } else {
        // remove canvas after animation completes
        fCanvas.remove();
      }
    }
    requestAnimationFrame(animate);
  }

  /**
   * When Start & Wait is clicked, generate a room code and display share URL.
   */
  btnStart.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player';
    const room = randomString(6);
    const url = `${window.location.href.split('?')[0]}?room=${room}`;
    shareLinkInput.value = url;
    waitingUrlInput.value = url;
    startScreen.style.display = 'none';
    waitingScreen.style.display = 'flex';
  });

  /**
   * When Play Against Computer is clicked, start immediate game with bots.
   */
  btnBots.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player';
    // Start game with one human and two bots
    startGame([name], 2);
  });

  /**
   * When Play Now (vs bots) is clicked during waiting, start game.
   */
  btnPlayNow.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Player';
    // Start game with one human and two bots
    startGame([name], 2);
  });
})();