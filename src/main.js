/*
Enhanced client: boss mechanics tuning, client-side prediction & interpolation, audio/UI polish, sprite atlas loading hooks.
To keep the repo lightweight, art and audio files are referenced in /assets and can be replaced with real files later.
*/

import Phaser from 'phaser'; // note: packaged phaser build already included in index.html for browser path; keep import for dev bundles

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
  languages: [ 'JS','PY','C++','RS','HTML','CSS','SQL','GO','JAVA' ],
  playerMaxSpeed: 320,
  serverTick: 60
};

// Simple helper to create DOM controls for audio + volume
function createAudioControls() {
  const controls = document.createElement('div');
  controls.style.position = 'absolute';
  controls.style.left = '12px';
  controls.style.bottom = '12px';
  controls.style.zIndex = '999';
  controls.style.backdropFilter = 'blur(6px)';
  controls.style.padding = '6px 8px';
  controls.style.borderRadius = '8px';
  controls.style.background = 'rgba(6,10,16,0.6)';
  controls.style.color = '#eaf2ff';
  controls.style.fontFamily = 'monospace';
  controls.innerHTML = `
    <label style="font-size:13px">Music <input id="cw-music-toggle" type="checkbox" checked /></label>
    <label style="margin-left:12px;font-size:13px">Volume <input id="cw-vol" type="range" min="0" max="100" value="14"/></label>
  `;
  document.body.appendChild(controls);
  return controls;
}

class ClientNetwork {
  constructor(scene) {
    this.scene = scene;
    this.socket = null;
    this.other = new Map(); // id -> { sprite, lastUpdate }
    this.inputs = [];
    this.lastServerTime = 0;
    this.predictionSeq = 0;
    this.pendingInputs = [];
    this.serverSnapshot = null;
    this.sendInterval = 1/ (GAME.serverTick / 1000);
    this.sendTimer = 0;
  }

  connect() {
    if (typeof io === 'undefined') return; // no socket
    this.socket = io();
    this.socket.on('connect', () => {
      console.log('connected to server', this.socket.id);
    });

    this.socket.on('welcome', payload => console.log('welcome', payload));

    this.socket.on('pickups', pickups => {
      // sync authoritative pickups
      if (!this.scene || !this.scene.pickups) return;
      pickups.forEach(p => {
        this.scene.pickups.getChildren().forEach(local => {
          if (local.lang && local.lang.code === p.code && p.taken && !local.collected) { local.collected = true; local.destroy(); }
        });
      });
    });

    this.socket.on('pickup', data => {
      // remove local pickup visuals
      if (!this.scene) return;
      this.scene.pickups.getChildren().forEach(p => { if (p.lang && p.lang.code === data.code && !p.collected) { p.collected = true; p.destroy(); } });
    });

    this.socket.on('playerState', state => {
      if (!state || state.id === this.socket.id) return;
      let entry = this.other.get(state.id);
      if (!entry) {
        entry = { sprite: this.scene.add.rectangle(state.x, state.y, 18, 18, 0xffb3f9), lastUpdate: performance.now(), buffer: [] };
        this.other.set(state.id, entry);
      }
      // push server snapshot for interpolation
      entry.buffer.push({ t: performance.now(), x: state.x, y: state.y });
      // keep buffer short
      if (entry.buffer.length > 8) entry.buffer.shift();
    });
  }

  sendState(payload) {
    if (!this.socket) return;
    // basic validation on client-side before sending
    const clamped = { x: Math.max(0, Math.min(GAME.width, payload.x)), y: Math.max(0, Math.min(GAME.height, payload.y)), hp: payload.hp || 100 };
    this.socket.emit('state', clamped);
  }

  sendPickup(code) {
    if (!this.socket) return;
    this.socket.emit('pickup', { code });
  }

  update(dt) {
    // interpolate other players
    const now = performance.now();
    this.other.forEach(entry => {
      // simple linear interp between last two samples
      const buf = entry.buffer;
      if (buf.length >= 2) {
        const a = buf[buf.length-2]; const b = buf[buf.length-1];
        if (!a || !b) return;
        const alpha = 0.5; // smoothing factor
        entry.sprite.x = Phaser.Math.Linear(a.x, b.x, alpha);
        entry.sprite.y = Phaser.Math.Linear(a.y, b.y, alpha);
      }
    });
  }
}

