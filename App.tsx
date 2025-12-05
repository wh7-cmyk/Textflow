
import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { 
  User, Post, UserRole, NetworkType, Transaction, SystemSettings, Comment, Notification, Conversation, Message 
} from './types';
import { mockDB } from './services/mockDb';

// --- SQL Modal for Supabase Setup ---
const SupabaseSetup = ({ onClose }: { onClose: () => void }) => {
  const sql = `
-- ✅ SAFE UPDATE SCRIPT (NON-DESTRUCTIVE)
-- Run this in Supabase SQL Editor. 

-- 1. Create Extensions
create extension if not exists "uuid-ossp";

-- 2. Create Tables (If they don't exist)
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  role text default 'USER',
  balance numeric default 0,
  name text,
  avatar_url text,
  email_public boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.posts (
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

create table if not exists public.comments (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id),
  content text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id), -- Recipient
  actor_id uuid references public.profiles(id), -- Triggered by
  type text,
  message text,
  link text,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references public.profiles(id),
  receiver_id uuid references public.profiles(id),
  content text,
  is_read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.follows (
  id uuid default uuid_generate_v4() primary key,
  follower_id uuid references public.profiles(id),
  following_id uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(follower_id, following_id)
);

create table if not exists public.transactions (
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

create table if not exists public.settings (
  id int primary key default 1,
  site_name text default 'TextFlow',
  site_logo_url text,
  site_background_url text,
  ad_cost_per_100k_views numeric default 0.1,
  sponsor_ad_price_per_1k_views numeric default 1.0,
  min_withdraw numeric default 50,
  admin_wallet_address text default '0xAdminWallet...',
  about_content text default 'About Us content goes here...',
  policy_content text default 'Privacy Policy goes here...',
  enable_direct_messaging boolean default true,
  check (id = 1) -- Ensure only one settings row
);

-- 2a. Add Columns to Existing Tables (Fix for "missing column" errors)
alter table public.settings add column if not exists site_logo_url text;
alter table public.settings add column if not exists site_background_url text;
alter table public.settings add column if not exists sponsor_ad_price_per_1k_views numeric default 1.0;
alter table public.settings add column if not exists enable_direct_messaging boolean default true;
alter table public.profiles add column if not exists email_public boolean default true;

-- 3. Update Permissions (RLS)

alter table public.profiles enable row level security;
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile" on public.profiles for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

alter table public.settings enable row level security;
drop policy if exists "Public settings are viewable by everyone" on public.settings;
create policy "Public settings are viewable by everyone" on public.settings for select using (true);
drop policy if exists "Admins can update settings" on public.settings;
create policy "Admins can update settings" on public.settings for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);
drop policy if exists "Admins can insert settings" on public.settings;
create policy "Admins can insert settings" on public.settings for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

alter table public.posts enable row level security;
drop policy if exists "Posts are viewable by everyone" on public.posts;
create policy "Posts are viewable by everyone" on public.posts for select using (true);
drop policy if exists "Users can create posts" on public.posts;
create policy "Users can create posts" on public.posts for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own posts" on public.posts;
create policy "Users can update own posts" on public.posts for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own posts" on public.posts;
create policy "Users can delete own posts" on public.posts for delete using (auth.uid() = user_id);
drop policy if exists "Admins can update any post" on public.posts;
create policy "Admins can update any post" on public.posts for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);
drop policy if exists "Admins can delete any post" on public.posts;
create policy "Admins can delete any post" on public.posts for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

alter table public.comments enable row level security;
drop policy if exists "Comments viewable by everyone" on public.comments;
create policy "Comments viewable by everyone" on public.comments for select using (true);
drop policy if exists "Users can create comments" on public.comments;
create policy "Users can create comments" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own comments" on public.comments;
create policy "Users can delete own comments" on public.comments for delete using (auth.uid() = user_id);
drop policy if exists "Admins can delete any comment" on public.comments;
create policy "Admins can delete any comment" on public.comments for delete using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

alter table public.notifications enable row level security;
drop policy if exists "Users view own notifications" on public.notifications;
create policy "Users view own notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications for update using (auth.uid() = user_id);
drop policy if exists "Anyone can insert notifications" on public.notifications;
create policy "Anyone can insert notifications" on public.notifications for insert with check (true);

alter table public.messages enable row level security;
drop policy if exists "Users view own messages" on public.messages;
create policy "Users view own messages" on public.messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "Users send messages" on public.messages;
create policy "Users send messages" on public.messages for insert with check (auth.uid() = sender_id);
drop policy if exists "Users update messages (read status)" on public.messages;
create policy "Users update messages (read status)" on public.messages for update using (auth.uid() = receiver_id);

alter table public.follows enable row level security;
drop policy if exists "Users can see who they follow" on public.follows;
create policy "Users can see who they follow" on public.follows for select using (auth.uid() = follower_id);
drop policy if exists "Users can see their followers" on public.follows;
create policy "Users can see their followers" on public.follows for select using (auth.uid() = following_id);
drop policy if exists "Users can follow" on public.follows;
create policy "Users can follow" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow" on public.follows for delete using (auth.uid() = follower_id);

alter table public.transactions enable row level security;
drop policy if exists "Users view own txs" on public.transactions;
create policy "Users view own txs" on public.transactions for select using (auth.uid() = user_id);
drop policy if exists "Users create txs" on public.transactions;
create policy "Users create txs" on public.transactions for insert with check (auth.uid() = user_id);
drop policy if exists "Admins can view all transactions" on public.transactions;
create policy "Admins can view all transactions" on public.transactions for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);
drop policy if exists "Admins can update transactions" on public.transactions;
create policy "Admins can update transactions" on public.transactions for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN')
);

-- 4. Admin Auto-Setup Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role, balance, name, avatar_url)
  values (
    new.id,
    new.email,
    case when new.email = 'admin@adminn.com' then 'ADMIN' else 'USER' end,
    case when new.email = 'admin@adminn.com' then 10000 else 0 end,
    split_part(new.email, '@', 1),
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || new.email
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Insert Default Settings (Safe Insert)
insert into public.settings (id, site_name, enable_direct_messaging) 
values (1, 'TextFlow', true)
on conflict (id) do nothing;

-- 6. Refresh Schema Cache
NOTIFY pgrst, 'reload config';
  `;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl max-w-2xl w-full p-6 border border-indigo-500 shadow-2xl overflow-y-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold text-indigo-400 mb-2">🛡️ Safe Database Update</h2>
        <div className="mb-4 text-slate-300 text-sm space-y-2">
            <p>1. Copy the SQL code below.</p>
            <p>2. Run it in your Supabase SQL Editor.</p>
            <p className="text-green-400 font-bold bg-green-400/10 p-2 rounded border border-green-400/30">
               SAFE MODE: This script will NOT delete your existing users or posts. It adds 'settings' and 'follows' tables.
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
        <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg">
          Done
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
const BellIcon = ({ count }: { count: number }) => (
    <div className="relative">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-400 hover:text-white transition">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
      {count > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{count > 9 ? '9+' : count}</span>}
    </div>
);
const ChatIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
);
const MenuIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);
const XMarkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-400">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);
const HomeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
);
const PresentationChartLineIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>
);

