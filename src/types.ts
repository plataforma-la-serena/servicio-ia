export type Intent = "greeting" | "question" | "reservation" | "off_topic";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ApartmentContext {
  id: string;
  title: string;
  description: string;
  pricePerNight: number;
  capacity: number;
  features: string[];
}

export interface ChatRequest {
  message: string;
  phone: string;
  history: ChatTurn[];
  apartments: ApartmentContext[];
}

export interface ChatResponse {
  reply: string;
  intent: Intent;
  handoff: boolean;
  model: string;
}
