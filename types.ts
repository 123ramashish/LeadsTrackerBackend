// types.ts - Central type definitions for the Lead Tracking System

import { ObjectId } from 'mongoose';

// ===== ENUMS =====

export enum USER_ROLES {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
  EMPLOYEE = 'employee'
}

export enum LeadStatus {
  CREATED = 'created',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL_SENT = 'proposal_sent',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
  FOLLOW_UP = 'follow_up'
}

export enum LeadType {
  LEAD = 'lead',
  PROSPECT = 'prospect',
  CLIENT = 'client',
  CUSTOMER = 'customer'
}

export enum LeadSource {
  WEBSITE = 'website',
  REFERRAL = 'referral',
  SOCIAL_MEDIA = 'social_media',
  EMAIL_CAMPAIGN = 'email_campaign',
  COLD_CALL = 'cold_call',
  PAID_ADS = 'paid_ads',
  TRADE_SHOW = 'trade_show',
  OTHER = 'other'
}

export enum LeadPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum ActivityType {
  // Status Changes
  STATUS_CHANGED = 'status_changed',
  TYPE_CHANGED = 'type_changed',
  PRIORITY_CHANGED = 'priority_changed',
  
  // Communication
  EMAIL_SENT = 'email_sent',
  EMAIL_RECEIVED = 'email_received',
  CALL_MADE = 'call_made',
  CALL_RECEIVED = 'call_received',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  
  // Meetings & Events
  MEETING_SCHEDULED = 'meeting_scheduled',
  MEETING_COMPLETED = 'meeting_completed',
  MEETING_CANCELLED = 'meeting_cancelled',
  
  // Lead Management
  LEAD_CREATED = 'lead_created',
  LEAD_UPDATED = 'lead_updated',
  LEAD_ASSIGNED = 'lead_assigned',
  LEAD_CONVERTED = 'lead_converted',
  NOTE_ADDED = 'note_added',
  TASK_CREATED = 'task_created',
  TASK_COMPLETED = 'task_completed',
  
  // Documents
  DOCUMENT_UPLOADED = 'document_uploaded',
  PROPOSAL_SENT = 'proposal_sent',
  CONTRACT_SIGNED = 'contract_signed',
  
  // Other
  FOLLOW_UP_SCHEDULED = 'follow_up_scheduled',
  REMINDER_SET = 'reminder_set',
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed'
}

export enum MessageSender {
  LEAD = 'lead',
  ADMIN = 'admin'
}

// ===== INTERFACES =====

