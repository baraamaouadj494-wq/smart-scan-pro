import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  useGetDocument,
  useGetChatHistory,
  useChatWithDocument,
  getGetChatHistoryQueryKey,
  getGetDocumentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Send, Loader2, Bot, User, FileText,
  Copy, Download, Trash2, Check, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  invoice:  ["What is the total amount?", "Who is the vendor?", "What is the due date?", "List all line items"],
  receipt:  ["What was purchased?", "What is the total?", "When was this purchase?", "What payment method was used?"],
  contract: ["What are the key obligations?", "What is the contract duration?", "Are there any penalties?", "Who are the parties involved?"],
  report:   ["What are the main findings?", "What are the recommendations?", "What data sources were used?", "Summarize the conclusions"],
  letter:   ["What is the main purpose?", "Who is the sender?", "What action is requested?", "What is the tone?"],
  academic: ["What is the thesis?", "What methodology was used?", "What are the conclusions?", "List key references"],
  form:     ["What information is required?", "What is this form for?", "What fields are mandatory?"],
  other:    ["Summarize this document", "What are the key points?", "What type of document is this?", "Extract important dates"],
  ar:       ["لخص هذه الوثيقة", "ما هي النقاط الرئيسية؟", "ما نوع هذا المستند؟", "استخرج التواريخ المهمة"],
};

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const docId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [message, setMessage] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: doc } = useGetDocument(docId, {
    query: { enabled: !!docId, queryKey: getGetDocumentQueryKey(docId) },
  });

  const { data: history, isLoading: historyLoading } = useGetChatHistory(docId, {
    query: { enabled: !!docId, queryKey: getGetChatHistoryQueryKey(docId) },
  });

  const chatMutation = useChatWithDocument();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, chatMutation.isPending]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || chatMutation.isPending) return;
    setMessage("");
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const lang = isArabic ? ("ar" as const) : ("en" as const);
    try {
      await chatMutation.mutateAsync({ id: docId, data: { message: text, language: lang } });
      queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(docId) });
    } catch {
      setMessage(text);
      toast({ title: "Failed to send message", variant: "destructive" });
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(message); }
  };

  const handleCopyMessage = async (content: string, msgId: number) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = async () => {
    try {
      await fetch(`/api/documents/${docId}/chat/history`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(docId) });
      toast({ title: "Chat history cleared" });
    } catch {
      toast({ title: "Failed to clear history", variant: "destructive" });
    }
  };

  const handleExportChat = () => {
    if (!history?.length) return;
    const lines = history.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join("\n\n---\n\n");
    const content = `DocScanner AI — Chat with "${doc?.title}"\n${"=".repeat(50)}\n\n${lines}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${doc?.title?.replace(/\s+/g, "_") ?? "document"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const suggestedQuestions = (() => {
    if (doc?.language === "ar") return SUGGESTED_QUESTIONS.ar;
    const type = doc?.docType ?? "other";
    return SUGGESTED_QUESTIONS[type] ?? SUGGESTED_QUESTIONS.other;
  })();

  const isEmpty = !history?.length && !chatMutation.isPending;

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/95 backdrop-blur shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/documents/${docId}`}>
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm">Document AI</h1>
            {doc && (
              <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[180px]">{doc.title}</span>
              </span>
            )}
          </div>
        </div>
        {history && history.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleExportChat} className="gap-1.5 text-xs h-8">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearHistory} className="gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </Button>
          </div>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 bg-muted/5">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-center mb-2">Ask AI about this document</h2>
            <p className="text-muted-foreground text-sm text-center mb-8">
              The AI has read the full document and can answer questions, extract data, find dates, and more.
            </p>

            {/* Suggested Questions */}
            <div className="w-full space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Suggested Questions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="flex items-start gap-2.5 p-3 rounded-xl text-left bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm group"
                    dir="auto"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0 group-hover:animate-pulse" />
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {history?.map((msg) => (
              <div key={msg.id} className={`flex gap-3 group ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border border-border"}`}>
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div className={`max-w-[80%] md:max-w-[70%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div
                    className={`px-4 py-3 rounded-2xl shadow-sm ${msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-card border border-border text-foreground rounded-tl-sm"
                    }`}
                    dir="auto"
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  </div>

                  {/* Copy button */}
                  <button
                    onClick={() => handleCopyMessage(msg.content, msg.id)}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-all px-2 py-0.5 rounded-md hover:bg-muted"
                  >
                    {copiedId === msg.id ? (
                      <><Check className="w-3 h-3 text-green-500" /> Copied</>
                    ) : (
                      <><Copy className="w-3 h-3" /> Copy</>
                    )}
                  </button>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-5 py-3.5 rounded-2xl bg-card border border-border rounded-tl-sm shadow-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary/70 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary/70 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-primary/70 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {/* Quick suggestions after messages */}
            {history && history.length > 0 && !chatMutation.isPending && (
              <div className="flex flex-wrap gap-2 pt-2">
                {suggestedQuestions.slice(0, 3).map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="px-3 py-1.5 rounded-full text-xs bg-muted/60 border border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all"
                    dir="auto"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Input */}
      <div className="p-4 bg-card/95 border-t border-border shrink-0 backdrop-blur">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex gap-2 items-end">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about this document..."
              disabled={chatMutation.isPending || historyLoading}
              className="flex-1 bg-muted/50 border-border focus-visible:ring-primary rounded-2xl px-5 pr-12 py-3 h-12"
              dir="auto"
            />
            {message && (
              <button type="button" onClick={() => setMessage("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!message.trim() || chatMutation.isPending}
            className="rounded-2xl w-12 h-12 shrink-0 shadow-md shadow-primary/20"
          >
            {chatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
        <p className="text-center text-[10px] text-muted-foreground mt-2">Press Enter to send • Arabic & English supported</p>
      </div>
    </div>
  );
}
