
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum NetworkType {
  ERC20 = 'ERC20',
  TRC20 = 'TRC20',
  BEP20 = 'BEP20',
}

export interface User {
  id: string;
  email: string;
  password?: string; // Exposed for Admin editing in this mock demo
  role: UserRole;
  avatarUrl?: string;
  balance: number; // in USDT
  name: string;
  joinedAt: string;
  emailPublic: boolean; // Controls visibility of email on profile
}

export interface Post {
  id: string;
  userId: string;
  userEmail: string; // denormalized for ease
  userAvatar?: string;
  content: string; // Text or Link
  type: 'text' | 'link';
  views: number;
  sponsored: boolean;
  likes: number;
  hearts: number;
  hahas: number;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userEmail: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'DEPOSIT' | 'WITHDRAW' | 'AD_SPEND' | 'EARNING';
  amount: number;
  network?: NetworkType;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  timestamp: string;
  txHash?: string;
  postId?: string; // Optional: Link transaction to a specific post for ad spend tracking
}

export interface SystemSettings {
  siteName: string; // Customizable Website Name
  siteLogoUrl?: string; // New: Logo URL
  siteBackgroundUrl?: string; // New: Background Image URL
  adCostPer100kViews: number; // Creator Pay Per View Rate (0.1 USD default per 100k views)
  sponsorAdPricePer1kViews: number; // Advertiser Cost (1 USD default per 1k views)
  minWithdraw: number; // 50 USD default
  adminWalletAddress: string;
  aboutContent?: string;
  policyContent?: string;
  enableDirectMessaging: boolean; // Admin toggle for DMs
}

export interface Notification {
  id: string;
  recipientId: string;
  actorId?: string; // User who triggered it
  actorName?: string;
  actorAvatar?: string;
  type: 'LIKE' | 'COMMENT' | 'SYSTEM' | 'FOLLOW';
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  otherUser: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  lastMessage: string;
  unreadCount: number;
  lastActive: string;
}
