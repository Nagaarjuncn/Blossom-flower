/* ==========================================================================
   🌸 Gesture Flower — Full Stack Interactive Garden Client Logic
   ========================================================================== */

// --- DOM Elements ---
const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("overlay");
const ctx = canvasElement.getContext("2d");

const startBtn = document.getElementById("startBtn");
const startBtnText = document.getElementById("startBtnText");
const resetBtn = document.getElementById("resetBtn");
const saveGardenBtn = document.getElementById("saveGardenBtn");

const flowerWorld = document.getElementById("flowerWorld");
const messageText = document.getElementById("messageText");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const errorBox = document.getElementById("error");

// Telemetry Elements
const rightTelemetry = document.getElementById("rightTelemetry");
const rightPinchBar = document.getElementById("rightPinchBar");
const rightPinchTag = document.getElementById("rightPinchTag");

const leftTelemetry = document.getElementById("leftTelemetry");
const leftPinchBar = document.getElementById("leftPinchBar");
const leftPinchTag = document.getElementById("leftPinchTag");

// Step Cards
const cardStep1 = document.getElementById("cardStep1");
const cardStep2 = document.getElementById("cardStep2");
const cardStep3 = document.getElementById("cardStep3");

// Server & Header Elements
const serverStatusBadge = document.getElementById("serverStatusBadge");
const serverStatusDot = serverStatusBadge.querySelector(".server-dot");
const serverStatusText = document.getElementById("serverStatusText");
const soundToggleBtn = document.getElementById("soundToggleBtn");
const soundIcon = document.getElementById("soundIcon");
const gardenCount = document.getElementById("gardenCount");

// Modals
const gardenModalBackdrop = document.getElementById("gardenModalBackdrop");
const gardenModal = document.getElementById("gardenModal");
const galleryOpenBtn = document.getElementById("galleryOpenBtn");
const galleryCloseBtn = document.getElementById("galleryCloseBtn");
const gardenGrid = document.getElementById("gardenGrid");

const settingsModalBackdrop = document.getElementById("settingsModalBackdrop");
const settingsModal = document.getElementById("settingsModal");
const settingsOpenBtn = document.getElementById("settingsOpenBtn");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const sensitivitySlider = document.getElementById("sensitivitySlider");
const sensitivityValue = document.getElementById("sensitivityValue");
const speedSlider = document.getElementById("speedSlider");
const speedValue = document.getElementById("speedValue");
const visModeSelect = document.getElementById("visModeSelect");
const mirrorToggle = document.getElementById("mirrorToggle");
const soundSettingToggle = document.getElementById("soundSettingToggle");
const toast = document.getElementById("toast");

// --- App State & Configurations ---
const STAGES = { NONE: 0, BUD: 1, FLOWER: 2, BLOSSOM: 3 };
let currentStage = STAGES.NONE;
let growth = 0; // 0..1 smooth interpolation
const TARGET_GROWTH = {
  [STAGES.NONE]: 0,
  [STAGES.BUD]: 0.33,
  [STAGES.FLOWER]: 0.66,
  [STAGES.BLOSSOM]: 1.0
};

// Tunables (synced with settings API)
let config = {
  pinchThreshold: 0.35,
  growthSpeed: 0.07,
  soundEnabled: true,
  mirrorCamera: true,
  visualizationMode: "both"
};

let camera = null;
let handsDetector = null;
let isCameraRunning = false;
let plantX = 0.5;
let plantY = 0.65;
let lastHandSeenAt = 0;
const HAND_LOST_GRACE_MS = 900;
let unpinchFrames = 0;
let sparkleAngle = 0;
let isGlowing = false;
let lastTwinkleSoundTime = 0;

