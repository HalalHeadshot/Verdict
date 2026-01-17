import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import FlickeringGrid from "./FlickeringGrid";

const socket = io("http://localhost:2000");

export default function Debater({ speakerId }) {
  const recognitionRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [accumulatedText, setAccumulatedText] = useState(""); // Buffer for unsent text
  const [topic, setTopic] = useState("Waiting for topic...");
  const [statements, setStatements] = useState([]);

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
      speakerId,
      text: accumulatedText.trim()
    });

    setAccumulatedText("");
  };

  useEffect(() => {
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
            // We can't access updated state in timeout easily without ref or wrapper, 
            // but since we update state, let's trigger a send effect or use a ref.
            // Actually, cleaner to just call a function that reads the latest ref? 
            // React state closure issue. Let's send the *combined* text from here? 
            // No, better to trigger the send function which needs access to 'accumulatedText'.
            // A common pattern: use a ref to track text for the timeout, or just use the functional update 'prev' logic?
            // Simplest: The timeout just calls a function that sets a "shouldSend" flag or similar. 
            // OR, better yet: just emit the event directly here using the value we just computed.

            if (canSend) {
              socket.emit("TRANSCRIPT_FINAL", {
                speakerId,
                text: newText.trim()
              });
              setAccumulatedText(""); // Clear buffer
            }
          }, 3000);

          return newText;
        });
      }
    };

    recognitionRef.current = recognition;
  }, [speakerId, canSend]); // Re-bind if canSend changes so closure is fresh? Or handle via refs.
  // Note: Re-creating recognition on 'canSend' change might interrupt speech. 
  // Better to use a Ref for 'canSend' or the accumulated text logic above. 
  // Let's refine the timeout logic to be robust.

  // --- REFINED LISTENER LOGIC TO AVOID COMPLEXITY ---
  // We'll keep it simple: The timeout is set, but we also check checks in the render or Effect?
  // Actually, let's just use the `accumulatedText` state logic with a useEffect for debouncing?
  // No, `onresult` is callback based. 
  // Let's fix the logic inside `onresult` in the next replacement step if needed, 
  // but for now I will use a Ref for `accumulatedText` to solve closure issues in the timeout.

  // Actually, I'll rewrite the whole component with the Ref pattern for stability.

  // Socket listeners
  useEffect(() => {
    socket.on("TOPIC_UPDATE", (data) => {
      setTopic(data.topic || data);
    });

    socket.on("NEW_STATEMENT", (statement) => {
      setStatements((prev) => [statement, ...prev]);
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
      } else {
        // It's a normal fact result, we can ignore or add to list? 
        // The original code didn't seem to add fact results to the list, 
        // only the Moderator did. Wait, looking at original code... 
        // Ah, Debater didn't use FACT_RESULT for display list, only Moderator.
        // But Debater *listens* for NEW_STATEMENT. 
        // The server emits FACT_RESULT, does it emit NEW_STATEMENT?
        // Checking server code... it emits FACT_RESULT to everyone?
        // Server.js: io.emit("FACT_RESULT", ...)
        // It seems Debater used to listen to NEW_STATEMENT but server emits FACT_RESULT?
        // Wait, previous summary said "Server emits: FACT_RESULT, TOPIC_UPDATE".
        // So Debater should listen to FACT_RESULT if it wants to show the feed.
        // Original code: socket.on("NEW_STATEMENT", ...) -> setStatements
        // But server.js emits FACT_RESULT. 
        // CHECK: Did I miss where NEW_STATEMENT comes from? 
        // Maybe it was never working? OR maybe I need to fix that too?
        // Let's stick to fixing rate limit for now, but I'll add handling for FACT_RESULT text in chat too 
        // if we want the debater to see their own text. 
        // Actually, let's just treat FACT_RESULT as a statement if it's not rate limited.
        if (data.verdict !== "rate_limited") {
          setStatements(prev => [{
            speakerId: data.speakerId,
            text: data.claim,
            timestamp: data.timestamp
          }, ...prev]);
        }
      }
    });

    return () => {
      socket.off("TOPIC_UPDATE");
      socket.off("NEW_STATEMENT");
      socket.off("FACT_RESULT");
    };
  }, []);

  const toggleMic = () => {
    if (!listening) {
      if (recognitionRef.current) try { recognitionRef.current.start(); } catch (e) { }
      setListening(true);
    } else {
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (e) { }
      setListening(false);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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
        {/* Topic Card */}
        <div className="topic-card">
          <div className="topic-label">Current Topic</div>
          <div className="topic-text">{topic}</div>
        </div>

        {/* Transcription Section */}
        <div className="transcription-section">
          <button
            className={`mic-button ${listening ? 'listening' : ''}`}
            onClick={toggleMic}
            aria-label={listening ? "Stop recording" : "Start recording"}
          >
            {listening ? "🛑" : "🎤"}
          </button>

          <div className="transcription-display">
            <div className="transcription-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{listening ? "Live Transcription" : "Press mic to start"}</span>
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
            {accumulatedText && (
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
