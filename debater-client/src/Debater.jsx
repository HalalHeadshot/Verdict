import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import FlickeringGrid from "./FlickeringGrid";

const socket = io("http://localhost:2000");

export default function Debater({ speakerId }) {
  const recognitionRef = useRef(null);

  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [topic, setTopic] = useState("Waiting for topic...");
  const [statements, setStatements] = useState([]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      setLiveText(interim);

      if (final) {
        setLiveText("");

        // 🔥 SEND FINAL TRANSCRIPT TO SERVER
        socket.emit("TRANSCRIPT_FINAL", {
          speakerId,
          text: final
        });
      }
    };

    recognitionRef.current = recognition;
  }, [speakerId]);

  // Socket listeners for topic and statements
  useEffect(() => {
    socket.on("TOPIC_UPDATE", (data) => {
      setTopic(data.topic || data);
    });

    socket.on("NEW_STATEMENT", (statement) => {
      setStatements((prev) => [statement, ...prev]);
    });

    return () => {
      socket.off("TOPIC_UPDATE");
      socket.off("NEW_STATEMENT");
    };
  }, []);

  const toggleMic = () => {
    if (!listening) {
      recognitionRef.current.start();
      setListening(true);
    } else {
      recognitionRef.current.stop();
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
            <div className="transcription-label">
              {listening ? "Live Transcription" : "Press mic to start"}
            </div>
            <div className={`transcription-text ${liveText ? 'live' : 'empty'}`}>
              {liveText || (listening ? "Listening..." : "Ready to record")}
            </div>
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