// --- Helper Functions ---
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Normalized Pinch Detection based on hand scale (wrist to middle knuckle)
function checkPinch(landmarks) {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  const handScale = dist(wrist, middleMcp) || 0.0001;
  const pinchDist = dist(thumbTip, indexTip);
  const ratio = pinchDist / handScale;

  return {
    isPinching: ratio < config.pinchThreshold,
    ratio: Math.min(1.0, Math.max(0, ratio))
  };
}

// Check if hand fingers are raised above palm
function isHandRaised(landmarks) {
  return landmarks[8].y < landmarks[6].y && landmarks[12].y < landmarks[10].y;
}

// Check if hand is closed into a fist
function checkHandClosed(landmarks) {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const handScale = dist(wrist, middleMcp) || 0.0001;

  const fingers = [
    { tip: 8, pip: 6, mcp: 5 },   // Index
    { tip: 12, pip: 10, mcp: 9 }, // Middle
    { tip: 16, pip: 14, mcp: 13 },// Ring
    { tip: 20, pip: 18, mcp: 17 } // Pinky
  ];

  let curledCount = 0;
  let totalCurl = 0;

  for (const f of fingers) {
    const tipToWrist = dist(landmarks[f.tip], wrist);
    const pipToWrist = dist(landmarks[f.pip], wrist);
    const mcpToWrist = dist(landmarks[f.mcp], wrist);

    // Tip is curled towards wrist if closer than PIP or near MCP
    const isCurled = (tipToWrist < pipToWrist * 1.02) || (tipToWrist < mcpToWrist * 1.15);
    if (isCurled) curledCount++;

    const span = (pipToWrist - mcpToWrist) || (handScale * 0.4);
    const curlScore = Math.max(0, Math.min(1.0, (pipToWrist - tipToWrist + span * 0.5) / span));
    totalCurl += curlScore;
  }

  const avgCurl = totalCurl / fingers.length;
  // Closed if at least 3 fingers are curled and avgCurl >= 0.48, or all 4 curled
  const isClosed = (curledCount >= 3 && avgCurl >= 0.48) || (curledCount === 4);

  return {
    isClosed,
    curlRatio: Math.min(1.0, Math.max(0, avgCurl)),
    curledCount
  };
}

// --- Diamond Star Particles System ---
const diamondParticles = [];
const MAX_DIAMOND_PARTICLES = 45;

function spawnDiamondParticle(originX, originY) {
  if (diamondParticles.length >= MAX_DIAMOND_PARTICLES) return;
  const angle = Math.random() * Math.PI * 2;
  const distOffset = 10 + Math.random() * 85;
  diamondParticles.push({
    x: originX + Math.cos(angle) * distOffset,
    y: originY + Math.sin(angle) * distOffset,
    vx: (Math.random() - 0.5) * 1.0,
    vy: -0.7 - Math.random() * 1.5,
    outerRadius: 6 + Math.random() * 14,
    innerRadius: 1.8 + Math.random() * 3.5,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.1,
    alpha: 0.1,
    maxAlpha: 0.75 + Math.random() * 0.25,
    life: 0,
    maxLife: 45 + Math.floor(Math.random() * 45),
    twinklePhase: Math.random() * Math.PI * 2,
    color: Math.random() > 0.45 ? "#ffffff" : (Math.random() > 0.5 ? "#67e8f9" : "#fef08a")
  });
}

function updateAndDrawDiamondParticles(ctx) {
  for (let i = diamondParticles.length - 1; i >= 0; i--) {
    const p = diamondParticles[i];
    p.life++;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotSpeed;
    p.twinklePhase += 0.14;

    const lifeRatio = p.life / p.maxLife;
    const baseAlpha = lifeRatio < 0.2 ? (lifeRatio / 0.2) : (1 - (lifeRatio - 0.2) / 0.8);
    const twinkleMod = 0.5 + 0.5 * Math.sin(p.twinklePhase);
    p.alpha = Math.max(0, Math.min(1, baseAlpha * p.maxAlpha * twinkleMod));

    drawDiamondStar(ctx, p.x, p.y, 4, p.outerRadius, p.innerRadius, p.rotation, p.alpha, p.color);

    if (p.life >= p.maxLife) {
      diamondParticles.splice(i, 1);
    }
  }
}