const HeartIcon = ({ filled }: { filled?: boolean }) => (<svg xmlns="http://www.w3.org/2000/svg" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ${filled ? 'text-red-500' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>);
const ThumbUpIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75A2.25 2.25 0 0 1 16.5 4.5c0 1.152-.26 2.247-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" /></svg>);
const FaceSmileIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /></svg>);
const ShareIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.287.696.287 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-1.988 2.25 2.25 0 0 0-3.933 1.988Z" /></svg>);
const ChatBubbleIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>);
const ChartBarIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>);
const PencilIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>);
const TrashIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>);
const CheckIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>);
const PaperAirplaneIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 -rotate-45 translate-x-1"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>);
const UserPlusIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3.75 15a2.25 2.25 0 0 1 2.25-2.25h2.996a2.25 2.25 0 0 1 2.25 2.25 1.5 1.5 0 0 1 1.5 1.5v3.326a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V16.5a1.5 1.5 0 0 1 1.5-1.5Z" /></svg>);
const UserMinusIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3.75 15a2.25 2.25 0 0 1 2.25-2.25h2.996a2.25 2.25 0 0 1 2.25 2.25 1.5 1.5 0 0 1 1.5 1.5v3.326a2.25 2.25 0 0 1-2.25-2.25H6a2.25 2.25 0 0 1-2.25-2.25V16.5a1.5 1.5 0 0 1 1.5-1.5Z" /></svg>);


// --- Navbar & Mobile Menu ---

