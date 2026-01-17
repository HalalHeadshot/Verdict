import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import FlickeringGrid from "./FlickeringGrid";
import DecryptedText from "./DecryptedText";

const socket = io("http://localhost:2000");

export default function Debater({ speakerId: initialSpeakerId }) {
  const recognitionRef = useRef(null);
  const debounceTimerRef = useRef(null);

  /* =======================
     STATE
  ======================= */
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [accumulatedText, setAccumulatedText] = useState("");
  const [topic, setTopic] = useState("Waiting for topic...");
  const [statements, setStatements] = useState([]);

  const [selectedSpeaker, setSelectedSpeaker] = useState(initialSpeakerId || null);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);

  const [canSend, setCanSend] = useState(true);
  const [cooldown, setCooldown] = useState(0);

  /* =======================
     SEND TRANSCRIPT (FIXED)
  ======================= */
  const sendTranscript = () => {
    if (!accumulatedText.trim() || !canSend) return;

    // Cancel pending auto-send
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    socket.emit("TRANSCRIPT_FINAL", {
      speakerId: selectedSpeaker,
      text: accumulatedText.trim()
    });

    setAccumulatedText("");
  };

  /* =======================
     SPEECH RECOGNITION
  ======================= */
  useEffect(() => {
    if (!selectedSpeaker) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += transcript + " ";
        else interim += transcript;
      }

      setLiveText(interim);

      if (finalChunk) {
        setLiveText("");
        setAccumulatedText(prev => {
          const newText = prev + finalChunk;

          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

          debounceTimerRef.current = setTimeout(() => {
            if (canSend && !listening) {
              socket.emit("TRANSCRIPT_FINAL", {
                speakerId: selectedSpeaker,
                text: newText.trim()
              });
              setAccumulatedText("");
            }
          }, 3000);

          return newText;
        });
      }
    };

    recognitionRef.current = recognition;
  }, [selectedSpeaker, canSend, listening]);

  /* =======================
     SOCKET LISTENERS
  ======================= */
  useEffect(() => {
    socket.on("TOPIC_UPDATE", (data) => setTopic(data.topic || data));

    socket.on("SPEAKER_UPDATE", (data) =>
      setCurrentSpeaker(data.currentSpeaker)
    );

    socket.on("FACT_RESULT", (data) => {
      if (data.verdict === "rate_limited") {
        setCanSend(false);
        setCooldown(15);

        const timer = setInterval(() => {
          setCooldown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              setCanSend(true);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setStatements(prev => [{
          speakerId: data.speakerId,
          text: data.claim,
          timestamp: data.timestamp
        }, ...prev]);
      }
    });

    return () => {
      socket.off("TOPIC_UPDATE");
      socket.off("FACT_RESULT");
      socket.off("SPEAKER_UPDATE");
    };
  }, []);

  /* =======================
     MIC CONTROL
  ======================= */
  const toggleMic = () => {
    if (currentSpeaker && currentSpeaker !== selectedSpeaker) return;

    if (!listening) {
      try { recognitionRef.current?.start(); } catch {}
      setListening(true);
      socket.emit("CLAIM_MIC", selectedSpeaker);
    } else {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
      socket.emit("RELEASE_MIC", selectedSpeaker);
    }
  };

  const isMicLocked = currentSpeaker && currentSpeaker !== selectedSpeaker;

  /* =======================
     LOGIN SCREEN (UNCHANGED)
  ======================= */
  if (!selectedSpeaker) {
    return (
      <div
  style={{
    width: "100%",
    minHeight: "100vh",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  }}
>
  {/* Background */}
  <FlickeringGrid className="absolute inset-0 w-full h-full" />

  {/* Login Card */}
  <div
    style={{
      zIndex: 1,
      padding: "3rem 3.5rem",
      borderRadius: "28px",
      background: "rgba(15, 23, 42, 0.85)", // slate-900 glass
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow:
        "0 25px 50px -12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
      textAlign: "center",
      minWidth: "360px"
    }}
  >
    {/* Title */}
    <h1
      style={{
        marginBottom: "0.75rem",
        fontSize: "2.4rem",
        fontWeight: 800,
        letterSpacing: "-0.02em",
        background: "linear-gradient(90deg, #6366f1, #a855f7)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent"
      }}
    >
      🎙️ Select Debater
    </h1>

    {/* Subtitle */}
    <p
      style={{
        marginBottom: "2.5rem",
        fontSize: "0.95rem",
        opacity: 0.75
      }}
    >
      Choose your role to join the live debate
    </p>

    {/* Buttons */}
    <div
      style={{
        display: "flex",
        gap: "1.25rem",
        justifyContent: "center"
      }}
    >
      {/* Debater A */}
      <button
        onClick={() => setSelectedSpeaker("Debater A")}
        style={{
          padding: "1rem 2.2rem",
          fontSize: "1.05rem",
          fontWeight: 700,
          borderRadius: "16px",
          border: "none",
          cursor: "pointer",
          color: "white",
          background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          boxShadow: "0 12px 20px -8px rgba(99,102,241,0.6)",
          transition: "all 0.25s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-3px) scale(1.03)";
          e.currentTarget.style.boxShadow =
            "0 20px 30px -10px rgba(99,102,241,0.8)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow =
            "0 12px 20px -8px rgba(99,102,241,0.6)";
        }}
      >
        Debater A 🔵
      </button>

      {/* Debater B */}
      <button
        onClick={() => setSelectedSpeaker("Debater B")}
        style={{
          padding: "1rem 2.2rem",
          fontSize: "1.05rem",
          fontWeight: 700,
          borderRadius: "16px",
          border: "none",
          cursor: "pointer",
          color: "white",
          background: "linear-gradient(135deg, #ec4899, #db2777)",
          boxShadow: "0 12px 20px -8px rgba(236,72,153,0.6)",
          transition: "all 0.25s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-3px) scale(1.03)";
          e.currentTarget.style.boxShadow =
            "0 20px 30px -10px rgba(236,72,153,0.8)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow =
            "0 12px 20px -8px rgba(236,72,153,0.6)";
        }}
      >
        Debater B 🔴
      </button>
    </div>
  </div>
</div>

    );
  }

  /* =======================
     MAIN UI
  ======================= */
  return (
    <div style={{ width: "100%", minHeight: "100vh", position: "relative" }}>
      <FlickeringGrid className="absolute inset-0 w-full h-full" />

      <div className="debater-container" style={{ position: "relative", zIndex: 1 }}>
        <div className="topic-card">
          <div className="topic-label">Current Topic</div>
          <div className="topic-text">{topic}</div>
        </div>

        {/* 🎤 TRANSCRIPTION */}
        <div className="transcription-section">
          <button
            className={`mic-button ${listening ? "listening" : ""}`}
            onClick={toggleMic}
            disabled={isMicLocked}
          >
            {isMicLocked ? "🔒" : listening ? "🛑" : "🎤"}
          </button>

          <div className="transcription-display">
            <div className={`transcription-text ${liveText || accumulatedText ? "live" : "empty"}`}>
              {liveText ? (
                <>
                  <span style={{ opacity: 0.7 }}>
                    <DecryptedText
                      text={accumulatedText}
                      speed={30}
                      maxIterations={12}
                      animateOn="view"
                    />
                  </span>
                  <span>{liveText}</span>
                </>
              ) : accumulatedText ? (
                <DecryptedText
                  text={accumulatedText}
                  speed={30}
                  maxIterations={12}
                  animateOn="view"
                />
              ) : (
                listening ? "Listening..." : "Ready to record"
              )}
            </div>

            {/* ✅ FIXED SEND NOW BUTTON (UI + LOGIC) */}
            {accumulatedText && !listening && (
              <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={sendTranscript}
                  disabled={!canSend}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "999px",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: canSend
                      ? "linear-gradient(to right, #6366f1, #a855f7)"
                      : "rgba(255,255,255,0.08)",
                    color: canSend ? "#fff" : "#9ca3af",
                    border: "1px solid rgba(255,255,255,0.15)",
                    cursor: canSend ? "pointer" : "not-allowed",
                    boxShadow: canSend
                      ? "0 8px 20px rgba(99,102,241,0.35)"
                      : "none",
                    transition: "all 0.25s ease",
                    backdropFilter: "blur(10px)"
                  }}
                >
                  Send Now
                </button>
              </div>
            )}

            {!canSend && (
              <div style={{ color: "#ef4444", marginTop: "8px", fontSize: "0.8rem" }}>
                Rate limited — wait {cooldown}s
              </div>
            )}
          </div>
        </div>

        {/* 💬 STATEMENTS */}
        <div className="statements-section">
          <div className="statements-header">💬 Debate Statements</div>
          <div className="statements-feed">
            {statements.map((s, i) => (
              <div key={i} className="statement-card">
                <strong>{s.speakerId}</strong>: {s.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
