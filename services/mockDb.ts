
import { User, Post, Transaction, UserRole, SystemSettings, NetworkType } from '../types';
import { supabase } from './supabaseClient';

// We implement the same interface as the old MockDB for compatibility
class DBService {
  private settings: SystemSettings = {
    siteName: "TextFlow",
    adCostPer100kViews: 0.1, // Creator earns $0.1 per 100k views
    sponsorAdPricePer1kViews: 1.0, // Advertiser pays $1.0 per 1k views
    minWithdraw: 50,
    adminWalletAddress: '0xAdminWalletAddress123456789',
    aboutContent: "## About Us\n\nWe are the premier platform for text-based creators to monetize their thoughts.\n\n### Our Mission\nTo empower writers through crypto micropayments and provide a censorship-resistant platform for sharing ideas.",
    policyContent: "## Privacy Policy\n\n1. **Data Collection**: We collect email and basic profile info to facilitate account management and payments.\n2. **Payments**: All payments are processed via USDT (TRC20/ERC20/BEP20) on the blockchain.\n3. **Content**: We do not allow illegal content. Community guidelines apply to all posts.",
  };

  constructor() {
    this.loadSettings();
  }

  private async loadSettings() {
    // In a real app, settings would be in a DB table. For now we use local default or localStorage
    const saved = localStorage.getItem('tf_settings');
    if (saved) {
        // Merge saved settings with defaults to ensure new keys exist
        this.settings = { ...this.settings, ...JSON.parse(saved) };
    }
  }

  // --- Auth ---

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('No user data returned');

