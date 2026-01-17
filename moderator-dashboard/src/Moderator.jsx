import { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:2000");

export default function Moderator() {
  const [claims, setClaims] = useState([]);

  useEffect(() => {
    socket.on("FACT_RESULT", (data) => {
      setClaims((prev) => [data, ...prev]);
    });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>🧑‍⚖️ Moderator Panel</h1>

      {claims.map((c, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #ccc",
            marginBottom: 12,
            padding: 10
          }}
        >
          <p><b>Speaker:</b> {c.speakerId}</p>
          <p><b>Claim:</b> {c.claim}</p>
          <p><b>Verdict:</b> {c.verdict}</p>
          <p><b>Confidence:</b> {Math.round(c.confidence * 100)}%</p>
          <p>{c.explanation}</p>
        </div>
      ))}
    </div>
  );
}
