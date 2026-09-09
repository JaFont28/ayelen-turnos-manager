// Constantes de negocio compartidas entre frontend y backend.
export const MODALITIES = ["presencial", "virtual"] as const;
export const CONSULTATION_TYPES = ["primera_entrevista", "seguimiento"] as const;
export const AGE_GROUPS = ["adulto", "adolescente", "infancia"] as const;

export type Modality = (typeof MODALITIES)[number];
export type ConsultationType = (typeof CONSULTATION_TYPES)[number];
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const MODALITY_LABEL: Record<Modality, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
};
export const CONSULTATION_LABEL: Record<ConsultationType, string> = {
  primera_entrevista: "Primera entrevista",
  seguimiento: "Seguimiento",
};
export const AGE_GROUP_LABEL: Record<AgeGroup, string> = {
  adulto: "Adulto",
  adolescente: "Adolescente",
  infancia: "Infancia",
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  payment_pending: "Pago pendiente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  expired: "Expirado",
  completed: "Completado",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial",
  expired: "Expirado",
};

export const DURATION_MINUTES = 50;
export const CANCELLATION_WINDOW_HOURS = 12;

export function isModality(v: unknown): v is Modality {
  return typeof v === "string" && (MODALITIES as readonly string[]).includes(v);
}
export function isConsultationType(v: unknown): v is ConsultationType {
  return typeof v === "string" && (CONSULTATION_TYPES as readonly string[]).includes(v);
}
export function isAgeGroup(v: unknown): v is AgeGroup {
  return typeof v === "string" && (AGE_GROUPS as readonly string[]).includes(v);
}
