import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { 
  User, Post, UserRole, NetworkType, Transaction, SystemSettings 
} from './types';
import { mockDB } from './services/mockDb';
import { generateSamplePosts } from './services/geminiService';

// --- SQL Modal for Supabase Setup ---
const SupabaseSetup = ({ onClose }: { onClose: () => void }) => {
  const sql = `
-- ⚠️ WARNING: THIS RESETS YOUR PUBLIC TABLES ⚠️
-- Run this in Supabase SQL Editor

-- 1. Clean up old tables/triggers to start fresh
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user;
drop table if exists public.transactions;
drop table if exists public.posts;
drop table if exists public.profiles;

-- 2. Create Extensions
create extension if not exists "uuid-ossp";

-- 3. Create Profiles Table
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  role text default 'USER',
  balance numeric default 0,
  name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Create Posts Table
create table public.posts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id),
  content text,
  type text check (type in ('text', 'link')),
  views int default 0,
  sponsored boolean default false,
  likes int default 0,
  hearts int default 0,
  hahas int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Create Transactions Table
create table public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id),
  type text,
  amount numeric,
  network text,
  status text,
  tx_hash text,
  post_id uuid references public.posts(id),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 6. Enable Security (RLS)
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

alter table public.posts enable row level security;
create policy "Posts are viewable by everyone" on public.posts for select using (true);
create policy "Users can create posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Users can update own posts" on public.posts for update using (auth.uid() = user_id);

alter table public.transactions enable row level security;
create policy "Users view own txs" on public.transactions for select using (auth.uid() = user_id);
create policy "Users create txs" on public.transactions for insert with check (auth.uid() = user_id);

-- 7. SETUP AUTO-ADMIN TRIGGER
-- This automatically makes 'admin@admin.com' an ADMIN with $10,000 balance when they sign up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, balance, name, avatar_url)
  values (
    new.id,
    new.email,
    case when new.email = 'admin@admin.com' then 'ADMIN' else 'USER' end,
    case when new.email = 'admin@admin.com' then 10000 else 0 end,
    split_part(new.email, '@', 1),
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
  `;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl max-w-2xl w-full p-6 border border-red-500 shadow-2xl overflow-y-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold text-red-400 mb-2">⚠️ Database Setup</h2>
        <div className="mb-4 text-slate-300 text-sm space-y-2">
            <p>1. Copy the SQL code below.</p>
            <p>2. Run it in your Supabase SQL Editor to create tables and triggers.</p>
            <p className="text-yellow-400 font-bold bg-yellow-400/10 p-2 rounded border border-yellow-400/30">
               NOTE: If "admin@admin.com" already exists in Authentication, DELETE it first in Supabase Dashboard, then use "Create Account" here with password "666666".
            </p>
        </div>
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-700 mb-4 relative group">
           <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{sql}</pre>
           <button 
             onClick={() => navigator.clipboard.writeText(sql)}
             className="absolute top-2 right-2 bg-white text-black text-xs font-bold px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition"
           >
             Copy SQL
           </button>
        </div>
        <button onClick={onClose} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg">
          I Have Run the SQL (Reload App)
        </button>
      </div>
    </div>
  );
};

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-8">
          <div className="max-w-md bg-slate-800 p-6 rounded-xl border border-red-500/50">
            <h1 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h1>
            <p className="text-slate-400 text-sm mb-4">{this.state.error?.message}</p>
            <button onClick={() => window.location.reload()} className="bg-indigo-600 px-4 py-2 rounded text-sm font-bold">Reload Application</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Icons ---
