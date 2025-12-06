
import { User, Post, Transaction, UserRole, SystemSettings, NetworkType, Comment, Notification, Message, Conversation } from '../types';
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
    enableDirectMessaging: true,
    referralMessage: "Invite friends! If they sign up via your link, you'll automatically follow each other.",
  };

  constructor() {
    this.loadSettings();
  }

  private async loadSettings() {
    try {
        const { data, error } = await supabase.from('settings').select('*').single();
        if (data && !error) {
            // Map snake_case DB columns to camelCase TS interface
            this.settings = {
                siteName: data.site_name || "TextFlow",
                adCostPer100kViews: Number(data.ad_cost_per_100k_views) || 0.1,
                sponsorAdPricePer1kViews: Number(data.sponsor_ad_price_per_1k_views) || 1.0,
                minWithdraw: Number(data.min_withdraw) || 50,
                adminWalletAddress: data.admin_wallet_address || '0x...',
                aboutContent: data.about_content || '',
                policyContent: data.policy_content || '',
                enableDirectMessaging: data.enable_direct_messaging ?? true,
                siteLogoUrl: data.site_logo_url,
                siteBackgroundUrl: data.site_background_url,
                referralMessage: data.referral_message || "Invite friends! If they sign up via your link, you'll automatically follow each other.",
            };
        } else if (error) {
            // Handle specific errors gracefully
            if (error.code === 'PGRST116') {
                 // Row not found, keep defaults
            } else if (error.code === '42P01' || error.message.includes('does not exist') || error.message.includes('schema cache')) {
                 // Table missing, likely first run. Keep defaults and suppress noisy error.
                 console.warn("Settings table not found in DB. Using default settings.");
            } else {
                 console.error("Failed to load settings from DB:", error.message);
            }
        }
    } catch (e) {
        console.error("Settings load exception", e);
    }
  }

  // --- Auth ---

  async resetPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('No user data returned');

    return this.getUserProfile(data.user.id, data.user.email || email);
  }

  async signUp(email: string, password: string, referrerId?: string): Promise<User> {
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
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
      email_public: true
    }]);

    // Handle Referral (Mutual Follow)
    if (referrerId && referrerId !== data.user.id) {
        try {
            // Call the RPC function to safely insert mutual follows (bypassing strict RLS for the referrer side)
            await supabase.rpc('register_referral', { 
                new_user_id: data.user.id, 
                referrer_id: referrerId 
            });
            
            // Notify the referrer
            await this.createNotification(
                referrerId,
                data.user.id,
                'SYSTEM',
                'joined via your referral link! You now follow each other.',
                `/profile/${data.user.id}`
            );
        } catch (e) {
            console.error("Referral logic failed", e);
        }
    }

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
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
            emailPublic: true
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
      balance: Number(data.balance) || 0,
      name: data.name,
      joinedAt: data.created_at,
      avatarUrl: data.avatar_url,
      emailPublic: data.email_public ?? true // Default to true if column missing
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
  
  async updateEmailVisibility(userId: string, isPublic: boolean): Promise<void> {
      const { error } = await supabase
        .from('profiles')
        .update({ email_public: isPublic })
        .eq('id', userId);
        
      if (error) throw new Error(error.message);
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
            if (error) console.warn("Auth Email Update Warning (Login credential might not change): " + error.message);
        }
        updates.email = data.email;
    }

    if (data.name) updates.name = data.name;
    // Ensure balance is a number
    if (data.balance !== undefined) updates.balance = Number(data.balance);
    
    // Update Profile Table
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);
      
    if (error) throw new Error("Database Update Failed: " + error.message);
    return this.getUserProfile(userId);
  }

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return [];
    
    return data.map((d: any) => ({
      id: d.id,
      email: d.email,
      role: d.role as UserRole,
      balance: Number(d.balance) || 0,
      name: d.name,
      joinedAt: d.created_at,
      avatarUrl: d.avatar_url,
      emailPublic: d.email_public ?? true
    }));
  }

  // --- Follows ---
  async followUser(targetId: string, currentUserId: string): Promise<void> {
    const { error } = await supabase.from('follows').insert([{ follower_id: currentUserId, following_id: targetId }]);
    if (error) throw new Error(error.message);

    // Notification
    await this.createNotification(targetId, currentUserId, 'FOLLOW', 'started following you', `/profile/${currentUserId}`);
  }

  async unfollowUser(targetId: string, currentUserId: string): Promise<void> {
    const { error } = await supabase.from('follows').delete().match({ follower_id: currentUserId, following_id: targetId });
    if (error) throw new Error(error.message);
  }

  async getFollowStatus(targetId: string, currentUserId: string): Promise<boolean> {
    const { count } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .match({ follower_id: currentUserId, following_id: targetId });
    return (count || 0) > 0;
  }

  async getMyFollowerCount(userId: string): Promise<number> {
    // Only works for own profile due to RLS
    const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);
    
    if (error) return 0;
    return count || 0;
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

  async updatePost(postId: string, content: string): Promise<void> {
    const { error } = await supabase
      .from('posts')
      .update({ content })
      .eq('id', postId);

    if (error) throw new Error(error.message);
  }

  async deletePost(postId: string): Promise<void> {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw new Error(error.message);
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

  async reactToPost(postId: string, reaction: 'likes' | 'hearts' | 'hahas', currentUserId: string): Promise<void> {
    // 1. Use RPC to increment counter securely (bypassing RLS for update)
    const { error } = await supabase.rpc('react_to_post', { 
        post_id: postId, 
        reaction_type: reaction 
    });
    
    if (error) {
        console.error("Reaction RPC Error:", error);
        // Fallback: If RPC missing (old DB setup), try direct update (will fail for non-owners but works for admins/owners)
        const { data } = await supabase.from('posts').select(reaction).eq('id', postId).single();
        if (data) {
             const { error: directError } = await supabase.from('posts').update({ [reaction]: (data as any)[reaction] + 1 }).eq('id', postId);
             if (directError) throw new Error("Could not react: " + directError.message);
        } else {
            throw new Error(error.message);
        }
    }

    // 2. Notification Logic (fetch post owner first)
    const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single();
    
    if (post && post.user_id !== currentUserId) {
        let actionText = 'reacted to your post';
        if (reaction === 'likes') actionText = 'liked your post 👍';
        if (reaction === 'hearts') actionText = 'loved your post ❤️';
        if (reaction === 'hahas') actionText = 'laughed at your post 😂';

        await this.createNotification(
            post.user_id, 
            currentUserId, 
            'LIKE', 
            actionText, 
            `/post/${postId}`
        );
    }
  }

  async incrementPostView(postId: string): Promise<void> {
    // Call the RPC function to increment views securely.
    // This allows any user to increment the count without RLS blocking them from updating the whole row.
    const { error } = await supabase.rpc('increment_views', { post_id: postId });
    
    if (error) {
        console.warn("Organic view increment failed:", error.message);
        // Fallback for Admins or Owners (who have update permission) if RPC fails/doesn't exist
        const { data } = await supabase.from('posts').select('views').eq('id', postId).single();
        if (data) {
            await supabase.from('posts').update({ views: data.views + 1 }).eq('id', postId);
        }
    }
  }

  async sponsorPost(postId: string, amount: number): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not logged in");

    // Ensure we have latest settings for price calculation
    await this.loadSettings();

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

  // --- Comments ---

  async getPostComments(postId: string): Promise<Comment[]> {
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles(email, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
        // Handle common schema errors gracefully
        if (error.code === '42P01' || error.message.includes('schema cache')) {
            throw new Error("Table 'comments' does not exist. Please run the SQL setup script.");
        }
        return [];
    }

    return data.map((c: any) => ({
      id: c.id,
      postId: c.post_id,
      userId: c.user_id,
      userEmail: c.profiles?.email || 'Unknown',
      userAvatar: c.profiles?.avatar_url,
      content: c.content,
      createdAt: c.created_at
    }));
  }

  async addComment(postId: string, userId: string, content: string): Promise<Comment> {
    const { data, error } = await supabase
      .from('comments')
      .insert([{
        post_id: postId,
        user_id: userId,
        content: content
      }])
      .select('*, profiles(email, avatar_url)')
      .single();

    if (error) {
        if (error.code === '42P01' || error.message.includes('schema cache')) {
            throw new Error("Missing 'comments' table. Please run the Database Setup SQL in Admin Panel.");
        }
        throw new Error(error.message);
    }

    // Trigger Notification
    const post = await this.getPost(postId);
    if (post && post.userId !== userId) {
        await this.createNotification(
            post.userId, 
            userId, 
            'COMMENT', 
            `commented on your post`, 
            `/post/${postId}`
        );
    }

    return {
      id: data.id,
      postId: data.post_id,
      userId: data.user_id,
      userEmail: data.profiles?.email || 'Unknown',
      userAvatar: data.profiles?.avatar_url,
      content: data.content,
      createdAt: data.created_at
    };
  }

  async deleteComment(commentId: string): Promise<void> {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) throw new Error(error.message);
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
    const currentBalance = Number(profile.balance);
    
    if (isNaN(currentBalance)) throw new Error('Balance error: Invalid number');
    if (currentBalance < amount) throw new Error(`Insufficient balance: You have $${currentBalance.toFixed(2)}, but tried to withdraw $${amount}`);

    const newBalance = currentBalance - amount;
    
    // First, deduct balance
    const { error: profileError } = await supabase.from('profiles').update({ balance: newBalance }).eq('id', userId);
    if (profileError) throw new Error("Failed to update balance: " + profileError.message);

    // Then record transaction
    const { error } = await supabase.from('transactions').insert([{
      user_id: userId,
      type: 'WITHDRAW',
      amount,
      network,
      status: 'PENDING'
    }]);

    if (error) {
        // Rollback balance if tx failed (simple compensation)
        await supabase.from('profiles').update({ balance: currentBalance }).eq('id', userId);
        throw new Error(error.message);
    }
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

  // --- Notifications ---
  
  async createNotification(recipientId: string, actorId: string, type: string, message: string, link: string): Promise<void> {
    try {
        await supabase.from('notifications').insert([{
            user_id: recipientId,
            actor_id: actorId,
            type,
            message,
            link,
            is_read: false
        }]);
    } catch (e) {
        console.error("Notification failed", e);
    }
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
        .from('notifications')
        .select('*, profiles!notifications_actor_id_fkey(name, avatar_url, email)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
    
    if (error) {
        // Silent fail if table doesn't exist yet
        return [];
    }

    return data.map((n: any) => ({
        id: n.id,
        recipientId: n.user_id,
        actorId: n.actor_id,
        actorName: n.profiles?.name || n.profiles?.email.split('@')[0] || 'System',
        actorAvatar: n.profiles?.avatar_url,
        type: n.type,
        message: n.message,
        link: n.link,
        isRead: n.is_read,
        createdAt: n.created_at
    }));
  }

  async markNotificationRead(id: string): Promise<void> {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
  }

  // --- Messaging ---

  async getConversations(userId: string): Promise<Conversation[]> {
    // Supabase simplified conversation fetch
    // We fetch all messages involving the user, then group by the other party
    const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!sender_id(id, name, email, avatar_url), receiver:profiles!receiver_id(id, name, email, avatar_url)')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });

    if (error || !data) return [];

    const convMap = new Map<string, Conversation>();

    for (const msg of data) {
        const isSender = msg.sender_id === userId;
        const otherId = isSender ? msg.receiver_id : msg.sender_id;
        const otherProfile = isSender ? msg.receiver : msg.sender;
        
        if (!convMap.has(otherId)) {
            convMap.set(otherId, {
                otherUser: {
                    id: otherId,
                    name: otherProfile?.name || otherProfile?.email.split('@')[0] || 'Unknown',
                    avatarUrl: otherProfile?.avatar_url
                },
                lastMessage: msg.content,
                unreadCount: 0,
                lastActive: msg.created_at
            });
        }
        
        // Count unread if I am receiver and msg is not read
        if (!isSender && !msg.is_read) {
            const c = convMap.get(otherId)!;
            c.unreadCount += 1;
        }
    }

    return Array.from(convMap.values());
  }

  async getMessages(userId: string, otherId: string): Promise<Message[]> {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: true });
    
    if (error) return [];

    // Mark received messages as read
    const unreadIds = data.filter((m: any) => m.receiver_id === userId && !m.is_read).map((m: any) => m.id);
    if (unreadIds.length > 0) {
        await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
    }

    return data.map((m: any) => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: m.receiver_id,
        content: m.content,
        isRead: m.is_read,
        createdAt: m.created_at
    }));
  }

  async sendMessage(senderId: string, receiverId: string, content: string): Promise<void> {
    const { error } = await supabase.from('messages').insert([{
        sender_id: senderId,
        receiver_id: receiverId,
        content
    }]);
    if (error) throw new Error(error.message);
  }

  // --- Admin Settings ---

  async getSettings(): Promise<SystemSettings> {
    await this.loadSettings(); // Ensure fresh
    return this.settings;
  }

  async updateSettings(newSettings: Partial<SystemSettings>): Promise<void> {
    // 1. Map camelCase to snake_case for DB
    const dbPayload: any = {};
    if (newSettings.siteName !== undefined) dbPayload.site_name = newSettings.siteName;
    if (newSettings.adCostPer100kViews !== undefined) dbPayload.ad_cost_per_100k_views = newSettings.adCostPer100kViews;
    if (newSettings.sponsorAdPricePer1kViews !== undefined) dbPayload.sponsor_ad_price_per_1k_views = newSettings.sponsorAdPricePer1kViews;
    if (newSettings.minWithdraw !== undefined) dbPayload.min_withdraw = newSettings.minWithdraw;
    if (newSettings.adminWalletAddress !== undefined) dbPayload.admin_wallet_address = newSettings.adminWalletAddress;
    if (newSettings.aboutContent !== undefined) dbPayload.about_content = newSettings.aboutContent;
    if (newSettings.policyContent !== undefined) dbPayload.policy_content = newSettings.policyContent;
    if (newSettings.enableDirectMessaging !== undefined) dbPayload.enable_direct_messaging = newSettings.enableDirectMessaging;
    if (newSettings.siteLogoUrl !== undefined) dbPayload.site_logo_url = newSettings.siteLogoUrl;
    if (newSettings.siteBackgroundUrl !== undefined) dbPayload.site_background_url = newSettings.siteBackgroundUrl;
    if (newSettings.referralMessage !== undefined) dbPayload.referral_message = newSettings.referralMessage;

    // 2. Update DB
    const { error } = await supabase.from('settings').update(dbPayload).eq('id', 1);

    // 3. Update local cache
    if (!error) {
        this.settings = { ...this.settings, ...newSettings };
    } else {
        // Fallback: If row 1 doesn't exist, try insert
        if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
             await supabase.from('settings').insert([{ id: 1, ...dbPayload }]);
             this.settings = { ...this.settings, ...newSettings };
        } else if (error.code === '42P01' || error.message.includes('does not exist')) {
             throw new Error("Settings table does not exist. Please go to System tab and run the Database Setup SQL.");
        } else {
            throw new Error(error.message);
        }
    }
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
         const { error: profileError } = await supabase.from('profiles').update({ balance: Number(profile.balance) + tx.amount }).eq('id', tx.user_id);
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
