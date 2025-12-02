/*
Simple Mario-like side scroller written in plain React (single file)

How to use
1. Create a React app (Vite recommended):
   npm create vite@latest mario-clone -- --template react
   cd mario-clone
   npm install
2. Replace src/App.jsx with the contents of this file.
3. Run: npm run dev  (Vite) or npm start (Create React App)

What this file includes
- A responsive <canvas> game area
- Player physics (run, jump, gravity)
- Tile-based level (string map) with ground (#), coins (C), enemies (E), player start (P), goal (G)
- Camera that follows player
- Simple enemy AI and stomp-to-kill mechanic
- HUD: score, lives, instructions

Notes
- No external images/sounds required — everything is drawn with shapes.
- To add sprites or audio, replace draw calls with image/sound loading.
- This is intentionally compact and readable; you can extend it with a level editor or JSON map.
*/

import React, { useRef, useEffect, useState } from "react";

export default function App() {
  const canvasRef = useRef(null);
  const reqRef = useRef(null);
  const lastTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const [scoreState, setScoreState] = useState(0);
  const [livesState, setLivesState] = useState(3);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // logical size
    const VIEW_W = 960;
    const VIEW_H = 540;

    // device pixel ratio handling
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = VIEW_W + "px";
      canvas.style.height = VIEW_H + "px";
      canvas.width = Math.floor(VIEW_W * dpr);
      canvas.height = Math.floor(VIEW_H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // game constants
    const TILE = 48;
    const GRAV = 2400; // px / s^2
    const MOVE_SPEED = 280; // px / s
    const JUMP_SPEED = 720;

    // level map (array of strings - wider than viewport to test scrolling)
    const level = [
      "                                                                                ",
      "                                                                                ",
      "                                                                                ",
      "                                                                                ",
      "       C                                                                        G",
      "   #######                     E                      C               ######    ",
      "                                                                                ",
      " P                                                                              ",
      "############################    ############################  ###################",
      "############################    ############################  ###################"
    ];

    // parse map
    const rows = level.length;
    const cols = Math.max(...level.map((r) => r.length));
    const worldW = cols * TILE;
    const worldH = rows * TILE;

    const tiles = [];
    const coins = [];
    const enemies = [];
    let player = {
      x: TILE * 2,
      y: 0,
      w: 36,
      h: 42,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      alive: true,
    };

    for (let r = 0; r < rows; r++) {
      const row = level[r];
      for (let c = 0; c < cols; c++) {
        const ch = row[c] || " ";
        const x = c * TILE;
        const y = r * TILE;
        if (ch === "#") tiles.push({ x, y, c, r });
        if (ch === "C") coins.push({ x: x + TILE / 2, y: y + TILE / 2, r, c, picked: false });
        if (ch === "E") enemies.push({ x, y: y + TILE - 40, w: 36, h: 36, speed: 60, dir: 1, alive: true });
        if (ch === "P") {
          player.x = x + 6;
          player.y = y - player.h;
        }
        if (ch === "G") {
          // goal tile (optional)
        }
      }
    }

    // input
    const keys = { left: false, right: false, up: false };
    function onKeyDown(e) {
      if (e.key === "ArrowLeft" || e.key === "a") keys.left = true;
      if (e.key === "ArrowRight" || e.key === "d") keys.right = true;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") keys.up = true;
      if (e.key === "p") setIsPaused((p) => !p);
    }
    function onKeyUp(e) {
      if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") keys.up = false;
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function rectsIntersect(a, b) {
      return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
    }

    function getTileAt(col, row) {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
      return level[row][col] || " ";
    }

    function isSolidAtColRow(col, row) {
      return getTileAt(col, row) === "#";
    }

    function moveEntityX(ent, dx) {
      ent.x += dx;
      // check collisions
      const left = Math.floor(ent.x / TILE);
      const right = Math.floor((ent.x + ent.w - 1) / TILE);
      const top = Math.floor(ent.y / TILE);
      const bottom = Math.floor((ent.y + ent.h - 1) / TILE);
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          if (isSolidAtColRow(c, r)) {
            if (dx > 0) {
              ent.x = c * TILE - ent.w;
            } else if (dx < 0) {
              ent.x = c * TILE + TILE;
            }
            if (ent.vx) ent.vx = 0;
            return;
          }
        }
      }
    }

    function moveEntityY(ent, dy) {
      ent.y += dy;
      const left = Math.floor(ent.x / TILE);
      const right = Math.floor((ent.x + ent.w - 1) / TILE);
      const top = Math.floor(ent.y / TILE);
      const bottom = Math.floor((ent.y + ent.h - 1) / TILE);
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          if (isSolidAtColRow(c, r)) {
            if (dy > 0) {
              ent.y = r * TILE - ent.h;
              ent.vy = 0;
              ent.onGround = true;
            } else if (dy < 0) {
              ent.y = r * TILE + TILE;
              ent.vy = 0;
            }
            return;
          }
        }
      }
      ent.onGround = false;
    }

    function restartLevel() {
      // reset player position & objects
      scoreRef.current = 0;
      livesRef.current = Math.max(0, livesRef.current);
      setScoreState(scoreRef.current);
      setLivesState(livesRef.current);
      // simple: reload page level by re-parsing (cheap in this tiny example)
      // (for this single-file demo we'll just reload the window to reset everything)
      // but to keep single-file behavior without reload, you could reinitialize objects
      player.x = TILE * 2;
      player.y = 0;
      player.vx = 0;
      player.vy = 0;
      coins.forEach((c) => (c.picked = false));
      enemies.forEach((e) => (e.alive = true));
    }

    function update(dt) {
      if (!player.alive) return;
      // horizontal movement
      let move = 0;
      if (keys.left) move -= 1;
      if (keys.right) move += 1;
      player.vx = move * MOVE_SPEED;
      if (move !== 0) player.facing = move > 0 ? 1 : -1;

      // jump
      if (keys.up && player.onGround) {
        player.vy = -JUMP_SPEED;
        player.onGround = false;
      }

      // apply gravity
      player.vy += GRAV * dt;

      // integrate
      moveEntityX(player, player.vx * dt);
      moveEntityY(player, player.vy * dt);

      // coin collection
      for (const coin of coins) {
        if (!coin.picked) {
          const cbox = { x: coin.x - 10, y: coin.y - 10, w: 20, h: 20 };
          const pbox = { x: player.x, y: player.y, w: player.w, h: player.h };
          if (rectsIntersect(cbox, pbox)) {
            coin.picked = true;
            scoreRef.current += 1;
            setScoreState(scoreRef.current);
          }
        }
      }

      // enemies
      for (const en of enemies) {
        if (!en.alive) continue;
        // simple patrol: turn if next tile is solid
        // check ahead
        en.x += en.dir * en.speed * dt;
        // basic collision with ground tiles horizontally
        const aheadCol = Math.floor((en.x + (en.dir > 0 ? en.w : 0)) / TILE);
        const footRow = Math.floor((en.y + en.h + 1) / TILE);
        if (isSolidAtColRow(aheadCol, footRow) === false) {
          en.dir *= -1; // turn around if no ground
        }

        const enBox = { x: en.x, y: en.y, w: en.w, h: en.h };
        const pBox = { x: player.x, y: player.y, w: player.w, h: player.h };
        if (rectsIntersect(enBox, pBox)) {
          // if player falling and intersects from above -> stomp
          const playerBottom = player.y + player.h;
          if (player.vy > 0 && playerBottom - (en.y + en.h / 2) < 16) {
            en.alive = false;
            player.vy = -JUMP_SPEED * 0.5; // bounce
            scoreRef.current += 2;
            setScoreState(scoreRef.current);
          } else {
            // player hurt
            livesRef.current -= 1;
            setLivesState(livesRef.current);
            if (livesRef.current <= 0) {
              player.alive = false;
            } else {
              // respawn
              player.x = TILE * 2;
              player.y = 0;
              player.vx = 0;
              player.vy = 0;
            }
          }
        }
      }

      // fall into void
      if (player.y > worldH + 500) {
        livesRef.current -= 1;
        setLivesState(livesRef.current);
        if (livesRef.current <= 0) player.alive = false;
        else {
          player.x = TILE * 2;
          player.y = 0;
          player.vx = 0;
          player.vy = 0;
        }
      }
    }

    function draw() {
      // clear
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);

      // camera
      const camX = Math.max(0, Math.min(player.x - VIEW_W / 3, worldW - VIEW_W));
      const camY = 0;

      // background
      ctx.fillStyle = "#9eefff";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.save();
      ctx.translate(-camX, -camY);

      // draw tiles
      for (const t of tiles) {
        ctx.fillStyle = "#654321"; // ground
        ctx.fillRect(t.x, t.y, TILE, TILE);
        // a simple top highlight
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(t.x, t.y, TILE, 6);
      }

      // draw coins
      for (const c of coins) {
        if (c.picked) continue;
        ctx.beginPath();
        ctx.fillStyle = "gold";
        ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
      }

      // draw enemies
      for (const e of enemies) {
        if (!e.alive) continue;
        ctx.fillStyle = "#b22222";
        ctx.fillRect(e.x, e.y, e.w, e.h);
        // eyes
        ctx.fillStyle = "white";
        ctx.fillRect(e.x + 6, e.y + 8, 6, 6);
        ctx.fillRect(e.x + e.w - 12, e.y + 8, 6, 6);
      }

      // draw player (simple rounded rectangle)
      if (player.alive) {
        ctx.save();
        ctx.translate(player.x + player.w / 2, player.y + player.h / 2);
        if (player.facing < 0) ctx.scale(-1, 1);
        ctx.translate(-player.w / 2, -player.h / 2);
        // body
        ctx.fillStyle = "#0b6";
        roundRect(ctx, 0, 0, player.w, player.h, 6, true, false);
        // eyes
        ctx.fillStyle = "white";
        ctx.fillRect(8, 10, 6, 6);
        ctx.fillStyle = "black";
        ctx.fillRect(10, 12, 2, 2);
        ctx.restore();
      }

      ctx.restore();

      // HUD
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(6, 6, 220, 44);
      ctx.fillStyle = "white";
      ctx.font = "18px monospace";
      ctx.fillText(`Score: ${scoreRef.current}`, 12, 28);
      ctx.fillText(`Lives: ${livesRef.current}`, 140, 28);

      if (isPaused) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(VIEW_W / 2 - 120, VIEW_H / 2 - 40, 240, 80);
        ctx.fillStyle = "white";
        ctx.font = "24px monospace";
        ctx.fillText("PAUSED", VIEW_W / 2 - 40, VIEW_H / 2 + 8);
      }

      if (!player.alive) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(VIEW_W / 2 - 180, VIEW_H / 2 - 80, 360, 160);
        ctx.fillStyle = "white";
        ctx.font = "22px monospace";
        ctx.fillText("Game Over", VIEW_W / 2 - 60, VIEW_H / 2 - 8);
        ctx.font = "16px monospace";
        ctx.fillText("Press R to restart", VIEW_W / 2 - 72, VIEW_H / 2 + 26);
      }
    }

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
      if (typeof r === "undefined") r = 5;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      if (fill) ctx.fill();
      if (stroke) ctx.stroke();
    }

    function loop(t) {
      if (!lastTimeRef.current) lastTimeRef.current = t;
      const dt = Math.min(0.04, (t - lastTimeRef.current) / 1000);
      lastTimeRef.current = t;
      if (!isPaused && player.alive) update(dt);
      draw();
      reqRef.current = requestAnimationFrame(loop);
    }

    // restart key
    function onKeyR(e) {
      if (e.key.toLowerCase() === "r") {
        // reinitialize the scene (simple reset)
        // For this demo we'll reload the page to reset everything reliably
        // but to avoid reloading uncomment restartLevel() instead.
        // restartLevel();
        window.location.reload();
      }
    }
    window.addEventListener("keydown", onKeyR);

    reqRef.current = requestAnimationFrame(loop);

    // cleanup
    return () => {
      cancelAnimationFrame(reqRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyR);
    };
  }, [isPaused]);

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div>
        <h2 style={{ margin: "6px 0" }}>Mario-like React Game</h2>
        <p style={{ margin: "6px 0" }}>
          Controls: Arrow keys / A D to move, W / Up / Space to jump, P to pause, R to restart.
        </p>
        <canvas
          ref={canvasRef}
          style={{ border: "4px solid #222", borderRadius: 8, display: "block", background: "#9eefff" }}
        />
        <div style={{ marginTop: 8 }}>
          <strong>Score:</strong> {scoreState} &nbsp; <strong>Lives:</strong> {livesState}
        </div>
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setIsPaused((p) => !p)}>{isPaused ? "Resume" : "Pause"}</button>
          <button
            onClick={() => {
              // reload to reset
              window.location.reload();
            }}
            style={{ marginLeft: 8 }}
          >
            Restart
          </button>
        </div>
      </div>
      <div style={{ maxWidth: 360 }}>
        <h3>How to customize</h3>
        <ol>
          <li>Edit the <code>level</code> array near the top of the file to create different maps. Each string is a row. Tiles: <code>#</code>=ground, <code>C</code>=coin, <code>E</code>=enemy, <code>P</code>=player start, <code>G</code>=goal.</li>
          <li>Adjust physics constants: <code>GRAV</code>, <code>MOVE_SPEED</code>, <code>JUMP_SPEED</code>.</li>
          <li>Replace the simple shapes with images: load <code>Image()</code> and draw via <code>ctx.drawImage</code>.</li>
          <li>Add levels by creating an array of level objects and switching when player reaches goal.</li>
        </ol>
        <h3>Next steps ideas</h3>
        <ul>
          <li>Add tilemap JSON and a level editor.</li>
          <li>Add audio (jump sound, coin pickup, background music).</li>
          <li>Implement moving platforms and more complex enemies.</li>
          <li>Add checkpoint / save to localStorage.</li>
        </ul>
      </div>
    </div>
  );
}
