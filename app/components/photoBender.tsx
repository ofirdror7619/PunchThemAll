"use client";

import Image from "next/image";
import {
  ChangeEvent,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type UploadPhoto = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

type PunchMark = {
  id: number;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  wrinkleOffset: number;
  stretchX: number;
  stretchY: number;
  damageLevel: number;
  punchType: PunchType;
  intensity: number;
};

type PunchType = "jab" | "heavy" | "combo";

type ImpactState = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  tilt: number;
  flash: number;
  ring: number;
  ringOuter: number;
  shakeX: number;
  shakeY: number;
  shakeRotate: number;
};

const MAX_BRUISE_MARKS = 9;
const PUNCH_SOUND_OFFSET = 0.18;
const RESULTS_THRESHOLD = 20;
const HEAVY_HOLD_MS = 320;
const DOUBLE_TAP_WINDOW_MS = 240;
const COMBO_RESET_WINDOW_MS = 1250;
const defaultTargets: UploadPhoto[] = [
  { id: "default-malik-al-houthi", name: "Malik al-Houthi.jpg", url: "/Malik%20al-Houthi.jpg", type: "built-in target", size: 0 },
  { id: "default-trump", name: "Trump.jpg", url: "/Trump.jpg", type: "built-in target", size: 0 },
  { id: "default-khamenei", name: "Khamenei.jpg", url: "/Khamenei.jpg", type: "built-in target", size: 0 },
  { id: "default-erdogan", name: "Erdogan.jpg", url: "/Erdogan.jpg", type: "built-in target", size: 0 },
  { id: "default-putin", name: "Putin.jpg", url: "/Putin.jpg", type: "built-in target", size: 0 },
];

