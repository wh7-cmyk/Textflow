import { User, Post, Transaction, UserRole, SystemSettings, NetworkType } from '../types';

// Initial Mock Data
const DEFAULT_SETTINGS: SystemSettings = {
  adCostPer100kViews: 0.1,
  minWithdraw: 50,
  adminWalletAddress: '0xAdminWalletAddress123456789',
};

// LocalStorage Keys
const KEYS = {
  USERS: 'tf_users',
  POSTS: 'tf_posts',
  TXS: 'tf_txs',
  SETTINGS: 'tf_settings',
};

// Helper to simulate delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class MockDB {
  private users: User[] = [];
  private posts: Post[] = [];
  private transactions: Transaction[] = [];
  private settings: SystemSettings = DEFAULT_SETTINGS;

  constructor() {
    this.load();
    if (!this.users.some(u => u.role === UserRole.ADMIN)) {
      this.seedAdmin();
    }
  }

  private load() {
    if (typeof window === 'undefined') return;
    this.users = JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
    this.posts = JSON.parse(localStorage.getItem(KEYS.POSTS) || '[]');
    this.transactions = JSON.parse(localStorage.getItem(KEYS.TXS) || '[]');
    this.settings = JSON.parse(localStorage.getItem(KEYS.SETTINGS) || JSON.stringify(DEFAULT_SETTINGS));
  }

  private save() {
    localStorage.setItem(KEYS.USERS, JSON.stringify(this.users));
    localStorage.setItem(KEYS.POSTS, JSON.stringify(this.posts));
    localStorage.setItem(KEYS.TXS, JSON.stringify(this.transactions));
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(this.settings));
  }

  private seedAdmin() {
    const admin: User = {
      id: 'admin-id',
      email: 'admin@admin.com',
      password: '666666',
      role: UserRole.ADMIN,
      balance: 10000,
      name: 'Super Admin',
      joinedAt: new Date().toISOString(),
    };
    this.users.push(admin);
    this.save();
  }

  // --- Auth ---

  async signIn(email: string, password: string): Promise<User> {
    await delay(600);
    const user = this.users.find(u => u.email === email);
    
    if (!user) throw new Error('User not found');
    
    // Check password
    if (user.password && user.password !== password) {
      throw new Error('Invalid password');
    }
    
    // Fallback for older mock users without password
    if (!user.password) {
       // Allow login, but maybe prompt to set password in real app.
    }

    return user;
  }

  async signUp(email: string, password: string): Promise<User> {
    await delay(600);
    if (this.users.find(u => u.email === email)) throw new Error('Email already taken');
    
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      password,
      role: UserRole.USER,
      balance: 0,
      name: email.split('@')[0],
      joinedAt: new Date().toISOString(),
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
    };
    
    this.users.push(newUser);
    this.save();
    return newUser;
  }

  // --- Users ---

  async updateUserAvatar(userId: string, base64Image: string): Promise<User> {
    await delay(500);
    const idx = this.users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('User not found');

    // "Old picture must remove" - in mock we simply overwrite
    this.users[idx].avatarUrl = base64Image;
    this.save();
    
    // Update posts to reflect new avatar
    this.posts = this.posts.map(p => p.userId === userId ? { ...p, userAvatar: base64Image } : p);
    this.save();

    return this.users[idx];
  }

  async adminUpdateUser(userId: string, data: Partial<User>): Promise<User> {
    const idx = this.users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('User not found');
    
    this.users[idx] = { ...this.users[idx], ...data };
    this.save();
    return this.users[idx];
  }

  async getAllUsers(): Promise<User[]> {
    return this.users;
  }

  // --- Posts ---

  async createPost(userId: string, content: string, type: 'text' | 'link'): Promise<Post> {
    await delay(300);
    const user = this.users.find(u => u.id === userId);
    const newPost: Post = {
      id: Math.random().toString(36).substr(2, 9),
      userId,
      userEmail: user?.email || '',
      userAvatar: user?.avatarUrl,
      content,
      type,
      views: 0,
      sponsored: false,
      likes: 0,
      hearts: 0,
      hahas: 0,
      createdAt: new Date().toISOString(),
    };
    this.posts.unshift(newPost);
    this.save();
    return newPost;
  }

  async getFeed(): Promise<Post[]> {
    // Simulate traffic logic
    const sponsoredPosts = this.posts.filter(p => p.sponsored);
    const regularPosts = this.posts.filter(p => !p.sponsored);

    // Sponsored posts get aggressive view counts
    sponsoredPosts.forEach(p => {
       if (Math.random() > 0.3) {
         p.views += Math.floor(Math.random() * 500) + 100; 
       }
    });

    // Regular posts get slow view counts
    regularPosts.forEach(p => {
      if (Math.random() > 0.8) {
        p.views += Math.floor(Math.random() * 5) + 1;
      }
    });

    this.save();
    return [...this.posts];
  }

  async getUserPosts(userId: string): Promise<Post[]> {
    return this.posts.filter(p => p.userId === userId);
  }

  async reactToPost(postId: string, reaction: 'likes' | 'hearts' | 'hahas'): Promise<void> {
    const post = this.posts.find(p => p.id === postId);
    if (post) {
      post[reaction]++;
      this.save();
    }
  }

  async sponsorPost(postId: string, amount: number): Promise<void> {
    const post = this.posts.find(p => p.id === postId);
    const user = this.users.find(u => u.id === post?.userId);
    
    if (post && user) {
        if (user.balance < amount) throw new Error("Insufficient balance");
        
        user.balance -= amount;
        post.sponsored = true;
        
        // Boost views immediately to simulate the "start" of the campaign
        // Rate: 0.1 USD = 100,000 views.
        // Views = (Amount / 0.1) * 100,000
        const estimatedViews = Math.floor((amount / this.settings.adCostPer100kViews) * 100000);
        post.views += Math.floor(estimatedViews * 0.1); // Add 10% immediately as a "boost" start
        
        this.transactions.push({
            id: Math.random().toString(36).substr(2, 9),
            userId: user.id,
            type: 'AD_SPEND',
            amount: amount,
            status: 'COMPLETED',
            timestamp: new Date().toISOString(),
            postId: postId // Store post ID to track spend per post
        });
        
        this.save();
    }
  }

  // --- Wallet ---

  async deposit(userId: string, amount: number, network: NetworkType): Promise<void> {
    await delay(1500); 
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    user.balance += amount;
    this.transactions.push({
      id: Math.random().toString(36).substr(2, 9),
      userId,
      type: 'DEPOSIT',
      amount,
      network,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      txHash: '0x' + Math.random().toString(36).substr(2, 20)
    });
    this.save();
  }

  async requestWithdraw(userId: string, amount: number, network: NetworkType): Promise<void> {
    await delay(500);
    const user = this.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    if (user.balance < amount) throw new Error('Insufficient balance');
    if (amount < this.settings.minWithdraw) throw new Error(`Minimum withdraw is ${this.settings.minWithdraw} USD`);

    user.balance -= amount;
    
    this.transactions.push({
      id: Math.random().toString(36).substr(2, 9),
      userId,
      type: 'WITHDRAW',
      amount,
      network,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    });
    this.save();
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return this.transactions.filter(t => t.userId === userId);
  }

  // --- Admin ---

  async getSettings(): Promise<SystemSettings> {
    return this.settings;
  }

  async updateSettings(newSettings: Partial<SystemSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    this.save();
  }

  async getPendingWithdrawals(): Promise<Transaction[]> {
    return this.transactions.filter(t => t.type === 'WITHDRAW' && t.status === 'PENDING');
  }

  async processWithdrawal(txId: string, approved: boolean): Promise<void> {
    const tx = this.transactions.find(t => t.id === txId);
    if (!tx) return;

    tx.status = approved ? 'COMPLETED' : 'REJECTED';
    
    if (!approved) {
      const user = this.users.find(u => u.id === tx.userId);
      if (user) {
        user.balance += tx.amount;
      }
    }
    this.save();
  }
}

export const mockDB = new MockDB();