function drawDiamondStar(ctx, cx, cy, spikes, outerRadius, innerRadius, rotation, alpha, color) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;

  ctx.fillStyle = color;
  ctx.shadowColor = "#67e8f9";
  ctx.shadowBlur = 12 * alpha;

  ctx.beginPath();
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;

  ctx.moveTo(0, -outerRadius);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
    rot += step;
  }
  ctx.closePath();
  ctx.fill();

  // Brilliant core specular glint
  ctx.beginPath();
  ctx.fillStyle = "#ffffff";
  ctx.arc(0, 0, innerRadius * 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}


// --- State Machine Transition Handler ---
function transitionStage(nextStage) {
  if (currentStage === nextStage) return;
  const prev = currentStage;
  currentStage = nextStage;

  // Visual classes on CSS flower world
  flowerWorld.classList.toggle("flower-mode", currentStage === STAGES.FLOWER || currentStage === STAGES.BLOSSOM);
  flowerWorld.classList.toggle("blossom-mode", currentStage === STAGES.BLOSSOM);

  // Update step cards highlight
  cardStep1.classList.toggle("active", currentStage === STAGES.BUD);
  cardStep2.classList.toggle("active", currentStage === STAGES.FLOWER);
  cardStep3.classList.toggle("active", currentStage === STAGES.BLOSSOM || isGlowing);

  // Save to Garden button visibility (only at blossom)
  if (currentStage === STAGES.BLOSSOM) {
    saveGardenBtn.classList.add("active");
  } else {
    saveGardenBtn.classList.remove("active");
  }

  // Handle stage audio & messages
  if (currentStage === STAGES.NONE) {
    messageText.textContent = isCameraRunning ? "Raise either hand to plant a seed 🌱" : "Click “Start Camera” to begin";
  } else if (currentStage === STAGES.BUD) {
    if (prev > STAGES.BUD) {
      // Returned from Flower or Blossom by releasing pinch!
      messageText.textContent = "Fingers released ↩️ Back to bud stage 🌱 (hold right pinch to flower)";
      window.soundEngine.playPinchTick(260);
    } else {
      // First sprouted from NONE
      messageText.textContent = "Bud sprouted! Hold RIGHT pinch to flower 🌸";
      window.soundEngine.playBud();
    }
  } else if (currentStage === STAGES.FLOWER) {
    if (prev < STAGES.FLOWER) {
      messageText.textContent = "Flower bloomed! Hold LEFT pinch to blossom ✨ (release to return to bud)";
      window.soundEngine.playFlower();
    } else {
      // Dropped down from Blossom
      messageText.textContent = "Flower stage 🌸 (hold left pinch to blossom, release to return to bud)";
      window.soundEngine.playPinchTick(350);
    }
  } else if (currentStage === STAGES.BLOSSOM) {
    messageText.textContent = "🌸 Radiant Blossom! Click 'Save to Garden' (release to return to bud)";
    window.soundEngine.playBlossom();
  }
}

// --- Reset App State ---
function resetState() {
  unpinchFrames = 0;
  transitionStage(STAGES.NONE);
  growth = 0;
  isGlowing = false;
  diamondParticles.length = 0;
  flowerWorld.classList.remove("glowing-mode");
  cardStep3.classList.remove("glowing");
  showToast("Flower state reset");
}

resetBtn.addEventListener("click", resetState);

