import { useEffect, useState } from "react";
import io from "socket.io-client";
import {
  Gavel,
  MessageSquare,
  Search,
  User,
  Link as LinkIcon,
  ShieldCheck
} from "lucide-react";
import FlickeringGrid from "./FlickeringGrid";
import DecryptedText from "./DecryptedText";

const socket = io("http://localhost:2000");

export default function Moderator() {
  const [claims, setClaims] = useState([]);
  const [topicInput, setTopicInput] = useState("");
  const [currentTopic, setCurrentTopic] = useState("No topic set");

  /* ================= SOCKET ================= */
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

  /* ================= TOPIC ================= */
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

  /* ================= UI ================= */
  return (
    <div className="relative min-h-screen bg-[#00171F] text-white overflow-hidden">
      <FlickeringGrid className="absolute inset-0" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {/* HEADER */}
        <div className="flex items-center justify-center mb-10">
          <div className="flex items-center gap-3 text-4xl font-extrabold">
            <Gavel size={40} />
            Moderator Panel
          </div>
        </div>

        {/* TOPIC CARD */}
        <div className="flex justify-center mb-10">
          <div className="bg-[#00171F]/90 backdrop-blur-xl border border-[#003459]/50 rounded-2xl px-8 py-5 shadow-xl min-w-[360px] text-center">
            <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-white/60 mb-1">
              <MessageSquare size={14} />
              Current Topic
            </div>
            <div className="text-lg font-semibold mb-4">
              {currentTopic}
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter debate topic..."
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 px-4 py-2 rounded-xl bg-[#003459]/20 border border-[#003459]/40 focus:outline-none focus:ring-2 focus:ring-[#003459]"
              />
              <button
                onClick={handleSetTopic}
                className="px-5 py-2 rounded-xl bg-[#003459] font-semibold hover:opacity-90 transition"
              >
                Set
              </button>
            </div>
          </div>
        </div>

        {/* FACT CHECK RESULTS */}
        <div className="mt-6">
          <div className="flex items-center gap-2 text-xl font-bold mb-6">
            <Search size={22} />
            Fact Check Results
          </div>

          {claims.length === 0 ? (
            <div className="text-center opacity-70 py-20">
              Waiting for debaters to speak…
            </div>
          ) : (
            <div className="space-y-6">
              {claims.map((c, i) => (
                <div
                  key={i}
                  className="bg-[#00171F]/80 backdrop-blur-xl border border-[#003459]/40 rounded-2xl p-6 shadow-lg"
                >
                  {/* HEADER */}
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3 opacity-80">
                      <User size={16} />
                      <span className="font-semibold">{c.speakerId}</span>
                      <span className="text-xs">
                        {new Date(c.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <span
                      className={`px-4 py-1 rounded-full text-sm font-semibold
                        ${
                          c.verdict === "True"
                            ? "bg-green-600/20 text-green-300"
                            : c.verdict === "False"
                            ? "bg-red-600/20 text-red-300"
                            : "bg-yellow-600/20 text-yellow-300"
                        }
                      `}
                    >
                      {c.verdict}
                    </span>
                  </div>

                  {/* CLAIM VS FACT */}
                  <div className="grid md:grid-cols-2 gap-6 mb-4">
                    <div className="p-4 rounded-xl bg-[#003459]/20 border border-[#003459]/30">
                      <div className="text-xs uppercase opacity-60 mb-1">
                        Claim
                      </div>
                      <DecryptedText
                        text={`"${c.claim}"`}
                        speed={25}
                        maxIterations={12}
                        animateOn="view"
                      />
                    </div>

                    <div className="p-4 rounded-xl bg-[#003459]/20 border border-[#003459]/30">
                      <div className="text-xs uppercase opacity-60 mb-1">
                        Reality
                      </div>
                      <DecryptedText
                        text={c.fact || "No factual reference provided."}
                        speed={25}
                        maxIterations={12}
                        animateOn="view"
                      />
                    </div>
                  </div>

                  {/* DEVIATIONS */}
                  <div className="space-y-3 text-sm">
                    {typeof c.topicDeviationScore === "number" && (
                      <div>
                        <strong>Topic Deviation:</strong>{" "}
                        {Math.round(c.topicDeviationScore * 100)}%
                        <div className="opacity-70">
                          {c.topicDeviationReasoning}
                        </div>
                      </div>
                    )}

                    {typeof c.factDeviationScore === "number" && (
                      <div>
                        <strong>Fact Deviation:</strong>{" "}
                        {Math.round(c.factDeviationScore * 100)}%
                        <div className="opacity-70">
                          {c.factDeviationReasoning}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SOURCE */}
                  <div className="flex justify-between items-center mt-4 text-sm opacity-80">
                    {c.source && (
                      <div className="flex items-center gap-2">
                        <LinkIcon size={14} />
                        {c.sourceUrl ? (
                          <a
                            href={c.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:opacity-80"
                          >
                            {c.source}
                          </a>
                        ) : (
                          <span>{c.source}</span>
                        )}
                      </div>
                    )}

                    {typeof c.sourceConfidence === "number" && (
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={14} />
                        {Math.round(c.sourceConfidence * 100)}% confidence
                      </div>
                    )}
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
