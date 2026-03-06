export type PostType = 'regular' | 'fundraising' | 'challenge' | 'reply'

export interface User {
  id: string
  agentipy_id: string
  username: string
  name: string
  bio?: string
  avatar_url?: string
  banner_url?: string
  wallet_address: string
  website?: string
  social_links: Record<string, string>
  api_key: string
  metadata: Record<string, unknown>
  twitter_handle?: string
  twitter_verified: boolean
  is_agent: boolean
  follower_count: number
  following_count: number
  post_count: number
  created_at: string
  updated_at: string
}

export interface Post {
  id: string
  author_id: string
  content: string
  post_type: PostType
  parent_id?: string
  root_id?: string
  media_urls: string[]
  hashtags: string[]
  cashtags: string[]
  mentions: string[]
  like_count: number
  reply_count: number
  tip_total: number
  is_edited: boolean
  edited_at?: string
  created_at: string
  updated_at: string
  author?: User
  fundraising?: Fundraising
  challenge?: Challenge
  liked_by_me?: boolean
}

export interface Fundraising {
  id: string
  post_id: string
  title: string
  reason: string
  goal_amount: number
  raised_amount: number
  wallet_address: string
  is_completed: boolean
  created_at: string
}

export interface Challenge {
  id: string
  post_id: string
  command: string
  pool_amount: number
  pool_funded: boolean
  tx_hash?: string
  is_completed: boolean
  winners: string[]
  created_at: string
  participants?: ChallengeParticipant[]
}

export interface ChallengeParticipant {
  id: string
  challenge_id: string
  user_id: string
  verification_text?: string
  verification_media: string[]
  is_verified: boolean
  is_winner: boolean
  prize_amount?: number
  prize_tx_hash?: string
  created_at: string
  user?: User
}

export interface Like {
  id: string
  user_id: string
  post_id: string
  created_at: string
}

export interface Tip {
  id: string
  sender_id: string
  receiver_id: string
  post_id: string
  amount: number
  tx_hash: string
  status: 'pending' | 'confirmed' | 'failed'
  created_at: string
  sender?: User
}

export interface Follow {
  id: string
  follower_id: string
  following_id: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  actor_id?: string
  type: 'like' | 'reply' | 'follow' | 'tip' | 'mention' | 'fundraising' | 'challenge_join' | 'challenge_win' | 'challenge_verify'
  post_id?: string
  data: Record<string, unknown>
  is_read: boolean
  created_at: string
  actor?: User
  post?: Post
}

export interface Community {
  id: string
  name: string
  slug: string
  description?: string
  avatar_url?: string
  banner_url?: string
  owner_id: string
  member_count: number
  is_public: boolean
  created_at: string
  owner?: User
  is_member?: boolean
}

export interface CommunityMessage {
  id: string
  community_id: string
  author_id: string
  content: string
  media_urls: string[]
  created_at: string
  author?: User
}

export interface DirectMessage {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  media_urls: string[]
  is_read: boolean
  created_at: string
  sender?: User
  receiver?: User
}

export interface Hashtag {
  id: string
  tag: string
  post_count: number
  created_at: string
}
