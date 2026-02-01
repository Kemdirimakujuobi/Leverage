import { useState, useRef, useCallback, useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Agentation } from "agentation";

// ─── Constants ───
const MIN_LEVERAGE = 2;
const MAX_LEVERAGE = 10;
const STEPS = MAX_LEVERAGE - MIN_LEVERAGE; // 8 steps
const TICK_COUNT = STEPS + 1; // 9 ticks (2x through 10x)

// Decorative bar heights (normalized 0–1) — increasing toward higher leverage
// Minimum height ensures all bars are visible, progressive growth toward 10x
const BAR_HEIGHTS = {
  2: 0.12, 3: 0.15, 4: 0.18, 5: 0.22,
  6: 0.30, 7: 0.42, 8: 0.58, 9: 0.78, 10: 1.0,
};

// Max height for the tallest bar (10x) in pixels
const MAX_BAR_HEIGHT = 90;

// Height of the small baseline ticks at the bottom
const BASELINE_TICK_HEIGHT = 5;

// Gap between bottom row and top row
const ROW_GAP = 3;

// Decorative spacer lines between each integer pair (2–3 lines between each)
const SPACER_LINES_PER_SEGMENT = 3;

// Spring animation config — fast, no bounce (per PRD)
const SPRING_CONFIG = {
  type: "spring",
  stiffness: 800,
  damping: 50,
  mass: 1
};

