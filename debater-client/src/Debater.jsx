import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

export default function Debater({ speakerId }) {
  const socketRef = useRef(null);
  const recognitionRef = useRef(null);

  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [factResult, setFactResult] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");

  useEffect(() => {
    // Initialize socket connection
    const socket = io("http://localhost:2000", {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    // Connection event listeners
    socket.on("connect", () => {
      console.log("✅ Connected to server:", socket.id);
      setConnectionStatus("connected");
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Connection error:", error);
      setConnectionStatus("error");
    });

    socket.on("disconnect", () => {
      console.log("🔌 Disconnected from server");
      setConnectionStatus("disconnected");
    });

    // Listen for fact-check results
    socket.on("FACT_RESULT", (data) => {
      console.log("📊 Fact result received:", data);
      setFactResult(data);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      console.log("🧹 Socket cleaned up");
    };
  }, []);

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
        setFinalText(final);
        setLiveText("");

        // 🔥 SEND FINAL TRANSCRIPT TO SERVER
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("TRANSCRIPT_FINAL", {
            speakerId,
            text: final
          });
        } else {
          console.warn("⚠️ Socket not connected");
        }
      }
    };

    recognitionRef.current = recognition;
  }, [speakerId]);

  const toggleMic = () => {
    if (!listening) {
      recognitionRef.current.start();
      setListening(true);
    } else {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>🎤 Debater: {speakerId}</h2>

      {/* Connection Status */}
      <div style={{ marginBottom: 15, padding: 10, backgroundColor: connectionStatus === "connected" ? "#d4edda" : connectionStatus === "error" ? "#f8d7da" : "#e2e3e5", borderRadius: 4 }}>
        <p style={{ margin: 0 }}>
          Connection: <b>{connectionStatus.toUpperCase()}</b>
        </p>
      </div>

      <button onClick={toggleMic}>
        {listening ? "🛑 Stop" : "▶ Start Speaking"}
      </button>

      <div style={{ marginTop: 20 }}>
        <h4>📝 Live Transcription</h4>
        <p style={{ color: "gray" }}>{liveText || "Listening..."}</p>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>✅ Final Sentence Sent</h4>
        <p><b>{finalText}</b></p>
      </div>

      {/* Fact Check Result */}
      {factResult && (
        <div style={{ marginTop: 20, padding: 15, backgroundColor: "#e7f3ff", borderRadius: 4, border: "1px solid #b3d9ff" }}>
          <h4>📊 Fact Check Result</h4>
          <p><b>Verdict:</b> {factResult.verdict}</p>
          <p><b>Confidence:</b> {(factResult.confidence * 100).toFixed(1)}%</p>
          <p><b>Explanation:</b> {factResult.explanation}</p>
        </div>
      )}
    </div>
  );
}