// --- Drawing Functions on Canvas ---
function drawHandSkeleton(landmarks, isPinching, isClosed = false) {
  if (window.drawConnectors && window.HAND_CONNECTIONS) {
    const points = landmarks.map(p => ({
      x: config.mirrorCamera ? (1 - p.x) : p.x,
      y: p.y,
      z: p.z
    }));

    drawConnectors(ctx, points, HAND_CONNECTIONS, {
      color: isClosed ? "#67e8f9" : (isPinching ? "#a3e635" : "#38bdf8"),
      lineWidth: 3
    });
    drawLandmarks(ctx, points, {
      color: isClosed ? "#ffffff" : (isPinching ? "#bef264" : "#ffffff"),
      lineWidth: 1,
      radius: 3
    });
  }
}

// Draw hand-anchored organic flower on canvas
function drawCanvasFlower(nx, ny, stage, currentGrowth) {
  if (stage === STAGES.NONE || config.visualizationMode === "center") return;

  const w = canvasElement.width;
  const h = canvasElement.height;
  const x = nx * w;
  const y = ny * h;
  const baseSize = Math.min(w, h) * 0.16;

  ctx.save();
  ctx.translate(x, y);

  // Organic Stem
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-10, baseSize * 0.3, 0, baseSize * 0.55);
  ctx.stroke();

  // Leaves
  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.ellipse(-12, baseSize * 0.32, 12, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Petals
  const openness = Math.max(0, (currentGrowth - 0.3) / 0.7);
  const scaleFactor = 0.5 + currentGrowth * 0.5;
  const petalCount = 8;
  const petalLength = baseSize * 0.55 * scaleFactor;
  const petalWidth = baseSize * 0.22 * scaleFactor;

  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const openDist = 0.2 + 0.8 * openness;

    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -petalLength * 0.5 * openDist);

    // Dynamic gradient from coral to rose pink
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, petalLength);
    grad.addColorStop(0, "#fef08a");
    grad.addColorStop(0.4, currentGrowth > 0.6 ? "#fb7185" : "#f43f5e");
    grad.addColorStop(1, "#be123c");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, petalWidth * (0.6 + 0.4 * openness), petalLength * (0.5 + 0.5 * openness), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Golden Flower Core
  ctx.beginPath();
  const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, baseSize * 0.14 * scaleFactor);
  coreGrad.addColorStop(0, "#fef08a");
  coreGrad.addColorStop(1, "#d97706");
  ctx.fillStyle = coreGrad;
  ctx.arc(0, 0, baseSize * 0.14 * scaleFactor, 0, Math.PI * 2);
  ctx.fill();

  // Radiant glow and diamond twinklings on left-hand closed glow mode
  if (isGlowing) {
    const auraGrad = ctx.createRadialGradient(0, 0, baseSize * 0.1, 0, 0, baseSize * 1.15);
    auraGrad.addColorStop(0, "rgba(255, 255, 255, 0.85)");
    auraGrad.addColorStop(0.35, "rgba(56, 189, 248, 0.5)");
    auraGrad.addColorStop(0.7, "rgba(254, 240, 138, 0.35)");
    auraGrad.addColorStop(1, "rgba(236, 72, 153, 0)");
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, baseSize * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // Spawn diamond twinkling star particles
    if (Math.random() < 0.75) {
      spawnDiamondParticle(x, y);
    }
  }

  // Orbiting celestial sparkle particles on full blossom
  if (currentGrowth > 0.9) {
    sparkleAngle += 0.04;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    for (let i = 0; i < 6; i++) {
      const a = sparkleAngle + (i / 6) * Math.PI * 2;
      const radius = baseSize * 0.85;
      const sx = Math.cos(a) * radius;
      const sy = Math.sin(a) * radius;
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// --- MediaPipe Frame Results Callback ---
function onResults(results) {
  // Sync canvas dimensions
  canvasElement.width = videoElement.videoWidth || 1280;
  canvasElement.height = videoElement.videoHeight || 720;

  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  const hands = results.multiHandLandmarks || [];
  const handedness = results.multiHandedness || [];

  let rightPinching = false;
  let leftPinching = false;
  let anyHandRaisedInFrame = false;
  let refHand = null;

  // Reset telemetry display values
  let rightRatioDisplay = 1.0;
  let leftRatioDisplay = 1.0;

  let leftHandClosed = false;
  let leftCloseRatio = 0;

  for (let i = 0; i < hands.length; i++) {
    const landmarks = hands[i];
    const label = handedness[i]?.label; // "Left" or "Right"
    const pinchResult = checkPinch(landmarks);
    const closedResult = checkHandClosed(landmarks);
    const raised = isHandRaised(landmarks);

    if (label === "Right") {
      rightRatioDisplay = pinchResult.ratio;
      if (pinchResult.isPinching) rightPinching = true;
    }
    if (label === "Left") {
      leftRatioDisplay = pinchResult.ratio;
      if (pinchResult.isPinching) leftPinching = true;
      if (closedResult.isClosed) leftHandClosed = true;
      leftCloseRatio = closedResult.curlRatio;
    }

    if (raised) anyHandRaisedInFrame = true;
    refHand = landmarks;

    // Draw hand skeleton with highlight
    drawHandSkeleton(landmarks, pinchResult.isPinching, (label === "Left" && closedResult.isClosed));
  }

  // Handle Glowing State from Left Hand Closed
  isGlowing = leftHandClosed;
  flowerWorld.classList.toggle("glowing-mode", isGlowing);
  cardStep3.classList.toggle("glowing", isGlowing);

  if (isGlowing) {
    const nowAudio = performance.now();
    if (nowAudio - lastTwinkleSoundTime > 600) {
      window.soundEngine.playDiamondTwinkle();
      lastTwinkleSoundTime = nowAudio;
    }
    // Spawn ambient diamond stars around center flower stage
    if (config.visualizationMode !== "hand") {
      const centerX = canvasElement.width * 0.5;
      const centerY = canvasElement.height * 0.58;
      if (Math.random() < 0.65) {
        spawnDiamondParticle(centerX, centerY);
      }
    }
  }

  // Update HUD Telemetry
  updateTelemetryUI(rightPinching, rightRatioDisplay, leftPinching, leftRatioDisplay, leftHandClosed, leftCloseRatio);

  // Update Plant Anchor Position
  const now = performance.now();
  if (refHand) {
    const wrist = refHand[0];
    plantX = config.mirrorCamera ? (1 - wrist.x) : wrist.x;
    plantY = wrist.y;
    lastHandSeenAt = now;
  }
  const handRecentlySeen = (now - lastHandSeenAt) < HAND_LOST_GRACE_MS;

  // --- REVERSIBLE STATE MACHINE EVALUATION ---
  // If hand is raised / visible:
  // - If left hand is pinching: BLOSSOM stage!
  // - Else if right hand is pinching: FLOWER stage!
  // - If user releases thumb and index finger: returns back to BUD stage!
  if (anyHandRaisedInFrame || handRecentlySeen) {
    let nextStage;

    if (leftHandClosed || leftPinching) {
      unpinchFrames = 0;
      nextStage = STAGES.BLOSSOM;
    } else if (rightPinching) {
      unpinchFrames = 0;
      nextStage = STAGES.FLOWER;
    } else {
      unpinchFrames++;
      // If thumb and index released for at least 2 frames (~33ms), return back to BUD!
      if (unpinchFrames >= 2) {
        nextStage = STAGES.BUD;
      } else {
        nextStage = currentStage;
      }
    }

    transitionStage(nextStage);
    if (isGlowing) {
      messageText.textContent = "✨ Left hand closed! Radiant flower glowing with diamond stars 💎✨";
    }
  } else {
    // Hand left frame for prolonged time
    unpinchFrames = 0;
    transitionStage(STAGES.NONE);
  }

  // Smooth lerp growth progress towards target stage
  const target = TARGET_GROWTH[currentStage];
  growth += (target - growth) * config.growthSpeed;

  // Draw hand-anchored canvas flower
  drawCanvasFlower(plantX, plantY, currentStage, growth);

  // Render active diamond twinkling particles
  updateAndDrawDiamondParticles(ctx);
}

function updateTelemetryUI(rightPinching, rightRatio, leftPinching, leftRatio, leftClosed, leftCloseRatio) {
  // Right
  const rightPct = Math.max(0, Math.min(100, Math.round((1 - rightRatio) * 100)));
  rightPinchBar.style.width = `${rightPct}%`;
  rightTelemetry.classList.toggle("pinching", rightPinching);
  rightPinchTag.textContent = rightPinching ? "Pinching!" : `${rightPct}%`;

  // Left (shows closed fist and pinch status)
  const leftPct = Math.max(0, Math.min(100, Math.round((leftCloseRatio || (1 - leftRatio)) * 100)));
  leftPinchBar.style.width = `${leftPct}%`;
  leftTelemetry.classList.toggle("pinching", leftPinching);
  leftTelemetry.classList.toggle("glowing", !!leftClosed);

  if (leftClosed) {
    leftPinchTag.textContent = "✨ Glowing!";
  } else if (leftPinching) {
    leftPinchTag.textContent = "Pinching!";
  } else {
    leftPinchTag.textContent = `${leftPct}% Closed`;
  }
}

// --- Start Camera & MediaPipe Initialization ---
async function startCamera() {
  errorBox.style.display = "none";
  errorBox.textContent = "";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Webcam access is not supported by your browser environment.");
    }

    statusText.textContent = "Requesting webcam permissions...";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    });

    videoElement.srcObject = stream;
    await videoElement.play();

    statusText.textContent = "Initializing MediaPipe hand tracking...";

    handsDetector = new Hands({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsDetector.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.55,
      selfieMode: config.mirrorCamera
    });

    handsDetector.onResults(onResults);

    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (isCameraRunning) {
          await handsDetector.send({ image: videoElement });
        }
      },
      width: 1280,
      height: 720
    });

    await camera.start();

    isCameraRunning = true;
    startBtn.classList.remove("btn-primary");
    startBtn.classList.add("btn-secondary");
    startBtnText.textContent = "Camera Active";
    startBtn.disabled = true;

    statusDot.classList.add("active");
    statusText.textContent = "Camera active — raise your hand!";
    messageText.textContent = "Raise either hand to plant a seed 🌱";
    showToast("Camera online & gestures ready!");
  } catch (err) {
    console.error("Camera startup error:", err);
    errorBox.style.display = "block";
    errorBox.innerHTML = `⚠️ <b>Camera Access Error:</b> ${err.message}<br><small>Ensure camera permission is allowed and this app is running from <code>http://localhost:3000</code>.</small>`;
    statusText.textContent = "Camera permission failed";
  }
}