// ─── Utility ───
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─── Slider Component ───
function LeverageSlider() {
  const [leverage, setLeverage] = useState(6);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [displayValue, setDisplayValue] = useState(6);
  const trackRef = useRef(null);

  // Motion value for smooth thumb position
  const thumbX = useMotionValue(0);

  // Get track geometry
  const getTrackBounds = useCallback(() => {
    if (!trackRef.current) return { left: 0, width: 400 };
    const rect = trackRef.current.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  }, []);

  // Convert leverage value to pixel X within track
  const leverageToX = useCallback((val) => {
    const { width } = getTrackBounds();
    return ((val - MIN_LEVERAGE) / STEPS) * width;
  }, [getTrackBounds]);

  // Convert pixel X to leverage value (continuous)
  const xToLeverage = useCallback((px) => {
    const { width } = getTrackBounds();
    const ratio = px / width;
    return MIN_LEVERAGE + ratio * STEPS;
  }, [getTrackBounds]);

  // Snap to nearest integer
  const snapToNearest = useCallback((continuousVal) => {
    return clamp(Math.round(continuousVal), MIN_LEVERAGE, MAX_LEVERAGE);
  }, []);

  // Initialize thumb position
  useEffect(() => {
    thumbX.set(leverageToX(leverage));
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!isDragging) {
        thumbX.set(leverageToX(leverage));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isDragging, leverage, leverageToX, thumbX]);

  // Animate thumb to a position with spring physics
  const animateThumbTo = useCallback((targetX, onComplete) => {
    animate(thumbX, targetX, {
      ...SPRING_CONFIG,
      onComplete,
    });
  }, [thumbX]);

  // ─── Pointer Handlers ───
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const { left, width } = getTrackBounds();
    const relativeX = clamp(e.clientX - left, 0, width);

    setIsDragging(true);
    thumbX.set(relativeX);

    const continuous = xToLeverage(relativeX);
    setDisplayValue(snapToNearest(continuous));

    // Capture pointer
    e.target.setPointerCapture?.(e.pointerId);
  }, [getTrackBounds, xToLeverage, snapToNearest, thumbX]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging) return;

    const { left, width } = getTrackBounds();
    const relativeX = clamp(e.clientX - left, 0, width);

    thumbX.set(relativeX);

    const continuous = xToLeverage(relativeX);
    const snapped = snapToNearest(continuous);
    setDisplayValue(snapped);
  }, [isDragging, getTrackBounds, xToLeverage, snapToNearest, thumbX]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;

    const currentX = thumbX.get();
    const continuous = xToLeverage(currentX);
    const snapped = snapToNearest(continuous);
    const targetX = leverageToX(snapped);

    // Animate snap with spring physics
    animateThumbTo(targetX, () => {
      setLeverage(snapped);
      setDisplayValue(snapped);
      setIsDragging(false);
    });
  }, [isDragging, thumbX, xToLeverage, snapToNearest, leverageToX, animateThumbTo]);

  // Global pointer up listener for safety
  useEffect(() => {
    if (isDragging) {
      const up = () => handlePointerUp();
      window.addEventListener("pointerup", up);
      return () => window.removeEventListener("pointerup", up);
    }
  }, [isDragging, handlePointerUp]);

  // Handle tap on axis label
  const handleLabelTap = useCallback((val) => {
    const targetX = leverageToX(val);
    setDisplayValue(val);
    animateThumbTo(targetX, () => {
      setLeverage(val);
    });
  }, [leverageToX, animateThumbTo]);

  // Handle keyboard
  const handleKeyDown = useCallback((e) => {
    let newVal = leverage;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      newVal = Math.min(leverage + 1, MAX_LEVERAGE);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      newVal = Math.max(leverage - 1, MIN_LEVERAGE);
    } else if (e.key === "Home") {
      newVal = MIN_LEVERAGE;
    } else if (e.key === "End") {
      newVal = MAX_LEVERAGE;
    } else {
      return;
    }
    e.preventDefault();
    setDisplayValue(newVal);
    const targetX = leverageToX(newVal);
    animateThumbTo(targetX, () => {
      setLeverage(newVal);
    });
  }, [leverage, leverageToX, animateThumbTo]);

  const showHandle = isDragging || isHovering;

  return (
    <div
      style={{
        fontFamily: "'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        userSelect: "none",
        WebkitUserSelect: "none",
        width: "100%",
        maxWidth: 480,
      }}
    >
      {/* Label */}
      <div style={{
        fontSize: 14,
        fontWeight: 500,
        color: "#71717a",
        marginBottom: 12,
        letterSpacing: "0.01em",
        fontFamily: "'Barlow', sans-serif",
      }}>
        Leverage
      </div>

      {/* Value Display */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        marginBottom: 20,
        fontFamily: "'Barlow', sans-serif",
      }}>
        <motion.span
          key={displayValue}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          style={{
            display: "inline-block",
            minWidth: 24,
            fontSize: 40,
            fontWeight: 400,
            fontFamily: "'Barlow', sans-serif",
            color: "#18181b",
            letterSpacing: "-0.01em",
            textAlign: "right",
            lineHeight: 1,
          }}
        >
          {displayValue}
        </motion.span>
        <span style={{
          fontSize: 24,
          fontWeight: 400,
          fontFamily: "'Barlow', sans-serif",
          color: "#a1a1aa",
          marginLeft: 2,
          marginTop: 2,
          lineHeight: 1,
        }}>
          x
        </span>
      </div>

      {/* Track Area */}
      <div
        style={{
          position: "relative",
          height: 120,
          cursor: isDragging ? "grabbing" : "pointer",
        }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => !isDragging && setIsHovering(false)}
      >
        {/* Interaction Layer — full area is draggable */}
        <div
          ref={trackRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 30,
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="slider"
          aria-label="Leverage multiplier"
          aria-valuemin={MIN_LEVERAGE}
          aria-valuemax={MAX_LEVERAGE}
          aria-valuenow={displayValue}
          aria-valuetext={`${displayValue}x leverage`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {/* ============ TOP ROW: Growing lines ============ */}

          {/* Bars at integer positions — violet if selected, grey if not */}
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const val = MIN_LEVERAGE + i;
            const heightFraction = BAR_HEIGHTS[val];
            const barH = heightFraction * MAX_BAR_HEIGHT;
            const xPercent = (i / STEPS) * 100;
            const isSelected = val <= displayValue;

            return (
              <motion.div
                key={`bar-${val}`}
                animate={{
                  backgroundColor: isSelected ? "#9998FF" : "#e4e4e7",
                }}
                transition={{ duration: 0.15 }}
                style={{
                  position: "absolute",
                  left: `${xPercent}%`,
                  bottom: BASELINE_TICK_HEIGHT + ROW_GAP,
                  width: 2,
                  height: barH,
                  borderRadius: 0,
                  transform: "translateX(-1px)",
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Spacer lines between integers — violet if selected, grey if not */}
          {Array.from({ length: STEPS }, (_, segIndex) => {
            const startVal = MIN_LEVERAGE + segIndex;
            const baseHeight = BAR_HEIGHTS[startVal];
            const nextHeight = BAR_HEIGHTS[startVal + 1];

            return Array.from({ length: SPACER_LINES_PER_SEGMENT }, (_, lineIndex) => {
              const t = (lineIndex + 1) / (SPACER_LINES_PER_SEGMENT + 1);
              const xPercent = ((segIndex + t) / STEPS) * 100;
              const heightFraction = lerp(baseHeight, nextHeight, t);
              const lineH = heightFraction * MAX_BAR_HEIGHT * 0.5;
              const positionValue = startVal + t;
              const isSelected = positionValue <= displayValue;

              return (
                <motion.div
                  key={`spacer-${segIndex}-${lineIndex}`}
                  animate={{
                    backgroundColor: isSelected ? "#9998FF" : "#d1d5db",
                    opacity: isSelected ? 0.8 : 0.5,
                  }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: "absolute",
                    left: `${xPercent}%`,
                    bottom: BASELINE_TICK_HEIGHT + ROW_GAP,
                    width: 1.5,
                    height: Math.max(lineH, 4),
                    borderRadius: 0,
                    transform: "translateX(-0.75px)",
                    pointerEvents: "none",
                  }}
                />
              );
            });
          })}

          {/* ============ BOTTOM ROW: Uniform short ticks ============ */}

          {/* Baseline ticks at integer positions */}
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const val = MIN_LEVERAGE + i;
            const xPercent = (i / STEPS) * 100;
            const isSelected = val <= displayValue;

            return (
              <motion.div
                key={`baseline-int-${i}`}
                animate={{
                  backgroundColor: isSelected ? "#9998FF" : "#d1d5db",
                  opacity: isSelected ? 0.7 : 0.4,
                }}
                transition={{ duration: 0.15 }}
                style={{
                  position: "absolute",
                  left: `${xPercent}%`,
                  bottom: 0,
                  width: 1.5,
                  height: BASELINE_TICK_HEIGHT,
                  borderRadius: 0,
                  transform: "translateX(-0.75px)",
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Baseline ticks at spacer positions */}
          {Array.from({ length: STEPS }, (_, segIndex) => {
            const startVal = MIN_LEVERAGE + segIndex;
            return Array.from({ length: SPACER_LINES_PER_SEGMENT }, (_, lineIndex) => {
              const t = (lineIndex + 1) / (SPACER_LINES_PER_SEGMENT + 1);
              const xPercent = ((segIndex + t) / STEPS) * 100;
              const positionValue = startVal + t;
              const isSelected = positionValue <= displayValue;

              return (
                <motion.div
                  key={`baseline-spacer-${segIndex}-${lineIndex}`}
                  animate={{
                    backgroundColor: isSelected ? "#9998FF" : "#d1d5db",
                    opacity: isSelected ? 0.7 : 0.4,
                  }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: "absolute",
                    left: `${xPercent}%`,
                    bottom: 0,
                    width: 1.5,
                    height: BASELINE_TICK_HEIGHT,
                    borderRadius: 0,
                    transform: "translateX(-0.75px)",
                    pointerEvents: "none",
                  }}
                />
              );
            });
          })}

          {/* Active value indicator line */}
          <motion.div
            style={{
              position: "absolute",
              x: thumbX,
              bottom: BASELINE_TICK_HEIGHT + ROW_GAP,
              width: 2,
              backgroundColor: "#9998FF",
              borderRadius: 0,
              marginLeft: -1,
              pointerEvents: "none",
            }}
            animate={{
              height: showHandle ? 110 : (BAR_HEIGHTS[displayValue] || 0.25) * MAX_BAR_HEIGHT * 0.9,
            }}
            transition={{ duration: 0.2 }}
          />

          {/* Draggable Thumb — appears on hover/drag */}
          <motion.div
            style={{
              position: "absolute",
              x: thumbX,
              marginLeft: -14, // Half of thumb width
              pointerEvents: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
            animate={{
              bottom: showHandle ? (BASELINE_TICK_HEIGHT + ROW_GAP + 110 - 36) : 38,
              opacity: showHandle ? 1 : 0,
              scale: showHandle ? 1 : 0.8,
            }}
            transition={{
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            {/* Handle body */}
            <div
              style={{
                width: 28,
                height: 36,
                backgroundColor: "#C9C8FF",
                border: "none",
                borderRadius: 8,
                display: "grid",
                gridTemplateColumns: "repeat(2, 5px)",
                gridTemplateRows: "repeat(3, 5px)",
                gap: 3,
                alignContent: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(153, 152, 255, 0.25), 0 1px 3px rgba(0, 0, 0, 0.06)",
              }}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor: "#9998FF",
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Axis Labels — absolutely positioned to match tick coordinates */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 20,
          pointerEvents: "auto",
        }}>
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const val = MIN_LEVERAGE + i;
            const isActive = val === displayValue;
            const xPercent = (i / STEPS) * 100;

            return (
              <motion.button
                key={val}
                onClick={() => handleLabelTap(val)}
                animate={{
                  color: isActive ? "#5A27F4" : "#a1a1aa",
                  fontWeight: isActive ? 600 : 400,
                }}
                transition={{ duration: 0.15 }}
                style={{
                  position: "absolute",
                  left: `${xPercent}%`,
                  transform: "translateX(-50%)",
                  background: "none",
                  border: "none",
                  padding: "4px 6px",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                  lineHeight: 1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
                aria-label={`Set leverage to ${val}x`}
              >
                {val}x
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Page Wrapper ───
export default function App() {
  const isDev = import.meta.env.DEV;

  return (
    <>
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fafafa",
        padding: 32,
      }}>
        <div style={{
          backgroundColor: "#ffffff",
          borderRadius: 16,
          padding: "32px 36px 24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)",
          width: "100%",
          maxWidth: 480,
        }}>
          <LeverageSlider />
        </div>
      </div>
      {isDev && <Agentation />}
    </>
  );
}
