// ==== INPUT HANDLING (Prevent synthetic double on touch) ====
const canvas = document.getElementById('game-canvas');
let lastTouch = 0;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();               // prevent the following mouse event
  lastTouch = Date.now();
  handleJump();                     // existing jump logic
});

canvas.addEventListener('mousedown', e => {
  if (Date.now() - lastTouch < 500) // ignore synthetic mouse after touch
    return;
  handleJump();
});

function handleJump() {
  // this should call your existing player.jump() logic
  if (game && game.players[0]) {
    game.players[0].jump();
  }
}

// ==== DRAW HEART EMOJI INSTEAD OF SHAPE ====
function drawHeart(ctx, x, y) {
  ctx.save();
  ctx.font = '20px serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('❤️', x, y);
  ctx.restore();
}

// Use drawHeart wherever you previously rendered the heart shape, e.g.:
// players.forEach((p, i) => drawHeart(ctx, heartX[i], heartY[i]));

// ==== GAME DRAW SHIFTED 5% LEFT ====
const Game = function(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  // ... your other initializations ...
};

Game.prototype.draw = function() {
  const w = this.canvas.width;
  this.ctx.save();
  this.ctx.translate(-w * 0.05, 0); // shift everything left by 5%

  // --- existing rendering calls ---
  // this.drawBackground();
  // this.drawObstacles();
  // this.drawPlayers();
  // this.drawScoreboard();

  this.ctx.restore();
};

// ==== REST OF YOUR GAME LOGIC ====
// Player, Obstacle, main loop, UI flow, etc., remain unchanged.
