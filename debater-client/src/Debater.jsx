import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import {
  Mic,
  Square,
  Lock,
  User,
  AlertTriangle,
  MessageSquare
} from "lucide-react";
import FlickeringGrid from "./FlickeringGrid";
import DecryptedText from "./DecryptedText";

const socket = io("http://localhost:2000");

export default function Debater({ speakerId: initialSpeakerId }) {
  const recognitionRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const transcriptRef = useRef(null);

  /* ================= STATE ================= */
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [accumulatedText, setAccumulatedText] = useState("");

  const [topic, setTopic] = useState("Waiting for topic...");
  const [selectedSpeaker, setSelectedSpeaker] = useState(
    initialSpeakerId || null
  );
  const [currentSpeaker, setCurrentSpeaker] = useState(null);

  const [canSend, setCanSend] = useState(true);
  const [cooldown, setCooldown] = useState(0);

  const [allStatements, setAllStatements] = useState([]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [liveText, accumulatedText]);

  /* ================= SEND ================= */
  const sendTranscript = () => {
    if (!accumulatedText.trim() || !canSend) return;

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

  /* ================= SPEECH ================= */
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

  /* ================= SOCKET ================= */
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
          setCooldown(c => {
            if (c <= 1) {
              clearInterval(timer);
              setCanSend(true);
              return 0;
            }
            return c - 1;
          });
        }, 1000);
        return;
      }

      setAllStatements(prev => [
        {
          speakerId: data.speakerId,
          text: data.claim,
          timestamp: data.timestamp
        },
        ...prev
      ]);
    });

    return () => {
      socket.off("TOPIC_UPDATE");
      socket.off("SPEAKER_UPDATE");
      socket.off("FACT_RESULT");
    };
  }, []);

  /* ================= MIC ================= */
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

  /* ================= LOGIN ================= */
  if (!selectedSpeaker) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-[#00171F] text-white">
        <FlickeringGrid className="absolute inset-0" />

        <div className="z-10 rounded-3xl bg-[#00171F]/80 backdrop-blur-xl border border-white/10 p-12 text-center">
          <h1 className="text-5xl font-extrabold mb-8 flex items-center justify-center gap-3">
            <Mic size={40} /> Select Debater
          </h1>

          <div className="flex gap-8 justify-center">
            <button
              onClick={() => setSelectedSpeaker("Debater A")}
              className="px-10 py-5 rounded-2xl font-bold bg-[#003459] flex items-center gap-3"
            >
              <User /> Debater A
            </button>

            <button
              onClick={() => setSelectedSpeaker("Debater B")}
              className="px-10 py-5 rounded-2xl font-bold bg-[#003459] flex items-center gap-3"
            >
              <User /> Debater B
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ================= MAIN UI ================= */
  return (
    <div className="relative min-h-screen bg-[#00171F] text-white overflow-hidden">
      <FlickeringGrid className="absolute inset-0" />

      {/* 🧠 TOPIC CARD */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-[#00171F]/90 backdrop-blur-xl border border-[#003459]/50 rounded-2xl px-8 py-4 shadow-xl min-w-[320px] text-center">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-wider text-white/60 mb-1">
            <MessageSquare size={14} /> Current Topic
          </div>
          <div className="text-lg font-semibold">{topic}</div>
        </div>
      </div>

      {/* 🎤 CENTER STAGE */}
      <div className="fixed inset-0 flex flex-col items-center justify-center z-10 -translate-y-12">
        <div
          ref={transcriptRef}
          className="max-w-5xl max-h-72 overflow-y-auto text-center text-3xl leading-relaxed px-10 mb-8"
        >
          {accumulatedText && (
            <DecryptedText text={accumulatedText} animateOn="view" />
          )}
          {liveText && <span className="opacity-70 ml-1">{liveText}</span>}
        </div>

        {accumulatedText && !listening && (
          <button
            onClick={sendTranscript}
            disabled={!canSend}
            className="mb-6 px-8 py-3 rounded-full text-lg font-semibold bg-[#003459]"
          >
            Send Now
          </button>
        )}

        <button
          onClick={toggleMic}
          disabled={isMicLocked}
          className={`w-32 h-32 rounded-full flex items-center justify-center transition
            ${
              listening
                ? "bg-red-600 shadow-[0_0_60px_rgba(255,255,255,0.5)]"
                : "bg-[#003459] shadow-[0_0_60px_rgba(0,52,89,0.9)]"
            }
            ${isMicLocked ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          {isMicLocked ? (
            <Lock size={42} />
          ) : listening ? (
            <Square size={42} />
          ) : (
            <Mic size={42} />
          )}
        </button>

        {!canSend && (
          <div className="mt-4 text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle size={16} />
            Rate limited — wait {cooldown}s
          </div>
        )}
      </div>

      {/* 📝 LAST STATEMENTS */}
      {allStatements.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl z-20">
          <div className="space-y-4 max-h-56 overflow-y-auto">
            {allStatements.slice(0, 5).map((s, i) => (
              <div
                key={i}
                className={`p-5 rounded-2xl backdrop-blur-xl border
                  ${
                    s.speakerId === selectedSpeaker
                      ? "bg-[#003459]/70 border-blue-400/40"
                      : "bg-[#00171F]/80 border-pink-400/40"
                  }
                `}
              >
                <div className="flex justify-between opacity-80 mb-2">
                  <span className="font-semibold flex items-center gap-2">
                    <User size={14} /> {s.speakerId}
                  </span>
                  <span className="text-xs">
                    {new Date(s.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div>{s.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