const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${filled ? 'text-red-500' : ''}`}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
  </svg>
);
const ThumbUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75A2.25 2.25 0 0 1 16.5 4.5c0 1.152-.26 2.247-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
  </svg>
);
const FaceSmileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
  </svg>
);
const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.287.696.287 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-1.988 2.25 2.25 0 0 0-3.933 1.988Z" />
  </svg>
);
const ChartBarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
  </svg>
);

// --- Modals ---

const SponsorModal = ({ post, onClose, onConfirm, userBalance }: { post: Post, onClose: () => void, onConfirm: (amount: number) => void, userBalance: number }) => {
  const [amount, setAmount] = useState<string>('0.1');
  const [rate, setRate] = useState(0.1);

  useEffect(() => {
    mockDB.getSettings().then(s => setRate(s.adCostPer100kViews));
  }, []);

  const numAmount = parseFloat(amount) || 0;
  const estimatedViews = Math.floor((numAmount / rate) * 100000);
  const isValid = numAmount > 0 && numAmount <= userBalance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-2xl max-w-sm w-full p-6 border border-slate-700 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-2">Sponsor Post</h3>
        <p className="text-sm text-slate-400 mb-4">Boost your post visibility. Pay per view estimate.</p>
        
        <div className="bg-slate-900 p-4 rounded-lg mb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Budget (USDT)</span>
            <span>Balance: ${userBalance.toFixed(2)}</span>
          </div>
          <input 
            type="number" 
            step="0.1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none"
          />
        </div>

        <div className="mb-6 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
          <p className="text-xs text-indigo-300 uppercase font-semibold">Estimated Reach</p>
          <p className="text-2xl font-bold text-indigo-400">~{estimatedViews.toLocaleString()} <span className="text-sm font-normal text-indigo-300">views</span></p>
          <p className="text-[10px] text-slate-500 mt-1">Based on rate: ${rate} per 100k views</p>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-slate-400 hover:text-white font-medium">Cancel</button>
          <button 
            onClick={() => onConfirm(numAmount)} 
            disabled={!isValid}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition"
          >
            Pay ${numAmount}
          </button>
        </div>
      </div>
    </div>
  );
};

const EditUserModal = ({ user, onClose, onSave }: { user: User, onClose: () => void, onSave: (id: string, data: Partial<User>) => void }) => {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    password: user.password || '',
    balance: user.balance.toString()
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    onSave(user.id, {
      name: formData.name,
      email: formData.email,
      password: formData.password,
      balance: parseFloat(formData.balance) || 0
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 border border-slate-700 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-6">Edit User</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400">Display Name</label>
            <input value={formData.name} onChange={e => handleChange('name', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Email (Read Only)</label>
            <input value={formData.email} readOnly className="w-full bg-slate-900/50 border border-slate-700 rounded p-2 text-slate-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Balance (USDT)</label>
            <input type="number" value={formData.balance} onChange={e => handleChange('balance', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-2 text-slate-400 hover:text-white">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg">Save Changes</button>
        </div>
      </div>
    </div>
  );
};

// --- Components ---

const Navbar = ({ user, onLogout }: { user: User; onLogout: () => void }) => (
  <nav className="sticky top-0 z-40 w-full bg-slate-900/90 border-b border-slate-800 backdrop-blur-md">
    <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
      <Link to="/" className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">TextFlow</Link>
      <div className="flex items-center gap-4">
        {user.role === UserRole.ADMIN && (
          <Link to="/admin" className="text-sm font-medium text-slate-300 hover:text-white transition">Admin</Link>
        )}
        <Link to="/advertiser" title="Advertiser Dashboard" className="text-slate-400 hover:text-indigo-400 transition">
          <ChartBarIcon />
        </Link>
        <Link to="/wallet" className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700/50 hover:border-indigo-500/50 transition duration-300">
          <span className="text-xs text-slate-400 font-medium">USDT</span>
          <span className="text-sm font-bold text-green-400">${user.balance.toFixed(2)}</span>
        </Link>
        <Link to="/profile">
           <img 
            src={user.avatarUrl} 
            alt="Profile" 
            className="w-9 h-9 rounded-full border-2 border-slate-700 hover:border-indigo-500 transition object-cover" 
          />
        </Link>
        <button onClick={onLogout} className="text-sm text-slate-400 hover:text-red-400 ml-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
        </button>
      </div>
    </div>
  </nav>
);

const PostCard: React.FC<{ post: Post; onReact: (id: string, type: 'likes' | 'hearts' | 'hahas') => void }> = ({ post, onReact }) => {
  return (
    <div className={`relative bg-slate-800 rounded-2xl p-6 mb-5 border transition-all duration-300 ${post.sponsored ? 'border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.15)]' : 'border-slate-700/60 hover:border-slate-600'}`}>
      {post.sponsored && (
        <div className="absolute top-0 right-0 bg-indigo-600 text-[10px] font-bold text-white px-2 py-1 rounded-bl-lg rounded-tr-lg shadow-sm">
          SPONSORED
        </div>
      )}
      <div className="flex items-start gap-4">
        <img src={post.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.userEmail}`} className="w-12 h-12 rounded-full bg-slate-700 object-cover border border-slate-600" alt="Avatar" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-col">
              <h4 className="font-bold text-slate-100 text-sm truncate">{post.userEmail.split('@')[0]}</h4>
              <span className="text-xs text-slate-500">{new Date(post.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="mt-3 text-slate-200 text-base leading-relaxed break-words font-light">
            {post.type === 'link' ? (
               <a href={post.content} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 text-indigo-400 hover:text-indigo-300 transition group">
                 <span className="text-xl">🔗</span>
                 <span className="truncate underline decoration-indigo-500/30 group-hover:decoration-indigo-500">{post.content}</span>
               </a>
            ) : (
               <p>{post.content}</p>
            )}
          </div>
          
          <div className="mt-5 flex items-center justify-between pt-4 border-t border-slate-700/40">
            <div className="flex gap-6">
              <button onClick={() => onReact(post.id, 'likes')} className="flex items-center gap-1.5 text-slate-400 hover:text-blue-400 transition group">
                <ThumbUpIcon />
                <span className="text-xs font-semibold group-hover:text-blue-400">{post.likes}</span>
              </button>
              <button onClick={() => onReact(post.id, 'hearts')} className="flex items-center gap-1.5 text-slate-400 hover:text-red-500 transition group">
                <HeartIcon />
                <span className="text-xs font-semibold group-hover:text-red-500">{post.hearts}</span>
              </button>
              <button onClick={() => onReact(post.id, 'hahas')} className="flex items-center gap-1.5 text-slate-400 hover:text-yellow-400 transition group">
                <FaceSmileIcon />
                <span className="text-xs font-semibold group-hover:text-yellow-400">{post.hahas}</span>
              </button>
            </div>
            <div className="flex items-center gap-4">
               <span className="text-xs font-mono text-slate-500">{post.views.toLocaleString()} views</span>
               <button className="text-slate-400 hover:text-indigo-400 transition">
                 <ShareIcon />
               </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CreatePost = ({ onPost }: { onPost: () => void }) => {
  const [content, setContent] = useState('');
  const [isLink, setIsLink] = useState(false);
  const user = JSON.parse(localStorage.getItem('tf_current_user') || '{}');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
        await mockDB.createPost(user.id, content, isLink ? 'link' : 'text');
        setContent('');
        setIsLink(false);
        onPost();
    } catch (e:any) {
        alert("Failed to post: " + e.message);
    }
  };

  return (
    <div className="bg-slate-800 p-5 rounded-2xl mb-8 border border-slate-700 shadow-lg">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-4">
          <img src={user.avatarUrl} className="w-10 h-10 rounded-full object-cover border border-slate-600" alt="" />
          <div className="flex-1">
             <textarea 
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={isLink ? "Paste your link here..." : "What's on your mind?"}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-24 transition"
             />
             <div className="flex justify-between items-center mt-3">
                <div className="flex gap-2">
                   <button 
                    type="button" 
                    onClick={() => setIsLink(!isLink)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full transition ${isLink ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 bg-slate-700/50 hover:bg-slate-700'}`}
                   >
                     {isLink ? '🔗 Link Mode' : '📝 Text Mode'}
                   </button>
                </div>
                <button type="submit" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-bold px-6 py-2 rounded-full transition shadow-lg disabled:opacity-50 disabled:shadow-none" disabled={!content.trim()}>
                  Post
                </button>
             </div>
          </div>
        </div>
      </form>
    </div>
  );
};

// --- Pages ---

const Feed = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = async () => {
    try {
        const currentPosts = await mockDB.getFeed();
        setPosts(currentPosts);
    } catch (e) {
        console.error("Feed error", e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
    const interval = setInterval(async () => {
       // Live update view counts
       try {
        const fresh = await mockDB.getFeed();
        setPosts(fresh);
       } catch (e) {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleReact = async (id: string, type: 'likes' | 'hearts' | 'hahas') => {
    await mockDB.reactToPost(id, type);
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === id ? { ...p, [type]: p[type] + 1 } : p));
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <CreatePost onPost={loadFeed} />
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        posts.length === 0 ? (
            <div className="text-center py-10 text-slate-500">No posts yet. Be the first!</div>
        ) : (
            posts.map(post => <PostCard key={post.id} post={post} onReact={handleReact} />)
        )
      )}
    </div>
  );
};

const AdvertiserPanel = ({ user }: { user: User }) => {
  const [stats, setStats] = useState({ spent: 0, views: 0, count: 0 });
  const [campaigns, setCampaigns] = useState<{post: Post, spend: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const allPosts = await mockDB.getUserPosts(user.id);
        const sponsoredPosts = allPosts.filter(p => p.sponsored);
        const transactions = await mockDB.getUserTransactions(user.id);
        
        const adSpends = transactions.filter(t => t.type === 'AD_SPEND');
        const totalSpent = adSpends.reduce((acc, curr) => acc + curr.amount, 0);
        const totalViews = sponsoredPosts.reduce((acc, curr) => acc + curr.views, 0);

        const detailedCampaigns = sponsoredPosts.map(post => {
            const postSpend = adSpends
            .filter(t => t.postId === post.id)
            .reduce((acc, curr) => acc + curr.amount, 0);
            return { post, spend: postSpend };
        });

        setStats({
            spent: totalSpent,
            views: totalViews,
            count: sponsoredPosts.length
        });
        setCampaigns(detailedCampaigns);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
    };
    loadData();
  }, [user.id]);

  if (loading) return <div className="text-center py-20 text-slate-500">Loading Dashboard...</div>;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-black text-white mb-8">Advertiser Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
           <p className="text-xs text-slate-400 font-bold uppercase mb-1">Wallet Balance (Left)</p>
           <p className="text-2xl font-black text-green-400">${user.balance.toFixed(2)}</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
           <p className="text-xs text-slate-400 font-bold uppercase mb-1">Total Spent</p>
           <p className="text-2xl font-black text-indigo-400">${stats.spent.toFixed(2)}</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
           <p className="text-xs text-slate-400 font-bold uppercase mb-1">Total Views</p>
           <p className="text-2xl font-black text-white">{stats.views.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
           <p className="text-xs text-slate-400 font-bold uppercase mb-1">Active Campaigns</p>
           <p className="text-2xl font-black text-purple-400">{stats.count}</p>
        </div>
      </div>

      <h2 className="text-xl font-bold text-white mb-6">Your Campaigns</h2>
      
      {campaigns.length === 0 ? (
        <div className="bg-slate-800 border-dashed border border-slate-700 rounded-2xl p-10 text-center">
            <p className="text-slate-500 mb-4">You haven't sponsored any posts yet.</p>
            <Link to="/profile" className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-full transition">
              Go to Profile to Sponsor
            </Link>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-900/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Post Content</th>
                  <th className="px-6 py-4">Total Spent</th>
                  <th className="px-6 py-4">Views Generated</th>
                  <th className="px-6 py-4">Efficiency</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {campaigns.map((camp) => (
                  <tr key={camp.post.id} className="hover:bg-slate-700/30 transition">
                    <td className="px-6 py-4">
                      <div className="max-w-xs truncate text-white font-medium">
                         {camp.post.content}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{new Date(camp.post.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-indigo-300">
                      ${camp.spend.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 font-mono text-white">
                      {camp.post.views.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {(camp.spend > 0 ? (camp.post.views / camp.spend).toFixed(0) : 0)} views/$
                    </td>
                    <td className="px-6 py-4 text-right">
                       <Link to="/" className="text-xs font-bold text-indigo-400 hover:text-indigo-300">View Post</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const Profile = ({ user }: { user: User }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [trigger, setTrigger] = useState(0);
  const [sponsorPost, setSponsorPost] = useState<Post | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    mockDB.getUserPosts(user.id).then(setPosts);
  }, [user.id, trigger]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        try {
            await mockDB.updateUserAvatar(user.id, base64String);
            window.location.reload(); 
        } catch(e:any) {
            alert("Upload failed: " + e.message);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const confirmSponsor = async (amount: number) => {
    if (!sponsorPost) return;
    try {
      await mockDB.sponsorPost(sponsorPost.id, amount);
      setTrigger(t => t + 1);
      setSponsorPost(null);
      navigate('/advertiser');
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {sponsorPost && (
        <SponsorModal 
          post={sponsorPost} 
          userBalance={user.balance} 
          onClose={() => setSponsorPost(null)} 
          onConfirm={confirmSponsor} 
        />
      )}

      <div className="bg-slate-800 rounded-3xl p-8 mb-8 border border-slate-700 text-center relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-indigo-900 to-purple-900 opacity-50"></div>
        <div className="relative z-10 mt-12">
           <div className="relative inline-block group">
             <img src={user.avatarUrl} className="w-32 h-32 rounded-full border-4 border-slate-800 bg-slate-700 object-cover shadow-xl" alt="Profile" />
             <label className="absolute bottom-1 right-1 bg-indigo-600 p-2 rounded-full cursor-pointer hover:bg-indigo-500 transition shadow-lg hover:scale-105">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-white">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
               <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
             </label>
           </div>
           <h2 className="text-2xl font-bold text-white mt-4">{user.name || user.email.split('@')[0]}</h2>
           <p className="text-slate-400 text-sm font-medium">{user.email}</p>
           
           <div className="mt-8 flex justify-center divide-x divide-slate-700">
              <div className="px-8 text-center">
                 <div className="text-2xl font-black text-white">{posts.length}</div>
                 <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mt-1">Posts</div>
              </div>
              <div className="px-8 text-center">
                 <div className="text-2xl font-black text-green-400">${user.balance.toFixed(2)}</div>
                 <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mt-1">Wallet</div>
              </div>
           </div>
        </div>
      </div>
      
      <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
        <span>Your Timeline</span>
        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-md border border-slate-700">{posts.length}</span>
      </h3>
      
      <div className="space-y-6">
        {posts.length === 0 ? <p className="text-slate-500 text-center py-10 bg-slate-800/50 rounded-xl border border-slate-800 border-dashed">No posts yet.</p> : (
            posts.map(p => (
            <div key={p.id} className="relative group">
                <PostCard post={p} onReact={() => {}} />
                {!p.sponsored && (
                <button 
                    onClick={() => setSponsorPost(p)} 
                    className="absolute top-5 right-5 text-xs font-bold bg-white text-indigo-900 px-3 py-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-105 transform translate-y-1 group-hover:translate-y-0"
                >
                    🚀 Sponsor
                </button>
                )}
            </div>
            ))
        )}
      </div>
    </div>
  );
};

const Wallet = ({ user }: { user: User }) => {
  const [amount, setAmount] = useState<string>('');
  const [network, setNetwork] = useState<NetworkType>(NetworkType.TRC20);
  const [tab, setTab] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [qrState, setQrState] = useState<'IDLE' | 'LISTENING' | 'SUCCESS'>('IDLE');

  const handleDeposit = () => {
    setQrState('LISTENING');
    // Simulate Blockchain Listening
    setTimeout(async () => {
        try {
            await mockDB.deposit(user.id, parseFloat(amount) || 100, network);
            setQrState('SUCCESS');
            setTimeout(() => window.location.reload(), 1500);
        } catch(e:any) {
            setQrState('IDLE');
            alert(e.message);
        }
    }, 3000);
  };

  const handleWithdraw = async () => {
    try {
      await mockDB.requestWithdraw(user.id, parseFloat(amount), network);
      alert('Withdrawal requested. Waiting for Admin approval.');
      window.location.reload();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-indigo-500 rounded-full blur-3xl opacity-20"></div>
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Crypto Wallet</h2>
        
        <div className="flex bg-slate-900/50 p-1.5 rounded-xl mb-8 border border-slate-700/50">
          <button onClick={() => setTab('DEPOSIT')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'DEPOSIT' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Deposit</button>
          <button onClick={() => setTab('WITHDRAW')} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'WITHDRAW' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Withdraw</button>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Select Network</label>
          <div className="relative">
            <select value={network} onChange={(e) => setNetwork(e.target.value as NetworkType)} className="w-full bg-slate-900 border border-slate-600 rounded-xl p-4 text-white appearance-none focus:border-indigo-500 outline-none transition cursor-pointer">
                <option value={NetworkType.TRC20}>USDT (TRC20)</option>
                <option value={NetworkType.ERC20}>USDT (ERC20)</option>
                <option value={NetworkType.BEP20}>USDT (BEP20)</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </div>
          </div>
        </div>

        {tab === 'DEPOSIT' ? (
          <div className="text-center">
             {qrState === 'IDLE' && (
                <>
                   <div className="bg-white p-4 rounded-xl inline-block mb-6 shadow-inner">
                      <div className="w-40 h-40 bg-slate-200" style={{backgroundImage: 'url(https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=0xFakeAddress123456)', backgroundSize: 'cover'}}></div>
                   </div>
                   <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 mb-6">
                        <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Deposit Address</p>
                        <p className="text-xs text-slate-300 font-mono break-all">0x71C7656EC7ab88b098defB751B7401B5f6d8976F</p>
                   </div>
                   <div className="mb-6">
                     <label className="block text-xs font-semibold text-slate-400 mb-2 text-left uppercase tracking-wide">Amount to Deposit</label>
                     <input 
                      type="number" 
                      placeholder="e.g. 100" 
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl p-4 text-white placeholder-slate-600 focus:border-indigo-500 outline-none"
                    />
                   </div>
                   <button onClick={handleDeposit} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition shadow-lg shadow-indigo-500/20">
                     I Have Sent the Payment
                   </button>
                </>
             )}
             {qrState === 'LISTENING' && (
               <div className="py-12">
                 <div className="relative mx-auto w-20 h-20 mb-6">
                     <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                     <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                 </div>
                 <p className="text-indigo-400 font-medium animate-pulse">Scanning blockchain...</p>
                 <p className="text-xs text-slate-500 mt-2">Please wait for confirmation.</p>
               </div>
             )}
             {qrState === 'SUCCESS' && (
               <div className="py-12 animate-bounce-in">
                 <div className="h-20 w-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/30">
                   <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                 </div>
                 <p className="text-green-400 font-bold text-xl">Deposit Confirmed!</p>
               </div>
             )}
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="mb-8">
               <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Amount (Min $50)</label>
               <div className="relative">
                   <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                   <input 
                      type="number" 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                      className="w-full bg-slate-900 border border-slate-600 rounded-xl p-4 pl-8 text-white focus:border-indigo-500 outline-none transition"
                      placeholder="0.00"
                   />
               </div>
               <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span>Available: ${user.balance.toFixed(2)}</span>
                  <span>Fee: $0.00</span>
               </div>
            </div>
            <button onClick={handleWithdraw} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition shadow-lg shadow-red-600/20">
               Request Withdrawal
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const AdminPanel = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>([]);
  const [view, setView] = useState<'USERS' | 'WITHDRAWALS' | 'SETTINGS'>('USERS');
  const [editUser, setEditUser] = useState<User | null>(null);

  useEffect(() => {
    mockDB.getSettings().then(setSettings);
    mockDB.getAllUsers().then(setUsers);
    mockDB.getPendingWithdrawals().then(setWithdrawals);
  }, [editUser]);

  const handleProcess = async (id: string, approve: boolean) => {
    try {
        await mockDB.processWithdrawal(id, approve);
        setWithdrawals(await mockDB.getPendingWithdrawals());
    } catch(e:any) {
        alert(e.message);
    }
  };

  const handleSaveUser = async (id: string, data: Partial<User>) => {
      try {
        await mockDB.adminUpdateUser(id, data);
        setEditUser(null);
        setUsers(await mockDB.getAllUsers());
      } catch(e:any) {
          alert(e.message);
      }
  };

  if (!settings) return null;

  return (
    <div className="max-w-6xl mx-auto py-10 px-6">
      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSaveUser} />
      )}
      <div className="flex justify-between items-end mb-8">
          <h1 className="text-4xl font-black text-white">Admin Console</h1>
          <div className="flex bg-slate-800 p-1 rounded-lg">
            <button onClick={() => setView('USERS')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${view === 'USERS' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Users</button>
            <button onClick={() => setView('WITHDRAWALS')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${view === 'WITHDRAWALS' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                Withdrawals 
                {withdrawals.length > 0 && <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{withdrawals.length}</span>}
            </button>
            <button onClick={() => setView('SETTINGS')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${view === 'SETTINGS' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>System</button>
          </div>
      </div>

      {view === 'USERS' && (
         <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 shadow-xl">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-900 text-xs uppercase font-bold text-slate-500 tracking-wider">
                    <tr>
                        <th className="px-6 py-5">User</th>
                        <th className="px-6 py-5">Auth</th>
                        <th className="px-6 py-5">Balance</th>
                        <th className="px-6 py-5 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                    {users.map(u => (
                        <tr key={u.id} className="hover:bg-slate-700/30 transition">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <img src={u.avatarUrl} className="w-8 h-8 rounded-full bg-slate-600" alt="" />
                                <span className="font-semibold text-white">{u.name}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <div className="flex flex-col">
                                <span className="text-white">{u.email}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-green-400">${u.balance.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">
                            <button onClick={() => setEditUser(u)} className="text-indigo-400 hover:text-indigo-300 font-medium text-xs border border-indigo-500/30 px-3 py-1.5 rounded-md hover:bg-indigo-500/10 transition">Edit</button>
                        </td>
                        </tr>
                    ))}
                </tbody>
                </table>
            </div>
         </div>
      )}

      {view === 'WITHDRAWALS' && (
        <div className="space-y-4 max-w-3xl">
          {withdrawals.length === 0 && (
             <div className="text-center py-20 bg-slate-800 rounded-2xl border border-slate-700 border-dashed">
                 <p className="text-slate-500">No pending withdrawals.</p>
             </div>
          )}
          {withdrawals.map(tx => (
            <div key={tx.id} className="bg-slate-800 p-6 rounded-2xl flex justify-between items-center border border-slate-700 shadow-lg">
              <div>
                <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl font-bold text-white">${tx.amount}</span>
                    <span className="text-sm font-semibold text-slate-500 uppercase">{tx.network}</span>
                </div>
                <p className="text-xs text-slate-400 font-mono bg-slate-900 px-2 py-1 rounded inline-block">User: {tx.userId}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => handleProcess(tx.id, true)} className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-6 py-2 rounded-xl transition shadow-lg shadow-green-600/20">Approve</button>
                <button onClick={() => handleProcess(tx.id, false)} className="bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-6 py-2 rounded-xl transition shadow-lg shadow-red-600/20">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {view === 'SETTINGS' && (
          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl max-w-2xl">
             <div className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Ad Cost (USD) per 100k Views</label>
                    <input 
                        type="number" 
                        defaultValue={settings.adCostPer100kViews}
                        onChange={(e) => mockDB.updateSettings({ adCostPer100kViews: parseFloat(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none" 
                    />
                    <p className="text-xs text-slate-500 mt-1">Controls the rate at which user balance is consumed for sponsorship.</p>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Minimum Withdrawal (USD)</label>
                    <input 
                        type="number" 
                        defaultValue={settings.minWithdraw}
                        onChange={(e) => mockDB.updateSettings({ minWithdraw: parseFloat(e.target.value) })}
                        className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Admin Receiving Wallet</label>
                    <input 
                        type="text" 
                        defaultValue={settings.adminWalletAddress}
                        onChange={(e) => mockDB.updateSettings({ adminWalletAddress: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none font-mono text-sm" 
                    />
                </div>
             </div>
          </div>
      )}
    </div>
  );
};

const Auth = ({ onLogin, onShowSetup }: { onLogin: (u: User) => void, onShowSetup: () => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let user;
      if (isLogin) {
        user = await mockDB.signIn(email, password);
      } else {
        user = await mockDB.signUp(email, password);
      }
      localStorage.setItem('tf_current_user', JSON.stringify(user));
      onLogin(user);
    } catch (err: any) {
      if (err.message.includes("Invalid login credentials")) {
         setError("Invalid credentials. If you are trying to reset, please DELETE the user in Supabase Dashboard first.");
      } else if (err.message.includes("User already registered")) {
         setError("User exists. Please sign in instead.");
      } else {
         setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 bg-[url('https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2832&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>
      <div className="relative w-full max-w-md bg-slate-800/90 p-8 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-xl">
        <h1 className="text-4xl font-black text-center text-white mb-2 tracking-tight">TextFlow</h1>
        <p className="text-center text-slate-400 mb-8 font-medium">{isLogin ? 'Welcome back, Creator.' : 'Join the revolution.'}</p>
        
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-4 rounded-xl mb-6 flex items-center gap-2"><svg className="w-5 h-5 min-w-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span>{error}</span></div>}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white focus:border-indigo-500 focus:outline-none transition placeholder-slate-600" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white focus:border-indigo-500 focus:outline-none transition placeholder-slate-600" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition shadow-lg shadow-indigo-600/30 disabled:opacity-70 disabled:shadow-none mt-2">
            {loading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Processing...</span> : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>
        
        <div className="mt-8 text-center pt-6 border-t border-slate-700/50">
          <button onClick={() => setIsLogin(!isLogin)} className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition">
            {isLogin ? "New here? Create an account" : "Already a member? Sign In"}
          </button>
        </div>

        <button onClick={onShowSetup} className="block mx-auto mt-6 text-[10px] text-slate-500 hover:text-white underline">
            Database Setup (SQL)
        </button>
      </div>
    </div>
  );
};

// --- Main App Logic ---

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const init = async () => {
        // Check DB Connection
        const isConnected = await mockDB.checkConnection();
        if (!isConnected) {
            setShowSetup(true);
            setInitializing(false);
            return;
        }

        const stored = localStorage.getItem('tf_current_user');
        if (stored) {
            // Verify token validity or fetch fresh profile
            try {
                const parsed = JSON.parse(stored);
                // We trust localstorage for speed, but ideally verify with DB
                setUser(parsed);
            } catch(e) {
                localStorage.removeItem('tf_current_user');
            }
        }
        setInitializing(false);
    };
    init();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('tf_current_user');
    setUser(null);
  };

  if (initializing) return <div className="h-screen bg-slate-900 text-white flex items-center justify-center">Loading...</div>;

  return (
    <ErrorBoundary>
        <HashRouter>
        {showSetup && <SupabaseSetup onClose={() => window.location.reload()} />}
        {!user ? (
            <Auth onLogin={setUser} onShowSetup={() => setShowSetup(true)} />
        ) : (
            <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30">
            <Navbar user={user} onLogout={handleLogout} />
            <Routes>
                <Route path="/" element={<Feed />} />
                <Route path="/profile" element={<Profile user={user} />} />
                <Route path="/wallet" element={<Wallet user={user} />} />
                <Route path="/advertiser" element={<AdvertiserPanel user={user} />} />
                <Route path="/admin" element={user.role === UserRole.ADMIN ? <AdminPanel /> : <Navigate to="/" />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
            </div>
        )}
        </HashRouter>
    </ErrorBoundary>
  );
};

export default App;