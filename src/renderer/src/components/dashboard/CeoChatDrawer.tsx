import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  Crown, 
  MessageSquare, 
  X, 
  Sparkles 
} from 'lucide-react';
import { Message } from '@shared/types';

interface CeoChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  ceoModel: string;
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  isRunning: boolean;
}

export const CeoChatDrawer: React.FC<CeoChatDrawerProps> = ({
  isOpen,
  onClose,
  companyName,
  ceoModel,
  messages,
  onSendMessage,
  isRunning,
}) => {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    try {
      await onSendMessage(text);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-dark-850 border-l border-slate-700/80 shadow-2xl flex flex-col select-none relative z-10">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Crown className="w-4 h-4 text-amber-200" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              Chat with CEO
              {isRunning && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Active Run" />
              )}
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">{companyName} • {ceoModel}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Instructions Banner */}
      <div className="px-4 py-2 bg-indigo-950/30 border-b border-indigo-900/30 flex items-center space-x-2 text-[11px] text-indigo-300">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>Chime in anytime to redirect priorities or give steering guidance.</span>
      </div>

      {/* Messages Feed */}
      <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2 text-slate-500">
            <MessageSquare className="w-8 h-8 text-slate-600" />
            <p className="text-xs">No direct messages yet.</p>
            <p className="text-[11px]">Send a note to the CEO to adjust strategy or request quick updates.</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id || i}
                className={`flex items-start space-x-2 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gradient-to-tr from-amber-500 to-indigo-600 text-white'
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5 text-amber-200" />}
                </div>

                <div
                  className={`max-w-[80%] rounded-xl p-2.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-900 border border-slate-800 text-slate-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className="block text-[9px] text-slate-400 mt-1 text-right">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {sending && (
          <div className="flex items-start space-x-2 animate-fade-in">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center shrink-0">
              <Crown className="w-3.5 h-3.5 text-amber-200" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 flex items-center space-x-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
              <span className="text-[11px] text-slate-400 ml-1.5 font-medium">CEO is responding...</span>
            </div>
          </div>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Instruct or ask the CEO..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-dark-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
        </div>
      </div>
    </div>
  );
};
