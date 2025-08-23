"use client";

import {
  ChatBubbleLeftIcon,
  PaperAirplaneIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/ClientConstants";
import { Database } from "@/lib/types/supabase";
import Loader from "@/components/dashboard/Loader";
import { useUser } from "@/hooks/useUser";
import {
  Tldraw,
  Editor,
  TLStoreSnapshot,
  TLSessionStateSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

export default function CanvasPage() {
  const { user, userIsLoading } = useUser();
  const params = useParams<{ canvas_id: string }>();
  const canvasId = params?.canvas_id;
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Welcome to the canvas! Draw a UI mockup and click 'Make Real' to convert it to working code.",
      sender: "assistant",
      timestamp: new Date(),
    },
  ]);
  const [newMessage, setNewMessage] = useState("");
  const [currentEmbedUrl, setCurrentEmbedUrl] = useState("https://google.com");
  const [canvasDocument, setCanvasDocument] = useState<
    Database["public"]["Tables"]["canvas_documents"]["Row"] | null
  >(null);
  const editor = useRef<Editor | null>(null);
  const [loadedFromDB, setLoadedFromDB] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<
    Database["public"]["Tables"]["canvas_sessions"]["Row"] | null
  >(null);

  useEffect(() => {
    async function fetchCanvasDocument() {
      const { data, error } = await supabase
        .from("canvas_documents")
        .select("*")
        .eq("canvas_id", canvasId)
        .single();
      if (error) {
        console.error("Error fetching canvas document:", error);
        return;
      }
      setCanvasDocument(data);
      console.log("Fetched canvas document: ", data);
    }
    async function fetchSession() {
      const { data, error } = await supabase
        .from("canvas_sessions")
        .select("*")
        .eq("canvas_id", canvasId)
        .eq("user_id", user?.id)
        .maybeSingle();
      if (error) {
        console.error("Error fetching canvas session:", error);
        return;
      }
      setSessionInfo(data);
      console.log("Fetched canvas session: ", data);
    }

    if (canvasId && user?.id) {
      // fetchCanvas();
      fetchCanvasDocument();
      fetchSession();
    }
  }, [canvasId, user, setSessionInfo, setCanvasDocument]);

  useEffect(() => {
    if (
      !(
        editor.current &&
        canvasDocument?.document_data != null &&
        !loadedFromDB &&
        sessionInfo != null
      )
    ) {
      return;
    }
    const documentData =
      canvasDocument.document_data as unknown as TLStoreSnapshot;
    const sessionData =
      sessionInfo.session_data as unknown as TLSessionStateSnapshot;
    // Ensure the data has the correct structure for a TLStoreSnapshot
    const snapshot = {
      document: documentData,
      session: sessionData,
    };

    try {
      editor.current.loadSnapshot(snapshot);
      setLoadedFromDB(true);
      console.log("Successfully loaded snapshot from database");
    } catch (loadError) {
      console.error("Error calling loadSnapshot:", loadError);
    }
  }, [editor, canvasDocument, sessionInfo, loadedFromDB]);

  // ------------------ Persistence functions -----------------------------------------------------------
  const saveCanvasDocument = useCallback(async () => {
    console.log("Saving canvas document");
    if (!editor.current || !canvasId) return;
    console.log("Saving canvas document 2");
    const snapshot = editor.current.getSnapshot();
    console.log("Snapshot:", snapshot);

    // save document to db
    const { error: documentUploadError } = await supabase
      .from("canvas_documents")
      .update({
        document_data: snapshot.document,
        updated_at: new Date().toISOString(),
      })
      .eq("canvas_id", canvasId)
      .eq("id", canvasDocument?.id);
    if (documentUploadError) {
      console.error("Error updating canvas document:", documentUploadError);
    } else {
      console.log("Canvas document updated successfully");
    }

    if (user != null) {
      const { error: sessionUploadError } = await supabase
        .from("canvas_sessions")
        .upsert(
          {
            canvas_id: canvasId,
            user_id: user.id,
            session_data: snapshot.session,
            last_accessed: new Date().toISOString(),
          },
          {
            onConflict: "canvas_id,user_id",
            ignoreDuplicates: false,
          },
        );
      if (sessionUploadError) {
        console.error("Error updating canvas document:", sessionUploadError);
      } else {
        console.log("Canvas document updated successfully");
      }
    }
  }, [canvasId, editor, canvasDocument, user]);

  const saveCanvasThumbnail = useCallback(async () => {
    if (!editor.current || !canvasId) return;
    const ids = Array.from(editor.current.getCurrentPageShapeIds());
    const image = await editor.current.toImage(ids, {
      format: "png",
      quality: 1,
    });

    const fileName = `${canvasId}.png`;
    const { error: uploadError } = await supabase.storage
      .from("canvas-thumbnails")
      .upload(fileName, image.blob, {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) {
      console.error("Error uploading thumbnail:", uploadError);
      return;
    }

    const { data } = supabase.storage
      .from("canvas-thumbnails")
      .getPublicUrl(fileName);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) return;

    const { error: updateError } = await supabase
      .from("canvases")
      .update({ thumbnail_url: publicUrl })
      .eq("id", canvasId);
    if (updateError) {
      console.error("Error updating thumbnail url:", updateError);
    }
  }, [canvasId, editor]);

  // Auto-save setup with proper debouncing
  useEffect(() => {
    if (!editor.current) return;

    let documentTimeout: NodeJS.Timeout;
    let thumbnailTimeout: NodeJS.Timeout;

    const debouncedSave = () => {
      clearTimeout(documentTimeout);
      documentTimeout = setTimeout(() => {
        saveCanvasDocument();
      }, 1000);

      clearTimeout(thumbnailTimeout);
      thumbnailTimeout = setTimeout(() => {
        saveCanvasThumbnail();
      }, 5000);
    };

    const cleanup = editor.current.store.listen(
      () => {
        debouncedSave();
      },
      { scope: "document" },
    );

    return () => {
      clearTimeout(documentTimeout);
      clearTimeout(thumbnailTimeout);
      cleanup();
    };
  }, [saveCanvasDocument, saveCanvasThumbnail, editor]);

  // ----------------- MESSAGE HANDLING -----------------------------------------------------------
  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      text: newMessage,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setNewMessage("");

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage = {
        id: messages.length + 2,
        text: "I see you're working on something interesting! How can I help you with your design?",
        sender: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }, 1000);
  };

  if (!canvasId || userIsLoading) {
    return <Loader />;
  }

  return (
    <div className="h-screen bg-black flex flex-col">
      <div className="flex-1 flex relative">
        {/* Main Canvas Area */}
        <div
          className={`flex-1 transition-all duration-500 ease-out ${isChatOpen ? "mr-96" : "mr-0"}`}
        >
          <div className="h-full w-full">
            <Tldraw
              onMount={(e: Editor) => {
                editor.current = e;
              }}
              inferDarkMode={true}
            />
          </div>
        </div>

        {/* Chat Window */}
        <div
          className={`fixed right-0 top-0 transition-all duration-500 ease-out ${isChatOpen ? "w-96 translate-x-0" : "w-96 translate-x-full"}`}
          style={{ height: "calc(100vh)" }}
        >
          {/* Ultra Dark Glassmorphism Background */}
          <div className="h-full relative bg-gradient-to-b from-white/95 via-gray-50/90 to-white/95 dark:from-black/95 dark:via-slate-900/95 dark:to-black/95 backdrop-blur-xl border-l border-black/10 dark:border-slate-700/40 shadow-2xl dark:shadow-black/80 flex flex-col">
            {/* Dark Mode Animated Background Pattern */}
            <div className="absolute inset-0 opacity-5 dark:opacity-30">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 animate-pulse"></div>
            </div>

            {/* Enhanced Dark Mode Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5 dark:to-purple-900/20 pointer-events-none"></div>

            {/* Additional Dark Mode Depth Layer */}
            <div className="absolute inset-0 dark:bg-gradient-to-br dark:from-slate-900/50 dark:via-transparent dark:to-slate-800/50 pointer-events-none"></div>

            {/* Ultra Dark Chat Header */}
            <div className="relative flex-shrink-0 p-6 border-b border-black/10 dark:border-slate-600/50 bg-gradient-to-r from-white/80 to-gray-50/80 dark:from-slate-800/90 dark:to-slate-900/90 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 shadow-lg shadow-blue-500/25 dark:shadow-blue-600/60 ring-1 ring-white/20 dark:ring-blue-400/30">
                    <SparklesIcon className="w-5 h-5 text-white drop-shadow-sm" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-slate-100 drop-shadow-sm">
                      Canvas Assistant
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-slate-300 font-medium">
                      AI-powered design companion ✨
                    </p>
                  </div>
                </div>

                {/* Ultra Dark Close Button */}
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="p-2.5 rounded-xl transition-all duration-300 hover:scale-110 hover:rotate-90 text-gray-600 hover:text-gray-900 hover:bg-black/10 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-700/50 ring-1 ring-transparent hover:ring-black/10 dark:hover:ring-slate-500/50"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Ultra Dark URL Control Section */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-black/5 to-black/10 dark:from-slate-800/80 dark:to-slate-900/80 border border-black/10 dark:border-slate-600/40 shadow-inner backdrop-blur-sm">
                <label className="flex items-center gap-2 text-sm font-semibold mb-4 text-gray-700 dark:text-slate-200">
                  <span className="text-base">🌐</span>
                  Embed URL
                  <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 rounded-full animate-pulse"></div>
                </label>
                <div className="space-y-3">
                  <input
                    type="url"
                    value={currentEmbedUrl}
                    onChange={(e) => setCurrentEmbedUrl(e.target.value)}
                    placeholder="https://google.com"
                    className="w-full px-4 py-3 rounded-xl text-sm transition-all duration-300 focus:scale-[1.02] bg-white/90 dark:bg-slate-800/90 text-gray-900 dark:text-slate-100 border border-black/20 dark:border-slate-600/50 focus:border-blue-500 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-slate-700/90 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:focus:ring-blue-400/50 shadow-sm hover:shadow-md dark:shadow-lg font-mono"
                  />
                  <button
                    onClick={() => {
                      setMessages((prev) => [
                        ...prev,
                        {
                          id: prev.length + 1,
                          text: `✨ URL updated to: ${currentEmbedUrl}. To add this to canvas, use the embed tool and paste this URL.`,
                          sender: "assistant",
                          timestamp: new Date(),
                        },
                      ]);
                    }}
                    className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 dark:hover:from-blue-700 dark:hover:via-purple-700 dark:hover:to-pink-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/30 dark:hover:shadow-blue-600/60 transform-gpu"
                  >
                    <span className="flex items-center justify-center gap-2">
                      Update & Notify
                      <SparklesIcon className="w-4 h-4" />
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Ultra Dark Messages Area */}
            <div
              className="flex-1 p-6 space-y-4 overflow-y-auto scrollbar-thin scrollbar-track-black/5 scrollbar-thumb-black/20 hover:scrollbar-thumb-black/30 dark:scrollbar-track-slate-800/50 dark:scrollbar-thumb-slate-600/50 dark:hover:scrollbar-thumb-slate-500/70"
              style={{ minHeight: 0 }}
            >
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 fade-in duration-500`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div
                    className={`max-w-[85%] group ${message.sender === "user" ? "mr-2" : "ml-2"}`}
                  >
                    {/* Ultra Dark Message Bubble */}
                    <div
                      className={`p-4 rounded-2xl relative transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
                        message.sender === "user"
                          ? "bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 dark:from-blue-600 dark:via-purple-600 dark:to-blue-700 text-white shadow-lg shadow-blue-500/25 dark:shadow-blue-600/50 ring-1 ring-white/20 dark:ring-blue-400/30"
                          : "bg-white/90 dark:bg-slate-800/95 text-gray-900 dark:text-slate-100 border border-black/10 dark:border-slate-600/50 backdrop-blur-sm shadow-sm dark:shadow-lg hover:bg-white dark:hover:bg-slate-700/95"
                      }`}
                    >
                      {/* Message bubble tail */}
                      <div
                        className={`absolute w-3 h-3 transform rotate-45 ${
                          message.sender === "user"
                            ? "-right-1 top-4 bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700"
                            : "-left-1 top-4 bg-white/90 dark:bg-slate-800/95 border-l border-t border-black/10 dark:border-slate-600/50"
                        }`}
                      ></div>

                      {/* Enhanced inner glow for user messages */}
                      {message.sender === "user" && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 to-transparent dark:from-white/5 dark:to-blue-900/20 pointer-events-none"></div>
                      )}

                      <p className="text-sm leading-relaxed relative z-10">
                        {message.text}
                      </p>
                      <p
                        className={`text-xs mt-2 font-medium relative z-10 ${
                          message.sender === "user"
                            ? "text-white/80 dark:text-white/70"
                            : "text-gray-500 dark:text-slate-400"
                        }`}
                      >
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Ultra Dark Message Input */}
            <div className="relative flex-shrink-0 p-6 border-t border-black/10 dark:border-slate-600/50 bg-gradient-to-br from-white/70 via-gray-50/60 to-white/70 dark:from-slate-900/90 dark:via-black/80 dark:to-slate-900/90 backdrop-blur-lg">
              {/* Enhanced dark mode animated background pattern */}
              <div className="absolute inset-0 opacity-20 dark:opacity-40 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 dark:from-blue-600/20 dark:via-purple-600/20 dark:to-pink-600/20 animate-pulse"></div>
              </div>

              <div className="relative flex gap-4 items-end">
                {/* Ultra Dark Input Container */}
                <div className="flex-1 relative group">
                  {/* Enhanced dark mode input background blur effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-white/60 to-gray-100/60 dark:from-slate-700/40 dark:to-slate-800/60 rounded-2xl blur-sm transform scale-105 opacity-0 group-hover:opacity-100 transition-all duration-500"></div>

                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Ask about your design... ✨"
                    className="relative w-full px-5 py-4 pr-14 rounded-2xl text-sm font-medium transition-all duration-500 focus:scale-[1.02] transform-gpu bg-white/95 dark:bg-slate-800/95 text-gray-900 dark:text-slate-100 border-2 border-black/10 dark:border-slate-600/60 focus:border-blue-500/70 dark:focus:border-blue-400/70 focus:bg-white dark:focus:bg-slate-700/95 placeholder-gray-500 dark:placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-blue-400/50 shadow-lg dark:shadow-2xl hover:shadow-xl dark:hover:shadow-slate-900/50 backdrop-blur-xl hover:border-blue-500/30 dark:hover:border-blue-400/50"
                  />

                  {/* Enhanced dark mode input decoration with glow */}
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 transition-all duration-300 group-hover:scale-110">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 rounded-full blur-sm opacity-0 group-hover:opacity-50 dark:group-hover:opacity-70 transition-opacity duration-300"></div>
                      <SparklesIcon className="relative w-5 h-5 text-gray-400 dark:text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-300" />
                    </div>
                  </div>
                </div>

                {/* Ultra Dark Enhanced Send Button */}
                <div className="relative">
                  {newMessage.trim() && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 rounded-2xl blur-lg opacity-60 dark:opacity-80 animate-pulse"></div>
                  )}

                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className={`relative p-4 rounded-2xl transition-all duration-500 hover:scale-110 active:scale-95 focus:scale-110 transform-gpu ${
                      newMessage.trim()
                        ? "bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 dark:from-blue-600 dark:via-purple-600 dark:to-blue-700 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:via-purple-700 dark:hover:to-blue-800 text-white shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 dark:shadow-blue-600/60 dark:hover:shadow-blue-600/80 ring-2 ring-white/20 dark:ring-blue-400/30 hover:ring-white/30 dark:hover:ring-blue-400/50"
                        : "bg-gradient-to-br from-black/5 to-black/10 dark:from-slate-800/50 dark:to-slate-900/50 text-gray-400 dark:text-slate-500 cursor-not-allowed shadow-inner border border-black/10 dark:border-slate-600/30"
                    }`}
                  >
                    {/* Enhanced dark mode button inner glow */}
                    {newMessage.trim() && (
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent dark:from-white/10 dark:to-blue-900/20 pointer-events-none"></div>
                    )}

                    <PaperAirplaneIcon
                      className={`relative w-6 h-6 transition-transform duration-300 ${
                        newMessage.trim()
                          ? "hover:translate-x-0.5 hover:-translate-y-0.5"
                          : ""
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Enhanced dark mode typing indicator placeholder */}
              <div className="absolute bottom-1 left-6 text-xs text-gray-500 dark:text-slate-500 font-medium opacity-0 transition-opacity duration-300">
                {/* AI is typing... */}
              </div>
            </div>
          </div>
        </div>

        {/* Chat Toggle Button (when closed) - Ultra Enhanced Floating Button */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="fixed right-8 bottom-8 group z-50 animate-bounce hover:animate-none transition-all duration-500"
          >
            {/* Multi-layered Button Container */}
            <div className="relative">
              {/* Outer glowing ring with dark mode support */}
              <div className="absolute -inset-3 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 rounded-full blur-2xl opacity-60 dark:opacity-80 group-hover:opacity-100 animate-pulse group-hover:animate-none transition-all duration-500"></div>

              {/* Middle ring for extra glow */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-500 dark:via-purple-500 dark:to-pink-500 rounded-full blur-md opacity-40 dark:opacity-60 group-hover:opacity-80 transition-all duration-500"></div>

              {/* Main Button Body with enhanced dark mode */}
              <div className="relative bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 dark:from-blue-600 dark:via-purple-600 dark:to-blue-700 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:via-purple-700 dark:hover:to-blue-800 text-white p-5 rounded-full shadow-2xl dark:shadow-black/50 transition-all duration-500 group-hover:scale-110 group-hover:shadow-blue-500/60 dark:group-hover:shadow-blue-400/60 ring-2 ring-white/20 dark:ring-white/10 group-hover:ring-white/40 dark:group-hover:ring-white/20 transform-gpu">
                {/* Inner gradient overlay for depth */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-transparent to-black/10 dark:from-white/10 dark:to-black/20 pointer-events-none"></div>

                <ChatBubbleLeftIcon className="relative w-8 h-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />

                {/* Enhanced notification badge with dark mode */}
                <div className="absolute -top-2 -right-2 group">
                  {/* Badge glow */}
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-red-500 dark:from-pink-400 dark:to-red-400 rounded-full blur-sm opacity-60 animate-pulse"></div>

                  {/* Badge body */}
                  <div className="relative w-5 h-5 bg-gradient-to-r from-pink-500 to-red-500 dark:from-pink-400 dark:to-red-400 rounded-full flex items-center justify-center ring-2 ring-white/30 dark:ring-white/20 shadow-lg">
                    <SparklesIcon className="w-3 h-3 text-white animate-spin" />
                  </div>
                </div>

                {/* Floating sparkles animation */}
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute top-1 right-3 w-1 h-1 bg-white/60 rounded-full animate-ping"
                    style={{ animationDelay: "0s" }}
                  ></div>
                  <div
                    className="absolute top-3 left-2 w-1 h-1 bg-white/40 rounded-full animate-ping"
                    style={{ animationDelay: "0.5s" }}
                  ></div>
                  <div
                    className="absolute bottom-2 right-1 w-1 h-1 bg-white/50 rounded-full animate-ping"
                    style={{ animationDelay: "1s" }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Enhanced Tooltip with superior dark mode */}
            <div className="absolute right-full mr-4 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none scale-95 group-hover:scale-100">
              <div className="relative">
                {/* Tooltip glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 dark:from-blue-400/30 dark:to-purple-400/30 rounded-xl blur-md"></div>

                {/* Tooltip body */}
                <div className="relative px-4 py-3 rounded-xl text-sm font-semibold whitespace-nowrap bg-white/95 dark:bg-gray-900/95 text-gray-900 dark:text-white border border-black/10 dark:border-white/20 backdrop-blur-xl shadow-2xl dark:shadow-black/50">
                  <div className="flex items-center gap-2">
                    <span>Open Canvas Assistant</span>
                    <SparklesIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  </div>

                  {/* Tooltip arrow */}
                  <div className="absolute left-full top-1/2 transform -translate-y-1/2">
                    <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[8px] border-t-transparent border-b-transparent border-l-white/95 dark:border-l-gray-900/95"></div>
                    <div className="absolute top-0 left-0 w-0 h-0 border-t-[7px] border-b-[7px] border-l-[7px] border-t-transparent border-b-transparent border-l-black/10 dark:border-l-white/20 transform translate-x-px"></div>
                  </div>
                </div>
              </div>

              {/* Floating hint text */}
              <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 text-xs text-gray-600 dark:text-gray-400 font-medium opacity-0 group-hover:opacity-70 transition-opacity duration-700 delay-300">
                Click to chat ✨
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
