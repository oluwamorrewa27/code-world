// Enhanced main.js for Code World — Boss fight, improved UI, pause/menu, richer procedural pixel assets,
// multiplayer sync via Socket.IO (client-side). Generates pixel textures at runtime for placeholders.

const config = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 960,
  height: 540,
  backgroundColor: '#07111a',
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: []
};

const GAME = {
  width: config.width,
  height: config.height,
  languages: [
    { code: 'JS', color: 0xf7df1e },
    { code: 'PY', color: 0x5ad1ff },
    { code: 'C++', color: 0x60a5fa },
    { code: 'RS', color: 0xf97316 },
    { code: 'HTML', color: 0xf06529 },
    { code: 'CSS', color: 0x2965f1 },
    { code: 'SQL', color: 0x00b894 },
    { code: 'GO', color: 0x00add8 },
    { code: 'JAVA', color: 0xed8b00 }
  ]
};

class PreloadScene extends Phaser.Scene {
  constructor() { super('PreloadScene'); }
  preload() {
    // No external files required — generate procedural pixel art during create
    this.load.image('pixel', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAn8B9uQJgQAAAABJRU5ErkJggg==');
  }
  create() {
    this.scene.start('TitleScene');
  }
}

class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }
  create() {
    this.cameras.main.setBackgroundColor('#07111a');
    // create polished title elements
    this.add.text(GAME.width/2, 90, 'CODE WORLD', { fontFamily:'monospace', fontSize: '56px', color: '#a5f3fc' }).setOrigin(0.5);
    this.add.text(GAME.width/2, 160, 'A pixel‑art roguelike shooter — collect languages and beat the boss', { fontFamily:'monospace', fontSize:'16px', color:'#dfeeff' }).setOrigin(0.5);

    const play = this.add.rectangle(GAME.width/2, 260, 260, 68, 0x1f9dff).setInteractive();
    const playT = this.add.text(GAME.width/2, 260, 'Start Single Player', { fontFamily:'monospace', fontSize:'22px', color:'#03111c' }).setOrigin(0.5);
    play.on('pointerdown', () => this.scene.start('GameScene'));

    const mpBtn = this.add.rectangle(GAME.width/2, 340, 260, 52, 0xffd66b).setInteractive();
    const mpT = this.add.text(GAME.width/2, 340, 'Start Multiplayer (local server)', { fontFamily:'monospace', fontSize:'18px', color:'#03111c' }).setOrigin(0.5);
    mpBtn.on('pointerdown', () => this.scene.start('GameScene', { multiplayer: true }));

    const settings = this.add.text(GAME.width/2, 420, 'Toggle Music • Toggle 16/32px sprites later in options', { fontFamily:'monospace', fontSize:'14px', color:'#9ec7ff' }).setOrigin(0.5);

    // quick credits
    this.add.text(18, GAME.height - 36, 'Engine: Phaser 3 • Server: Socket.IO', { fontFamily:'monospace', fontSize:'12px', color:'#8faefc' });
  }
}

