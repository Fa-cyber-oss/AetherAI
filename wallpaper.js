/**
 * 3D Live Wallpaper Engine — Aether AI
 * Renders an interactive 3D liquid wave surface, floating chromatic liquid orbs,
 * and specular ambient reflections with mouse parallax and zero-latency 60FPS animation.
 */

export class LiveWallpaper {
  constructor(canvasId = 'bgCanvas') {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.width = 0;
    this.height = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Mouse coordinates & smooth target
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.time = 0;
    this.isRunning = true;

    // 3D Liquid Orbs
    this.orbs = [
      { x: -0.35, y: -0.25, z: 2.2, radius: 260, color: 'rgba(99, 102, 241, 0.28)', speed: 0.0008, phase: 0 },
      { x: 0.4, y: 0.2, z: 2.8, radius: 320, color: 'rgba(56, 189, 248, 0.22)', speed: 0.0006, phase: 2.1 },
      { x: -0.1, y: 0.45, z: 3.2, radius: 240, color: 'rgba(192, 132, 252, 0.25)', speed: 0.0007, phase: 4.3 },
      { x: 0.5, y: -0.4, z: 2.5, radius: 210, color: 'rgba(14, 165, 233, 0.20)', speed: 0.0011, phase: 1.5 }
    ];

    // 3D Liquid Grid configuration
    this.cols = 28;
    this.rows = 20;
    this.gridSpacing = 95;
    this.fov = 420;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.onMouseMove({
          clientX: e.touches[0].clientX,
          clientY: e.touches[0].clientY
        });
      }
    }, { passive: true });
    
    // Performance optimization: pause when tab inactive
    document.addEventListener('visibilitychange', () => {
      this.isRunning = !document.hidden;
      if (this.isRunning) this.animate();
    });

    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);

    // Adaptive 3D grid density and FOV across phones, tablets, laptops, and ultra-wide monitors
    if (this.width < 600) {
      this.cols = 16;
      this.rows = 14;
      this.gridSpacing = 85;
      this.fov = 340;
    } else if (this.width < 1024) {
      this.cols = 22;
      this.rows = 18;
      this.gridSpacing = 90;
      this.fov = 380;
    } else if (this.width >= 1920) {
      this.cols = 36;
      this.rows = 24;
      this.gridSpacing = 105;
      this.fov = 520;
    } else {
      this.cols = 28;
      this.rows = 20;
      this.gridSpacing = 95;
      this.fov = 420;
    }
  }

  onMouseMove(e) {
    // Normalized mouse (-1 to 1)
    this.mouse.targetX = (e.clientX / this.width) * 2 - 1;
    this.mouse.targetY = (e.clientY / this.height) * 2 - 1;
  }

  animate() {
    if (!this.isRunning) return;

    this.time += 0.015;
    // Smooth lerp for mouse parallax
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.04;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.04;

    this.render();
    requestAnimationFrame(() => this.animate());
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // Base background gradient with depth
    ctx.clearRect(0, 0, w, h);

    const baseGrad = ctx.createRadialGradient(
      w * 0.5 + this.mouse.x * 60,
      h * 0.4 + this.mouse.y * 60,
      10,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.85
    );

    if (isDark) {
      baseGrad.addColorStop(0, '#0f172a');
      baseGrad.addColorStop(0.5, '#090d16');
      baseGrad.addColorStop(1, '#05070b');
    } else {
      baseGrad.addColorStop(0, '#f8fafc');
      baseGrad.addColorStop(0.6, '#eef2ff');
      baseGrad.addColorStop(1, '#e2e8f0');
    }
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    // 1. Render Floating 3D Liquid Orbs (Deep Layer)
    this.renderLiquidOrbs(ctx, w, h, isDark);

    // 2. Render 3D Liquid Waves Surface (Mid-Foreground Layer)
    this.renderLiquid3DWaves(ctx, w, h, isDark);
  }

  renderLiquidOrbs(ctx, w, h, isDark) {
    const cx = w * 0.5;
    const cy = h * 0.5;

    this.orbs.forEach((orb) => {
      // Harmonic 3D drifting
      const ox = (orb.x + Math.sin(this.time * orb.speed * 40 + orb.phase) * 0.12 + this.mouse.x * 0.08) * w + cx;
      const oy = (orb.y + Math.cos(this.time * orb.speed * 30 + orb.phase) * 0.1 + this.mouse.y * 0.08) * h + cy;
      const r = orb.radius * (1 + Math.sin(this.time * 0.6 + orb.phase) * 0.08);

      const radGrad = ctx.createRadialGradient(
        ox - r * 0.25,
        oy - r * 0.25,
        r * 0.05,
        ox,
        oy,
        r
      );

      if (isDark) {
        radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        radGrad.addColorStop(0.2, orb.color);
        radGrad.addColorStop(0.7, orb.color.replace(/[\d\.]+\)$/, '0.08)'));
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        radGrad.addColorStop(0.3, orb.color.replace('0.2', '0.15'));
        radGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }

      ctx.save();
      ctx.globalCompositeOperation = isDark ? 'screen' : 'multiply';
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  renderLiquid3DWaves(ctx, w, h, isDark) {
    const cx = w * 0.5;
    const cy = h * 0.55;
    const fov = this.fov;
    const pitch = 0.55 + this.mouse.y * 0.15; // Camera tilt
    const yaw = this.mouse.x * 0.25;          // Camera yaw

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Compute grid vertex points in 3D space
    const projectedPoints = [];

    for (let r = 0; r < this.rows; r++) {
      projectedPoints[r] = [];
      const zWorld = (r - this.rows * 0.5) * this.gridSpacing + 650;

      for (let c = 0; c < this.cols; c++) {
        const xWorld = (c - this.cols * 0.5) * this.gridSpacing;

        // 3D Liquid Wave elevation using compound sinusoidal harmonics
        const dist = Math.sqrt(xWorld * xWorld + (zWorld - 650) * (zWorld - 650));
        const wave1 = Math.sin(xWorld * 0.006 + this.time * 1.4) * 35;
        const wave2 = Math.cos(zWorld * 0.007 - this.time * 1.1) * 30;
        const wave3 = Math.sin((dist * 0.008) - this.time * 1.8) * 28;
        const yWorld = wave1 + wave2 + wave3;

        // 3D Camera Rotation
        const x1 = xWorld * cosY - zWorld * sinY;
        const z1 = xWorld * sinY + zWorld * cosY;

        const y2 = yWorld * cosP - z1 * sinP;
        const z2 = yWorld * sinP + z1 * cosP;

        if (z2 <= 20) {
          projectedPoints[r][c] = null;
          continue;
        }

        // Perspective Projection
        const scale = fov / z2;
        const screenX = cx + x1 * scale;
        const screenY = cy + y2 * scale;

        projectedPoints[r][c] = {
          x: screenX,
          y: screenY,
          depth: z2,
          elevation: yWorld
        };
      }
    }

    // Render longitudinal liquid ribbons
    for (let r = 0; r < this.rows - 1; r++) {
      ctx.beginPath();
      let started = false;

      for (let c = 0; c < this.cols; c++) {
        const pt = projectedPoints[r][c];
        if (!pt) continue;

        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }

      if (started) {
        const progress = r / this.rows;
        const alpha = Math.max(0.04, (1 - progress * 0.8) * (isDark ? 0.35 : 0.2));
        
        // Liquid color gradient per row
        const strokeColor = isDark
          ? `rgba(${Math.floor(56 + progress * 80)}, ${Math.floor(189 - progress * 40)}, 255, ${alpha})`
          : `rgba(99, 102, 241, ${alpha * 0.7})`;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(0.8, (1 - progress * 0.6) * 1.8);
        ctx.stroke();
      }
    }

    // Render transversal liquid cross-strands
    for (let c = 0; c < this.cols; c += 2) {
      ctx.beginPath();
      let started = false;

      for (let r = 0; r < this.rows; r++) {
        const pt = projectedPoints[r][c];
        if (!pt) continue;

        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }

      if (started) {
        ctx.strokeStyle = isDark
          ? 'rgba(192, 132, 252, 0.12)'
          : 'rgba(129, 140, 248, 0.10)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Specular liquid highlights at crests
    for (let r = 0; r < this.rows; r += 2) {
      for (let c = 0; c < this.cols; c += 2) {
        const pt = projectedPoints[r][c];
        if (!pt || pt.elevation < 22) continue;

        const size = Math.max(1, (pt.elevation - 22) * 0.12);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(99, 102, 241, 0.4)';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
}