const initialImpactState: ImpactState = {
  x: 50,
  y: 50,
  dx: 0,
  dy: 0,
  tilt: 0,
  flash: 0.42,
  ring: 10,
  ringOuter: 18,
  shakeX: 0,
  shakeY: 0,
  shakeRotate: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getDisplayName(name: string) {
  return name.replace(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i, "");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getBruisePalette(damageLevel: number) {
  const cool = damageLevel;
  const warm = 1 - damageLevel;

  return {
    "--bruise-core": `rgba(${Math.round(144 * warm + 74 * cool)}, ${Math.round(42 * warm + 16 * cool)}, ${Math.round(44 * warm + 70 * cool)}, ${0.7 + cool * 0.1})`,
    "--bruise-mid": `rgba(${Math.round(118 * warm + 67 * cool)}, ${Math.round(28 * warm + 13 * cool)}, ${Math.round(52 * warm + 88 * cool)}, ${0.58 + cool * 0.12})`,
    "--bruise-shadow": `rgba(${Math.round(52 * warm + 29 * cool)}, ${Math.round(14 * warm + 8 * cool)}, ${Math.round(28 * warm + 44 * cool)}, ${0.32 + cool * 0.16})`,
    "--bruise-blush": `rgba(${Math.round(170 * warm + 126 * cool)}, ${Math.round(58 * warm + 32 * cool)}, ${Math.round(52 * warm + 54 * cool)}, ${0.2 + warm * 0.12})`,
    "--bruise-deep": `rgba(${Math.round(28 * warm + 18 * cool)}, ${Math.round(10 * warm + 8 * cool)}, ${Math.round(18 * warm + 24 * cool)}, ${0.12 + cool * 0.08})`,
    "--crease-light": `rgba(${Math.round(255 * warm + 232 * cool)}, ${Math.round(224 * warm + 216 * cool)}, ${Math.round(228 * warm + 244 * cool)}, ${0.08 + warm * 0.06})`,
    "--crease-dark": `rgba(${Math.round(58 * warm + 44 * cool)}, ${Math.round(18 * warm + 18 * cool)}, ${Math.round(26 * warm + 42 * cool)}, ${0.16 + cool * 0.1})`,
    "--bruise-blur": `${0.2 + cool * 0.9}px`,
    "--bruise-glow": `${8 + cool * 10}px`,
    "--bruise-inset": `${10 + cool * 10}px`,
  } as CSSProperties;
}

export default function PhotoBender() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const punchTimeoutRef = useRef<number | null>(null);
  const comboResetTimeoutRef = useRef<number | null>(null);
  const heavyHoldTimeoutRef = useRef<number | null>(null);
  const punchAudioPoolRef = useRef<HTMLAudioElement[]>([]);
  const punchAudioIndexRef = useRef(0);
  const heavyPressTriggeredRef = useRef(false);
  const lastTapTimeRef = useRef(0);
  const lastComboTimeRef = useRef(0);
  const [uploadedPhoto, setUploadedPhoto] = useState<UploadPhoto | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [stageReloadKey, setStageReloadKey] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [isStageHovered, setIsStageHovered] = useState(false);
  const [isPunching, setIsPunching] = useState(false);
  const [punchCount, setPunchCount] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [cleanHitCount, setCleanHitCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [punchMarks, setPunchMarks] = useState<PunchMark[]>([]);
  const [impactPoint, setImpactPoint] = useState<ImpactState>(initialImpactState);

  useEffect(() => {
    return () => {
      if (uploadedPhoto?.url.startsWith("blob:")) {
        URL.revokeObjectURL(uploadedPhoto.url);
      }
    };
  }, [uploadedPhoto]);

  useEffect(() => {
    return () => {
      if (punchTimeoutRef.current) {
        window.clearTimeout(punchTimeoutRef.current);
      }

      if (comboResetTimeoutRef.current) {
        window.clearTimeout(comboResetTimeoutRef.current);
      }

      if (heavyHoldTimeoutRef.current) {
        window.clearTimeout(heavyHoldTimeoutRef.current);
      }

      punchAudioPoolRef.current.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
    };
  }, []);

  useEffect(() => {
    const nextAudioPool = Array.from({ length: 4 }, () => {
      const audio = new Audio("/punch.mp3");
      audio.preload = "auto";
      audio.volume = 0.45;
      return audio;
    });

    punchAudioPoolRef.current = nextAudioPool;

    return () => {
      nextAudioPool.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
    };
  }, []);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      setCursorVisible(true);
      setCursorPosition({ x: event.clientX, y: event.clientY });
    }

    function handleMouseLeave() {
      setCursorVisible(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("blur", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("blur", handleMouseLeave);
    };
  }, []);

  const activeTarget = useMemo(() => {
    if (!activeTargetId) {
      return null;
    }

    if (uploadedPhoto?.id === activeTargetId) {
      return uploadedPhoto;
    }

    return defaultTargets.find((target) => target.id === activeTargetId) ?? null;
  }, [activeTargetId, uploadedPhoto]);

  const damageProgress = useMemo(() => {
    if (!activeTarget) {
      return 0;
    }

    return Math.min((punchCount + bestCombo * 1.35 + cleanHitCount * 0.9) / RESULTS_THRESHOLD, 1);
  }, [activeTarget, bestCombo, cleanHitCount, punchCount]);

  const damagePercent = Math.round(damageProgress * 100);
  const lifePercent = activeTarget ? Math.max(100 - damagePercent, 0) : 0;
  const damageTier = damageProgress >= 0.82 ? 4 : damageProgress >= 0.58 ? 3 : damageProgress >= 0.32 ? 2 : damageProgress > 0.08 ? 1 : 0;
  const lifeState = lifePercent > 60 ? "is-healthy" : lifePercent > 30 ? "is-warning" : "is-critical";

  const centerPanelStyle = useMemo(
    () =>
      ({
        "--panel-shake-x": `${impactPoint.shakeX}px`,
        "--panel-shake-y": `${impactPoint.shakeY}px`,
        "--panel-shake-rotate": `${impactPoint.shakeRotate}deg`,
      }) as CSSProperties,
    [impactPoint.shakeRotate, impactPoint.shakeX, impactPoint.shakeY],
  );

  const stageStyle = useMemo(
    () =>
      ({
        "--impact-x": `${impactPoint.x}%`,
        "--impact-y": `${impactPoint.y}%`,
        "--punch-dx": `${impactPoint.dx * 16}px`,
        "--punch-dy": `${impactPoint.dy * 12}px`,
        "--punch-tilt": `${impactPoint.tilt}deg`,
        "--impact-flash-alpha": impactPoint.flash.toFixed(2),
        "--impact-ring-size": `${impactPoint.ring}%`,
        "--impact-ring-outer-size": `${impactPoint.ringOuter}%`,
        "--damage-progress": damageProgress.toFixed(2),
      }) as CSSProperties,
    [damageProgress, impactPoint],
  );

  function clearTransientTimers() {
    if (punchTimeoutRef.current) {
      window.clearTimeout(punchTimeoutRef.current);
      punchTimeoutRef.current = null;
    }

    if (comboResetTimeoutRef.current) {
      window.clearTimeout(comboResetTimeoutRef.current);
      comboResetTimeoutRef.current = null;
    }

    if (heavyHoldTimeoutRef.current) {
      window.clearTimeout(heavyHoldTimeoutRef.current);
      heavyHoldTimeoutRef.current = null;
    }
  }

  function resetPunchEffects() {
    clearTransientTimers();

    heavyPressTriggeredRef.current = false;
    lastTapTimeRef.current = 0;
    lastComboTimeRef.current = 0;

    setIsPunching(false);
    setPunchCount(0);
    setComboCount(0);
    setBestCombo(0);
    setCleanHitCount(0);
    setPunchMarks([]);
    setImpactPoint(initialImpactState);
  }

  function selectTarget(targetId: string) {
    resetPunchEffects();
    setActiveTargetId(targetId);
    setStageReloadKey(0);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const incomingFile = event.target.files?.[0];

    if (!incomingFile) {
      return;
    }

    if (uploadedPhoto?.url.startsWith("blob:")) {
      URL.revokeObjectURL(uploadedPhoto.url);
    }

    const nextPhoto = {
      id: `${incomingFile.name}-${incomingFile.lastModified}`,
      name: incomingFile.name,
      size: incomingFile.size,
      type: incomingFile.type || "image",
      url: URL.createObjectURL(incomingFile),
    };

    resetPunchEffects();
    setUploadedPhoto(nextPhoto);
    setUploadCount((currentCount) => currentCount + 1);
    setActiveTargetId(nextPhoto.id);
    setStageReloadKey(0);

    event.target.value = "";
  }

  function handleClear() {
    if (uploadedPhoto?.url.startsWith("blob:")) {
      URL.revokeObjectURL(uploadedPhoto.url);
    }

    resetPunchEffects();
    setUploadedPhoto(null);
    setActiveTargetId(null);
    setResetKey((currentKey) => currentKey + 1);
    setStageReloadKey(0);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleReloadTarget() {
    if (!activeTarget) {
      return;
    }

    resetPunchEffects();
    setStageReloadKey((currentKey) => currentKey + 1);
  }

  function playPunchSound(punchType: PunchType, intensity: number) {
    if (isMuted) {
      return;
    }

    const audioPool = punchAudioPoolRef.current;

    if (audioPool.length === 0) {
      return;
    }

    const audio = audioPool[punchAudioIndexRef.current % audioPool.length];
    punchAudioIndexRef.current += 1;

    audio.currentTime = PUNCH_SOUND_OFFSET;
    audio.playbackRate = clamp(
      (punchType === "heavy" ? 0.9 : punchType === "combo" ? 1.02 : 1.08) + (Math.random() * 0.08 - 0.04),
      0.78,
      1.16,
    );
    audio.volume = clamp((punchType === "heavy" ? 0.58 : punchType === "combo" ? 0.5 : 0.42) + intensity * 0.05, 0.25, 0.85);
    void audio.play().catch(() => {
      // Ignore autoplay-style failures until the browser allows playback.
    });
  }

  function triggerHaptics(punchType: PunchType) {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) {
      return;
    }

    const pattern = punchType === "heavy" ? [18, 18, 30] : punchType === "combo" ? [12, 10, 12] : 16;
    navigator.vibrate(pattern);
  }

  function queueComboReset() {
    if (comboResetTimeoutRef.current) {
      window.clearTimeout(comboResetTimeoutRef.current);
    }

    comboResetTimeoutRef.current = window.setTimeout(() => {
      setComboCount(0);
    }, COMBO_RESET_WINDOW_MS);
  }

  function executePunch(clientX: number, clientY: number, bounds: DOMRect, punchType: PunchType) {
    const relativeX = ((clientX - bounds.left) / bounds.width) * 100;
    const relativeY = ((clientY - bounds.top) / bounds.height) * 100;
    const typeStrength = punchType === "heavy" ? 1.4 : punchType === "combo" ? 1.16 : 0.92;
    const jitterX = (Math.random() * 2 - 1) * 2.2 * typeStrength;
    const jitterY = (Math.random() * 2 - 1) * 1.8 * typeStrength;
    const x = clamp(relativeX + jitterX, 14, 86);
    const y = clamp(relativeY + jitterY, 16, 84);
    const dx = (x - 50) / 50;
    const dy = (y - 50) / 50;
    const tilt = dx * (punchType === "heavy" ? 7.6 : punchType === "combo" ? 6 : 4.5) + (Math.random() * 2 - 1) * 1.2;
    const flash = punchType === "heavy" ? 0.68 : punchType === "combo" ? 0.58 : 0.44 + Math.random() * 0.06;
    const ring = punchType === "heavy" ? 13 + Math.random() * 4 : punchType === "combo" ? 11 + Math.random() * 3 : 8.5 + Math.random() * 2.2;
    const ringOuter = ring * (punchType === "heavy" ? 2.1 : 1.85);
    const shakeBase = punchType === "heavy" ? 5.8 : punchType === "combo" ? 4.4 : 2.8;
    const nextPunchCount = punchCount + 1;
    const isCleanHit = Math.abs(x - 50) <= 15 && Math.abs(y - 48) <= 17;
    const now = Date.now();
    const nextCombo = now - lastComboTimeRef.current <= COMBO_RESET_WINDOW_MS ? comboCount + 1 : 1;

    lastComboTimeRef.current = now;
    queueComboReset();

    playPunchSound(punchType, typeStrength);
    triggerHaptics(punchType);
    setImpactPoint({
      x,
      y,
      dx,
      dy,
      tilt,
      flash,
      ring,
      ringOuter,
      shakeX: (Math.random() * 2 - 1) * shakeBase,
      shakeY: (Math.random() * 2 - 1) * (shakeBase * 0.8),
      shakeRotate: (Math.random() * 2 - 1) * (shakeBase * 0.18),
    });
    setIsPunching(true);
    setPunchCount(nextPunchCount);
    setComboCount(nextCombo);
    setBestCombo((currentBest) => Math.max(currentBest, nextCombo));

    if (isCleanHit) {
      setCleanHitCount((currentCount) => currentCount + 1);
    }

    setPunchMarks((currentMarks) => {
      const nextMark: PunchMark = {
        id: Date.now(),
        x,
        y,
        size: (punchType === "heavy" ? 11.8 : punchType === "combo" ? 10.2 : 7.4) + Math.random() * 4.8,
        rotation: -42 + Math.random() * 84,
        opacity: (punchType === "heavy" ? 0.38 : punchType === "combo" ? 0.33 : 0.24) + Math.random() * 0.16,
        wrinkleOffset: (punchType === "heavy" ? 12 : 9) + Math.random() * 7,
        stretchX: 0.8 + Math.random() * 0.4 + (punchType === "heavy" ? 0.08 : 0),
        stretchY: 0.78 + Math.random() * 0.34 + (punchType === "combo" ? 0.04 : 0),
        damageLevel: Math.min((nextPunchCount + nextCombo * 0.7 + (isCleanHit ? 1 : 0)) / RESULTS_THRESHOLD, 1),
        punchType,
        intensity: typeStrength,
      };

      return [...currentMarks.slice(-(MAX_BRUISE_MARKS - 1)), nextMark];
    });

    if (punchTimeoutRef.current) {
      window.clearTimeout(punchTimeoutRef.current);
    }

    punchTimeoutRef.current = window.setTimeout(() => {
      setIsPunching(false);
    }, 180);
  }

  function handlePunchPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeTarget) {
      return;
    }

    heavyPressTriggeredRef.current = false;

    if (heavyHoldTimeoutRef.current) {
      window.clearTimeout(heavyHoldTimeoutRef.current);
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const clientX = event.clientX;
    const clientY = event.clientY;

    heavyHoldTimeoutRef.current = window.setTimeout(() => {
      heavyPressTriggeredRef.current = true;
      executePunch(clientX, clientY, bounds, "heavy");
    }, HEAVY_HOLD_MS);
  }

  function handlePunchPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeTarget) {
      return;
    }

    if (heavyHoldTimeoutRef.current) {
      window.clearTimeout(heavyHoldTimeoutRef.current);
      heavyHoldTimeoutRef.current = null;
    }

    if (heavyPressTriggeredRef.current) {
      heavyPressTriggeredRef.current = false;
      return;
    }

    const now = Date.now();
    const punchType: PunchType = now - lastTapTimeRef.current <= DOUBLE_TAP_WINDOW_MS ? "combo" : "jab";
    lastTapTimeRef.current = now;

    executePunch(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), punchType);
  }

  function cancelPunchHold() {
    if (heavyHoldTimeoutRef.current) {
      window.clearTimeout(heavyHoldTimeoutRef.current);
      heavyHoldTimeoutRef.current = null;
    }

    heavyPressTriggeredRef.current = false;
  }

  return (
    <main className="arena-shell">
      <div className="ambient-orb ambient-orb-left" />
      <div className="ambient-orb ambient-orb-right" />

      <section className="arena-grid">
        <aside className="panel side-panel intro-panel">
          <p className="panel-kicker">Ofir Dror (2026)</p>
          <h1>Punch Them All</h1>
          <p className="panel-copy">
            Upload a photo to fight. Choose carefully, some faces practically punch back.
          </p>

          <div className="upload-stack">
            <button
              type="button"
              className="upload-button"
              onClick={() => inputRef.current?.click()}
            >
              Upload A Photo
            </button>
            <input
              ref={inputRef}
              className="file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
            />
            <button
              type="button"
              className="ghost-button"
              onClick={handleClear}
              disabled={!uploadedPhoto && !activeTargetId}
            >
              Clear Stage
            </button>
          </div>

          <div className="intro-card-list">
            <div className="mini-card">
              <span className="mini-card-label">Loaded</span>
              <strong>{uploadCount}</strong>
            </div>
          </div>
        </aside>

        <section
          key={resetKey}
          className={`panel center-panel${isPunching ? " is-shaking" : ""}`}
          style={centerPanelStyle}
        >
          <div className="stage-header">
            <div>
              <p className="stage-label">Main Window</p>
              <h2>{activeTarget ? getDisplayName(activeTarget.name) : "Awaiting first target"}</h2>
            </div>
            <div className="stage-actions">
              <button
                type="button"
                className={`mute-toggle${isMuted ? " is-muted" : ""}`}
                onClick={() => setIsMuted((currentValue) => !currentValue)}
                aria-label={isMuted ? "Unmute punch audio" : "Mute punch audio"}
                title={isMuted ? "Unmute punch audio" : "Mute punch audio"}
              >
                {isMuted ? "Muted" : "Sound On"}
              </button>
              {activeTarget ? (
                <button
                  type="button"
                  className="reload-target-button"
                  onClick={handleReloadTarget}
                  aria-label="Reload selected photo"
                  title="Reload selected photo"
                >
                  ↻
                </button>
              ) : null}
              <span className="status-pill">
                {activeTarget ? (comboCount > 1 ? `Combo x${comboCount}` : "Target Locked") : "No Target Selected"}
              </span>
            </div>
          </div>

          <div
            className={`photo-stage-panel${activeTarget ? " has-target" : ""}${isPunching ? " is-punching" : ""}`}
            onMouseEnter={() => setIsStageHovered(true)}
            onMouseLeave={() => setIsStageHovered(false)}
            style={stageStyle}
          >
            {activeTarget ? (
              <div
                key={`${activeTarget.id}-${stageReloadKey}`}
                className={`stage-image-frame damage-tier-${damageTier}`}
                onPointerDown={handlePunchPointerDown}
                onPointerUp={handlePunchPointerUp}
                onPointerLeave={cancelPunchHold}
                onPointerCancel={cancelPunchHold}
                style={{ "--damage-progress": damageProgress.toFixed(2) } as CSSProperties}
              >
                <Image
                  className="stage-image"
                  src={activeTarget.url}
                  alt={activeTarget.name}
                  fill
                  sizes="(max-width: 820px) 100vw, 50vw"
                  unoptimized
                  draggable={false}
                />
                <div className={`damage-progression-layer damage-tier-${damageTier}`} aria-hidden="true" />
                <div className="bruise-layer" aria-hidden="true">
                  {punchMarks.map((mark) => (
                    <span
                      key={mark.id}
                      className="impact-mark"
                      style={{
                        left: `${mark.x}%`,
                        top: `${mark.y}%`,
                        width: `${mark.size * (1 + mark.damageLevel * 0.32 + mark.intensity * 0.06)}%`,
                        height: `${mark.size * (0.68 + mark.damageLevel * 0.16 + (mark.punchType === "heavy" ? 0.06 : 0))}%`,
                        opacity: mark.opacity,
                        transform: `translate(-50%, -50%) rotate(${mark.rotation}deg) scale(${mark.stretchX}, ${mark.stretchY})`,
                        ...getBruisePalette(mark.damageLevel),
                      }}
                    >
                      <span className="bruise-mark bruise-primary" />
                      <span
                        className="bruise-mark bruise-secondary"
                        style={{
                          transform: `translate(${mark.wrinkleOffset * 0.18}%, -${mark.wrinkleOffset * 0.1}%) scale(0.68, 0.6) rotate(${mark.rotation * -0.3}deg)`,
                        }}
                      />
                      <span
                        className="bruise-mark bruise-tertiary"
                        style={{
                          transform: `translate(-${mark.wrinkleOffset * 0.16}%, ${mark.wrinkleOffset * 0.14}%) scale(0.52, 0.48) rotate(${mark.rotation * 0.24}deg)`,
                        }}
                      />
                      <span
                        className="wrinkle-mark wrinkle-mark-one"
                        style={{
                          width: `${mark.size * (mark.punchType === "heavy" ? 1.12 : 0.92)}%`,
                          transform: `translate(-10%, -${mark.wrinkleOffset}%) rotate(${mark.rotation * -0.25}deg)`,
                        }}
                      />
                      <span
                        className="wrinkle-mark wrinkle-mark-two"
                        style={{
                          width: `${mark.size * (mark.punchType === "combo" ? 0.88 : 0.76)}%`,
                          transform: `translate(-4%, ${mark.wrinkleOffset}%) rotate(${mark.rotation * 0.35}deg)`,
                        }}
                      />
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-stage">
                <span>Upload a face and unleash the rage.</span>
              </div>
            )}
          </div>

          <div className="thumbnail-tray">
            <div className="tray-header">
              <p className="stage-label">Or Try Them...</p>
            </div>

            <div className="thumbnail-grid">
              {defaultTargets.map((target, index) => {
                const isActive = target.id === activeTarget?.id;

                return (
                  <button
                    key={target.id}
                    type="button"
                    className={`thumbnail-card empty-slot${isActive ? " is-active" : ""}`}
                    onClick={() => selectTarget(target.id)}
                  >
                    <Image
                      src={target.url}
                      alt={target.name}
                      width={320}
                      height={320}
                      className="thumbnail-image empty-slot-image"
                      priority={index === 0}
                      draggable={false}
                    />
                    <span>{getDisplayName(target.name)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="panel side-panel hud-panel">
          <div className="hud-header">
            <p className="panel-kicker">Tale of the Tape</p>
            <h2>Target Data</h2>
          </div>

          <div className="hud-list">
            <div className="hud-row">
              <span>Selected</span>
              <strong>{activeTarget ? getDisplayName(activeTarget.name) : "None"}</strong>
            </div>
            <div className="hud-row">
              <span>Type</span>
              <strong>{activeTarget ? activeTarget.type : "-"}</strong>
            </div>
            <div className="hud-row">
              <span>Size</span>
              <strong>{activeTarget && activeTarget.size ? formatFileSize(activeTarget.size) : "-"}</strong>
            </div>
            <div className="hud-row">
              <span>Hits</span>
              <strong>{activeTarget ? punchCount : 0}</strong>
            </div>
            <div className="hud-row">
              <span>Combo</span>
              <strong>{activeTarget ? `x${comboCount}` : "-"}</strong>
            </div>
            <div className="hud-row">
              <span>Best Streak</span>
              <strong>{activeTarget ? `x${bestCombo}` : "-"}</strong>
            </div>
          </div>

          <div className="hud-meter">
            <div className="hud-meter-label">
              <span>Life</span>
              <strong>{activeTarget ? lifePercent : 0}%</strong>
            </div>
            <div className="meter-track">
              <div
                className={`meter-fill ${lifeState}`}
                style={{ width: `${activeTarget ? lifePercent : 0}%` }}
              />
            </div>
          </div>

          <div className="hud-instructions">
            <p className="stage-label">Punch Types</p>
            <div className="instruction-list">
              <div className="instruction-row">
                <strong>Tap: </strong>
                <span>Jab for quick light hits.</span>
              </div>
              <div className="instruction-row">
                <strong>Hold: </strong>
                <span>Heavy punch for bigger damage.</span>
              </div>
              <div className="instruction-row">
                <strong>Double Tap: </strong>
                <span>Combo hit.</span>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <div
        className={`glove-cursor${cursorVisible && isStageHovered ? " visible" : ""}${isPunching ? " is-punching" : ""}`}
        style={{ transform: `translate(${cursorPosition.x - 28}px, ${cursorPosition.y - 22}px)` }}
        aria-hidden="true"
      >
        <span className="glove-inner">
          <span className="glove-thumb" />
          <span className="glove-fist" />
          <span className="glove-cuff" />
        </span>
      </div>
    </main>
  );
}