startBtn.addEventListener("click", () => {
  window.soundEngine.ensureContext();
  startCamera();
});

// --- Sound Controls ---
function toggleSound() {
  config.soundEnabled = !config.soundEnabled;
  window.soundEngine.setEnabled(config.soundEnabled);
  soundIcon.textContent = config.soundEnabled ? "🔊" : "🔇";
  soundSettingToggle.checked = config.soundEnabled;
  showToast(config.soundEnabled ? "Sound enabled" : "Sound muted");
  saveSettingsToServer();
}

soundToggleBtn.addEventListener("click", () => {
  window.soundEngine.ensureContext();
  toggleSound();
});

soundSettingToggle.addEventListener("change", (e) => {
  config.soundEnabled = e.target.checked;
  window.soundEngine.setEnabled(config.soundEnabled);
  soundIcon.textContent = config.soundEnabled ? "🔊" : "🔇";
  saveSettingsToServer();
});


// --- LocalStorage Fallback Helpers for Static Hosting ---
function getLocalGarden() {
  try {
    const raw = localStorage.getItem('blossom_flower_garden');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setLocalGarden(items) {
  try {
    localStorage.setItem('blossom_flower_garden', JSON.stringify(items));
  } catch (e) {
    console.warn('Could not save to localStorage', e);
  }
}

// --- Garden Gallery Persistence API Integration ---
async function fetchGardenCount() {
  try {
    const res = await fetch("/api/garden");
    if (res.ok) {
      const data = await res.json();
      gardenCount.textContent = data.length;
      return;
    }
  } catch (err) {}
  gardenCount.textContent = getLocalGarden().length;
}

async function loadGardenGallery() {
  gardenGrid.innerHTML = `<div class="garden-loading">Loading saved blossoms...</div>`;
  let blossoms = [];
  try {
    const res = await fetch("/api/garden");
    if (res.ok) {
      blossoms = await res.json();
    } else {
      blossoms = getLocalGarden();
    }
  } catch (err) {
    blossoms = getLocalGarden();
  }
  gardenCount.textContent = blossoms.length;

  if (!blossoms.length) {
    gardenGrid.innerHTML = `<div class="garden-empty">No blossoms saved yet! Hold left pinch to Blossom and click "Save to Garden" to preserve your flower.</div>`;
    return;
  }

  gardenGrid.innerHTML = blossoms.map(item => `
    <div class="garden-item" id="item-${item.id}">
      <button class="garden-delete-btn" onclick="deleteBlossom('${item.id}')" title="Delete flower">✕</button>
      <img class="garden-thumb" src="${item.snapshotUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2250%22%3E%3Crect fill=%22%23132e20%22 width=%22100%22 height=%2250%22/%3E%3Ctext fill=%22%23a3e635%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3E🌸 Bloom%3C/text%3E%3C/svg%3E'}" alt="${item.title}" />
      <div class="garden-item-info">
        <div class="garden-item-title">${escapeHtml(item.title)}</div>
        <div class="garden-item-date">${new Date(item.timestamp).toLocaleString()}</div>
      </div>
    </div>
  `).join("");
}

window.deleteBlossom = async function(id) {
  try {
    await fetch(`/api/garden/${id}`, { method: "DELETE" });
  } catch (err) {}
  const localItems = getLocalGarden().filter(item => item.id !== id);
  setLocalGarden(localItems);
  const el = document.getElementById(`item-${id}`);
  if (el) el.remove();
  fetchGardenCount();
  showToast("Blossom removed from garden");
};

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Save Snapshot to Garden
saveGardenBtn.addEventListener("click", async () => {
  saveGardenBtn.disabled = true;
  saveGardenBtn.textContent = "Saving...";

  try {
    const snapCanvas = document.createElement("canvas");
    snapCanvas.width = canvasElement.width || 640;
    snapCanvas.height = canvasElement.height || 360;
    const snapCtx = snapCanvas.getContext("2d");

    // Draw video frame
    if (config.mirrorCamera) {
      snapCtx.translate(snapCanvas.width, 0);
      snapCtx.scale(-1, 1);
    }
    snapCtx.drawImage(videoElement, 0, 0, snapCanvas.width, snapCanvas.height);
    if (config.mirrorCamera) {
      snapCtx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Draw canvas overlay
    snapCtx.drawImage(canvasElement, 0, 0, snapCanvas.width, snapCanvas.height);

    const snapshotUrl = snapCanvas.toDataURL("image/jpeg", 0.75);

    const newEntry = {
      id: "blossom-" + Date.now(),
      title: "Radiant Bloom #" + (Math.floor(Math.random() * 900) + 100),
      stage: "BLOSSOM",
      snapshotUrl: snapshotUrl,
      timestamp: new Date().toISOString(),
      stats: {
        pinchSensitivity: config.pinchThreshold,
        growth: growth.toFixed(2)
      }
    };

    try {
      await fetch("/api/garden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEntry)
      });
    } catch (e) {}

    const localList = getLocalGarden();
    localList.unshift(newEntry);
    setLocalGarden(localList);

    showToast("🌸 Flower preserved in your garden!");
    fetchGardenCount();
  } catch (err) {
    console.error("Save error:", err);
    showToast("Error saving flower snapshot");
  } finally {
    saveGardenBtn.disabled = false;
    saveGardenBtn.innerHTML = `<span>✨</span> Save to Garden`;
  }
});

// Modal Open/Close Event Listeners
galleryOpenBtn.addEventListener("click", () => {
  loadGardenGallery();
  gardenModalBackdrop.classList.add("open");
});

galleryCloseBtn.addEventListener("click", () => {
  gardenModalBackdrop.classList.remove("open");
});

gardenModalBackdrop.addEventListener("click", (e) => {
  if (e.target === gardenModalBackdrop) {
    gardenModalBackdrop.classList.remove("open");
  }
});

settingsOpenBtn.addEventListener("click", () => {
  settingsModalBackdrop.classList.add("open");
});

settingsCloseBtn.addEventListener("click", () => {
  settingsModalBackdrop.classList.remove("open");
});

settingsModalBackdrop.addEventListener("click", (e) => {
  if (e.target === settingsModalBackdrop) {
    settingsModalBackdrop.classList.remove("open");
  }
});

// Settings Input Listeners
sensitivitySlider.addEventListener("input", (e) => {
  config.pinchThreshold = parseFloat(e.target.value);
  sensitivityValue.textContent = config.pinchThreshold.toFixed(2);
  saveSettingsToServer();
});

speedSlider.addEventListener("input", (e) => {
  config.growthSpeed = parseFloat(e.target.value);
  speedValue.textContent = config.growthSpeed.toFixed(2);
  saveSettingsToServer();
});

visModeSelect.addEventListener("change", (e) => {
  config.visualizationMode = e.target.value;
  flowerWorld.classList.toggle("hidden", config.visualizationMode === "hand");
  saveSettingsToServer();
});

mirrorToggle.addEventListener("change", (e) => {
  config.mirrorCamera = e.target.checked;
  videoElement.style.transform = config.mirrorCamera ? "scaleX(-1)" : "none";
  canvasElement.style.transform = config.mirrorCamera ? "scaleX(-1)" : "none";
  if (handsDetector) {
    handsDetector.setOptions({ selfieMode: config.mirrorCamera });
  }
  saveSettingsToServer();
});

async function saveSettingsToServer() {
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    });
  } catch (err) {
    console.warn("Could not persist settings", err);
  }
}

