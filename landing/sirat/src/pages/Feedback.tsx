import { useState } from 'react';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Send, ThumbsUp, Star } from 'lucide-react';

interface FeedbackItem {
  id: string;
  author: string;
  category: string;
  message: string;
  votes: number;
  timestamp: number;
}

const CATEGORIES = [
  'Feature Request',
  'Bug Report',
  'UI/Design',
  'Content',
  'General',
];

export function Feedback() {
  const { user } = useAuth();
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>(() => {
    const stored = localStorage.getItem('sirat-feedback');
    return stored ? JSON.parse(stored) : [];
  });
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('Feature Request');
  const [submitted, setSubmitted] = useState(false);

  const saveFeedback = (list: FeedbackItem[]) => {
    localStorage.setItem('sirat-feedback', JSON.stringify(list));
    setFeedbackList(list);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const newItem: FeedbackItem = {
      id: Date.now().toString(),
      author: user?.displayName || 'Anonymous',
      category,
      message: message.trim(),
      votes: 0,
      timestamp: Date.now(),
    };

    saveFeedback([newItem, ...feedbackList]);
    setMessage('');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleVote = (id: string) => {
    const updated = feedbackList.map((item) =>
      item.id === id ? { ...item, votes: item.votes + 1 } : item
    );
    saveFeedback(updated);
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="min-h-screen bg-charcoal pb-20">
      <div className="px-5 pt-12">
        <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <MessageSquare size={24} className="text-gold" />
          Feedback
        </h1>
        <p className="text-white text-sm mb-6">
          Suggest features or improvements for the community
        </p>

        <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 mb-6">
          <div className="mb-4">
            <label className="text-white text-xs font-medium block mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    category === cat
                      ? 'bg-gold/20 text-gold border border-gold/40'
                      : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="text-white text-xs font-medium block mb-2">Your Suggestion</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What would you like to see improved or added?"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm
                         placeholder:text-white/90 focus:outline-none focus:border-gold/50 resize-none"
              rows={4}
            />
          </div>

          <button
            type="submit"
            disabled={!message.trim()}
            className="w-full bg-gold/20 border border-gold/40 text-gold font-medium py-3 rounded-xl
                       flex items-center justify-center gap-2 hover:bg-gold/30 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} />
            Submit Feedback
          </button>

          {submitted && (
            <p className="text-green-400 text-sm text-center mt-3 flex items-center justify-center gap-1">
              <Star size={14} />
              Thank you for your feedback!
            </p>
          )}
        </form>

        {feedbackList.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-sm mb-3">
              Community Suggestions ({feedbackList.length})
            </h2>
            <div className="space-y-3">
              {feedbackList.map((item) => (
                <div
                  key={item.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-gold/10 text-gold font-medium">
                          {item.category}
                        </span>
                        <span className="text-white text-xs">{formatTime(item.timestamp)}</span>
                      </div>
                      <p className="text-white text-sm leading-relaxed">{item.message}</p>
                      <p className="text-white text-xs mt-2">— {item.author}</p>
                    </div>
                    <button
                      onClick={() => handleVote(item.id)}
                      className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg
                                 bg-white/5 hover:bg-gold/10 border border-white/10 hover:border-gold/30
                                 transition-colors flex-shrink-0"
                    >
                      <ThumbsUp size={14} className="text-white" />
                      <span className="text-white text-xs font-medium">{item.votes}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {feedbackList.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare size={40} className="text-white mx-auto mb-3" />
            <p className="text-white text-sm">No feedback yet. Be the first to suggest something!</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