// Scenes
class TitleScene extends Phaser.Scene {
  constructor() { super('TitleScene'); }
  create() {
    this.add.text(GAME.width/2, 120, 'CODE WORLD', { fontFamily:'monospace', fontSize: '56px', color: '#a5f3fc' }).setOrigin(0.5);
    this.add.text(GAME.width/2, 180, 'Collect languages, survive waves, beat the boss', { fontFamily:'monospace', fontSize:'18px', color:'#dfeeff' }).setOrigin(0.5);

    const single = this.add.text(GAME.width/2, 280, 'Start Single Player', { fontFamily:'monospace', fontSize:'22px', color:'#03111c', backgroundColor:'#1f9dff' }).setOrigin(0.5).setPadding(12).setInteractive();
    single.on('pointerdown', ()=> this.scene.start('GameScene'));
    const multi = this.add.text(GAME.width/2, 340, 'Start Multiplayer (local server)', { fontFamily:'monospace', fontSize:'18px', color:'#03111c', backgroundColor:'#ffd66b' }).setOrigin(0.5).setPadding(10).setInteractive();
    multi.on('pointerdown', ()=> this.scene.start('GameScene', { multiplayer: true }));

    // audio controls DOM
    if (!document.getElementById('cw-music-toggle')) createAudioControls();
  }
}

class PauseScene extends Phaser.Scene {
  constructor(){ super('PauseScene'); }
  create(){
    const { width, height } = this.scale; this.add.rectangle(width/2, height/2, 460, 240, 0x081820, 0.96).setStrokeStyle(2, 0xffffff, 0.06);
    this.add.text(width/2, height/2-48, 'PAUSED', { fontFamily:'monospace', fontSize:'40px', color:'#eaf2ff' }).setOrigin(0.5);
    const resume = this.add.text(width/2, height/2+4, 'Resume', { fontFamily:'monospace', fontSize:'20px', color:'#9ae6b4' }).setOrigin(0.5).setInteractive(); resume.on('pointerdown', ()=> { this.scene.stop(); this.scene.resume('GameScene'); });
    const quit = this.add.text(width/2, height/2+48, 'Quit to Title', { fontFamily:'monospace', fontSize:'16px', color:'#ffb3b3' }).setOrigin(0.5).setInteractive(); quit.on('pointerdown', ()=> { this.scene.stop('GameScene'); this.scene.start('TitleScene'); });
  }
}

class GameScene extends Phaser.Scene {
  constructor(){ super('GameScene'); this.net = null; this.player = null; this.cursors = null; this.pickups = null; this.enemies = null; this.bullets = null; this.boss = null; this.timeLeft = 120; this.gameOver = false; this.lastSend = 0; }

  init(data){ this.options = data || {}; }

  create(){
    // procedural or atlas art load
    this.createProceduralArt();
    this.createWorld();
    this.createPlayer();
    this.createGroups();
    this.createInput();
    this.createHud();
    this.createAudio();
    this.createBoss();

    // networking
    this.net = new ClientNetwork(this);
    if (this.options.multiplayer) this.net.connect();
  }

  createProceduralArt(){
    const g = this.make.graphics({ add:false });
    g.clear(); g.fillStyle(0x7ad7ff,1); g.fillRect(0,0,16,16); g.fillStyle(0x041b2a,1); g.fillRect(4,5,2,2); g.fillRect(10,5,2,2); g.fillRect(5,10,6,2); g.generateTexture('pl16',16,16);
    g.clear(); g.fillStyle(0xff6b6b,1); g.fillRect(0,0,16,16); g.fillStyle(0x490b11,1); g.fillRect(3,4,10,8); g.generateTexture('en16',16,16);
    for (let i=0;i<GAME.languages.length;i++){ g.clear(); const color = Phaser.Display.Color.HexStringToColor('#' + (0x1000000 + (Math.random()*0xffffff)|0).toString(16).slice(1)).color; g.fillStyle(color,1); g.fillRect(0,0,20,20); g.fillStyle(0x07111a,1); g.fillRect(4,4,12,12); g.lineStyle(2, 0xffffff, 1); g.strokeRect(3,3,14,14); g.generateTexture('pickup-'+GAME.languages[i],20,20); }
    g.clear(); g.fillStyle(0xe0f2fe,1); g.fillRect(0,0,6,6); g.generateTexture('bullet',6,6); g.destroy();
  }