class PauseScene extends Phaser.Scene {
  constructor() { super('PauseScene'); }
  create() {
    const { width, height } = this.scale;
    this.bg = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.45);
    this.box = this.add.rectangle(width/2, height/2, 420, 220, 0x081820).setStrokeStyle(2, 0xffffff, 0.06);
    this.add.text(width/2, height/2 - 40, 'PAUSED', { fontFamily:'monospace', fontSize:'36px', color:'#eaf2ff' }).setOrigin(0.5);
    const resume = this.add.text(width/2, height/2 + 20, 'Resume', { fontFamily:'monospace', fontSize:'20px', color:'#9ae6b4' }).setOrigin(0.5).setInteractive();
    const quit = this.add.text(width/2, height/2 + 60, 'Quit to Title', { fontFamily:'monospace', fontSize:'16px', color:'#ffb3b3' }).setOrigin(0.5).setInteractive();
    resume.on('pointerdown', () => { this.scene.stop(); this.scene.resume('GameScene'); });
    quit.on('pointerdown', () => { this.scene.stop('GameScene'); this.scene.start('TitleScene'); });
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); this.player = null; this.cursors = null; this.pickups = null; this.enemies = null; this.bullets = null; this.otherPlayers = new Map(); this.socket = null; }

  init(data) { this.options = data || {}; }

  create() {
    this.createProceduralArt();
    this.createWorld();
    this.createPlayer();
    this.createGroups();
    this.createInput();
    this.createHud();
    this.createAudio();
    this.createBoss();
    if (this.options.multiplayer) this.setupNetwork();

    this.timeLeft = 120; // more time for boss encounter
    this.wave = 1;
    this.spawnEnemyWave(this.wave);
  }

  createProceduralArt() {
    const g = this.make.graphics({ add: false });
    // player 16x16 variant
    g.clear();
    g.fillStyle(0x7ad7ff, 1); g.fillRect(0,0,16,16);
    g.fillStyle(0x041b2a,1); g.fillRect(4,5,2,2); g.fillRect(10,5,2,2); g.fillRect(5,10,6,2);
    g.generateTexture('pl16',16,16);
    // enemy 16
    g.clear(); g.fillStyle(0xff6b6b,1); g.fillRect(0,0,16,16); g.fillStyle(0x490b11,1); g.fillRect(3,4,10,8); g.generateTexture('en16',16,16);
    // pickup 20x20 per language
    for (const lang of GAME.languages) {
      g.clear();
      g.fillStyle(lang.color, 1); g.fillRect(0,0,20,20);
      g.fillStyle(0x07111a,1); g.fillRect(4,4,12,12);
      g.lineStyle(2, 0xffffff, 1); g.strokeRect(3,3,14,14);
      g.generateTexture(`pickup-${lang.code}`, 20, 20);
    }
    // bullet
    g.clear(); g.fillStyle(0xe0f2fe,1); g.fillRect(0,0,6,6); g.generateTexture('bullet',6,6);
    g.destroy();
  }

  createWorld() { // subtle grid background
    const grid = this.add.graphics(); grid.lineStyle(1, 0x1d2d3b, 1);
    for (let x = 0; x <= config.width; x += 32) { grid.moveTo(x, 0); grid.lineTo(x, config.height); }
    for (let y = 0; y <= config.height; y += 32) { grid.moveTo(0, y); grid.lineTo(config.width, y); }
    grid.strokePath();
  }

  createPlayer() {
    this.player = this.physics.add.sprite(GAME.width/2, GAME.height - 80, 'pl16');
    this.player.setScale(2);
    this.player.setCollideWorldBounds(true);
    this.player.health = 150;
    this.player.score = 0;
    this.player.id = Phaser.Math.RND.uuid();
  }

  createGroups() {
    this.pickups = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();

    // create pickups
    let i = 0;
    for (const lang of GAME.languages) {
      const x = 80 + (i%3)*320/1.15; const y = 90 + Math.floor(i/3)*120; i++;
      const p = this.physics.add.image(x, y, `pickup-${lang.code}`);
      p.lang = lang; p.collected = false; p.setImmovable(true); p.setScale(1.1);
      this.pickups.add(p);
    }

    // collisions
    this.physics.add.overlap(this.player, this.pickups, this.onCollectPickup, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
  }

  createInput() {
    this.cursors = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D', fire: 'SPACE', pause: 'ESC' });
    this.input.keyboard.on('keydown-ESC', () => { this.scene.launch('PauseScene'); this.scene.pause(); });
    this.input.keyboard.on('keydown-SPACE', () => { if (!this.gameOver) this.fireBullet(); });
  }

  createHud() {
    this.found = new Set();
    this.foundText = this.add.text(18, 18, 'Found: 0 / ' + GAME.languages.length, { fontFamily:'monospace', fontSize: '18px', color:'#dfeeff' });
    this.healthText = this.add.text(18, 42, 'HP: ' + this.player.health, { fontFamily:'monospace', fontSize:'18px', color:'#9ae6b4' });
    this.scoreText = this.add.text(GAME.width - 180, 18, 'Score: 0', { fontFamily:'monospace', fontSize:'18px', color:'#dbeafe' });
    this.timeText = this.add.text(GAME.width - 120, 42, '120s', { fontFamily:'monospace', fontSize:'18px', color:'#fef3c7' });
    this.waveText = this.add.text(GAME.width/2, 18, 'Wave ' + this.wave, { fontFamily:'monospace', fontSize:'18px', color:'#c4b5fd' }).setOrigin(0.5);

    // boss bar (hidden initially)
    this.bossBarBg = this.add.rectangle(GAME.width/2, 520, 420, 14, 0x000000, 0.6).setVisible(false).setOrigin(0.5);
    this.bossBar = this.add.rectangle(GAME.width/2 - 210, 520, 0, 10, 0xff6b6b).setVisible(false).setOrigin(0,0.5);
  }

  createAudio() {
    // lightweight WebAudio synth for music + SFX
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain(); this.masterGain.gain.value = 0.14; this.masterGain.connect(this.ctx.destination);
    this.isMusicOn = true;
    // simple background pattern
    this.bgStep = 0; this.bgTimer = 0;
  }

  playSfx(freq=440, dur=0.09, type='square', vol=0.08) {
    try {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol; o.connect(g); g.connect(this.masterGain);
      o.start(); o.stop(this.ctx.currentTime + dur);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    } catch (e) { /* Audio unavailable */ }
  }

  createBoss() {
    // boss is not present until wave threshold reached
    this.boss = null;
  }

  spawnEnemyWave(waveCount=1) {
    const base = 3 + waveCount * 2;
    for (let i = 0; i < base; i++) {
      const x = Phaser.Math.Between(40, GAME.width - 40);
      const y = Phaser.Math.Between(-120, -20);
      const e = this.physics.add.sprite(x, y, 'en16');
      e.setScale(1.6);
      e.health = 1 + Math.floor(waveCount/2);
      e.setData('speed', 30 + waveCount * 8);
      this.enemies.add(e);
    }
  }

  spawnBoss() {
    if (this.boss) return;
    const b = this.physics.add.sprite(GAME.width/2, -80, 'en16');
    b.setScale(6,4);
    b.health = 180;
    b.maxHealth = 180;
    b.phase = 0;
    b.attackTimer = 0;
    b.setImmovable(true);
    this.boss = b; this.add.existing(b);
    // show boss UI
    this.bossBarBg.setVisible(true); this.bossBar.setVisible(true);
  }

  onCollectPickup(player, pickup) {
    if (pickup.collected) return;
    pickup.collected = true;
    this.playSfx(880, 0.06, 'triangle', 0.06);
    this.found.add(pickup.lang.code);
    pickup.destroy();
    this.player.score += 100;
    if (this.found.size >= GAME.languages.length) {
      // trigger boss
      this.spawnBoss();
    }
    this.updateHud();
    // multiplayer notify
    if (this.socket) this.socket.emit('pickup', { code: pickup.lang.code });
  }

  onPlayerHit(player, enemy) {
    enemy.destroy(); this.player.health -= 20; this.playSfx(120, 0.08, 'sawtooth', 0.05); if (this.player.health <= 0) this.onGameOver(); this.updateHud();
  }

  onBulletHitEnemy(bullet, enemy) {
    bullet.destroy(); enemy.health -= 1; if (enemy.health <= 0) { enemy.destroy(); this.player.score += 15; this.playSfx(420,0.04,'square',0.03); }
  }

  fireBullet() {
    const b = this.physics.add.image(this.player.x, this.player.y - 18, 'bullet'); b.setVelocity(0, -520); b.damage = 1; this.bullets.add(b); this.playSfx(760, 0.03, 'square', 0.04);
  }

  updateHud() { this.foundText.setText(`Found: ${this.found.size} / ${GAME.languages.length}`); this.healthText.setText('HP: ' + Math.max(0, Math.round(this.player.health))); this.scoreText.setText('Score: ' + this.player.score); }

  update(time, delta) {
    if (this.gameOver) return;
    const dt = delta/1000;
    // music synth pattern
    this.bgTimer += dt;
    if (this.isMusicOn && this.bgTimer > 0.28) {
      this.bgTimer = 0; this.bgStep = (this.bgStep + 1) % 8; const freq = 220 * (1 + (this.bgStep%4)*0.12); this.playSfx(freq, 0.1, 'sine', 0.02);
    }

    this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.onGameOver(); }
    // movement
    const speed = 220; let vx = 0, vy = 0;
    if (this.cursors.left.isDown) vx -= 1; if (this.cursors.right.isDown) vx += 1; if (this.cursors.up.isDown) vy -= 1; if (this.cursors.down.isDown) vy += 1;
    const mag = Math.hypot(vx, vy) || 1; this.player.setVelocity((vx/mag)*speed, (vy/mag)*speed);

    // enemies homing
    this.enemies.getChildren().forEach((e) => {
      const angle = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
      const spd = e.getData('speed') || 50;
      e.setVelocity(Math.cos(angle)*spd, Math.sin(angle)*spd);
    });

    // bullets cleanup
    this.bullets.getChildren().forEach((b) => { if (b.y < -20) b.destroy(); });

    // spawn new waves if cleared
    if (this.enemies.countActive() === 0 && !this.boss) { this.wave++; this.spawnEnemyWave(this.wave); this.waveText.setText('Wave ' + this.wave); }

    // boss behavior
    if (this.boss) {
      if (this.boss.y < 120) { this.boss.setVelocity(0, 60); } else { this.boss.setVelocity(0,0); }
      // phase transitions
      const hpRatio = this.boss.health / this.boss.maxHealth;
      if (hpRatio < 0.6 && this.boss.phase < 1) this.boss.phase = 1;
      if (hpRatio < 0.25 && this.boss.phase < 2) this.boss.phase = 2;
      this.boss.attackTimer -= dt;
      if (this.boss.attackTimer <= 0 && this.boss.y >= 120) {
        this.boss.attackTimer = this.boss.phase === 2 ? 0.45 : this.boss.phase === 1 ? 0.9 : 1.6;
        // telegraphed spread attacks
        const shots = this.boss.phase === 2 ? 12 : this.boss.phase === 1 ? 7 : 4;
        const center = this.boss;
        for (let i=0;i<shots;i++) {
          const t = i/(shots-1) - 0.5; const angle = t * Math.PI * 0.9; const vx = Math.sin(angle)*220; const vy = Math.cos(angle)*220;
          const proj = this.physics.add.image(center.x, center.y + 30, 'bullet'); proj.setVelocity(vx, vy); proj.setTint(0xffb3b3); proj.isEnemy = true; this.bullets.add(proj);
        }
        this.playSfx(160, 0.18, 'sawtooth', 0.06);
      }
      // boss hurt by player's bullets
      this.physics.overlap(this.bullets, this.boss, (bullet, boss) => {
        if (!bullet || !boss) return; bullet.destroy(); boss.health -= 4; this.playSfx(380, 0.03, 'square', 0.02); if (boss.health <= 0) { boss.destroy(); this.onBossDefeated(); }
      });

      // update boss bar
      this.bossBar.setVisible(true); this.bossBarBg.setVisible(true);
      const w = 420 * Math.max(0, this.boss.health / this.boss.maxHealth);
      this.bossBar.width = Math.max(0, w);
    }

    // other players (multiplayer render)
    if (this.socket) {
      // send periodic state
      if (!this.nextSend || this.nextSend <= 0) { this.socket.emit('state', { x:this.player.x, y:this.player.y, hp:this.player.health }); this.nextSend = 0.06; }
      this.nextSend -= dt;
    }

    this.updateHud();
  }

  onBossDefeated() {
    this.playSfx(880, 0.15, 'triangle', 0.06);
    this.player.score += 1500;
    this.time.delayedCall(800, () => { this.finishGame(true); });
  }

  onGameOver() { this.gameOver = true; this.physics.pause(); this.add.text(GAME.width/2, GAME.height/2, 'GAME OVER', { fontFamily:'monospace', fontSize:'48px', color:'#ff8aa3' }).setOrigin(0.5); this.time.delayedCall(1800, () => this.scene.start('TitleScene')); }

  finishGame(win) { this.gameOver = true; this.physics.pause(); const title = win ? 'WORLD COMPLETE' : 'GAME OVER'; this.add.text(GAME.width/2, GAME.height/2, title, { fontFamily:'monospace', fontSize:'42px', color: win ? '#9ae6b4' : '#ff8aa3' }).setOrigin(0.5); this.time.delayedCall(1800, () => this.scene.start('TitleScene')); }

  setupNetwork() {
    try {
      this.socket = io();
      this.socket.on('connect', () => console.log('Socket connected', this.socket.id));
      this.socket.on('welcome', (payload) => console.log('server welcome', payload));
      this.socket.on('playerState', (state) => {
        if (!state) return;
        if (state.id === this.socket.id) return;
        let op = this.otherPlayers.get(state.id);
        if (!op) {
          op = this.add.rectangle(state.x, state.y, 18, 18, 0xffb3f9); this.otherPlayers.set(state.id, op);
        }
        op.x = state.x; op.y = state.y;
      });
      this.socket.on('pickup', (data) => {
        // server tells which language was collected — remove visuals if present
        const code = data.code;
        this.pickups.getChildren().forEach(p => { if (p.lang.code === code && !p.collected) { p.collected = true; p.destroy(); } });
      });
    } catch (e) { console.warn('Socket.IO not available', e); }
  }
}


// register scenes and start
const game = new Phaser.Game({ ...config, scene: [PreloadScene, TitleScene, PauseScene, GameScene] });
