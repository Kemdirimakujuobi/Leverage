import { useState, useRef, useCallback, useEffect } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Agentation } from "agentation";

// ─── Default Constants ───
const DEFAULT_MIN = 2;
const DEFAULT_MAX = 10;

// Decorative bar heights (normalized 0–1) — increasing toward higher leverage
function generateBarHeights(min, max) {
  const heights = {};
  const steps = max - min;
  for (let i = 0; i <= steps; i++) {
    const val = min + i;
    // Progressive growth from 0.12 to 1.0
    const t = i / steps;
    heights[val] = 0.12 + t * 0.88;
  }
  return heights;
}

// Max height for the tallest bar in pixels
const MAX_BAR_HEIGHT = 90;

// Height of the small baseline ticks at the bottom
const BASELINE_TICK_HEIGHT = 5;

// Gap between bottom row and top row
const ROW_GAP = 3;

// Decorative spacer lines between each integer pair
const SPACER_LINES_PER_SEGMENT = 3;

// Spring animation config — fast, no bounce
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
function LeverageSlider({
  // Controlled value (optional - if provided, component is controlled)
  value,
  // Default value for uncontrolled mode
  defaultValue,
  // Callback when value changes
  onChange,
  // Callback when drag starts
  onDragStart,
  // Callback when drag ends
  onDragEnd,
  // Min leverage value
  min = DEFAULT_MIN,
  // Max leverage value
  max = DEFAULT_MAX,
  // Custom label (set to null to hide)
  label = "Leverage",
  // Whether the slider is disabled
  disabled = false,
  // Custom class name for the container
  className,
  // Custom styles for the container
  style,
}) {
  const steps = max - min;
  const tickCount = steps + 1;
  const barHeights = generateBarHeights(min, max);

  // Determine initial value
  const getInitialValue = () => {
    if (value !== undefined) return clamp(value, min, max);
    if (defaultValue !== undefined) return clamp(defaultValue, min, max);
    return Math.round((min + max) / 2); // Default to middle
  };

  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = useState(getInitialValue);

  // The actual current value (controlled or uncontrolled)
  const currentValue = value !== undefined ? clamp(value, min, max) : internalValue;

  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [displayValue, setDisplayValue] = useState(currentValue);
  const trackRef = useRef(null);

  // Motion value for smooth thumb position
  const thumbX = useMotionValue(0);

  // Sync displayValue with controlled value changes
  useEffect(() => {
    if (value !== undefined && !isDragging) {
      const clampedValue = clamp(value, min, max);
      setDisplayValue(clampedValue);
      thumbX.set(leverageToX(clampedValue));
    }
  }, [value, min, max, isDragging]);

  // Get track geometry
  const getTrackBounds = useCallback(() => {
    if (!trackRef.current) return { left: 0, width: 400 };
    const rect = trackRef.current.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  }, []);

  // Convert leverage value to pixel X within track
  const leverageToX = useCallback((val) => {
    const { width } = getTrackBounds();
    return ((val - min) / steps) * width;
  }, [getTrackBounds, min, steps]);

  // Convert pixel X to leverage value (continuous)
  const xToLeverage = useCallback((px) => {
    const { width } = getTrackBounds();
    const ratio = px / width;
    return min + ratio * steps;
  }, [getTrackBounds, min, steps]);

  // Snap to nearest integer
  const snapToNearest = useCallback((continuousVal) => {
    return clamp(Math.round(continuousVal), min, max);
  }, [min, max]);

  // Update value (handles both controlled and uncontrolled)
  const updateValue = useCallback((newValue) => {
    if (value === undefined) {
      // Uncontrolled mode - update internal state
      setInternalValue(newValue);
    }
    // Always call onChange if provided
    onChange?.(newValue);
  }, [value, onChange]);

  // Initialize thumb position
  useEffect(() => {
    thumbX.set(leverageToX(currentValue));
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!isDragging) {
        thumbX.set(leverageToX(currentValue));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isDragging, currentValue, leverageToX, thumbX]);

  // Animate thumb to a position with spring physics
  const animateThumbTo = useCallback((targetX, onComplete) => {
    animate(thumbX, targetX, {
      ...SPRING_CONFIG,
      onComplete,
    });
  }, [thumbX]);

  // ─── Pointer Handlers ───
  const handlePointerDown = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    const { left, width } = getTrackBounds();
    const relativeX = clamp(e.clientX - left, 0, width);

    setIsDragging(true);
    onDragStart?.();
    thumbX.set(relativeX);

    const continuous = xToLeverage(relativeX);
    setDisplayValue(snapToNearest(continuous));

    // Capture pointer
    e.target.setPointerCapture?.(e.pointerId);
  }, [disabled, getTrackBounds, xToLeverage, snapToNearest, thumbX, onDragStart]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || disabled) return;

    const { left, width } = getTrackBounds();
    const relativeX = clamp(e.clientX - left, 0, width);

    thumbX.set(relativeX);

    const continuous = xToLeverage(relativeX);
    const snapped = snapToNearest(continuous);
    setDisplayValue(snapped);
  }, [isDragging, disabled, getTrackBounds, xToLeverage, snapToNearest, thumbX]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;

    const currentX = thumbX.get();
    const continuous = xToLeverage(currentX);
    const snapped = snapToNearest(continuous);
    const targetX = leverageToX(snapped);

    // Animate snap with spring physics
    animateThumbTo(targetX, () => {
      updateValue(snapped);
      setDisplayValue(snapped);
      setIsDragging(false);
      onDragEnd?.(snapped);
    });
  }, [isDragging, thumbX, xToLeverage, snapToNearest, leverageToX, animateThumbTo, updateValue, onDragEnd]);

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
    if (disabled) return;
    const targetX = leverageToX(val);
    setDisplayValue(val);
    animateThumbTo(targetX, () => {
      updateValue(val);
    });
  }, [disabled, leverageToX, animateThumbTo, updateValue]);

  // Handle keyboard
  const handleKeyDown = useCallback((e) => {
    if (disabled) return;
    let newVal = currentValue;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      newVal = Math.min(currentValue + 1, max);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      newVal = Math.max(currentValue - 1, min);
    } else if (e.key === "Home") {
      newVal = min;
    } else if (e.key === "End") {
      newVal = max;
    } else {
      return;
    }
    e.preventDefault();
    setDisplayValue(newVal);
    const targetX = leverageToX(newVal);
    animateThumbTo(targetX, () => {
      updateValue(newVal);
    });
  }, [disabled, currentValue, min, max, leverageToX, animateThumbTo, updateValue]);

  const showHandle = isDragging || isHovering;

  return (
    <div
      className={className}
      style={{
        fontFamily: "'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        userSelect: "none",
        WebkitUserSelect: "none",
        width: "100%",
        maxWidth: 480,
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
        ...style,
      }}
    >
      {/* Label */}
      {label !== null && (
        <div style={{
          fontSize: 14,
          fontWeight: 500,
          color: "#71717a",
          marginBottom: 12,
          letterSpacing: "0.01em",
          fontFamily: "'Barlow', sans-serif",
        }}>
          {label}
        </div>
      )}

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
          cursor: disabled ? "not-allowed" : isDragging ? "grabbing" : "pointer",
        }}
        onMouseEnter={() => !disabled && setIsHovering(true)}
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
          aria-label={label || "Leverage multiplier"}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={displayValue}
          aria-valuetext={`${displayValue}x leverage`}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={handleKeyDown}
        >
          {/* ============ TOP ROW: Growing lines ============ */}

          {/* Bars at integer positions — violet if selected, grey if not */}
          {Array.from({ length: tickCount }, (_, i) => {
            const val = min + i;
            const heightFraction = barHeights[val];
            const barH = heightFraction * MAX_BAR_HEIGHT;
            const xPercent = (i / steps) * 100;
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
          {Array.from({ length: steps }, (_, segIndex) => {
            const startVal = min + segIndex;
            const baseHeight = barHeights[startVal];
            const nextHeight = barHeights[startVal + 1];

            return Array.from({ length: SPACER_LINES_PER_SEGMENT }, (_, lineIndex) => {
              const t = (lineIndex + 1) / (SPACER_LINES_PER_SEGMENT + 1);
              const xPercent = ((segIndex + t) / steps) * 100;
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
          {Array.from({ length: tickCount }, (_, i) => {
            const val = min + i;
            const xPercent = (i / steps) * 100;
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
          {Array.from({ length: steps }, (_, segIndex) => {
            const startVal = min + segIndex;
            return Array.from({ length: SPACER_LINES_PER_SEGMENT }, (_, lineIndex) => {
              const t = (lineIndex + 1) / (SPACER_LINES_PER_SEGMENT + 1);
              const xPercent = ((segIndex + t) / steps) * 100;
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
              height: showHandle ? 110 : (barHeights[displayValue] || 0.25) * MAX_BAR_HEIGHT * 0.9,
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
          {Array.from({ length: tickCount }, (_, i) => {
            const val = min + i;
            const isActive = val === displayValue;
            const xPercent = (i / steps) * 100;

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
                  cursor: disabled ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                  lineHeight: 1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
                aria-label={`Set leverage to ${val}x`}
                disabled={disabled}
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

// Export the component for use in other projects
export { LeverageSlider };

// ─── Demo Page Wrapper ───
export default function App() {
  const isDev = import.meta.env.DEV;

  // Demo: controlled component example
  const [leverage, setLeverage] = useState(6);

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
          <LeverageSlider
            value={leverage}
            onChange={setLeverage}
          />
        </div>
      </div>
      {isDev && <Agentation />}
    </>
  );
}
