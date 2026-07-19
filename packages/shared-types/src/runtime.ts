export type ConversationContextType = "draft" | "tenant";

export interface ConversationContext {
  contextType: ConversationContextType;
  contextId: string;
}

export interface ConversationState extends ConversationContext {
  waId: string;
  currentState: string;
  lastInteraction: string;
  pendingMsgId?: string;
}

export type ChatHistoryStatus = "received" | "sent" | "delivered" | "read" | "failed";

export interface InboundMessage {
  waId: string;
  messageId: string;
  type: "text" | "interactive" | "image" | "video" | "document" | "audio" | "sticker";
  text?: string;
  interactiveReplyId?: string;
  receivedAt: string;
}

export type DashboardNotificationType =
  | "escalation"
  | "delivery_failure"
  | "config_validation_warning";

export type DashboardNotificationStatus = "unread" | "read" | "resolved";

export interface DashboardNotification {
  id: string;
  tenantId: string;
  type: DashboardNotificationType;
  refId: string;
  status: DashboardNotificationStatus;
  createdAt: string;
}
