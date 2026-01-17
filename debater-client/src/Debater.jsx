import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import FlickeringGrid from "./FlickeringGrid";

const socket = io("http://localhost:2000");

export default function Debater({ speakerId: initialSpeakerId }) {
  const recognitionRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [accumulatedText, setAccumulatedText] = useState(""); // Buffer for unsent text
  const [topic, setTopic] = useState("Waiting for topic...");
  const [statements, setStatements] = useState([]);

  // Speaker Selection State
  // If initialSpeakerId is passed prop, use it, otherwise null (login screen)
  const [selectedSpeaker, setSelectedSpeaker] = useState(initialSpeakerId || null);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);

  // Rate limiting state
  const [canSend, setCanSend] = useState(true);
  const [cooldown, setCooldown] = useState(0);

  // Send accumulated text to server
  const sendTranscript = () => {
    if (!accumulatedText.trim() || !canSend) return;

    // Clear debounce timer if it's running
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // 🔥 SEND FINAL TRANSCRIPT TO SERVER
    socket.emit("TRANSCRIPT_FINAL", {
      speakerId: selectedSpeaker,
      text: accumulatedText.trim()
    });

    setAccumulatedText("");
  };

  useEffect(() => {
    // Wait for speaker selection
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

        if (event.results[i].isFinal) {
          finalChunk += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      setLiveText(interim);

      if (finalChunk) {
        setLiveText("");

        // Append to accumulated text
        setAccumulatedText(prev => {
          const newText = prev + finalChunk;

          // Reset debounce timer
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

          // Auto-send after 3 seconds of silence
          debounceTimerRef.current = setTimeout(() => {
            if (canSend) {
              socket.emit("TRANSCRIPT_FINAL", {
                speakerId: selectedSpeaker,
                text: newText.trim()
              });
              setAccumulatedText(""); // Clear buffer
            }
          }, 3000);

          return newText;
        });
      }
    };

    // Handle mic stop explicitly to sync state if browser stops it
    recognition.onend = () => {
      if (listening) {
        // If meant to be listening but stopped (network error etc),
        // We can try to restart or just accept it.
      }
    };

    recognitionRef.current = recognition;
  }, [selectedSpeaker, canSend]); // Re-bind if speaker changes

  // Socket listeners
  useEffect(() => {
    socket.on("TOPIC_UPDATE", (data) => {
      setTopic(data.topic || data);
    });

    socket.on("NEW_STATEMENT", (statement) => {
      setStatements((prev) => [statement, ...prev]);
    });

    socket.on("SPEAKER_UPDATE", (data) => {
      setCurrentSpeaker(data.currentSpeaker);
    });

    socket.on("FACT_RESULT", (data) => {
      if (data.verdict === "rate_limited") {
        setCanSend(false);
        setCooldown(15);

        // Start countdown
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
      } else if (data.verdict !== "rate_limited") {
        setStatements(prev => [{
          speakerId: data.speakerId,
          text: data.claim,
          timestamp: data.timestamp
        }, ...prev]);
      }
    });

    return () => {
      socket.off("TOPIC_UPDATE");
      socket.off("NEW_STATEMENT");
      socket.off("FACT_RESULT");
      socket.off("SPEAKER_UPDATE");
    };
  }, []);

  const toggleMic = () => {
    // Prevent toggling if someone else is speaking
    if (currentSpeaker && currentSpeaker !== selectedSpeaker) return;

    if (!listening) {
      if (recognitionRef.current) try { recognitionRef.current.start(); } catch (e) { }
      setListening(true);
      socket.emit("CLAIM_MIC", selectedSpeaker);
    } else {
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (e) { }
      setListening(false);
      socket.emit("RELEASE_MIC", selectedSpeaker);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // --- RENDER LOGIN SCREEN ---
  if (!selectedSpeaker) {
    return (
      <div style={{ width: '100%', minHeight: '100vh', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FlickeringGrid
          className="absolute inset-0 w-full h-full"
          squareSize={4}
          gridGap={6}
          color="#6366f1"
          maxOpacity={0.3}
          flickerChance={0.1}
        />
        <div className="login-card" style={{ zIndex: 1, padding: '3rem', background: 'rgba(30, 41, 59, 0.9)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'center', backdropFilter: 'blur(20px)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
          <h1 style={{ marginBottom: '2rem', fontSize: '2.5rem', fontWeight: '800', background: 'linear-gradient(to right, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🎙️ Select Debater</h1>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
            <button
              onClick={() => setSelectedSpeaker("Debater A")}
              style={{ padding: '1rem 2rem', fontSize: '1.2rem', cursor: 'pointer', borderRadius: '12px', border: 'none', background: '#6366f1', color: 'white', fontWeight: 'bold', transition: 'transform 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}
              onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
            >
              Debater A 🔵
            </button>
            <button
              onClick={() => setSelectedSpeaker("Debater B")}
              style={{ padding: '1rem 2rem', fontSize: '1.2rem', cursor: 'pointer', borderRadius: '12px', border: 'none', background: '#ec4899', color: 'white', fontWeight: 'bold', transition: 'transform 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}
              onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
            >
              Debater B 🔴
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isMicLocked = currentSpeaker && currentSpeaker !== selectedSpeaker;

  return (
    <div style={{ width: '100%', minHeight: '100vh', position: 'relative' }}>
      <FlickeringGrid
        className="absolute inset-0 w-full h-full"
        squareSize={4}
        gridGap={6}
        color="#6366f1"
        maxOpacity={0.3}
        flickerChance={0.1}
      />

      <div className="debater-container" style={{ position: 'relative', zIndex: 1 }}>
        <div className="speaker-badge-header" style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '20px', backdropFilter: 'blur(5px)' }}>
          👤 You are: <strong>{selectedSpeaker}</strong>
        </div>

        {/* Topic Card */}
        <div className="topic-card">
          <div className="topic-label">Current Topic</div>
          <div className="topic-text">{topic}</div>
        </div>

        {/* Transcription Section */}
        <div className="transcription-section">
          <button
            className={`mic-button ${listening ? 'listening' : ''} ${isMicLocked ? 'locked' : ''}`}
            onClick={toggleMic}
            disabled={isMicLocked}
            aria-label={listening ? "Stop recording" : "Start recording"}
            style={{
              opacity: isMicLocked ? 0.5 : 1,
              cursor: isMicLocked ? 'not-allowed' : 'pointer',
              background: isMicLocked ? '#374151' : undefined
            }}
          >
            {isMicLocked ? "🔒" : listening ? "🛑" : "🎤"}
          </button>

          <div className="transcription-display">
            <div className="transcription-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {listening ? "Live Transcription" : isMicLocked ? `${currentSpeaker} is speaking...` : "Press mic to start"}
              </span>
              {!canSend && <span style={{ color: '#ef4444', fontWeight: 'bold' }}>⚠️ Rate Limit: {cooldown}s</span>}
            </div>

            <div className={`transcription-text ${liveText || accumulatedText ? 'live' : 'empty'}`}>
              {liveText ? (
                <>
                  <span style={{ opacity: 0.7 }}>{accumulatedText}</span>
                  <span>{liveText}</span>
                </>
              ) : accumulatedText ? (
                <span>{accumulatedText}</span>
              ) : (
                listening ? "Listening..." : "Ready to record"
              )}
            </div>

            {/* Manual Send Controls */}
            {accumulatedText && !isMicLocked && !listening && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                  {debounceTimerRef.current ? "Sending in a few seconds..." : "Ready to send"}
                </div>
                <button
                  onClick={sendTranscript}
                  disabled={!canSend}
                  style={{
                    padding: '6px 16px',
                    background: canSend ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: canSend ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '20px',
                    color: canSend ? '#e0e7ff' : '#6b7280',
                    cursor: canSend ? 'pointer' : 'not-allowed',
                    fontSize: '0.9rem',
                    transition: 'all 0.2s'
                  }}
                >
                  Send Now 📤
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Statements Section */}
        <div className="statements-section">
          <div className="statements-header">💬 Debate Statements</div>
          <div className="statements-feed">
            {statements.length === 0 ? (
              <div className="statements-empty">
                No statements yet. Start the debate!
              </div>
            ) : (
              statements.map((statement, index) => (
                <div key={index} className="statement-card">
                  <div className="statement-header">
                    <div className="statement-speaker">
                      {statement.speakerId || "Unknown"}
                    </div>
                    {statement.timestamp && (
                      <div className="statement-time">
                        {formatTime(statement.timestamp)}
                      </div>
                    )}
                  </div>
                  <div className="statement-text">{statement.text}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
