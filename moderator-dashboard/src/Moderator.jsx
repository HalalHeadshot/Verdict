import { useEffect, useState } from "react";
import io from "socket.io-client";
import FlickeringGrid from "./FlickeringGrid";
import DecryptedText from "./DecryptedText";

const socket = io("http://localhost:2000");

export default function Moderator() {
  const [claims, setClaims] = useState([]);
  const [topicInput, setTopicInput] = useState("");
  const [currentTopic, setCurrentTopic] = useState("No topic set");

  useEffect(() => {
    socket.on("FACT_RESULT", (data) => {
      setClaims((prev) => [data, ...prev]);
    });

    socket.on("TOPIC_UPDATE", (data) => {
      setCurrentTopic(data.topic);
    });

    return () => {
      socket.off("FACT_RESULT");
      socket.off("TOPIC_UPDATE");
    };
  }, []);

  const handleSetTopic = () => {
    if (topicInput.trim()) {
      socket.emit("SET_TOPIC", { topic: topicInput.trim() });
      setCurrentTopic(topicInput.trim());
      setTopicInput("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSetTopic();
  };

  return (
    <div style={{ width: "100%", minHeight: "100vh", position: "relative" }}>
      <FlickeringGrid
        className="absolute inset-0 w-full h-full"
        squareSize={4}
        gridGap={6}
        color="#6366f1"
        maxOpacity={0.3}
        flickerChance={0.1}
      />

      <div className="moderator-container" style={{ position: "relative", zIndex: 1 }}>
        {/* Topic Control */}
        <div className="topic-control-card">
          <h1 className="moderator-title">🧑‍⚖️ Moderator Panel</h1>

          <div className="current-topic-display">
            <span className="topic-label">Current Topic:</span>
            <span className="topic-value">{currentTopic}</span>
          </div>

          <div className="topic-input-section">
            <input
              type="text"
              className="topic-input"
              placeholder="Enter debate topic..."
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button className="set-topic-btn" onClick={handleSetTopic}>
              Set Topic
            </button>
          </div>
        </div>

        {/* Claims Section */}
        <div className="claims-section">
          <h2 className="section-title">📊 Fact Check Results</h2>

          {claims.length === 0 ? (
            <div className="empty-state">
              No claims fact-checked yet. Waiting for debaters...
            </div>
          ) : (
            <div className="claims-feed">
              {claims.map((c, i) => (
                <div key={i} className="claim-card">
                  <div className="claim-header">
                    <div className="speaker-info">
                      <span className="speaker-badge">{c.speakerId}</span>
                      <span className="timestamp">
                        {new Date(c.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className={`verdict-badge verdict-${c.verdict?.toLowerCase()}`}>
                      {c.verdict}
                    </span>
                  </div>

                  <div className="claim-content">
                    {/* Claim vs Fact */}
                    <div className="comparison-grid">
                      <div className="comparison-box claim-box">
                        <div className="box-label">🗣️ Claim</div>
                        <p className="box-text">
                          <DecryptedText
                            text={`"${c.claim}"`}
                            speed={25}
                            maxIterations={12}
                            animateOn="view"
                          />
                        </p>
                      </div>

                      <div className="comparison-box fact-box">
                        <div className="box-label">🔍 Reality</div>
                        <p className="box-text">
                          <DecryptedText
                            text={c.fact || "No factual reference provided."}
                            speed={25}
                            maxIterations={12}
                            animateOn="view"
                          />
                        </p>
                      </div>
                    </div>

                    {/* Deviations */}
                    <div className="analysis-section">
                      {/* Topic Deviation */}
                      {typeof c.topicDeviationScore === "number" && (
                        <p className="deviation-text">
                          <strong>Topic Deviation:</strong>{" "}
                          {Math.round(c.topicDeviationScore * 100)}%
                          <br />
                          <span className="deviation-reason">
                            {c.topicDeviationReasoning}
                          </span>
                        </p>
                      )}

                      {/* Fact Deviation */}
                      {typeof c.factDeviationScore === "number" && (
                        <p className="deviation-text">
                          <strong>Fact Deviation:</strong>{" "}
                          {Math.round(c.factDeviationScore * 100)}%
                          <br />
                          <span className="deviation-reason">
                            {c.factDeviationReasoning}
                          </span>
                        </p>
                      )}

                      {/* Source & Confidence */}
                      <div className="meta-footer">
                        {c.source && (
                          <div className="source-info">
                            <span className="source-label">Source:</span>
                            {c.sourceUrl ? (
                              <a
                                href={c.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="source-link"
                              >
                                {c.source} 🔗
                              </a>
                            ) : (
                              <span className="source-text">{c.source}</span>
                            )}
                          </div>
                        )}

                        {typeof c.sourceConfidence === "number" && (
                          <span className="confidence-text">
                            Source confidence:{" "}
                            {Math.round(c.sourceConfidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
