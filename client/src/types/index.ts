export type MessageType = 'text' | 'audio' | 'get_status' | 'status' | 'agent_response' | 'status_summary' | 'agent_log';

export interface BaseMessage {
  type: MessageType;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
}

export interface GetStatusMessage extends BaseMessage {
  type: 'get_status';
}

export interface StatusMessage extends BaseMessage {
  type: 'status';
  content: string;
}

export interface AgentResponseMessage extends BaseMessage {
  type: 'agent_response';
  content: string;
  full_result?: any;
}

export interface StatusSummaryMessage extends BaseMessage {
  type: 'status_summary';
  content: any;
}

export interface AgentLogMessage extends BaseMessage {
  type: 'agent_log';
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  content: string;
}

export interface AudioMessage extends BaseMessage {
  type: 'audio';
  content: string;
}

export type ClientToServerMessage = TextMessage | GetStatusMessage | AudioMessage;
export type ServerToClientMessage = StatusMessage | AgentResponseMessage | StatusSummaryMessage | AgentLogMessage | AudioMessage;

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: number;
}