    return this.getUserProfile(data.user.id, data.user.email || email);
  }

  async signUp(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Signup failed');

    // The SQL Trigger (handle_new_user) should handle profile creation automatically now.
    // However, we wait a moment to ensure propagation or handle fallback if trigger missing.
    await new Promise(r => setTimeout(r, 1000));

    // Fallback: Manually create profile if trigger didn't run
    const { error: profileError } = await supabase.from('profiles').insert([{
      id: data.user.id,
      email: email,
      role: email === 'admin@adminn.com' ? 'ADMIN' : 'USER',
      balance: email === 'admin@adminn.com' ? 10000 : 0, 
      name: email.split('@')[0],
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`
    }]);

    // Ignore duplicate key error if trigger already created it
    if (profileError && !profileError.message.includes('duplicate key')) {
      console.log("Profile check:", profileError.message);
    }

    return this.getUserProfile(data.user.id, email);
  }

  // --- Users ---

  async getUserProfile(userId: string, emailFallback?: string): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
        // If profile doesn't exist yet (race condition), return partial
        return {
            id: userId,
            email: emailFallback || '',
            role: (emailFallback === 'admin@adminn.com') ? UserRole.ADMIN : UserRole.USER,
            balance: (emailFallback === 'admin@adminn.com') ? 10000 : 0,
            name: emailFallback?.split('@')[0] || 'User',
            joinedAt: new Date().toISOString(),
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`
        };
    }

    // Auto-fix Admin Role if DB is out of sync
    if (data.email === 'admin@adminn.com' && data.role !== 'ADMIN') {
        await supabase.from('profiles').update({ role: 'ADMIN', balance: 10000 }).eq('id', userId);
        data.role = 'ADMIN';
        data.balance = 10000;
    }

    return {
      id: data.id,
      email: data.email,
      role: data.role as UserRole,
      balance: data.balance || 0,
      name: data.name,
      joinedAt: data.created_at,
      avatarUrl: data.avatar_url
    };
  }

  async updateUserAvatar(userId: string, base64Image: string): Promise<User> {
    // Supabase Storage would be better, but for now storing Base64 string in text column
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: base64Image })
      .eq('id', userId);

    if (error) throw new Error(error.message);
    return this.getUserProfile(userId);
  }

  async adminUpdateUser(userId: string, data: Partial<User>): Promise<User> {
    const updates: any = {};
    
    // Check if we are updating the currently logged in user (The Admin themself)
    // Supabase Client can only update the authenticated user's email
    if (data.email) {
        const { data: session } = await supabase.auth.getUser();
        // If editing self, try to update Auth email
        if (session.user && session.user.id === userId && session.user.email !== data.email) {
            const { error } = await supabase.auth.updateUser({ email: data.email });
            if (error) throw new Error("Auth Email Update Failed: " + error.message);
        }
        updates.email = data.email;
    }

    if (data.name) updates.name = data.name;
    if (data.balance !== undefined) updates.balance = data.balance;
    
    // Update Profile Table
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);
      
    if (error) throw new Error(error.message);
    return this.getUserProfile(userId);
  }

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return [];
    
    return data.map((d: any) => ({
      id: d.id,
      email: d.email,
      role: d.role as UserRole,
      balance: d.balance,
      name: d.name,
      joinedAt: d.created_at,
      avatarUrl: d.avatar_url
    }));
  }

  // --- Posts ---

  async createPost(userId: string, content: string, type: 'text' | 'link'): Promise<Post> {
    const { data, error } = await supabase.from('posts').insert([{
      user_id: userId,
      content,
      type,
      views: 0,
      sponsored: false,
      likes: 0,
      hearts: 0,
      hahas: 0
    }]).select().single();

    if (error) throw new Error(error.message);
    
    // We need user details to return a full Post object
    const user = await this.getUserProfile(userId);
    return {
      id: data.id,
      userId: data.user_id,
      userEmail: user.email,
      userAvatar: user.avatarUrl,
      content: data.content,
      type: data.type,
      views: data.views,
      sponsored: data.sponsored,
      likes: data.likes,
      hearts: data.hearts,
      hahas: data.hahas,
      createdAt: data.created_at
    };
  }

  async getFeed(): Promise<Post[]> {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(email, avatar_url)')
      .order('created_at', { ascending: false });

    if (error) {
        console.error("Get feed error", error);
        return [];
    }

    return data.map((p: any) => ({
      id: p.id,
      userId: p.user_id,
      userEmail: p.profiles?.email || 'Unknown',
      userAvatar: p.profiles?.avatar_url,
      content: p.content,
      type: p.type,
      views: p.views,
      sponsored: p.sponsored,
      likes: p.likes,
      hearts: p.hearts,
      hahas: p.hahas,
      createdAt: p.created_at
    }));
  }

  async getPost(postId: string): Promise<Post | null> {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(email, avatar_url)')
      .eq('id', postId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      userEmail: data.profiles?.email || 'Unknown',
      userAvatar: data.profiles?.avatar_url,
      content: data.content,
      type: data.type,
      views: data.views,
      sponsored: data.sponsored,
      likes: data.likes,
      hearts: data.hearts,
      hahas: data.hahas,
      createdAt: data.created_at
    };
  }

  async getUserPosts(userId: string): Promise<Post[]> {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(email, avatar_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return [];

    return data.map((p: any) => ({
      id: p.id,
      userId: p.user_id,
      userEmail: p.profiles?.email || 'Unknown',
      userAvatar: p.profiles?.avatar_url,
      content: p.content,
      type: p.type,
      views: p.views,
      sponsored: p.sponsored,
      likes: p.likes,
      hearts: p.hearts,
      hahas: p.hahas,
      createdAt: p.created_at
    }));
  }

  async reactToPost(postId: string, reaction: 'likes' | 'hearts' | 'hahas'): Promise<void> {
    const { data } = await supabase.from('posts').select(reaction).eq('id', postId).single();
    if (data) {
      const newVal = (data as any)[reaction] + 1;
      await supabase.from('posts').update({ [reaction]: newVal }).eq('id', postId);
    }
  }

  async sponsorPost(postId: string, amount: number): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    const profile = await this.getUserProfile(user.id);
    if (profile.balance < amount) throw new Error("Insufficient balance");

    const { error: txError } = await supabase.from('transactions').insert([{
      user_id: user.id,
      type: 'AD_SPEND',
      amount: amount,
      status: 'COMPLETED',
      post_id: postId
    }]);
    if (txError) throw new Error(txError.message);

    await supabase.from('profiles').update({ balance: profile.balance - amount }).eq('id', user.id);

    // Calculate views based on the Sponsor Ad Price setting
    // Formula: (Amount / CostPer1k) * 1000
    const estimatedViews = Math.floor((amount / this.settings.sponsorAdPricePer1kViews) * 1000);
    const boost = estimatedViews;
    
    const { data: postData } = await supabase.from('posts').select('views').eq('id', postId).single();
    const currentViews = postData?.views || 0;

    await supabase.from('posts').update({ 
        sponsored: true,
        views: currentViews + boost 
    }).eq('id', postId);
  }

  // --- Wallet ---

  async deposit(userId: string, amount: number, network: NetworkType): Promise<void> {
    const { error } = await supabase.from('transactions').insert([{
      user_id: userId,
      type: 'DEPOSIT',
      amount,
      network,
      status: 'COMPLETED',
      tx_hash: '0x' + Math.random().toString(36).substr(2, 20)
    }]);

    if (error) throw new Error(error.message);

    const profile = await this.getUserProfile(userId);
    await supabase.from('profiles').update({ balance: profile.balance + amount }).eq('id', userId);
  }

  async requestWithdraw(userId: string, amount: number, network: NetworkType): Promise<void> {
    const profile = await this.getUserProfile(userId);
    if (profile.balance < amount) throw new Error('Insufficient balance');

    await supabase.from('profiles').update({ balance: profile.balance - amount }).eq('id', userId);

    const { error } = await supabase.from('transactions').insert([{
      user_id: userId,
      type: 'WITHDRAW',
      amount,
      network,
      status: 'PENDING'
    }]);

    if (error) throw new Error(error.message);
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return [];

    return data.map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      type: t.type,
      amount: t.amount,
      network: t.network,
      status: t.status,
      timestamp: t.created_at,
      txHash: t.tx_hash,
      postId: t.post_id
    }));
  }

  // --- Admin ---

  async getSettings(): Promise<SystemSettings> {
    return this.settings;
  }

  async updateSettings(newSettings: Partial<SystemSettings>): Promise<void> {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem('tf_settings', JSON.stringify(this.settings));
  }

  async getPendingWithdrawals(): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('type', 'WITHDRAW')
      .eq('status', 'PENDING');

    if (error) return [];
    
    return data.map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      type: t.type,
      amount: t.amount,
      network: t.network,
      status: t.status,
      timestamp: t.created_at,
      txHash: t.tx_hash
    }));
  }

  async processWithdrawal(txId: string, approved: boolean): Promise<void> {
    console.log(`Processing withdrawal ${txId}: ${approved ? 'Approve' : 'Reject'}`);
    const status = approved ? 'COMPLETED' : 'REJECTED';
    
    // 1. Update Transaction Status
    const { error } = await supabase
      .from('transactions')
      .update({ status })
      .eq('id', txId);

    if (error) {
        console.error("Tx Update Error:", error);
        throw new Error("Update Transaction Failed: " + error.message);
    }

    // 2. If rejected, refund user
    if (!approved) {
      const { data: tx } = await supabase.from('transactions').select('user_id, amount').eq('id', txId).single();
      if (tx) {
         const profile = await this.getUserProfile(tx.user_id);
         const { error: profileError } = await supabase.from('profiles').update({ balance: profile.balance + tx.amount }).eq('id', tx.user_id);
         if (profileError) {
             console.error("Refund Error:", profileError);
             throw new Error("Refund Failed: " + profileError.message);
         }
      }
    }
  }

  async checkConnection(): Promise<boolean> {
      try {
          const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
          if (error && error.code === '42P01') return false; // Undefined table
          return true;
      } catch (e) {
          return false;
      }
  }
}

export const mockDB = new DBService();
