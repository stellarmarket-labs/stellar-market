export interface User {
  id: string;
  walletAddress: string;
  username: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  role: "CLIENT" | "FREELANCER";
}

export interface Milestone {
  id: string;
  jobId: string;
  title: string;
  description: string;
  amount: number;
  status: "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "REJECTED";
  order: number;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  budget: number;
  category: string;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED";
  client: User;
  freelancer?: User;
  milestones: Milestone[];
  createdAt: string;
  _count?: { applications: number };
}

export interface Application {
  id: string;
  jobId: string;
  freelancerId: string;
  coverLetter: string;
  proposedBudget: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  freelancer: User;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  read: boolean;
  createdAt: string;
  sender: User;
}

export interface Review {
  id: string;
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  reviewer: User;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UserProfile extends User {
  reviewsReceived: Review[];
  clientJobs: Job[];
  freelancerJobs: Job[];
  averageRating: number;
  reviewCount: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  otherUser: User;
  job: { id: string; title: string } | null;
  lastMessage: Message;
  unreadCount: number;
}