async function loadSettingsFromServer() {
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const saved = await res.json();
      Object.assign(config, saved);

      sensitivitySlider.value = config.pinchThreshold;
      sensitivityValue.textContent = Number(config.pinchThreshold).toFixed(2);

      speedSlider.value = config.growthSpeed;
      speedValue.textContent = Number(config.growthSpeed).toFixed(2);

      visModeSelect.value = config.visualizationMode || "both";
      flowerWorld.classList.toggle("hidden", config.visualizationMode === "hand");

      mirrorToggle.checked = !!config.mirrorCamera;
      soundSettingToggle.checked = !!config.soundEnabled;
      window.soundEngine.setEnabled(config.soundEnabled);
      soundIcon.textContent = config.soundEnabled ? "🔊" : "🔇";
    }
  } catch (err) {
    console.warn("Settings fetch fallback", err);
  }
}

// Server Health Heartbeat
async function checkServerHealth() {
  try {
    const res = await fetch("/api/status");
    if (res.ok) {
      serverStatusDot.classList.add("online");
      serverStatusText.textContent = "Server Online";
      return;
    }
  } catch (err) {}
  serverStatusDot.classList.add("online");
  serverStatusText.textContent = "Static CDN Live";
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  loadSettingsFromServer();
  fetchGardenCount();
  checkServerHealth();
  setInterval(checkServerHealth, 10000);
});