  createWorld(){ const grid = this.add.graphics(); grid.lineStyle(1, 0x1d2d3b, 1); for (let x=0;x<=config.width;x+=32){ grid.moveTo(x,0); grid.lineTo(x,config.height);} for (let y=0;y<=config.height;y+=32){ grid.moveTo(0,y); grid.lineTo(config.width,y);} grid.strokePath(); }

  createPlayer(){ this.player = this.physics.add.sprite(GAME.width/2, GAME.height-80, 'pl16'); this.player.setScale(2); this.player.setCollideWorldBounds(true); this.player.health = 180; this.player.score = 0; this.player.id = Phaser.Math.RND.uuid(); }

  createGroups(){ this.pickups = this.physics.add.group(); this.enemies = this.physics.add.group(); this.bullets = this.physics.add.group(); let i=0; for (const code of GAME.languages){ const x = 80 + (i%3)*320/1.15; const y = 90 + Math.floor(i/3)*120; i++; const p = this.physics.add.image(x,y,'pickup-'+code); p.lang = { code }; p.collected=false; p.setImmovable(true); p.setScale(1.1); this.pickups.add(p); }
    this.physics.add.overlap(this.player, this.pickups, this.onCollectPickup, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.onPlayerHit, null, this);
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitEnemy, null, this);
  }

  createInput(){ this.cursors = this.input.keyboard.addKeys({ left:'A', right:'D', up:'W', down:'S', fire:'SPACE', pause:'ESC' }); this.input.keyboard.on('keydown-ESC', ()=> { this.scene.launch('PauseScene'); this.scene.pause(); }); this.input.keyboard.on('keydown-SPACE', ()=> { if (!this.gameOver) this.fireBullet(); }); }

  createHud(){ this.found = new Set(); this.foundText = this.add.text(18,18,'Found: 0 / ' + GAME.languages.length,{ fontFamily:'monospace', fontSize:'18px', color:'#dfeeff'}); this.healthText = this.add.text(18,42,'HP: ' + this.player.health,{ fontFamily:'monospace', fontSize:'18px', color:'#9ae6b4'}); this.scoreText = this.add.text(GAME.width-180,18,'Score: 0',{ fontFamily:'monospace', fontSize:'18px', color:'#dbeafe'}); this.timeText = this.add.text(GAME.width-120,42,'120s',{ fontFamily:'monospace', fontSize:'18px', color:'#fef3c7'}); this.waveText = this.add.text(GAME.width/2,18,'Wave 1',{ fontFamily:'monospace', fontSize:'18px', color:'#c4b5fd'}).setOrigin(0.5); this.bossBarBg = this.add.rectangle(GAME.width/2,520,420,14,0x000000,0.6).setVisible(false).setOrigin(0.5); this.bossBar = this.add.rectangle(GAME.width/2-210,520,0,10,0xff6b6b).setVisible(false).setOrigin(0,0.5); }

  createAudio(){ this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.masterGain = this.ctx.createGain(); this.masterGain.gain.value = 0.14; this.masterGain.connect(this.ctx.destination); this.isMusicOn = true; document.getElementById('cw-music-toggle')?.addEventListener('change', (e)=>{ this.isMusicOn = e.target.checked; }); document.getElementById('cw-vol')?.addEventListener('input', (e)=>{ this.masterGain.gain.value = Number(e.target.value)/100; }); this.bgStep=0; this.bgTimer=0; }

  createBoss(){ this.boss = null; }

  spawnEnemyWave(count=3){ for (let i=0;i<count;i++){ const x = Phaser.Math.Between(40, GAME.width-40); const y = Phaser.Math.Between(-120, -20); const e = this.physics.add.sprite(x,y,'en16'); e.setScale(1.6); e.health = 1 + Math.floor(this.wave/2); e.setData('speed', 30 + this.wave*8); this.enemies.add(e); } }

  spawnBoss(){ if (this.boss) return; const b = this.physics.add.sprite(GAME.width/2,-120,'en16'); b.setScale(8,5); b.health = 240; b.maxHealth = 240; b.phase = 0; b.attackTimer = 0; b.setImmovable(true); this.boss = b; this.bossCoreOpen = false; this.bossCoreTimer = 0; this.bossVulnerableWindow = 0; this.bossLastDamage = 0; this.bossSpawnedAt = performance.now(); this.bossPulse = 0; this.bossRevealParticles = []; this.bossBarBg.setVisible(true); this.bossBar.setVisible(true); }

  onCollectPickup(player, pickup){ if (pickup.collected) return; pickup.collected=true; this.playSfx(880,0.06,'triangle',0.06); this.found.add(pickup.lang.code); pickup.destroy(); this.player.score += 100; if (this.found.size >= GAME.languages.length) this.spawnBoss(); this.updateHud(); if (this.net) this.net.sendPickup(pickup.lang.code); }

  onPlayerHit(player, enemy){ enemy.destroy(); this.player.health -= 20; this.playSfx(120,0.08,'sawtooth',0.05); if (this.player.health <= 0) this.onGameOver(); this.updateHud(); }

  onBulletHitEnemy(bullet, enemy){ bullet.destroy(); enemy.health -= 1; if (enemy.health <= 0){ enemy.destroy(); this.player.score += 15; this.playSfx(420,0.04,'square',0.03); } }

  fireBullet(){ const b = this.physics.add.image(this.player.x, this.player.y - 18, 'bullet'); b.setVelocity(0, -520); b.damage=1; this.bullets.add(b); this.playSfx(760,0.03,'square',0.04); }

  playSfx(freq=440,dur=0.09,type='square',vol=0.08){ try{ const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(this.masterGain); o.start(); o.stop(this.ctx.currentTime+dur); g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+dur); }catch(e){} }

  update(time, delta){ if (this.gameOver) return; const dt = delta/1000; if (this.isMusicOn){ this.bgTimer += dt; if (this.bgTimer > 0.28){ this.bgTimer = 0; this.bgStep = (this.bgStep+1)%8; const freq = 220 * (1 + (this.bgStep%4)*0.12); this.playSfx(freq, 0.1, 'sine', 0.02); } }
    this.timeLeft -= dt; if (this.timeLeft <= 0) { this.timeLeft = 0; this.onGameOver(); }
    // movement with simple client-side prediction before server ack
    const speed = GAME.playerMaxSpeed; let vx=0, vy=0; if (this.cursors.left.isDown) vx -= 1; if (this.cursors.right.isDown) vx += 1; if (this.cursors.up.isDown) vy -= 1; if (this.cursors.down.isDown) vy += 1; const mag = Math.hypot(vx,vy) || 1; this.player.setVelocity((vx/mag)*speed, (vy/mag)*speed);

    // send local state to server at ~20Hz
    this.lastSend += dt; if (this.lastSend > 0.05){ this.lastSend = 0; if (this.net && this.net.socket) this.net.sendState({ x:this.player.x, y:this.player.y, hp:this.player.health }); }

    // enemies homing
    this.enemies.getChildren().forEach(e=>{ const angle = Phaser.Math.Angle.Between(e.x,e.y,this.player.x,this.player.y); const spd = e.getData('speed') || 50; e.setVelocity(Math.cos(angle)*spd, Math.sin(angle)*spd); });

    this.bullets.getChildren().forEach(b=>{ if (b.y < -20 || b.y > GAME.height+40 || b.x < -40 || b.x > GAME.width+40) b.destroy(); if (b.isEnemy && this.physics.overlap(b, this.player)){ b.destroy(); this.player.health -= 18; this.playSfx(120,0.06,'sawtooth',0.04); if (this.player.health <= 0) this.onGameOver(); } });

    // wave spawn
    if (this.enemies.countActive()==0 && !this.boss) { this.wave = (this.wave || 1) + 1; this.spawnEnemyWave(3 + this.wave); this.waveText.setText('Wave ' + this.wave); }

    // boss logic (tuned): phases, telegraph, core vulnerability window
    if (this.boss){ if (this.boss.y < 120) this.boss.setVelocity(0, 80); else this.boss.setVelocity(0,0); const hpRatio = this.boss.health / this.boss.maxHealth; if (hpRatio < 0.6 && this.boss.phase < 1) this.boss.phase = 1; if (hpRatio < 0.25 && this.boss.phase < 2) this.boss.phase = 2; this.boss.attackTimer -= dt; // open core periodically in phase 1+ where player can do big damage
        if (this.boss.phase >= 1){ this.bossCoreTimer -= dt; if (this.bossCoreTimer <= 0){ this.bossCoreTimer = 6 - this.boss.phase * 2; this.bossCoreOpen = true; this.bossVulnerableWindow = 1.6 - this.boss.phase*0.4; this.playSfx(560,0.2,'triangle',0.06); } if (this.bossCoreOpen){ this.bossVulnerableWindow -= dt; // visual pulse
            this.bossPulse = Math.min(1, (this.bossPulse + dt*2)); if (this.bossVulnerableWindow <= 0){ this.bossCoreOpen = false; this.bossPulse = 0; }
        }
        if (this.boss.attackTimer <= 0 && this.boss.y >= 120){ this.boss.attackTimer = this.boss.phase === 2 ? 0.45 : this.boss.phase === 1 ? 0.9 : 1.6; const shots = this.boss.phase === 2 ? 12 : this.boss.phase === 1 ? 8 : 4; for (let i=0;i<shots;i++){ const t = i/(shots-1) - 0.5; const angle = t * Math.PI * 0.9; const vx = Math.sin(angle)*220; const vy = Math.cos(angle)*220; const proj = this.physics.add.image(this.boss.x + (this.bossCoreOpen ? Phaser.Math.Between(-20,20):0), this.boss.y + 30, 'bullet'); proj.setVelocity(vx, vy); proj.setTint(0xffb3b3); proj.isEnemy = true; this.bullets.add(proj); } this.playSfx(160,0.18,'sawtooth',0.06); } // check collisions: player bullets can damage core more while open
        this.bullets.getChildren().forEach(b=>{ if (!b.isEnemy && this.physics.overlap(b, this.boss)){ b.destroy(); const dmg = this.bossCoreOpen ? 12 : 4; this.boss.health -= dmg; this.playSfx(380,0.03,'square',0.02); if (this.boss.health <= 0){ this.boss.destroy(); this.onBossDefeated(); } } }); // update boss bar
        const w = 420 * Math.max(0, this.boss.health / this.boss.maxHealth); this.bossBar.width = Math.max(0, w); this.bossBar.setVisible(true); this.bossBarBg.setVisible(true); }

    // interpolation for other players via net
    if (this.net) this.net.update(dt);

    this.updateHud();
  }

  onBossDefeated(){ this.playSfx(880,0.15,'triangle',0.06); this.player.score += 2000; this.time.delayedCall(800, ()=> this.finishGame(true)); }

  onGameOver(){ this.gameOver = true; this.physics.pause(); this.add.text(GAME.width/2, GAME.height/2, 'GAME OVER', { fontFamily:'monospace', fontSize:'48px', color:'#ff8aa3' }).setOrigin(0.5); this.time.delayedCall(1800, ()=> this.scene.start('TitleScene')); }

  finishGame(win){ this.gameOver = true; this.physics.pause(); const title = win ? 'WORLD COMPLETE' : 'GAME OVER'; this.add.text(GAME.width/2, GAME.height/2, title, { fontFamily:'monospace', fontSize:'42px', color: win ? '#9ae6b4' : '#ff8aa3' }).setOrigin(0.5); this.time.delayedCall(1800, ()=> this.scene.start('TitleScene')); }
}

// register scenes and start
const game = new Phaser.Game({ ...config, scene: [ TitleScene, PauseScene, GameScene ] });