const Navbar = ({ user, onLogout, siteName, logo }: { user: User; onLogout: () => void; siteName: string; logo?: string }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dmEnabled, setDmEnabled] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mockDB.getSettings().then(s => setDmEnabled(s.enableDirectMessaging));
    loadNotifications();
    const interval = setInterval(loadNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
        const data = await mockDB.getNotifications(user.id);
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.isRead).length);
    } catch(e) {}
  };

  const handleNotifClick = async () => {
    setShowNotif(!showNotif);
    if (!showNotif && unreadCount > 0) {
        // Mark all as read locally for UI snap
        setUnreadCount(0);
        await mockDB.markAllNotificationsRead(user.id);
        loadNotifications();
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
            setShowNotif(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="sticky top-0 z-40 w-full bg-slate-900/90 border-b border-slate-800 backdrop-blur-md">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
            {logo ? <img src={logo} className="h-8 w-auto rounded" alt="Logo" /> : null}
            <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">{siteName}</span>
        </Link>
        
        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-4">
            <Link to="/" className="text-sm font-bold text-white hover:text-indigo-400 transition flex items-center gap-2">
                <HomeIcon /> <span>Feed</span>
            </Link>
            <Link to="/about" className="text-sm text-slate-400 hover:text-white transition">About</Link>
            <Link to="/policy" className="text-sm text-slate-400 hover:text-white transition">Policy</Link>
            
            {user.role === UserRole.ADMIN && (
               <Link to="/admin" className="text-sm font-medium text-slate-300 hover:text-white transition">Admin</Link>
            )}

            {/* DM Icon */}
            {dmEnabled && (
                <Link to="/messages" className="text-slate-400 hover:text-indigo-400 transition relative">
                    <ChatIcon />
                </Link>
            )}

            {/* Advertiser */}
            <Link to="/advertiser" title="Advertiser Dashboard" className="text-slate-400 hover:text-indigo-400 transition">
              <ChartBarIcon />
            </Link>

            {/* Wallet */}
            <Link to="/wallet" className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700/50 hover:border-indigo-500/50 transition duration-300">
                <span className="text-xs text-slate-400 font-medium">USDT</span>
                <span className="text-sm font-bold text-green-400">${user.balance.toFixed(2)}</span>
            </Link>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
                <button onClick={handleNotifClick}>
                    <BellIcon count={unreadCount} />
                </button>
                {showNotif && (
                    <div className="absolute top-10 right-0 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-96 overflow-y-auto">
                        <div className="p-3 border-b border-slate-700 bg-slate-900/50 font-bold text-white text-sm">Notifications</div>
                        {notifications.length === 0 ? (
                            <div className="p-4 text-center text-slate-500 text-sm">No new notifications</div>
                        ) : (
                            notifications.map(n => (
                                <Link to={n.link || '#'} key={n.id} onClick={() => setShowNotif(false)} className={`block p-3 border-b border-slate-700/50 hover:bg-slate-700 transition flex gap-3 ${!n.isRead ? 'bg-indigo-900/10' : ''}`}>
                                    {n.actorAvatar ? (
                                        <img src={n.actorAvatar} className="w-8 h-8 rounded-full" alt="" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-slate-600"></div>
                                    )}
                                    <div>
                                        <p className="text-xs text-slate-300">
                                            <span className="font-bold text-white">{n.actorName}</span> {n.message}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-1">{new Date(n.createdAt).toLocaleDateString()}</p>
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Profile */}
            <Link to={`/profile/${user.id}`}>
                <img 
                    src={user.avatarUrl} 
                    alt="Profile" 
                    className="w-9 h-9 rounded-full border-2 border-slate-700 hover:border-indigo-500 transition object-cover" 
                />
            </Link>
            <button onClick={onLogout} className="text-sm text-slate-400 hover:text-red-400">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
            </button>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center gap-4">
             {/* Wallet & Notif on Mobile Navbar directly */}
            <Link to="/wallet" className="flex items-center gap-1 bg-slate-800/50 px-2 py-1 rounded-full border border-slate-700/50">
                <span className="text-[10px] font-bold text-green-400">${user.balance.toFixed(0)}</span>
            </Link>
            <Link to="/notifications" className="relative">
                <BellIcon count={unreadCount} />
            </Link>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white">
                {mobileMenuOpen ? <XMarkIcon /> : <MenuIcon />}
            </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 p-4 space-y-4 animate-fade-in absolute w-full left-0 top-16 shadow-2xl">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="block text-indigo-400 font-bold py-2 border-b border-slate-800 flex items-center gap-2">
                  <HomeIcon /> News Feed
              </Link>
              <Link to={`/profile/${user.id}`} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-2 bg-slate-800 rounded-lg">
                  <img src={user.avatarUrl} className="w-10 h-10 rounded-full" alt=""/>
                  <div>
                      <p className="text-white font-bold">{user.name}</p>
                      <p className="text-xs text-slate-400">Email Hidden</p>
                  </div>
              </Link>
              {dmEnabled && (
                  <Link to="/messages" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-white py-2 border-b border-slate-800">Messages</Link>
              )}
              <Link to="/advertiser" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-white py-2 border-b border-slate-800">Advertiser Dashboard</Link>
              <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-white py-2 border-b border-slate-800">About</Link>
              <Link to="/policy" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-white py-2 border-b border-slate-800">Policy</Link>
              {user.role === UserRole.ADMIN && (
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="block text-indigo-400 font-bold py-2 border-b border-slate-800">Admin Panel</Link>
              )}
              <button onClick={onLogout} className="block w-full text-left text-red-400 py-2">Sign Out</button>
          </div>
      )}
    </nav>
  );
};

// --- Messaging Page ---
const MessagesPage = ({ user }: { user: User }) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const params = useParams(); // To possibly support /messages/:userId

    useEffect(() => {
        loadConversations();
        const interval = setInterval(loadConversations, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (activeConvId) {
            loadMessages(activeConvId);
            const interval = setInterval(() => loadMessages(activeConvId), 3000);
            return () => clearInterval(interval);
        }
    }, [activeConvId]);

    // Auto scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const loadConversations = async () => {
        try {
            const data = await mockDB.getConversations(user.id);
            setConversations(data);
            setLoading(false);
        } catch (e) {}
    };

    const loadMessages = async (otherId: string) => {
        try {
            const msgs = await mockDB.getMessages(user.id, otherId);
            setMessages(msgs);
        } catch (e) {}
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !activeConvId) return;
        try {
            await mockDB.sendMessage(user.id, activeConvId, input);
            setInput('');
            loadMessages(activeConvId);
            loadConversations(); // Update snippet
        } catch (e: any) {
            alert("Send failed: " + e.message);
        }
    };

    const activeConv = conversations.find(c => c.otherUser.id === activeConvId);

    return (
        <div className="max-w-4xl mx-auto h-[calc(100vh-80px)] py-4 px-4 flex gap-4">
            {/* Conversations List */}
            <div className={`w-full md:w-1/3 bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden flex flex-col ${activeConvId ? 'hidden md:flex' : ''}`}>
                <div className="p-4 border-b border-slate-700 font-bold text-white">Messages</div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.length === 0 && !loading && (
                        <div className="p-4 text-center text-slate-500 text-sm">No conversations yet.</div>
                    )}
                    {conversations.map(c => (
                        <div 
                            key={c.otherUser.id}
                            onClick={() => setActiveConvId(c.otherUser.id)}
                            className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-slate-700 transition border-b border-slate-700/50 ${activeConvId === c.otherUser.id ? 'bg-indigo-900/20' : ''}`}
                        >
                            <img src={c.otherUser.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.otherUser.id}`} className="w-10 h-10 rounded-full bg-slate-600" alt="" />
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline">
                                    <h4 className="font-bold text-slate-200 text-sm truncate">{c.otherUser.name}</h4>
                                    {c.unreadCount > 0 && <span className="bg-indigo-500 text-white text-[10px] px-1.5 rounded-full">{c.unreadCount}</span>}
                                </div>
                                <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-white font-medium' : 'text-slate-500'}`}>{c.lastMessage}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Window */}
            <div className={`w-full md:w-2/3 bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden flex flex-col ${!activeConvId ? 'hidden md:flex' : ''}`}>
                {!activeConvId ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500">
                        Select a conversation to start chatting
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-slate-700 flex items-center gap-3 bg-slate-900/50">
                            <button onClick={() => setActiveConvId(null)} className="md:hidden text-slate-400 mr-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
                            </button>
                            <img src={activeConv?.otherUser.avatarUrl} className="w-8 h-8 rounded-full" alt="" />
                            <h3 className="font-bold text-white">{activeConv?.otherUser.name}</h3>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/30" ref={scrollRef}>
                            {messages.map(m => {
                                const isMe = m.senderId === user.id;
                                return (
                                    <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                                            {m.content}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <form onSubmit={handleSend} className="p-3 border-t border-slate-700 bg-slate-800 flex gap-2">
                            <input 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                className="flex-1 bg-slate-900 border border-slate-600 rounded-full px-4 py-2 text-white focus:border-indigo-500 focus:outline-none"
                                placeholder="Type a message..."
                            />
                            <button disabled={!input.trim()} type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-full disabled:opacity-50 transition">
                                <PaperAirplaneIcon />
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};

// --- User Stats Page (Restored) ---
const UserStats = ({ user }: { user: User }) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [settings, setSettings] = useState<SystemSettings | null>(null);

    useEffect(() => {
        mockDB.getUserPosts(user.id).then(setPosts);
        mockDB.getSettings().then(setSettings);
    }, [user]);

    if (!settings) return null;

    const totalViews = posts.reduce((acc, p) => acc + p.views, 0);
    const estimatedEarnings = (totalViews / 100000) * settings.adCostPer100kViews;

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold text-white mb-6">Performance Statistics</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                 <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Views</div>
                    <div className="text-3xl font-black text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-indigo-400"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        {totalViews}
                    </div>
                 </div>
                 <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Est. Earnings</div>
                    <div className="text-3xl font-black text-green-400 flex items-center gap-2">
                        $ {estimatedEarnings.toFixed(4)}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">Rate: ${settings.adCostPer100kViews} / 100k views</p>
                 </div>
                 <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-lg">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Posts</div>
                    <div className="text-3xl font-black text-white">{posts.length}</div>
                 </div>
            </div>

            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-700 font-bold text-white">Post Performance</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900/50 text-xs uppercase text-slate-500">
                            <tr>
                                <th className="px-4 py-3">Content</th>
                                <th className="px-4 py-3 text-center">Views</th>
                                <th className="px-4 py-3 text-center">Likes</th>
                                <th className="px-4 py-3 text-right">Est. Earn</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {posts.map(p => (
                                <tr key={p.id} className="hover:bg-slate-700/30">
                                    <td className="px-4 py-3 max-w-xs truncate">{p.content}</td>
                                    <td className="px-4 py-3 text-center font-bold">{p.views}</td>
                                    <td className="px-4 py-3 text-center">{p.likes}</td>
                                    <td className="px-4 py-3 text-right text-green-400 font-mono">
                                        ${((p.views / 100000) * settings.adCostPer100kViews).toFixed(5)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- Page Components ---

const AboutPage = () => {
    const [content, setContent] = useState('');
    useEffect(() => { mockDB.getSettings().then(s => setContent(s.aboutContent || '')); }, []);
    return (
        <div className="max-w-2xl mx-auto py-10 px-6 text-slate-300">
            <h1 className="text-3xl font-bold text-white mb-6">About Us</h1>
            <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        </div>
    );
};

const PolicyPage = () => {
    const [content, setContent] = useState('');
    useEffect(() => { mockDB.getSettings().then(s => setContent(s.policyContent || '')); }, []);
    return (
        <div className="max-w-2xl mx-auto py-10 px-6 text-slate-300">
            <h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
            <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        </div>
    );
};

const Auth = ({ onLogin, onShowSetup, siteName }: { onLogin: (u: User) => void, onShowSetup: () => void, siteName: string }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const user = isLogin ? await mockDB.signIn(email, password) : await mockDB.signUp(email, password);
            localStorage.setItem('tf_current_user', JSON.stringify(user));
            onLogin(user);
        } catch (err: any) {
            if (err.message.includes('schema') || err.message.includes('relation')) {
                onShowSetup();
            } else {
                alert(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
                <h1 className="text-3xl font-black text-center mb-2 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">{siteName}</h1>
                <p className="text-center text-slate-400 mb-8">{isLogin ? 'Welcome back!' : 'Join the revolution.'}</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none transition" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none transition" required />
                    </div>
                    <button disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition shadow-lg disabled:opacity-50">
                        {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
                    </button>
                </form>
                <div className="mt-6 text-center">
                    <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-slate-400 hover:text-white underline">
                        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const PostCard = ({ post, onReact, currentUser, onRefresh, onSponsor }: { post: Post; onReact: (id: string, type: any) => void; currentUser: User; onRefresh?: () => void, onSponsor?: (post: Post) => void }) => {
    const [showPreview, setShowPreview] = useState(true);
    const [isOwner, setIsOwner] = useState(currentUser.id === post.userId);
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(post.content);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');

    // Extract first URL for preview
    const urlMatch = post.content.match(/(https?:\/\/[^\s]+)/);
    const firstUrl = urlMatch ? urlMatch[0] : (post.type === 'link' ? post.content : null);
    const isImage = firstUrl ? /\.(jpeg|jpg|gif|png|webp)($|\?)/i.test(firstUrl) : false;
    const getYoutubeVideoId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };
    const youtubeId = firstUrl ? getYoutubeVideoId(firstUrl) : null;
    
    // URL Parser Helper
    const extractUrls = (text: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, index) => {
            if (part.match(urlRegex)) {
                return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{part}</a>;
            }
            return part;
        });
    };

    useEffect(() => {
        if (showComments) {
            mockDB.getPostComments(post.id).then(setComments);
        }
    }, [showComments, post.id]);

    const handleReact = async (type: 'likes' | 'hearts' | 'hahas') => {
        await mockDB.reactToPost(post.id, type, currentUser.id);
        if (onRefresh) onRefresh();
    };

    const handleUpdate = async () => {
        try {
            await mockDB.updatePost(post.id, editContent);
            setIsEditing(false);
            if(onRefresh) onRefresh();
        } catch(e:any) { alert(e.message); }
    };

    const handleDelete = async () => {
        if(window.confirm("Are you sure you want to delete this post?")) {
            try {
                await mockDB.deletePost(post.id);
                if(onRefresh) onRefresh();
            } catch(e:any) { alert(e.message); }
        }
    };

    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newComment.trim()) return;
        try {
            await mockDB.addComment(post.id, currentUser.id, newComment);
            setNewComment('');
            mockDB.getPostComments(post.id).then(setComments);
        } catch(e:any) { alert(e.message); }
    };

    const handleDeleteComment = async (commentId: string) => {
        if(window.confirm("Delete comment?")) {
             try {
                await mockDB.deleteComment(commentId);
                mockDB.getPostComments(post.id).then(setComments);
             } catch(e:any) { alert(e.message); }
        }
    }

    const handleShare = async () => {
        const shareData = {
            title: `Check out this post by ${post.userEmail.split('@')[0]}`,
            text: post.content,
            url: `${window.location.origin}/#/post/${post.id}`
        };
        if (navigator.share) {
            try { await navigator.share(shareData); } catch(e) {}
        } else {
           // Fallback UI
           const url = `${window.location.origin}/#/post/${post.id}`;
           const encodedUrl = encodeURIComponent(url);
           const encodedText = encodeURIComponent(post.content);
           
           // Create a temporary simple menu
           const width = 600; const height = 400;
           const left = window.screen.width / 2 - width / 2;
           const top = window.screen.height / 2 - height / 2;
           
           const newWindow = window.open('', '_blank', `width=${width},height=${height},top=${top},left=${left}`);
           if(newWindow) {
               newWindow.document.write(`
                   <html><head><title>Share</title><style>body{font-family:sans-serif;background:#0f172a;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;} a{display:block;margin:10px;padding:10px 20px;background:#4f46e5;color:white;text-decoration:none;border-radius:5px;} a:hover{background:#4338ca;}</style></head>
                   <body>
                       <h3>Share Post</h3>
                       <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank">Facebook</a>
                       <a href="https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}" target="_blank">X (Twitter)</a>
                       <a href="https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}" target="_blank">WhatsApp</a>
                       <button onclick="navigator.clipboard.writeText('${url}'); alert('Copied!');" style="margin:10px;padding:10px 20px;background:#334155;color:white;border:none;border-radius:5px;cursor:pointer;">Copy Link</button>
                   </body></html>
               `);
           }
        }
    };

    return (
        <div className={`bg-slate-800 p-6 rounded-2xl border ${post.sponsored ? 'border-amber-500/50 shadow-amber-900/20' : 'border-slate-700'} shadow-xl mb-6 relative overflow-hidden`}>
            {post.sponsored && (
                <div className="absolute top-0 right-0 bg-amber-500 text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg">SPONSORED</div>
            )}
            
            <div className="flex items-center justify-between mb-4">
                <Link to={`/profile/${post.userId}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-3 group">
                    <img src={post.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.userId}`} className="w-10 h-10 rounded-full bg-slate-700 transition group-hover:ring-2 group-hover:ring-indigo-500" alt="" />
                    <div>
                        <h3 className="font-bold text-white text-sm group-hover:text-indigo-400 group-hover:underline transition">{post.userEmail.split('@')[0]}</h3>
                        <p className="text-xs text-slate-500">{new Date(post.createdAt).toLocaleDateString()}</p>
                    </div>
                </Link>
                {isOwner && (
                    <div className="flex gap-2">
                        {/* Sponsor Button */}
                        {!post.sponsored && onSponsor && (
                            <button 
                                onClick={() => onSponsor(post)}
                                className="text-xs font-bold bg-white text-indigo-900 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition mr-2"
                            >
                                🚀 Sponsor
                            </button>
                        )}
                        {isEditing ? (
                            <>
                                <button onClick={() => setIsEditing(false)} className="text-red-400 hover:bg-slate-700 p-1 rounded"><XMarkIcon /></button>
                                <button onClick={handleUpdate} className="text-green-400 hover:bg-slate-700 p-1 rounded"><CheckIcon /></button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsEditing(true)} className="text-slate-400 hover:text-indigo-400 hover:bg-slate-700 p-1 rounded"><PencilIcon /></button>
                                <button onClick={handleDelete} className="text-slate-400 hover:text-red-400 hover:bg-slate-700 p-1 rounded"><TrashIcon /></button>
                            </>
                        )}
                    </div>
                )}
            </div>
            
            <div className="mb-4">
                {isEditing ? (
                    <textarea 
                        value={editContent} 
                        onChange={e => setEditContent(e.target.value)} 
                        className="w-full bg-slate-900 text-white p-3 rounded-lg border border-slate-600 focus:border-indigo-500 outline-none"
                        rows={4}
                    />
                ) : (
                    <>
                    <div className="text-slate-200 text-lg mb-2 whitespace-pre-wrap">{extractUrls(post.content)}</div>
                    {/* Rich Media Preview */}
                    {firstUrl && showPreview && (
                        <div className="mt-3 relative rounded-xl overflow-hidden bg-black/50 border border-slate-700">
                             <button onClick={() => setShowPreview(false)} className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1 hover:bg-red-500/80 transition z-10"><XMarkIcon /></button>
                             {youtubeId ? (
                                 <iframe 
                                    className="w-full aspect-video" 
                                    src={`https://www.youtube.com/embed/${youtubeId}`} 
                                    title="YouTube video player" 
                                    frameBorder="0" 
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                    allowFullScreen
                                 ></iframe>
                             ) : isImage ? (
                                 <img src={firstUrl} alt="Preview" className="w-full h-auto max-h-[400px] object-contain" onError={() => setShowPreview(false)} />
                             ) : null}
                        </div>
                    )}
                    </>
                )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                <div className="flex gap-4">
                    <button onClick={() => handleReact('likes')} className="flex items-center gap-1.5 text-slate-400 hover:text-indigo-400 transition group">
                        <ThumbUpIcon /> <span className="text-xs font-bold">{post.likes}</span>
                    </button>
                    <button onClick={() => handleReact('hearts')} className="flex items-center gap-1.5 text-slate-400 hover:text-red-400 transition group">
                        <HeartIcon /> <span className="text-xs font-bold">{post.hearts}</span>
                    </button>
                    <button onClick={() => handleReact('hahas')} className="flex items-center gap-1.5 text-slate-400 hover:text-yellow-400 transition group">
                        <FaceSmileIcon /> <span className="text-xs font-bold">{post.hahas}</span>
                    </button>
                </div>
                <div className="flex gap-4 text-xs text-slate-500 font-medium">
                    <button onClick={() => setShowComments(!showComments)} className="hover:text-white flex items-center gap-1"><ChatBubbleIcon /> {showComments ? 'Hide' : 'Comments'}</button>
                    <button onClick={handleShare} className="hover:text-white flex items-center gap-1"><ShareIcon /> Share</button>
                    <span className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg> {post.views}</span>
                </div>
            </div>

            {/* Comments Section */}
            {showComments && (
                <div className="mt-4 pt-4 border-t border-slate-700/30 animate-fade-in">
                    <div className="space-y-4 mb-4 max-h-60 overflow-y-auto pr-2">
                        {comments.length === 0 && <p className="text-xs text-slate-500 text-center">No comments yet.</p>}
                        {comments.map(c => (
                            <div key={c.id} className="flex gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-700/30 group">
                                <img src={c.userAvatar} className="w-8 h-8 rounded-full" alt="" />
                                <div className="flex-1">
                                    <div className="flex justify-between items-baseline">
                                        <span className="font-bold text-white text-xs">{c.userEmail.split('@')[0]}</span>
                                        <div className="flex gap-2">
                                            <span className="text-[10px] text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                                            {currentUser.id === c.userId && (
                                                <button onClick={() => handleDeleteComment(c.id)} className="text-slate-600 hover:text-red-400"><TrashIcon /></button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-slate-300 text-sm mt-1 break-words">{c.content}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handlePostComment} className="flex gap-2">
                        <input 
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            placeholder="Write a comment..."
                            className="flex-1 bg-slate-900 border border-slate-600 rounded-full px-4 py-2 text-xs text-white focus:border-indigo-500 outline-none"
                        />
                        <button type="submit" className="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-500"><PaperAirplaneIcon /></button>
                    </form>
                </div>
            )}
        </div>
    );
};

const SponsorModal = ({ post, userBalance, onClose, onConfirm }: { post: Post, userBalance: number, onClose: () => void, onConfirm: (a: number) => void }) => {
    const [amount, setAmount] = useState(10);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-indigo-500/50">
                <h3 className="text-xl font-bold text-white mb-2">Sponsor Post</h3>
                <p className="text-slate-400 text-sm mb-4">Boost this post to reach more users.</p>
                <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-500 mb-1">Budget (USD)</label>
                    <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="text-slate-400 font-bold text-sm">Cancel</button>
                    <button onClick={() => onConfirm(amount)} className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-sm">Confirm</button>
                </div>
            </div>
        </div>
    );
};

const EditUserModal = ({ user, onClose, onSave }: { user: User, onClose: () => void, onSave: (id: string, d: Partial<User>) => void }) => {
    const [formData, setFormData] = useState({ name: user.name, email: user.email, balance: user.balance });
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-slate-800 p-6 rounded-2xl max-w-sm w-full border border-slate-700">
                <h3 className="text-xl font-bold text-white mb-4">Edit User</h3>
                <div className="space-y-3">
                    <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Name" />
                    <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Email" />
                    <input type="number" value={formData.balance} onChange={e => setFormData({...formData, balance: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white" placeholder="Balance" />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="text-slate-400 font-bold text-sm">Cancel</button>
                    <button onClick={() => onSave(user.id, formData)} className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-sm">Save</button>
                </div>
            </div>
        </div>
    );
};

const Feed = ({ currentUser }: { currentUser: User }) => {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPostContent, setNewPostContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [sponsorPost, setSponsorPost] = useState<Post | null>(null);
    const navigate = useNavigate();

    const load = async () => {
        const p = await mockDB.getFeed();
        setPosts(p);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPostContent.trim()) return;
        setIsPosting(true);
        try {
            // Auto-detect type based on content (simple heuristic)
            const type = newPostContent.match(/^https?:\/\//) ? 'link' : 'text';
            await mockDB.createPost(currentUser.id, newPostContent, type);
            setNewPostContent('');
            await load();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsPosting(false);
        }
    };

    const confirmSponsor = async (amount: number) => {
        if (!sponsorPost) return;
        try {
          await mockDB.sponsorPost(sponsorPost.id, amount);
          setSponsorPost(null);
          load(); // refresh feed to show updated view count / status
          navigate('/advertiser');
        } catch (e: any) {
          alert(e.message);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-6 px-4">
            {sponsorPost && (
                <SponsorModal 
                post={sponsorPost} 
                userBalance={currentUser.balance} 
                onClose={() => setSponsorPost(null)} 
                onConfirm={confirmSponsor} 
                />
            )}
            <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
                <Link to={`/profile/${currentUser.id}`} className="bg-slate-800 text-slate-300 px-4 py-2 rounded-full font-bold text-sm border border-slate-700 hover:bg-slate-700 whitespace-nowrap">My Posts</Link>
            </div>
            
            <div className="mb-8 bg-slate-800 p-4 rounded-2xl border border-slate-700 flex gap-3">
                <img src={currentUser.avatarUrl} className="w-10 h-10 rounded-full bg-slate-700" alt="" />
                <form onSubmit={handleCreatePost} className="flex-1">
                    <textarea 
                       value={newPostContent}
                       onChange={(e) => setNewPostContent(e.target.value)}
                       placeholder="What's happening?" 
                       className="w-full bg-slate-900 border-none rounded-xl px-4 py-3 text-white focus:ring-1 focus:ring-indigo-500 resize-none outline-none"
                       rows={2}
                    />
                    <div className="flex justify-end mt-2">
                        <button 
                            type="submit" 
                            disabled={!newPostContent.trim() || isPosting}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-full text-sm disabled:opacity-50 transition"
                        >
                            {isPosting ? 'Posting...' : 'Post'}
                        </button>
                    </div>
                </form>
            </div>

            {loading ? <div className="text-center text-slate-500">Loading feed...</div> : (
                posts.map(p => (
                    <React.Fragment key={p.id}>
                        <PostCard 
                            post={p} 
                            currentUser={currentUser} 
                            onReact={() => {}} 
                            onRefresh={load} 
                            onSponsor={(post) => setSponsorPost(post)}
                        />
                    </React.Fragment>
                ))
            )}
        </div>
    );
};

const SinglePost = ({ currentUser }: { currentUser: User }) => {
    const { postId } = useParams();
    const [post, setPost] = useState<Post | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');

    const load = async () => {
        if (!postId) return;
        const p = await mockDB.getPost(postId);
        setPost(p);
        const c = await mockDB.getPostComments(postId);
        setComments(c);
    };

    useEffect(() => { load(); }, [postId]);

    const handleComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!postId || !newComment.trim()) return;
        try {
            await mockDB.addComment(postId, currentUser.id, newComment);
            setNewComment('');
            load();
        } catch (e: any) { alert(e.message); }
    };

    if (!post) return <div className="p-10 text-center">Loading...</div>;

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <PostCard post={post} currentUser={currentUser} onReact={() => {}} onRefresh={load} />
            
            <div className="mt-8">
                <h3 className="font-bold text-white mb-4">Comments</h3>
                <form onSubmit={handleComment} className="flex gap-2 mb-8">
                    <input 
                        value={newComment} 
                        onChange={e => setNewComment(e.target.value)} 
                        placeholder="Add a comment..." 
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none" 
                    />
                    <button type="submit" className="bg-indigo-600 text-white px-6 rounded-xl font-bold">Post</button>
                </form>
                
                <div className="space-y-4">
                    {comments.map(c => (
                        <div key={c.id} className="flex gap-3 bg-slate-800/50 p-4 rounded-xl">
                            <img src={c.userAvatar} className="w-8 h-8 rounded-full" alt="" />
                            <div>
                                <div className="flex items-baseline gap-2">
                                    <span className="font-bold text-white text-sm">{c.userEmail.split('@')[0]}</span>
                                    <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-slate-300 text-sm mt-1">{c.content}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const Wallet = ({ user }: { user: User }) => {
    const [amount, setAmount] = useState('');
    const [txs, setTxs] = useState<Transaction[]>([]);

    useEffect(() => {
        mockDB.getUserTransactions(user.id).then(setTxs);
    }, [user]);

    const handleWithdraw = async () => {
        try {
            await mockDB.requestWithdraw(user.id, Number(amount), NetworkType.TRC20);
            setAmount('');
            alert('Withdrawal requested');
            // Reload user/txs
            window.location.reload(); 
        } catch(e:any) {
            alert(e.message);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-3xl border border-indigo-500/30 shadow-2xl mb-8 text-center">
                <h2 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Total Balance</h2>
                <div className="text-5xl font-black text-white mb-6">${user.balance.toFixed(2)}</div>
                <div className="flex gap-4 justify-center">
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" className="w-32 bg-slate-950/50 border border-indigo-500/50 rounded-lg px-3 text-white text-center outline-none" />
                    <button onClick={handleWithdraw} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2 rounded-lg transition">Withdraw</button>
                </div>
            </div>

            <h3 className="font-bold text-white mb-4">Transaction History</h3>
            <div className="space-y-3">
                {txs.map(t => (
                    <div key={t.id} className="bg-slate-800 p-4 rounded-xl flex justify-between items-center border border-slate-700">
                        <div>
                            <div className="font-bold text-white text-sm">{t.type}</div>
                            <div className="text-xs text-slate-500">{new Date(t.timestamp).toLocaleDateString()}</div>
                        </div>
                        <div className={`font-mono font-bold ${t.type === 'EARNING' || t.type === 'DEPOSIT' ? 'text-green-400' : 'text-red-400'}`}>
                            {t.type === 'EARNING' || t.type === 'DEPOSIT' ? '+' : '-'}${t.amount.toFixed(2)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AdvertiserPanel = ({ user }: { user: User }) => {
    // Simple placeholder
    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-white mb-4">Advertiser Dashboard</h1>
            <p className="text-slate-400">Track your sponsored posts and engagement here.</p>
            {/* Logic to list sponsored posts by this user would go here */}
        </div>
    );
};

const Profile = ({ currentUser }: { currentUser: User }) => {
  const { userId } = useParams();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [trigger, setTrigger] = useState(0);
  const [sponsorPost, setSponsorPost] = useState<Post | null>(null);
  const [dmEnabled, setDmEnabled] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const navigate = useNavigate();

  // If no params, default to current user (should redirect really, but handling it here is fine)
  const targetId = userId || currentUser.id;
  const isOwnProfile = targetId === currentUser.id;

  useEffect(() => {
    const loadProfile = async () => {
        // Reset state when switching profiles
        setProfileUser(null);
        setPosts([]);

        if (isOwnProfile) {
            setProfileUser(currentUser);
            // Only owners can see their own follower count (Privacy Feature)
            const count = await mockDB.getMyFollowerCount(currentUser.id);
            setFollowerCount(count);
        } else {
            const u = await mockDB.getUserProfile(targetId);
            setProfileUser(u);
            const following = await mockDB.getFollowStatus(targetId, currentUser.id);
            setIsFollowing(following);
        }
        const p = await mockDB.getUserPosts(targetId);
        setPosts(p);
        
        const s = await mockDB.getSettings();
        setDmEnabled(s.enableDirectMessaging);
    };
    loadProfile();
  }, [targetId, currentUser.id, trigger]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwnProfile) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        try {
            await mockDB.updateUserAvatar(currentUser.id, base64String);
            window.location.reload(); 
        } catch(e:any) {
            alert("Upload failed: " + e.message);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleFollow = async () => {
      try {
          if (isFollowing) {
              await mockDB.unfollowUser(targetId, currentUser.id);
          } else {
              await mockDB.followUser(targetId, currentUser.id);
          }
          setIsFollowing(!isFollowing);
      } catch (e: any) {
          alert("Action failed: " + e.message);
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

  const copyProfileLink = () => {
    const url = `${window.location.origin}/#/profile/${targetId}`;
    navigator.clipboard.writeText(url);
    alert("Profile link copied to clipboard!");
  };

  // If loading profile failed or user doesn't exist
  if (!profileUser) return <div className="p-10 text-center text-slate-500">Loading Profile...</div>;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {sponsorPost && (
        <SponsorModal 
          post={sponsorPost} 
          userBalance={currentUser.balance} 
          onClose={() => setSponsorPost(null)} 
          onConfirm={confirmSponsor} 
        />
      )}

      <div className="bg-slate-800 rounded-3xl p-8 mb-8 border border-slate-700 text-center relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-indigo-900 to-purple-900 opacity-50"></div>
        <div className="relative z-10 mt-12">
           <div className="relative inline-block group">
             <img src={profileUser.avatarUrl} className="w-32 h-32 rounded-full border-4 border-slate-800 bg-slate-700 object-cover shadow-xl" alt="Profile" />
             {isOwnProfile && (
                <label className="absolute bottom-1 right-1 bg-indigo-600 p-2 rounded-full cursor-pointer hover:bg-indigo-500 transition shadow-lg hover:scale-105">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
             )}
           </div>
           
           <div className="flex items-center justify-center gap-2 mt-4">
               <h2 className="text-2xl font-bold text-white">{profileUser.name || profileUser.email.split('@')[0]}</h2>
               <button onClick={copyProfileLink} className="text-slate-500 hover:text-white transition" title="Copy Link"><ShareIcon /></button>
           </div>
           
           {/* Email Privacy Logic */}
           <p className="text-slate-400 text-sm font-medium mt-1">
               {isOwnProfile ? profileUser.email : 'Email Hidden'}
           </p>
           
           <div className="flex justify-center gap-3 mt-4">
               {!isOwnProfile && (
                   <button 
                       onClick={toggleFollow}
                       className={`px-6 py-2 rounded-full text-sm font-bold transition flex items-center gap-2 ${isFollowing ? 'bg-slate-700 text-white hover:bg-red-500/20 hover:text-red-400' : 'bg-white text-indigo-900 hover:bg-indigo-100'}`}
                   >
                       {isFollowing ? (
                           <><UserMinusIcon /> Unfollow</>
                       ) : (
                           <><UserPlusIcon /> Follow</>
                       )}
                   </button>
               )}
               
               {!isOwnProfile && dmEnabled && (
                    <Link to="/messages" className="bg-indigo-600 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-indigo-500 transition inline-flex items-center gap-2">
                        <ChatIcon /> Message
                    </Link>
               )}
               
               {isOwnProfile && (
                   <Link to="/stats" className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-full text-sm font-bold transition flex items-center gap-2">
                       <ChartBarIcon /> Statistics
                   </Link>
               )}
           </div>

           <div className="mt-8 flex justify-center divide-x divide-slate-700">
              <div className="px-8 text-center">
                 <div className="text-2xl font-black text-white">{posts.length}</div>
                 <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mt-1">Posts</div>
              </div>
              {isOwnProfile ? (
                 <>
                    <div className="px-8 text-center">
                        <div className="text-2xl font-black text-white">{followerCount}</div>
                        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mt-1">Followers</div>
                    </div>
                    <div className="px-8 text-center">
                        <div className="text-2xl font-black text-green-400">${profileUser.balance.toFixed(2)}</div>
                        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mt-1">Wallet</div>
                    </div>
                 </>
              ) : (
                  <div className="px-8 text-center">
                      <div className="text-sm font-bold text-slate-400 mt-2">Private Stats</div>
                  </div>
              )}
           </div>
        </div>
      </div>
      
      {/* Timeline ... */}
      <div className="space-y-6">
        {posts.length === 0 ? <p className="text-slate-500 text-center py-10 bg-slate-800/50 rounded-xl border border-slate-800 border-dashed">No posts yet.</p> : (
            posts.map(p => (
            <div key={p.id} className="relative group">
                <PostCard 
                    post={p} 
                    onReact={() => {}} 
                    currentUser={currentUser} 
                    onRefresh={() => setTrigger(t => t+1)} 
                    onSponsor={(post) => setSponsorPost(post)}
                />
            </div>
            ))
        )}
      </div>
    </div>
  );
};

const AdminPanel = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<SystemSettings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>([]);
  const [view, setView] = useState<'USERS' | 'WITHDRAWALS' | 'SETTINGS'>('USERS');
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    mockDB.getSettings().then((s) => {
        setSettings(s);
        setDraftSettings(s);
    });
    mockDB.getAllUsers().then(setUsers);
    mockDB.getPendingWithdrawals().then(setWithdrawals);
  }, [editUser]);

  const handleProcess = async (id: string, approve: boolean) => {
    try {
        await mockDB.processWithdrawal(id, approve);
        setWithdrawals(await mockDB.getPendingWithdrawals());
    } catch(e:any) {
        if (e.message.includes("row-level security")) {
            alert("⚠️ PERMISSION ERROR: You need to update the database policies.\n\nGo to the 'System' tab and click 'View Database Setup SQL'. Run that code in Supabase to fix this.");
        } else {
            alert(e.message);
        }
    }
  };

  const handleSaveUser = async (id: string, data: Partial<User>) => {
      try {
        await mockDB.adminUpdateUser(id, data);
        setEditUser(null);
        setUsers(await mockDB.getAllUsers());
        alert("User updated successfully");
      } catch(e:any) {
          alert("Update Failed: " + e.message);
      }
  };

  const handleSaveSettings = async () => {
      if (!draftSettings) return;
      try {
          await mockDB.updateSettings(draftSettings);
          setSettings(draftSettings);
          alert("Settings saved successfully!");
      } catch (e: any) {
          alert("Error saving settings: " + e.message);
      }
  };

  const handleFileUpload = (field: 'siteLogoUrl' | 'siteBackgroundUrl', e: React.ChangeEvent<HTMLInputElement>) => {
      if (!draftSettings) return;
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setDraftSettings({...draftSettings, [field]: reader.result as string});
          };
          reader.readAsDataURL(file);
      }
  };


  if (!settings || !draftSettings) return null;

  return (
    <div className="max-w-6xl mx-auto py-10 px-6">
      {showSql && <SupabaseSetup onClose={() => setShowSql(false)} />}
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
            {/* User Table (Same as before) */}
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
          {/* Withdrawals List (Same as before) */}
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
             <div className="mb-6 bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex justify-between items-center">
                <div>
                  <h3 className="text-red-400 font-bold text-sm">Database Configuration</h3>
                  <p className="text-xs text-slate-400 mt-1">Run SQL to update tables (e.g. for Messaging).</p>
                </div>
                <button onClick={() => setShowSql(true)} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-2 rounded-lg">View Database Setup SQL</button>
             </div>
             
             <div className="mb-6 bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl flex justify-between items-center">
                <div>
                  <h3 className="text-indigo-400 font-bold text-sm">Direct Messaging System</h3>
                  <p className="text-xs text-slate-400 mt-1">Allow users to chat privately.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{draftSettings.enableDirectMessaging ? 'Enabled' : 'Disabled'}</span>
                    <button 
                        onClick={() => setDraftSettings({...draftSettings, enableDirectMessaging: !draftSettings.enableDirectMessaging})}
                        className={`w-12 h-6 rounded-full p-1 transition-colors ${draftSettings.enableDirectMessaging ? 'bg-indigo-600' : 'bg-slate-600'}`}
                    >
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${draftSettings.enableDirectMessaging ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                </div>
             </div>

             <div className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Website Name</label>
                    <input 
                        type="text" 
                        value={draftSettings.siteName || "TextFlow"}
                        onChange={(e) => setDraftSettings({ ...draftSettings, siteName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none" 
                    />
                </div>

                <div className="h-px bg-slate-700 my-4"></div>
                <h3 className="font-bold text-white">Appearance</h3>
                
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Site Logo (URL or Upload)</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={draftSettings.siteLogoUrl || ''} 
                            onChange={e => setDraftSettings({...draftSettings, siteLogoUrl: e.target.value})} 
                            placeholder="https://..." 
                            className="flex-1 bg-slate-900 border border-slate-600 p-2 rounded-lg text-white text-xs"
                        />
                        <label className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-bold cursor-pointer">
                            Upload
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload('siteLogoUrl', e)} />
                        </label>
                    </div>
                    {draftSettings.siteLogoUrl && <img src={draftSettings.siteLogoUrl} className="h-10 mt-2 rounded bg-white/10 p-1" alt="Logo Preview" />}
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Background Image (URL or Upload)</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={draftSettings.siteBackgroundUrl || ''} 
                            onChange={e => setDraftSettings({...draftSettings, siteBackgroundUrl: e.target.value})} 
                            placeholder="https://..." 
                            className="flex-1 bg-slate-900 border border-slate-600 p-2 rounded-lg text-white text-xs"
                        />
                        <label className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-bold cursor-pointer">
                            Upload
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleFileUpload('siteBackgroundUrl', e)} />
                        </label>
                    </div>
                    {draftSettings.siteBackgroundUrl && <div className="h-20 w-full mt-2 rounded bg-cover bg-center border border-slate-600" style={{backgroundImage: `url(${draftSettings.siteBackgroundUrl})`}}></div>}
                </div>

                <div className="h-px bg-slate-700 my-4"></div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Creator Earning Rate (USD per 100k views)</label>
                    <input type="number" value={draftSettings.adCostPer100kViews} onChange={(e) => setDraftSettings({ ...draftSettings, adCostPer100kViews: parseFloat(e.target.value) })} className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Advertiser Cost (USD per 1k views)</label>
                    <input type="number" value={draftSettings.sponsorAdPricePer1kViews || 1.0} onChange={(e) => setDraftSettings({ ...draftSettings, sponsorAdPricePer1kViews: parseFloat(e.target.value) })} className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none" />
                </div>
                <div className="h-px bg-slate-700 my-4"></div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Minimum Withdrawal (USD)</label>
                    <input type="number" value={draftSettings.minWithdraw} onChange={(e) => setDraftSettings({ ...draftSettings, minWithdraw: parseFloat(e.target.value) })} className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Admin Receiving Wallet</label>
                    <input type="text" value={draftSettings.adminWalletAddress} onChange={(e) => setDraftSettings({ ...draftSettings, adminWalletAddress: e.target.value })} className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none font-mono text-sm" />
                </div>
                <div className="h-px bg-slate-700 my-4"></div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">About Page Content</label>
                    <textarea value={draftSettings.aboutContent} onChange={(e) => setDraftSettings({ ...draftSettings, aboutContent: e.target.value })} className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none min-h-[100px]" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-2">Policy Page Content</label>
                    <textarea value={draftSettings.policyContent} onChange={(e) => setDraftSettings({ ...draftSettings, policyContent: e.target.value })} className="w-full bg-slate-900 border border-slate-600 p-3 rounded-xl text-white focus:border-indigo-500 outline-none min-h-[100px]" />
                </div>
                
                <button onClick={handleSaveSettings} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition shadow-lg mt-4">Save System Settings</button>
             </div>
          </div>
      )}
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [siteName, setSiteName] = useState('TextFlow');
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [bgImage, setBgImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    const init = async () => {
        try {
            const s = await mockDB.getSettings();
            setSiteName(s.siteName || 'TextFlow');
            setLogo(s.siteLogoUrl);
            setBgImage(s.siteBackgroundUrl);
            document.title = s.siteName || 'TextFlow';
        } catch (e) {
            console.error("Settings load error", e);
        }

        const isConnected = await mockDB.checkConnection();
        if (!isConnected) {
            setShowSetup(true);
            setInitializing(false);
            return;
        }

        const stored = localStorage.getItem('tf_current_user');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
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

  const bgStyle = bgImage ? {
      backgroundImage: `url(${bgImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      backgroundRepeat: 'no-repeat'
  } : {};

  return (
    <ErrorBoundary>
        <HashRouter>
        {showSetup && <SupabaseSetup onClose={() => window.location.reload()} />}
        {!user ? (
            <Auth onLogin={setUser} onShowSetup={() => setShowSetup(true)} siteName={siteName} />
        ) : (
            <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30" style={bgStyle}>
                <div className={`min-h-screen ${bgImage ? 'bg-slate-900/90' : ''}`}>
                    <Navbar user={user} onLogout={handleLogout} siteName={siteName} logo={logo} />
                    <Routes>
                        <Route path="/" element={<Feed currentUser={user} />} />
                        <Route path="/profile/:userId" element={<Profile currentUser={user} />} />
                        <Route path="/profile" element={<Navigate to={`/profile/${user.id}`} replace />} />
                        <Route path="/wallet" element={<Wallet user={user} />} />
                        <Route path="/advertiser" element={<AdvertiserPanel user={user} />} />
                        <Route path="/stats" element={<UserStats user={user} />} />
                        <Route path="/messages" element={<MessagesPage user={user} />} />
                        <Route path="/notifications" element={<div className="p-4 text-center">Use the Bell Icon in Navbar</div>} />
                        <Route path="/admin" element={user.role === UserRole.ADMIN ? <AdminPanel /> : <Navigate to="/" />} />
                        <Route path="/post/:postId" element={<SinglePost currentUser={user} />} />
                        <Route path="/about" element={<AboutPage />} />
                        <Route path="/policy" element={<PolicyPage />} />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </div>
            </div>
        )}
        </HashRouter>
    </ErrorBoundary>
  );
};

export default App;