const config = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 960,
  height: 540,
  backgroundColor: '#07111a',
  pixelArt: true,
  scene: null,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
};

const GAME = {
  width: config.width,
  height: config.height,
  languages: [
    { code: 'JS', color: 0xf7df1e },
    { code: 'PY', color: 0x5ad1ff },
    { code: 'C++', color: 0x60a5fa },
    { code: 'RS', color: 0xf97316 },
    { code: 'HTML', color: 0xf97316 },
    { code: 'CSS', color: 0x60a5fa },
    { code: 'SQL', color: 0x34d399 },
    { code: 'GO', color: 0x22d3ee },
    { code: 'JAVA', color: 0xf59e0b },
  ],
};

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.scene.start('TitleScene');
  }
}

class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#07111a');

    const title = this.add.text(config.width / 2, 140, 'CODE WORLD', {
      fontFamily: 'monospace',
      fontSize: '46px',
      color: '#a5f3fc',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    const subtitle = this.add.text(config.width / 2, 200, 'Collect every language. Survive the chaos.', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#dfeeff',
    }).setOrigin(0.5);

    const playButton = this.add.rectangle(config.width / 2, 320, 220, 60, 0x1f9dff, 0.95);
    const playText = this.add.text(config.width / 2, 320, 'START GAME', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#03111c',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    playButton.setInteractive();
    playButton.on('pointerdown', () => {
      this.scene.start('GameScene');
    });

    this.add.text(config.width / 2, 420, 'Move: WASD / Arrow Keys • Fire: Space', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#d7e7ff',
    }).setOrigin(0.5);

    this.add.text(config.width / 2, 470, 'Single-player + multiplayer-ready server included', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#9ec7ff',
    }).setOrigin(0.5);

    title.setShadow(0, 0, '#000', 0);
    subtitle.setShadow(0, 0, '#000', 0);
    playText.setShadow(0, 0, '#000', 0);
  }
}

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.player = null;
    this.cursors = null;
    this.pickups = null;
    this.enemies = null;
    this.bullets = null;
    this.scoreText = null;
    this.healthText = null;
    this.timeText = null;
    this.foundText = null;
    this.waveText = null;
    this.gameOver = false;
    this.timeLeft = 60;
    this.score = 0;
    this.found = new Set();
    this.wave = 1;
    this.spawnTimer = 0;
    this.boss = null;
    this.bossHp = 0;
    this.bossMaxHp = 0;
    this.socket = null;
  }

  create() {
    this.createTextures();
    this.createBackground();
    this.createPlayer();
    this.createGroups();
    this.createHud();
    this.createInput();
    this.createAudio();
    this.createNetwork();
    this.spawnPickupWave();
    this.spawnWave();
  }

  createAudio() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.musicSeq = 0;
    this.musicTimer = this.time.addEvent({
      delay: 280,
      callback: () => {
        if (!this.gameOver) {
          const notes = [220, 277, 330, 415, 330, 277, 220];
          const n = notes[this.musicSeq % notes.length];
          this.playTone(n, 0.08, 'square', 0.03);
          this.musicSeq += 1;
        }
      },
      loop: true,
    });
  }

  createNetwork() {
    try {
      const socket = io();
      this.socket = socket;
      socket.emit('hello', { type: 'game' });
      socket.on('playerState', (state) => {
        if (state && state.id !== this.socket.id) {
          // Multiplayer hook for future expansion: remote clients can be visualized later.
        }
      });
    } catch (error) {
      // Single-player fallback if Socket.IO is not available.
    }
  }

  createTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0, add: false });

    // Player
    graphics.clear();
    graphics.fillStyle(0x7ad7ff, 1);
    graphics.fillRect(0, 0, 16, 16);
    graphics.fillStyle(0x041b2a, 1);
    graphics.fillRect(4, 5, 2, 2);
    graphics.fillRect(10, 5, 2, 2);
    graphics.fillRect(5, 10, 6, 2);
    graphics.generateTexture('player', 16, 16);

    // Enemy
    graphics.clear();
    graphics.fillStyle(0xff6b6b, 1);
    graphics.fillRect(0, 0, 16, 16);
    graphics.fillStyle(0x490b11, 1);
    graphics.fillRect(3, 4, 10, 8);
    graphics.generateTexture('enemy', 16, 16);

    // Bullet
    graphics.clear();
    graphics.fillStyle(0xe0f2fe, 1);
    graphics.fillRect(0, 0, 6, 6);
    graphics.generateTexture('bullet', 6, 6);

    // Pickup
    for (const lang of GAME.languages) {
      graphics.clear();
      graphics.fillStyle(lang.color, 1);
      graphics.fillRect(0, 0, 20, 20);
      graphics.fillStyle(0x07111a, 1);
      graphics.fillRect(4, 4, 12, 12);
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.strokeRect(3, 3, 14, 14);
      graphics.generateTexture(`pickup-${lang.code}`, 20, 20);
    }

    graphics.destroy();
  }

  createBackground() {
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1d2d3b, 1);
    for (let x = 0; x <= config.width; x += 32) {
      grid.moveTo(x, 0);
      grid.lineTo(x, config.height);
    }
    for (let y = 0; y <= config.height; y += 32) {
      grid.moveTo(0, y);
      grid.lineTo(config.width, y);
    }
    grid.strokePath();
  }

  createPlayer() {
    this.player = this.physics.add.sprite(config.width / 2, config.height - 60, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setScale(2);
    this.player.body.setSize(12, 12);
    this.player.health = 100;
  }

  createGroups() {
    this.pickups = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();

    this.physics.add.overlap(this.player, this.pickups, this.collectPickup, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.bullets, this.enemies, this.bulletHitEnemy, null, this);
  }

  createHud() {
    this.foundText = this.add.text(18, 18, 'Found: 0 / 9', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#dfeeff',
    });

    this.healthText = this.add.text(18, 42, 'HP: 100', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#9ae6b4',
    });

    this.timeText = this.add.text(config.width - 120, 18, '60s', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#fef3c7',
    });

    this.scoreText = this.add.text(config.width - 180, 42, 'Score: 0', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#dbeafe',
    });

    this.waveText = this.add.text(config.width / 2, 18, 'Wave 1', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#c4b5fd',
    }).setOrigin(0.5);
  }

  createInput() {
    this.cursors = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      fire: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.input.keyboard.on('keydown-SPACE', () => {
      if (!this.gameOver) {
        this.fireBullet();
      }
    });
  }

  spawnPickupWave() {
    for (let i = 0; i < GAME.languages.length; i++) {
      const lang = GAME.languages[i];
      const pickup = this.physics.add.sprite(80 + (i % 3) * 220, 100 + Math.floor(i / 3) * 120, `pickup-${lang.code}`);
      pickup.setScale(1.2);
      pickup.lang = lang;
      pickup.setDepth(2);
      pickup.body.setAllowGravity(false);
      this.pickups.add(pickup);
    }
  }

  spawnWave() {
    const enemyCount = 3 + this.wave * 2;
    for (let i = 0; i < enemyCount; i++) {
      const x = Phaser.Math.Between(40, config.width - 40);
      const y = Phaser.Math.Between(-100, 0);
      const enemy = this.physics.add.sprite(x, y, 'enemy');
      enemy.setScale(1.8);
      enemy.setVelocity(Phaser.Math.Between(-30, 30), 40 + this.wave * 6);
      enemy.health = 1;
      this.enemies.add(enemy);
    }
    this.waveText.setText(`Wave ${this.wave}`);
  }

  fireBullet() {
    const bullet = this.physics.add.sprite(this.player.x, this.player.y - 12, 'bullet');
    bullet.setDepth(3);
    bullet.setVelocity(0, -420);
    bullet.damage = 1;
    bullet.setScale(1.4);
    bullet.setCollideWorldBounds(false);
    this.bullets.add(bullet);
    this.playTone(620, 0.05, 'square', 0.03);
  }

  collectPickup(player, pickup) {
    if (this.found.has(pickup.lang.code)) return;

    this.found.add(pickup.lang.code);
    this.score += 100;
    this.playTone(780, 0.08, 'triangle', 0.035);
    pickup.destroy();

    if (this.found.size >= GAME.languages.length) {
      this.finishGame(true);
    }

    this.updateHud();
  }

  hitEnemy(player, enemy) {
    if (this.gameOver) return;

    enemy.destroy();
    this.player.health -= 20;
    this.playTone(120, 0.08, 'sawtooth', 0.04);

    if (this.player.health <= 0) {
      this.player.health = 0;
      this.finishGame(false);
    }

    this.updateHud();
  }

  bulletHitEnemy(bullet, enemy) {
    bullet.destroy();
    enemy.destroy();
    this.score += 15;
    this.playTone(440, 0.04, 'square', 0.02);
    this.updateHud();
  }

  updateHud() {
    this.foundText.setText(`Found: ${this.found.size} / ${GAME.languages.length}`);
    this.healthText.setText(`HP: ${Math.max(0, this.player.health)}`);
    this.timeText.setText(`${Math.max(0, Math.ceil(this.timeLeft))}s`);
    this.scoreText.setText(`Score: ${this.score}`);
  }

  finishGame(win) {
    this.gameOver = true;
    this.physics.pause();

    this.cameras.main.flash(220, 0, 255, 0);

    const message = win ? 'WORLD COMPLETE!' : 'GAME OVER';
    const color = win ? '#9ae6b4' : '#fca5a5';

    this.add.text(config.width / 2, config.height / 2, message, {
      fontFamily: 'monospace',
      fontSize: '42px',
      color,
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(config.width / 2, config.height / 2 + 48, `Final Score: ${this.score}`, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#e8f6ff',
    }).setOrigin(0.5);

    this.time.delayedCall(1800, () => {
      this.scene.start('TitleScene');
    });
  }

  playTone(frequency, duration = 0.08, type = 'square', gainValue = 0.03) {
    const ctx = this.audioContext;
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = gainValue;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }

  update(time, delta) {
    if (this.gameOver) return;

    this.timeLeft -= delta / 1000;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finishGame(false);
    }

    const speed = 180;
    const moveX = (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
    const moveY = (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0);

    if (moveX !== 0 || moveY !== 0) {
      const length = Math.hypot(moveX, moveY) || 1;
      this.player.setVelocity((moveX / length) * speed, (moveY / length) * speed);
    } else {
      this.player.setVelocity(0, 0);
    }

    this.enemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return;

      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const velocity = 35 + this.wave * 8;
      enemy.setVelocity(Math.cos(angle) * velocity, Math.sin(angle) * velocity);

      if (enemy.y > config.height + 40 || enemy.x < -40 || enemy.x > config.width + 40) {
        enemy.destroy();
      }
    });

    this.bullets.getChildren().forEach((bullet) => {
      if (!bullet.active) return;
      if (bullet.y < -30) bullet.destroy();
    });

    if (this.enemies.countActive() === 0) {
      this.wave += 1;
      this.spawnWave();
    }

    this.updateHud();
  }
}

const game = new Phaser.Game({
  ...config,
  scene: [BootScene, TitleScene, GameScene],
});