export interface IUser {
  _id: ObjectId;
  name: string;
  email: string;
  role: USER_ROLES;
  companyId: ObjectId;
  avatar?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICompany {
  _id: ObjectId;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILead {
  _id: ObjectId;
  // Basic Information
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  googleMapUrl?: string;
  whatsapp?: string;
  
  // Classification
  status: LeadStatus;
  type: LeadType;
  source: LeadSource;
  priority: LeadPriority;
  isFavorite: boolean;
  
  // Scoring & Value
  score: number;
  estimatedValue?: number;
  actualValue?: number;
  
  // Assignment & Ownership
  assignedTo?: ObjectId;
  company: ObjectId;
  
  // Tracking
  statusUpdatedAt?: Date;
  lastContacted?: Date;
  lastActivityAt?: Date;
  nextFollowUp?: Date;
  convertedAt?: Date;
  lostAt?: Date;
  
  // User Tracking
  createdBy: ObjectId;
  updatedBy?: ObjectId;
  deletedBy?: ObjectId;
  deletedAt?: Date;
  isDeleted: boolean;
  
  // Engagement Metrics
  totalInteractions: number;
  emailsSent: number;
  callsMade: number;
  meetingsHeld: number;
  
  // Additional
  tags: string[];
  customFields?: Map<string, any>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Virtual properties
  isActive: boolean;
  daysSinceCreated: number;
  daysSinceLastContact: number | null;
  
  // Methods
  updateScore(): Promise<number>;
}

export interface IActivity {
  _id: ObjectId;
  leadId: ObjectId;
  companyId: ObjectId;
  
  // Activity Details
  type: ActivityType;
  title: string;
  description?: string;
  
  // User & Assignment
  performedBy: ObjectId;
  assignedTo?: ObjectId;
  
  // Change Tracking
  previousValue?: any;
  newValue?: any;
  
  // Additional Data
  metadata?: {
    duration?: number;
    subject?: string;
    outcome?: string;
    attachments?: string[];
    tags?: string[];
    [key: string]: any;
  };
  
  // Timestamps
  activityDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReadReceipt {
  userId: ObjectId;
  readAt: Date;
}

export interface IChat {
  _id: ObjectId;
  leadId: ObjectId;
  companyId: ObjectId;
  
  // Message Details
  sentBy: string;
  senderType: MessageSender;
  content?: string;
  fileUrls: string[];
  
  // Read Tracking
  readBy: IReadReceipt[];
  
  // Timestamps
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  isReadBy(userId: string): boolean;
}

// ===== REQUEST/RESPONSE TYPES =====

export interface AuthUser {
  id: string;
  role: USER_ROLES;
  companyId: string;
  email?: string;
  name?: string;
}

export interface CreateLeadRequest {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  googleMapUrl?: string;
  whatsapp?: string;
  status?: LeadStatus;
  type?: LeadType;
  source?: LeadSource;
  priority?: LeadPriority;
  isFavorite?: boolean;
  estimatedValue?: number;
  tags?: string[];
  assignedTo?: string;
  nextFollowUp?: string;
  company?: string; // For super admin
}

export interface UpdateLeadRequest {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  googleMapUrl?: string;
  whatsapp?: string;
  estimatedValue?: number;
  tags?: string[];
}

export interface UpdateLeadStatusRequest {
  status: LeadStatus;
  notes?: string;
}

export interface UpdateLeadTypeRequest {
  type: LeadType;
}

export interface UpdateLeadPriorityRequest {
  priority: LeadPriority;
}

export interface AssignLeadRequest {
  assignedTo: string;
}

export interface ToggleFavoriteRequest {
  isFavorite: boolean;
}

export interface ScheduleFollowUpRequest {
  followUpDate: string;
  notes?: string;
}

export interface AddNoteRequest {
  note: string;
}

export interface BulkUpdateStatusRequest {
  leadIds: string[];
  status: LeadStatus;
}

export interface CreateChatRequest {
  leadId: string;
  content?: string;
  fileUrls?: string[];
}

export interface ReceiveLeadMessageRequest {
  leadId?: string;
  leadIdentifier?: string; // email or phone
  content?: string;
  fileUrls?: string[];
}

export interface GetLeadsQuery {
  status?: LeadStatus;
  type?: LeadType;
  source?: LeadSource;
  priority?: LeadPriority;
  isFavorite?: string;
  assignedTo?: string;
  tags?: string | string[];
  minScore?: string;
  maxScore?: string;
  minValue?: string;
  maxValue?: string;
  overdueFollowUp?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: string;
  limit?: string;
}

export interface GetChatHistoryQuery {
  limit?: string;
  page?: string;
}

export interface GetActivityQuery {
  limit?: string;
  page?: string;
  type?: ActivityType;
  performedBy?: string;
}

export interface GetAnalyticsQuery {
  dateFrom?: string;
  dateTo?: string;
  companyId?: string;
}

export interface SearchMessagesQuery {
  query: string;
  leadId?: string;
}

// ===== RESPONSE TYPES =====

export interface PaginationResponse {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface LeadsResponse {
  leads: ILead[];
  pagination: PaginationResponse;
}

export interface LeadDetailResponse {
  lead: ILead;
  timeline?: IActivity[];
}

export interface ChatHistoryResponse {
  lead: {
    id: ObjectId;
    name: string;
    email?: string;
    phone?: string;
    status: LeadStatus;
  };
  messages: IChat[];
  pagination: PaginationResponse;
  unreadCount: number;
}

export interface ActivityTimelineResponse {
  lead: {
    id: ObjectId;
    name: string;
    email?: string;
  };
  activities: IActivity[];
  pagination: PaginationResponse;
}

export interface LeadAnalyticsResponse {
  overview: {
    totalLeads: number;
    avgScore: number;
    totalEstimatedValue: number;
    totalActualValue: number;
    avgInteractions: number;
  };
  statusDistribution: Array<{
    _id: LeadStatus;
    count: number;
    totalValue: number;
  }>;
  typeDistribution: Array<{
    _id: LeadType;
    count: number;
  }>;
  sourceDistribution: Array<{
    _id: LeadSource;
    count: number;
  }>;
  priorityDistribution: Array<{
    _id: LeadPriority;
    count: number;
  }>;
  scoreDistribution: Array<{
    _id: number;
    count: number;
  }>;
  overdueFollowUps: number;
}

export interface ConversionFunnelResponse {
  funnel: Array<{
    stage: LeadStatus;
    count: number;
  }>;
  summary: {
    totalLeads: number;
    wonLeads: number;
    lostLeads: number;
    activeLeads: number;
    conversionRate: string;
    lossRate: string;
  };
}

export interface UnreadCountResponse {
  totalUnread: number;
  unreadByLead: Array<{
    leadId: ObjectId;
    leadName: string;
    leadEmail?: string;
    unreadCount: number;
    lastMessage: Date;
  }>;
}

export interface ChatStatisticsResponse {
  overview: {
    totalMessages: number;
    adminMessages: number;
    leadMessages: number;
    messagesWithFiles: number;
  };
  responseTime: {
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
  } | null;
  unreadMessages: number;
  activeLeads: Array<{
    leadId: ObjectId;
    leadName: string;
    leadEmail?: string;
    messageCount: number;
    lastMessage: Date;
  }>;
}

export interface ActivityStatisticsResponse {
  activityByType: Array<{
    _id: ActivityType;
    count: number;
  }>;
  topPerformers: Array<{
    userId: ObjectId;
    userName: string;
    userEmail: string;
    activityCount: number;
  }>;
  dailyTrend: Array<{
    _id: string;
    count: number;
  }>;
}

// ===== ERROR RESPONSE =====

export interface ErrorResponse {
  message: string;
  error?: string;
}

// ===== SUCCESS RESPONSE =====

export interface SuccessResponse<T = any> {
  message: string;
  data?: T;
}

// ===== UTILITY TYPES =====

export type LeadFilterOptions = {
  status?: LeadStatus[];
  type?: LeadType[];
  source?: LeadSource[];
  priority?: LeadPriority[];
  assignedTo?: string[];
  tags?: string[];
  isFavorite?: boolean;
  scoreRange?: { min: number; max: number };
  valueRange?: { min: number; max: number };
  dateRange?: { from: Date; to: Date };
};

export type SortOptions = {
  field: 'createdAt' | 'updatedAt' | 'name' | 'score' | 'priority' | 'nextFollowUp' | 'lastContacted';
  order: 'asc' | 'desc';
};

export type PaginationOptions = {
  page: number;
  limit: number;
};

// ===== TYPE GUARDS =====

export function isLeadStatus(value: any): value is LeadStatus {
  return Object.values(LeadStatus).includes(value);
}

export function isLeadType(value: any): value is LeadType {
  return Object.values(LeadType).includes(value);
}

export function isLeadSource(value: any): value is LeadSource {
  return Object.values(LeadSource).includes(value);
}

export function isLeadPriority(value: any): value is LeadPriority {
  return Object.values(LeadPriority).includes(value);
}

export function isActivityType(value: any): value is ActivityType {
  return Object.values(ActivityType).includes(value);
}

export function isUserRole(value: any): value is USER_ROLES {
  return Object.values(USER_ROLES).includes(value);
}

// ===== CONSTANTS =====

export const LEAD_SCORE_WEIGHTS = {
  EMAIL: 5,
  PHONE: 5,
  WEBSITE: 5,
  ADDRESS: 5,
  EMAIL_PER_UNIT: 2,
  CALL_PER_UNIT: 3,
  MEETING_PER_UNIT: 5,
  MAX_ENGAGEMENT_SCORE: 30,
  MAX_STATUS_SCORE: 30,
  MAX_RECENCY_SCORE: 20,
  MAX_TOTAL_SCORE: 100
};

export const STATUS_SCORE_MAP: Record<LeadStatus, number> = {
  [LeadStatus.CREATED]: 0,
  [LeadStatus.CONTACTED]: 10,
  [LeadStatus.QUALIFIED]: 15,
  [LeadStatus.PROPOSAL_SENT]: 20,
  [LeadStatus.NEGOTIATION]: 25,
  [LeadStatus.WON]: 30,
  [LeadStatus.LOST]: 0,
  [LeadStatus.FOLLOW_UP]: 10
};

export const PRIORITY_COLORS: Record<LeadPriority, string> = {
  [LeadPriority.LOW]: '#4CAF50',
  [LeadPriority.MEDIUM]: '#FFC107',
  [LeadPriority.HIGH]: '#FF9800',
  [LeadPriority.URGENT]: '#F44336'
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  [LeadStatus.CREATED]: '#9E9E9E',
  [LeadStatus.CONTACTED]: '#2196F3',
  [LeadStatus.QUALIFIED]: '#00BCD4',
  [LeadStatus.PROPOSAL_SENT]: '#9C27B0',
  [LeadStatus.NEGOTIATION]: '#FF9800',
  [LeadStatus.WON]: '#4CAF50',
  [LeadStatus.LOST]: '#F44336',
  [LeadStatus.FOLLOW_UP]: '#FFC107'
};

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  maxLimit: 100
};

export const MAX_FILE_ATTACHMENTS = 10;
export const MAX_MESSAGE_LENGTH = 10000;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS_PER_LEAD = 20;