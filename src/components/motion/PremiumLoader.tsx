"use client";

import { motion } from "@/components/motion/motion";

const loaderStyles = `
  @keyframes shimmer-gradient {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes pulse-glow {
    0%, 100% {
      filter: drop-shadow(0 0 10px rgba(99, 179, 237, 0.4))
              drop-shadow(0 0 30px rgba(99, 179, 237, 0.2));
      opacity: 0.9;
    }
    50% {
      filter: drop-shadow(0 0 20px rgba(99, 179, 237, 0.6))
              drop-shadow(0 0 50px rgba(99, 179, 237, 0.3));
      opacity: 1;
    }
  }
  @keyframes pulse-glow-small {
    0%, 100% {
      filter: drop-shadow(0 0 4px rgba(99, 179, 237, 0.4))
              drop-shadow(0 0 12px rgba(99, 179, 237, 0.2));
      opacity: 0.9;
    }
    50% {
      filter: drop-shadow(0 0 8px rgba(99, 179, 237, 0.6))
              drop-shadow(0 0 20px rgba(99, 179, 237, 0.3));
      opacity: 1;
    }
  }
  @keyframes float-loader {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }
  @keyframes float-loader-small {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-3px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .premium-loader-text {
      animation: none !important;
      background-position: center !important;
    }
  }
`;

export function InlineLoader({
  size = 16,
  description,
  label = "Завантаження",
}: {
  size?: number;
  description?: string;
  label?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "24px",
        maxWidth: "320px",
        margin: "0 auto",
      }}
      aria-busy="true"
      aria-label={label}
    >
      <style>{loaderStyles}</style>

      <div
        style={{
          animation:
            "float-loader-small 3s ease-in-out infinite, pulse-glow-small 2s ease-in-out infinite",
        }}
      >
        <span
          className="premium-loader-text"
          style={{
            fontSize: `${size}px`,
            fontWeight: 800,
            letterSpacing: "0.05em",
            background:
              "linear-gradient(90deg, #1e3a8a 0%, #2563eb 15%, #60a5fa 30%, #c4dafe 50%, #60a5fa 70%, #2563eb 85%, #1e3a8a 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: "shimmer-gradient 2.5s linear infinite",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>

      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "80px",
          height: "2px",
          borderRadius: "1px",
          background:
            "linear-gradient(90deg, transparent 0%, #60a5fa 50%, transparent 100%)",
          animation: "pulse-glow-small 2s ease-in-out infinite",
          transformOrigin: "center",
        }}
      />

      {description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          style={{
            fontSize: "13px",
            lineHeight: "1.6",
            color: "rgba(148, 163, 184, 0.8)",
            textAlign: "center",
            margin: 0,
            fontWeight: 400,
          }}
        >
          {description}
        </motion.p>
      )}
    </motion.div>
  );
}

export function PremiumLoader({
  brand = "Metrum Group",
}: {
  brand?: string;
}) {
  const orbitParticles = Array.from({ length: 6 }, (_, i) => i);

  return (
    <>
      <style>{loaderStyles}</style>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: "16px",
          background:
            "radial-gradient(circle at 50% 50%, rgba(96,165,250,0.06) 0%, transparent 50%), #0B0F17",
        }}
        aria-busy="true"
        aria-label="Завантаження..."
      >
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.7, 0.45], scale: [0.6, 1.15, 1] }}
          transition={{
            duration: 1.6,
            ease: [0.16, 1, 0.3, 1],
            times: [0, 0.55, 1],
          }}
          style={{
            position: "absolute",
            width: "420px",
            height: "420px",
            borderRadius: "50%",
            pointerEvents: "none",
            background:
              "radial-gradient(closest-side, rgba(96,165,250,0.28), rgba(37,99,235,0.12) 55%, transparent 80%)",
            filter: "blur(16px)",
          }}
        />

        <div
          style={{
            position: "absolute",
            width: "320px",
            height: "320px",
            pointerEvents: "none",
          }}
        >
          {orbitParticles.map((i) => (
            <motion.span
              key={i}
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ rotate: 360, opacity: [0, 1, 1, 0.6] }}
              transition={{
                rotate: {
                  duration: 6 + i * 0.4,
                  ease: "linear",
                  repeat: Infinity,
                  delay: 0.2 + i * 0.08,
                },
                opacity: {
                  duration: 0.8,
                  delay: 0.2 + i * 0.08,
                  times: [0, 0.4, 0.7, 1],
                },
              }}
              style={{
                position: "absolute",
                inset: 0,
                transformOrigin: "center",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  width: i % 2 === 0 ? "6px" : "4px",
                  height: i % 2 === 0 ? "6px" : "4px",
                  marginLeft: i % 2 === 0 ? "-3px" : "-2px",
                  borderRadius: "50%",
                  background:
                    i % 2 === 0
                      ? "radial-gradient(closest-side, #c4dafe, #60a5fa 45%, transparent 70%)"
                      : "radial-gradient(closest-side, #60a5fa, #2563eb 50%, transparent 70%)",
                  boxShadow: "0 0 12px rgba(96,165,250,0.7)",
                }}
              />
            </motion.span>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.55, rotateX: 35, y: 40, filter: "blur(18px)" }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 170, damping: 18, mass: 1, delay: 0.05 }}
          style={{
            animation:
              "float-loader 3s ease-in-out infinite, pulse-glow 2s ease-in-out infinite",
            position: "relative",
            zIndex: 1,
            transformStyle: "preserve-3d",
            perspective: 800,
          }}
        >
          <span
            className="premium-loader-text"
            style={{
              fontSize: "32px",
              fontWeight: 800,
              letterSpacing: "0.05em",
              background:
                "linear-gradient(90deg, #1e3a8a 0%, #2563eb 15%, #60a5fa 30%, #c4dafe 50%, #60a5fa 70%, #2563eb 85%, #1e3a8a 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: "shimmer-gradient 2.5s linear infinite",
              textTransform: "uppercase",
            }}
          >
            {brand}
          </span>
        </motion.div>

        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: "120px",
            height: "2px",
            borderRadius: "1px",
            background:
              "linear-gradient(90deg, transparent 0%, #60a5fa 50%, transparent 100%)",
            animation: "pulse-glow 2s ease-in-out infinite",
            transformOrigin: "center",
            position: "relative",
            zIndex: 1,
          }}
        />
      </motion.div>
    </>
  );
}
